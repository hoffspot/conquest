// Navigation meshes: where the world can be walked, as polygons (Recast and Detour, vendored in
// client/vendor), and finding ways over them. The world is cut into 32 m tiles (navigation/
// tiles.js), each baked from the ground and what stands on it (navigation/bake.js), the same bytes
// on every machine: in a worker ahead of time (world/navworker.js), or here when one's wanted and
// isn't ready. Tiles no one is near are let go of, the longest unused first. A map of squares on
// its own (a building's floor, a test's rows) has a mesh of its own, baked from its squares
// (navigation/squares.js) in finer voxels, a tile at a time as it's wanted: navigatorOf. Its
// tiles too can be baked in the worker before its mesh is made (bakedAhead: a building's floors
// as it's got ready), and are taken then, not baked.
//
// Points are the rules' ground coordinates: [x, y] (metres), or [x, y, z] with z the height.
// Detour's own polygon references never leave this file: they depend on which tiles were added,
// in what order (measured), so they're never sent or saved.
//
// Recast is loaded before anything here is used (this module waits for it), so the rules can find
// ways without waiting.

import { hypot } from "./exact.js";
import { squaresOf } from "./grid.js";
import { bakeTile, WALK } from "./navigation/bake.js";
import { loadRecast } from "./navigation/recast.js";
import { COSTS, OVERWORLD, ROOMS, SCENES, TILE } from "./navigation/settings.js";
import { squaresInput } from "./navigation/squares.js";
import { tileInput } from "./navigation/tiles.js";
import { walkInput } from "./navigation/walk.js";
import { Steps } from "./steps.js";
import { WORLD_SIZE } from "./worldplan/plan.js";

export { AGENT, AREA, OVERWORLD, ROOMS, TILE } from "./navigation/settings.js";

const recast = await loadRecast();

/**
 * How many tiles are kept at once (the overworld's: a 1 km square; a map of squares': 64, a 128 m
 * square), and how many polygons a tile can have.
 */
export const KEEP_TILES = 1024;
const KEEP_ROOM_TILES = 64;
const MAX_POLYS = 4096;

/**
 * How many tiles the overworld's mesh can be told to keep (keepTiles: a world server's, with more
 * players apart than KEEP_TILES are enough for, server/ahead.js), and how many polygons a tile of
 * it can have. Detour's references are 32 bits, ten of them kept for telling a tile from the one
 * that was in its place before, so a mesh's tiles times a tile's polygons can be 4,194,304 at
 * most: 1,024 tiles of 4,096 polygons, or 4,096 of 1,024. A tile of the overworld's has 40
 * polygons on average and 335 at most among 15,000 measured, in and round the towns of two
 * worlds. Which a mesh is made for changes its references alone, which never leave this file:
 * the tiles' bytes, and every way found over them, are the same (test/navigation.test.js, test/
 * tilecap.test.js). A tile costs 6.4 KB on average, and only while it's kept.
 */
export const MOST_TILES = 4096;
export const OVERWORLD_POLYS = 1024;

/**
 * How many maps of squares keep their meshes at once (the longest unused let go of first): enough
 * for the buildings round one player in a browser; a world server, with players in several towns
 * at once, keeps more (keepRooms), or their insides' meshes would be let go of and baked again
 * in its steps over and over.
 */
export const KEEP_ROOMS = 16;

let keptRooms = KEEP_ROOMS;

/** Keep the meshes of `most` maps of squares at once (KEEP_ROOMS, to begin with). */
export function keepRooms(most) {
    keptRooms = Math.max(1, Math.floor(most));
}

/** How far a point may be from the mesh, each way (metres: across, and up or down), to be on it. */
const NEAR = Object.freeze({ across: 2, up: 4 });

/** The longest way found, in polygons, and its corners; and how many polygons are searched. */
const MAX_PATH = 1024;
const MAX_NODES = 8192;

/**
 * How far round a way's ends the tiles are made sure of before it's looked for (metres); how many
 * rings of tiles round them after, as it falls short; and the most tiles that's taken to.
 */
export const MARGIN = 4;
const WIDER = [1, 3];
const MOST_COVERED = 100;

/**
 * The most tiles a way may be asked across, or a line walked over the mesh (path, raycast): the
 * box between its ends, MARGIN round it. Asked across more, there's no way, and nothing's baked
 * or made for it, whoever asks: a hero stands where they are, as before a wall with no way
 * round. Every tile in that box is made sure of before the way's looked for, and the world's
 * chunks under them made first, in the step that asks or as a player's command is heard, so
 * with no most a way asked for across the world was minutes of one step (the plan's 1-25: one
 * `enter` for a door 7.5 km off, over six minutes).
 *
 * 256: sixteen tiles by sixteen, a box 512 m a side. As many as a scene's whole mesh keeps
 * (settings.js SCENES.keep), so any way across a scene's map or a building's floor is still
 * found, and a quarter of what the overworld's keeps at the least (KEEP_TILES), so one way
 * never lets go of more than a quarter of the tiles round the players. The most the game asks
 * across today is 110: an `ahead` order's line, 400 m on a slant (core/battle.js AHEAD). Of
 * the 141,098 ways looked for by the 122 test files of the host, the battle and the navigation,
 * the longest was across 40 tiles, 234 m, but for 5 tests' `enter`s for doors 660 to 790 m
 * off (110 to 330 tiles); of the 27,296 looked for by the load's runs (walk, fights, invasion,
 * battle, dungeons, war turn and night at 8 players; walk at 25), across 30, 217 m. The same
 * on every copy: it goes by the two ends and the map's size, never by what's baked.
 */
