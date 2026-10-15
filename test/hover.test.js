// A creature that takes to the air once it's badly hurt (battle.js #hover, creatures.js `hover`:
// the Dreadthorn): when it goes up and comes down, what reaches it up there and what of its own
// reaches down, and its fall if it's killed there. (Its body hanging in the air: game.js,
// beasts/model.js poseOf.)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aloftShare, Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { parseGrid } from "./helpers.js";

const HOVER = CREATURES.dreadthorn.hover;

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// Moved on `ms`, step by step: what happened, each with when (ms)
function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS).map((event) => ({ ...event, at: battle.time })));
    }

    return events;
}

// Moved on until something happens (`test`), as long as `most` ms: it, or null
function until(battle, test, most = 60000) {
    for (let t = 0; t < most; t += STEP_MS) {
        const found = battle.advance(STEP_MS).find(test);

        if (found) {
            return { ...found, at: battle.time };
        }
    }

    return null;
}

// A Dreadthorn, as the host puts one out (`hp`: hardier, to last out a test)
function dreadthorn(battle, square, { hp = CREATURES.dreadthorn.hp } = {}) {
    const { name, weapon, speed, chase } = CREATURES.dreadthorn;

    return battle.add({ id: "dread", kind: "beast", name, weapon, team: WILD, square, ai: "wild", hp, speed, chase, armed: true, armor: 0, wild: { creature: "dreadthorn", tier: 10, temper: "aggressive", guard: 0, roam: 0, leash: 60, pack: "dread", leader: null, menace: true, unique: true, ...traitsOf("dreadthorn") } });
}

// Someone fighting it (`weapon`), hardy enough to last, told to go at it
function fighter(battle, id, weapon, square) {
    const actor = battle.add({ id, kind: "player", weapon, team: "hero", square, hp: 50000, armed: true });

    battle.command(id, { type: "engage", target: "dread" });

    return actor;
}

const aloftOf = (event) => event.type === "aloft" && event.id === "dread";
const blowsOn = (events, by) => events.filter((event) => event.type === "hit" && event.id === "dread" && event.by === by);

describe("a creature that takes to the air once it's badly hurt (battle.js #hover)", () => {
    it("is the Dreadthorn: at two fifths of its hit points or fewer, up there twelve seconds at a time, two going up and two coming down", () => {
        assert.deepEqual(traitsOf("dreadthorn").hover, { below: 0.4, ms: 12000, every: 25000, rise: 2000 });
        assert.equal(traitsOf("dragon").hover, null);
    });

    it("stays on the ground while it's hale; badly hurt and fighting, goes up, stays put going up, comes down, and not again for a while", () => {
        const battle = new Battle(field(40), { seed: 5 });
        const beast = dreadthorn(battle, [20, 20]);
        const me = fighter(battle, "me", "sword", [20, 12]);

        // (Only something to fight: it doesn't fight back)
        me.stunnedUntil = 1e9;

        // (Hale: fighting on the ground)
        assert.equal(until(battle, aloftOf, 8000), null);

        beast.hp = Math.floor(beast.maxHp * HOVER.below);

        const up = until(battle, aloftOf);

        assert.ok(up, "it goes up");
        assert.equal(up.down - up.from, HOVER.rise + HOVER.ms);
        assert.equal(up.landed - up.down, HOVER.rise);
        assert.deepEqual(beast.aloft, { from: up.from, down: up.down, landed: up.landed });

        // (Going up, it stays where it is)
        const [x, y] = [beast.x, beast.y];

        run(battle, HOVER.rise - STEP_MS * 2);
        assert.deepEqual([beast.x, beast.y], [x, y]);

        // (Down again once it's landed, and not up again for `every`)
        const later = run(battle, up.landed - battle.time + STEP_MS);

        assert.equal(beast.aloft, null);
        assert.equal(beast.hoverAt, up.landed + HOVER.every);
        assert.equal(later.filter(aloftOf).length, 0);

        const again = until(battle, aloftOf, HOVER.every + 20000);

        assert.ok(again && again.from >= up.landed + HOVER.every, "up again, once it may be");
        assert.ok(!me.dead);
    });

    it("is out of reach of every blow up close while it's up, waited for under it, and fights only with its breath, done before it comes down; shot at, it's hit", () => {
        const battle = new Battle(field(40), { seed: 7 });
        const beast = dreadthorn(battle, [20, 20], { hp: 5000 });
        const blade = fighter(battle, "blade", "sword", [20, 18]);

        fighter(battle, "archer", "bow", [12, 20]);
        beast.hp = Math.floor(beast.maxHp * HOVER.below);

        const up = until(battle, aloftOf);
        const meanwhile = run(battle, up.landed - battle.time - STEP_MS);

        // (Up there: no blade's blow lands, its wielder waiting as near as they'd strike from,
        // not under it; arrows do)
        assert.equal(blowsOn(meanwhile, "blade").length, 0);
        assert.ok(blowsOn(meanwhile, "archer").length > 0);
        assert.ok(Math.hypot(blade.x - beast.x, blade.y - beast.y) > 0.5);

        // (Its own: only its breath, each done before it starts coming down; none starts coming down)
        const its = meanwhile.filter((event) => event.type === "attack" && event.id === "dread");

        assert.ok(its.length > 0, "it breathes fire from up there");

        for (const attack of its) {
            assert.equal(attack.attack, "breath");
            assert.ok(attack.at + attack.duration <= up.down, "done before it comes down");
        }

        // (Down again: the blade reaches it)
        assert.ok(blowsOn(run(battle, 10000), "blade").length > 0);
    });

    it("falls when it's killed up there", () => {
        const battle = new Battle(field(40), { seed: 11 });
        const beast = dreadthorn(battle, [20, 20]);

        fighter(battle, "archer", "bow", [12, 20]);
        beast.hp = Math.floor(beast.maxHp * HOVER.below);
        until(battle, aloftOf);
        beast.hp = 1;

        const death = until(battle, (event) => event.type === "death" && event.id === "dread", 10000);

        assert.ok(death, "shot dead");
        assert.equal(beast.aloft, null);
    });

    it("is drawn so far up (aloftShare): eased up from the ground, all the way up a while, eased down again", () => {
        const aloft = { from: 1000, down: 15000, landed: 17000 };

        assert.equal(aloftShare(null, 5000), 0);
        assert.equal(aloftShare(aloft, 1000), 0);
        assert.equal(aloftShare(aloft, 2000), 0.5);
        assert.equal(aloftShare(aloft, 3000), 1);
        assert.equal(aloftShare(aloft, 9000), 1);
        assert.equal(aloftShare(aloft, 16000), 0.5);
        assert.equal(aloftShare(aloft, 17000), 0);
    });
});
