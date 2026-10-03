// Seeing at night (client/js/core/light.js, the battle's canSee, the host's light each step): less
// far in the dark, the moon's light helping; as by day round the settlements, the war camps' fires,
// fires on the ground and the soldiers' torches; the light worked out alike by every copy of the
// world from what they share
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, SIGHT, STEP_MS } from "../client/js/core/battle.js";
import { DAY, MOON_DAYS } from "../client/js/core/daytime.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { carriesTorch, LIGHT_NEAR, LIGHT_REACH, lighting, NIGHT_SIGHT, sightAt, skyLight, torchesLit } from "../client/js/core/light.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENTS } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// How long the world's been going (ms) when it's a time of day (ms from midnight) on day `day`
const at = (time, day = 1) => day * DAY.length + time - DAY.start;
const MIDNIGHT = 0;
const NOON = 29 * 60000;

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
