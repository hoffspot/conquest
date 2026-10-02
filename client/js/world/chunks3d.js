// The world outside in 3D, a chunk (64 metres square: core/overworld.js) at a time round the
// player, built as they come near and thrown away once they're far off, so that however far they
// walk there's only ever so much of it: no loading screens, only chunks appearing far off in the
// fog, one a frame, the nearest first.
//
// Each chunk has its ground (ground.js: the grass in its land's colours, with roads, fields and
// the town's streets blended in), its water (lakes, the sea and rivers, over their beds), bridges
// where roads cross rivers (straight decks of boards from bank to bank, railed), its trees (trees.js Woodland: every
// variant kept once, drawn wherever it stands), the land's own features (core/wilds.js: boulders,
// fallen trees, stumps, bushes...: kits/wilds.js, one mesh a chunk), and the buildings and props
// of any settlement in it (core/settlements.js), built by the art kits a few at a time each frame
// (so walking into a town never stalls) and merged into the art's one material when they're all
// built. The start town itself is drawn on its own (town3d.js), over the chunks it's in.
//
// The chunks near the player (those within WILDS.fade's reach, give or take) have their
// undergrowth too: grass, flowers, ferns, pebbles, sticks... (kits/wilds.js), built a few at a time
// in the same budget, and let go again once the player's gone far enough that it's all sunk into
// the ground.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CHUNK, CHUNKS, WET } from "../core/overworld.js";
import { CORNERS } from "../core/terrain/ground.js";
import { allAtOnce } from "../core/steps.js";
import { material, paintPicture } from "./art/engine/materials.js";
import { WILDS } from "./art/engine/atlas.js";
import { holdSign, isSign, letGoSign, releaseSign } from "./art/kits/signs.js";
import { Woodland } from "./art/kits/trees.js";
import { featureLooks, featureMesh, Growth, sowing, TILE, undergrowthLooks, undergrowthMesh } from "./art/kits/wilds.js";
import { hedgeBuilding, hedgeMesh, hedgeRuns } from "./art/kits/hedges.js";
import { stepsMesh, stonesOf } from "./art/kits/steps.js";
import { disposeChunkGround, disposeGrass, groundMaterial, landColours, layingGround, respaceGround } from "./ground.js";
import { grassLooks } from "./grassmap.js";
import { Layouts } from "./layouts.js";
import { Terrains } from "./terrains.js";
import { MARGIN, primingWater, shoreDistances, UNDER_BANKS, waterSheet } from "./water.js";
import { fallsOf, lipsIn } from "./falls.js";
import { builderOf, cutAway, drawFar, grounded, joined, partsOf, PIXEL, placed, standOn } from "./town3d.js";
import { chimneysOf, smokeMesh } from "./smoke.js";
import { clothMesh, clothOf } from "./cloth.js";
import { lieOf } from "./art/kits/yards.js";

/** How many chunks round the player's are drawn (each way), and how far off they're let go. */
export const REACH = Object.freeze({ drawn: 2, kept: 3 });

/**
 * How long a frame may spend drawing chunks, building settlements' buildings and growing
 * undergrowth (milliseconds): each is done a step at a time, until the frame's budget is spent.
 */
export const BUILD_BUDGET = 6;

/**
 * The same while the game loads, with only the loading screen to draw between (which each time
 * waits at least a few milliseconds for the page: so fewer, longer turns).
 */
export const LOAD_BUDGET = 40;

// How long placing undergrowth goes on for in a step (milliseconds)
const PLACING = 1;

/**
 * Undergrowth is grown for chunks whose nearest edge is within `grow` metres of the player, and let
 * go once it's more than `drop` (past where it's all sunk into the ground: WILDS.fade).
 */
export const UNDERGROWTH = Object.freeze({ grow: 64, drop: 84 });

/**
 * A chunk's buildings are drawn whole while its nearest edge is within this many metres of the
 * player, and without what's only worth drawing near further off (a timber's sides, a few
 * centimetres deep: less than a pixel from there, even on a phone).
 */
export const DETAIL_NEAR = 40;

/**
 * How far apart the ground's corners are drawn (metres), by how many chunks from the player's a
 * chunk is: in the player's own, then the ring round it, and so on, the last for all further off
 * (the quality level's: view.js).
 */
export const SPACING = Object.freeze([1, 1, 2]);

/** Bridges' decks: how high their tops are over the ground (metres: those on them stand there), and how thick. */
export const DECK = Object.freeze({ top: 0.16, depth: 0.14 });

// Their rails: how high (over the deck), how thick, their posts' thickness, and about how far
// apart the posts are (metres)
const RAIL = Object.freeze({ height: 0.95, thick: 0.1, post: 0.14, every: 1.8 });

const key = (cx, cy) => cy * CHUNKS + cx;

