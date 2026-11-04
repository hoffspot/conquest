/* global console, process */
// The land as the far land draws it (read every 1, 8, 16 and 32 metres on the world's lattice,
// between them bilinear) against a scene's own terrain: how far it comes up through it where it's
// kept (round what stands on it), and how far under it it lies on the open side of where the two
// meet. Run from the repository's root:
//   node .claude/skills/set-scene-into-world/scripts/farland.mjs <seed>
import { landHeight, scenesIn } from "../../../../client/js/core/terrain/height.js";
import { toWorld } from "../../../../client/js/core/terrain/scenes.js";
import { planWorld } from "../../../../client/js/core/worldplan/plan.js";
const seed = Number(process.argv[2] ?? 1);
const plan = planWorld(seed);
const [placed] = scenesIn(plan);
const { scene } = placed;
const g = scene.ground;
const [w, d] = g.size;
const cache = new Map();
const lat = (x, y) => { const key = `${x},${y}`; if (!cache.has(key)) {cache.set(key, landHeight(plan, x, y));} return cache.get(key); };
for (const step of [1, 8, 16, 32]) {
    cache.clear();
    const drawn = (x, y) => {
        const [i, j] = [Math.floor(x / step), Math.floor(y / step)];
        const [u, v] = [x / step - i, y / step - j];
        const [a, b, c, e] = [lat(i * step, j * step), lat((i + 1) * step, j * step), lat(i * step, (j + 1) * step), lat((i + 1) * step, (j + 1) * step)];
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
    };
    const pokes = [], cracks = [];
    for (let pz = 1; pz < d - 1; pz++) {for (let px = 1; px < w - 1; px++) {
        const k = pz * w + px;
        if (!g.has[k]) {continue;}
        const [sx, sz] = [g.origin[0] + (px + 0.5) * 2, g.origin[1] + (pz + 0.5) * 2];
        const h = drawn(...toWorld(placed, sx, sz)) - placed.base;
        const seam = [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => g.open[k + dz * w + dx] !== g.open[k]));
        if (!g.open[k]) {pokes.push([h - g.top[k], sx, sz, seam]);}
        else if (seam) {cracks.push([g.top[k] - h, sx, sz]);}
    }}
    const stat = (list, name) => {
        list.sort((a, b) => b[0] - a[0]);
        const q = (f) => list[Math.floor(f * (list.length - 1))][0].toFixed(2);
        console.log(`  ${name} (${list.length}): max ${q(0)} p0.1 ${q(0.001)} p1 ${q(0.01)} p10 ${q(0.1)}; over 0.5 m: ${list.filter((e) => e[0] > 0.5).length}, over 2 m: ${list.filter((e) => e[0] > 2).length}; worst ${list.slice(0, 3).map((e) => `${e[1]},${e[2]}${e[3] ? " (seam)" : ""}`).join("; ")}`);
    };
    console.log(`step ${step} m`);
    stat(pokes, "land up through the kept terrain");
    stat(cracks, "land under the cut edge, open side");
}
