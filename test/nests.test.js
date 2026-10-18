// The ants' nests (docs/DUNGEONS.md): at least two in each people's lands (worldplan/settle.js
// NESTS); twice the small chests other dungeons have (themes.js `chests`, dungeons/place.js); and
// the remains of the adventurers who died in them, many of them, each searched once for what was
// left on them (themes.js `fallen`, play.js FALLEN, host.js #openDungeonChest)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { TIERS } from "../client/js/core/creatures.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { FALLEN, rollFallen } from "../client/js/core/dungeons/play.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { NEST } from "../client/js/core/dungeons/layouts.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CHEST_GOLD } from "../client/js/core/places.js";
import { createRandom } from "../client/js/core/random.js";
import { CELLS, planWorld, RACES } from "../client/js/core/worldplan/plan.js";
import { NESTS } from "../client/js/core/worldplan/settle.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms, me = null) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        if (me) {
            me.hp = me.maxHp;
        }

        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// Through a door: stood where one comes off it on this side, told to go through, and played on
// till they've crossed (or a minute's gone): whether they did
function cross(host, me, link) {
    const end = link.ends.find(({ map }) => map === me.map);

    put(me, end.arrive);
    host.command(HOST_PLAYER, { type: "enter", link: link.id });

    for (let t = 0; t < 60000; t += 250) {
        if (run(host, 250, me).some(({ type, id }) => type === "cross" && id === HOST_PLAYER)) {
            return true;
        }
    }

    return false;
}

describe("the ants' nests in the world (worldplan/settle.js NESTS)", () => {
    it("has at least two in each people's lands, named as nests are, none named as another dungeon is", () => {
        for (const seed of [1, 2]) {
            const plan = planWorld(seed);
            const dungeons = plan.sites.filter(({ kind }) => kind === "dungeon");

            RACES.forEach((race, r) => {
                const nests = dungeons.filter(({ theme, cell: [x, y] }) => theme === "nest" && plan.territory[y * CELLS + x] === r + 1);

                assert.ok(nests.length >= NESTS.least, `${seed}: ${race.id} has ${nests.length}`);
            });

            assert.equal(new Set(dungeons.map(({ name }) => name)).size, dungeons.length, "each named its own");
            assert.ok(dungeons.every(({ name }) => typeof name === "string" && name.length > 3));
        }
    });
});

describe("what's to be had in an ants' nest (dungeons/place.js, play.js)", () => {
    it("has twice the small chests other dungeons have, and its fallen to search where they lie; other themes none", () => {
        let nestChests = 0;
        let nestLevels = 0;
        let fallen = 0;

        assert.equal(THEMES.nest.chests, 2);
        assert.equal(THEMES.nest.fallen, true);

        for (let seed = 1; seed <= 12; seed++) {
            for (const level of buildDungeon({ seed, theme: "nest", tier: 5 }).levels) {
                const small = level.chests.filter(({ kind }) => kind === "small");
                const remains = level.chests.filter(({ kind }) => kind === "remains");
                // (Every one of the fallen the plan has, searchable where it lies)
                const lying = level.rows.flatMap((row, y) => [...row].flatMap((char, x) => (char === "i" ? [`${x},${y}`] : [])));

                assert.ok(small.length <= 8, `${small.length} small chests`);
                assert.deepEqual(remains.map(({ at }) => at.join(",")).sort(), lying.sort());
                assert.equal(new Set(level.chests.map(({ id }) => id)).size, level.chests.length, "each chest its own");
                nestChests += small.length;
                nestLevels += 1;
                fallen += remains.length;
            }

            for (const theme of ["caves", "hideout", "ancient"]) {
                for (const level of buildDungeon({ seed, theme, tier: 5 }).levels) {
                    assert.ok(level.chests.filter(({ kind }) => kind === "small").length <= 4);
                    assert.ok(!level.chests.some(({ kind }) => kind === "remains"), theme);
                }
            }
        }

        assert.ok(nestChests / nestLevels >= 4, `${nestChests / nestLevels} small chests a level`);
        assert.ok(fallen / nestLevels >= 6, `${fallen / nestLevels} of the fallen a level`);
    });

    it("leaves a few coins on each of the fallen, more each tier, and now and then a piece of their gear, a draught or a cure for poison", () => {
        const random = createRandom(5);
        const found = { gear: 0, potion: 0, antidote: 0 };

        for (let k = 0; k < 400; k++) {
            const tier = 1 + (k % TIERS);
            const { gold, items } = rollFallen(tier, random);
            const scale = 1 + CHEST_GOLD * (tier - 1);

            assert.ok(gold >= Math.round(FALLEN.gold[0] * scale) && gold <= Math.round(FALLEN.gold[1] * scale), `${gold} at tier ${tier}`);
            assert.ok(items.length <= 3);

            for (const { id } of items) {
                found[id === "potion" || id === "antidote" ? id : "gear"] += 1;
            }
        }

        assert.ok(found.gear > 40 && found.gear < 130, JSON.stringify(found));
        assert.ok(found.potion > 40 && found.antidote > 25, JSON.stringify(found));
    });
});

