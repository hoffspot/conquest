// The sites the world plan puts in each people's lands, built where they stand: each people's
// castle and its own special places (the cat folk's sun temple, pride rock and watering hole, the
// orcs' war totem, skull pit and fighting pit, the elves' moonwell...), the humans' castle, abbey,
// windmill and manor, and every people's watchtowers. Each is set down clear of the roads and the
// water, facing the nearest road, and stands on its squares (no one walks through it). What's
// drawn of each is a piece, as a settlement's are (settlements.js), in its people's style (world/
// art/peoples).
//
// Pure data, no DOM; the same for the same plan.

import { GOD_IDS } from "./lore/gods.js";
import { layoutCastle } from "./setpieces/castle.js";
import { footprint } from "./setpieces/town.js";
import { LANDMARKS, PEOPLE_PLACES, PLOT, pieceCatalog, towerKey } from "./setpieces/pieces.js";
import { CELLS, CHUNK, CHUNKS, WORLD_SIZE } from "./worldplan/plan.js";

// The humans' own (plots across and deep): their castle, laid out by castle.js, and the rest as
// their landmarks are built
const HUMAN_PLACES = Object.freeze({ castle: [18, 16], abbey: LANDMARKS.church, windmill: LANDMARKS.windmill, manor: LANDMARKS.keep });
const HUMAN_LANDMARK = Object.freeze({ abbey: "church", windmill: "windmill", manor: "keep" });

// A watchtower, anyone's: two plots square
const WATCHTOWER = [2, 2];

// How far a site may be moved off its cell's middle to stand clear of the roads and the water
// (metres), in steps of
const SHIFT = 48;
const SHIFT_STEP = 4;

// How far round a site trees and the land's features keep clear of it (metres)
export const SITE_MARGIN = 6;

const TAU = Math.PI * 2;
const catalog = new Map(pieceCatalog().map((piece) => [piece.key, piece]));

/** The size (plots across and deep) of what's built at a site, or null if nothing is. */
export function siteSize(site) {
    if (site.kind === "watchtower" && site.race) {
        return WATCHTOWER;
    }

    if (site.race === "human") {
        return HUMAN_PLACES[site.kind] ?? null;
    }

    return PEOPLE_PLACES[site.race]?.[site.kind] ?? null;
}

/**
 * The sites that are built, each set down in the world the first time a chunk near it's made
 * (`settle`), as the settlements are laid out: { site, x, y (its middle, metres), facing, w, h
 * (plots), pieces ([{ ...piece, x, y (metres, in the world), site (its id) }]), squares (Set of
 * `y * WORLD_SIZE + x` it stands on), radius (how far it reaches from its middle, metres) }.
 * `landAt(x, y)` is the land a square is ({ road, water }: overworld.js's). Each site's clearing
 * (`clearings`: { at, radius }, where trees and the land's features keep off) moves to where it's
 * set down and grows to its size.
 */
export class Sites {
    constructor(plan, { landAt, clearing = 12 }) {
        this.plan = plan;
        this.landAt = landAt;
        this.set = new Map();
        this.near = new Map();
        this.byChunk = new Map();
        this.bySquare = new Set();
        this.clearings = new Map();

        for (const site of plan.sites) {
            const size = siteSize(site);

            this.clearings.set(site.id, { at: site.at, radius: clearing });

            if (!size) {
                continue;
            }

            // (Near every chunk it could reach, moved as far as it may be)
            const reach = SHIFT + Math.hypot(...size) * (PLOT / 2) + SITE_MARGIN;

            for (let cy = Math.floor((site.at[1] - reach) / CHUNK); cy <= Math.floor((site.at[1] + reach) / CHUNK); cy++) {
                for (let cx = Math.floor((site.at[0] - reach) / CHUNK); cx <= Math.floor((site.at[0] + reach) / CHUNK); cx++) {
                    if (cx >= 0 && cy >= 0 && cx < CHUNKS && cy < CHUNKS) {
                        const chunk = cy * CHUNKS + cx;

                        this.near.set(chunk, [...(this.near.get(chunk) ?? []), site]);
                    }
                }
            }
        }
    }

    /** Set down every site near a chunk (before making it). */
    settle(cx, cy) {
        for (const site of this.near.get(cy * CHUNKS + cx) ?? []) {
            if (this.set.has(site.id)) {
                continue;
            }

            const set = this.#setDown(site, siteSize(site));

            this.set.set(site.id, set);

            if (!set) {
                continue;
            }

            for (const square of set.squares) {
                this.bySquare.add(square);
            }

            const chunk = Math.floor(set.y / CHUNK) * CHUNKS + Math.floor(set.x / CHUNK);

            this.byChunk.set(chunk, [...(this.byChunk.get(chunk) ?? []), set]);
            Object.assign(this.clearings.get(site.id), { at: [set.x, set.y], radius: set.radius + SITE_MARGIN });
        }
    }

