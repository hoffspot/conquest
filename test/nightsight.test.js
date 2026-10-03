// Seeing at night (client/js/core/light.js, the battle's canSee, the host's light each step): less
// far in the dark, the moon's light helping; as by day round the settlements, the war camps' fires,
// fires on the ground and the soldiers' torches; the light worked out alike by every copy of the
// world from what they share. And the night's creatures (core/creatures.js, the host's wilds): the
// night's own out only after dark, the night's hunters met more often then, more about the players
// at night, those that see in the dark seeing as by day, and the night's own gone at daybreak. And
// the Light spell (core/spells.js light): a globe over its caster lighting the dark round them
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, SIGHT, STEP_MS } from "../client/js/core/battle.js";
import { candidatesAt, CREATURES, NIGHT_WEIGHT, outByDay, WILD } from "../client/js/core/creatures.js";
import { DAY, MOON_DAYS } from "../client/js/core/daytime.js";
import { HOST_PLAYER, Host, WILDS } from "../client/js/core/host.js";
import { carriesTorch, LIGHT_NEAR, LIGHT_REACH, lighting, NIGHT_SIGHT, sightAt, skyLight, torchesLit } from "../client/js/core/light.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { SETTLEMENTS } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// How long the world's been going (ms) when it's a time of day (ms from midnight) on day `day`
const at = (time, day = 1) => day * DAY.length + time - DAY.start;
const MIDNIGHT = 0;
const NOON = 29 * 60000;

// The war's clock set to a time (how long the world's been going, ms: its turns a minute each)
const clockTo = (host, elapsed) => Object.assign(host.war, { turn: Math.floor(elapsed / 60000), clock: elapsed % 60000 });

describe("seeing at night (core/light.js)", () => {
    it("sees as far as ever by day, less far by night, a full moon's light helping", () => {
        assert.equal(skyLight(at(NOON)), 1);

        // (The moon's phase: a new moon on the day halfway round from the full)
        const nights = Array.from({ length: MOON_DAYS }, (_, day) => skyLight(at(MIDNIGHT, day + 1)));
        const [darkest, brightest] = [Math.min(...nights), Math.max(...nights)];

        assert.ok(darkest >= NIGHT_SIGHT.dark && darkest < NIGHT_SIGHT.dark + 0.05, `a moonless night: ${darkest}`);
        assert.ok(brightest <= NIGHT_SIGHT.moon && brightest > NIGHT_SIGHT.moon - 0.05, `a full moon: ${brightest}`);

        // (Through the dusk, falling to the night's: on a night of the new moon, the 6th day's)
        const dusk = [DAY.dusk, (DAY.dusk + DAY.night) / 2, DAY.night].map((time) => skyLight(at(time, 6)));

        assert.ok(dusk[0] === 1 && dusk[1] < 1 && dusk[2] < dusk[1], `${dusk}`);
        assert.equal(torchesLit(at(NOON)), false);
        assert.equal(torchesLit(at(MIDNIGHT)), true);
    });

    it("gives the soldiers with a hand free a torch at night (not the bowmen, nor anyone by day, nor the dead)", () => {
        const soldier = (weapon, more = {}) => ({ kind: "soldier", weapon, dead: false, ...more });

        assert.deepEqual(["sword", "cleaver", "wand", "bow", "staff", "gauntlets"].map((weapon) => carriesTorch(soldier(weapon), true)), [true, true, true, false, false, false]);
        assert.equal(carriesTorch(soldier("sword"), false), false);
        assert.equal(carriesTorch(soldier("sword", { dead: true }), true), false);
        assert.equal(carriesTorch({ kind: "player", weapon: "sword", dead: false }, true), false);
    });

    it("lights the settlements, camps' fires, fires on the ground and torches near the players, as far as each reaches", () => {
        const plan = { places: [{ kind: "town", at: [100, 100] }, { kind: "village", at: [2000, 2000] }] };
        const light = lighting({ elapsed: at(MIDNIGHT), plan, players: [[150, 100]], camps: [[300, 100]], fires: [{ x: 170, y: 100, radius: 2 }], torches: [[200, 130], [900, 900]] });
        const town = SETTLEMENTS.town.radius + LIGHT_REACH.settlement;

        assert.ok(light.sky < 1);
        assert.deepEqual(light.lit, [
            [100, 100, town * town],
            [170, 100, (2 + LIGHT_REACH.fire) ** 2],
            [200, 130, LIGHT_REACH.torch ** 2],
        ]);
        assert.equal(sightAt(light, [100 + town - 2, 100]), 1, "in the town");
        assert.equal(sightAt(light, [205, 130]), 1, "by a torch");
        assert.equal(sightAt(light, [250, 160]), light.sky, "in the dark between");

        // (By day nothing's needed: as far as ever everywhere)
        assert.deepEqual(lighting({ elapsed: at(NOON), plan, players: [[150, 100]] }), { sky: 1, lit: [] });
        assert.equal(sightAt(null, [250, 160]), 1);
    });

    it("sees less far in the battle at night out in the world, as by day where it's lit, and talks as ever", () => {
        const rows = Array.from({ length: 12 }, () => ".".repeat(30));
        const world = { blocked: rows.map((row) => Uint8Array.from([...row], () => 0)), opaque: rows.map((row) => Uint8Array.from([...row], () => 0)) };
        const battle = new Battle(world, { seed: 3 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 5] });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [12, 5], ai: "patrol", patrol: [[12, 5], [12, 5]] });

        assert.equal(battle.canSee(orc, player), true, "10 m away by day");
        battle.light = { sky: 0.4, lit: [] };
        assert.equal(battle.canSee(orc, player), false, "not in the dark (4.8 m)");
        assert.equal(battle.canSee(player, orc), false);
        battle.light = { sky: 0.4, lit: [[2.5, 5.5, LIGHT_REACH.torch ** 2]] };
        assert.equal(battle.canSee(orc, player), true, "the player lit by a torch: seen from out of the dark");
        assert.equal(battle.canSee(player, orc), false, "the orc in the dark past the torch's reach: not seen");

        // (Talking in the dark as ever: someone next to them, no torch)
        const stranger = battle.add({ id: "stranger", kind: "orc", weapon: "cleaver", team: "orcs", square: [20, 5], ai: "patrol", patrol: [[20, 5], [20, 5]] });
        const listener = battle.add({ id: "listener", kind: "player", weapon: "sword", team: "hero", square: [21, 5] });

        assert.equal(battle.canTalk(listener, stranger), true);

        // (Indoors, as lit as ever)
        battle.lightMap = "elsewhere";
        battle.light = { sky: 0.4, lit: [] };
        assert.equal(battle.canSee(orc, player), true);
        assert.ok(SIGHT > 10);
    });

    it("has the host work out the light each step: dark at midnight round a player out in the wilds, lit in their town, the soldiers' torches burning", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        // (By day: nothing to work out)
        host.advance(STEP_MS);
        assert.equal(host.battle.light, null);

        Object.assign(host.war, { turn: 41, clock: 30000 });

        for (let t = STEP_MS; t < 4000; t += STEP_MS) {
            host.advance(STEP_MS);
        }

        // (The light's worked out as a step begins, from where everyone is then)
        const player = host.battle.actor(HOST_PLAYER);
        const [px, py] = [player.x, player.y];
        const torches = host.battle.actors.filter((actor) => carriesTorch(actor, true) && actor.map === "town").map(({ x, y }) => [x, y]);
        const near = torches.filter(([x, y]) => Math.hypot(x - px, y - py) <= LIGHT_NEAR);

        host.advance(STEP_MS);

        const light = host.battle.light;

        assert.ok(light.sky < NIGHT_SIGHT.moon + 1e-9, `the night's sky: ${light.sky}`);
        assert.equal(sightAt(light, [Math.floor(px), Math.floor(py)]), 1, "in the town it's lit");
        assert.ok(near.length > 0, "soldiers with torches out near the player");
        assert.ok(near.every(([tx, ty]) => light.lit.some(([x, y, reach2]) => x === tx && y === ty && reach2 === LIGHT_REACH.torch ** 2)), "each torch near lighting round it");

        // (Out in the dark, far from anywhere lit)
        assert.equal(sightAt(light, [px + 5000, py + 5000]), light.sky);
    });
});

