// A creature's body sculpted in one piece: the shapes it's made of (ellipsoids and tapered limbs,
// each hung from one of its joints) melted together where they meet, as clay would be, into one
// smooth skin, and that skin bound to its joints so it bends with them (a skinned mesh): a neck
// flowing into the shoulders, a thigh into the haunch, no seams.
//
// How: each shape is a signed distance (how far a point is outside it), and the body is where the
// nearest of them, blended smoothly (a smooth minimum), is below nothing. That's sampled on a
// grid round the body and its surface found (surface nets: a point in each cell the surface
// passes through, joined into quads). Each point of the skin is then bound to the joints of the
// shapes nearest it (the nearer, the more), and coloured as they are (blending where they meet),
// with markings painted on (spots, stripes, a pale belly: `paint`), a grain to the colour (fur,
// scales, bark) and a darker back and paler underside, as animals have.
//
// A body's made once for each kind (`key`) and shared by every one of it after.

import * as THREE from "three";
import { ellipsoid, limb, part, skin } from "./shapes.js";

const bodies = new Map();

// About how many points a body's skin has (twice as many triangles)
const BUDGET = 4200;

// A smooth minimum of two distances, blending within k of each other
function smin(a, b, k) {
    if (k <= 0) {
        return Math.min(a, b);
    }

    const h = Math.max(k - Math.abs(a - b), 0) / k;

    return Math.min(a, b) - h * h * k * 0.25;
}

// How far a point (in an ellipsoid's own frame) is outside it: near enough (Quilez's)
function ellipsoidDistance(x, y, z, rx, ry, rz) {
    const k0 = Math.hypot(x / rx, y / ry, z / rz);
    const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));

    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

// How far a point (in a limb's own frame: from its root at 0, 0, 0 down -y, `length` long, r0 wide
// at its root and r1 at its end) is outside it: a rounded cone (Quilez's)
function limbDistance(x, y, z, length, r0, r1) {
    const qx = Math.hypot(x, z);
    const qy = -y;
    const b = (r0 - r1) / length;

    if (Math.abs(b) >= 1) {
        return Math.min(Math.hypot(qx, qy) - r0, Math.hypot(qx, qy - length) - r1);
    }

    const a = Math.sqrt(1 - b * b);
    const k = -b * qx + a * qy;

    if (k < 0) {
        return Math.hypot(qx, qy) - r0;
    }

    if (k > a * length) {
        return Math.hypot(qx, qy - length) - r1;
    }

    return qx * a + qy * b - r0;
}

// A shape's distance, from a point in the body's frame
function distanceOf(shape, x, y, z) {
    const m = shape.inverse;
    const lx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const ly = m[1] * x + m[5] * y + m[9] * z + m[13];
    const lz = m[2] * x + m[6] * y + m[10] * z + m[14];

    return (shape.limb ? limbDistance(lx, ly, lz, ...shape.limb) : ellipsoidDistance(lx, ly, lz, ...shape.ellipsoid)) * shape.stretch;
}

// A little value noise (0 to 1), for the grain of a skin
function hash(x, y, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);
    const lerp = (a, b, t) => a + (b - a) * t;
    const corner = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);

    return lerp(
        lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), sx), lerp(corner(0, 1, 0), corner(1, 1, 0), sx), sy),
        lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), sx), lerp(corner(0, 1, 1), corner(1, 1, 1), sx), sy),
        sz,
    );
}

// Cells (for scales and plates): how near a point is to the edge of the cell it's in (0 at an edge)
function cells(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    let first = 9;
    let second = 9;

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const cx = ix + dx + hash(ix + dx, iy + dy, iz + dz);
                const cy = iy + dy + hash(iy + dy, iz + dz, ix + dx);
                const cz = iz + dz + hash(iz + dz, ix + dx, iy + dy);
                const d = Math.hypot(x - cx, y - cy, z - cz);

                if (d < first) {
                    second = first;
                    first = d;
                } else if (d < second) {
                    second = d;
                }
            }
        }
    }

    return second - first;
}

/**
 * The grain of a skin at a point (metres, in the body's frame), as a share to darken or lighten
 * its colour by: fur (fine, a little streaked), scales, bark (long ridges up it), stone, or slick.
 */
