// The motion stream (core/motion.js): where the host's characters near its players stand, packed
// 16 bytes each and sent as base64 (core/wire.js); and compared with a copy's
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { compareMotion, MOTION, MOTION_FLAGS, motionOf, packMotion, unpackMotion } from "../client/js/core/motion.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { fromBase64, toBase64 } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

describe("the motion stream (motion.js)", () => {
    let host;

    before(() => {
        host = new Host(buildWorld({ seed: 2 }), { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const me = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "move", to: [me.square[0] + 8, me.square[1] + 3], run: true });

        for (let k = 0; k < 20; k++) {
            host.advance(STEP_MS);
        }
    });

    it("packs those near the players, the nearest first, 16 bytes each, and unpacks them as they were", () => {
        const bytes = packMotion(host);
        const units = unpackMotion(bytes);
        const { actors } = host.battle;
        const me = host.battle.actor(HOST_PLAYER);
        const near = actors.filter((actor) => actor.map === me.map && Math.hypot(actor.x - me.x, actor.y - me.y) <= MOTION.reach);

        assert.equal(bytes.length, units.length * MOTION.size);
        assert.equal(units.length, Math.min(MOTION.most, near.length));
        assert.ok(units.length > 5, `${units.length} near`);
        // (The player first: nearest themself)
        assert.equal(actors[units[0].index], me);

        for (const unit of units) {
            const actor = actors[unit.index];

            assert.ok(Math.hypot(actor.x - me.x, actor.y - me.y) <= MOTION.reach);
            assert.deepEqual(unit, { index: unit.index, ...motionOf(actor) });
            assert.ok(Math.abs(unit.x / 100 - actor.x) <= 0.005 && Math.abs(unit.y / 100 - actor.y) <= 0.005);
        }

        // (Running, it's going at its pace, the way it faces)
        const mine = units[0];

        assert.ok(mine.flags & MOTION_FLAGS.moving && mine.flags & MOTION_FLAGS.running, mine.flags.toString(2));
        assert.ok(Math.abs(Math.hypot(mine.vx, mine.vy) - me.pace * 100) <= 1.5, `${Math.hypot(mine.vx, mine.vy)} cm/s against ${me.pace * 100}`);
        assert.ok(Math.abs(Math.atan2(mine.vx, mine.vy) - me.facing) < 0.01);
        assert.ok(mine.flags >> 4 > 0, "corners left");

        // (Through base64, as it goes over the relay)
        const text = toBase64(bytes);

        assert.match(text, /^[A-Za-z0-9+/]*={0,2}$/);
        assert.deepEqual(fromBase64(text), bytes);
        assert.deepEqual(unpackMotion(fromBase64(text)), units);
    });

    it("takes no more than it's allowed, the nearest; and none out of reach", () => {
        const all = unpackMotion(packMotion(host, { most: 1000 }));
        const few = unpackMotion(packMotion(host, { most: 5 }));

        assert.deepEqual(few, all.slice(0, 5));
        assert.deepEqual(unpackMotion(packMotion(host, { reach: 0 })).map(({ index }) => host.battle.actors[index].id), [HOST_PLAYER]);
    });

    it("finds a copy standing apart from the host's: by more than a centimetre, or missing", () => {
        const units = unpackMotion(packMotion(host));
        const copy = { actors: host.battle.actors.map((actor) => ({ ...actor })) };

        assert.deepEqual(compareMotion(copy, units), []);

        const [, second, third] = units;

        copy.actors[second.index].x += 0.004;
        assert.deepEqual(compareMotion(copy, units), []);

        // (A third of theirs gone from the copy's battle: missing, and all after it)
        copy.actors[second.index].x += 0.02;
        copy.actors.length = third.index;

        const apart = units.filter(({ index }) => index === second.index || index >= third.index).map(({ index }) => index);

        assert.deepEqual(new Set(compareMotion(copy, units)), new Set(apart));
        assert.ok(apart.length >= 2);
    });

    it("carries bytes as base64 both ways, whatever their number", () => {
        for (const length of [0, 1, 2, 3, 4, 5, 16, 1023]) {
            const bytes = Uint8Array.from({ length }, (_, k) => (k * 151 + 7) & 255);
            const text = toBase64(bytes);

            assert.equal(text, Buffer.from(bytes).toString("base64"));
            assert.deepEqual(fromBase64(text), bytes);
            // (As many as asked for: made up with zeros)
            assert.deepEqual(fromBase64(text, length + 2), Uint8Array.from([...bytes, 0, 0]));
        }
    });
});
