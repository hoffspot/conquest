// A view's frames (core/view.js; the scaling plan's 3-13): the quantisers, what's kept of each
// character as it's quantised, and a frame there and back
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { TAU } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { motionOf } from "../client/js/core/motion.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { cmOf, decodeFrame, encodeFrame, FIELD, GOING, healthOf, NONE, originFor, speedOf, turnOf, VIEW, VIEW_VERSION, ViewState } from "../client/js/core/view.js";
import { BINARY } from "../server/play.js";

// The same rolls every time
function roller(seed) {
    let state = seed;

    return () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32;
}

let made = 0;

// Someone standing somewhere, with what quantising them reads
const someone = (x, y, more = {}) => ({ id: `a${made++}`, x, y, facing: 0, progress: null, dead: false, running: false, pace: 1.4, attack: null, target: null, order: null, hp: 20, maxHp: 20, ...more });

// A battle of them, as far as it's asked: who an id is
const battleOf = (actors) => ({ actors, actor: (id) => actors.find((actor) => actor.id === id) ?? null });

// One player's side of it: who they know of (index -> { slot, sent }), and what they've been
// told (index -> the fields as last sent), kept as a game would keep them
class Known {
    constructor(state) {
        this.state = state;
        this.known = [];
        this.mirror = new Map();
        this.bytes = 0;
        this.frames = 0;
    }

    know(battle, actors, step) {
        this.known = actors.map((actor, index) => ({ actor, index, slot: this.state.touch(battle, actor, step), sent: this.known[index]?.actor === actor ? this.known[index].sent : -1 }));
    }

    // A frame for this step, sent and read: returns the frame (null: nothing sent)
    frame(battle, step, origin, options = {}) {
        for (const one of this.known) {
            one.slot = this.state.touch(battle, one.actor, step);
        }

        const indexOf = (actor) => this.known.find((one) => one.actor === actor)?.index ?? NONE;
        const { bytes, told } = encodeFrame(this.state, { step, origin, known: this.known, indexOf, ...options });

        if (!bytes) {
            assert.deepEqual(told, []);

            return null;
        }

        const frame = decodeFrame(bytes);

        assert.ok(frame, "what's encoded reads back");
        assert.equal(frame.step, step);
        assert.deepEqual(frame.origin, origin);
        assert.deepEqual(frame.records.map(({ index }) => index), told);
        this.bytes += bytes.length;
        this.frames++;

        for (const index of told) {
            this.known[index].sent = step;
        }

        for (const { index, ...fields } of frame.records) {
            this.mirror.set(index, { ...this.mirror.get(index), ...fields });
        }

        return Object.assign(frame, { length: bytes.length });
    }

    // What the state holds of those known, as a game told all of it would hold it
    whole() {
        return new Map(this.known.map(({ index, slot }) => {
            const aimed = this.state.target[slot];

            return [index, { x: this.state.x[slot], y: this.state.y[slot], heading: this.state.heading[slot], going: this.state.going[slot], speed: this.state.speed[slot], health: this.state.health[slot], target: aimed ? (this.known.find((one) => one.actor === aimed)?.index ?? NONE) : NONE }];
        }));
    }
}