function grain(kind, size, x, y, z) {
    switch (kind) {
        case "fur":
            return (noise(x / size, y / (size * 2.5), z / size) - 0.5) * 0.22 + (noise(x / (size * 6), y / (size * 6), z / (size * 6)) - 0.5) * 0.18;
        case "scales":
            return Math.min(1, cells(x / size, y / size, z / size) * 3) * 0.3 - 0.2 + (noise(x / (size * 5), y / (size * 5), z / (size * 5)) - 0.5) * 0.15;
        case "bark":
            return (noise(x / size, y / (size * 7), z / size) - 0.5) * 0.7 + (noise(x / (size * 0.4), y / size, z / (size * 0.4)) - 0.5) * 0.15;
        case "stone":
            return Math.min(1, cells(x / size, y / size, z / size) * 4) * 0.25 - 0.18 + (noise(x / (size * 0.3), y / (size * 0.3), z / (size * 0.3)) - 0.5) * 0.2;
        default:
            return (noise(x / (size * 4), y / (size * 4), z / (size * 4)) - 0.5) * 0.08;
    }
}

/** A body to sculpt: add shapes and paint markings to it, then build it. */
export class Sculpt {
    /**
     * @param {object} options
     * @param {number} options.blend - How far shapes melt into each other (metres).
     * @param {number} [options.detail] - The finest a shape is sampled (metres: a grid cell).
     * @param {string} [options.grain] - Its skin's grain: fur, scales, bark, stone or slick.
     * @param {number} [options.grainSize] - How fine the grain is (metres).
     * @param {number} [options.countershade] - How much darker its back and paler its underside.
     */
    constructor({ blend, detail = null, grain: kind = "fur", grainSize = 0.02, countershade = 0.12 }) {
        this.blend = blend;
        this.detail = detail;
        this.grain = kind;
        this.grainSize = grainSize;
        this.countershade = countershade;
        this.shapes = [];
        this.paints = [];
    }

    /**
     * Add a shape hung from a joint (placed as part() places a mesh): `shape` is { ellipsoid:
     * [rx, ry, rz] } or { limb: [length, r0, r1] }; `colour` a hex number or THREE.Color;
     * `blend` how far it melts into what it touches (else the body's); `group` a separate piece
     * that doesn't melt into the others (a jaw, to open).
     */
    add(joint, shape, colour, { at = [0, 0, 0], turn = [0, 0, 0], scale = null, blend = this.blend, group = 0 } = {}) {
        this.shapes.push({ joint, ...shape, colour: new THREE.Color(colour), at, turn, scale, blend, group });

        return this;
    }

    /** Paint a marking on: the skin inside a shape (an ellipsoid) coloured, fading out over `soft` metres. */
    paint(joint, ellipsoid, colour, { at = [0, 0, 0], turn = [0, 0, 0], soft = 0.02, strength = 1 } = {}) {
        this.paints.push({ joint, ellipsoid, colour: new THREE.Color(colour), at, turn, scale: null, soft, strength, blend: 0 });

        return this;
    }

    /**
     * Build the body: its skin, bound to the joints under `root` (which must be in its resting
     * pose), with `material` (its colours come from the shapes: vertex colours). Made once for each
     * `key` and shared after.
     */
    build(root, material, key = null) {
        root.updateMatrixWorld(true);

        const bones = [];

        root.traverse((node) => {
            if (node.isBone) {
                bones.push(node);
            }
        });

        let body = key ? bodies.get(key) : null;

        if (!body) {
            body = this.#mesh(root, bones);

            if (key) {
                bodies.set(key, body);
            }
        }

        // (Shapes too thin for the skin's fineness, made as pieces of their own)
        for (const index of body.thin) {
            const shape = this.shapes[index];
            const geometry = shape.limb ? limb(...shape.limb, 6) : ellipsoid(...shape.ellipsoid, 8);

            part(shape.joint, geometry, skin(shape.colour.getHex(), { roughness: material.roughness }), { at: shape.at, turn: shape.turn, scale: shape.scale });
        }

        material.vertexColors = true;

        const mesh = new THREE.SkinnedMesh(body.geometry, material);

        mesh.castShadow = true;
        mesh.frustumCulled = false;
        root.add(mesh);
        mesh.bind(new THREE.Skeleton(bones));

        return mesh;
    }