export class Chunks {
    /**
     * @param {object} world - From buildWorld (core/overworld.js): its `maps.town` the world
     *     outside, and its plan.
     */
    constructor(world, { undergrowth = 1 } = {}) {
        this.world = world;

        /** How thick the undergrowth grows (1 as the lands have it; less on slower devices, 0 none). */
        this.undergrowth = undergrowth;
        this.overworld = world.maps.town;
        this.land = landColours(world.plan, grassLooks());
        this.woodland = new Woodland();

        // (The settlements a little further off laid out ahead, off the page's thread; and the
        // land's heights)
        this.layouts = this.overworld.settlements ? new Layouts(this.overworld.settlements) : null;
        this.terrains = this.overworld.ground ? new Terrains(world.plan, this.overworld.ground, this.overworld.trails) : null;

        /** How far apart the ground's corners are drawn (as SPACING; setSpacing). */
        this.spacing = SPACING;

        /** The ground's height at a point (metres): the overworld's (core/terrain/ground.js). */
        this.groundAt = (x, z) => this.overworld.heightAt?.(x, z) ?? 0;

        /** Everything drawn: add it to the scene. */
        this.object = new THREE.Group();
        this.object.name = "chunks";
        this.primer = primer();
        this.object.add(this.woodland.object, this.primer);

        // The chunks drawn, by key: { cx, cy, object, lot (its trees), heights, drawing (while
        // it's still being drawn, hidden), job (its buildings, while they're being built: {
        // pieces, index, group, waiting, trees, built, parts }), buildings (once they're built,
        // merged) and far (whether they're drawn as from far off: #detail), growth (its
        // undergrowth while it's being grown: its steps), undergrowth (its meshes) }; the steps
        // of the one being drawn; those whose
        // buildings are being built, in turn; and those whose undergrowth is being grown
        this.drawn = new Map();
        this.drawing = null;
        this.building = [];
        this.growing = [];
        this.centre = null;
        this.wanted = [];

        /** Bumped whenever a chunk is drawn or thrown away (to know when what's drawn changes). */
        this.version = 0;
    }

    /** Draw every chunk within `reach` of a point (metres) at once (when the game starts). */
    fill(x, z, reach = REACH.drawn) {
        this.#aim(x, z);

        // (Any being drawn finished first)
        if (this.drawing) {
            allAtOnce(this.drawing);
            this.drawing = null;
        }

        for (const [cx, cy] of this.wanted) {
            if (Math.max(Math.abs(cx - this.centre[0]), Math.abs(cy - this.centre[1])) <= reach) {
                this.#draw(cx, cy);
            }
        }

        this.#tend(x, z);
        this.#detail(x, z);
    }

    /**
     * Each frame, with the player at a point (metres): throw away the chunks they've left far
     * behind, then, in the frame's `budget` (milliseconds), draw the nearest chunk they're near
     * that isn't drawn yet (a step of it at least, and no more than one begun a frame), then build
     * settlements' buildings, then grow the undergrowth near them. Returns whether anything changed.
     */
    update(x, z, { budget = BUILD_BUDGET } = {}) {
        const until = performance.now() + budget;
        const changed = this.#aim(x, z);
        const drew = this.#drawSome(until);

        this.#tend(x, z);

        const built = this.#build(until);
        const grown = this.#grow(until);

        this.#detail(x, z);

        return built || grown || drew || changed;
    }

    /** Grow the undergrowth this thick from now on (as the constructor's `undergrowth`): grown again if it's changed. */
    setUndergrowth(amount) {
        if (amount === this.undergrowth) {
            return;
        }

        this.undergrowth = amount;

        for (const drawn of this.drawn.values()) {
            this.#uproot(drawn);
        }
    }

    /** Draw the ground's corners this far apart (as SPACING, ring by ring) from now on. */
    setSpacing(spacing) {
        if (spacing.length !== this.spacing.length || spacing.some((step, k) => step !== this.spacing[k])) {
            this.spacing = spacing;
            this.#respace();
        }
    }

    // How far apart a chunk's ground's corners are drawn, by how far it is from the player's
    #spacingOf(cx, cy) {
        const off = this.centre ? Math.max(Math.abs(cx - this.centre[0]), Math.abs(cy - this.centre[1])) : 0;

