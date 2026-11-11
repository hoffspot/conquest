// The battle's rules that keep its step cheap and its fights fair (core/battle.js; docs/GAME.md
// *The battle*): those set on no one looking round only four times a second, each in a step of
// its own, a player noticed at once all the same; every character of one shape; ways after
// someone found in a step of one's own; a shot that gives up; stuns wearing thin on a boss; a
// follower defending itself with its leader down; and whom the cap on a player's foes holds back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGGRO, Battle, STEP_MS, STUNS, TAUNT } from "../client/js/core/battle.js";
import { SPELLS } from "../client/js/core/spells.js";
import { WEAPONS } from "../client/js/core/weapons.js";
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

describe("a shot gives up (battle.js #fly, SHOT_FLIES)", () => {
    // A mage's fireball let go at someone six squares off, who does `then` as it leaves the hand
    const shot = (then) => {
        const battle = new Battle(open(200, 40), { seed: 3 });
        const events = [];
        let flown = 0;

        battle.add({ id: "mage", kind: "soldier", team: "b", weapon: "grimoire", square: [20, 20], ai: "patrol", patrol: [[20, 20]], leash: 10, armed: true });
        battle.add({ id: "mark", kind: "soldier", team: "a", weapon: "sword", square: [26, 20], hp: 9000, speed: 12 });

        for (let t = 0; t < 30000; t += STEP_MS) {
            const now = battle.advance(STEP_MS);

            if (now.some(({ type, projectile }) => type === "projectile" && projectile === 1)) {
                then(battle);
            }

            flown = Math.max(flown, battle.projectiles.find(({ id }) => id === 1)?.flown ?? 0);
            events.push(...now.filter(({ projectile }) => projectile === 1));
        }

        return { events, flown };
    };
    const reach = WEAPONS.grimoire.attacks.find(({ kind }) => kind === "ranged").reach;

    it("lands on one who stands, as ever", () => {
        const { events, flown } = shot(() => {});

        assert.deepEqual(events.map(({ type }) => type), ["projectile", "hit"]);
        assert.ok(flown > 4 && flown < 6);
    });

    it("fizzles, hitting no one, once it's flown half as far again as its attack reaches after one it can't catch", () => {
        // (Off faster than the fireball flies, the moment it's let go)
        const { events, flown } = shot((battle) => battle.command("mark", { type: "move", to: [190, 20] }));

        assert.deepEqual(events.map(({ type }) => type), ["projectile", "fizzle"]);
        assert.equal(events[1].spent, true);
        assert.ok(flown > reach * 1.5 - 1 && flown <= reach * 1.5 + 1, `${flown} m flown, its reach ${reach}`);
        // (Within seconds, not the half minute and third of a kilometre it once followed a rider)
        assert.ok(events[1].time - events[0].time < 5000);
    });

    it("counts one kept before shots gave up as having flown no way yet", () => {
        const battle = new Battle(open(200, 40), { seed: 3 });

        battle.add({ id: "mage", kind: "soldier", team: "b", weapon: "grimoire", square: [20, 20], ai: "patrol", patrol: [[20, 20]], leash: 10, armed: true });
        battle.add({ id: "mark", kind: "soldier", team: "a", weapon: "sword", square: [26, 20], hp: 9000 });

        while (!battle.projectiles.length) {
            battle.advance(STEP_MS);
        }

        const kept = decode(encode(battle.snapshot()));

        delete kept.projectiles[0].flown;

        const again = Battle.restore(battle.world, kept);

        assert.ok(run(again, 2000).some(({ type, projectile }) => type === "hit" && projectile === kept.projectiles[0].id));
    });
});

