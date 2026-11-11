// The battle's rules that keep its step cheap and its fights fair (core/battle.js; docs/GAME.md
// *The battle*): those set on no one looking round only four times a second, each in a step of
// its own, a player noticed at once all the same; every character of one shape; ways after
// someone found in a step of one's own; a shot that gives up; stuns wearing thin on a boss; a
// follower defending itself with its leader down; and whom the cap on a player's foes holds back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { decode, encode } from "../client/js/core/wire.js";

const open = (width, height = width) => ({ blocked: Array.from({ length: height }, () => new Uint8Array(width)) });

/** A battle played on for `ms`, a step at a time: every event, and after each step `each(battle)`. */
function run(battle, ms, each = () => {}) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
        each(battle);
    }

    return events;
}

const beast = (battle, id, square, more = {}) => battle.add({ id, kind: "beast", team: "beasts", weapon: "claws", square, ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: null, leader: null }, ...more });

describe("every character of one shape (battle.js OPTIONAL)", () => {
    const shapes = (battle) => [...new Set(battle.actors.map((actor) => Object.keys(actor).join()))];

    // A battle of every sort of character add makes: one with charms, a follower with its way of
    // fighting, one that picks its own fights and looks further, a line of battle, a beast
    const mixed = () => {
        const battle = new Battle(open(60), { seed: 3 });

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30], wards: { fire: 0.2 }, shield: { chance: 0.3, share: 0.5, spells: false } });
        battle.add({ id: "ranger", kind: "follower", team: "a", weapon: "bow", square: [21, 31], ai: "follow", leader: "hero", tactic: "flank", keep: 4, rises: 1, casts: ["burn"] });
        battle.add({ id: "raider", kind: "soldier", team: "b", weapon: "cleaver", square: [20, 24], ai: "patrol", patrol: [[20, 24]], leash: 30, lone: true, sight: 20 });
        battle.formation("line", { anchor: [30, 24], facing: 0 });

        for (let k = 0; k < 6; k++) {
            battle.add({ id: `line-${k}`, kind: "soldier", team: "b", weapon: "sword", square: [28 + k, 24], ai: "patrol", patrol: [[28 + k, 24]], leash: 12, formation: { id: "line", slot: [k - 2.5, 0], role: "front" } });
        }

        beast(battle, "wolf", [24, 36], { wards: { water: 0.5 } });

        return battle;
    };

    it("makes every character with the same properties in the same order, whatever each is given", () => {
        const battle = mixed();

        assert.equal(shapes(battle).length, 1);
        run(battle, 8000);
        assert.equal(shapes(battle).length, 1, "after a fight");
    });

    it("takes a creature's wards away without taking the property off it (Polymorph)", () => {
        const battle = mixed();
        const before = shapes(battle);

        battle.reshape("wolf", { name: "Sheep", weapon: "claws", hp: 10, speed: 1, wards: null, wild: { creature: "sheep" } });
        assert.equal(battle.actor("wolf").wards, undefined);
        assert.deepEqual(shapes(battle), before);
        battle.reshape("wolf", { name: "Wolf", weapon: "claws", hp: 30, speed: 1.2, wards: { water: 0.5 }, wild: { creature: "wolf" } });
        assert.deepEqual(battle.actor("wolf").wards, { water: 0.5 });
        assert.deepEqual(shapes(battle), before);
    });

    it("keeps nothing more in a snapshot's text for it, and carries on from one in the same shape", () => {
        const battle = mixed();

        run(battle, 3000);

        const text = encode(battle.snapshot());
        const kept = decode(text);
        const of = (id) => kept.actors.find((actor) => actor.id === id);

        // (What a character wasn't given isn't in the text: as when it wasn't on the character)
        assert.ok(!("wards" in of("raider")) && !("tactic" in of("raider")) && !("keep" in of("hero")) && !("lone" in of("hero")) && !("sight" in of("hero")) && !("oil" in of("hero")));
        assert.deepEqual(of("hero").wards, { fire: 0.2 });
        assert.equal(of("raider").lone, true);
        assert.equal(of("raider").sight, 20);
        assert.equal(of("ranger").tactic, "flank");

        // (Carried on from the text: the one shape still, and the same as one made afresh; and
        // the same battle from there on)
        const again = Battle.restore(battle.world, kept);

        assert.deepEqual(shapes(again), shapes(battle));
        assert.equal(encode(again.snapshot()), text);
        assert.deepEqual(run(again, 5000), run(battle, 5000));
        assert.equal(encode(again.snapshot()), encode(battle.snapshot()));

        // (And a forecast's battle of some of them)
        assert.deepEqual(shapes(battle.fork(["hero", "ranger"])), shapes(battle));
    });
});
