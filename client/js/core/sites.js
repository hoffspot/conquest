// The sites the world plan puts in each people's lands, built where they stand: each people's
// castle and its own special places (the cat folk's sun temple, pride rock and watering hole, the
// orcs' war totem, skull pit and fighting pit, the elves' moonwell...), the humans' castle, abbey,
// windmill and manor, and every people's watchtowers; and the sites no people builds, out in the
// wild and among them (the ruins, caves, shrines, circles of standing stones, ruined castles, the
// dragon's lair and the watchtowers no one keeps: setpieces/neutral.js). Each is set down clear of
// the roads and the water, facing the nearest road, and stands on its squares (no one walks
// through it): all of them for a people's, just what stands in the way for the rest (between a
// circle's stones, into a ruined castle's courtyard). What's drawn of each is a piece, as a
// settlement's are (settlements.js), in its people's style (world/art/peoples), or the neutral
// sites' (world/art/kits/neutral.js).
//
// Pure data, no DOM; the same for the same plan.

import { GOD_IDS } from "./lore/gods.js";
import { CITADEL, citadelLevel, citadelParts, insideCitadel, layoutCitadel, outlineOf } from "./setpieces/citadel.js";
import { footprint } from "./setpieces/town.js";
import { extentOf, layoutNeutral, NEUTRAL } from "./setpieces/neutral.js";
import { LANDMARKS, PEOPLE_PLACES, PLOT, pieceCatalog, towerKey } from "./setpieces/pieces.js";
import { CELLS, CHUNK, CHUNKS, WORLD_SIZE } from "./worldplan/plan.js";
import { atan2, cos, hypot, PI, sin } from "./exact.js";
import { heightAt, HEIGHT_STEP } from "./terrain/height.js";

// The humans' own (plots across and deep): their castle, a hill citadel laid out by citadel.js
// (as wide as its outer ward and its towers, at the most), and the rest as their landmarks are
// built
const HUMAN_PLACES = Object.freeze({ castle: [40, 40], abbey: LANDMARKS.church, windmill: LANDMARKS.windmill, manor: LANDMARKS.keep });

// Is a site the humans' castle, built as a hill citadel (setpieces/citadel.js)?
const isCitadel = (site) => site.race === "human" && site.kind === "castle";
const HUMAN_LANDMARK = Object.freeze({ abbey: "church", windmill: "windmill", manor: "keep" });

// A watchtower, anyone's: two plots square
const WATCHTOWER = [2, 2];

// How far a site may be moved off its cell's middle to stand clear of the roads and the water
// (metres), in steps of
const SHIFT = 48;
const SHIFT_STEP = 4;

// How far round a site trees and the land's features keep clear of it (metres)
export const SITE_MARGIN = 6;

/**
 * Where some sites would rather stand, of the spots they may: on the highest ground round about
 * (each people's castle, watching over its lands; the dark elves' spire and the elves' starwatch;
 * the cat folk's pride rock; the watchtowers) or the lowest (the cat folk's watering hole, the
 * lizard folk's serpent pool, the elves' moonwell), the land's own height looked at (height.js);
 * and how far their ground's raised on a mound above the land's (or sunk into it), metres.
 */
export const LIE = Object.freeze({
    castle: { lie: "high", raise: 4 },
    "obsidian spire": { lie: "high", raise: 5 },
    starwatch: { lie: "high", raise: 3 },
    "pride rock": { lie: "high", raise: 4 },
    watchtower: { lie: "high", raise: 2 },
    "watering hole": { lie: "low", raise: -1.5 },
    "serpent pool": { lie: "low", raise: -1.2 },
    moonwell: { lie: "low", raise: -0.8 },
});

/**
 * Lie: how far a site that would rather lie high or low may be moved off its cell's middle to
 * (metres); how far apart the spots tried are, and the land's looked at on a lattice how far
 * apart (metres); how far round a spot its land's looked at to see how it lies (metres past its
 * own reach); and how far its land may rise or fall across it (metres), at most, for it to stand
 * there (or its pad would stand out of the land, or into it).
 */
const LYING = Object.freeze({ shift: 64, step: 16, lattice: 8, round: 24, across: 6 });

const TAU = Math.PI * 2;
const catalog = new Map(pieceCatalog().map((piece) => [piece.key, piece]));