describe("a view's frames (core/view.js)", () => {
    it("quantises a place to the centimetre, a facing to a 256th of a turn, a speed to 5 cm/s and health to a 255th, none of it 0 with any left", () => {
        const roll = roller(5);

        for (let k = 0; k < 2000; k++) {
            const metres = (roll() - 0.5) * 16000;

            assert.ok(Math.abs(cmOf(metres) / 100 - metres) <= 0.005 + 1e-9);

            const facing = (roll() - 0.5) * 4 * TAU;
            const turn = turnOf(facing);
            const off = ((((turn / 256) * TAU - facing) % TAU) + TAU) % TAU;

            assert.ok(turn >= 0 && turn <= 255 && Number.isInteger(turn));
            assert.ok(Math.min(off, TAU - off) <= TAU / 512 + 1e-9, `${facing} as ${turn}`);

            const speed = roll() * 12;

            assert.ok(Math.abs(speedOf(speed) / 20 - speed) <= 0.025 + 1e-9);

            const most = 1 + Math.floor(roll() * 5000);
            const hp = roll() * most;
            const health = healthOf(hp, most);

            assert.ok(health >= 1 && health <= 254, `${hp} of ${most}: neither none nor whole`);
            assert.ok(Math.abs(health / 255 - hp / most) <= 1 / 255 + 1e-9);
        }

        assert.equal(healthOf(0, 20), 0);
        assert.equal(healthOf(-3, 20), 0);
        assert.equal(healthOf(20, 20), 255);
        assert.equal(healthOf(25, 20), 255);
        assert.equal(healthOf(0.001, 20), 1, "a hair left isn't none");
        assert.equal(healthOf(19.999, 20), 254, "a hair off isn't whole");
        assert.equal(healthOf(5, 0), 0);
        assert.equal(speedOf(100), 255);
        assert.equal(speedOf(-1), 0);
        assert.equal(turnOf(0), 0);
        assert.equal(turnOf(TAU), 0);
        assert.equal(turnOf(TAU / 2), 128);

        // (A frame's origin: everyone within 192 m of the hero is within a uint16 of centimetres of it)
        for (let k = 0; k < 2000; k++) {
            const [x, y] = [(roll() - 0.5) * 20000, (roll() - 0.5) * 20000];
            const [ox, oy] = originFor(x, y);

            for (const [dx, dy] of [[-192, -192], [192, 192], [0, 0]]) {
                const [fx, fy] = [cmOf(x + dx) - ox * VIEW.origin * 100, cmOf(y + dy) - oy * VIEW.origin * 100];

                assert.ok(fx >= 0 && fx <= 65535 && fy >= 0 && fy <= 65535, `${x},${y}`);
            }
        }

        assert.ok(VIEW_VERSION >= 1 && VIEW_VERSION <= 255 && VIEW_VERSION !== BINARY.echo, "a frame's first byte is never the echo's");
    });

    it("quantises a character once a step, marks only what's come out different, and gives a slot let go of to another with everything of theirs to tell", () => {
        const [ann, bea, cat] = [someone(10, 10), someone(12, 10), someone(14, 10)];
        const battle = battleOf([ann, bea, cat]);
        const state = new ViewState(2);
        const slot = state.touch(battle, ann, 7);

        assert.equal(state.slotOf(ann), slot);
        assert.equal(state.slotOf(bea), -1);
        assert.deepEqual([state.x[slot], state.y[slot], state.health[slot], state.target[slot]], [1000, 1000, 255, null]);
        assert.deepEqual(Object.values(state.changed).map((changed) => changed[slot]), [7, 7, 7, 7, 7]);

        // (Asked again in the step: not read again, whatever's become of them meanwhile)
        ann.x = 11;
        state.touch(battle, ann, 7);
        assert.equal(state.x[slot], 1000);

        // (The next step: where they are has changed, and nothing else)
        state.touch(battle, ann, 8);
        assert.equal(state.x[slot], 1100);
        assert.deepEqual(Object.values(state.changed).map((changed) => changed[slot]), [8, 7, 7, 7, 7]);

        // (Less than a centimetre, less than a 512th of a turn: nothing's changed)
        ann.x += 0.004;
        ann.facing += TAU / 600;
        state.touch(battle, ann, 9);
        assert.deepEqual(Object.values(state.changed).map((changed) => changed[slot]), [8, 7, 7, 7, 7]);

        // (Walking, hurt, and aiming at someone: each marked; no one given a slot for being aimed at)
        Object.assign(ann, { progress: 0.5, running: true, hp: 10, target: bea.id });
        state.touch(battle, ann, 10);
        assert.deepEqual(Object.values(state.changed).map((changed) => changed[slot]), [8, 7, 10, 10, 10]);
        assert.equal(state.going[slot], GOING.moving | GOING.running | GOING.fighting);
        assert.equal(state.speed[slot], 28);
        assert.equal(state.health[slot], 128);
        assert.equal(state.target[slot], bea);
        assert.equal(state.slotOf(bea), -1);

        // (Dead: no health, not moving, whatever else it says)
        Object.assign(ann, { dead: true, hp: 3 });
        state.touch(battle, ann, 11);
        assert.equal(state.health[slot], 0);
        assert.equal(state.going[slot] & GOING.dead, GOING.dead);
        assert.equal(state.going[slot] & GOING.moving, 0);

        // (More than there was room for: room made, nothing lost)
        const third = state.touch(battle, cat, 11);

        state.touch(battle, bea, 11);
        assert.equal(state.size, 3);
        assert.ok(state.room >= 3);
        assert.equal(state.x[slot], 1100);
        assert.equal(state.x[third], 1400);

        // (Let go of: its slot's another's, with everything of theirs changed as of then)
        state.release(ann);
        assert.equal(state.slotOf(ann), -1);
        assert.equal(state.size, 2);

        const dan = someone(50, 60);
        const again = state.touch(battle, dan, 20);

        assert.equal(again, slot);
        assert.deepEqual([state.x[again], state.y[again], state.health[again], state.going[again], state.target[again]], [5000, 6000, 255, 0, null]);
        assert.deepEqual(Object.values(state.changed).map((changed) => changed[again]), [20, 20, 20, 20, 20]);
    });

    it("tells a player only what's changed since they were last told: a walker in 6 bytes, 7 as it turns; everything of a newcomer; nothing of a town standing still", () => {
        const walker = someone(100, 100, { progress: 0.2 });
        const others = Array.from({ length: 255 }, (_, k) => someone(100 + (k % 16) * 2, 104 + Math.floor(k / 16) * 2));
        const battle = battleOf([walker, ...others]);
        const player = new Known(new ViewState());
        const origin = originFor(100, 100);

        // (All 256 new to the player: everything of each, over as many frames as it takes)
        player.know(battle, [walker, ...others], 0);

        let step = 0;

        while (player.known.some(({ sent }) => sent < 0)) {
            const frame = player.frame(battle, step, origin);

            assert.ok(frame.length <= VIEW.budget);
            assert.ok(frame.records.every((record) => Object.keys(record).length === 8), "everything of a newcomer");
            step++;
        }

        assert.equal(step, Math.ceil(256 / Math.floor((VIEW.budget - VIEW.header) / 11)), "11 bytes each, as many a frame as fit");
        assert.deepEqual(player.mirror, player.whole());

        // (The town stands still: no frame, no bytes)
        const before = player.bytes;

        for (let k = 0; k < 40; k++) {
            assert.equal(player.frame(battle, step++, origin), null);
        }

        assert.equal(player.bytes, before);

        // (One walks on, straight: its place and nothing else, 6 bytes)
        walker.x += 0.07;

        let frame = player.frame(battle, step++, origin);

        assert.deepEqual(frame.records, [{ index: 0, x: 10007, y: 10000 }]);
        assert.equal(frame.length - VIEW.header, 6);

        // (And as it turns: 7)
        walker.y += 0.07;
        walker.facing = TAU / 8;
        frame = player.frame(battle, step++, origin);
        assert.deepEqual(frame.records, [{ index: 0, x: 10007, y: 10007, heading: 32 }]);
        assert.equal(frame.length - VIEW.header, 7);
        assert.ok(frame.length - VIEW.header <= 8, "a walker in 8 bytes or fewer");

        // (Aiming at one the player knows of, and at one they don't)
        const stranger = someone(500, 500);

        battle.actors.push(stranger);
        walker.target = others[4].id;
        frame = player.frame(battle, step++, origin);
        assert.deepEqual(frame.records, [{ index: 0, going: GOING.moving | GOING.fighting, speed: 28, target: 5 }]);
        walker.target = stranger.id;
        frame = player.frame(battle, step++, origin);
        assert.deepEqual(frame.records, [{ index: 0, target: NONE }]);

        // (Too far off for a uint16 of centimetres from the origin: its place in full)
        walker.x = -3000.5;
        frame = player.frame(battle, step++, origin);
        assert.deepEqual(frame.records, [{ index: 0, x: -300050, y: 10007 }]);
        assert.equal(frame.length - VIEW.header, 10);

        // (Those who've left are told of whatever the budget, and with nothing else to say)
        const { bytes, told } = encodeFrame(player.state, { step, origin, leaves: [3, 250], known: player.known, budget: 0 });

        assert.deepEqual(told, []);
        assert.deepEqual(decodeFrame(bytes), { version: VIEW_VERSION, step, origin, leaves: [3, 250], records: [], sections: {} });
        assert.equal(bytes.length, VIEW.header + 2);
    });

    it("keeps 256 all moving within 13 KB a second, each told of again within 4 steps, the longest untold first", () => {
        const roll = roller(11);
        const actors = Array.from({ length: 256 }, () => someone(1000 + (roll() - 0.5) * 300, 2000 + (roll() - 0.5) * 300, { progress: 0.1, facing: roll() * TAU }));
        const battle = battleOf(actors);
        const player = new Known(new ViewState());
        const origin = originFor(1000, 2000);
        const told = new Map();
        let worst = 0;

        player.know(battle, actors, 0);

        const second = 1000 / STEP_MS;

        for (let step = 0; step < 12 * second; step++) {
            // (After the first two seconds, in which everything of everyone's told: counted)
            if (step === 2 * second) {
                player.bytes = 0;
            }

            for (const actor of actors) {
                actor.x += (roll() - 0.5) * 0.3;
                actor.y += (roll() - 0.5) * 0.3;
                actor.facing += (roll() - 0.5) * 0.4;
            }

            const frame = player.frame(battle, step, origin);

            assert.ok(frame.length <= VIEW.budget && frame.length <= VIEW.frame);

            for (const { index } of frame.records) {
                if (step >= 2 * second) {
                    worst = Math.max(worst, step - (told.get(index) ?? step));
                }

                told.set(index, step);
            }
        }

        const rate = player.bytes / 10;

        assert.ok(rate <= 13000, `${rate} bytes a second`);
        assert.ok(rate > 6000, `${rate} bytes a second: all of them are moving`);
        assert.ok(worst <= 4, `the longest anyone waited was ${worst} steps`);
        assert.equal(told.size, 256);

        // (Once they stop, the last of it's told and what the player holds is what there is)
        for (let step = 12 * second; step < 12 * second + 8; step++) {
            player.frame(battle, step, origin);
        }

        assert.deepEqual(player.mirror, player.whole());
        assert.equal(player.frame(battle, 12 * second + 8, origin), null);
    });

    it("reads back whatever's told, under any budget, with those coming, going and changing as they will: a game told every frame holds what the world does", () => {
        const roll = roller(23);
        const pick = (list) => list[Math.floor(roll() * list.length)];

        for (let round = 0; round < 12; round++) {
            const actors = Array.from({ length: 40 + Math.floor(roll() * 200) }, () => someone((roll() - 0.5) * 400, (roll() - 0.5) * 400, { maxHp: 1 + Math.floor(roll() * 300) }));
            const battle = battleOf(actors);
            const player = new Known(new ViewState(8));
            const origin = originFor(0, 0);
            const budget = pick([40, 64, 200, 640, 1500, 9000]);

            player.know(battle, actors, 0);

            for (let step = 0; step < 120; step++) {
                // (For 80 steps, some of them change in some way each step; then they're left be)
                for (let k = 0; step < 80 && k < 12; k++) {
                    const actor = pick(actors);

                    switch (Math.floor(roll() * 7)) {
                        case 0:
                            actor.x += (roll() - 0.5) * 3;
                            actor.y += (roll() - 0.5) * 3;
                            break;
                        case 1:
                            actor.facing = (roll() - 0.5) * 3 * TAU;
                            break;
                        case 2:
                            Object.assign(actor, { progress: roll() < 0.5 ? null : roll(), running: roll() < 0.3, pace: roll() * 9 });
                            break;
                        case 3:
                            actor.hp = roll() < 0.1 ? 0 : roll() * actor.maxHp;
                            actor.dead = actor.hp === 0;
                            break;
                        case 4:
                            actor.target = roll() < 0.3 ? null : pick(actors).id;
                            break;
                        case 5:
                            // (Far off, past what a uint16 holds, either side)
                            actor.x = (roll() - 0.5) * 60000;
                            break;
                        default:
                            actor.attack = roll() < 0.5 ? { at: 1 } : null;
                    }
                }

                const frame = player.frame(battle, step, origin, { budget });

                if (frame) {
                    assert.ok(frame.length <= Math.min(budget, VIEW.frame), `${frame.length} within ${budget}`);
                }
            }

            // (Then till there's no more to tell: a small budget takes many frames, and gets there)
            let step = 120;

            while (player.frame(battle, step, origin, { budget })) {
                assert.ok(++step < 3000, "it runs out of things to tell");
            }

            assert.deepEqual(player.mirror, player.whole(), `round ${round}, ${actors.length} within ${budget}`);
        }
    });

    it("reads nothing from bytes that aren't a whole frame of its version, and never throws on them", () => {
        const actors = Array.from({ length: 30 }, (_, k) => someone(k * 3, k, { progress: 0.3, target: k ? `a${made - 1}` : null }));
        const battle = battleOf(actors);
        const state = new ViewState();
        const known = actors.map((actor, index) => ({ index, slot: state.touch(battle, actor, 3), sent: -1 }));
        const { bytes } = encodeFrame(state, { step: 3, origin: originFor(0, 0), leaves: [9], known });
        const frame = decodeFrame(bytes);

        assert.equal(frame.records.length, 30);
        assert.equal(bytes[0], VIEW_VERSION);

        // (Cut short anywhere; or with more after it)
        for (let length = 0; length < bytes.length; length++) {
            assert.equal(decodeFrame(bytes.subarray(0, length)), null, `${length} bytes of ${bytes.length}`);
        }

        assert.equal(decodeFrame(Uint8Array.from([...bytes, 0])), null);

        // (Another version's; not bytes at all)
        const other = Uint8Array.from(bytes);

        other[0] = VIEW_VERSION + 1;
        assert.equal(decodeFrame(other), null);
        other[0] = BINARY.echo;
        assert.equal(decodeFrame(other), null);
        assert.equal(decodeFrame("frame"), null);
        assert.equal(decodeFrame(null), null);

        // (A view of the same bytes inside a longer buffer reads the same)
        const longer = new Uint8Array(bytes.length + 10);

        longer.set(bytes, 7);
        assert.deepEqual(decodeFrame(longer.subarray(7, 7 + bytes.length)), frame);

        // (Any byte of it changed, a thousand times over: a frame or null, never thrown on)
        const roll = roller(41);

        for (let k = 0; k < 1000; k++) {
            const junk = Uint8Array.from(bytes);

            junk[Math.floor(roll() * junk.length)] = Math.floor(roll() * 256);
            junk[Math.floor(roll() * junk.length)] = Math.floor(roll() * 256);

            const read = decodeFrame(junk);

            assert.ok(read === null || read.version === VIEW_VERSION);
        }

        assert.equal(FIELD.far, 32);
    });

    it("holds a played world's characters as the motion stream packs them: the same places and headings, to the centimetre", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        host.populate();

        const me = host.battle.actor(HOST_PLAYER);
        const state = new ViewState();
        const near = host.battle.actors.filter((actor) => actor.map === me.map && (actor.x - me.x) ** 2 + (actor.y - me.y) ** 2 <= 160 * 160).slice(0, VIEW.most);
        const player = new Known(state);

        host.command(HOST_PLAYER, { type: "move", to: [me.square[0] + 8, me.square[1] + 3], run: true });
        player.know(host.battle, near, 0);

        for (let step = 0; step < 60; step++) {
            host.advance(STEP_MS);
            player.frame(host.battle, step, originFor(me.x, me.y));
        }

        // (Left be a few steps more, so the last of it's told)
        for (let step = 60; step < 70; step++) {
            player.frame(host.battle, step, originFor(me.x, me.y));
        }

        assert.ok(near.length >= 2, `${near.length} near`);
        assert.ok(player.frames > 5);

        near.forEach((actor, index) => {
            const { x, y, heading } = motionOf(actor);
            const told = player.mirror.get(index);

            assert.deepEqual([told.x, told.y, told.heading], [x, y, heading], actor.id);
            assert.equal(told.health, actor.dead ? 0 : healthOf(actor.hp, actor.maxHp));
        });
    });
});