describe("searching the fallen in an ants' nest (host.js #openDungeonChest)", () => {
    let world;
    let host;
    let me;
    let site;
    let building;

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        me = host.battle.actor(HOST_PLAYER);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        // (The nearest ants' nest to where the player starts)
        const [sx, sy] = world.start.at;

        site = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme === "nest").sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))[0];
        world.maps.town.sites.heartOf(site);
        put(me, world.maps.town.sites.set.get(site.id).entrance.outside);
        run(host, 1500, me);
        building = world.interiors.buildings.get(`site:${site.id}`);
    });

    it("sets them out with its first level, each to be searched once, for a share for whoever's by them", () => {
        const level = building.dungeon.levels[0];
        const lying = [...host.ground.values()].filter(({ dungeon, remains, map }) => dungeon === site.id && remains && map === building.maps[0]);

        assert.equal(lying.length, level.chests.filter(({ kind }) => kind === "remains").length);
        assert.ok(lying.length > 0);
        assert.ok(lying.every(({ chest, locked, hoard }) => chest && !locked && !hoard));

        assert.ok(cross(host, me, building.door));

        const one = lying[0];

        put(me, [one.square[0], one.square[1] + 1]);
        assert.ok(host.command(HOST_PLAYER, { type: "pickUp", ground: one.id }).ok);

        const events = run(host, 250, me);
        const share = events.find(({ type, from }) => type === "spoils" && from === one.id);

        assert.equal(share.creature, "remains");
        assert.equal(share.dungeon, site.id);

        const left = host.ground.get(share.ground);

        assert.equal(left.from, "remains");
        assert.equal(left.for, HOST_PLAYER);
        assert.ok(left.bundle.gold > 0);
        assert.ok(host.dungeons.get(site.id).opened.includes(one.coffer));

        // (Searched once: gone, and nothing more to be had of it)
        assert.equal(host.ground.has(one.id), false);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: one.id }).ok, false);
    });
});

describe("an ants' nest dug as ants dig (dungeons/layouts.js nest)", () => {
    it("winds a gallery up from its mouth, stretch by stretch, chambers off it on stalks, middens kept to the upper levels, brood the bottom's, the queen's chamber a dead end at the far end", () => {
        const counts = { middens: [0, 0, 0], brood: [0, 0, 0], larders: [0, 0, 0], chambers: [0, 0, 0] };

        assert.equal(THEMES.nest.layout, "nest");

        for (let seed = 1; seed <= 12; seed++) {
            const dungeon = buildDungeon({ seed, theme: "nest", tier: 4, levels: 3 });

            dungeon.levels.forEach((level, depth) => {
                const kinds = new Map(level.rooms.map(({ id, kind }) => [id, kind]));
                const linked = (id) => level.links.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
                const galleries = level.rooms.filter(({ kind }) => kind === "gallery");

                // (Its mouth, a gallery of two stretches or more, each joined to the next, and
                // chambers off them)
                assert.equal(level.rooms.filter(({ kind }) => kind === "mouth").length, 1);
                assert.ok(galleries.length >= 2, `${seed}/${depth}: ${galleries.length} stretches`);
                assert.ok(galleries.every(({ id }) => linked(id).some((other) => ["gallery", "mouth"].includes(kinds.get(other)))), `${seed}/${depth}: a stretch on its own`);

                for (const { kind } of level.rooms) {
                    const band = depth === 0 ? 0 : depth === 2 ? 2 : 1;

                    counts.middens[band] += kind === "midden" ? 1 : 0;
                    counts.brood[band] += kind === "brood" ? 1 : 0;
                    counts.larders[band] += kind === "larder" ? 1 : 0;
                    counts.chambers[band] += ["midden", "brood", "larder", "nook"].includes(kind) ? 1 : 0;
                }

                // (The queen's chamber on the bottom level only, the way to it its one way in)
                const queen = level.rooms.filter(({ kind }) => kind === "arena");

                assert.equal(queen.length, depth === 2 ? 1 : 0);

                if (queen.length) {
                    assert.equal(linked(queen[0].id).length, 1, `${seed}: the queen's chamber has more than one way in`);
                    assert.equal(level.path.at(-1), queen[0].id);
                }
            });
        }

        // (Middens near the top, none at the bottom; brood at the bottom, none at the top;
        // larders between)
        assert.ok(counts.middens[0] > 0 && counts.middens[2] === 0, JSON.stringify(counts));
        assert.ok(counts.brood[2] > counts.larders[2] && counts.brood[0] === 0, JSON.stringify(counts));
        assert.ok(counts.larders[1] > counts.brood[1], JSON.stringify(counts));

        // (Smaller and further apart the deeper: fewer chambers a level)
        assert.ok(counts.chambers[0] > counts.chambers[2], JSON.stringify(counts));
        assert.ok(NEST.size[0][0] > NEST.size[2][0] && NEST.apart[0][0] < NEST.apart[2][0]);
    });
});