describe("what lies burning on the ground once its caster's fallen (battle.js #ground)", () => {
    it("is no one's blow: not held against the fallen, nor counted theirs", () => {
        const battle = new Battle(open(60), { seed: 7 });

        battle.add({ id: "caster", kind: "player", team: "a", weapon: "sword", square: [20, 30], hp: 30 });
        // (Rooted where it stands: it can't walk out of the fire)
        guard(battle, "burnt", [26, 30], { team: "b", hp: 9000, speed: 0, chase: 0 });
        assert.equal(battle.cast("caster", "flamefill", "burnt").ok, true);

        // (The fire laid and burning them, its caster's while they stand)
        const first = run(battle, 2500).filter(({ type, ground }) => type === "hit" && ground);

        assert.ok(first.length > 0 && first.every(({ by }) => by === "caster"));

        // (Its caster felled: the fire burns on, no one's)
        guard(battle, "killer", [21, 30], { team: "b", armed: true, power: { melee: 500 } });

        const after = run(battle, 2500);
        const fell = after.find(({ type, id }) => type === "death" && id === "caster");
        const burns = after.filter(({ type, ground, time }) => type === "hit" && ground && time > fell.time);

        assert.ok(fell, "the caster falls");
        assert.ok(burns.length > 0, "the fire burns on");
        assert.ok(burns.every(({ by }) => by === null), "no one's blows");
    });
});

describe("a line's ranks closed over its fallen (battle.js #closeRanks)", () => {
    it("closes them when one falls and another joins in the same second, as many as before", () => {
        const battle = new Battle(open(60), { seed: 7 });
        const member = (id, slot, more = {}) => guard(battle, id, [30 + Math.round(slot[0]), 30 + Math.round(slot[1])], { leash: 2, formation: { id: "line", slot, role: "front" }, ...more });
        const slots = () => battle.actors.filter(({ dead, formation }) => !dead && formation?.id === "line").map(({ formation }) => formation.slot.join());

        battle.formation("line", { anchor: [30, 30], facing: 0 });

        for (let k = 0; k < 6; k++) {
            member(`m${k}`, [k - 2.5, 0], k === 0 ? { hp: 1 } : {});
        }

        run(battle, 1500);

        const closed = slots().sort();

        // (One of them cut down, and one more joining well out of the line, within the second)
        battle.add({ id: "foe", kind: "soldier", team: "b", weapon: "sword", square: [battle.actor("m0").square[0], battle.actor("m0").square[1] - 1], armed: true, hp: 9000, power: { melee: 500 } });

        let fell = false;

        for (let t = 0; t < 3000 && !fell; t += STEP_MS) {
            fell = battle.advance(STEP_MS).some(({ type, id }) => type === "death" && id === "m0");
        }

        assert.ok(fell, "one falls");
        battle.remove("foe");
        member("late", [9, 9]);
        assert.equal(slots().length, 6, "as many as before");
        run(battle, 1100);

        // (The same six places, the newcomer in one of them: not left where it was put, the
        // fallen one's place standing empty)
        assert.deepEqual(slots().sort(), closed);
        assert.notEqual(battle.actor("late").formation.slot.join(), "9,9");
    });
});

