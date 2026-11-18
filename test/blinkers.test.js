// Blinkers (client/js/core/blinkers.js; generated/multiplayer_scaling_plan.md 3-9): a battle as
// a game told only of what's near its hero would know it. Those far off or on another map aren't
// there to ask after; the battle behind is whole and untouched.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { BLINKERS, blinkered } from "../client/js/core/blinkers.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function hosted() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    for (let t = 0; t < 1000; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    return host;
}

describe("a battle seen through blinkers (core/blinkers.js)", () => {
    it("knows the hero and those within its radius on their map, and no one else: by the list and by id", () => {
        const host = hosted();
        const battle = host.battle;
        const seen = blinkered(battle, () => HOST_PLAYER);
        const me = battle.actor(HOST_PLAYER);
        const near = (actor) => actor === me || (actor.map === me.map && Math.hypot(actor.x - me.x, actor.y - me.y) <= BLINKERS.radius);

        assert.equal(BLINKERS.radius, 192);
        assert.equal(seen.blinkers, 192);
        assert.ok(battle.actors.some((actor) => !near(actor)), "a world with folk far off");
        assert.deepEqual(seen.actors.map(({ id }) => id), battle.actors.filter(near).map(({ id }) => id));
        assert.ok(seen.actors.includes(me));

        for (const actor of battle.actors) {
            assert.equal(seen.actor(actor.id), near(actor) ? actor : null, actor.id);
        }

        assert.equal(seen.actor("no one"), battle.actor("no one"));
    });

    it("follows the hero: those left behind aren't known, on their map or from another, and are again once the hero's back", () => {
        const host = hosted();
        const battle = host.battle;
        const seen = blinkered(battle, () => HOST_PLAYER);
        const me = battle.actor(HOST_PLAYER);
        const others = battle.actors.filter((actor) => actor !== me && actor.map === me.map);
        const by = others.find((actor) => Math.hypot(actor.x - me.x, actor.y - me.y) < 150);
        const [x, y] = [me.x, me.y];

        assert.ok(by, "someone near");
        assert.equal(seen.actor(by.id), by);
        Object.assign(me, { x: x + 1000 });
        assert.equal(seen.actor(by.id), null);
        assert.ok(!seen.actors.includes(by));
        // (Carried off to another map: no one of the old one's known)
        Object.assign(me, { x, y, map: "elsewhere" });
        assert.equal(seen.actor(by.id), null);
        assert.deepEqual(seen.actors, [me]);
        Object.assign(me, { map: by.map });
        assert.equal(seen.actor(by.id), by);
        assert.ok(seen.actors.includes(by));
    });

    it("is the battle's own in all else, and changes nothing in it: its time, its methods, what's set on it", () => {
        const host = hosted();
        const battle = host.battle;
        const seen = blinkered(battle, () => HOST_PLAYER);
        const count = battle.actors.length;

        assert.equal(seen.time, battle.time);
        assert.equal(seen.hostile(battle.actor(HOST_PLAYER), battle.actor(HOST_PLAYER)), false);
        seen.onPath = null;
        assert.equal(battle.onPath, null);
        host.advance(STEP_MS);
        assert.equal(seen.time, battle.time);
        assert.equal(battle.actors.length, count);
    });

    it("hides no one while its hero isn't in the world", () => {
        const host = hosted();
        const seen = blinkered(host.battle, () => "someone not come in");

        assert.equal(seen.actors, host.battle.actors);
    });
});