        return this.spacing[Math.min(off, this.spacing.length - 1)];
    }

    // Each chunk's ground drawn as finely as it now should be, the player having moved
    #respace() {
        for (const drawn of this.drawn.values()) {
            const ground = drawn.object.children.find(({ name }) => name === "ground");

            if (ground) {
                respaceGround(this.overworld, this.overworld.chunk(drawn.cx, drawn.cy), ground, this.#spacingOf(drawn.cx, drawn.cy));
            }
        }
    }

    /** Whether a chunk (cx, cy) is drawn, all of it (its ground in sight). */
    isDrawn(cx, cy) {
        const drawn = this.drawn.get(key(cx, cy));

        return Boolean(drawn && !drawn.drawing);
    }

    /** Whether any chunk near, any settlement's buildings, or any undergrowth near, are still to be drawn. */
    get busy() {
        return this.drawing !== null || this.building.length > 0 || this.growing.length > 0 || this.wanted.some(([cx, cy]) => !this.drawn.has(key(cx, cy)));
    }

    // Keep the undergrowth where the player is: grown for the chunks near them (queued), let go
    // for those they've left behind
    #tend(x, z) {
        WILDS.focus.value.set(x, z);

        if (!this.undergrowth) {
            return;
        }

        for (const drawn of this.drawn.values()) {
            if (drawn.drawing) {
                continue;
            }

            const [x0, z0] = [drawn.cx * CHUNK, drawn.cy * CHUNK];
            const off = Math.hypot(Math.max(x0 - x, 0, x - (x0 + CHUNK)), Math.max(z0 - z, 0, z - (z0 + CHUNK)));

            if (off <= UNDERGROWTH.grow && !drawn.growth && !drawn.undergrowth) {
                drawn.growth = this.#growing(drawn);
                this.growing.push(drawn);
            } else if (off > UNDERGROWTH.drop && (drawn.growth || drawn.undergrowth)) {
                this.#uproot(drawn);
            }

            // (Each tile drawn only while any of it is near enough not to have sunk from sight)
            for (const mesh of drawn.undergrowth ?? []) {
                const [tx, tz] = mesh.userData.tile;

                mesh.visible = Math.hypot(Math.max(tx - x, 0, x - (tx + TILE)), Math.max(tz - z, 0, z - (tz + TILE))) < WILDS.fade.value.y;
            }
        }

        // (The nearest first)
        this.growing.sort((a, b) => Math.hypot(a.cx * CHUNK + CHUNK / 2 - x, a.cy * CHUNK + CHUNK / 2 - z) - Math.hypot(b.cx * CHUNK + CHUNK / 2 - x, b.cy * CHUNK + CHUNK / 2 - z));
    }

    // Each chunk's buildings drawn whole only while it's near the player (DETAIL_NEAR)
    #detail(x, z) {
        for (const drawn of this.drawn.values()) {
            if (!drawn.buildings) {
                continue;
            }

            const [x0, z0] = [drawn.cx * CHUNK, drawn.cy * CHUNK];
            const far = Math.hypot(Math.max(x0 - x, 0, x - (x0 + CHUNK)), Math.max(z0 - z, 0, z - (z0 + CHUNK))) > DETAIL_NEAR;

            if (far !== drawn.far) {
                drawFar(drawn.buildings, far);
                drawn.far = far;
            }
        }
    }

    // Grow what undergrowth can be grown before `until` (performance.now()'s), a step at a time;
    // whether a chunk's was finished
    #grow(until) {
        let finished = false;

        while (this.growing.length && performance.now() < until) {
            const drawn = this.growing[0];
            const step = drawn.growth.next();

            if (step.done) {
                this.growing.shift();
                drawn.growth = null;
                drawn.undergrowth = step.value;

                for (const mesh of drawn.undergrowth) {
                    drawn.object.add(mesh);
                }

                finished = true;
                this.version++;
            }
        }

        return finished;
    }

    // Grow a chunk's undergrowth, a step at a time (each a yield), returning its meshes: where it
    // grows (a few rows of squares a step), the looks it wants made (a look a step), placed (a
    // millisecond's worth a step), then a tile's mesh a step
    *#growing(drawn) {
        const chunk = this.overworld.chunk(drawn.cx, drawn.cy);
        const items = yield* sowing(this.overworld, chunk, { density: this.undergrowth });

        yield* undergrowthLooks(items);

        const growth = new Growth(items, [chunk.x0, chunk.y0]);

        while (!growth.grow(performance.now() + PLACING)) {
            yield;
        }

        const meshes = [];

        for (const mesh of growth.meshing()) {
            meshes.push(mesh);
            yield;
        }

        return meshes;
    }

    // Let a chunk's undergrowth go (or stop growing it)
    #uproot(drawn) {
        this.growing = this.growing.filter((other) => other !== drawn);
        drawn.growth = null;

        for (const mesh of drawn.undergrowth ?? []) {
            mesh.removeFromParent();
            mesh.geometry.dispose();
        }

        drawn.undergrowth = null;
    }

    // Build what can be built of the settlements' buildings before `until` (performance.now()'s);
    // whether a chunk's were all finished
    #build(until) {
        let finished = false;

        while (this.building.length && performance.now() < until) {
            const drawn = this.building[0];
            const { job } = drawn;

            if (job.waiting) {
                return finished;
            }

            // (The piece built last: its meshes made ready to merge, a step of their own, so the
            // chunk's merge when they're all built is only joining them: town3d.js partsOf)
            if (job.built) {
                const parts = partsOf(job.built, { atlas: true });

                // (One drawn in a picture of its own, not the atlas's, has it painted now rather
                // than in the frame it's first drawn in: materials.js paintPicture)
                for (const { material: own } of parts) {
                    paintPicture(own);
                }

                job.parts.push(...parts);
                job.built = null;
                continue;
            }

            if (job.index >= job.pieces.length) {
                this.#finish(drawn);
                finished = true;
                continue;
            }

            const piece = job.pieces[job.index];
            // (Built by its people's kit, if it's theirs: town3d.js builderOf)
            const build = builderOf(piece);

            if (!build) {
                job.index++;
                continue;
            }

            const add = (object) => {
                job.built = placed(object, piece, [0, 0], grounded(object, piece, this.groundAt));
                job.group.add(job.built);
                job.built.updateMatrixWorld(true);
                job.trees.push(...grownRound(object, piece));
                job.smoke.push(...chimneysOf(object));
                job.cloth.push(...clothOf(object));
                job.index++;
            };
            // (A piece that fails to build is left out, and the rest of its chunk built without
            // it, rather than tried again every frame)
            const skip = (error) => {
                console.warn(`Left out ${piece.key ?? piece.kind}: it failed to build.`, error);
                job.index++;
            };
            let built;

            try {
                built = build(piece);
            } catch (error) {
                skip(error);
                continue;
            }

            if (built instanceof Promise) {
                // (A landmark waits for its lettering's font: carry on when it's built)
                job.waiting = true;
                built.then(
                    (object) => {
                        job.waiting = false;
                        add(object);
                    },
                    (error) => {
                        job.waiting = false;
                        skip(error);
                    },
                );

                return finished;
            }

            add(built);
        }

        return finished;
    }

    // A chunk's buildings all built: merged into the art's material, and how high they stand
    #finish(drawn) {
        const { job } = drawn;

        this.building.shift();
        drawn.job = null;

        if (!this.drawn.has(key(drawn.cx, drawn.cy))) {
            return;
        }

        job.group.updateMatrixWorld(true);

        const map = { x0: drawn.cx * CHUNK, z0: drawn.cy * CHUNK, width: CHUNK, height: CHUNK, rows: Array.from({ length: CHUNK }, (_, j) => drawn.heights.subarray(j * CHUNK, (j + 1) * CHUNK)) };

        for (const object of job.group.children.filter(({ userData }) => userData.built)) {
            standOn(map, object);
        }

        const merged = joined(job.parts);

        merged.name = "buildings";
        drawn.buildings = merged;
        drawn.far = false;
        drawn.signs = [];

        for (const mesh of merged.children) {
            cutAway(mesh.material);

            // (Its signs' pictures kept while it's drawn: signs.js)
            if (isSign(mesh.material.map)) {
                holdSign(mesh.material.map);
                drawn.signs.push(mesh.material.map);
            }
        }

        drawn.object.add(merged);

        // (Smoke rising from their chimneys: smoke.js; their banners and flags in the breeze:
        // cloth.js)
        const smoke = smokeMesh(job.smoke);
        const cloth = clothMesh(job.cloth);

        if (cloth) {
            drawn.object.add(cloth);
        }

        if (smoke) {
            drawn.object.add(smoke);
        }

        // (And the great trees they're built round, the elves', planted with the rest)
        if (job.trees.length) {
            drawn.grown = this.woodland.plant(job.trees, this.groundAt);
            drawn.object.add(drawn.grown.object);

            for (const box of drawn.grown.boxes) {
                for (let y = Math.max(map.z0, Math.floor(box.min.z)); y < Math.min(map.z0 + CHUNK, Math.ceil(box.max.z)); y++) {
                    for (let x = Math.max(map.x0, Math.floor(box.min.x)); x < Math.min(map.x0 + CHUNK, Math.ceil(box.max.x)); x++) {
                        const at = (y - map.z0) * CHUNK + (x - map.x0);

                        drawn.heights[at] = Math.max(drawn.heights[at], box.max.y);
                    }
                }
            }
        }

        this.version++;
    }

    /** How high whatever stands on a square is (the trees: metres, 0 for nothing). */
    heightAt(x, z) {
        const drawn = this.drawn.get(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));

        if (!drawn) {
            return 0;
        }

        return drawn.heights[(Math.floor(z) - drawn.cy * CHUNK) * CHUNK + (Math.floor(x) - drawn.cx * CHUNK)] ?? 0;
    }

    /** The trees of the chunks drawn: [{ x, z }] (their trunks, metres). */
    trees() {
        return [...this.drawn.values()].flatMap(({ cx, cy }) => this.overworld.chunk(cx, cy).trees.map(({ x, y }) => ({ x, z: y })));
    }

    /** Throw everything away. */
    dispose() {
        this.drawing = null;

        for (const drawn of [...this.drawn.values()]) {
            this.#forget(drawn);
        }

        this.primer.traverse((node) => {
            node.geometry?.dispose();
            node.material?.userData.mask?.dispose();

            if (node.material?.userData.own) {
                node.material.dispose();
            }
        });
        this.woodland.dispose();
        this.layouts?.dispose();
        this.terrains?.dispose();
        disposeGrass(this.land);
        this.land.userData.home?.forEach((home) => home.dispose());
        this.land.userData.grass?.dispose();
        this.land.userData.farm?.dispose();
        this.land.userData.layers?.colours.dispose();
        this.land.userData.layers?.marks.dispose();
        this.land.dispose();
        this.object.removeFromParent();
    }

    // Where the player is: the chunks to draw round them, nearest first, and those to throw away
    // (whether any were)
    #aim(x, z) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

        if (this.centre && this.centre[0] === cx && this.centre[1] === cy) {
            return false;
        }

        this.centre = [cx, cy];
        this.wanted = [];
        this.layouts?.ahead(cx, cy);
        this.terrains?.ahead(cx, cy);
        this.#respace();

        for (let dy = -REACH.drawn; dy <= REACH.drawn; dy++) {
            for (let dx = -REACH.drawn; dx <= REACH.drawn; dx++) {
                if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < CHUNKS && cy + dy < CHUNKS) {
                    this.wanted.push([cx + dx, cy + dy]);
                }
            }
        }

        // (From the middle of the player's chunk)
        this.wanted.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));

        let changed = false;

        for (const drawn of [...this.drawn.values()]) {
            if (Math.max(Math.abs(drawn.cx - cx), Math.abs(drawn.cy - cy)) > REACH.kept) {
                this.#forget(drawn);
                changed = true;
            }
        }

        return changed;
    }

    // Draw what can be drawn before `until` (performance.now()'s) of the nearest chunk wanted
    // that isn't drawn yet: a step of it at least, and no more than one chunk begun a frame;
    // whether one was finished
    #drawSome(until) {
        if (!this.drawing) {
            const next = this.wanted.find(([cx, cy]) => !this.drawn.has(key(cx, cy)));

            if (!next) {
                return false;
            }

            this.drawing = this.#drawing(...next);
        }

        do {
            if (this.drawing.next().done) {
                this.drawing = null;

                return true;
            }
        } while (performance.now() < until);

        return false;
    }

    // Draw a chunk all at once
    #draw(cx, cy) {
        if (!this.drawn.has(key(cx, cy))) {
            allAtOnce(this.#drawing(cx, cy));
        }
    }

    // Draw a chunk, a step at a time (each a yield), hidden until it's all drawn
    *#drawing(cx, cy) {
        const chunk = this.overworld.chunk(cx, cy);
        const object = new THREE.Group();
        const heights = new Float32Array(CHUNK * CHUNK);
        const drawn = { cx, cy, object, lot: null, heights, drawing: true, job: null, growth: null, undergrowth: null };
        // (How high what stands on it does, over the squares it stands on: [{ min, max ([x, y]), top }])
        const standing = (boxes) => {
            for (const { min, max, top } of boxes) {
                for (let y = Math.max(chunk.y0, Math.floor(min[1])); y < Math.min(chunk.y0 + CHUNK, Math.ceil(max[1])); y++) {
                    for (let x = Math.max(chunk.x0, Math.floor(min[0])); x < Math.min(chunk.x0 + CHUNK, Math.ceil(max[0])); x++) {
                        const at = (y - chunk.y0) * CHUNK + (x - chunk.x0);

                        heights[at] = Math.max(heights[at], top);
                    }
                }
            }
        };

        object.name = `chunk ${cx}, ${cy}`;
        object.visible = false;
        this.object.add(object);
        this.drawn.set(key(cx, cy), drawn);
        yield;

        // (The water first, so the ground under it and up its banks can be wet by its field)
        const water = yield* waterOf(this.overworld, chunk);

        object.add(yield* layingGround(this.overworld, chunk, this.land, this.#spacingOf(cx, cy), water?.userData.field));
        yield;

        const falls = water && this.overworld.waters ? fallsOf(lipsIn(this.overworld.waters, cx, cy, CHUNK)) : null;
        // (Its piers stand on the ground under the deck: not on the deck, as anyone standing there does)
        const bridges = bridgesOf(chunk, { deck: (bridge, t) => this.overworld.deckOf?.(bridge, t) ?? 0, groundAt: (x, z) => this.overworld.ground?.heightAt(x, z) ?? this.groundAt(x, z) });
        // (The plank walks over a settlement's lagoon: decks on stilts, no rails)
        const walks = chunk.walks?.length ? bridgesOf({ bridges: chunk.walks }, { rails: false, deck: (walk, t) => this.groundAt(walk.a[0] + (walk.b[0] - walk.a[0]) * t, walk.a[1] + (walk.b[1] - walk.a[1]) * t), groundAt: this.groundAt }) : null;

        for (const part of [water, falls, bridges, walks]) {
            if (part) {
                object.add(part);
            }
        }

        // The land's own features (their looks made first, a step each), and how high they stand
        if (chunk.features.length) {
            const landAt = (x, y) => this.overworld.biomeAt(x, y);

            yield* featureLooks(chunk.features, landAt);

            const wild = featureMesh(chunk.features, landAt, [chunk.x0, chunk.y0], this.groundAt);

            object.add(wild.mesh);
            standing(wild.boxes);
        }

        // Its hedgerows, along its farmed blocks' edges (kits/hedges.js), and how high they stand
        const runs = hedgeRuns(this.overworld, chunk);

        if (runs.length) {
            const hedges = yield* hedgeBuilding(runs, [chunk.x0, chunk.y0], this.groundAt, { sprigs: this.undergrowth });

            object.add(hedges.object);
            standing(hedges.boxes);
        }

        // The stone steps up its trails' steepest stretches (kits/steps.js)
        const stones = this.overworld.ground ? stonesOf(this.overworld.pathsNear?.(cx, cy) ?? [], (line) => this.overworld.ground.profileOf(line), this.groundAt, [chunk.x0, chunk.y0, chunk.x0 + CHUNK, chunk.y0 + CHUNK]) : [];

        if (stones.length) {
            object.add(stepsMesh(stones, (x, y) => this.overworld.biomeAt(x, y), [chunk.x0, chunk.y0]));
        }

        yield;

        // The trees, and how high they stand on each square
        // (Each trunk set down on the lowest of the ground round it, so on a slope none of it's left
        // hanging over the ground)
        const trunkAt = (x, z) => Math.min(this.groundAt(x - 0.4, z - 0.4), this.groundAt(x + 0.4, z - 0.4), this.groundAt(x - 0.4, z + 0.4), this.groundAt(x + 0.4, z + 0.4)) - 0.05;
        const lot = this.woodland.plant(
            chunk.trees.map(({ x, y, variant, size, turn }) => ({ x, z: y, variant, size, turn, y: trunkAt(x, y) })),
            this.groundAt,
        );

        drawn.lot = lot;

        for (const box of lot.boxes) {
            for (let y = Math.max(chunk.y0, Math.floor(box.min.z)); y < Math.min(chunk.y0 + CHUNK, Math.ceil(box.max.z)); y++) {
                for (let x = Math.max(chunk.x0, Math.floor(box.min.x)); x < Math.min(chunk.x0 + CHUNK, Math.ceil(box.max.x)); x++) {
                    const at = (y - chunk.y0) * CHUNK + (x - chunk.x0);

                    heights[at] = Math.max(heights[at], box.max.y);
                }
            }
        }

        object.add(lot.object);

        // The buildings and props of any settlement in it, to be built a few at a time
        // (And each people's castle and places, and their lookouts: sites.js; and the yards behind
        // its houses that are there (core/settlements.js), standing on the ground as it lies under
        // each: kits/yards.js)
        const yards = (this.overworld.settlements?.yardsIn?.(cx, cy) ?? []).map((yard) => ({ ...yard, lie: lieOf(yard, this.groundAt) }));
        const pieces = [...(this.overworld.settlements?.piecesIn(cx, cy).filter(({ kind }) => kind !== "tree") ?? []), ...yards, ...(this.overworld.sites?.piecesIn(cx, cy) ?? [])];

        if (pieces.length) {
            const group = new THREE.Group();

            group.scale.setScalar(PIXEL);
            group.updateMatrixWorld();

            // (Each piece built, then its parts made ready to merge: `built` the one whose parts
            // aren't yet)
            drawn.job = { pieces, index: 0, group, waiting: false, trees: [], smoke: [], cloth: [], built: null, parts: [] };
            this.building.push(drawn);
        }

        drawn.drawing = false;
        object.visible = true;
        this.version++;
    }

    // Throw a chunk away
    #forget(drawn) {
        // (Its drawing stopped, if it wasn't finished)
        if (drawn.drawing) {
            this.drawing = null;
        }

        if (drawn.lot) {
            this.woodland.fell(drawn.lot);
        }

        if (drawn.grown) {
            this.woodland.fell(drawn.grown);
        }

        this.#uproot(drawn);

        // (Its buildings, if they were still being built, go with it, and the pictures of any
        // signs painted for them)
        if (drawn.job) {
            this.building = this.building.filter((other) => other !== drawn);
            drawn.job.group.traverse((node) => {
                node.geometry?.dispose();

                if (isSign(node.material?.map)) {
                    letGoSign(node.material.map);
                }
            });
        }

        for (const texture of drawn.signs ?? []) {
            releaseSign(texture);
        }

        for (const part of [...drawn.object.children]) {
            if (part.name === "ground") {
                disposeChunkGround(part);
            } else {
                part.traverse((node) => {
                    node.geometry?.dispose();

                    // (The water's mask is the chunk's own)
                    node.material?.userData.mask?.dispose();

                    if (node.material?.userData.own) {
                        node.material.dispose();
                    }
                });
            }
        }

        drawn.object.removeFromParent();
        this.drawn.delete(key(drawn.cx, drawn.cy));
        this.version++;
    }
}

