// A dungeon's making (generated/multiplayer_scaling_plan.md 1-29). With its levels worked out
// ahead (world/layouts.js delve), the step that made a dungeon still read each level's plan into
// a floor, some 30 ms for three, and the step after it, its first level's foes finding their
// first ways, baked the floor's navigation under them: 60 to 90 ms. Neither is the simulation's:
// a floor and a tile of its mesh are the same wherever they're made. So a world server's maker
// makes them between the steps before (server/ahead.js #delve, Ahead.delving; core/insides.js
// prepare), and the step that makes the dungeon takes its floors as they are and bakes nothing.
// The world's the same step for step, with what it tells, whether they were or not.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host, SOON } from "../client/js/core/host.js";
import { dungeonFrom, dungeonLevel } from "../client/js/core/insides.js";
import { Navigation, navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { encode } from "../client/js/core/wire.js";
import { Ahead } from "../server/ahead.js";

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });

// (Stood this far from the dungeon's way in to begin with, within SOON.delve of it; brought to
// its door after this many steps; asking to go in every so many from then; played on this many
// in all; and the maker pumped this often between steps, its clock a count of its own askings)
const OFF = 100;
const COME = 40;
const ASK = 10;
const STEPS = 160;
const PUMPS = 4;

const squareOff = (world, site, off) => nearestFree(squaresOf(world.maps.town), [Math.round(site.at[0] - off), Math.round(site.at[1])], { within: 20 });

// The first of seed 2's wild dungeons with somewhere to stand OFF from its way in
function siteOf(world) {
    return world.plan.sites.find((each) => {
        if (each.kind !== "dungeon") {
            return false;
        }

        try {
            return Boolean(squareOff(world, each, OFF));
        } catch {
            return false;
        }
    });
}

// A world with one player OFF from a dungeon's way in, its levels given as the layouts' worker
// gives them (there's no worker here: what the host says it would be made as, built), played
// STEPS steps: brought to its door at COME and asking to go in from then, till they're in.
// With `ahead`, the maker makes its floors and bakes their navigation between steps; without,
// neither, as both were. Each step is kept: { sum, events, floors (tiles of floors' navigation
// baked inside the step), made (whether the dungeon was made by its end), inside }
function play({ ahead, far = false }) {
    Ahead.delving = ahead;

    const world = buildWorld({ seed: 2 });
    const site = siteOf(world);
    const host = new Host(world, { populate: false });
    const key = `site:${site.id}`;
    const building = () => world.interiors.buildings.get(key);

    host.join({ id: "p1", hero: HERO, square: squareOff(world, site, OFF), map: "town" });
    host.populate();

    const game = { world, host, site, key, building, ticks: 0, played: [], prepared: null, madeAt: -1, insideAt: -1 };
    const maker = new Ahead(world, { host, clock: () => game.ticks++ });

    game.maker = maker;

    for (let k = 0; k < STEPS; k++) {
        if (k === 1) {
            const [from] = host.soon().dungeons;

            assert.equal(from.key, key, "(the dungeon the host says is to come)");
            world.interiors.give(key, from, buildDungeon(from));
            game.given = building().given;
        }

        if (k === COME - 1) {
            game.prepared = world.interiors.prepare(key, { make: false });
            game.waiting = { floored: maker.floored.size, settled: maker.settled };
        }

        if (k === COME && far) {
            // (Gone by, not come: out of reach of it)
            host.battle.place("p1", "town", squareOff(world, site, SOON.delve + 200));
        } else if (k === COME) {
            host.battle.place("p1", "town", building().entrance.outside);
        }

        const me = host.battle.actor("p1");

        if (!far && k > COME && (k - COME) % ASK === 0 && me.map === "town" && building().made) {
            host.command("p1", { type: "enter", link: building().door.id });
        }

        const floors = Navigation.floorTiles;
        const events = host.advance(STEP_MS);
        const one = { sum: host.checksum(), events, floors: Navigation.floorTiles - floors, made: Boolean(building().made), inside: host.battle.actor("p1").map !== "town" };

        if (one.made && game.madeAt < 0) {
            game.madeAt = k;
        }

        if (one.inside && game.insideAt < 0) {
            game.insideAt = k;
        }

        for (let pump = 0; pump < PUMPS; pump++) {
            const actor = host.battle.actor("p1");

            if (actor.map === "town") {
                maker.around(actor.x, actor.y, 0);
            }

            maker.pump();
        }

        game.played.push(one);
    }

    game.snapshot = encode(host.snapshot());
    game.levels = building().maps.map((id) => world.maps[id]);
    game.flights = building().flights;
    game.awake = host.dungeons.get(site.id)?.awake.map((ids) => ids?.length ?? 0);
    maker.dispose();
    Ahead.delving = true;

    return game;
}

// A floor as plain data, to compare one made ahead with one made in its step
const plain = (map) => ({ ...map, blocked: map.blocked.map((row) => [...row]), opaque: map.opaque.map((row) => [...row]), ground: map.ground.map((row) => [...row]) });

