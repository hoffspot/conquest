// The rivers seen from afar (the far land has the lakes and the sea, but its corners are too far
// apart for a river's channel): each river's course (core/terrain/waters.js), a ribbon of water on
// its surface, as wide as the river (but never so narrow it's lost a long way off). Pure: worked out
// in a worker (silhouette-worker.js), drawn by silhouettes.js.

import { RUNNING, watersOf } from "../../core/terrain/waters.js";
import { CELL, CELLS } from "../../core/worldplan/plan.js";

/**
 * How wide a river's ribbon is drawn at least (metres), and how far over its surface (metres); and
 * how it looks (world/water.js STILL_WATER): so deep (metres), over a bed this much as light as
 * dry (wet).
 */
export const FAR_RIVERS = Object.freeze({ narrowest: 4, over: 0.4, depth: 1.5, wet: 0.62 });

/** How many numbers each corner takes: x, y (up), z. */
export const RIVER_FLOATS = 3;

/**
 * The rivers (not the mountain streams) from `from` to `reach` metres round (x, z): a Float32Array
 * of triangles' corners (RIVER_FLOATS numbers each), two triangles a piece of each river's course.
 */
export function gatherRivers(plan, { x, z, reach, from = 0 }) {
    const waters = watersOf(plan);
    const running = waters.running;
    const out = [];
    const [c0, c1] = [Math.max(0, Math.floor((x - reach) / CELL)), Math.min(CELLS - 1, Math.floor((x + reach) / CELL))];
    const [r0, r1] = [Math.max(0, Math.floor((z - reach) / CELL)), Math.min(CELLS - 1, Math.floor((z + reach) / CELL))];

    for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
            const k = cy * CELLS + cx;
            const distance = Math.hypot((cx + 0.5) * CELL - x, (cy + 0.5) * CELL - z);

            if (running[k] !== RUNNING.river || distance > reach + CELL || distance < from - CELL) {
                continue;
            }

            for (const { ax, ay, bx, by, dx, dy, half, surface, stream } of waters.course(k)?.pieces ?? []) {
                if (stream) {
                    continue;
                }

                // (Across the river: its way turned a quarter; each end as wide as it is there)
                const [wa, wb] = half.map((h) => Math.max(FAR_RIVERS.narrowest / 2, h));
                const [px, py] = [-dy, dx];
                const [ha, hb] = [surface[0] + FAR_RIVERS.over, surface[1] + FAR_RIVERS.over];
                const corners = [
                    [ax + px * wa, ha, ay + py * wa],
                    [ax - px * wa, ha, ay - py * wa],
                    [bx + px * wb, hb, by + py * wb],
                    [bx - px * wb, hb, by - py * wb],
                ];

                for (const index of [0, 1, 2, 2, 1, 3]) {
                    out.push(...corners[index]);
                }
            }
        }
    }

    return Float32Array.from(out);
}
