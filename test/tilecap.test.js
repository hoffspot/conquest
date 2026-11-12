// How many of the navigation's tiles a world keeps (client/js/core/navigation.js MOST_TILES,
// keepTiles, hold; server/ahead.js; generated/multiplayer_scaling_plan.md 1-15): the overworld's
// mesh is made to take 4,096 tiles of 1,024 polygons where it took 1,024 of 4,096, a world server
// has it keep as many as its players want round them, and nothing a step works out changes for
// it: the same ways over a mesh made either way, and the same world step for step whether its
// mesh is made the old way or the new. (How many it keeps is each machine's own, as it always
// was: a browser's mesh and a world server's never held the same tiles, and a joined copy takes
// the host's ways, core/netplay.js.)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host, MUSTER } from "../client/js/core/host.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { KEEP_TILES, MOST_TILES, Navigation, navigatorOf, OVERWORLD_POLYS, polygonsOf, TILE } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { encode } from "../client/js/core/wire.js";
import { layoutOf } from "../scripts/load.js";
import { AHEAD, Ahead } from "../server/ahead.js";
import { installWorkers } from "../server/workers.js";

installWorkers();

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });
const TOWN = "human-city-1";

// A mesh of a world's overworld made as it was (1,024 tiles of 4,096 polygons) or as it is
function meshOf(recast, overworld, roomy) {
    const was = Navigation.roomy;

    Navigation.roomy = roomy;

    try {
        return new Navigation(recast, overworld);
    } finally {
        Navigation.roomy = was;
    }
}

