// The armies' camps' stockades (docs/WAR.md M22, *The stockade*; core/war/stockade.js), drawn where
// they stand near the player: a palisade of sharpened stakes round each camp, in its people's wood
// (pale oak for the humans, silvered for the elves, charred black for the dark elves, ochre for the
// cat folk, cane for the lizard folk, rough and dark for the orcs); its two gates, each between
// tall posts under a lintel, their leaves swung open inside; the walkway along the inside of its
// wall on its posts (STOCKADE.high: walked on there, core/overworld.js RAISED), and a stair up to
// it either side of each gate, along the lane, rising away from the gate. A section broken open is stumps and
// stakes fallen in, its walkway gone, a pile of fresh stakes lying ready by it while its people
// have the wood to mend it; a section mended is fresh wood, its stakes rising out of the ground as
// they're set. Kept while within STOCKADES_VIEW metres, let go further off.
//
// Each is a handful of instanced meshes (its stakes, its fresh stakes, its stumps, its fallen
// stakes, its timbers, its posts), the shapes shared by every stockade and each people's wood one
// material.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRandom } from "../core/random.js";
import { STOCKADE } from "../core/war/stockade.js";

/** How far off (metres) a stockade's drawn (a little past a fortification: forts3d.js FORTS_VIEW). */
export const STOCKADES_VIEW = 220;

/**
 * Its stakes (metres): how tall they stand (and how much either way), how thick, how far sunk, the
 * point's length, how many to a square of wall, and how far they lean either way (radians).
 */
const STAKE = Object.freeze({ high: 3.1, vary: 0.3, radius: 0.13, sunk: 0.35, tip: 0.4, per: 3, lean: 0.04 });

/** Its walkway (metres): how thick its boards are (as high as STOCKADE.high); its posts' girth. */
const WALK = Object.freeze({ board: 0.07, post: 0.09 });

/** Its stairs (metres): how many treads, and how thick; their stringers' depth and girth. */
const STAIR = Object.freeze({ treads: 8, tread: 0.06, stringer: 0.22, girth: 0.08 });

/** Its gates (metres): their posts' height and girth, and each leaf's height. */
const GATE = Object.freeze({ high: 4.2, post: 0.22, leaf: 2.8 });

/** How long a mended section's stakes take rising into place (seconds). */
const RISE = 1.4;

/** Each people's wood, and its fresh-cut colour (as mended); how much more its stakes vary in height. */
const WOODS = Object.freeze({
    human: { wood: 0xa48a68, fresh: 0xd8bb8c, ragged: 1 },
    elf: { wood: 0x8f8b7a, fresh: 0xd4ccb0, ragged: 0.6 },
    darkElf: { wood: 0x352f38, fresh: 0x6a5a6c, ragged: 0.8 },
    cat: { wood: 0x9b7448, fresh: 0xd0a56c, ragged: 1.2 },
    lizard: { wood: 0x8c8a4c, fresh: 0xc2c278, ragged: 0.9 },
    orc: { wood: 0x4e3d2c, fresh: 0x9c7a52, ragged: 1.8 },
});

// A number from an id, the same every time
const hashOf = (id) => [...String(id)].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7) >>> 0;

/** A stake (metres): a shaft of `height` from its foot at the origin, sharpened to a point on top. */
function stakeGeometry(height = 1) {
    const shaft = new THREE.CylinderGeometry(STAKE.radius, STAKE.radius * 1.08, height, 6, 1, true).translate(0, height / 2, 0);
    const point = new THREE.ConeGeometry(STAKE.radius, STAKE.tip, 6, 1, true).translate(0, height + STAKE.tip / 2, 0);

    return mergeGeometries([shaft.toNonIndexed(), point.toNonIndexed()]);
}

/** A stump (metres): a shaft a metre tall, broken off jagged at its top. */
function stumpGeometry() {
    const stump = new THREE.CylinderGeometry(STAKE.radius, STAKE.radius * 1.08, 1, 6, 1, false).translate(0, 0.5, 0);
    const position = stump.attributes.position;

    for (let k = 0; k < position.count; k++) {
        if (position.getY(k) > 0.99) {
            // (Splintered: each corner of its top a different height)
            position.setY(k, 1 - ((k * 0.37) % 1) * 0.35);
        }
    }

    stump.computeVertexNormals();

    return stump;
}