    /** What a site has on a square (metres): { blocked, opaque }, or null. */
    squareAt(x, y) {
        return this.bySquare.has(y * WORLD_SIZE + x) ? { blocked: 1, opaque: 1 } : null;
    }

    /** The pieces of the sites whose middles are in a chunk, in the world's metres (settled). */
    piecesIn(cx, cy) {
        return (this.byChunk.get(cy * CHUNKS + cx) ?? []).flatMap(({ pieces }) => pieces);
    }

    // Where a site is built: its cell's middle, or near it, clear of roads and water, facing the
    // nearest road; or null if there's nowhere
    #setDown(site, [w, h]) {
        const facing = this.#facing(site);
        const size = WORLD_SIZE;

        for (let r = 0; r <= SHIFT; r += SHIFT_STEP) {
            const tries = r === 0 ? 1 : Math.round((TAU * r) / SHIFT_STEP);

            for (let k = 0; k < tries; k++) {
                const a = (k / tries) * TAU;
                const [x, y] = [Math.round(site.at[0] + Math.cos(a) * r), Math.round(site.at[1] + Math.sin(a) * r)];
                const corners = footprint({ x, y, w, h, facing });
                const squares = inside(corners);
                // (Its land looked at every other square: no road or stream is narrower)
                const clear = ([i, j]) => i >= 0 && j >= 0 && i < size && j < size && (i % 2 || j % 2 || (!this.landAt(i, j).road && !this.landAt(i, j).water));

                if (squares.every(clear)) {
                    return {
                        site,
                        x,
                        y,
                        facing,
                        w,
                        h,
                        pieces: this.#pieces(site, x, y, facing, [w, h]),
                        squares: new Set(squares.map(([i, j]) => j * size + i)),
                        radius: Math.hypot(w, h) * (PLOT / 2),
                    };
                }
            }
        }

        return null;
    }

    // Which way a site faces: towards the nearest road within a few cells (radians, as
    // characters face: 0 south), or south
    #facing(site) {
        const [cx, cy] = site.cell;
        let best = null;

        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                const [x, y] = [cx + dx, cy + dy];

                if ((dx || dy) && x >= 0 && y >= 0 && x < CELLS && y < CELLS && this.plan.road[y * CELLS + x] && (!best || dx * dx + dy * dy < best.d)) {
                    best = { d: dx * dx + dy * dy, dx, dy };
                }
            }
        }

        return best ? Math.atan2(best.dx, best.dy) : 0;
    }

    // What's built at a site: one piece of its people's (a special place, a castle, a watchtower),
    // or the humans' castle as castle.js lays it out, or one of their landmarks
    #pieces(site, x, y, facing, [w, h]) {
        const own = { site: site.id, seed: site.seed, facing };

        if (site.kind === "watchtower") {
            return [site.race === "human" ? { ...catalog.get(towerKey("round", "roof")), ...own, key: towerKey("round", "roof"), x, y, w, h } : { kind: "tower", people: site.race, key: `tower-${site.race}`, ...own, x, y, w, h }];
        }

        if (site.race !== "human") {
            return [{ kind: "structure", people: site.race, name: site.kind, key: `structure-${site.race}-${site.kind}`, ...own, x, y, w, h }];
        }

        if (site.kind !== "castle") {
            const name = HUMAN_LANDMARK[site.kind];

            return [{ kind: "landmark", name, key: `landmark-${name}`, ...own, x, y, w, h, style: "stone", storeys: 2, patron: GOD_IDS[site.seed % GOD_IDS.length] }];
        }

        // (The humans' castle: laid out facing south, its gate to the road, then turned)
        const castle = layoutCastle({ width: w, height: h, gate: "s", seed: site.seed });
        const [c, s] = [Math.cos(facing), Math.sin(facing)];

        return castle.pieces.map((piece) => {
            const spec = catalog.get(piece.key);
            const [u, v] = [(piece.x + piece.w / 2 - w / 2) * PLOT, (piece.y + piece.h / 2 - h / 2) * PLOT];

            return { ...spec, ...piece, ...own, x: x + u * c + v * s, y: y - u * s + v * c };
        });
    }
}

// The squares whose middles are inside a turned rectangle's corners ([[x, y] x4]): [[i, j]]
function inside(corners) {
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const squares = [];

    for (let j = Math.floor(Math.min(...ys)); j < Math.ceil(Math.max(...ys)); j++) {
        for (let i = Math.floor(Math.min(...xs)); i < Math.ceil(Math.max(...xs)); i++) {
            if (within(corners, i + 0.5, j + 0.5)) {
                squares.push([i, j]);
            }
        }
    }

    return squares;
}

function within(corners, px, py) {
    let inPolygon = false;

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [[ax, ay], [bx, by]] = [corners[k], corners[last]];

        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
            inPolygon = !inPolygon;
        }
    }

    return inPolygon;
}