/** The size (plots across and deep) of what's built at a site, or null if nothing is. */
export function siteSize(site) {
    if (site.kind === "watchtower" && site.race) {
        return WATCHTOWER;
    }

    return ownPlace(site) ?? NEUTRAL[site.kind] ?? null;
}

// A people's own place's size (a castle, a special place), if the site is one
const ownPlace = (site) => (site.race === "human" ? HUMAN_PLACES[site.kind] : PEOPLE_PLACES[site.race]?.[site.kind]) ?? null;

/** Is a site one no people builds (setpieces/neutral.js), laid out as the neutral sites are? */
export const isNeutral = (site) => !ownPlace(site) && !(site.kind === "watchtower" && site.race) && Boolean(NEUTRAL[site.kind]);

/**
 * Where the sites no people keeps rest: on their plan's spot if its land rises or falls no more
 * than `gentle` metres across them; else the flattest spot within `shift` metres (tried `step`
 * apart), the nearest of those as flat.
 */
const REST = Object.freeze({ gentle: 3, shift: 48, step: 12 });

/**
 * The sites cut into a hillside (a cave's mouth, the dragon's): how far the land must rise across
 * them, front to back (metres: `rise`, at least and at most), and the slope they'd best be on;
 * where there's none so steep near, a cave goes down into the ground instead.
 */
const HILLSIDE = Object.freeze({ cave: { rise: [6, 14], slope: 0.55 }, "dragon's lair": { rise: [8, 26], slope: 0.4 } });

/**
 * The hill's lie over the brow of a face of rock cut into it (art/kits/neutral.js outcrop, so its
 * rock goes back into the hill, under it, rather than over it): how far back from the face its
 * heights are taken (metres), and at how many points across it.
 */
const BROW = Object.freeze({ back: [0, 1, 2, 3, 4.5], across: 9 });

/**
 * How far a site cut into a hillside has its floor dug in front of its face (metres: the radius of
 * the disc dug, which touches the face's line at its middle; 0 for any other): far enough that its
 * floor, level, is as far below the hill at the face as the face is high, and level with the hill
 * at its front edge. `laid`: its layout (setpieces/neutral.js), `slope`: its hill's (restingOf's).
 */
export function cutOf(laid, slope) {
    return laid?.cut && slope > 0 ? Math.min(9, Math.max(2.5, laid.cut.face / (2 * slope))) : 0;
}

/** How far the banks of a site's floor dug into its hill reach round it (metres). */
export const CUT_EASE = 2.5;

// (Each site's rest, worked out once a plan)
const RESTING = new WeakMap();

/**
 * Where a site no people keeps rests: { at ([x, y], metres), facing (radians, the way down the
 * hill it's cut into; or null, to face its trail or road), form ("hillside" or "pit" for a cave,
 * else null), slope (how steep the hill it's cut into is: metres a metre) }. Where it's set down from (sites.js), and where its trail comes up to (trails.js),
 * so the two agree. Its plan's spot for any other site.
 */