// Water, a waterfall and its mist, ground wet by water, a bridge, chimney smoke, a banner and a
// tuft of grass, far under the ground where they're never seen, so that their shaders are made
// while the game loads (with the rest: Game.build) rather than the first time a river, a fall, a
// bridge, smoke, a banner or the undergrowth comes into view
function primer() {
    const group = new THREE.Group();
    const water = primingWater();
    const wet = groundMaterial({ water: { texture: water.userData.mask, area: [0, 0, 1, 1] } });

    group.name = "primer";
    group.position.y = -1000;
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), water));
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wet));
    group.add(fallsOf([{ top: Array.from({ length: 7 }, (_, k) => [k * 0.5, 0]), way: [0, 1], level: 0, drop: 2 }]));
    wet.userData.own = true;

    for (const look of ["planks", "planks-dark", "timber"]) {
        group.add(new THREE.Mesh(box(0, 0, 0, 1, 0.1, 1), bridgeMaterial(look)));
    }

    // (Chimney smoke, and a banner)
    group.add(smokeMesh([[0, 0, 0, 2]]));
    group.add(clothMesh([{ at: [0, 0, 0], width: 1, drop: 1, kind: "hang", look: "human" }]));

    // (And a tuft of grass, for the undergrowth's; and a stretch of hedge)
    group.add(undergrowthMesh([{ kind: "tuft", land: "meadow", look: 0, x: 0, y: 0, turn: 0, size: 1, tint: [1, 1, 1] }], [0, 0]));
    group.add(hedgeMesh([{ axis: 0, at: 0.5, from: 0, to: 2, ends: [true, true], seed: 1 }], [0, 0], () => 0).object);

    return group;
}