export const MOST_ASKED = 256;

const key = (tx, ty) => ty * 65536 + tx;

/** How many polygons a baked tile has (bakeTile's bytes: Detour's header, its seventh number). */
export function polygonsOf(data) {
    return data[24] | (data[25] << 8) | (data[26] << 16) | (data[27] << 24);
}

/** The tile a ground point is in. */
export function tileOf(x, y) {
    return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

// The meshes of the maps walked on (by map), and the order the maps of squares were last used in
const navigators = new WeakMap();
const rooms = new Set();

// The tiles of small maps (a building's floors, a scene's) baked ahead of need, off the page's
// thread (bakedAhead), by map: each by its key, Detour's data or null, till the map's mesh wants
// it (ensure takes it, baking none) or the map's forgotten (forgetAhead)
const aheads = new WeakMap();

/**
 * The navigation mesh of a map (a battle's: the Overworld, or a map of squares on its own), made
 * the first time it's wanted. Only a few maps of squares keep theirs at once: the one longest
 * unused is let go of (its tiles baked again, the same, if it's wanted again).
 */
export function navigatorOf(map) {
    let navigation = navigators.get(map);

    if (!navigation) {
        navigation = map.ground?.heightAt && map.chunkAt ? new Navigation(recast, map) : map.walk ? walkNavigation(map) : squaresNavigation(map);
        navigation.ready = aheads.get(map) ?? null;
        // (One of a dungeon's levels' own, not a sealed room's: counted apart, Navigation.levelTiles)
        navigation.level = Boolean(map.dungeon && !map.dungeon.vault);
        navigators.set(map, navigation);
    }

    if (navigation.measures === ROOMS) {
        rooms.delete(map);
        rooms.add(map);

        while (rooms.size > keptRooms) {
            const oldest = rooms.values().next().value;

            rooms.delete(oldest);
            navigators.get(oldest)?.dispose();
            navigators.delete(oldest);
        }
    }

    return navigation;
}

/**
 * Let go of a map's mesh, if it has one (a game over: what Detour holds for it is in the
 * WebAssembly's memory, which isn't given back on its own).
 */
export function releaseNavigation(map) {
    navigators.get(map)?.dispose();
    navigators.delete(map);
    rooms.delete(map);
}

/**
 * Let go of a map's tiles over a box of its squares ([x0, y0, x1, y1]), and a little round it, if
 * it has a mesh: each made again from its squares as it's next wanted (what stands there changed:
 * a fortification gone up or come down, core/overworld.js setForts). Each is marked changed, so
 * one being baked elsewhere meanwhile, from what stood there before, isn't taken (changed).
 */
export function dropTiles(map, [x0, y0, x1, y1]) {
    const navigation = navigators.get(map);

    if (!navigation?.drop) {
        return;
    }

    const [tx0, ty0] = navigation.tileOf(x0 - 2, y0 - 2);
    const [tx1, ty1] = navigation.tileOf(x1 + 3, y1 + 3);

    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            navigation.drop(tx, ty);
            navigation.changes.set(key(tx, ty), navigation.changed(tx, ty) + 1);
        }
    }
}

/**
 * What a small map's mesh is made with (a fixed scene's, or a map of squares on its own; null for
 * the Overworld): { squares, measures, input (a tile's triangles, (tx, ty)), heightAt, size }. For
 * its mesh (navigatorOf), and for baking its tiles ahead of it elsewhere (world/navbaker.js floor).
 */
export function floorOf(map) {
    if (map.ground?.heightAt && map.chunkAt) {
        return null;
    }

    const squares = squaresOf(map);

    if (map.walk) {
        return { squares, measures: SCENES, input: (tx, ty) => walkInput(map.walk, tx, ty, SCENES), heightAt: (x, y) => map.heightAt(x, y), size: [map.width, map.height] };
    }

    return { squares, measures: ROOMS, input: (tx, ty) => squaresInput(squares, tx, ty, ROOMS), heightAt: () => 0, size: [squares.width, squares.height] };
}

/**
 * A mesh of its own for a fixed scene's map (core/scenery.js sceneryMap: settings.js SCENES), baked
 * from its walk's floors at their heights; a way's points' heights the floor's (its heightAt).
 */
export function walkNavigation(map) {
    const floor = floorOf(map);

    return new Navigation(recast, floor.squares, floor);
}

