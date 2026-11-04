/* global console, process */
// How many of each material's triangles a GLB the model pipeline built has, and how many of them
// lie in a box ([x0, y0, z0, x1, y1, z1] metres, glTF's: y up): what a far model's simplifying
// has left of what's seen somewhere (Bellhaven's chasm, its bridge's piers: M_II_1_2). Run from
// the repository's root:
//   node .claude/skills/set-scene-into-world/scripts/materials.mjs <glb> [-200,-50,-92,200,60,-4]
import { createIO } from "../../../../utilities/blenderpipeline/lib/gltf.js";

const [file, inBox = "-200,-50,-92,200,60,-4"] = process.argv.slice(2);
const [x0, y0, z0, x1, y1, z1] = inBox.split(",").map(Number);
const document = await (await createIO()).read(file);
const counts = new Map();

for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();

    if (!mesh) {
        continue;
    }

    const m = node.getWorldMatrix();

    for (const primitive of mesh.listPrimitives()) {
        const [position, index] = [primitive.getAttribute("POSITION"), primitive.getIndices()];
        const name = primitive.getMaterial()?.getName() ?? "(none)";
        const v = [0, 0, 0];
        const at = (k) => {
            position.getElement(k, v);

            return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
        };
        const n = index ? index.getCount() : position.getCount();
        const count = counts.get(name) ?? { inside: 0, all: 0 };

        for (let t = 0; t < n; t += 3) {
            const corners = [0, 1, 2].map((k) => at(index ? index.getScalar(t + k) : t + k));
            const [x, y, z] = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + corner[axis], 0) / 3);

            count.inside += x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1 ? 1 : 0;
            count.all++;
        }

        counts.set(name, count);
    }
}

for (const [name, { inside, all }] of [...counts.entries()].sort((a, b) => b[1].inside - a[1].inside)) {
    console.log(name.padEnd(16), "in the box", String(inside).padStart(7), "of", all);
}
