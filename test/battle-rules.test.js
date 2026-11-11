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

// Which step of so many is a character's own (battle.js turnOf: by its id)
const turnOf = (id, steps = 5) => [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % steps;

/** A battle played on for `ms`, a step at a time: every event, and after each step `each(battle)`. */
function run(battle, ms, each = () => {}) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
        each(battle);
    }

    return events;
}

const guard = (battle, id, square, more = {}) => battle.add({ id, kind: "soldier", team: "a", weapon: "sword", square, ai: "patrol", patrol: [square], leash: 40, ...more });
const beast = (battle, id, square, more = {}) => battle.add({ id, kind: "beast", team: "beasts", weapon: "claws", square, ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: null, leader: null }, ...more });

describe("those set on no one look round four times a second, each in a step of its own (battle.js RETHINK_MS)", () => {
    // Five at their posts, each with a step of its own of the five, and when each first has a
    // newcomer for its target
    const noticed = (make, newcomer) => {
        const battle = new Battle(open(60), { seed: 5 });
        const ids = ["g0", "g1", "g2", "g3", "g4"];

        ids.forEach((id, k) => make(battle, id, [20 + k * 2, 30]));
        run(battle, 2000);
        assert.ok(ids.every((id) => battle.actor(id).target === null));

        const from = battle.time;
        const at = new Map();

        battle.add({ id: "new", square: [24, 22], ...newcomer });
        run(battle, 1000, () => ids.forEach((id) => battle.actor(id).target === "new" && !at.has(id) && at.set(id, battle.time)));

        return { ids, from, at };
    };

    it("has each guard notice an enemy who's no player within a quarter second, in its own step", () => {
        const { ids, from, at } = noticed(guard, { kind: "soldier", team: "b", weapon: "sword" });

        assert.deepEqual(new Set(ids.map((id) => turnOf(id))).size, 5, "each a step of its own");

        for (const id of ids) {
            assert.ok(at.get(id) - from <= 250, `${id} notices within 250 ms: ${at.get(id) - from}`);
            assert.equal((at.get(id) / STEP_MS) % 5, turnOf(id), `${id} in its own step`);
        }

        // (So not all in the same step, as when everyone looked every step)
        assert.equal(new Set(at.values()).size, 5);
    });

    it("has each of the wild's notice one the same way", () => {
        const { ids, from, at } = noticed(beast, { kind: "soldier", team: "b", weapon: "sword" });

        for (const id of ids) {
            assert.ok(at.get(id) - from <= 250, `${id}: ${at.get(id) - from}`);
            assert.equal((at.get(id) / STEP_MS) % 5, turnOf(id), id);
        }
    });

    it("has them all notice a player in the step they come into sight", () => {
        for (const make of [guard, beast]) {
            const { ids, from, at } = noticed(make, { kind: "player", team: "b", weapon: "sword" });

            assert.deepEqual(
                ids.map((id) => at.get(id) - from),
                ids.map(() => STEP_MS),
            );
        }
    });

    it("has one that sees further than most notice a player that far off in the step they come into sight", () => {
        const battle = new Battle(open(80), { seed: 5 });

        guard(battle, "far", [20, 40], { sight: 30 });
        run(battle, 2000);
        // (Further off than anyone's drawn to a player from, AGGRO.reach, and than most see)
        battle.add({ id: "hero", kind: "player", team: "b", weapon: "sword", square: [44, 40] });
        battle.advance(STEP_MS);
        assert.equal(battle.actor("far").target, "hero");
    });

    it("has one whose foe falls look for the next at once", () => {
        // (Five guards in turn, each with another step of the five for its own: each on the next
        // foe the step after its blow's done with, whoever's step that is)
        const after = ["g0", "g1", "g2", "g3", "g4"].map((id) => {
            const battle = new Battle(open(60), { seed: 5 });

            guard(battle, id, [20, 30], { armed: true, power: { melee: 50 } });
            battle.add({ id: "first", kind: "soldier", team: "b", weapon: "sword", square: [21, 30], hp: 5 });
            battle.add({ id: "second", kind: "soldier", team: "b", weapon: "sword", square: [20, 34], hp: 500 });

            let fell = false;

            for (let t = 0; t < 5000 && !fell; t += STEP_MS) {
                fell = battle.advance(STEP_MS).some((event) => event.type === "death" && event.id === "first");
            }

            assert.ok(fell, "the first falls");
            assert.equal(battle.actor(id).target, null);

            while (battle.actor(id).attack) {
                battle.advance(STEP_MS);
            }

            battle.advance(STEP_MS);
            assert.equal(battle.actor(id).target, "second", `${id} on the next, the step after`);

            return (battle.time / STEP_MS) % 5 === turnOf(id);
        });

        // (Not in its own step, but by chance: it didn't wait for it)
        assert.ok(after.filter((own) => !own).length >= 3, `${after}`);
    });

    it("draws a weapon within a quarter second of an enemy coming into sight, and at once for one that's after it", () => {
        const battle = new Battle(open(60), { seed: 5 });

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30] });
        run(battle, 2000);

        // (One standing in sight, after no one: the hero's weapon drawn in their own step)
        let from = battle.time;

        battle.add({ id: "still", kind: "soldier", team: "b", weapon: "sword", square: [20, 22] });

        const drawn = run(battle, 1000).find(({ type, id, on }) => type === "draw" && id === "hero" && on);

        assert.ok(drawn && drawn.time - from <= 250, `drawn ${drawn?.time - from} ms after`);
        assert.equal((drawn.time / STEP_MS) % 5, turnOf("hero"));

        // (And one that comes for them: drawn the step after it's set on them)
        const other = new Battle(open(60), { seed: 5 });

        other.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30] });
        run(other, 2000 + ((turnOf("hero") + 2) % 5) * STEP_MS);
        from = other.time;
        guard(other, "after", [20, 22], { team: "b" });

        const events = run(other, 1000);

        assert.equal(other.actor("after").target, "hero");
        assert.equal(events.find(({ type, id, on }) => type === "draw" && id === "hero" && on).time - from, 2 * STEP_MS);
    });

    it("asks a camp at peace how its peoples stand a fifth as often as every step did, spread over the steps", () => {
        // (Two peoples at peace camped together, sixty in sight of each other: how often the host
        // is asked how two of them stand is how often anyone looks at another)
        const asked = [];
        let calls = 0;
        const battle = new Battle(open(80), {
            seed: 5,
            relations: () => {
                calls++;

                return false;
            },
        });

        for (let k = 0; k < 60; k++) {
            guard(battle, `c-${k}`, [30 + (k % 10) * 2, 30 + Math.floor(k / 10) * 2], { team: k % 2 ? "a" : "b" });
        }

        run(battle, 2000);
        calls = 0;

        run(battle, 1000, () => {
            asked.push(calls);
            calls = 0;
        });

        const all = asked.reduce((sum, each) => sum + each, 0);

        // (Each looks four times in the second, at the thirty not its own, once to see whether
        // it's in a fight, #arm, and once for whom to fight, #patrol: every step, five times that)
        assert.ok(all > 0 && all <= 60 * 30 * 2 * 4, `${all} asked in a second`);
        // (No step with more than twice its share of them)
        assert.ok(Math.max(...asked) <= (2 * all) / asked.length, `the most in a step ${Math.max(...asked)}, of ${all}`);
    });

    it("has the folk look about them for danger each in its own step of the eight (FLEE.look)", () => {
        const battle = new Battle(open(60), { seed: 5 });
        const ids = Array.from({ length: 8 }, (_, k) => `f${k}`);

        ids.forEach((id, k) => battle.add({ id, kind: "folk", team: "folk", square: [20 + k * 2, 30], ai: "routine", neutral: true, side: "a", routine: { seated: true, act: "toast", every: [60000, 60000] } }));
        run(battle, 2000);

        // (All look at their first step; from then on, each in its own)
        assert.deepEqual(
            ids.map((id) => (battle.actor(id).lookAt / STEP_MS) % 8),
            ids.map((id) => turnOf(id, 8)),
        );
        assert.equal(new Set(ids.map((id) => battle.actor(id).lookAt)).size, 8);
    });

    it("carries on from a snapshot exactly as it would have: nothing of whose step is whose is kept", () => {
        const fight = (restoreAt) => {
            let battle = new Battle(open(60), { seed: 9 });
            const events = [];

            for (let k = 0; k < 12; k++) {
                guard(battle, `a${k}`, [18 + k * 2, 24], { patrol: [[18 + k * 2, 36]] });
                guard(battle, `b${k}`, [18 + k * 2, 44], { team: "b", patrol: [[18 + k * 2, 30]], weapon: k % 3 ? "sword" : "bow" });
            }

            for (let t = 0; t < 20000; t += STEP_MS) {
                if (t === restoreAt) {
                    battle = Battle.restore(battle.world, decode(encode(battle.snapshot())));
                }

                events.push(...battle.advance(STEP_MS));
            }

            return JSON.stringify([events, battle.actors.map(({ id, x, y, hp, target }) => [id, x, y, hp, target])]);
        };

        const whole = fight(null);

        assert.ok(whole.includes('"death"'));
        assert.equal(fight(3150), whole);
        assert.equal(fight(7300), whole);
    });
});

