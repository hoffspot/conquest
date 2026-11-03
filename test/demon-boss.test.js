// The Demon Boss and Ashkhar the Bellbound (core/creatures.js demonBoss and ashkhar, weapons.js
// NATURAL demonBoss and ashkhar, beasts/model.js MODELS): the Breach's master, by the rift at the
// way down (dungeons/themes.js hell), and the Breach demon bound under a moorland shrine and loose
// again, a world's boss in the wilds (core/rare.js RARE_CARDS ashkhar). Their claws raked, swept or
// brought down overhead; their leap on whoever keeps off (DEMON_LEAP), and their fists brought down
// at their feet, warned of on the ground before it and bursting out all round them: hellfire from
// the Breach's demon, setting whoever it catches burning (DEMON_FLARE), frost from Ashkhar, slowing
// them; and Ashkhar's roar as it's worn down, the moor's dead coming to it (`rally`)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, DEMON_FLARE, DEMON_LEAP, traitsOf, WILD } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { MODELS } from "../client/js/beasts/model.js";
import { LOOKS } from "../client/js/beasts/looks.js";
import { REGALIA } from "../client/js/beasts/champions.js";
import { SPOILS } from "../client/js/core/spoils.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// A demon in a battle, as the host puts one out (host.js #rouse), its own moves as `change` has
// them (each by its id: { first, every... }), its rally left out unless it's wanted
function demon(battle, id, kind, square, { hp = 1e5, change = {}, rally = false } = {}) {
    const { weapon, speed, chase, name } = CREATURES[kind];
    const traits = traitsOf(kind);
    const moves = traits.moves.map((move) => ({ ...move, ...(change[move.id] ?? {}) }));

    return battle.add({
        id,
        kind: "beast",
        name,
        weapon,
        team: WILD,
        square,
        ai: "wild",
        hp,
        speed,
        chase,
        armed: true,
        wild: { creature: kind, tier: 9, temper: "aggressive", guard: 0, roam: 0, leash: 60, pack: id, leader: null, menace: true, ...traits, moves, rally: rally ? traits.rally : null },
    });
}

// A battle played on (ms), its players kept alive
function play(battle, ms, players = []) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        for (const one of players) {
            one.hp = one.maxHp;
        }

        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

const hero = (battle, id, square) => battle.add({ id, kind: "player", weapon: "sword", team: "hero", square, hp: 1e5 });

