// The Behemoth of the Rift (creatures.js CREATURES kaiju, COLOSSUS; battle.js #colossus): its body
// as wide as it's drawn, its tread, its jaws, its roar and its atomic breath; on no side but its
// own, everyone's enemy; and nothing that stuns, frightens or slows it takes hold
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { COLOSSUS, CREATURES, RIFT, traitsOf, WILD } from "../client/js/core/creatures.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// The Behemoth of the Rift in a battle, as the host puts one out (host.js #riftBeast)
function behemoth(battle, square, { facing = 0, hp = 5000 } = {}) {
    const spec = CREATURES.kaiju;

    return battle.add({ id: "kaiju", kind: "beast", name: spec.name, weapon: spec.weapon, team: RIFT, square, ai: "colossus", facing, armed: true, hp, speed: spec.speed, chase: spec.chase, armor: spec.armor, wild: { creature: "kaiju", tier: 10, temper: "aggressive", guard: 0, roam: 0, leash: spec.leash, pack: "kaiju", leader: null, menace: true, unique: true, darkSight: true, ...traitsOf("kaiju") } });
}

// Soldiers standing where they're put (stunned a long while), on a side of their own
function soldiers(battle, prefix, [x, y], count, { team = "human", hp = 400, spread = 1 } = {}) {
    return Array.from({ length: count }, (each, k) => {
        const actor = battle.add({ id: `${prefix}${k}`, kind: "soldier", weapon: "sword", team, square: [x + (k % 4) * spread, y + Math.floor(k / 4) * spread], hp });

        actor.stunnedUntil = 1e9;

        return actor;
    });
}

