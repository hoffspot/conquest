// The roaming beasts' dens (client/js/core/dens.js; docs/WILDS.md *Dens*): laid out from the world
// plan in each kind's own land, clear of everything else and of each other, the trees clear round
// them; their master and a few more of its kind put out as a player comes near, let go once all
// are far, the master gone a while once it's slain and counted among the mightiest; the trails
// out of them; and a world kept from before them carried on
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homesOf } from "../client/js/app/bestiary.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { RESEARCH } from "../client/js/core/bestiary.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { DEN, denOf, DENS, densOf, denTier, denWords } from "../client/js/core/dens.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { TRAILS, trailCreature, trailsOf } from "../client/js/core/tracks.js";
import { BIOMES, CELLS, CHUNK, planWorld, SETTLEMENTS, WATER } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

describe("the roaming beasts' dens (core/dens.js)", () => {
    const plan = planWorld(2);
    const dens = densOf(plan);

    it("lays them out in each kind's own land, clear of the settlements, the sites, the camps, the roads, the water and each other", () => {
        assert.equal(densOf(plan), dens, "laid out once for a plan");
        assert.ok(dens.length >= 25, `${dens.length} dens`);

        const apart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
        const counts = {};

        for (const den of dens) {
            const k = den.cell[1] * CELLS + den.cell[0];

            counts[den.kind] = (counts[den.kind] ?? 0) + 1;
            assert.equal(den.creature, DENS[den.kind].creature);
            assert.ok(CREATURES[den.creature].biomes.includes(BIOMES[plan.biome[k]].id), `${den.id}: a ${den.creature}'s land`);
            assert.equal(plan.water[k], WATER.none);
            assert.equal(plan.road[k], 0);
            assert.ok(plan.places.every((place) => Math.hypot(den.at[0] - place.at[0], den.at[1] - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + DEN.clear), `${den.id} clear of the settlements`);
            assert.ok(plan.sites.every((site) => apart(site.cell, den.cell) >= DEN.sites));
            assert.ok(plan.camps.every((camp) => apart(camp.cell, den.cell) >= DEN.camps));
            assert.ok(dens.every((other) => other === den || apart(other.cell, den.cell) >= DEN.apart));
            assert.equal(denOf(plan, den.id), den);
        }

        for (const [kind, { count }] of Object.entries(DENS)) {
            assert.ok((counts[kind] ?? 0) <= count, kind);
            assert.ok((counts[kind] ?? 0) >= 1, `seed 2 has a ${kind}`);
        }

        assert.equal(denOf(plan, "den-0"), null);
        assert.equal(denWords(dens[0]), DENS[dens[0].kind].one);
    });

    it("has its beasts as strong as it is from a home, within their kind's tiers", () => {
        for (const den of dens) {
            const [least, most] = CREATURES[den.creature].tiers;

            for (const from of [den.at, [0, 0], [8000, 8000]]) {
                const tier = denTier(den, from);

                assert.ok(tier >= least && tier <= most, `${den.id}: ${tier}`);
            }
        }
    });

    it("keeps the trees clear round each, and wears trails out of each that its beasts made", () => {
        const overworld = buildWorld({ seed: 2 }).maps.town;

        for (const den of dens.slice(0, 6)) {
            const [cx, cy] = [Math.floor(den.at[0] / CHUNK), Math.floor(den.at[1] / CHUNK)];
            const trees = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => overworld.chunk(cx + dx, cy + dy).trees));

            assert.ok(trees.every(({ x, y }) => Math.hypot(x - den.at[0], y - den.at[1]) >= DEN.ground - 1), `${den.id}: no tree in its glade`);
        }

        const trails = trailsOf(plan).filter(({ home }) => home.kind === "den");

        assert.ok(trails.length >= dens.length, `${trails.length} trails`);
        assert.ok(new Set(trails.map(({ home }) => home.id)).size >= 0.9 * dens.length);

        for (const trail of trails) {
            const den = denOf(plan, trail.home.id);

            assert.ok(trail.k < TRAILS.den);
            assert.equal(trail.home.what, den.kind);
            assert.equal(trailCreature(plan, trail, [0, 0]), den.creature);
        }

        // (And in the bestiary, among the homes its kind keeps to)
        assert.ok(homesOf("bear").includes("the bears' dens"));
        assert.ok(homesOf("wyvern").includes("the wyverns' nests"));
    });

    it("puts out a den's master and more of its kind as a player comes near, lets them go once they're far; its master slain, gone a while, and one of the mightiest", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const player = host.players.get(HOST_PLAYER);
        const den = dens.find(({ kind }) => kind === "boars' wallow");

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        put(me, [Math.floor(den.at[0]), Math.floor(den.at[1]) + 30]);
        run(host, 1000);

        const held = host.dens.get(den.id);
        const out = held.ids.map((id) => host.wild.get(id));
        const master = held.ids.find((id) => host.wild.get(id).master);

        assert.ok(out.length >= 2 && out.every((one) => one.creature === "boar" && one.den === den.id), JSON.stringify(out));
        assert.equal(out.filter((one) => one.master).length, 1);
        const other = held.ids.find((id) => id !== master);

        assert.equal(host.wild.get(master).tier, Math.min(10, host.wild.get(other).tier + 1), "a tier up");
        assert.ok(host.battle.actor(master).maxHp > host.battle.actor(other).maxHp, "the hardier");

        // (Its master slain: gone a while, and one of the mightiest in the bestiary)
        const before = player.progress.bestiary.entry("boar").points;

        Object.assign(host.battle.actor(master), { hp: 1 });
        put(me, [Math.floor(host.battle.actor(master).x) + 1, Math.floor(host.battle.actor(master).y)]);
        host.command(HOST_PLAYER, { type: "engage", target: master });
        run(host, 4000);
        assert.ok(host.battle.actor(master)?.dead ?? !host.wild.has(master), "slain");
        assert.ok(host.slain[den.id] > host.battle.time && host.slain[den.id] <= host.battle.time + DEN.back);
        assert.ok(player.progress.bestiary.entry("boar").points - before >= RESEARCH.mighty, "one of the mightiest");

        // (Far: let go; back again before it's back: no master)
        put(me, [Math.floor(den.at[0]), Math.floor(den.at[1]) + DEN.far + 40]);
        run(host, 1000);
        assert.equal(host.dens.has(den.id), false);
        put(me, [Math.floor(den.at[0]), Math.floor(den.at[1]) + 30]);
        run(host, 1000);
        assert.ok((host.dens.get(den.id)?.ids ?? []).every((id) => !host.wild.get(id).master));
    });

    it("carries a world kept before there were dens on, none out", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const old = { ...host.snapshot(), version: 34 };

        delete old.dens;

        const stepped = SNAPSHOT_STEPS[34](structuredClone(old));

        assert.equal(stepped.version, 35);
        assert.deepEqual(stepped.dens, []);
        assert.equal(Host.restore(buildWorld({ seed: 2 }), stepped).dens.size, 0);
    });
});