export function restingOf(plan, site) {
    if (!isNeutral(site) || LIE[site.kind]) {
        return { at: site.at, facing: null, form: null, slope: 0 };
    }

    if (!RESTING.has(plan)) {
        RESTING.set(plan, new Map());
    }

    const known = RESTING.get(plan);

    if (!known.has(site.id)) {
        const [w, h] = NEUTRAL[site.kind];
        const reach = hypot(w, h) * (PLOT / 2);
        const depth = h * PLOT;
        const land = (x, y) => heightAt(plan, Math.min(WORLD_SIZE - 1, Math.max(0, x)), Math.min(WORLD_SIZE - 1, Math.max(0, y)));
        const n = Math.floor(REST.shift / REST.step);
        const spots = [{ at: site.at, far: 0 }];

        for (let j = -n; j <= n; j++) {
            for (let i = -n; i <= n; i++) {
                const far = i * i + j * j;

                if (far > 0 && far <= n * n) {
                    spots.push({ at: [Math.round(site.at[0] + i * REST.step), Math.round(site.at[1] + j * REST.step)], far });
                }
            }
        }

        // (A hillside: the spot whose slope across it is nearest the one wanted, within what's
        // wanted of its rise, facing down it)
        const hill = HILLSIDE[site.kind];
        let rest = null;

        if (hill) {
            let best = null;

            for (const { at, far } of spots) {
                const g = depth / 2;
                const [gx, gy] = [(land(at[0] + g, at[1]) - land(at[0] - g, at[1])) / (2 * g), (land(at[0], at[1] + g) - land(at[0], at[1] - g)) / (2 * g)];
                const slope = hypot(gx, gy);
                const rise = slope * depth;
                const off = Math.abs(slope - hill.slope);

                if (rise >= hill.rise[0] && rise <= hill.rise[1] && (!best || off < best.off - 0.02 || (off <= best.off && far < best.far))) {
                    best = { at, off, far, slope, facing: atan2(-gx, -gy) };
                }
            }

            rest = best && { at: best.at, facing: best.facing, form: "hillside", slope: best.slope };
        }

        // (Else the flattest: its land's spread, its middle and eight ways round)
        if (!rest) {
            const spread = ([x, y]) => {
                const heights = [[0, 0], [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]].map(([dx, dy]) => land(x + dx * reach, y + dy * reach));

                return Math.max(...heights) - Math.min(...heights);
            };
            let best = { at: site.at, spread: spread(site.at), far: 0 };

            if (best.spread > REST.gentle) {
                for (const { at, far } of spots.slice(1)) {
                    const own = spread(at);

                    if (own < best.spread - 0.5 || (own <= best.spread && far < best.far)) {
                        best = { at, spread: own, far };
                    }
                }
            }

            rest = { at: best.at, facing: null, form: site.kind === "cave" ? "pit" : hill ? "hillside" : null, slope: 0 };
        }

        known.set(site.id, rest);
    }

    return known.get(site.id);
}

/**
 * The sites that are built, each set down in the world the first time a chunk near it's made
 * (`settle`), as the settlements are laid out: { site, x, y (its middle, metres), facing, w, h
 * (plots), pieces ([{ ...piece, x, y (metres, in the world), site (its id) }]), squares (Set of
 * `y * WORLD_SIZE + x` it stands on), radius (how far it reaches from its middle, metres), heart
 * ([x, y] metres: open ground in its middle, where a lair's master stands) }.
 * `landAt(x, y)` is the land a square is ({ road, water }: overworld.js's). Each site's clearing
 * (`clearings`: { at, radius }, where trees and the land's features keep off) moves to where it's
 * set down and grows to its size.
 */