// The great trees a piece is built round (its builder's userData.trees: in its own pixels, as
// it's built facing south), where they stand in the world as it's turned: [{ x, z, variant, size,
// turn }] to plant
function grownRound(object, piece) {
    const trees = object.userData?.trees ?? [];
    const [c, s] = [Math.cos(piece.facing), Math.sin(piece.facing)];

    return trees.map(({ x, z, variant, size = 1 }, k) => {
        const [lx, lz] = [(x - piece.w * 10) * PIXEL, (z - piece.h * 10) * PIXEL];

        return { x: piece.x + lx * c + lz * s, z: piece.y - lx * s + lz * c, variant, size, turn: (piece.x * 7 + piece.y * 3 + k) % (Math.PI * 2) };
    });
}

// --- Water ---

// How many rows of a chunk's water's squares have how it runs and how deep it is worked out a step
const WATER_ROWS = 6;

// A chunk's water: a sheet over it, drawn where there's water (under bridges too), or null; how
// it runs and how deep it is worked out for each square near its shore, a few rows a step
function* waterOf(overworld, chunk) {
    const { x0, y0 } = chunk;
    const size = CHUNK + 2 * MARGIN;
    const data = new Uint8Array(size * size);
    let any = false;

    // (Some squares further round, so its shore meets the chunks' beside it)
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [x, y] = [x0 + i - MARGIN, y0 + j - MARGIN];
            const inside = i >= MARGIN && j >= MARGIN && i < MARGIN + CHUNK && j < MARGIN + CHUNK;

            if (x < 0 || y < 0 || x >= CHUNKS * CHUNK || y >= CHUNKS * CHUNK) {
                continue;
            }

            const there = inside ? chunk : overworld.chunkAt(x, y);
            const k = (y - there.y0) * CHUNK + (x - there.x0);

            if (there.water[k] !== WET.none) {
                data[j * size + i] = 1;
                any ||= inside;
            }
        }
    }

    if (!any) {
        return null;
    }

    if (!overworld.surfaceAt) {
        return waterSheet(data, [x0, y0, CHUNK, CHUNK], MARGIN);
    }

    // How the water runs and how deep it is, wherever it's drawn (out under the banks a little)
    const shore = shoreDistances(data, size, size);
    const flow = new Float32Array(size * size * 2);
    const depth = new Float32Array(size * size);

    for (let j = 0; j < size; j++) {
        if (j % WATER_ROWS === WATER_ROWS - 1) {
            yield;
        }

        for (let i = 0; i < size; i++) {
            const k = j * size + i;
            const [x, y] = [x0 + i - MARGIN, y0 + j - MARGIN];

            if (shore[k] < -UNDER_BANKS - 1 || x < 0 || y < 0 || x >= CHUNKS * CHUNK || y >= CHUNKS * CHUNK) {
                continue;
            }

            const river = overworld.waters?.flowing(x + 0.5, y + 0.5, 24);
            const surface = overworld.surfaceAt(x + 0.5, y + 0.5, river);
            const there = overworld.chunkAt(x, y);
            const c = (y - there.y0) * CORNERS + (x - there.x0);
            const { heights } = there;

            depth[k] = Math.max(0, surface - (heights[c] + heights[c + 1] + heights[c + CORNERS] + heights[c + CORNERS + 1]) / 4);

            if (river?.current) {
                [flow[k * 2], flow[k * 2 + 1]] = river.current;
            }
        }
    }

    return waterSheet(data, [x0, y0, CHUNK, CHUNK], MARGIN, (x, z) => overworld.surfaceAt(x, z), { shore, flow, depth });
}