    // Each shape's frame (from the body's to its own), and the box it fills in the body's
    #place(root, shapes) {
        const inverseRoot = root.matrixWorld.clone().invert();

        for (const shape of shapes) {
            const local = new THREE.Matrix4().compose(new THREE.Vector3(...shape.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...shape.turn)), new THREE.Vector3(...(shape.scale ?? [1, 1, 1])));
            const matrix = inverseRoot.clone().multiply(shape.joint.matrixWorld).multiply(local);
            const extent = shape.limb ? [Math.max(shape.limb[1], shape.limb[2]), shape.limb[0] + Math.max(shape.limb[1], shape.limb[2]), Math.max(shape.limb[1], shape.limb[2])] : shape.ellipsoid;
            const box = new THREE.Box3();
            const low = shape.limb ? [-extent[0], -shape.limb[0] - shape.limb[2], -extent[2]] : extent.map((r) => -r);
            const high = shape.limb ? [extent[0], shape.limb[1], extent[2]] : extent;

            for (const cx of [low[0], high[0]]) {
                for (const cy of [low[1], high[1]]) {
                    for (const cz of [low[2], high[2]]) {
                        box.expandByPoint(new THREE.Vector3(cx, cy, cz).applyMatrix4(matrix));
                    }
                }
            }

            shape.matrix = matrix;
            shape.inverse = matrix.clone().invert().elements;
            shape.stretch = shape.scale ? Math.min(...shape.scale) : 1;
            shape.box = box;
        }
    }

    #mesh(root, bones) {
        const shapes = this.shapes;

        this.#place(root, shapes);
        this.#place(root, this.paints);

        // The grid over the whole body (and a little more): as fine as gives its skin about BUDGET
        // points (the cells the surface crosses go as the square of the fineness: counted on a
        // coarse grid first)
        const bounds = new THREE.Box3();

        for (const shape of shapes) {
            bounds.union(shape.box);
        }

        const longest = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
        const groupsOf = (list) => [...new Set(list.map((shape) => shape.group))].map((group) => list.filter((shape) => shape.group === group));
        const coarse = this.#grid(bounds, longest / 40);
        const crossed = groupsOf(shapes).reduce((sum, group) => sum + this.#crossings(this.#field(group, coarse), coarse), 0);
        const cell = Math.max(longest / 160, Math.min(coarse.cell * Math.sqrt(crossed / BUDGET), this.detail ?? Infinity));

        // (What's thinner than that is left out of the skin, and made as a piece of its own: a
        // tail's tip, the bones of a wing)
        const thickness = (shape) => (shape.limb ? Math.max(shape.limb[1], shape.limb[2]) : [...shape.ellipsoid].sort((a, b) => a - b)[1] * shape.stretch);
        const thin = shapes.map((shape, index) => (thickness(shape) < cell * 0.8 ? index : -1)).filter((index) => index >= 0);
        const kept = shapes.filter((shape, index) => !thin.includes(index));
        const grid = this.#grid(bounds, cell);
        const positions = [];
        const indices = [];

        for (const group of groupsOf(kept)) {
            this.#surface(this.#field(group, grid), grid, positions, indices);
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        this.#skin(geometry, bones, kept);
        geometry.computeBoundingSphere();

        return { geometry, thin };
    }

    // A grid of cells `cell` across over a box (and a little more)
    #grid(bounds, cell) {
        const box = bounds.clone().expandByScalar(cell * 2 + this.blend);
        const size = box.getSize(new THREE.Vector3());

        return { nx: Math.ceil(size.x / cell) + 1, ny: Math.ceil(size.y / cell) + 1, nz: Math.ceil(size.z / cell) + 1, origin: box.min, cell };
    }

    // Some shapes melted together, sampled at each point of a grid (each shape only near it)
    #field(shapes, { nx, ny, nz, origin, cell }) {
        const field = new Float32Array(nx * ny * nz).fill(1e3);

        for (const shape of shapes) {
            const reach = shape.blend + cell;
            const i0 = Math.max(0, Math.floor((shape.box.min.x - reach - origin.x) / cell));
            const i1 = Math.min(nx - 1, Math.ceil((shape.box.max.x + reach - origin.x) / cell));
            const j0 = Math.max(0, Math.floor((shape.box.min.y - reach - origin.y) / cell));
            const j1 = Math.min(ny - 1, Math.ceil((shape.box.max.y + reach - origin.y) / cell));
            const k0 = Math.max(0, Math.floor((shape.box.min.z - reach - origin.z) / cell));
            const k1 = Math.min(nz - 1, Math.ceil((shape.box.max.z + reach - origin.z) / cell));

            for (let k = k0; k <= k1; k++) {
                const z = origin.z + k * cell;

                for (let j = j0; j <= j1; j++) {
                    const y = origin.y + j * cell;

                    for (let i = i0; i <= i1; i++) {
                        const index = i + nx * (j + ny * k);

                        field[index] = smin(field[index], distanceOf(shape, origin.x + i * cell, y, z), shape.blend);
                    }
                }
            }
        }

        return field;
    }

    // How many of a grid's cells the surface passes through
    #crossings(field, { nx, ny, nz }) {
        let count = 0;

        for (let k = 0; k < nz - 1; k++) {
            for (let j = 0; j < ny - 1; j++) {
                for (let i = 0; i < nx - 1; i++) {
                    const inside = field[i + nx * (j + ny * k)] < 0;

                    if (inside !== field[i + 1 + nx * (j + ny * k)] < 0 || inside !== field[i + nx * (j + 1 + ny * k)] < 0 || inside !== field[i + nx * (j + ny * (k + 1))] < 0) {
                        count++;
                    }
                }
            }
        }

        return count;
    }

    // A surface netted from its field: a point in each cell it passes through, joined in quads
    #surface(field, { nx, ny, nz, origin, cell }, positions, indices) {
        const at = (i, j, k) => i + nx * (j + ny * k);

        // A point in each cell the surface passes through: where it crosses the cell's edges, averaged
        const cellsX = nx - 1;
        const cellsY = ny - 1;
        const vertexOf = new Int32Array(cellsX * cellsY * (nz - 1)).fill(-1);
        const cellAt = (i, j, k) => i + cellsX * (j + cellsY * k);
        const first = positions.length / 3;
        const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
        const corner = new Float32Array(8);
        let count = 0;

        for (let k = 0; k < nz - 1; k++) {
            for (let j = 0; j < ny - 1; j++) {
                for (let i = 0; i < nx - 1; i++) {
                    let inside = 0;

                    for (let c = 0; c < 8; c++) {
                        corner[c] = field[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
                        inside += corner[c] < 0 ? 1 : 0;
                    }

                    if (inside === 0 || inside === 8) {
                        continue;
                    }

                    let sx = 0;
                    let sy = 0;
                    let sz = 0;
                    let crossings = 0;

                    for (const [a, b] of EDGES) {
                        if ((corner[a] < 0) !== (corner[b] < 0)) {
                            const t = corner[a] / (corner[a] - corner[b]);

                            sx += (a & 1) + ((b & 1) - (a & 1)) * t;
                            sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
                            sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
                            crossings++;
                        }
                    }

                    positions.push(origin.x + (i + sx / crossings) * cell, origin.y + (j + sy / crossings) * cell, origin.z + (k + sz / crossings) * cell);
                    vertexOf[cellAt(i, j, k)] = first + count++;
                }
            }
        }

        // Each grid edge the surface crosses: a quad of the four cells round it, facing out
        const quad = (a, b, c, d, flip) => {
            if (a < 0 || b < 0 || c < 0 || d < 0) {
                return;
            }

            const [p, q, r, s] = flip ? [a, d, c, b] : [a, b, c, d];
            const diagonal = (u, v) => Math.hypot(positions[u * 3] - positions[v * 3], positions[u * 3 + 1] - positions[v * 3 + 1], positions[u * 3 + 2] - positions[v * 3 + 2]);

            if (diagonal(p, r) < diagonal(q, s)) {
                indices.push(p, q, r, p, r, s);
            } else {
                indices.push(p, q, s, q, r, s);
            }
        };

        for (let k = 1; k < nz - 1; k++) {
            for (let j = 1; j < ny - 1; j++) {
                for (let i = 1; i < nx - 1; i++) {
                    const here = field[at(i, j, k)] < 0;

                    // (Along x, y and z from this grid point)
                    if (here !== field[at(i + 1, j, k)] < 0) {
                        quad(vertexOf[cellAt(i, j - 1, k - 1)], vertexOf[cellAt(i, j, k - 1)], vertexOf[cellAt(i, j, k)], vertexOf[cellAt(i, j - 1, k)], !here);
                    }

                    if (here !== field[at(i, j + 1, k)] < 0) {
                        quad(vertexOf[cellAt(i - 1, j, k - 1)], vertexOf[cellAt(i - 1, j, k)], vertexOf[cellAt(i, j, k)], vertexOf[cellAt(i, j, k - 1)], !here);
                    }

                    if (here !== field[at(i, j, k + 1)] < 0) {
                        quad(vertexOf[cellAt(i - 1, j - 1, k)], vertexOf[cellAt(i, j - 1, k)], vertexOf[cellAt(i, j, k)], vertexOf[cellAt(i - 1, j, k)], !here);
                    }
                }
            }
        }
    }

    // Bind each point of the skin to the joints of the shapes nearest it, and colour it
    #skin(geometry, bones, shapes) {
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const count = position.count;
        const skinIndex = new Uint16Array(count * 4);
        const skinWeight = new Float32Array(count * 4);
        const colours = new Float32Array(count * 3);
        const boneOf = new Map(bones.map((bone, index) => [bone, index]));
        const colour = new THREE.Color();
        const tint = new THREE.Color();
        const point = new THREE.Vector3();

        for (let v = 0; v < count; v++) {
            const x = position.getX(v);
            const y = position.getY(v);
            const z = position.getZ(v);

            point.set(x, y, z);

            const distances = shapes.map((shape) => (shape.box.distanceToPoint(point) > shape.blend * 3 + 0.05 ? 1e3 : distanceOf(shape, x, y, z)));
            const nearest = Math.min(...distances);
            const byBone = new Map();

            colour.setRGB(0, 0, 0);

            let total = 0;

            shapes.forEach((shape, s) => {
                const over = distances[s] - nearest;

                if (over > shape.blend * 4 + 1e-4) {
                    return;
                }

                const width = shape.blend * 0.5 + 1e-4;
                const weight = Math.exp(-over / width);
                const tone = Math.exp(-over / (width * 0.5));
                const bone = boneOf.get(shape.joint) ?? 0;

                byBone.set(bone, (byBone.get(bone) ?? 0) + weight);
                colour.r += shape.colour.r * tone;
                colour.g += shape.colour.g * tone;
                colour.b += shape.colour.b * tone;
                total += tone;
            });

            colour.multiplyScalar(1 / Math.max(total, 1e-6));

            // Its markings, painted on
            for (const paint of this.paints) {
                if (paint.box.distanceToPoint(point) > paint.soft) {
                    continue;
                }

                const inside = Math.min(1, Math.max(0, 0.5 - distanceOf(paint, x, y, z) / paint.soft));

                colour.lerp(tint.copy(paint.colour), inside * paint.strength);
            }

            // Its grain, and a darker back and paler underside
            const shade = 1 + grain(this.grain, this.grainSize, x, y, z) - normal.getY(v) * this.countershade;

            colour.multiplyScalar(Math.max(0.2, shade));
            colours.set([colour.r, colour.g, colour.b], v * 3);

            // The four joints it's most bound to
            const strongest = [...byBone.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sum = strongest.reduce((all, [, weight]) => all + weight, 0);

            strongest.forEach(([bone, weight], slot) => {
                skinIndex[v * 4 + slot] = bone;
                skinWeight[v * 4 + slot] = weight / sum;
            });
        }

        geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
        geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    }
}