describe("stuns wear thin on a boss (battle.js STUNS)", () => {
    // A hero and a foe that only stands; how long each stun cast on it lasts, as told
    const field = (wild = {}) => {
        const battle = new Battle(open(60), { seed: 3 });

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30], hp: 9000 });
        battle.add({ id: "foe", kind: "beast", team: "beasts", weapon: "claws", square: [28, 30], hp: 9000, speed: 0, chase: 0, ai: "wild", wild: { creature: "wolf", tier: 3, temper: "defensive", guard: 0, roam: 0, leash: 40, pack: null, leader: null, ...wild } });

        return battle;
    };
    // (Cast, and played on till it's landed: what it did, and how long the stun it laid lasts)
    const cast = (battle, spell) => {
        // (The last one over first, so each is told at its own length)
        while (battle.time < battle.actor("foe").stunnedUntil) {
            battle.advance(STEP_MS);
        }

        Object.assign(battle.actor("hero"), { spellReadyAt: 0, spellsReadyAt: {} });
        assert.equal(battle.cast("hero", spell, "foe").ok, true);

        const told = run(battle, 1000).find(({ type, id }) => (type === "stunned" || type === "resisted") && id === "foe");

        return told.type === "stunned" ? told.until - told.time : told;
    };

    it("is what resists taunts: a dungeon's boss, a hell level's own, one of a kind, an elite, what stands over more than its square", () => {
        assert.deepEqual(STUNS, { share: TAUNT.resist.share, within: TAUNT.resist.within });

        for (const [wild, boss] of [[{}, false], [{ champion: "boss" }, true], [{ champion: "floor" }, true], [{ unique: true }, true], [{ elite: true }, true], [{ champion: "pack" }, false]]) {
            assert.equal(cast(field(wild), "hold"), boss ? SPELLS.hold.stun / 2 : SPELLS.hold.stun, JSON.stringify(wild));
        }
    });

    it("holds anyone else as long as ever, however often", () => {
        const battle = field();

        assert.deepEqual([cast(battle, "hold"), cast(battle, "hold"), cast(battle, "stun"), cast(battle, "hold")], [6000, 6000, 3000, 6000]);
    });

    it("halves a stun on a boss, and each one within twenty seconds of the last again, till it's shrugged off", () => {
        const battle = field({ champion: "boss", unique: true });
        const lasted = [];

        for (let k = 0; k < 6; k++) {
            lasted.push(cast(battle, "hold"));
            run(battle, 5000);
        }

        // (Half of Hold's six seconds, then half of that each time: 6 s apart, each within 20 s
        // of the last)
        assert.deepEqual(lasted, [3000, 1500, 750, 375, 188, 94]);

        // (The next would last under a step: shrugged off, nothing of it laid on the boss, though
        // it turns on whoever cast it and it still counts as one)
        const foe = battle.actor("foe");
        const before = foe.stunnedUntil;
        const told = cast(battle, "hold");

        assert.equal(told.type, "resisted");
        assert.deepEqual([told.by, told.spell, told.always, told.worn], ["hero", "hold", false, true]);
        assert.equal(foe.stunnedUntil, before);
        assert.equal(foe.target, "hero");
        assert.equal(foe.stunned.count, 7);
    });

    it("lasts its half again once none's been laid on it for twenty seconds", () => {
        const battle = field({ champion: "boss" });

        assert.deepEqual([cast(battle, "hold"), cast(battle, "stun")], [3000, 750]);
        run(battle, STUNS.within);
        assert.equal(cast(battle, "stun"), 1500);
        // (Counted from the last, not the first: one every fifteen seconds keeps wearing thinner)
        run(battle, 15000);
        assert.equal(cast(battle, "hold"), 1500);
        run(battle, 15000);
        assert.equal(cast(battle, "hold"), 750);
    });

    it("counts a stronger stunner's stuns the same way (the Hexes skill), and a shield bash's", () => {
        const battle = field({ champion: "boss" });

        battle.actor("hero").power.stun = 2;
        assert.deepEqual([cast(battle, "hold"), cast(battle, "hold")], [6000, 3000]);

        // (A bash: a blow that stuns as it lands, the third in the run)
        const bash = new Battle(open(60), { seed: 3 });

        bash.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30], hp: 9000, armed: true });
        bash.add({ id: "foe", kind: "beast", team: "beasts", weapon: "claws", square: [21, 30], hp: 9000, speed: 0, chase: 0, ai: "wild", wild: { creature: "wolf", tier: 3, temper: "defensive", guard: 0, roam: 0, leash: 40, pack: null, leader: null, champion: "boss" } });

        const lasted = [];

        for (let k = 0; k < 2; k++) {
            bash.empower("hero", "melee", 1, { stun: 2000 });
            bash.command("hero", { type: "engage", target: "foe", stand: true });

            const told = run(bash, 3000).find(({ type, ability }) => type === "stunned" && ability === "shieldBash");

            lasted.push(told.until - told.time);
        }

        assert.deepEqual(lasted, [1000, 500]);
    });

    it("is kept in a snapshot: carried on from one, the next stun's as short as it would have been", () => {
        const battle = field({ champion: "boss" });

        assert.equal(cast(battle, "hold"), 3000);

        const again = Battle.restore(battle.world, decode(encode(battle.snapshot())));

        assert.deepEqual(again.actor("foe").stunned, battle.actor("foe").stunned);
        assert.equal(cast(again, "hold"), 1500);
    });

    it("says so where the spells are told", () => {
        assert.match(SPELLS.stun.about, /boss/);
        assert.match(SPELLS.hold.about, /boss/);
    });
});

