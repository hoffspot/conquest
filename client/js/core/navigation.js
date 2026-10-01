// Navigation meshes: where the world can be walked, as polygons (Recast and Detour, vendored in
// client/vendor), and finding ways over them. The world is cut into 32 m tiles (navigation/
// tiles.js), each baked from the ground and what stands on it (navigation/bake.js), the same bytes
// on every machine: in a worker ahead of time (world/navworker.js), or here when one's wanted and
// isn't ready. Tiles no one is near are let go of, the longest unused first. A map of squares on
// its own (a building's floor, a test's rows) has a mesh of its own, baked from its squares
// (navigation/squares.js) in finer voxels, a tile at a time as it's wanted: navigatorOf.
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
import { COSTS, OVERWORLD, ROOMS, TILE } from "./navigation/settings.js";
import { squaresInput } from "./navigation/squares.js";
import { tileInput } from "./navigation/tiles.js";
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

/** How many maps of squares keep their meshes at once (the longest unused let go of first). */
const KEEP_ROOMS = 16;

/** How far a point may be from the mesh, each way (metres: across, and up or down), to be on it. */
const NEAR = Object.freeze({ across: 2, up: 4 });

/** The longest way found, in polygons, and its corners; and how many polygons are searched. */
const MAX_PATH = 1024;
const MAX_NODES = 8192;

/**
 * How far round a way's ends the tiles are made sure of before it's looked for (metres); how many
 * rings of tiles round them after, as it falls short; and the most tiles that's taken to.
 */
const MARGIN = 4;
const WIDER = [1, 3];
const MOST_COVERED = 100;

const key = (tx, ty) => ty * 65536 + tx;

/** The tile a ground point is in. */
export function tileOf(x, y) {
    return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

// The meshes of the maps walked on (by map), and the order the maps of squares were last used in
const navigators = new WeakMap();
const rooms = new Set();

/**
 * The navigation mesh of a map (a battle's: the Overworld, or a map of squares on its own), made
 * the first time it's wanted. Only a few maps of squares keep theirs at once: the one longest
 * unused is let go of (its tiles baked again, the same, if it's wanted again).
 */
export function navigatorOf(map) {
    let navigation = navigators.get(map);

    if (!navigation) {
        navigation = map.ground?.heightAt && map.chunkAt ? new Navigation(recast, map) : squaresNavigation(map);
        navigators.set(map, navigation);
    }

    if (navigation.measures === ROOMS) {
        rooms.delete(map);
        rooms.add(map);

        while (rooms.size > KEEP_ROOMS) {
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

/** A mesh of its own for a map of squares (grid.js squaresOf's: settings.js ROOMS). */
export function squaresNavigation(map) {
    const squares = squaresOf(map);

    return new Navigation(recast, squares, { measures: ROOMS, input: (tx, ty) => squaresInput(squares, tx, ty, ROOMS), heightAt: () => 0, size: [squares.width, squares.height] });
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
        this.keep = measures === OVERWORLD ? KEEP_TILES : KEEP_ROOM_TILES;
        this.mesh = new recast.NavMesh();
        this.mesh.initTiled(recast.NavMeshParams.create({ orig: { x: 0, y: 0, z: 0 }, tileWidth: tile, tileHeight: tile, maxTiles: this.keep, maxPolys: MAX_POLYS }));
        this.query = new recast.NavMeshQuery(this.mesh, { maxNodes: MAX_NODES });
        this.filter = new recast.QueryFilter();
        this.filter.includeFlags = WALK;
        this.filter.excludeFlags = 0;

        for (const [area, cost] of Object.entries(COSTS)) {
            this.filter.setAreaCost(Number(area), cost);
        }

        // The tiles in the mesh, by key: { tx, ty, ref (Detour's, or 0 for one with nothing to
        // walk), data }, the most recently used last
        this.tiles = new Map();
        this.baked = 0;
        this.added = 0;
    }

    /** Whether a tile is in. */
    has(tx, ty) {
        return this.tiles.has(key(tx, ty));
    }

    /** Add a tile's baked data (bakeTile's, or null for one with nothing to walk), if it's not in. */
    add(tx, ty, data) {
        const k = key(tx, ty);

        if (this.tiles.has(k)) {
            return;
        }

        while (this.tiles.size >= this.keep) {
            this.drop(...tileXY(this.tiles.keys().next().value));
        }

        let ref = 0;

        if (data) {
            const raw = new this.recast.UnsignedCharArray();

            raw.copy(data);

            const added = this.mesh.addTile(raw, this.recast.Detour.DT_TILE_FREE_DATA, 0);

            // (The mesh owns its data once it's in)
            if (!this.recast.statusSucceed(added.status)) {
                raw.destroy();
                throw new Error(`Detour wouldn't take tile ${tx}, ${ty}: ${this.recast.statusToReadableString(added.status)}`);
            }

            ref = added.tileRef;
        }

        this.tiles.set(k, { tx, ty, ref, data });
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

        this.baked++;
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

    // Make sure of every tile a box of the ground touches (and `ring` tiles round it)
    #cover(x0, y0, x1, y1, ring = 0) {
        const [tx0, ty0] = this.tileOf(Math.min(x0, x1), Math.min(y0, y1));
        const [tx1, ty1] = this.tileOf(Math.max(x0, x1), Math.max(y0, y1));

        for (let ty = ty0 - ring; ty <= ty1 + ring; ty++) {
            for (let tx = tx0 - ring; tx <= tx1 + ring; tx++) {
                this.ensure(tx, ty);
            }
        }
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
     * made first).
     */
    path(from, to) {
        const [x0, y0, x1, y1] = [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.max(from[0], to[0]), Math.max(from[1], to[1])];
        const [tx0, ty0] = this.tileOf(x0, y0);
        const [tx1, ty1] = this.tileOf(x1, y1);
        const { tile } = this.measures;

        this.#cover(x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN);

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

            this.#cover(...box);

            if (this.added !== before) {
                way = this.#way(from, to);
            }
        }

        return way;
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

        const found = this.query.findClosestPoint(this.#point(point), { filter: this.filter, halfExtents: { x: across, y: NEAR.up, z: across } });

        return found.success && found.polyRef ? [found.point.x, found.point.z, found.point.y] : null;
    }

    /**
     * Walking straight from one point towards another over the mesh: { hit (whether it runs into
     * the mesh's edge first), t (how far along: 1 if it doesn't), point (where it stops) }, or
     * null if `from` isn't on the mesh.
     */
    raycast(from, to) {
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

    /** Let go of the mesh and everything Detour holds for it. */
    dispose() {
        this.query.destroy();
        this.recast.Raw.destroy(this.filter.raw);
        this.mesh.destroy();
        this.tiles.clear();
    }

    /**
     * A tile's polygons, to draw (the debug view): { positions (Float32Array: x, height, y each,
     * three a triangle), areas (Uint8Array: AREA, one a triangle) }, or null if it has none.
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
        }

        return { positions: Float32Array.from(positions), areas: Uint8Array.from(areas) };
    }
}

// A tile's key back to its (tx, ty)
function tileXY(k) {
    return [k % 65536, Math.floor(k / 65536)];
}