/**
 * A settlement's own water (the lizard folk's lagoon) and the plank walks over it, as the world's
 * water and bridges are drawn: `water` rows of squares (1 for water), `walks` layoutTown's, the
 * settlement's corner at `origin` ([x, z], metres). A Group, or null if it has no water.
 */
export function lagoonOf(water, walks, [ox, oz] = [0, 0]) {
    if (!water?.length) {
        return null;
    }

    const [height, width] = [water.length, water[0].length];
    const data = new Uint8Array((width + 2) * (height + 2));

    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            data[(j + 1) * (width + 2) + i + 1] = water[j][i] ? 1 : 0;
        }
    }

    const group = new THREE.Group();
    const decks = bridgesOf({ bridges: walks.map(({ a, b, half }) => ({ a: [ox + a[0], oz + a[1]], b: [ox + b[0], oz + b[1]], half })) }, { rails: false });

    group.name = "lagoon";
    group.add(waterSheet(data, [ox, oz, width, height]));

    if (decks) {
        group.add(decks);
    }

    return group;
}

// --- Bridges ---

// A box (metres) from (x0, y0, z0) to (x1, y1, z1), its texture laid flat on each face at its real
// size (`metres` to a repeat): on top, running along x (so a deck's boards lie across it)
function box(x0, y0, z0, x1, y1, z1, metres = 2.8, segments = 1) {
    const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, segments).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const { position, normal, uv } = geometry.attributes;

    for (let k = 0; k < uv.count; k++) {
        const [x, y, z] = [position.getX(k), position.getY(k), position.getZ(k)];

        if (Math.abs(normal.getY(k)) > 0.5) {
            uv.setXY(k, x / metres, z / metres);
        } else if (Math.abs(normal.getX(k)) > 0.5) {
            uv.setXY(k, z / metres, y / metres);
        } else {
            uv.setXY(k, x / metres, y / metres);
        }
    }

    return geometry;
}