describe("a follower whose leader is down or on another floor defends itself (battle.js #follow)", () => {
    // A hired sword by its leader, who's fallen (`down`) or gone to another floor; and foes
    const company = (down = true) => {
        const world = open(60);
        const battle = new Battle({ maps: { town: world, loft: open(20) }, links: [] }, { seed: 4 });

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30], hp: 50 });
        battle.add({ id: "sword", kind: "follower", team: "a", weapon: "sword", square: [21, 31], ai: "follow", leader: "hero", hp: 9000, rises: 1 });
        run(battle, 500);

        if (down) {
            Object.assign(battle.actor("hero"), { dead: true, respawnAt: Infinity });
        } else {
            battle.place("hero", "loft", [5, 5]);
        }

        return battle;
    };
    const foe = (battle, id, square, more = {}) => battle.add({ id, kind: "soldier", team: "b", weapon: "sword", square, hp: 9000, ...more });

    for (const down of [true, false]) {
        const when = down ? "its leader down" : "its leader on another floor";

        it(`holds where it is, after no one it only sees, ${when}`, () => {
            const battle = company(down);
            const sword = battle.actor("sword");
            const at = [sword.x, sword.y];

            // (An enemy in plain sight that leaves it be: left be; and it walks nowhere)
            foe(battle, "idle", [21, 25]);

            const events = run(battle, 5000);

            assert.equal(sword.target, null);
            assert.deepEqual([sword.x, sword.y], at);
            assert.ok(!events.some(({ type, id }) => type === "attack" && id === "sword"));
        });

        it(`strikes back at whoever's on it, ${when}`, () => {
            const battle = company(down);
            const sword = battle.actor("sword");

            guard(battle, "raider", [21, 24], { team: "b", hp: 9000, armed: true });

            const events = run(battle, 6000);

            assert.equal(battle.actor("raider").target, "sword");
            assert.equal(sword.target, "raider");
            assert.ok(events.some(({ type, id, by }) => type === "hit" && id === "raider" && by === "sword"), "it strikes back");
        });

        it(`strikes back at one that struck it from afar and is after no one, ${when}`, () => {
            const battle = company(down);
            const sword = battle.actor("sword");

            // (A fireball out of nowhere: whoever cast it isn't set on the follower, nor striking
            // at it; struck, it goes for them all the same)
            foe(battle, "mage", [21, 24]);
            assert.equal(battle.cast("mage", "fireball", "sword").ok, true);

            const events = run(battle, 6000);

            assert.equal(sword.target, "mage");
            assert.ok(events.some(({ type, id, by }) => type === "hit" && id === "mage" && by === "sword"), "it strikes back");
        });
    }

    it("goes for whoever struck its leader down beside it, and no one else", () => {
        const world = open(60);
        const battle = new Battle(world, { seed: 4 });

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30], hp: 5 });
        battle.add({ id: "sword", kind: "follower", team: "a", weapon: "sword", square: [21, 31], ai: "follow", leader: "hero", hp: 9000, rises: 1, holdFire: true });
        foe(battle, "bystander", [16, 27]);
        // (Its leader felled by a spell from one who then stands, after no one; the follower
        // holding fire till then, so in no fight of its own)
        foe(battle, "killer", [20, 25]);
        assert.equal(battle.cast("killer", "fireball", "hero", { level: 5 }).ok, true);

        const events = run(battle, 8000);

        assert.ok(events.some(({ type, id }) => type === "death" && id === "hero"), "its leader falls");
        assert.equal(battle.actor("sword").target, "killer");
        assert.ok(events.some(({ type, id, by }) => type === "hit" && id === "killer" && by === "sword"));
        assert.ok(!events.some(({ type, id, by }) => type === "hit" && id === "bystander" && by === "sword"));
    });
});