/** A mesh of its own for a map of squares (grid.js squaresOf's: settings.js ROOMS). */
export function squaresNavigation(map) {
    const floor = floorOf(map);

    return new Navigation(recast, floor.squares, floor);
}

/**
 * A tile of a small map's (floorOf), baked ahead of need off the page's thread (`data`: bakeTile's
 * for its triangles, the same bytes as its mesh would bake; null with nothing to walk): added to
 * the map's mesh if it has one, else kept till it has, when its mesh takes it for the asking, not
 * baking it (ensure). Let go of with the map (forgetAhead).
 */
export function bakedAhead(map, tx, ty, data) {
    const navigation = navigators.get(map);

    if (navigation) {
        navigation.add(tx, ty, data);

        return;
    }

    let ahead = aheads.get(map);

    if (!ahead) {
        ahead = new Map();
        aheads.set(map, ahead);
    }

    ahead.set(key(tx, ty), data);
}

/** Whether a small map's tile is still to be baked: neither in its mesh, if it has one, nor baked ahead. */
export function floorWants(map, tx, ty) {
    return !navigators.get(map)?.has(tx, ty) && !aheads.get(map)?.has(key(tx, ty));
}

/** Let go of what was baked ahead for a map and not taken yet (its building let go of: core/host.js close). */
export function forgetAhead(map) {
    aheads.get(map)?.clear();
}

export class Navigation {
    /**
     * @param {object} recast - Recast's module (navigation/recast.js loadRecast).
     * @param {object} world - The Overworld walked on (or the squares, for a map of them).
     * @param {object} [kind] - Another kind of mesh: its measures (settings.js), each tile's
     *     triangles (`input(tx, ty)`, as tiles.js tileInput's), the floor's height at a point, and
     *     the map's size ([width, height], metres).
     */
    constructor(recast, world, { measures = OVERWORLD, input = (tx, ty) => tileInput(world, tx, ty), heightAt = (x, y) => world.heightAt(x, y), size = [WORLD_SIZE, WORLD_SIZE] } = {}) {
        const tile = measures.tile;

        this.recast = recast;
        this.world = world;
        this.measures = measures;
        this.input = input;
        this.heightAt = heightAt;
        this.size = size;
        this.keep = measures.keep ?? (measures === OVERWORLD ? KEEP_TILES : KEEP_ROOM_TILES);

        // How many tiles it keeps at the least and can be told to keep at the most (keepTiles),
        // and how many polygons a tile of it can have: the overworld's more tiles of fewer
        // polygons (MOST_TILES), every other mesh's as many as it keeps
        const roomy = measures === OVERWORLD && Navigation.roomy;

        this.least = this.keep;
        this.most = roomy ? Math.max(MOST_TILES, this.keep) : this.keep;

        /**
         * Whether, holding more tiles than it's to keep (keepTiles told fewer), it lets go of one
         * for each added and no more, the rest let go a few at a time by whoever tells it to
         * (shed: server/ahead.js); or of all it has over that as the next is added, as it does
         * with no one to tell it.
         */
        this.gently = false;
        this.polys = roomy ? OVERWORLD_POLYS : MAX_POLYS;
        this.mesh = new recast.NavMesh();

        // (Detour takes a copy of the mesh's params: they're let go of at once, not left for good)
        const params = recast.NavMeshParams.create({ orig: { x: 0, y: 0, z: 0 }, tileWidth: tile, tileHeight: tile, maxTiles: this.most, maxPolys: this.polys });

        this.mesh.initTiled(params);
        recast.Raw.destroy(params.raw);
        this.filter = new recast.QueryFilter();
        this.filter.includeFlags = WALK;
        this.filter.excludeFlags = 0;

        for (const [area, cost] of Object.entries(COSTS)) {
            this.filter.setAreaCost(Number(area), cost);
        }

        // (The query's own filter this one, which every asking names anyway: it would make
        // another, never used and never let go of)
        this.query = new recast.NavMeshQuery(this.mesh, { maxNodes: MAX_NODES, defaultQueryFilter: this.filter });

        // What Detour answers the nearest point into (nearestIn), kept for every asking: the
        // wrapper's own findClosestPoint makes and destroys the three each time, six calls into
        // Recast an asking, and the battle asks eight times for one step aside
        this.answer = { ref: new recast.Raw.UnsignedIntRef(), point: new recast.Raw.Vec3(), over: new recast.Raw.BoolRef() };

        // The tiles in the mesh, by key: { tx, ty, ref (Detour's, or 0 for one with nothing to
        // walk) }, the most recently used last. (Not their data: the mesh has its own copy, and a
        // second kept here was 10 KB a tile no one read, 10 MB of a full overworld's.)
        this.tiles = new Map();
        this.baked = 0;
        this.added = 0;

        /**
         * How many times a tile's been put in or taken out (add, drop; all of them, dispose),
         * and what that was as each tile in the mesh went in, by key (`since`): an answer
         * remembered of the mesh (stands) is good only while every tile round its point went
         * in before it was given.
         */
        this.edits = 0;
        this.since = new Map();

        /** How many ways and lines it's given up on, asked across more than MOST_ASKED tiles. */
        this.tooFar = 0;

        // How often each tile's been let go of for what stands on it having changed (dropTiles),
        // by key
        this.changes = new Map();

        /**
         * Tiles baked ahead of this mesh, by key (navigatorOf gives a small map's: bakedAhead),
         * each taken the first time it's wanted (ensure), not baked here; or null.
         */
        this.ready = null;

        /** Whether it's been let go of (dispose): nothing more is added to it. */
        this.disposed = false;

        /**
         * Where a tile not in yet goes when a way's to wait for it (path's `wait`): to be baked off
         * the page's thread ((tx, ty) => void: the game's NavBaker want), or null to bake it here
         * and now.
         */
        this.later = null;

        /**
         * Whether the tiles further round a way that falls short (path: WIDER) are only sent on
         * to be made (later), even for a way that's not to wait: a world server's (server/
         * ahead.js), whose players' surroundings are made ahead, and whose steps no one's way
         * should hold up making tiles beyond them. The way as far as it goes is walked meanwhile,
         * and looked for on from there.
         */
        this.widenLater = false;
    }

