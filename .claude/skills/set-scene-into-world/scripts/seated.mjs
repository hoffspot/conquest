/* global console, process */
// Whether a scene's rocks (or any pieces of the materials asked for) sit on something, in a GLB the
// model pipeline built: each rock (its triangles joined by shared points), and whether anything
// else (its terrain, its castle, another rock) comes within `--gap` metres of its lower half (it
// sits on that), only of its upper half (it hangs from it), or of none of it (it floats). And the triangles each material keeps. Run from the repository's
// root, on a far model and its full detail alike:
//   node .claude/skills/set-scene-into-world/scripts/seated.mjs <glb> [--rocks M_Rock] [--gap 1]
import { createIO } from "../../../../utilities/blenderpipeline/lib/gltf.js";
import { Matrix4, Vector3 } from "../../../../utilities/blenderpipeline/node_modules/three/build/three.module.js";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [glb] = args;
const rocks = new RegExp(`^${option("--rocks", "M_Rock")}`);
const gap = Number(option("--gap", 1));
const document = await (await createIO()).read(glb);

// Every triangle (9 numbers), and whose it is: a rock's number, or -1
const points = [];
const owners = [];
const counts = {};
let pieces = 0;
const point = new Vector3();

for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();

    if (!mesh || node.getExtras().lod !== undefined) {
        continue;
    }

    const matrix = new Matrix4().fromArray(node.getWorldMatrix());

    for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) {
            continue;
        }

        const material = primitive.getMaterial()?.getName() ?? "-";
        const position = primitive.getAttribute("POSITION");
        const indices = primitive.getIndices();
        const n = position.getCount();
        const at = new Float32Array(n * 3);
        const read = [];

        for (let i = 0; i < n; i++) {
            position.getElement(i, read);
            point.set(read[0], read[1], read[2]).applyMatrix4(matrix);
            at.set([point.x, point.y, point.z], i * 3);
        }

        const count = indices ? indices.getCount() : n;
        const corner = (t) => (indices ? indices.getScalar(t) : t);

        counts[material] = (counts[material] ?? 0) + count / 3;

        // (A rock material's pieces: its points joined by its triangles, and where they're at one place)
        let pieceOf = null;

        if (rocks.test(material)) {
            const parent = Int32Array.from({ length: n }, (_, i) => i);
            const find = (i) => {
                while (parent[i] !== i) {
                    parent[i] = parent[parent[i]];
                    i = parent[i];
                }

                return i;
            };
            const join = (a, b) => {
                [a, b] = [find(a), find(b)];

                if (a !== b) {
                    parent[a] = b;
                }
            };
            const same = new Map();

            for (let i = 0; i < n; i++) {
                const key = `${Math.round(at[i * 3] * 100)},${Math.round(at[i * 3 + 1] * 100)},${Math.round(at[i * 3 + 2] * 100)}`;

                if (same.has(key)) {
                    join(i, same.get(key));
                } else {
                    same.set(key, i);
                }
            }

            for (let t = 0; t < count; t += 3) {
                join(corner(t), corner(t + 1));
                join(corner(t + 1), corner(t + 2));
            }

            const numbers = new Map();

            pieceOf = (i) => {
                const root = find(i);

                if (!numbers.has(root)) {
                    numbers.set(root, pieces++);
                }

                return numbers.get(root);
            };
        }

        for (let t = 0; t < count; t += 3) {
            const [a, b, c] = [corner(t), corner(t + 1), corner(t + 2)];

            points.push(at[a * 3], at[a * 3 + 1], at[a * 3 + 2], at[b * 3], at[b * 3 + 1], at[b * 3 + 2], at[c * 3], at[c * 3 + 1], at[c * 3 + 2]);
            owners.push(pieceOf ? pieceOf(a) : -1);
        }
    }
}

const triangles = Float32Array.from(points);
const owner = Int32Array.from(owners);

// Each rock's points, and how low and high it reaches
const rock = Array.from({ length: pieces }, () => ({ low: Infinity, high: -Infinity, at: [], box: [Infinity, Infinity, -Infinity, -Infinity] }));

for (let t = 0; t < owner.length; t++) {
    if (owner[t] < 0) {
        continue;
    }

    const each = rock[owner[t]];

    for (let p = 0; p < 9; p += 3) {
        const [x, y, z] = [triangles[t * 9 + p], triangles[t * 9 + p + 1], triangles[t * 9 + p + 2]];

        each.low = Math.min(each.low, y);
        each.high = Math.max(each.high, y);
        each.at.push(x, y, z);
        each.box = [Math.min(each.box[0], x), Math.min(each.box[1], z), Math.max(each.box[2], x), Math.max(each.box[3], z)];
    }
}

