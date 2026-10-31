// Vharzul the Greenflame's fight (core/creatures.js vharzul, weapons.js NATURAL vharzul), made of
// the building blocks a rare card's foe may be made of (battle.js): moves of his own now and then
// (`moves`: his wings swept round before him, throwing whoever they catch; a ring of green fire
// burst all round him, shown on the ground first, setting them burning), and fiends come through
// the thin place behind him as he's worn down (`rally`, told in his own words); and his reward's
// own, Greenbrand's witchfire (core/legendary.js witchfire, battle.js #witchfire)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { BLOW_EFFECTS, effectAt, EFFECTS } from "../client/js/core/legendary.js";
import { fighterOf, mightOf } from "../client/js/core/might.js";
import { Progress } from "../client/js/core/progress.js";
import { makeUnique, UNIQUES } from "../client/js/core/rare.js";
import { createRandom } from "../client/js/core/random.js";
import { NATURAL, WEAPONS } from "../client/js/core/weapons.js";
import { MODELS } from "../client/js/beasts/model.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// Vharzul in a battle, as the host puts one out (host.js #rouse), his own moves as `change` has
// them (each by its id: { first, every... }), his rally left out unless it's wanted
function lord(battle, id, square, { hp = 1e5, change = {}, rally = false } = {}) {
    const { weapon, speed, chase, name } = CREATURES.vharzul;
    const traits = traitsOf("vharzul");
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
        wild: { creature: "vharzul", tier: 8, temper: "aggressive", guard: 0, roam: 0, leash: 60, pack: id, leader: null, menace: true, ...traits, moves, rally: rally ? traits.rally : null },
    });
}

// When a blow `at` ms into an attack lands, the battle going on a step at a time (STEP_MS)
const landsAt = (at) => Math.ceil(at / STEP_MS) * STEP_MS;

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

const hero = (battle, id, square, team = "hero") => battle.add({ id, kind: "player", weapon: "sword", team, square, hp: 1e5 });

describe("Vharzul the Greenflame's fight (battle.js: moves, quake, rally)", () => {
    it("is the Lord of the Pit's model in its green skin, a world's boss: his claws and the thin places' green fire, his wings and his ring of fire his own moves, fiends his rally, fire harming him little", () => {
        const def = CREATURES.vharzul;

        assert.ok(def.worldBoss && def.steady && def.darkSight && def.wards.fire === 0.5);
        assert.deepEqual(MODELS.vharzul.skins, ["dark"]);
        assert.equal(MODELS.vharzul.asset, MODELS.demonLord.asset, "(the Lord of the Pit's model)");
        assert.deepEqual(Object.values(MODELS.vharzul.specials), ["Spell In", "Wing Attack L", "Cast", "Spell Loop"]);
        assert.deepEqual(
            NATURAL.vharzul.attacks.map(({ id, projectile }) => [id, projectile?.kind ?? null]),
            [
                ["smash", null],
                ["greenfire", "riftFire"],
            ],
        );
        assert.deepEqual(
            def.moves.map(({ id, animation, telegraph = false }) => [id, animation, telegraph]),
            [
                ["wing", "wing", false],
                ["flare", "flare", true],
            ],
        );
        assert.ok(def.rally.every(({ animation, call }) => animation === "rally" && call.kind === "fiend" && call.told));
    });

    it("sweeps his wings round before him at whoever's close: those it catches before him hurt and thrown, none behind him", () => {
        const battle = new Battle(field(40), { seed: 3 });
        const front = hero(battle, "front", [20, 21]);
        const behind = hero(battle, "behind", [20, 15]);

        lord(battle, "lord", [20, 20], { change: { wing: { first: 0 }, flare: { first: 1e9 } } });

        const wing = traitsOf("vharzul").moves[0];
        const events = play(battle, wing.hitAt + 600, [front, behind]);
        const started = events.find(({ type, attack }) => type === "attack" && attack === "wing");
        const blast = events.find(({ type, kind }) => type === "blast" && kind === "wingSweep");

        assert.ok(started && blast, events.map(({ type }) => type).join(", "));
        assert.equal(started.animation, "wing");
        assert.equal(blast.time, started.time + landsAt(wing.hitAt));
        assert.ok(events.some(({ type, id, by, attack }) => type === "hit" && id === "front" && by === "lord" && attack === "wingSweep"));
        assert.ok(blast.throws.some(({ id }) => id === "front"), JSON.stringify(blast.throws));
        assert.ok(!events.some(({ type, id, by }) => type === "hit" && id === "behind" && by === "lord"), "(not behind him)");
    });

    it("bursts a ring of green fire all round him: warned of round him first, everyone of theirs in reach hurt by fire and set burning, wherever they stand", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const front = hero(battle, "front", [22, 20]);
        const back = hero(battle, "back", [18, 20]);
        const me = lord(battle, "lord", [20, 20], { change: { wing: { first: 1e9 }, flare: { first: 0 } } });
        const flare = traitsOf("vharzul").moves[1];
        const events = play(battle, flare.hitAt + 400, [front, back]);
        const telegraph = events.find(({ type }) => type === "telegraph");
        const started = events.find(({ type, attack }) => type === "attack" && attack === "flare");

        assert.ok(started && telegraph, events.map(({ type }) => type).join(", "));
        assert.deepEqual([telegraph.x, telegraph.y, telegraph.radius, telegraph.lands], [me.x, me.y, flare.quake.radius, started.time + flare.hitAt]);
        assert.equal(started.animation, "flare");

        for (const id of ["front", "back"]) {
            const hit = events.find((event) => event.type === "hit" && event.id === id && event.by === "lord" && event.attack === "greenFlare");

            assert.ok(hit, id);
            assert.equal(hit.element ?? "fire", "fire");
        }

        assert.ok(events.some(({ type, id, kind }) => type === "afflicted" && kind === "burn" && (id === "front" || id === "back")), events.filter(({ type }) => type === "afflicted").map(({ id, kind }) => `${id}:${kind}`).join());
    });

    it("tears the thin place open behind him as he's worn down, once at two thirds and once at one third: fiends come through, told in his own words", () => {
        const battle = new Battle(field(40), { seed: 6 });
        const me = hero(battle, "me", [22, 20]);
        const it = lord(battle, "lord", [20, 20], { hp: 900, change: { wing: { first: 1e9 }, flare: { first: 1e9 } }, rally: true });
        let events = play(battle, 3000, [me]);

        assert.ok(!events.some(({ type }) => type === "call"), "none while he's whole");

        it.hp = 590;
        events = play(battle, 6000, [me]);

        const first = events.filter(({ type }) => type === "call");

        assert.equal(first.length, 1);
        assert.deepEqual([first[0].kind, first[0].count, first[0].down, first[0].told], ["fiend", [2, 2], 1, CREATURES.vharzul.rally[0].call.told]);
        assert.ok(events.some(({ type, attack, animation }) => type === "attack" && attack === "rally" && animation === "rally"));

        it.hp = 250;
        events = play(battle, 6000, [me]);

        const second = events.filter(({ type }) => type === "call");

        assert.deepEqual(
            second.map(({ kind, told }) => [kind, told]),
            [["fiend", CREATURES.vharzul.rally[1].call.told]],
        );
    });
});