    /**
     * Whether the overworld's mesh is made to take MOST_TILES tiles of OVERWORLD_POLYS polygons,
     * as it always is, or KEEP_TILES of 4,096 as it was: only for the tests that check every way
     * comes out the same either way.
     */
    static roomy = true;

    /**
     * Whether a way or a line asked across more than MOST_ASKED tiles is given up on, as it
     * always is, or looked for however far it is, as it was: only for the tests that compare
     * the two.
     */
    static bounded = true;

    /**
     * How many tiles of small maps' meshes (a building's floors, a dungeon's levels, a scene's)
     * have been baked here and now (ensure), in all: for whoever measures what the steps bake
     * for themselves (scripts/load.js). Nothing reads it but they. And how many of those were
     * a dungeon's levels' (`levelTiles`): a building's floor is baked here or ahead by when its
     * folk first walk it, a dungeon's level only if it wasn't made ahead.
     */
    static floorTiles = 0;
    static levelTiles = 0;

    /** Whether a tile is in. */
    has(tx, ty) {
        return this.tiles.has(key(tx, ty));
    }

    /**
     * Keep `tiles` tiles at once from now on: never fewer than it kept to begin with, nor more
     * than its mesh was made to take (most). Told fewer than it has, it lets go of the longest
     * unused as the next is added: all it has over that, there and then; or, `gently`, one for
     * each added, and the rest as it's told to (shed).
     */
    keepTiles(tiles) {
        this.keep = Math.max(this.least, Math.min(this.most, Math.floor(tiles)));
    }

    /**
     * Let go of the tiles longest unused that it has over what it's to keep (keepTiles), `most`
     * of them at the most: for whoever has it let them go a few at a time between the world's
     * steps (server/ahead.js), where the next tile added, in a step as likely as not, let go of
     * them all. Returns how many it let go.
     */
    shed(most) {
        let shed = 0;

        while (shed < most && this.tiles.size > this.keep) {
            this.drop(...tileXY(this.tiles.keys().next().value));
            shed++;
        }

        return shed;
    }

    /**
     * Count a tile as used just now, if it's in: one someone's standing by, which no way has
     * crossed for a while, isn't let go of before those no one's near.
     */
    hold(tx, ty) {
        const k = key(tx, ty);
        const tile = this.tiles.get(k);

        if (tile) {
            this.tiles.delete(k);
            this.tiles.set(k, tile);
        }
    }

    /**
     * How often a tile's been let go of for what stands on it having changed (dropTiles): a tile
     * baked elsewhere is taken only if this is as it was when its triangles were worked out
     * (world/navbaker.js), or it would be the ground as it was, added after it was let go of.
     */
    changed(tx, ty) {
        return this.changes.get(key(tx, ty)) ?? 0;
    }

    /** Add a tile's baked data (bakeTile's, or null for one with nothing to walk), if it's not in. */
    add(tx, ty, data) {
        const k = key(tx, ty);

        // (In already; or the mesh let go of while the tile was being baked elsewhere)
        if (this.tiles.has(k) || this.disposed) {
            return;
        }

        while (this.tiles.size >= this.keep) {
            this.drop(...tileXY(this.tiles.keys().next().value));

            // (No more than the one it takes the place of: the rest are shed)
            if (this.gently) {
                break;
            }
        }

        let ref = 0;

        // (More polygons than the mesh's references can tell apart: Detour doesn't check, and
        // would take the tile and answer with other tiles' polygons. The same on every machine,
        // as the tile's bytes are)
        if (data && polygonsOf(data) > this.polys) {
            throw new Error(`Tile ${tx}, ${ty} has ${polygonsOf(data)} polygons, and the mesh takes ${this.polys} a tile`);
        }

        if (data) {
            const raw = new this.recast.UnsignedCharArray();

            raw.copy(data);

            const added = this.mesh.addTile(raw, this.recast.Detour.DT_TILE_FREE_DATA, 0);

            if (!this.recast.statusSucceed(added.status)) {
                raw.destroy();
                throw new Error(`Detour wouldn't take tile ${tx}, ${ty}: ${this.recast.statusToReadableString(added.status)}`);
            }

            // (The mesh owns its data once it's in, and frees it with the tile: the array that
            // carried it there is let go of as one that only looks at it, which frees none of
            // it. Left, an array's wrapper stayed for good for every tile ever added.)
            raw.raw.isView = true;
            raw.destroy();
            ref = added.tileRef;
        }

        this.edits++;
        this.tiles.set(k, { tx, ty, ref });
        this.since.set(k, this.edits);
        this.added++;
    }