describe("a dungeon's making (core/insides.js prepare, server/ahead.js Ahead.delving)", () => {
    let made;
    let unmade;

    before(() => {
        made = play({ ahead: true });
        unmade = play({ ahead: false });
    });

    after(() => {
        Ahead.delving = true;
    });

    it("made in its step as it was, the step after its first level's woken bakes the floor's navigation under its foes", () => {
        const { played, madeAt, insideAt, awake } = unmade;

        assert.ok(madeAt >= COME && madeAt < COME + 12, `made as the player came to its door (step ${madeAt})`);
        assert.ok(insideAt > madeAt, `(and gone into: step ${insideAt})`);
        assert.ok(awake[0] > 0 && awake[1] > 0, `(its first level's foes out, and the next's once the player's on the first: ${awake})`);
        assert.equal(unmade.prepared.maps.length, 0, "(none of its floors made ahead)");
        assert.ok(played[madeAt + 1].floors > 0, `the step after it's made bakes its first level's tiles (${played[madeAt + 1].floors})`);
    });

    it("made ahead, its floors are there before the player's at its door, their navigation baked, and no step bakes any", () => {
        const { played, prepared, waiting, given, levels, maker } = made;

        assert.ok(prepared?.done, "every floor made before the player came");
        assert.equal(prepared.maps.length, given.dungeon.levels.length);
        assert.equal(maker.delved.levels, prepared.maps.length, "(one a pump)");
        assert.equal(waiting.floored, prepared.maps.length, "each one's navigation asked for");
        assert.equal(waiting.settled, true, "and all of it in before the maker says it's settled");
        assert.ok(maker.delved.tiles > 0, `(baked here, there being no worker: ${maker.delved.tiles} tiles)`);
        assert.deepEqual(levels, prepared.maps, "the floors it's made of are those made ahead");
        levels.forEach((map, k) => assert.equal(map, prepared.maps[k], `the very floor (level ${k + 1})`));
        // (What else the steps bake is a floor's that's no dungeon's to come: the same either way)
        played.forEach(({ floors }, k) => assert.equal(floors, k === made.madeAt + 1 ? 0 : unmade.played[k].floors, `no step bakes a tile of them (step ${k})`));

        for (const map of levels) {
            const navigation = navigatorOf(map);
            const { tile } = navigation.measures;

            for (let ty = 0; ty * tile < navigation.size[1]; ty++) {
                for (let tx = 0; tx * tile < navigation.size[0]; tx++) {
                    assert.ok(navigation.has(tx, ty), `${map.id} ${tx},${ty}`);
                }
            }
        }
    });

    it("is the same world step for step either way: its sums, what it tells, its snapshot, its floors and its stairs", () => {
        assert.equal(made.madeAt, unmade.madeAt);
        assert.equal(made.insideAt, unmade.insideAt);

        made.played.forEach((step, k) => {
            assert.equal(step.sum, unmade.played[k].sum, `the sum after step ${k}`);
            assert.deepEqual(step.events, unmade.played[k].events, `what step ${k} told`);
        });

        assert.equal(made.snapshot, unmade.snapshot);
        assert.deepEqual(made.levels.map(plain), unmade.levels.map(plain), "a floor made ahead is the floor made in its step");
        assert.deepEqual(made.flights, unmade.flights);
        assert.deepEqual(made.awake, unmade.awake);
    });

    it("lets go of what it made for a dungeon its finders went by, and asks nothing of a world made without it", () => {
        const gone = play({ ahead: true, far: true });

        assert.ok(gone.prepared?.done, "(its floors made while they were near)");
        assert.equal(gone.madeAt, -1, "(never made: they went by)");
        assert.equal(gone.maker.delves.length, 0, "no longer to come");
        assert.equal(gone.maker.floored.size, 0, "its floors' navigation let go");
        assert.equal(unmade.maker.floored.size, 0, "(and with it off, none was ever asked for)");
        assert.equal(unmade.maker.delved.levels, 0);
    });

    it("takes no floor made ahead for a dungeon made as another: a mightier finder come, it's made at their tier as ever", () => {
        const sites = [buildWorld({ seed: 2 }), buildWorld({ seed: 2 })].map((world) => {
            const site = siteOf(world);

            world.maps.town.sites.heartOf(site);

            return { world, key: `site:${site.id}`, building: world.interiors.buildings.get(`site:${site.id}`) };
        });
        const [ahead, plainly] = sites;
        const from = dungeonFrom(ahead.building);

        // (Given, and its floors made, as its land would have it; then a tier stronger)
        ahead.world.interiors.give(ahead.key, from, buildDungeon(from));

        while (!ahead.world.interiors.prepare(ahead.key).done) {
            // (one more floor each asking)
        }

        const { maps } = ahead.world.interiors.prepare(ahead.key, { make: false });

        assert.equal(maps[0].id, dungeonLevel(ahead.key, from.generation, 0));

        for (const { world, key } of sites) {
            world.interiors.setTier(key, from.tier + 1);
            world.interiors.make(key);
        }

        assert.equal(ahead.building.dungeon.tier ?? from.tier + 1, plainly.building.dungeon.tier ?? from.tier + 1);
        assert.deepEqual(ahead.building.dungeon, plainly.building.dungeon, "the dungeon it's made as");
        assert.ok(!ahead.building.maps.some((id) => maps.includes(ahead.world.maps[id])), "none of the floors made ahead taken");
        assert.deepEqual(ahead.building.maps.map((id) => plain(ahead.world.maps[id])), plainly.building.maps.map((id) => plain(plainly.world.maps[id])));
        assert.equal(ahead.world.interiors.prepare(ahead.key), null, "and none's made for one made already");
    });
});