// A chunk's bridges (those whose middles are in it): each a deck of boards laid across it, from
// bank to bank along the road, rising and falling as `deck(bridge, t)` has it (its height, metres,
// `t` of the way from its end `a` to `b`), a dark beam along each edge, a rail on posts along each
// side and piers down to the ground under it (`groundAt`); or, without `rails`, a plank walk:
// stilts under its edges instead; or null
function bridgesOf(chunk, { rails = true, deck = () => 0, groundAt = () => 0 } = {}) {
    const parts = { planks: [], "planks-dark": [], timber: [] };
    const { top, depth } = DECK;
    const { height, thick, post, every } = RAIL;
    const matrix = new THREE.Matrix4();

    for (const bridge of chunk.bridges) {
        const { a, b, half } = bridge;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const posts = Math.max(2, Math.round(length / every) + 1);
        const own = { planks: [], "planks-dark": [], timber: [] };
        const segments = Math.max(1, Math.ceil(length));

        // (Built along x from 0, across z, level; then each point raised to the deck's height
        // there, and turned to lie along the road)
        own.planks.push(box(0, top - depth, -half, length, top, half, 2.8, segments));

        for (const side of [-1, 1]) {
            const [inner, outer] = side > 0 ? [half - thick, half + 0.02] : [-half - 0.02, -half + thick];

            own["planks-dark"].push(box(0, top - 0.4, inner, length, top + 0.03, outer, 1.4, segments));

            if (rails) {
                own.timber.push(box(0, top + height - thick, inner, length, top + height, outer, 1, segments));
                own.timber.push(box(0, top + height * 0.5 - thick * 0.6, inner, length, top + height * 0.5, outer, 1, segments));
            }

            for (let k = 0; k < posts; k++) {
                const x = 0.1 + ((length - 0.2 - post) * k) / (posts - 1);

                own.timber.push(box(x, rails ? top - 0.4 : -0.6, side > 0 ? half - post : -half, x + post, rails ? top + height + 0.06 : top - depth, side > 0 ? half : -half + post, 1));
            }
        }

        for (const geometries of Object.values(own)) {
            for (const geometry of geometries) {
                const { position } = geometry.attributes;

                for (let k = 0; k < position.count; k++) {
                    position.setY(k, position.getY(k) + deck(bridge, position.getX(k) / length));
                }

                geometry.computeVertexNormals();
            }
        }

        // (Piers: under each edge a third and two thirds of the way over, from the deck's beams
        // down into the ground under them)
        const [dx, dz] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];

        for (const t of rails && length > 4 ? [1 / 3, 2 / 3] : []) {
            for (const side of [-1, 1]) {
                const z = side * (half - post);
                const x = t * length;
                const bed = groundAt(a[0] + dx * x - dz * z, a[1] + dz * x + dx * z) - 0.4;
                const under = deck(bridge, t) + top - 0.4;

                if (under - bed > 0.3) {
                    own.timber.push(box(x - post, bed, z - post, x + post, under, z + post, 1));
                }
            }
        }

        matrix.makeRotationY(-Math.atan2(b[1] - a[1], b[0] - a[0])).setPosition(a[0], 0, a[1]);

        for (const [look, geometries] of Object.entries(own)) {
            parts[look].push(...geometries.map((geometry) => geometry.applyMatrix4(matrix)));
        }
    }

    if (!parts.planks.length) {
        return null;
    }

    const group = new THREE.Group();

    group.name = "bridges";

    for (const [look, geometries] of Object.entries(parts)) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), bridgeMaterial(look));

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
    }

    return group;
}

// The bridges' materials: the art kits' planks and timber, but with textures repeating each
// metre (the kits work in art pixels)
const bridgeMaterials = new Map();

function bridgeMaterial(look) {
    if (!bridgeMaterials.has(look)) {
        const kit = material(look);
        const own = kit.clone();

        if (kit.map) {
            own.map = kit.map.clone();
            own.map.repeat.set(1, 1);
            own.map.needsUpdate = true;
        }

        own.name = `bridge ${look}`;
        paintPicture(own);
        bridgeMaterials.set(look, own);
    }

    return bridgeMaterials.get(look);
}