export class Sites {
    constructor(plan, { landAt, clearing = 12, facingOf = () => null }) {
        this.plan = plan;
        this.landAt = landAt;
        this.facingOf = facingOf;
        this.set = new Map();
        this.near = new Map();
        this.byChunk = new Map();
        this.parts = new Map();
        this.bySquare = new Set();
        this.paved = new Set();
        this.clearings = new Map();

        for (const site of plan.sites) {
            const size = siteSize(site);

            this.clearings.set(site.id, { at: site.at, radius: clearing });

            if (!size) {
                continue;
            }

            // (Near every chunk it could reach, moved as far as it may be: a citadel's hill eased
            // out past its walls)
            const reach = isCitadel(site) ? CITADEL.room.shift + hypot(size[0], size[1]) * (PLOT / 2) + SITE_MARGIN + CITADEL.hill.ease : (LIE[site.kind] ? LYING.shift : SHIFT) + hypot(size[0], size[1]) * (PLOT / 2) + SITE_MARGIN;

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

                if (set.citadel) {
                    this.paved.add(square);
                }
            }

            const chunk = Math.floor(set.y / CHUNK) * CHUNKS + Math.floor(set.x / CHUNK);

            this.byChunk.set(chunk, [...(this.byChunk.get(chunk) ?? []), set]);

            // (A citadel's pieces each in the chunk it stands in: it's too big for one)
            for (const piece of set.citadel ? set.pieces : []) {
                const own = Math.floor(piece.y / CHUNK) * CHUNKS + Math.floor(piece.x / CHUNK);

                this.parts.set(own, [...(this.parts.get(own) ?? []), piece]);
            }
            Object.assign(this.clearings.get(site.id), { at: [set.x, set.y], radius: set.radius + SITE_MARGIN });
        }
    }

    /**
     * Where a site's heart is (metres: open ground in its middle, where a lair's master stands):
     * set down first if it isn't yet; its plan's spot if it's built nowhere.
     */
    heartOf(site) {
        if (!this.set.has(site.id)) {
            this.settle(Math.floor(site.at[0] / CHUNK), Math.floor(site.at[1] / CHUNK));
        }

        return this.set.get(site.id)?.heart ?? site.at;
    }

    /**
     * What a site has on a square (metres): { blocked, opaque, paved (a citadel's: its wards'
     * courtyards, trodden earth and flags) }, or null.
     */
    squareAt(x, y) {
        const k = y * WORLD_SIZE + x;

        return this.bySquare.has(k) ? { blocked: 1, opaque: 1, paved: this.paved.has(k) } : null;
    }

    /**
     * The pieces of the sites whose middles are in a chunk, in the world's metres (settled); of a
     * citadel, those standing in it.
     */
    piecesIn(cx, cy) {
        this.settle(cx, cy);

        return [...(this.byChunk.get(cy * CHUNKS + cx) ?? []).flatMap(({ pieces, citadel }) => (citadel ? [] : pieces)), ...(this.parts.get(cy * CHUNKS + cx) ?? [])];
    }

    // Where a site is built: its cell's middle, or near it, clear of roads and water, facing the
    // nearest road (the spot that lies best first, for those that would rather stand high or
    // low: LIE); or null if there's nowhere
    #setDown(site, [w, h], lie = LIE[site.kind]?.lie) {
        const facing = this.#facing(site);
        const size = WORLD_SIZE;
        // (Its land looked at every other square: no road or stream is narrower; each square
        // looked at once, however many of the tries it's under)
        const looked = new Map();
        // (A site no people keeps minds the roads and the water, but not the foot paths: its own
        // trail comes up to its front, trails.js)
        const neutral = isNeutral(site);
        const clear = (i, j) => {
            if (i < 0 || j < 0 || i >= size || j >= size) {
                return false;
            }

            if (i % 2 || j % 2) {
                return true;
            }

            const k = j * size + i;

            if (!looked.has(k)) {
                const land = this.landAt(i, j);

                looked.set(k, !(land.road && !(neutral && land.road === "path")) && !land.water);
            }

            return looked.get(k);
        };
        // (The squares that weren't clear under earlier tries: most tries overlap the last, so
        // one of these is under most of those that fail, and looked for first)
        const unclear = [];
        const rest = restingOf(this.plan, site);
        // (A citadel: its outer ward, its towers and its barbican, which it may be moved farther to
        // find room for)
        const citadel = isCitadel(site) ? layoutCitadel({ seed: site.seed }) : null;
        const outline = citadel && outlineOf(citadel, 1);
        const room = citadel ? CITADEL.room : LYING;
        // (Round where it rests; and if nowhere there's clear, round its plan's spot)
        const tries = lie ? this.#lying(site, [w, h], lie, room) : rest.at === site.at ? rings(site.at, citadel ? room.shift : SHIFT) : [...rings(rest.at), ...rings(site.at)];

        for (const [x, y] of tries) {
            const corners = outline ? outline.map(([u, v]) => [x + u * cos(facing) + v * sin(facing), y - u * sin(facing) + v * cos(facing)]) : footprint({ x, y, w, h, facing });

            if (unclear.some(([i, j]) => within(corners, i + 0.5, j + 0.5))) {
                continue;
            }

            const found = firstInside(corners, (i, j) => !clear(i, j));

            if (found) {
                unclear.push(found);
                continue;
            }

            // (A hill citadel: its wards' terraces and what's in its walls; citadelAt)
            if (citadel) {
                return this.#citadelAt(site, citadel, x, y, facing, [w, h]);
            }

            // (All it stands on, or for a neutral site just what of it stands in the way)
            const laid = isNeutral(site) ? layoutNeutral({ kind: site.kind, seed: site.seed, form: rest.form }) : null;
            const turn = turned(x, y, facing, [w, h]);
            const squares = laid ? laid.solid.flatMap(([x0, y0, x1, y1]) => inside(footprint({ ...turn((x0 + x1) / 2, (y0 + y1) / 2), w: (x1 - x0) / PLOT, h: (y1 - y0) / PLOT, facing }))) : inside(corners);
            const heart = laid ? turn(...laid.heart) : { x, y };
            const radius = hypot(w, h) * (PLOT / 2);
            // (Its pad, if it's levelled into the land: every people's place, on a mound or in a
            // hollow as it lies; of those no people keeps, a ruined castle's courtyard and a cave's
            // pit sunk into the ground; the rest lie with the land)
            const sunk = laid?.pad && turn(...laid.pad.at);
            // (A cave's floor cut into its hill: a disc in front of its face, level with the hill
            // at its front edge and as far below it at the face as the face is high; its banks
            // steep round it)
            const cut = cutOf(laid, rest.slope);
            const floor = cut && turn(laid.cut.x, laid.cut.y + cut);
            const pad = laid
                ? sunk
                    ? { ...laid.pad, at: [sunk.x, sunk.y] }
                    : floor
                      ? { at: [floor.x, floor.y], radius: cut, raise: -rest.slope * cut, ease: CUT_EASE }
                      : site.kind === "ruined castle"
                        ? { at: [x, y], radius }
                        : null
                : { at: [x, y], radius, raise: LIE[site.kind]?.raise ?? 0 };

            return {
                site,
                x,
                y,
                facing,
                w,
                h,
                pieces: this.#pieces(site, x, y, facing, [w, h], laid, cut),
                squares: new Set(squares.map(([i, j]) => j * size + i)),
                radius,
                heart: [heart.x, heart.y],
                pad,
            };
        }

        // (None that lies well clear: wherever's clear, as for any other)
        return lie ? this.#setDown(site, [w, h], null) : null;
    }

    // A hill citadel set down at (x, y), facing `facing` (setpieces/citadel.js): its outer ward on
    // its hill, raised CITADEL.hill.raise over the land under it on average and eased out into the
    // land round it; each ward inside it a terrace higher, eased up under its retaining wall (inside
    // the wall's outer face); every square inside its outer wall, and under its outer towers, its
    // own; its pieces each part of it, standing on its ward's terrace
    #citadelAt(site, citadel, x, y, facing, [w, h]) {
        const [c, s] = [cos(facing), sin(facing)];
        const place = ([u, v]) => [x + u * c + v * s, y - u * s + v * c];
        const local = (px, py) => [(px - x) * c - (py - y) * s, (px - x) * s + (py - y) * c];
        const level = (height) => Math.round(height / HEIGHT_STEP) * HEIGHT_STEP;
        const base = citadelLevel(this.plan, citadel, x, y, facing);
        const pads = citadel.wards.map((ward, k) => ({
            at: [x, y],
            radius: ward.apothem / cos(PI / ward.sides),
            sides: ward.sides,
            apothem: k ? ward.apothem - CITADEL.terrace.ease - 0.3 : ward.apothem,
            turn: PI / 2 - facing,
            level: level(base + ward.rise),
            ease: k ? CITADEL.terrace.ease : CITADEL.hill.ease,
        }));
        // (Its squares: inside its outer wall's outer face, under one of its outer towers or the
        // outer gate's, or in its barbican)
        const radius = Math.max(...outlineOf(citadel).map(([u, v]) => hypot(u, v)));
        const reach = Math.ceil(radius + 1);
        const squares = new Set();

        for (let j = Math.floor(y) - reach; j <= Math.floor(y) + reach; j++) {
            for (let i = Math.floor(x) - reach; i <= Math.floor(x) + reach; i++) {
                if (insideCitadel(citadel, local(i + 0.5, j + 0.5), 0.25)) {
                    squares.add(j * WORLD_SIZE + i);
                }
            }
        }

        // (Each part of it a piece, turned the way its outside faces, on its ward's terrace)
        const pieces = citadelParts(citadel).map((part) => {
            const [px, py] = place(part.at);

            return { ...part, kind: "citadel", key: `citadel-${part.part}`, site: site.id, seed: site.seed, people: "human", x: px, y: py, w: 0, h: 0, facing: facing + PI / 2 - part.turn, base: level(base + part.rise) };
        });

        return { site, x, y, facing, w, h, pieces, squares, radius, heart: [x, y], pads, citadel, level: base };
    }

    // The spots a site that would rather lie high or low may stand (LIE), best first: LYING.step
    // apart within `shift` of its cell's middle (LYING.shift; a citadel's CITADEL.room), each as
    // high (or low) as it stands over the land LYING.round past its reach, and none whose land
    // rises or falls more than `across` over its own reach (then the nearest its cell's middle,
    // then the first). The land's looked at on a lattice LYING.lattice apart, each point once.
    #lying(site, [w, h], lie, { shift, across: most } = LYING) {
        const reach = hypot(w, h) * (PLOT / 2);
        const heights = new Map();
        const { lattice } = LYING;
        const land = (x, y) => {
            const [i, j] = [Math.round(x / lattice), Math.round(y / lattice)];
            const key = j * 4096 + i;

            if (!heights.has(key)) {
                heights.set(key, heightAt(this.plan, Math.min(WORLD_SIZE - 1, Math.max(0, i * lattice)), Math.min(WORLD_SIZE - 1, Math.max(0, j * lattice))));
            }

            return heights.get(key);
        };
        // (Eight ways round, as far out as asked)
        const round = (x, y, far) => [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([dx, dy]) => land(x + (dx && dy ? dx * far * 0.7071 : dx * far), y + (dx && dy ? dy * far * 0.7071 : dy * far)));
        const spots = [];
        const n = Math.floor(shift / LYING.step);

        for (let j = -n; j <= n; j++) {
            for (let i = -n; i <= n; i++) {
                if (i * i + j * j > n * n) {
                    continue;
                }

                const [x, y] = [Math.round(site.at[0] + i * LYING.step), Math.round(site.at[1] + j * LYING.step)];
                const middle = land(x, y);
                const across = round(x, y, reach);

                if (across.some((height) => Math.abs(height - middle) > most)) {
                    continue;
                }

                const out = round(x, y, reach + LYING.round);
                const above = middle - out.reduce((sum, height) => sum + height, 0) / out.length;

                spots.push({ at: [x, y], score: lie === "high" ? above : -above, far: i * i + j * j, k: spots.length });
            }
        }

        return spots.sort((a, b) => b.score - a.score || a.far - b.far || a.k - b.k).map(({ at }) => at);
    }

    // Which way a site faces: towards the nearest road within a few cells (radians, as
    // characters face: 0 south), or south
    #facing(site) {
        const [cx, cy] = site.cell;
        const own = restingOf(this.plan, site).facing ?? this.facingOf(site);

        // (A site cut into a hillside faces down it; one a trail goes up to faces the way the
        // trail comes: trails.js)
        if (own !== null) {
            return own;
        }
        let best = null;

        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                const [x, y] = [cx + dx, cy + dy];

                if ((dx || dy) && x >= 0 && y >= 0 && x < CELLS && y < CELLS && this.plan.road[y * CELLS + x] && (!best || dx * dx + dy * dy < best.d)) {
                    best = { d: dx * dx + dy * dy, dx, dy };
                }
            }
        }

        return best ? atan2(best.dx, best.dy) : 0;
    }

    // What's built at a site: one piece of its people's (a special place, a castle, a watchtower),
    // or one of the humans' landmarks (their castle's a citadel: citadelAt); or a neutral
    // site's, as it's laid out (`laid`: setpieces/neutral.js), a ruined castle's castle pieces
    // with it
    #pieces(site, x, y, facing, [w, h], laid = null, cut = 0) {
        const own = { site: site.id, seed: site.seed, facing };

        if (laid) {
            // (Each part a piece of its own, so each stands on the ground where it is)
            const turn = turned(x, y, facing, [w, h]);
            const land = (point) => heightAt(this.plan, Math.min(WORLD_SIZE - 1, Math.max(0, point.x)), Math.min(WORLD_SIZE - 1, Math.max(0, point.y)));
            const parts = laid.parts.map((part) => {
                const [px, py, pw, pd] = extentOf(part);
                // (Rock cut into a hillside: how steeply the land rises across it, front to back,
                // so it's shaped to the hill: art/kits/neutral.js)
                const slope = part.part === "outcrop" || part.part === "spur" ? (land(turn(px, part.y0)) - land(turn(px, part.y1))) / (part.y1 - part.y0) : undefined;
                // (And a face's brow: the hill's heights behind its top, from its middle's, to the
                // centimetre; and how far the floor dug in front of it reaches, its radius)
                const middle = part.part === "outcrop" && land(turn(px, py));
                const lie =
                    middle !== false
                        ? { back: BROW.back, heights: BROW.back.map((back) => Array.from({ length: BROW.across }, (_, i) => Math.round((land(turn(part.x0 + ((part.x1 - part.x0) * i) / (BROW.across - 1), part.y1 - back)) - middle) * 100) / 100)), cut, ease: CUT_EASE }
                        : undefined;
                const shaped = slope === undefined ? part : lie ? { ...part, slope, lie } : { ...part, slope };

                return { kind: "neutral", name: site.kind, key: `neutral-${part.part}`, people: site.race, part: shaped, ...own, ...turn(px, py), w: pw / PLOT, h: pd / PLOT };
            });
            const castle = (laid.castle ?? []).map((piece) => ({ ...catalog.get(piece.key), ...piece, ...own, ...turn((piece.x + piece.w / 2) * PLOT, (piece.y + piece.h / 2) * PLOT) }));

            return [...parts, ...castle];
        }

        if (site.kind === "watchtower") {
            return [site.race === "human" ? { ...catalog.get(towerKey("round", "roof")), ...own, key: towerKey("round", "roof"), x, y, w, h } : { kind: "tower", people: site.race, key: `tower-${site.race}`, ...own, x, y, w, h }];
        }

        if (site.race !== "human") {
            return [{ kind: "structure", people: site.race, name: site.kind, key: `structure-${site.race}-${site.kind}`, ...own, x, y, w, h }];
        }

        // (The humans' landmarks; their castle's a citadel, citadelAt. An abbey's church a
        // minster's: Gothic, twin-towered)
        const name = HUMAN_LANDMARK[site.kind];

        return [{ kind: "landmark", name, key: `landmark-${name}`, ...own, x, y, w, h, style: "stone", storeys: 2, patron: GOD_IDS[site.seed % GOD_IDS.length], ...(name === "church" ? { grade: "minster", gothic: true } : {}) }];
    }
}