    /** Let go of a tile. */
    drop(tx, ty) {
        const k = key(tx, ty);
        const tile = this.tiles.get(k);

        if (tile) {
            if (tile.ref) {
                this.mesh.removeTile(tile.ref);
            }

            this.tiles.delete(k);
            this.since.delete(k);
            this.edits++;
        }
    }

    /** Bake a tile here and now (as the worker would), if it's not in. */
    ensure(tx, ty) {
        const k = key(tx, ty);
        const tile = this.tiles.get(k);

        if (tile) {
            // (Most recently used last)
            this.tiles.delete(k);
            this.tiles.set(k, tile);

            return;
        }

        // (Off the map's edge: nothing, and nothing kept)
        if (!this.#inside(tx, ty)) {
            return;
        }

        // (Baked ahead of the mesh, elsewhere: taken, the same bytes as baking it here gives)
        if (this.ready?.has(k)) {
            const data = this.ready.get(k);

            this.ready.delete(k);
            this.add(tx, ty, data);

            return;
        }

        this.baked++;
        Navigation.floorTiles += this.measures === OVERWORLD ? 0 : 1;
        Navigation.levelTiles += this.level ? 1 : 0;
        this.add(tx, ty, bakeTile(this.recast, this.input(tx, ty), tx, ty, this.measures));
    }

    // Whether a tile is on the map
    #inside(tx, ty) {
        const side = this.measures.tile;