describe("how many navigation tiles a world keeps (core/navigation.js MOST_TILES, server/ahead.js)", () => {
    let recast;
    let world;
    let overworld;
    let place;
    let old;
    let roomy;

    before(async () => {
        recast = await loadRecast();
        world = buildWorld({ seed: 2 });
        overworld = world.maps.town;
        place = world.plan.places.find(({ id }) => id === TOWN);
        old = meshOf(recast, overworld, false);
        roomy = meshOf(recast, overworld, true);
    });

    it("makes the overworld's mesh for four times the tiles of a quarter the polygons, and no other mesh's", () => {
        assert.deepEqual([old.most, old.polys, old.keep], [KEEP_TILES, 4096, KEEP_TILES]);
        assert.deepEqual([roomy.most, roomy.polys, roomy.keep], [MOST_TILES, OVERWORLD_POLYS, KEEP_TILES], "as many kept as ever, till it's told more");
        assert.equal(MOST_TILES * OVERWORLD_POLYS, 1 << 22, "Detour's 32 bits, less the 10 that tell a tile from the one before it");

        const room = navigatorOf({ blocked: Array.from({ length: 8 }, () => Array(8).fill(false)) });

        assert.deepEqual([room.most, room.polys], [room.keep, 4096]);
    });

    it("finds the same ways and the same nearest points over a mesh made either way", () => {
        const [x, y] = place.at;
        const random = createRandom(11);
        const at = () => [x + (random.next() - 0.5) * 150, y + (random.next() - 0.5) * 150];
        let found = 0;
        let corners = 0;

        for (const mesh of [old, roomy]) {
            mesh.around(x, y, 80);
        }

        assert.equal(roomy.tiles.size, old.tiles.size);
        assert.ok(roomy.tiles.size >= 25);

        for (let k = 0; k < 300; k++) {
            const [from, to] = [at(), at()];
            const way = roomy.wayIn(from, to);

            assert.deepEqual(way, old.wayIn(from, to), `from ${from} to ${to}`);
            assert.deepEqual(roomy.nearestIn(to), old.nearestIn(to));
            found += way.length > 0 ? 1 : 0;
            corners += way.length;
        }

        assert.ok(found > 150 && corners > 4 * found, `(${found} ways of 300 found, ${corners} corners: round the town's buildings)`);
    });

    it("takes 4,096 tiles when it's told to keep them, never more, and never fewer than it kept to begin with", () => {
        const mesh = meshOf(recast, overworld, true);
        const [tx, ty] = old.tileOf(...place.at);
        let data = null;

        // (A tile of the town's, as it's baked, set down again and again elsewhere: its place is
        // its header's third and fourth numbers)
        mesh.add = ((add) => (...tile) => ((data ??= tile[2]), add(...tile)))(mesh.add.bind(mesh));
        mesh.ensure(tx, ty);
        assert.ok(data && polygonsOf(data) > 0 && polygonsOf(data) <= OVERWORLD_POLYS, "(a tile with something to walk)");
        mesh.drop(tx, ty);

        const stamped = (sx, sy) => {
            const copy = Uint8Array.from(data);
            const view = new DataView(copy.buffer);

            view.setInt32(8, sx, true);
            view.setInt32(12, sy, true);

            return copy;
        };

        mesh.keepTiles(1e9);
        assert.equal(mesh.keep, MOST_TILES);

        for (let k = 0; k <= MOST_TILES; k++) {
            mesh.add((k % 100) * 2, Math.floor(k / 100) * 2, stamped((k % 100) * 2, Math.floor(k / 100) * 2));
        }

        assert.equal(mesh.tiles.size, MOST_TILES, "Detour took every one");
        assert.equal(mesh.has(0, 0), false, "the longest unused let go for the one more");
        assert.equal(mesh.has(2, 0), true);

        mesh.keepTiles(10);
        assert.equal(mesh.keep, KEEP_TILES);
        mesh.add(1, 1, null);
        assert.equal(mesh.tiles.size, KEEP_TILES, "told fewer: let go of as the next is added");

        // (A tile with more polygons than the mesh's references can tell apart is refused, here
        // as on every machine, not taken and answered for wrongly)
        const many = stamped(1, 3);

        new DataView(many.buffer).setInt32(24, OVERWORLD_POLYS + 1, true);
        assert.throws(() => mesh.add(1, 3, many), /Tile 1, 3 has 1025 polygons, and the mesh takes 1024 a tile/);
        mesh.dispose();
    });

    it("counts a tile held as used just now, so the next let go of is one no one's standing by", () => {
        const mesh = meshOf(recast, overworld, true);

        for (let k = 0; k < KEEP_TILES; k++) {
            mesh.add(k % 200, Math.floor(k / 200), null);
        }

        mesh.hold(0, 0);
        mesh.hold(999, 999);
        mesh.add(250, 250, null);
        assert.deepEqual([mesh.has(0, 0), mesh.has(1, 0), mesh.has(999, 999), mesh.tiles.size], [true, false, false, KEEP_TILES]);
        mesh.dispose();
    });

    it("has a world server's mesh keep the tiles round all its players and some to spare, and bakes less far round each when they'd be more than it takes", () => {
        const fresh = buildWorld({ seed: 2 });
        const places = (players) => layoutOf(fresh.plan, players, "spread").map(({ at }) => at);
        const host = { lookAt: 0, open: new Map(), around: places(25), soon: () => ({ around: host.around, boxes: [], dungeons: [] }) };
        const ahead = new Ahead(fresh, { host });
        const mesh = ahead.navBaker.navigation;
        const look = (around) => {
            host.around = around;
            host.lookAt++;
            ahead.pump();
        };
        const within = (reach) => new Set(host.around.flatMap(([x, y]) => {
            const tiles = [];

            for (let ty = Math.floor((y - reach) / TILE); ty <= Math.floor((y + reach) / TILE); ty++) {
                for (let tx = Math.floor((x - reach) / TILE); tx <= Math.floor((x + reach) / TILE); tx++) {
                    tiles.push(ty * 65536 + tx);
                }
            }

            return tiles;
        })).size;

        try {
            assert.equal(mesh.keep, KEEP_TILES);

            // (25 apart: 121 each, all kept, which 1,024 never could)
            look(places(25));
            assert.deepEqual([ahead.reach, ahead.tiles, mesh.keep], [AHEAD.reach, 25 * 121, 25 * 121 + AHEAD.spareTiles]);

            // (100 apart want 12,100: more than the mesh takes, so less far round each)
            look(places(100));
            assert.ok(ahead.reach < AHEAD.reach && ahead.reach >= TILE, `${ahead.reach} m`);
            assert.equal(ahead.tiles, within(ahead.reach));
            assert.ok(ahead.tiles + AHEAD.spareTiles <= MOST_TILES && within(ahead.reach + TILE) + AHEAD.spareTiles > MOST_TILES, "as far as there's room for, and no further");
            assert.equal(mesh.keep, ahead.tiles + AHEAD.spareTiles);

            const [x, y] = host.around[0];

            ahead.around(x, y, 96);
            assert.ok(ahead.navBaker.queue.every(([tx, ty]) => Math.abs((tx + 0.5) * TILE - x) <= ahead.reach + TILE && Math.abs((ty + 0.5) * TILE - y) <= ahead.reach + TILE), "none asked for further out");

            // (Most of them gone: as far round each as ever, asked for again, and as many kept
            // as they want; never fewer than a browser's)
            look(places(8));
            assert.deepEqual([ahead.reach, ahead.tiles, mesh.keep], [AHEAD.reach, within(AHEAD.reach), Math.max(KEEP_TILES, within(AHEAD.reach) + AHEAD.spareTiles)]);
            assert.ok(ahead.navBaker.queue.length + ahead.navBaker.asked.size > 8 * 100, "the tiles further round each asked for");
            look([]);
            assert.deepEqual([ahead.tiles, mesh.keep], [0, KEEP_TILES]);
        } finally {
            ahead.dispose();
        }
    });

    it("plays the same world step for step whether the mesh is made the old way or the new", () => {
        // A player walked into a city from outside its muster, its soldiers and townsfolk coming
        // out and going about: every step's events and the world's checksum after it
        const walk = (made) => {
            const game = buildWorld({ seed: 2 });
            const town = game.maps.town;
            const city = game.plan.places.find(({ id }) => id === TOWN);
            const edge = SETTLEMENT_KINDS[city.kind].radius;
            const at = (off) => nearestFree(squaresOf(town), [Math.round(city.at[0] - edge - off), Math.round(city.at[1])], { within: 40 });
            const was = Navigation.roomy;

            Navigation.roomy = made;

            const mesh = navigatorOf(town);

            Navigation.roomy = was;

            const host = new Host(game, { populate: false });
            const played = [];

            host.join({ id: "p1", hero: HERO, square: at(MUSTER.near - 10), map: "town" });
            host.populate();

            for (const off of [20, -30, -60]) {
                for (let k = 0; k < 40; k++) {
                    played.push([encode(host.advance(STEP_MS)), host.checksum()]);
                }

                host.battle.place("p1", "town", at(off));
            }

            return { played, mesh, host };
        };
        const [before, after] = [walk(false), walk(true)];

        assert.deepEqual([before.mesh.polys, before.mesh.most, after.mesh.polys, after.mesh.most], [4096, KEEP_TILES, OVERWORLD_POLYS, MOST_TILES]);
        assert.ok(before.mesh.baked > 4 && before.mesh.baked <= KEEP_TILES, `(${before.mesh.baked} tiles baked by its ways, none let go)`);
        assert.equal(after.mesh.baked, before.mesh.baked);
        assert.ok(before.played.some(([events]) => events.includes("muster")), "(the city's soldiers came out)");

        for (let k = 0; k < before.played.length; k++) {
            assert.deepEqual(after.played[k], before.played[k], `step ${k}`);
        }

        assert.equal(encode(after.host.snapshot()), encode(before.host.snapshot()));
    });
});
