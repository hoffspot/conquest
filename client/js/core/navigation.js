// Navigation meshes: where the world can be walked, as polygons (Recast and Detour, vendored in
// client/vendor), and finding ways over them. The world is cut into 32 m tiles (navigation/
// tiles.js), each baked from the ground and what stands on it (navigation/bake.js), the same bytes
// on every machine: in a worker ahead of time (world/navworker.js), or here when one's wanted and
// isn't ready. Tiles no one is near are let go of, the longest unused first.
//
// Points are the rules' ground coordinates: [x, y] (metres), or [x, y, z] with z the height.
// Detour's own polygon references never leave this file: they depend on which tiles were added,
// in what order (measured), so they're never sent or saved.

import { bakeTile, WALK } from "./navigation/bake.js";
import { COSTS, TILE } from "./navigation/settings.js";
import { tileInput } from "./navigation/tiles.js";
import { WORLD_SIZE } from "./worldplan/plan.js";

export { AGENT, AREA, TILE } from "./navigation/settings.js";

/** How many tiles are kept at once (a 1 km square), and how many polygons a tile can have. */
export const KEEP_TILES = 1024;
const MAX_POLYS = 4096;

/** How far a point may be from the mesh, each way (metres: across, and up or down), to be on it. */
const NEAR = Object.freeze({ across: 2, up: 4 });

/** The longest way found, in polygons, and its corners. */
const MAX_PATH = 512;

const key = (tx, ty) => ty * 65536 + tx;

/** The tile a ground point is in. */
export function tileOf(x, y) {
    return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

export class Navigation {
    /**
     * @param {object} recast - Recast's module (navigation/recast.js loadRecast).
     * @param {object} world - The Overworld walked on.
     */
    constructor(recast, world) {
        this.recast = recast;
        this.world = world;
        this.mesh = new recast.NavMesh();
        this.mesh.initTiled(recast.NavMeshParams.create({ orig: { x: 0, y: 0, z: 0 }, tileWidth: TILE, tileHeight: TILE, maxTiles: KEEP_TILES, maxPolys: MAX_POLYS }));
        this.query = new recast.NavMeshQuery(this.mesh, { maxNodes: 4096 });
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

        while (this.tiles.size >= KEEP_TILES) {
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

        if (tx < 0 || ty < 0 || tx * TILE >= WORLD_SIZE || ty * TILE >= WORLD_SIZE) {
            this.tiles.set(k, { tx, ty, ref: 0, data: null });

            return;
        }

        this.baked++;
        this.add(tx, ty, bakeTile(this.recast, tileInput(this.world, tx, ty), tx, ty));
    }

    /** Make sure of every tile within `reach` metres of a point. */
    around(x, y, reach) {
        const [tx0, ty0] = tileOf(x - reach, y - reach);
        const [tx1, ty1] = tileOf(x + reach, y + reach);

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                this.ensure(tx, ty);
            }
        }
    }

    // A ground point as Detour's ({ x, y: height, z }), its height the ground's if not given
    #point([x, y, z]) {
        return { x, y: z ?? this.world.heightAt(x, y), z: y };
    }

    /**
     * The way from one point to another over the mesh: its corners, [[x, y, z], ...] from `from`
     * to `to` (or as near to `to` as can be got), or [] if there's none. The tiles between them
     * (and one round) are made sure of first.
     */
    path(from, to) {
        const [tx0, ty0] = tileOf(Math.min(from[0], to[0]), Math.min(from[1], to[1]));
        const [tx1, ty1] = tileOf(Math.max(from[0], to[0]), Math.max(from[1], to[1]));

        for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
            for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
                this.ensure(tx, ty);
            }
        }

        const found = this.query.computePath(this.#point(from), this.#point(to), {
            filter: this.filter,
            halfExtents: { x: NEAR.across, y: NEAR.up, z: NEAR.across },
            maxPathPolys: MAX_PATH,
            maxStraightPathPoints: MAX_PATH,
        });

        return found.success ? found.path.map(({ x, y, z }) => [x, z, y]) : [];
    }

    /** The point on the mesh nearest a point (within NEAR), or null. */
    nearest(point) {
        this.ensure(...tileOf(point[0], point[1]));

        const found = this.query.findClosestPoint(this.#point(point), { filter: this.filter, halfExtents: { x: NEAR.across, y: NEAR.up, z: NEAR.across } });

        return found.success && found.polyRef ? [found.point.x, found.point.z, found.point.y] : null;
    }

    /**
     * Walking straight from one point towards another over the mesh: { hit (whether it runs into
     * the mesh's edge first), t (how far along: 1 if it doesn't), point (where it stops) }, or
     * null if `from` isn't on the mesh.
     */
    raycast(from, to) {
        this.ensure(...tileOf(from[0], from[1]));
        this.ensure(...tileOf(to[0], to[1]));

        const start = this.#point(from);
        const end = this.#point(to);
        const near = this.query.findNearestPoly(start, { filter: this.filter, halfExtents: { x: NEAR.across, y: NEAR.up, z: NEAR.across } });

        if (!near.success || !near.nearestRef) {
            return null;
        }

        const ray = this.query.raycast(near.nearestRef, near.nearestPoint, end, { filter: this.filter });
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