describe("the cap on who goes for a player holds back only those they haven't struck (battle.js AGGRO)", () => {
    // A player standing, and ten guards at their posts in sight of them, two rows of five
    const crowd = (weapon = "sword") => {
        const battle = new Battle(open(80), { seed: 6 });
        const ids = Array.from({ length: 10 }, (_, k) => `e${k}`);

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [40, 40], hp: 90000 });
        ids.forEach((id, k) => guard(battle, id, [36 + (k % 5) * 2, 31 + Math.floor(k / 5)], { team: "b", weapon, hp: 9000, leash: 30 }));

        return { battle, ids, on: () => ids.filter((id) => battle.actor(id).target === "hero") };
    };

    // (A bomb thrown as soon as the player's free to, between the blows on them and their own)
    const lob = (battle, target, bomb) => {
        for (let t = 0; t < 5000; t += STEP_MS) {
            if (battle.lob("hero", target, { reach: 20, ...bomb }).ok) {
                return true;
            }

            battle.advance(STEP_MS);
        }

        return false;
    };

    it("lets six go for them up close and four from afar, the rest standing by", () => {
        assert.deepEqual([AGGRO.melee, AGGRO.ranged], [6, 4]);

        for (const [weapon, most] of [["sword", AGGRO.melee], ["bow", AGGRO.ranged]]) {
            const { battle, on } = crowd(weapon);

            // (Never more on them than the cap, all the while; and that many are)
            run(battle, 8000, () => assert.ok(on().length <= most, `${on().length} ${weapon}s on them`));
            assert.equal(on().length, most);
        }
    });

    it("lets everyone they strike come for them, however many are on them already", () => {
        const { battle, ids, on } = crowd();

        run(battle, 6000);

        const held = ids.filter((id) => battle.actor(id).target === null);

        assert.equal(held.length, 10 - AGGRO.melee, "four held back, standing by");

        // (A bomb among those held back: each it catches is struck by the player)
        assert.ok(lob(battle, held[0], { kind: "bigBomb", damage: [4, 6] }));

        const struck = new Set(
            run(battle, 4000)
                .filter(({ type, id, by }) => type === "hit" && by === "hero" && held.includes(id))
                .map(({ id }) => id),
        );

        assert.ok(struck.size >= 2, `${struck.size} of those held back struck`);
        assert.ok([...struck].every((id) => battle.actor(id).target === "hero"), "each one struck comes for them");
        assert.equal(on().length, AGGRO.melee + struck.size, "past the cap");

        // (And those of them not struck are held back still)
        assert.ok(held.filter((id) => !struck.has(id)).every((id) => battle.actor(id).target === null));
    });

    it("lets one they strike leave whoever it was on for them, the cap full", () => {
        const { battle, on } = crowd();

        // (The cap full; then one more of theirs, in sight of the player, busy with a soldier of
        // the player's people beside it: no room on the player for it)
        run(battle, 6000);
        battle.add({ id: "decoy", kind: "soldier", team: "a", weapon: "sword", square: [48, 40], hp: 90000, speed: 0, chase: 0 });
        guard(battle, "busy", [48, 38], { team: "b", hp: 9000, leash: 30, armed: true });
        run(battle, 4000);
        assert.equal(on().length, AGGRO.melee, "the cap full");
        assert.equal(battle.actor("busy").target, "decoy");

        // (Struck by the player, harder than the soldier's struck it: its enmity has it turn on
        // them, room or no)
        assert.ok(lob(battle, "busy", { kind: "goblinBomb", damage: [400, 400] }));
        // (The bomb burst, and whoever it threw up again)
        run(battle, 7000);
        assert.equal(battle.actor("busy").target, "hero");
        assert.ok(on().length >= AGGRO.melee, "and the cap was full all the while");
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

        // (The snapshot itself holds what its text does: nothing undefined in it)
        assert.deepEqual(battle.snapshot(), kept);

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