describe("the night's creatures (core/creatures.js, the host's wilds)", () => {
    const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });
    const run = (host, ms) => {
        for (let t = 0; t < ms; t += STEP_MS) {
            host.advance(STEP_MS);
        }
    };

    // A world with its player out in the wilds west of their town (the orc gone), sturdy enough
    // to be left among what comes
    const outside = () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const [middle, radius] = [world.stamp.middle, SETTLEMENT_KINDS[world.start.kind].radius];

        put(me, [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 20)]);
        Object.assign(me, { hp: 5000, maxHp: 5000 });

        return { host, me };
    };
    const roaming = (host, me) => [...host.wild].filter(([, one]) => !one.camp && !one.lair).map(([id, one]) => ({ ...one, actor: host.battle.actor(id) })).filter(({ actor }) => actor && !actor.dead && Math.hypot(actor.x - me.x, actor.y - me.y) < WILDS.about);

    it("has the night's own out only after dark, the night's hunters met more often then", () => {
        const land = { biome: "heath", race: "human" };
        const day = new Map(candidatesAt(land, 4).map(({ id, weight }) => [id, weight]));
        const night = new Map(candidatesAt(land, 4, true).map(({ id, weight }) => [id, weight]));

        for (const id of ["bats", "skeleton", "blackShuck"]) {
            assert.equal(day.has(id), false, `no ${id} by day`);
        }

        assert.deepEqual([night.get("bats"), night.get("skeleton"), night.get("blackShuck")], [NIGHT_WEIGHT.only, NIGHT_WEIGHT.only, 2 * NIGHT_WEIGHT.only]);
        assert.deepEqual([day.get("wolf"), night.get("wolf")], [1, NIGHT_WEIGHT.more]);
        assert.deepEqual([day.get("boar"), night.get("boar")], [1, 1]);

        // (Every night creature's habits make sense: the night's own see in the dark, and there's
        // something about by day wherever there's anything at night)
        for (const [id, creature] of Object.entries(CREATURES)) {
            assert.ok([undefined, "only", "more"].includes(creature.night), id);
            assert.ok(creature.night !== "only" || creature.darkSight, `${id} sees in the dark`);
        }

        assert.equal(outByDay("bats"), false);
        assert.equal(outByDay("wolf"), true);
    });

    it("has those that see in the dark see as far as by day, out of the light", () => {
        const rows = Array.from({ length: 12 }, () => ".".repeat(30));
        const world = { blocked: rows.map((row) => Uint8Array.from([...row], () => 0)), opaque: rows.map((row) => Uint8Array.from([...row], () => 0)) };
        const battle = new Battle(world, { seed: 3 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 5] });
        const bats = battle.add({ id: "bats", kind: "beast", weapon: "bats", team: WILD, square: [12, 5], ai: "wild", wild: { creature: "bats", tier: 1, temper: "aggressive", guard: 0, roam: 10, leash: 20, pack: "p", leader: null, menace: true, unique: false, darkSight: true } });
        const boar = battle.add({ id: "boar", kind: "beast", weapon: "boar", team: WILD, square: [2, 9], ai: "wild", wild: { creature: "boar", tier: 1, temper: "territorial", guard: 5, roam: 8, leash: 16, pack: "q", leader: null, menace: true, unique: false, darkSight: false } });

        battle.light = { sky: 0.4, lit: [] };
        assert.equal(battle.canSee(bats, player), true, "the bats, 10 m off in the dark");
        assert.equal(battle.canSee(player, bats), false);
        assert.equal(battle.canSee(boar, player), true, "the boar 4 m off");
        put(boar, [2, 11]);
        assert.equal(battle.canSee(boar, player), false, "the boar 6 m off in the dark");
    });

    it("keeps more about a player out in the wilds at night, the night's own among them, gone to ground at daybreak", () => {
        const { host, me } = outside();

        clockTo(host, at(MIDNIGHT, 2));
        run(host, 30000);

        const night = roaming(host, me);
        const own = night.filter(({ creature }) => !outByDay(creature));

        assert.ok(night.length > WILDS.count && night.length <= WILDS.count + WILDS.night, `${night.length} about at night`);
        assert.ok(own.length > 0, `the night's own out: ${night.map(({ creature }) => creature)}`);
        assert.ok(night.every(({ actor }) => actor.team === WILD));
        assert.ok(own.every(({ actor }) => actor.wild.darkSight));

        // (Daybreak: the night's own out of sight let go, none put out again; the player's walked
        // off a little, out of their sight)
        clockTo(host, at(NOON, 2));
        put(me, [Math.floor(me.x + 70), Math.floor(me.y)]);
        run(host, 6000);

        const day = roaming(host, me);

        const gone = own.filter(({ actor }) => !host.battle.actor(actor.id));

        assert.ok(gone.length > 0 && own.every(({ actor }) => !host.battle.actor(actor.id) || host.battle.actor(actor.id).target !== null), `the night's own gone: ${gone.length} of ${own.length}`);
        assert.ok(day.every(({ creature }) => outByDay(creature)), `by day: ${day.map(({ creature }) => creature)}`);
        assert.ok(day.length <= WILDS.count, `${day.length} about by day`);
    });
});

