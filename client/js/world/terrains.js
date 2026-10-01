// The land's heights for the chunks a little way ahead of the player, worked out off the page's
// thread (in a worker: terrain-worker.js) and given to the world's ground (core/terrain/ground.js
// give) to take when the chunks are first made, rather than worked out then: each takes a few
// milliseconds, more on a phone, which adds up to a stall as the player walks into new land. The
// heights are the same either way, so wherever they were worked out, everyone's world agrees.
// Where there are no workers (or one fails), they're worked out when they're wanted, as ever.

import { CHUNKS } from "../core/overworld.js";

/** How far ahead (chunks, each way round the player's) heights are worked out. */
export const AHEAD = 3;

export class Terrains {
    /**
     * @param {object} plan - The world plan.
     * @param {object} ground - The world's ground (core/terrain/ground.js Ground).
     */
    constructor(plan, ground) {
        this.ground = ground;
        this.asked = new Set();
        this.worker = null;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./terrain-worker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { cx, cy, heights } }) => this.ground.give(cx, cy, heights);
        // (Worked out when they're wanted, then)
        this.worker.onerror = () => this.dispose();
        this.worker.postMessage({ plan: { ...plan } });
    }

    /** Work out the heights of the chunks within AHEAD of a chunk that aren't yet (nearest first). */
    ahead(cx, cy) {
        if (!this.worker) {
            return;
        }

        const wanted = [];

        // (Those asked for long ago and far behind can be asked for again, should the player come
        // back once the ground's let them go)
        for (const key of this.asked) {
            if (Math.max(Math.abs((key % CHUNKS) - cx), Math.abs(Math.floor(key / CHUNKS) - cy)) > AHEAD + 4) {
                this.asked.delete(key);
            }
        }

        for (let dy = -AHEAD; dy <= AHEAD; dy++) {
            for (let dx = -AHEAD; dx <= AHEAD; dx++) {
                const [x, y] = [cx + dx, cy + dy];
                const key = y * CHUNKS + x;

                if (x >= 0 && y >= 0 && x < CHUNKS && y < CHUNKS && !this.asked.has(key) && !this.ground.has(x, y)) {
                    this.asked.add(key);
                    wanted.push([Math.max(Math.abs(dx), Math.abs(dy)), x, y]);
                }
            }
        }

        for (const [, x, y] of wanted.sort(([a], [b]) => a - b)) {
            this.worker.postMessage({ cx: x, cy: y });
        }
    }

    /** Stop working heights out. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
    }
}
