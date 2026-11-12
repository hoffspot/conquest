// The land's heights for the chunks a little way ahead of the player, worked out off the page's
// thread (in a worker: terrain-worker.js) and given to the world's ground (core/terrain/ground.js
// give) to take when the chunks are first made, rather than worked out then: each takes a few
// milliseconds, more on a phone, which adds up to a stall as the player walks into new land. The
// heights are the same either way, so wherever they were worked out, everyone's world agrees.
// Where there are no workers (or one fails), they're worked out when they're wanted, as ever.

import { CHUNK, CHUNKS } from "../core/overworld.js";

/** How far ahead (chunks, each way round the player's) heights are worked out, and trails found. */
export const AHEAD = 3;
const TRAILS_AHEAD = 5;

export class Terrains {
    /**
     * @param {object} plan - The world plan.
     * @param {object} ground - The world's ground (core/terrain/ground.js Ground).
     * @param {object} [trails] - The world's trails up into the hills (core/trails.js Trails),
     *     whose ways are found ahead too.
     */
    constructor(plan, ground, trails = null) {
        this.ground = ground;
        this.trails = trails;
        this.asked = new Set();
        this.routing = new Set();
        this.worker = null;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./terrain-worker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { cx, cy, heights, trail, points } }) => {
            if (trail) {
                this.trails?.give(trail, points);
            } else {
                this.ground.give(cx, cy, heights);
            }
        };
        // (Worked out when they're wanted, then)
        this.worker.onerror = () => this.dispose();
        this.worker.postMessage({ plan: { ...plan }, keepOut: trails?.keepOut ?? [] });
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

        // (And the trails whose room comes within TRAILS_AHEAD, each asked for once)
        for (let dy = -TRAILS_AHEAD; dy <= TRAILS_AHEAD && this.trails; dy++) {
            for (let dx = -TRAILS_AHEAD; dx <= TRAILS_AHEAD; dx++) {
                for (const trail of this.trails.near(cx + dx, cy + dy, CHUNK)) {
                    if (trail.points === null && !this.routing.has(trail.id)) {
                        this.routing.add(trail.id);
                        this.worker.postMessage({ trail: { id: trail.id, from: trail.from, to: trail.to, box: trail.box, avoid: trail.avoid } });
                    }
                }
            }
        }
    }

    /**
     * Work out the heights of these chunks too ([[cx, cy]...]), those that aren't kept or asked
     * for, and find the trails whose room comes near them: what's wanted further off than `ahead`
     * looks (the ground the world says it will soon want: core/host.js soon).
     */
    want(chunks) {
        if (!this.worker) {
            return;
        }

        for (const [cx, cy] of chunks) {
            const key = cy * CHUNKS + cx;

            if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS) {
                continue;
            }

            if (!this.asked.has(key) && !this.ground.has(cx, cy)) {
                this.asked.add(key);
                this.worker.postMessage({ cx, cy });
            }

            for (const trail of this.trails?.near(cx, cy, CHUNK) ?? []) {
                if (trail.points === null && !this.routing.has(trail.id)) {
                    this.routing.add(trail.id);
                    this.worker.postMessage({ trail: { id: trail.id, from: trail.from, to: trail.to, box: trail.box, avoid: trail.avoid } });
                }
            }
        }
    }

    /**
     * Whether a chunk's better left a moment before it's made: a trail whose room comes near it
     * is still being found here (found where the chunk's made, it's tens of milliseconds, now and
     * then a couple of hundred).
     */
    finding(cx, cy) {
        return Boolean(this.worker) && (this.trails?.near(cx, cy, CHUNK) ?? []).some((trail) => trail.points === null && trail.given === null && this.routing.has(trail.id));
    }

    /** Stop working heights out. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
    }
}