// The triangles by the 2 m cells they're over, to look down through
const CELL = 2;
const cells = new Map();

for (let t = 0; t < owner.length; t++) {
    const xs = [triangles[t * 9], triangles[t * 9 + 3], triangles[t * 9 + 6]];
    const zs = [triangles[t * 9 + 2], triangles[t * 9 + 5], triangles[t * 9 + 8]];

    for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
        for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) {
            const key = cx * 100003 + cz;

            if (!cells.has(key)) {
                cells.set(key, []);
            }

            cells.get(key).push(t);
        }
    }
}

// How near a point comes to a triangle (metres: its nearest point on it, Ericson's way)
function distance(px, py, pz, t) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(t * 9, t * 9 + 9);
    const [abx, aby, abz, acx, acy, acz, apx, apy, apz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az, px - ax, py - ay, pz - az];
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    const to = (x, y, z) => Math.hypot(px - x, py - y, pz - z);

    if (d1 <= 0 && d2 <= 0) {
        return to(ax, ay, az);
    }

    const [bpx, bpy, bpz] = [px - bx, py - by, pz - bz];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;

    if (d3 >= 0 && d4 <= d3) {
        return to(bx, by, bz);
    }

    const vc = d1 * d4 - d3 * d2;

    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);

        return to(ax + abx * v, ay + aby * v, az + abz * v);
    }

    const [cpx, cpy, cpz] = [px - cx, py - cy, pz - cz];
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;

    if (d6 >= 0 && d5 <= d6) {
        return to(cx, cy, cz);
    }

    const vb = d5 * d2 - d1 * d6;

    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);

        return to(ax + acx * w, ay + acy * w, az + acz * w);
    }

    const va = d3 * d6 - d5 * d4;

    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
        const w = (d4 - d3) / (d4 - d3 + (d5 - d6));

        return to(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
    }

    const denom = 1 / (va + vb + vc);
    const [v, w] = [vb * denom, vc * denom];

    return to(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

// Whether anything but `self` comes within `gap` of a point
function touches(x, y, z, self) {
    const [gx, gz] = [Math.floor(x / CELL), Math.floor(z / CELL)];

    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            for (const t of cells.get((gx + dx) * 100003 + gz + dz) ?? []) {
                if (owner[t] === self) {
                    continue;
                }

                const ys = [triangles[t * 9 + 1], triangles[t * 9 + 4], triangles[t * 9 + 7]];

                if (y < Math.min(...ys) - gap || y > Math.max(...ys) + gap) {
                    continue;
                }

                if (distance(x, y, z, t) <= gap) {
                    return true;
                }
            }
        }
    }

    return false;
}

// Each rock: what touches it, at its lower half (it sits on that), or only higher (it hangs)
const off = [];
let hanging = 0;

for (let k = 0; k < pieces; k++) {
    const { low, high, at, box } = rock[k];
    const middle = (low + high) / 2;
    let [below, above] = [false, false];

    for (let i = 0; i < at.length && !below; i += 3) {
        const lower = at[i + 1] <= middle;

        if ((lower || !above) && touches(at[i], at[i + 1], at[i + 2], k)) {
            below ||= lower;
            above ||= !lower;
        }
    }

    hanging += !below && above ? 1 : 0;

    if (!below) {
        off.push({ k, touching: above, low, high, box, across: Math.max(box[2] - box[0], box[3] - box[1], high - low) });
    }
}

off.sort((a, b) => b.across - a.across);
console.log(`${glb}: ${owner.length} triangles; by material ${JSON.stringify(Object.entries(counts).sort((a, b) => b[1] - a[1]))}`);
console.log(`${pieces} rocks; nothing within ${gap} m of their lower half: ${off.length} (${off.filter(({ across }) => across >= 3).length} of them 3 m or more across), ${hanging} of them touching higher up, ${off.length - hanging} touching nothing`);

for (const { touching, low, high, box, across } of off.slice(0, 15)) {
    console.log(`  ${across.toFixed(1)} m across, at ${((box[0] + box[2]) / 2).toFixed(0)}, ${((box[1] + box[3]) / 2).toFixed(0)}, ${low.toFixed(1)} to ${high.toFixed(1)} m up: ${touching ? "touching only higher up" : "touching nothing"}`);
}