describe("the Light spell (core/spells.js light)", () => {
    it("is learnt from a tome every adventurers' guild sells for 10 gold; cast, lights the dark 12 m round its caster for fifteen minutes; cast again, put out", async () => {
        const { ITEMS, wares } = await import("../client/js/core/progress.js");
        const { SPELLS } = await import("../client/js/core/spells.js");
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        assert.ok(wares("guild").some(({ id }) => id === "tomeLight"));
        assert.equal(ITEMS.tomeLight.price, 10);
        assert.equal(SPELLS.light.lasts, 15 * 60000);

        const me = host.battle.actor(HOST_PLAYER);
        const cast = () => {
            const result = host.command(HOST_PLAYER, { type: "cast", spell: "light", target: null });

            for (let t = 0; t < SPELLS.light.castTime + 200; t += STEP_MS) {
                host.advance(STEP_MS);
            }

            return result;
        };

        assert.equal(cast().ok, false, "not known yet");
        host.players.get(HOST_PLAYER).progress.learn("light");
        Object.assign(host.war, { turn: 41, clock: 30000 });

        assert.equal(cast().ok, true);
        assert.ok(host.battle.buffOf(me, "light"));
        assert.equal(host.battle.buffOf(me, "light").until - host.battle.time > 14 * 60000, true);

        host.advance(STEP_MS);
        assert.ok(host.battle.light.lit.some(([x, y, reach2]) => Math.abs(x - me.x) < 1 && Math.abs(y - me.y) < 1 && reach2 === LIGHT_REACH.globe ** 2), "its globe lights round them");

        // (Again, once it's cooled down: put out)
        for (let t = 0; t < SPELLS.light.cooldown; t += STEP_MS) {
            host.advance(STEP_MS);
        }

        assert.equal(cast().ok, true);
        assert.equal(host.battle.buffOf(me, "light"), null, "put out");
    });
});