describe("Greenbrand's witchfire (core/legendary.js witchfire, battle.js #witchfire)", () => {
    it("is a unique's own, on every blow with no charge to it, never rolled on a legendary weapon: fire's, its leaps and its share by the blade's level", () => {
        assert.ok(EFFECTS.witchfire.unique && EFFECTS.witchfire.always && !BLOW_EFFECTS.includes("witchfire"));
        assert.equal(EFFECTS.witchfire.element, "fire");
        assert.deepEqual([effectAt("witchfire", 1).leaps, effectAt("witchfire", 100).leaps], [1, 2]);
        assert.deepEqual([effectAt("witchfire", 1).share, effectAt("witchfire", 100).share], [0.35, 0.6]);
        assert.equal(effectAt("witchfire", 50).reach, EFFECTS.witchfire.reach);
        assert.deepEqual([UNIQUES.greenbrand.base, UNIQUES.greenbrand.effect], ["sword", "witchfire"]);
    });

    it("sets the foe struck alight with every blow up close, the fire leaping on to the nearest foes beside it, each its share as hard and set alight; none further than its reach, no charge filled", () => {
        const battle = new Battle(field(30), { seed: 2 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 10], hp: 1e5, power: { melee: 1, ranged: 1 } });
        const foe = (id, square) => battle.add({ id, kind: "beast", name: id, weapon: "rat", team: WILD, square, ai: null, hp: 1e5 });

        foe("struck", [10, 11]);
        foe("near", [12, 12]);
        foe("next", [14, 13]);
        foe("far", [26, 26]);
        me.legendary = { effect: "witchfire", level: 100, charge: 5 };
        battle.command("me", { type: "engage", target: "struck", stand: true });

        const events = play(battle, 9000, [me]);
        const blows = events.filter(({ type, by, id, attack }) => type === "hit" && by === "me" && id === "struck" && attack !== "witchfire");
        const leapt = events.filter(({ type, by, attack }) => type === "hit" && by === "me" && attack === "witchfire");

        assert.ok(blows.length >= 3, `${blows.length} blows`);
        assert.ok(leapt.length >= blows.length && leapt.every(({ id }) => id === "near" || id === "next"), JSON.stringify(leapt.map(({ id }) => id)));
        assert.ok(leapt.some(({ id }) => id === "next"), "(on from the nearest to the next)");
        assert.ok(!events.some(({ type, id, by }) => type === "hit" && id === "far" && by === "me"), "(none beyond its reach)");
        assert.ok(events.some(({ type, effect, struck }) => type === "unleashed" && effect === "witchfire" && struck[0] === "near"));
        assert.ok(["struck", "near", "next"].every((id) => events.some(({ type, kind, id: one }) => type === "afflicted" && kind === "burn" && one === id)), "(each set alight)");

        // (As hard as the blow's share would be: the sword's harm, no more than three fifths of its most)
        const most = Math.ceil(WEAPONS.sword.attacks[0].damage[1] * 0.6);

        assert.ok(leapt.every(({ damage }) => damage >= 1 && damage <= most), JSON.stringify(leapt.map(({ damage }) => damage)));
        assert.equal(me.charge ?? 0, 0, "(no charge to it)");
    });

    it("counts in a hero's might as more harm from their blows, the more the finer the blade", () => {
        const hero = (level) => new Progress({ gear: { mainHand: { ...makeUnique("greenbrand", level, createRandom(5)), bonuses: {}, affixes: [] } } }, { weapon: "sword" });
        const plain = new Progress({ gear: { mainHand: { id: "sword", quality: "common", level: 60 } } }, { weapon: "sword" });

        assert.equal(fighterOf(hero(60)).legendary.effect, "witchfire");
        assert.ok(mightOf(hero(60)) > mightOf(plain), `${mightOf(hero(60))} vs ${mightOf(plain)}`);
    });
});