// Where a point of a site laid out facing south ([u, v] metres from its north-west corner) is in
// the world, the site's middle at (x, y) and turned to `facing`: a function (u, v) => { x, y }
function turned(x, y, facing, [w, h]) {
    const [c, s] = [cos(facing), sin(facing)];

    return (u, v) => {
        const [du, dv] = [u - (w * PLOT) / 2, v - (h * PLOT) / 2];

        return { x: x + du * c + dv * s, y: y - du * s + dv * c };
    };
}

// The spots a site may be moved to, nearest its cell's middle first: on rings SHIFT_STEP apart,
// out to `shift` (SHIFT)
function* rings(at, shift = SHIFT) {
    for (let r = 0; r <= shift; r += SHIFT_STEP) {
        const tries = r === 0 ? 1 : Math.round((TAU * r) / SHIFT_STEP);

        for (let k = 0; k < tries; k++) {
            const a = (k / tries) * TAU;

            yield [Math.round(at[0] + cos(a) * r), Math.round(at[1] + sin(a) * r)];
        }
    }
}

// The squares whose middles are inside a turned rectangle's corners ([[x, y] x4]): [[i, j]]
function inside(corners) {
    const squares = [];

    eachInside(corners, (i, j) => {
        squares.push([i, j]);
    });

    return squares;
}