describe("the Behemoth of the Rift (battle.js #colossus)", () => {
    it("is the mightiest of all, on no side but its own, its moves those of its own weapon", () => {
        const spec = CREATURES.kaiju;

        assert.equal(spec.name, "Behemoth of the Rift");
        assert.ok(spec.steady && spec.perilous && spec.colossus === COLOSSUS);
        assert.deepEqual(NATURAL.kaiju.attacks.map(({ id }) => id), ["slam", "roar", "atomicBreath"]);
        assert.ok(NATURAL.kaiju.attacks.every((attack) => attack.kind === "colossal" && attack.hitAt < attack.duration));
        assert.ok(traitsOf("kaiju").colossus.breath.mouth > 15, "its breath from its mouth, far before where it stands");
        assert.notEqual(RIFT, WILD);
    });

    it("breathes on those standing where its breath would land: raked from the nearer to the further, each caught hurt once and thrown back from it", () => {
        const battle = new Battle(field(120), { seed: 5 });
        const kaiju = behemoth(battle, [20, 20], { facing: 0 });
        const { mouth, reach } = COLOSSUS.breath;
        // (Where it lands as it's raked: from 29 to 34 metres before it, the way it faces, +y)
        const caught = soldiers(battle, "s", [19, 20 + Math.round(mouth + reach[0])], 8, { spread: 1.2 });
        const events = run(battle, 7000);
        const attack = events.find((event) => event.type === "attack" && event.id === "kaiju");

        assert.equal(attack?.attack, "atomicBreath");
        assert.equal(attack.animation, "breath");

        const breath = events.find((event) => event.type === "breath");

        assert.ok(breath, "told as it breathes");
        assert.deepEqual(breath.reach, [mouth + reach[0], mouth + reach[1]]);

        const hits = events.filter((event) => event.type === "hit" && event.by === "kaiju" && event.attack === "atomicBreath");
        const thrown = events.filter((event) => event.type === "blast" && event.kind === "atomicBreath").flatMap(({ throws }) => throws);

        assert.ok(hits.length >= caught.length - 1, `most of them caught (${hits.length})`);
        assert.equal(new Set(hits.map(({ id }) => id)).size, hits.length, "each hurt once a breath");
        assert.ok(thrown.length >= caught.length - 1, "and thrown");
        assert.ok(thrown.every(({ from, to }) => to[1] >= from[1] - 0.01), "back, away from it");
        assert.equal(battle.breaths.length, 0, "and it's over");
        assert.equal(kaiju.hp, kaiju.maxHp, "none of it on itself");
    });

    it("slams its jaws down on those just before it, roars once enough are round it, and treads on whoever's under it as it goes", () => {
        const battle = new Battle(field(120), { seed: 7 });

        behemoth(battle, [40, 30], { facing: 0 });

        // (Just before its jaws)
        soldiers(battle, "a", [39, 30 + COLOSSUS.slam.ahead], 2);

        const slammed = run(battle, 3000).filter((event) => event.type === "attack" && event.id === "kaiju");

        assert.equal(slammed[0]?.attack, "slam");

        // (All round it)
        const round = new Battle(field(120), { seed: 9 });

        behemoth(round, [60, 60], { facing: 0 });
        soldiers(round, "r", [54, 58], 12, { spread: 2.5 });

        const events = run(round, 9000);
        const roared = events.find((event) => event.type === "attack" && event.attack === "roar");

        assert.ok(roared, "roared");
        assert.ok(events.some((event) => event.type === "blast" && event.kind === "colossalRoar" && event.throws.length >= 4), "and threw them off their feet");
    });

    it("walks to where its breath would land on them, turning no faster than it turns, its body's squares kept with it, treading on whoever's in its way", () => {
        const battle = new Battle(field(160), { seed: 11 });
        const kaiju = behemoth(battle, [80, 20], { facing: Math.PI / 2 });
        const band = soldiers(battle, "s", [78, 95], 8, { spread: 1.5 });

        // (One in its way: under it as it goes)
        soldiers(battle, "w", [80, 40], 1);

        let most = 0;
        let was = kaiju.facing;
        const events = [];

        for (let t = 0; t < 30000; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
            most = Math.max(most, Math.abs(Math.atan2(Math.sin(kaiju.facing - was), Math.cos(kaiju.facing - was))));
            was = kaiju.facing;
        }

        assert.ok(most <= COLOSSUS.turn * (STEP_MS / 1000) + 1e-9, "turning slowly");

        const [x0, y0, x1, y1] = kaiju.footprint;
        const middle = [kaiju.x + Math.sin(kaiju.facing) * COLOSSUS.body.ahead, kaiju.y + Math.cos(kaiju.facing) * COLOSSUS.body.ahead];

        assert.ok(x0 <= middle[0] && middle[0] <= x1 + 1 && y0 <= middle[1] && middle[1] <= y1 + 1 && x1 - x0 >= COLOSSUS.body.half * 2 - 1, "its body's squares where its body is");
        assert.ok(events.some((event) => event.type === "hit" && event.id === "w0" && event.attack === "colossalTread"), "trod on the one in its way");
        assert.ok(events.some((event) => event.type === "hit" && band.some(({ id }) => id === event.id) && event.by === "kaiju"), "and came on the band");
    });

    it("is everyone's enemy and everyone its, the wild's creatures too; nothing stuns, frightens, slows or throws it", () => {
        const battle = new Battle(field(80), { seed: 13 });
        const kaiju = behemoth(battle, [40, 40]);
        const wolf = battle.add({ id: "wolf", kind: "beast", weapon: "wolf", team: WILD, square: [50, 50], ai: "wild", wild: { creature: "wolf", tier: 3, temper: "aggressive", guard: 0, roam: 0, leash: 30, pack: "wolf", leader: null, menace: true, ...traitsOf("wolf") } });

        assert.ok(battle.hostile(kaiju, wolf) && battle.hostile(wolf, kaiju));

        for (const kind of ["fear", "slow", "venom"]) {
            assert.equal(battle.afflict("kaiju", kind), false, kind);
        }

        assert.equal(battle.afflict("kaiju", "burn"), true, "but fire burns it");
    });
});