        return tx >= 0 && ty >= 0 && tx * side < this.size[0] && ty * side < this.size[1];
    }

    // How many tiles of the map a box of the ground touches
    #tilesIn(x0, y0, x1, y1) {
        const [tx0, ty0] = this.tileOf(Math.max(0, x0), Math.max(0, y0));
        const [tx1, ty1] = this.tileOf(Math.min(this.size[0] - 1, x1), Math.min(this.size[1] - 1, y1));

        return Math.max(0, tx1 - tx0 + 1) * Math.max(0, ty1 - ty0 + 1);
    }

    // Whether a box of the ground touches more of the map's tiles than anything's looked for
    // across (MOST_ASKED), counted if so: nothing's made sure of for it
    #beyond(x0, y0, x1, y1) {
        if (!Navigation.bounded || this.#tilesIn(x0, y0, x1, y1) <= MOST_ASKED) {
            return false;
        }

        this.tooFar++;

        return true;
    }

    /** The tile a ground point is in. */
    tileOf(x, y) {
        const { tile } = this.measures;

        return [Math.floor(x / tile), Math.floor(y / tile)];
    }

    /** Make sure of every tile within `reach` metres of a point. */
    around(x, y, reach) {
        const [tx0, ty0] = this.tileOf(x - reach, y - reach);
        const [tx1, ty1] = this.tileOf(x + reach, y + reach);

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                this.ensure(tx, ty);
            }
        }
    }

    // A ground point as Detour's ({ x, y: height, z }), its height the ground's if not given
    #point([x, y, z]) {
        return { x, y: z ?? this.heightAt(x, y), z: y };
    }

    // Looking over the tiles made already only (madeOnly): none made here, whatever's asked
    #unmade = false;

    /**
     * Whether every tile a box of the ground touches is made already (or the mesh is a room's or
     * a scene's, small, made as it's walked). Asked before a way's looked for that mustn't make
     * any (a joined game's forecast of its own hero: core/battle.js fork).
     */
    made(x0, y0, x1, y1) {
        if (this.measures !== OVERWORLD) {
            return true;
        }

        const [tx0, ty0] = this.tileOf(Math.min(x0, x1), Math.min(y0, y1));
        const [tx1, ty1] = this.tileOf(Math.max(x0, x1), Math.max(y0, y1));

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                if (!this.tiles.has(key(tx, ty)) && this.#inside(tx, ty)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * What `look` finds (a path or a raycast of this mesh's) over the tiles made already only, none
     * made for it, however far it'd look (a room's made as ever): never holding up the frame.
     */
    madeOnly(look) {
        const was = this.#unmade;

        this.#unmade = this.measures !== ROOMS;

        try {
            return look();
        } finally {
            this.#unmade = was;
        }
    }

    // Make sure of every tile a box of the ground touches (and `ring` tiles round it); or, to
    // `wait` for them (with somewhere to send them: later), send on those not in. Returns whether
    // any were sent on (or, looking over those made only, left out)
    #cover(x0, y0, x1, y1, ring = 0, wait = false) {
        const [tx0, ty0] = this.tileOf(Math.min(x0, x1), Math.min(y0, y1));
        const [tx1, ty1] = this.tileOf(Math.max(x0, x1), Math.max(y0, y1));
        let sent = false;

        for (let ty = ty0 - ring; ty <= ty1 + ring; ty++) {
            for (let tx = tx0 - ring; tx <= tx1 + ring; tx++) {
                if (this.#unmade && !this.tiles.has(key(tx, ty))) {
                    sent = true;
                } else if (wait && this.later && !this.tiles.has(key(tx, ty)) && this.#inside(tx, ty)) {
                    this.later(tx, ty);
                    sent = true;
                } else {
                    this.ensure(tx, ty);
                }
            }
        }

        return sent;
    }

    // The polygon nearest a point, within NEAR (a box `across` metres each way, if given):
    // { ref, point } (Detour's), or null
    #nearestPoly(point, across = NEAR.across) {
        const found = this.query.findNearestPoly(this.#point(point), { filter: this.filter, halfExtents: { x: across, y: NEAR.up, z: across } });

        return found.success && found.nearestRef ? { ref: found.nearestRef, point: found.nearestPoint } : null;
    }

    /**
     * The way from one point to another over the mesh: its corners, [[x, y, z], ...] from `from`
     * (or the nearest point on the mesh to it) to `to` (or as near to `to` as can be got), or []
     * if there's none. The tiles between them (a few metres round) are made sure of first; if
     * the way doesn't get there, the tiles round those too, and it's looked for again (a way
     * round something further out: making tiles far from anyone is dear, the world under them
     * made first). To `wait` (with somewhere to send them: later), the tiles not in yet aren't
     * made here but sent on, and there's no way till they're in ([]: looked for again a moment
     * later, core/battle.js REPATH_MS), so it never holds up the frame it's looked for in.
     * Asked across more tiles than MOST_ASKED, there's none, and nothing's made for it.
     */
    path(from, to, { wait = false } = {}) {
        const [baked, start] = [this.baked, performance.now()];
        const way = this.#path(from, to, wait);
        const ms = performance.now() - start;

        // (Tiles baked here and now for it, slowly: told to the debug log, as work done a step at
        // a time is: steps.js Steps.slow)
        if (this.baked > baked && ms > Steps.SLOW) {
            Steps.slow?.(`baking ${this.baked - baked} navigation tiles for a way ${Math.round(hypot(to[0] - from[0], to[1] - from[1]))} m long`, ms);
        }

        return way;
    }

    // (path's way, found)
    #path(from, to, wait) {
        const [x0, y0, x1, y1] = [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.max(from[0], to[0]), Math.max(from[1], to[1])];
        const [tx0, ty0] = this.tileOf(x0, y0);
        const [tx1, ty1] = this.tileOf(x1, y1);
        const { tile } = this.measures;

        // (Further than any way's looked for: none, and none of its tiles made or sent on)
        if (this.#beyond(x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN)) {
            return [];
        }

        const sent = this.#cover(x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN, 0, wait);

        // (Tiles still to come: none till they're in)
        if (sent) {
            return [];
        }

        let way = this.#way(from, to);

        // (Short of it: the tiles further round too, a ring and then three, as long as that's
        // not too many to make, nor more than half what the mesh keeps: a river's ford or a pass
        // can be well off the straight way. A long way's widened across more than along)
        const [across, along] = [tx1 - tx0 + 1, ty1 - ty0 + 1];

        for (const ring of WIDER) {
            const end = way.at(-1);
            const [rx, ry] = [across > 2 * along ? Math.min(ring, 1) : ring, along > 2 * across ? Math.min(ring, 1) : ring];
            const box = [x0 - rx * tile, y0 - ry * tile, x1 + rx * tile, y1 + ry * tile];

            if ((end && hypot(end[0] - to[0], end[1] - to[1]) <= NEAR.across) || this.#tilesIn(...box) > Math.min(MOST_COVERED, this.keep / 2)) {
                break;
            }

            const before = this.added;

            // (Tiles round it still to come: the way as it is, for now, looked for further again
            // once they're in)
            if (this.#cover(...box, 0, wait || this.widenLater)) {
                break;
            }

            if (this.added !== before) {
                way = this.#way(from, to);
            }
        }

        return way;
    }

    /**
     * The way from one point to another over the tiles in already, none baked for it (path's
     * corners, or [] if there's none over them): for what's only drawn (the way to the world
     * map's pin), never stalling a frame to bake a tile.
     */
    wayIn(from, to) {
        return this.#way(from, to);
    }

    // The way over the tiles in already (path)
    #way(from, to) {
        const start = this.#nearestPoly(from);
        const end = this.#nearestPoly(to);

        if (!start || !end) {
            return [];
        }

        const found = this.query.findPath(start.ref, end.ref, start.point, end.point, { filter: this.filter, maxPathPolys: MAX_PATH });

        try {
            if (!this.recast.statusSucceed(found.status) || found.polys.size === 0) {
                return [];
            }

            // (Not all the way: as near as the last polygon it got to comes)
            const last = found.polys.get(found.polys.size - 1);
            let goal = end.point;

            if (last !== end.ref) {
                const closest = this.query.closestPointOnPoly(last, end.point);

                if (!closest.success) {
                    return [];
                }

                goal = closest.closestPoint;
            }

            const straight = this.query.findStraightPath(start.point, goal, found.polys, { maxStraightPathPoints: MAX_PATH });

            try {
                const corners = [];

                for (let i = 0; straight.success && i < straight.straightPathCount; i++) {
                    corners.push([straight.straightPath.get(i * 3), straight.straightPath.get(i * 3 + 2), straight.straightPath.get(i * 3 + 1)]);
                }

                return corners;
            } finally {
                straight.straightPath.destroy();
                straight.straightPathFlags.destroy();
                straight.straightPathRefs.destroy();
            }
        } finally {
            found.polys.destroy();
        }
    }

    /** The point on the mesh nearest a point (within `across` metres of it each way: NEAR's), or null. */
    nearest(point, across = NEAR.across) {
        this.#cover(point[0] - across, point[1] - across, point[0] + across, point[1] + across);

        return this.nearestIn(point, across);
    }

    /**
     * The point on the mesh nearest a point, over the tiles in already (none baked for it), or
     * null: for what's only drawn, as wayIn.
     */
    nearestIn(point, across = NEAR.across) {
        const [x, y, z] = point;
        const { ref, point: at, over } = this.answer;

        // (Detour's own call, as the wrapper's findClosestPoint makes it, with the same numbers:
        // the answer's the same. Where it finds nothing it leaves what it last answered, and
        // says it failed)
        const status = this.query.raw.findClosestPoint([x, z ?? this.heightAt(x, y), y], [across, NEAR.up, across], this.filter.raw, ref, at, over);

        return this.recast.statusSucceed(status) && ref.value ? [at.x, at.z, at.y] : null;
    }

    /**
     * Walking straight from one point towards another over the mesh: { hit (whether it runs into
     * the mesh's edge first), t (how far along: 1 if it doesn't), point (where it stops) }, or
     * null if `from` isn't on the mesh, or the line's across more tiles than MOST_ASKED (none
     * made for it: the longest the battle walks is AHEAD, well within).
     */
    raycast(from, to) {
        if (this.#beyond(Math.min(from[0], to[0]) - NEAR.across, Math.min(from[1], to[1]) - NEAR.across, Math.max(from[0], to[0]) + NEAR.across, Math.max(from[1], to[1]) + NEAR.across)) {
            return null;
        }

        this.#cover(from[0] - NEAR.across, from[1] - NEAR.across, to[0], to[1]);
        this.#cover(from[0], from[1], to[0] + NEAR.across, to[1] + NEAR.across);

        const near = this.#nearestPoly(from);

        if (!near) {
            return null;
        }

        const ray = this.query.raycast(near.ref, near.point, this.#point(to), { filter: this.filter });
        const t = ray.t > 1 ? 1 : ray.t;
        const [x, y] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];

        return { hit: ray.t <= 1, t, point: [x, y] };
    }

    /** Whether someone can stand at a ground point (the mesh under it, within a few centimetres). */
    walkable(x, y) {
        const found = this.nearest([x, y]);

        return Boolean(found) && Math.abs(found[0] - x) < 0.05 && Math.abs(found[1] - y) < 0.05;
    }

    /**
     * `walkable`, remembered in `memo` (standing(): whoever asks keeps one for each thing it asks
     * about): asked again of the same point while none of the tiles round it has been put in
     * since (the count of tiles put in or taken out, `edits`, is kept for each tile as it was
     * when it went in, `since`, and by the memo as it was when the mesh answered), the answer
     * it gave is given again, and neither the ground's height nor Detour is asked
     * (`memo.asked` says whether they were). The tiles round the point are made sure of either way, in the order
     * any asking makes sure of them (nearest's: #cover), so each is counted as used just when it
     * would be, one let go is baked again there and then, and which are let go of later is as it
     * was; and one put in for it, or since the mesh last answered, has the mesh asked. Looking
     * over the tiles made already only (madeOnly), nothing's remembered.
     */
    stands(x, y, memo) {
        const { tile: side } = this.measures;
        const tx1 = Math.floor((x + NEAR.across) / side);
        const ty1 = Math.floor((y + NEAR.across) / side);
        let newest = this.#unmade ? Infinity : 0;

        for (let ty = Math.floor((y - NEAR.across) / side); ty <= ty1; ty++) {
            for (let tx = Math.floor((x - NEAR.across) / side); tx <= tx1; tx++) {
                const k = key(tx, ty);
                const tile = this.tiles.get(k);

                if (tile) {
                    // (In: used just now, as ensure counts it)
                    this.tiles.delete(k);
                    this.tiles.set(k, tile);
                    newest = Math.max(newest, this.since.get(k));
                } else if (!this.#unmade) {
                    this.ensure(tx, ty);
                    newest = Math.max(newest, this.since.get(k) ?? 0);
                }
            }
        }

        if (memo.mesh === this && memo.x === x && memo.y === y && newest <= memo.edits) {
            memo.asked = false;

            return memo.on;
        }

        const found = this.nearestIn([x, y]);
        const on = Boolean(found) && Math.abs(found[0] - x) < 0.05 && Math.abs(found[1] - y) < 0.05;

        memo.mesh = this.#unmade ? null : this;
        memo.x = x;
        memo.y = y;
        memo.edits = this.edits;
        memo.on = on;
        memo.asked = true;

        return on;
    }

    /** Let go of the mesh and everything Detour holds for it. */
    dispose() {
        if (this.disposed) {
            return;
        }

        // (The query's own, then what carries it: the binder's wrapper and its few bytes, which
        // the query's destroy leaves)
        this.query.destroy();
        this.recast.Raw.destroy(this.query.raw);
        this.recast.Raw.destroy(this.filter.raw);

        for (const each of Object.values(this.answer)) {
            this.recast.Raw.destroy(each);
        }

        this.mesh.destroy();
        this.tiles.clear();
        this.since.clear();
        this.edits++;
        this.disposed = true;
    }

    /**
     * A tile's polygons, to draw (the debug view): { positions (Float32Array: x, height, y each,
     * three a triangle), areas (Uint8Array: AREA, one a triangle), edges (Float32Array: each edge
     * of the mesh against a wall or a drop, rather than more of it, as its ends (x, height, y
     * each) and which way is out of it (x, y): eight a side), sides (Uint8Array: each edge's
     * polygon's AREA) }, or null if it has none.
     */
    polygons(tx, ty) {
        const tile = this.tiles.get(key(tx, ty));

        if (!tile?.ref) {
            return null;
        }

        const mesh = this.mesh.getTileAt(tx, ty, 0);
        const header = mesh.header();
        const positions = [];
        const areas = [];
        const edges = [];
        const sides = [];

        // (Each polygon's detail triangles, at the ground's height: their corners the polygon's
        // own first, then the detail mesh's)
        for (let p = 0; p < header.polyCount(); p++) {
            const poly = mesh.polys(p);
            const detail = mesh.detailMeshes(p);
            const own = poly.vertCount();
            const corner = (v) => {
                if (v < own) {
                    const at = poly.verts(v) * 3;

                    return [mesh.verts(at), mesh.verts(at + 1), mesh.verts(at + 2)];
                }

                const at = (detail.vertBase() + v - own) * 3;

                return [mesh.detailVerts(at), mesh.detailVerts(at + 1), mesh.detailVerts(at + 2)];
            };

            for (let t = 0; t < detail.triCount(); t++) {
                const at = (detail.triBase() + t) * 4;

                positions.push(...corner(mesh.detailTris(at)), ...corner(mesh.detailTris(at + 1)), ...corner(mesh.detailTris(at + 2)));
                areas.push(poly.areaAndType() & 0x3f);
            }

            // (Its edges with nothing beyond: neither another polygon of the tile's, nor one of
            // the next tile's over its side, DT_EXT_LINK; out of it away from its middle)
            const corners = Array.from({ length: own }, (_, v) => corner(v));
            const [mx, mz] = [corners.reduce((sum, [x]) => sum + x, 0) / own, corners.reduce((sum, [, , z]) => sum + z, 0) / own];

            for (let v = 0; v < own; v++) {
                if (poly.neis(v) !== 0) {
                    continue;
                }

                const [a, b] = [corners[v], corners[(v + 1) % own]];
                const length = hypot(b[0] - a[0], b[2] - a[2]) || 1;
                let [nx, nz] = [(b[2] - a[2]) / length, -(b[0] - a[0]) / length];

                if (nx * ((a[0] + b[0]) / 2 - mx) + nz * ((a[2] + b[2]) / 2 - mz) < 0) {
                    [nx, nz] = [-nx, -nz];
                }

                edges.push(...a, ...b, nx, nz);
                sides.push(poly.areaAndType() & 0x3f);
            }
        }

        return { positions: Float32Array.from(positions), areas: Uint8Array.from(areas), edges: Float32Array.from(edges), sides: Uint8Array.from(sides) };
    }
}

/** An answer of a mesh's to be remembered (Navigation stands), nothing in it yet. */
export function standing() {
    return { mesh: null, x: 0, y: 0, edits: 0, on: false, asked: false };
}

// A tile's key back to its (tx, ty)
function tileXY(k) {
    return [k % 65536, Math.floor(k / 65536)];
}