// The first square whose middle is inside a turned rectangle's corners (as inside's) for which
// test(i, j) holds: [i, j], or null
function firstInside(corners, test) {
    let found = null;

    eachInside(corners, (i, j) => {
        if (test(i, j)) {
            found = [i, j];

            return false;
        }

        return true;
    });

    return found;
}

// Visit(i, j) each square whose middle is inside a polygon's corners, a row at a time; stops, and
// returns false, as soon as a visit returns false. (A middle is inside if it's left of an odd
// number of the places the polygon's sides cross its row: found once a row, not for every square)
function eachInside(corners, visit) {
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const [i0, i1] = [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))];

    for (let j = Math.floor(Math.min(...ys)); j < Math.ceil(Math.max(...ys)); j++) {
        const crossings = crossingsAt(corners, j + 0.5);

        for (let i = i0; i < i1; i++) {
            const px = i + 0.5;
            let left = 0;

            for (const x of crossings) {
                if (px < x) {
                    left++;
                }
            }

            if (left % 2 === 1 && visit(i, j) === false) {
                return false;
            }
        }
    }

    return true;
}

// Whether a point is inside a polygon's corners (as eachInside has it)
function within(corners, px, py) {
    let left = 0;

    for (const x of crossingsAt(corners, py)) {
        if (px < x) {
            left++;
        }
    }

    return left % 2 === 1;
}

// Where a polygon's sides cross a row (py): their x
function crossingsAt(corners, py) {
    const crossings = [];

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [ax, ay] = corners[k];
        const [bx, by] = corners[last];

        if (ay > py !== by > py) {
            crossings.push(((bx - ax) * (py - ay)) / (by - ay) + ax);
        }
    }

    return crossings;
}
