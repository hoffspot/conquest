// A hell's cerberus and Ashmaw, the Hound Unchained (core/creatures.js cerberus and ashmaw,
// weapons.js NATURAL cerberus and ashmaw, beasts/model.js MODELS): the Halls of Bone's master,
// chained at the way down (dungeons/themes.js hell), and the hound broken loose, a world's boss in
// the wilds (core/rare.js RARE_CARDS ashmaw). Their three heads' bites, a lunge and fire breathed;
// their three heads' fire at once, warned of on the ground before it and setting whoever it catches
// burning (HOUND_INFERNO); Ashmaw's leap on whoever keeps off, and the dead called up to its howl as
// it's worn down (`rally`, told in words of its own)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, HOUND_INFERNO, traitsOf, WILD } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { MODELS } from "../client/js/beasts/model.js";
import { LOOKS } from "../client/js/beasts/looks.js";
import { REGALIA } from "../client/js/beasts/champions.js";
import { SPOILS } from "../client/js/core/spoils.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// A hound in a battle, as the host puts one out (host.js #rouse), its own moves as `change` has
// them (each by its id: { first, every... }), its rally left out unless it's wanted
function hound(battle, id, kind, square, { hp = 1e5, change = {}, rally = false } = {}) {
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

describe("a hell's cerberus and Ashmaw (creatures.js, weapons.js, beasts/model.js)", () => {
    it("is the Halls of Bone's master, chained at the way down, the dead about it; the Bone Lord one of their mini-bosses now", () => {
        const bone = THEMES.hell.realms.find(({ id }) => id === "bone");

        assert.deepEqual([bone.warden.creature, bone.warden.title, bone.warden.guard], ["cerberus", "the Hound of the Halls", ["skeleton"]]);
        assert.ok(bone.minis.some(({ creature, title }) => creature === "wightLord" && title === "the Bone Lord"));
        assert.ok(REGALIA[bone.warden.id]);
        assert.ok(THEMES.hell.minis.some(({ creature }) => creature === "cerberus"), "(its model fetched at a hell's door)");
    });

    it("is drawn from the Cerberus, the Halls' hound in its own skin or the dark, Ashmaw a tenth bigger in the ash; a great hound standing in for each till it's read", () => {
        assert.equal(MODELS.ashmaw.asset, MODELS.cerberus.asset);
        assert.deepEqual([MODELS.cerberus.skins, MODELS.ashmaw.skins], [["", "dark"], ["ash"]]);
        assert.ok(Math.abs(MODELS.ashmaw.length / MODELS.cerberus.length - 1.1) < 0.01);
        assert.ok(MODELS.ashmaw.pace > MODELS.cerberus.pace && MODELS.ashmaw.runPace > MODELS.cerberus.runPace, "(its stride as long again as it's bigger)");
        assert.deepEqual(MODELS.cerberus.specials, { bite: "Attack 3", lunge: "Attack 1", breath: "Fire", inferno: "Fire All", leap: "Jump", rally: "Attack 2" });
        assert.ok(!Object.values(MODELS.cerberus.specials).includes("Attack 4"), "(its fourth attack came through broken)");
        assert.equal(LOOKS.cerberus.body, "quadruped");
        assert.ok(LOOKS.ashmaw.scale[0] > LOOKS.cerberus.scale[0]);
        assert.ok(SPOILS.cerberus.items.some(({ id }) => id === "hellFang") && SPOILS.ashmaw.gold[0] > SPOILS.cerberus.gold[0]);
    });

    it("bites with three heads or lunges, breathes fire from one, and all three at once now and then, warned of first; Ashmaw harder, a world's boss with a leap and a howl of its own; fire harming both little", () => {
        for (const kind of ["cerberus", "ashmaw"]) {
            const def = CREATURES[kind];
            const [jaws, breath] = NATURAL[def.weapon].attacks;

            assert.ok(def.steady && def.darkSight && def.wards.fire === 0.5, kind);
            assert.deepEqual(jaws.either.map(({ id, animation }) => [id, animation]), [["bite", "bite"], ["lunge", "lunge"]]);
            assert.deepEqual([breath.id, breath.animation, breath.projectile.kind, breath.afflict.kind], ["breath", "breath", "flame", "burn"]);
            assert.ok(def.moves.some(({ id, telegraph, quake }) => id === "inferno" && telegraph && quake.element === "fire" && quake.afflict.kind === "burn"));
        }

        assert.ok(!CREATURES.cerberus.worldBoss && CREATURES.ashmaw.worldBoss);
        assert.deepEqual(CREATURES.cerberus.moves.map(({ id }) => id), ["inferno"]);
        assert.deepEqual(CREATURES.ashmaw.moves.map(({ id }) => id), ["leap", "inferno"]);
        assert.ok(NATURAL.ashmaw.attacks[0].either.every((bite, k) => bite.damage[0] > NATURAL.cerberus.attacks[0].either[k].damage[0]));
        assert.ok(CREATURES.ashmaw.rally.every(({ animation, call }) => animation === "rally" && call.told && call.down === 2));
    });

    it("breathes fire from all three heads at once at whoever's before it: warned of on the ground ahead first, everyone of theirs there hurt by fire and set burning, none behind it", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const front = hero(battle, "front", [20, 25]);
        const behind = hero(battle, "behind", [20, 14]);
        const me = hound(battle, "hound", "cerberus", [20, 20], { change: { inferno: { first: 0 } } });
        const events = play(battle, HOUND_INFERNO.hitAt + 400, [front, behind]);
        const started = events.find(({ type, attack }) => type === "attack" && attack === "inferno");
        const telegraph = events.find(({ type }) => type === "telegraph");
        const blast = events.find(({ type, kind }) => type === "blast" && kind === "houndInferno");

        assert.ok(started && telegraph && blast, events.map(({ type }) => type).join(", "));
        assert.equal(started.animation, "inferno");
        assert.equal(telegraph.radius, HOUND_INFERNO.quake.radius);
        assert.equal(telegraph.lands, started.time + HOUND_INFERNO.hitAt);
        assert.ok(Math.hypot(telegraph.x - me.x, telegraph.y - me.y) > 3, "(ahead of it)");

        const hit = events.find(({ type, id, by, attack }) => type === "hit" && id === "front" && by === "hound" && attack === "houndInferno");

        assert.ok(hit);
        assert.equal(hit.element ?? "fire", "fire");
        assert.ok(!events.some(({ type, id, by, attack }) => type === "hit" && id === "behind" && by === "hound" && attack === "houndInferno"), "(not behind it)");
        assert.ok(events.some(({ type, id, kind }) => type === "afflicted" && kind === "burn" && id === "front"));
    });

    it("leaps on whoever keeps off (Ashmaw): warned of where it'll land, in the air from its spring till it comes down by them, the ground heaving there", () => {
        const battle = new Battle(field(40), { seed: 3 });
        const me = hero(battle, "me", [18, 20]);
        const it = hound(battle, "ashmaw", "ashmaw", [11, 20], { change: { leap: { first: 0 }, inferno: { first: 1e9 } } });
        const leap = traitsOf("ashmaw").moves[0];
        const events = play(battle, 400, [me]);
        const leapt = events.find(({ type }) => type === "leap");

        assert.ok(leapt, events.map(({ type }) => type).join(", "));
        assert.deepEqual([leapt.id, leapt.target, leapt.lift, leapt.land], ["ashmaw", "me", leap.leap.lift, leap.hitAt]);

        const from = [it.x, it.y];
        const more = play(battle, leap.hitAt + 200, [me]);
        const blast = more.find(({ type, kind }) => type === "blast" && kind === "houndLeap");

        assert.ok(blast, more.map(({ type }) => type).join(", "));
        assert.ok(Math.hypot(it.x - from[0], it.y - from[1]) > 3, "(carried over the ground: its clip played in place)");
        assert.ok(more.some(({ type, id, by }) => type === "hit" && id === "me" && by === "ashmaw"));
    });

    it("howls as it's worn down (Ashmaw), once at two thirds and once at one third: the dead claw their way up to it, told in its own words", () => {
        const battle = new Battle(field(40), { seed: 6 });
        const me = hero(battle, "me", [22, 20]);
        const it = hound(battle, "ashmaw", "ashmaw", [20, 20], { hp: 900, change: { leap: { first: 1e9 }, inferno: { first: 1e9 } }, rally: true });
        let events = play(battle, 3000, [me]);

        assert.ok(!events.some(({ type }) => type === "call"), "none while it's whole");

        it.hp = 590;
        events = play(battle, 6000, [me]);

        const first = events.filter(({ type }) => type === "call");

        assert.deepEqual(
            first.map(({ kind, told }) => [kind, told]),
            [["skeleton", CREATURES.ashmaw.rally[0].call.told]],
        );
        assert.ok(events.some(({ type, attack, animation }) => type === "attack" && attack === "rally" && animation === "rally"));

        it.hp = 250;
        events = play(battle, 6000, [me]);
        assert.deepEqual(
            events.filter(({ type }) => type === "call").map(({ kind, told }) => [kind, told]),
            [["draugr", CREATURES.ashmaw.rally[1].call.told]],
        );
    });
});