describe("ways after someone found in a step of one's own (battle.js #pursue, REPATH_MS)", () => {
    it("spreads a pack's ways over the steps, where all who set out together found theirs again together", () => {
        const battle = new Battle(open(120, 60), { seed: 5 });
        const ids = Array.from({ length: 40 }, (_, k) => `g${k}`);
        const ways = [];
        let found = 0;

        ids.forEach((id, k) => guard(battle, id, [10 + (k % 20) * 2, 40 + Math.floor(k / 20) * 2], { leash: 200, sight: 60 }));
        battle.add({ id: "runner", kind: "soldier", team: "b", weapon: "sword", square: [12, 20], hp: 9000, speed: 7 });
        run(battle, 1000);

        // (All set on the runner in the same step, as a pack struck is; the runner off along the
        // field, so each has a new way to find after it every REPATH_MS)
        battle.command("runner", { type: "move", to: [110, 20] });
        ids.forEach((id) => Object.assign(battle.actor(id), { target: "runner", lastSeen: battle.time }));
        battle.onPath = (id) => (found += id === "runner" ? 0 : 1);

        run(battle, 4000, () => {
            ways.push(found);
            found = 0;
        });

        // (Each still finds its way about twice a second)
        const all = ways.reduce((sum, each) => sum + each, 0);
        const out = ways.indexOf(40);

        assert.ok(all >= 40 * 6 && all <= 40 * 10, `${all} ways in 4 s`);
        // (All of them in the step they set out; from then on each in its own step of the ten,
        // four of the forty a step, where every tenth step had them all)
        assert.ok(out >= 0 && out < 10, "all set out in one step");
        assert.ok(Math.max(...ways.slice(out + 1)) <= 12, `the most in a step after they set out: ${Math.max(...ways.slice(out + 1))}`);
        assert.ok(ways.slice(out + 10).every((each) => each >= 1 && each <= 6), `${ways.slice(out + 10)}`);
    });
});

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