export class Stockades {
    /** @param {THREE.Object3D} parent - What they go in (the scene). */
    constructor(parent) {
        this.group = new THREE.Group();
        this.group.name = "stockades";
        parent.add(this.group);

        /** The ground's height at a point ((x, z) => metres: set with setGround). */
        this.groundAt = () => 0;

        this.shapes = {
            stake: stakeGeometry(STAKE.high),
            stump: stumpGeometry(),
            timber: new THREE.BoxGeometry(1, 1, 1),
            post: new THREE.CylinderGeometry(1, 1.06, 1, 7).translate(0, 0.5, 0),
        };

        // Each people's wood, weathered and fresh (by `${people}:${fresh}`)
        this.woods = new Map();

        /** Those drawn, by the camp's id: { key, object, meshes, fresh: Set (of sections mended), rising }. */
        this.drawn = new Map();
        this.clock = 0;
    }

    /** Set them on this ground (its height at a point, (x, z) => metres; null: flat at 0). */
    setGround(at) {
        this.groundAt = at ?? (() => 0);
    }

    // A people's wood, weathered or fresh
    #woodOf(people, fresh = false) {
        const key = `${people}:${fresh}`;

        if (!this.woods.has(key)) {
            const look = WOODS[people] ?? WOODS.human;

            this.woods.set(key, new THREE.MeshStandardMaterial({ color: fresh ? look.fresh : look.wood, roughness: 0.92, flatShading: true }));
        }