const folds = new Map();

// Is a piece animated on its own (its own transform or material changing: a slime's bubbles, a
// wisp's light), so it has to stay a piece of its own?
function alive(node) {
    for (let each = node; each; each = each.parent) {
        if (each.userData.alive) {
            return true;
        }
    }

    return Boolean(node.material.userData.alive);
}

/**
 * Fold a creature's pieces (its eyes, teeth, horns, quills, bones...: each a mesh hung from one of
 * its joints) into a few skinned meshes, one for each kind of material they're made of (glowing,
 * see-through, two-sided, faceted, plain), each piece bound wholly to its joint and coloured as it
 * was: a few things to draw instead of dozens. Pieces animated on their own (`userData.alive`,
 * on them or their material) are left as they are. Made once for each `key` and shared after.
 * Returns what became of each material (old: new).
 */
export function fold(root, key = null) {
    root.updateMatrixWorld(true);

    const bones = [];

    root.traverse((node) => {
        if (node.isBone) {
            bones.push(node);
        }
    });

    const boneOf = new Map(bones.map((bone, index) => [bone, index]));
    const skeleton = root.children.find((node) => node.isSkinnedMesh)?.skeleton ?? new THREE.Skeleton(bones);
    const inverseRoot = root.matrixWorld.clone().invert();
    const pieces = [];

    root.traverse((node) => {
        if (node.isMesh && !node.isSkinnedMesh && !alive(node)) {
            pieces.push(node);
        }
    });

    // By kind of material
    const kinds = new Map();

    for (const piece of pieces) {
        const material = piece.material;
        const glowing = material.emissive && material.emissiveIntensity * Math.max(material.emissive.r, material.emissive.g, material.emissive.b) > 0.3;
        const kind = glowing ? "glow" : `${material.flatShading ? "flat" : "smooth"}|${material.side}|${material.transparent ? "clear" : "solid"}`;

        if (!kinds.has(kind)) {
            kinds.set(kind, []);
        }

        kinds.get(kind).push(piece);
    }

    const became = new Map();
    const matrix = new THREE.Matrix4();

    for (const kind of [...kinds.keys()].sort()) {
        const members = kinds.get(kind);
        const cacheKey = key ? `${key}:${kind}` : null;
        let geometry = cacheKey ? folds.get(cacheKey) : null;

        if (!geometry) {
            const positions = [];
            const normals = [];
            const colours = [];
            const skinIndex = [];

            for (const piece of members) {
                const part = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
                let bone = piece.parent;

                while (bone && !bone.isBone) {
                    bone = bone.parent;
                }

                part.applyMatrix4(matrix.multiplyMatrices(inverseRoot, piece.matrixWorld));

                const material = piece.material;
                const colour = kind === "glow" ? material.emissive.clone().multiplyScalar(Math.min(3, material.emissiveIntensity)).add(material.color.clone().multiplyScalar(0.2)) : material.color;
                const count = part.attributes.position.count;

                positions.push(...part.attributes.position.array);
                normals.push(...(part.attributes.normal?.array ?? new Float32Array(count * 3)));

                for (let v = 0; v < count; v++) {
                    colours.push(colour.r, colour.g, colour.b);
                    skinIndex.push(boneOf.get(bone) ?? 0, 0, 0, 0);
                }

                part.dispose();
            }

            geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
            geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
            geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinIndex.map((_, index) => (index % 4 === 0 ? 1 : 0)), 4));
            geometry.computeBoundingSphere();

            if (cacheKey) {
                folds.set(cacheKey, geometry);
            }
        }

        // Its material: as its pieces' were, on the whole
        const average = (read) => members.reduce((sum, piece) => sum + read(piece.material), 0) / members.length;
        const first = members[0].material;
        const material =
            kind === "glow"
                ? new THREE.MeshBasicMaterial({ vertexColors: true })
                : new THREE.MeshStandardMaterial({
                      vertexColors: true,
                      roughness: average((each) => each.roughness ?? 0.8),
                      metalness: average((each) => each.metalness ?? 0),
                      flatShading: first.flatShading,
                      side: first.side,
                      transparent: first.transparent,
                      opacity: average((each) => each.opacity),
                      depthWrite: first.depthWrite,
                  });
        const mesh = new THREE.SkinnedMesh(geometry, material);

        mesh.castShadow = kind !== "glow" && !first.transparent;
        mesh.frustumCulled = false;
        root.add(mesh);
        mesh.bind(skeleton);

        for (const piece of members) {
            became.set(piece.material, material);
        }
    }

    for (const piece of pieces) {
        piece.removeFromParent();
        piece.material.dispose();
    }

    return became;
}