describe("the Demon Boss and Ashkhar the Bellbound (creatures.js, weapons.js, beasts/model.js)", () => {
    it("is the Breach's master, by the rift at the way down, its cultists and magma about it; the Breach Priest one of its mini-bosses now", () => {
        const breach = THEMES.hell.realms.find(({ id }) => id === "breach");

        assert.equal(breach, THEMES.hell.realms[0], "(the hell's first level)");
        assert.deepEqual([breach.warden.creature, breach.warden.title, breach.warden.guard], ["demonBoss", "the Demon of the Breach", ["cultist", "magmaSlime"]]);
        assert.ok(breach.minis.some(({ creature, title }) => creature === "cultist" && title === "the Breach Priest"));
        assert.ok(REGALIA[breach.warden.id] && REGALIA.breachPriest);
        assert.ok(THEMES.hell.minis.some(({ creature }) => creature === "demonBoss"), "(its model fetched at a hell's door)");
        assert.equal(CREATURES.demonBoss.name, "Demon Boss");
    });

    it("is drawn from the DemonBoss, the Breach's demon a tenth bigger than it's made in its own red skin, Ashkhar a fifth bigger in the blue; a horned brute standing in for each till it's read", () => {
        assert.equal(MODELS.ashkhar.asset, MODELS.demonBoss.asset);
        assert.equal(MODELS.demonBoss.asset, "beast-demon-boss");
        assert.deepEqual([MODELS.demonBoss.skins, MODELS.ashkhar.skins], [[""], ["blue"]]);
        assert.ok(Math.abs(MODELS.demonBoss.length / MODELS.demonBoss.made.long - 1.1) < 0.01);
        assert.ok(Math.abs(MODELS.ashkhar.length / MODELS.ashkhar.made.long - 1.2) < 0.01);
        assert.ok(MODELS.ashkhar.pace > MODELS.demonBoss.pace && MODELS.ashkhar.runPace > MODELS.demonBoss.runPace, "(its stride as long again as it's bigger)");
        assert.deepEqual(MODELS.demonBoss.specials, { rake: "Attack 2", sweep: "Attack 1", smash: "Attack 3", leap: "Leap", flare: "Rage", rally: "Rage" });
        assert.equal(MODELS.demonBoss.clips.run, "Run 2", "(a gallop on all fours)");
        assert.equal(LOOKS.demonBoss.body, "humanoid");
        assert.ok(LOOKS.ashkhar.scale[0] > LOOKS.demonBoss.scale[0]);
        assert.ok(SPOILS.demonBoss.items.some(({ id }) => id === "demonHorn") && SPOILS.ashkhar.gold[0] > SPOILS.demonBoss.gold[0]);
    });

    it("rakes, sweeps or brings its fist down, each as its clip has it land, inside its clip's span; leaps on whoever keeps off and brings its fists down at its feet, both warned of first; Ashkhar harder and cold where the Breach's is fire, a world's boss with a roar of its own", () => {
        for (const kind of ["demonBoss", "ashkhar"]) {
            const def = CREATURES[kind];
            const [claws] = NATURAL[def.weapon].attacks;
            const model = MODELS[kind];

            assert.ok(def.steady && def.darkSight, kind);
            assert.deepEqual(claws.either.map(({ id, animation }) => [id, animation]), [["rake", "rake"], ["sweep", "sweep"], ["smash", "smash"]]);

            // (Each blow played through its span at its own speed, its blow landing where it does in
            // the clip: the rake at 1.05 seconds, the sweep at 1.15, the fist at 1.35)
            for (const blow of claws.either) {
                const [from, to] = model.spans[blow.id];

                assert.equal(Math.round((to - from) * 1000), blow.duration, `${kind} ${blow.id}`);
                assert.ok(blow.hitAt > from * 1000 && blow.hitAt < to * 1000);
            }

            assert.deepEqual(def.moves.map(({ animation, telegraph }) => [animation, telegraph]), [["leap", true], ["flare", true]]);
        }

        assert.ok(!CREATURES.demonBoss.worldBoss && CREATURES.ashkhar.worldBoss);
        assert.equal(CREATURES.demonBoss.wards.fire, 0.5);
        assert.equal(CREATURES.ashkhar.wards.water, 0.5);
        assert.deepEqual(CREATURES.demonBoss.moves, [DEMON_LEAP, DEMON_FLARE]);
        assert.deepEqual(CREATURES.ashkhar.moves.map(({ id, quake }) => [id, quake.kind, quake.element, quake.afflict?.kind ?? null]), [["leap", "demonLeap", undefined, null], ["frostflare", "frostFlare", "water", "slow"]]);
        assert.deepEqual([DEMON_FLARE.quake.element, DEMON_FLARE.quake.afflict.kind], ["fire", "burn"]);
        assert.ok(NATURAL.ashkhar.attacks[0].either.every((blow, k) => blow.damage[0] > NATURAL.demonBoss.attacks[0].either[k].damage[0]));
        assert.ok(CREATURES.ashkhar.rally.every(({ animation, call }) => animation === "rally" && call.told && call.down === 2));
    });

    it("brings its fists down at its feet at whoever's close: warned of on the ground all round it first, everyone of theirs there hurt and set burning, none further off", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const near = hero(battle, "near", [20, 22]);
        const far = hero(battle, "far", [20, 30]);
        const me = demon(battle, "demon", "demonBoss", [20, 20], { change: { flare: { first: 0 }, leap: { first: 1e9 } } });
        const events = play(battle, DEMON_FLARE.hitAt + 400, [near, far]);
        const started = events.find(({ type, attack }) => type === "attack" && attack === "flare");
        const telegraph = events.find(({ type }) => type === "telegraph");
        const blast = events.find(({ type, kind }) => type === "blast" && kind === "demonFlare");

        assert.ok(started && telegraph && blast, events.map(({ type }) => type).join(", "));
        assert.equal(started.animation, "flare");
        assert.equal(telegraph.radius, DEMON_FLARE.quake.radius);
        assert.equal(telegraph.lands, started.time + DEMON_FLARE.hitAt);
        assert.ok(Math.hypot(telegraph.x - me.x, telegraph.y - me.y) < 0.5, "(all round it)");

        const hit = events.find(({ type, id, by, attack }) => type === "hit" && id === "near" && by === "demon" && attack === "demonFlare");

        assert.ok(hit);
        assert.ok(!events.some(({ type, id, by, attack }) => type === "hit" && id === "far" && by === "demon" && attack === "demonFlare"), "(not further off)");
        assert.ok(events.some(({ type, id, kind }) => type === "afflicted" && kind === "burn" && id === "near"));
    });

    it("brings its fists down in frost (Ashkhar): whoever's close hurt by cold and slowed", () => {
        const battle = new Battle(field(40), { seed: 5 });
        const near = hero(battle, "near", [20, 22]);
        const flare = traitsOf("ashkhar").moves[1];

        demon(battle, "ashkhar", "ashkhar", [20, 20], { change: { frostflare: { first: 0 }, leap: { first: 1e9 } } });

        const events = play(battle, flare.hitAt + 400, [near]);
        const hit = events.find(({ type, id, attack }) => type === "hit" && id === "near" && attack === "frostFlare");

        assert.ok(events.some(({ type, kind }) => type === "blast" && kind === "frostFlare"), events.map(({ type }) => type).join(", "));
        assert.ok(hit);
        assert.equal(flare.quake.element, "water", "(cold's harm: warded against as water is)");
        assert.ok(events.some(({ type, id, kind }) => type === "afflicted" && kind === "slow" && id === "near"));
    });

    it("leaps on whoever keeps off: warned of where it'll land, in the air from its spring till it comes down by them, the ground heaving there", () => {
        const battle = new Battle(field(40), { seed: 3 });
        const me = hero(battle, "me", [18, 20]);
        const it = demon(battle, "demon", "demonBoss", [11, 20], { change: { leap: { first: 0 }, flare: { first: 1e9 } } });
        const events = play(battle, 400, [me]);
        const leapt = events.find(({ type }) => type === "leap");

        assert.ok(leapt, events.map(({ type }) => type).join(", "));
        assert.deepEqual([leapt.id, leapt.target, leapt.lift, leapt.land], ["demon", "me", DEMON_LEAP.leap.lift, DEMON_LEAP.hitAt]);

        const from = [it.x, it.y];
        const more = play(battle, DEMON_LEAP.hitAt + 200, [me]);
        const blast = more.find(({ type, kind }) => type === "blast" && kind === "demonLeap");

        assert.ok(blast, more.map(({ type }) => type).join(", "));
        assert.ok(Math.hypot(it.x - from[0], it.y - from[1]) > 3, "(carried over the ground: its clip played in place)");
        assert.ok(more.some(({ type, id, by }) => type === "hit" && id === "me" && by === "demon"));
    });

    it("roars as it's worn down (Ashkhar), once at two thirds and once at one third: the moor's restless dead come to it, told in its own words", () => {
        const battle = new Battle(field(40), { seed: 6 });
        const me = hero(battle, "me", [22, 20]);
        const it = demon(battle, "ashkhar", "ashkhar", [20, 20], { hp: 900, change: { leap: { first: 1e9 }, frostflare: { first: 1e9 } }, rally: true });
        let events = play(battle, 3000, [me]);

        assert.ok(!events.some(({ type }) => type === "call"), "none while it's whole");

        it.hp = 590;
        events = play(battle, 6000, [me]);
        assert.deepEqual(
            events.filter(({ type }) => type === "call").map(({ kind, told }) => [kind, told]),
            [["wraith", CREATURES.ashkhar.rally[0].call.told]],
        );
        assert.ok(events.some(({ type, attack, animation }) => type === "attack" && attack === "rally" && animation === "rally"));

        it.hp = 250;
        events = play(battle, 6000, [me]);
        assert.deepEqual(
            events.filter(({ type }) => type === "call").map(({ kind, told }) => [kind, told]),
            [["ghost", CREATURES.ashkhar.rally[1].call.told]],
        );
    });
});