        return this.woods.get(key);
    }

    /**
     * Draw those near `near` ([x, z] world metres) of these ([{ id, people, stockade
     * (stockade.js's, in the world's metres: `origin` added to its squares), broken (its sections
     * broken open: stockade.js brokenOf), mendable (whether its people have the wood to mend it)
     * }]), as they stand now; those gone or far off let go. A section mended since it was last
     * drawn is drawn fresh, its stakes rising.
     */
    sync(stockades, near, origin = [0, 0]) {
        const keep = new Set();

        for (const each of stockades) {
            const [mx, my] = each.stockade.middle;

            if (Math.hypot(mx + origin[0] - near[0], my + origin[1] - near[1]) > STOCKADES_VIEW) {
                continue;
            }

            keep.add(each.id);

            const down = new Set(each.broken);
            const key = `${each.people}:${each.stockade.front}:${mx}:${my}:${[...down].sort((a, b) => a - b)}:${each.mendable ? 1 : 0}`;
            const was = this.drawn.get(each.id);

            if (was?.key === key) {
                continue;
            }

            // (Mended since: those sections fresh, and rising)
            const fresh = new Set(was && was.place === `${each.stockade.front}:${mx}:${my}` ? was.fresh : []);
            const mended = was && was.place === `${each.stockade.front}:${mx}:${my}` ? [...was.broken].filter((k) => !down.has(k)) : [];

            for (const section of mended) {
                fresh.add(section);
            }

            this.#letGo(each.id);
            this.#draw(each, origin, { key, fresh, rising: mended.length ? new Set(mended) : null });
        }

        for (const id of [...this.drawn.keys()]) {
            if (!keep.has(id)) {
                this.#letGo(id);
            }
        }
    }

    // A stockade drawn: its stakes, stumps, fallen stakes, timbers and posts as instances
    #draw({ id, people, stockade, broken, mendable }, [ox, oz], { key, fresh, rising }) {
        const down = new Set(broken);
        const random = createRandom(hashOf(id));
        const look = WOODS[people] ?? WOODS.human;
        const [mx, my] = stockade.middle;
        const half = STOCKADE.half;
        const ground = (x, z) => this.groundAt(x + ox, z + oz);
        const lists = { stakes: [], fresh: [], stumps: [], fallen: [], timbers: [], posts: [] };
        const matrix = (x, y, z, { turn = 0, tilt = 0, roll = 0, scale = [1, 1, 1] } = {}) =>
            new THREE.Matrix4().compose(new THREE.Vector3(x + ox, y, z + oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, turn, roll, "YXZ")), new THREE.Vector3(...scale));
        // (A piece of timber: a box between two points, so wide and so thick)
        const timber = (into, [ax, ay, az], [bx, by, bz], wide, thick) => {
            const length = Math.hypot(bx - ax, by - ay, bz - az);
            const turn = Math.atan2(bx - ax, bz - az);
            const tilt = -Math.asin((by - ay) / Math.max(1e-6, length));

            into.push({ matrix: matrix((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, { turn, tilt, scale: [wide, thick, length] }) });
        };
        // (The way a wall square's wall runs: along x unless it's on a side facing east or west)
        const runsAlongY = ([x]) => Math.abs(x - mx) === half;
        const inward = ([x, y]) => {
            const [dx, dy] = [mx - x, my - y];

            return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
        };
        // (A wall square's stakes, each a little its own height and lean)
        const stakesOf = (square, into, { section = null } = {}) => {
            const alongY = runsAlongY(square);

            for (let k = 0; k < STAKE.per; k++) {
                const t = (k + 0.5) / STAKE.per;
                const [x, z] = alongY ? [square[0] + 0.5 + random.range(-0.04, 0.04), square[1] + t] : [square[0] + t, square[1] + 0.5 + random.range(-0.04, 0.04)];
                const height = 1 + random.range(-1, 1) * (STAKE.vary / STAKE.high) * look.ragged;

                into.push({ matrix: matrix(x, ground(x, z) - STAKE.sunk, z, { turn: random.next() * Math.PI, tilt: random.range(-1, 1) * STAKE.lean, roll: random.range(-1, 1) * STAKE.lean, scale: [1, height, 1] }), section, rise: STAKE.high * height });
            }
        };

        // The wall: its corners, then each section standing, broken or mended
        for (const square of stockade.corners.wall) {
            const [x, z] = [square[0] + 0.5, square[1] + 0.5];

            lists.posts.push({ matrix: matrix(x, ground(x, z) - STAKE.sunk, z, { scale: [GATE.post, GATE.high - 0.5, GATE.post] }) });
        }

        stockade.sections.forEach((section, k) => {
            if (!down.has(k)) {
                for (const square of section.wall) {
                    stakesOf(square, fresh.has(k) ? lists.fresh : lists.stakes, { section: k });
                }

                return;
            }

            // (Broken open: stumps, and stakes fallen in, the walkway behind gone)
            for (const square of section.wall) {
                const [ix, iy] = inward(square);

                for (let s = 0; s < 2; s++) {
                    const along = (s + 0.5) / 2;
                    const [x, z] = runsAlongY(square) ? [square[0] + 0.5, square[1] + along] : [square[0] + along, square[1] + 0.5];

                    lists.stumps.push({ matrix: matrix(x, ground(x, z) - 0.1, z, { turn: random.next() * Math.PI, scale: [1, random.range(0.35, 1.1), 1] }) });
                }

                const lie = random.range(0.4, 1.6);
                const [x, z] = [square[0] + 0.5 + ix * lie, square[1] + 0.5 + iy * lie];

                // (Lying along the ground, its foot by its stump, its point a little into the grass)
                const [fx, fz] = [x - ix * STAKE.high * 0.5, z - iy * STAKE.high * 0.5];

                lists.fallen.push({ matrix: matrix(fx, Math.max(ground(fx, fz), ground(x, z)) + STAKE.radius * 1.2, fz, { turn: Math.atan2(ix, iy) + random.range(-0.5, 0.5), tilt: Math.PI / 2 + 0.03 }) });
            }

            // (A pile of fresh stakes ready by it, while its people have the wood to mend it)
            if (mendable) {
                const [ix, iy] = inward(section.wall[0]);
                const [x, z] = [section.at[0] + ix * 3.5, section.at[1] + iy * 3.5];
                // (Lying along the wall, side by side)
                const turn = Math.atan2(-iy, ix);

                for (let s = 0; s < 6; s++) {
                    const [row, layer] = [(s % 4) - 1.5, s < 4 ? 0 : 1];
                    const [px, pz] = [x + ix * row * 0.3 + (layer ? ix * 0.15 : 0), z + iy * row * 0.3 + (layer ? iy * 0.15 : 0)];

                    lists.fresh.push({ matrix: matrix(px - Math.sin(turn) * STAKE.high * 0.5, ground(px, pz) + STAKE.radius * (1 + layer * 1.9), pz - Math.cos(turn) * STAKE.high * 0.5, { turn, tilt: Math.PI / 2 }), section: null });
                }
            }
        });

        // The walkway: boards on each square of it behind the wall standing, on posts on its inner
        // edge every other square
        const walked = new Set();
        const walkway = [...stockade.corners.walk, ...stockade.sections.filter((_, k) => !down.has(k)).flatMap(({ walk }) => walk)];

        for (const square of walkway) {
            const at = `${square[0]},${square[1]}`;

            if (walked.has(at)) {
                continue;
            }

            walked.add(at);

            const [x, z] = [square[0] + 0.5, square[1] + 0.5];
            const y = ground(x, z) + STOCKADE.high;
            const [ix, iy] = inward(square);

            // (Its top where it's walked on)
            lists.timbers.push({ matrix: matrix(x, y - WALK.board / 2, z, { scale: [1, WALK.board, 1] }) });

            if ((square[0] + square[1]) % 2 === 0) {
                const [px, pz] = [x + ix * 0.42, z + iy * 0.42];

                lists.posts.push({ matrix: matrix(px, ground(px, pz) - 0.2, pz, { scale: [WALK.post, STOCKADE.high + 0.15 - WALK.board, WALK.post] }) });
            }
        }

        // Its stairs: from the ground at its foot up to the walkway's height beside its top (as
        // they're walked: core/overworld.js), a tread a step, on a stringer either side, on posts
        for (const { foot, top, onto } of stockade.stairs) {
            const [wx, wz] = onto[onto.length - 1];
            const [low, high] = [ground(...foot), ground(wx + 0.5, wz + 0.5) + STOCKADE.high];
            const length = Math.hypot(top[0] - foot[0], top[1] - foot[1]);
            const [ux, uz] = [(top[0] - foot[0]) / length, (top[1] - foot[1]) / length];
            const [ax, az] = [uz, -ux];
            const at = (t, side = 0) => [foot[0] + (top[0] - foot[0]) * t + ax * side, foot[1] + (top[1] - foot[1]) * t + az * side];

            for (let k = 0; k < STAIR.treads; k++) {
                const [[x0, z0], [x1, z1]] = [at(k / STAIR.treads), at((k + 1) / STAIR.treads)];
                // (Its top as high as the stair's walked at its middle)
                const y = low + (high - low) * ((k + 0.5) / STAIR.treads) - STAIR.tread / 2;

                timber(lists.timbers, [x0, y, z0], [x1, y, z1], 0.94, STAIR.tread);
            }

            for (const side of [-0.47, 0.47]) {
                const [[fx, fz], [tx, tz]] = [at(0, side), at(1, side)];

                timber(lists.timbers, [fx, low - STAIR.stringer / 2, fz], [tx, high - STAIR.stringer / 2, tz], STAIR.girth, STAIR.stringer);

                for (const t of [0.5, 1]) {
                    const [px, pz] = at(t, side);

                    lists.posts.push({ matrix: matrix(px, ground(px, pz) - 0.2, pz, { scale: [WALK.post, low + (high - low) * t - STAIR.stringer - ground(px, pz) + 0.2, WALK.post] }) });
                }
            }
        }

        // The gates: tall posts either side, a lintel over, the leaves swung open inside
        for (const gate of stockade.gates) {
            const [gx, gz] = gate.at;
            const [fx, fz] = [Math.sin(gate.facing), Math.cos(gate.facing)];
            const [ax, az] = [fz, -fx];
            const width = (STOCKADE.gate * 2 + 1) / 2;
            const top = ground(gx, gz) + GATE.high - 0.45;

            for (const side of [-1, 1]) {
                const [px, pz] = [gx + ax * side * width, gz + az * side * width];

                lists.posts.push({ matrix: matrix(px, ground(px, pz) - STAKE.sunk, pz, { scale: [GATE.post, GATE.high, GATE.post] }) });

                // (A leaf, hung on this post, swung in against the wall's inside)
                const [hx, hz] = [px - fx * 0.2, pz - fz * 0.2];
                const leaf = width - 0.1;
                const [ex, ez] = [hx - fx * leaf, hz - fz * leaf];
                const base = ground(hx, hz) + 0.15;

                for (let plank = 0; plank < 5; plank++) {
                    const t = (plank + 0.5) / 5;
                    const [x, z] = [hx + (ex - hx) * t, hz + (ez - hz) * t];

                    lists.timbers.push({ matrix: matrix(x, base + GATE.leaf / 2, z, { turn: Math.atan2(fx, fz), scale: [0.07, GATE.leaf, leaf / 5 - 0.02] }) });
                }

                for (const at of [0.5, GATE.leaf - 0.5]) {
                    timber(lists.timbers, [hx - ax * side * 0.06, base + at, hz - az * side * 0.06], [ex - ax * side * 0.06, base + at, ez - az * side * 0.06], 0.05, 0.16);
                }
            }

            timber(lists.timbers, [gx - ax * (width + 0.3), top, gz - az * (width + 0.3)], [gx + ax * (width + 0.3), top, gz + az * (width + 0.3)], 0.32, 0.28);
        }

        // As meshes, one of each kind, each instance a little its own shade
        const object = new THREE.Group();
        const meshes = {};
        const shade = new THREE.Color();
        const kinds = [
            ["stakes", this.shapes.stake, this.#woodOf(people)],
            ["fresh", this.shapes.stake, this.#woodOf(people, true)],
            ["stumps", this.shapes.stump, this.#woodOf(people)],
            ["fallen", this.shapes.stake, this.#woodOf(people)],
            ["timbers", this.shapes.timber, this.#woodOf(people)],
            ["posts", this.shapes.post, this.#woodOf(people)],
        ];

        object.name = `stockade:${id}`;

        for (const [kind, shape, material] of kinds) {
            const list = lists[kind];

            if (!list.length) {
                continue;
            }

            const mesh = new THREE.InstancedMesh(shape, material, list.length);

            list.forEach(({ matrix: each }, k) => {
                mesh.setMatrixAt(k, each);
                mesh.setColorAt(k, shade.setScalar(random.range(0.82, 1.08)));
            });

            mesh.name = kind;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.computeBoundingSphere();
            object.add(mesh);
            meshes[kind] = { mesh, list };
        }

        this.group.add(object);
        this.drawn.set(id, { key, place: `${stockade.front}:${mx}:${my}`, broken: down, object, meshes, fresh, rising: rising && meshes.fresh ? { sections: rising, since: this.clock } : null });
        this.#rise(this.drawn.get(id));
    }

    // A mended section's stakes rising into place (from the ground, eased)
    #rise(drawn) {
        const rising = drawn.rising;

        if (!rising) {
            return;
        }

        const t = Math.min(1, (this.clock - rising.since) / RISE);
        const eased = 1 - (1 - t) * (1 - t);
        const { mesh, list } = drawn.meshes.fresh;
        const moved = new THREE.Matrix4();

        list.forEach(({ matrix, section, rise }, k) => {
            if (rising.sections.has(section)) {
                moved.copy(matrix);
                moved.elements[13] -= (1 - eased) * rise;
                mesh.setMatrixAt(k, moved);
            }
        });

        mesh.instanceMatrix.needsUpdate = true;

        if (t >= 1) {
            drawn.rising = null;
        }
    }

    /** Move on: mended sections' stakes rising (seconds). */
    update(dt) {
        this.clock += dt;

        for (const drawn of this.drawn.values()) {
            this.#rise(drawn);
        }
    }

    // A stockade no longer drawn
    #letGo(id) {
        const drawn = this.drawn.get(id);

        if (drawn) {
            drawn.object.removeFromParent();

            for (const { mesh } of Object.values(drawn.meshes)) {
                mesh.dispose();
            }

            this.drawn.delete(id);
        }
    }

    /** How many are drawn. */
    get size() {
        return this.drawn.size;
    }

    dispose() {
        for (const id of [...this.drawn.keys()]) {
            this.#letGo(id);
        }

        this.group.removeFromParent();

        for (const shape of Object.values(this.shapes)) {
            shape.dispose();
        }

        for (const material of this.woods.values()) {
            material.dispose();
        }
    }
}
