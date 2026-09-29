// The settlements a little way ahead of the player, laid out off the page's thread (in a worker:
// layout-worker.js) and given to the world (core/settlements.js give) to take when they're first
// wanted, rather than laid out then: a town takes tens of milliseconds to lay out, a capital a
// couple of hundred (several times that on a phone), which would be a stall as the player comes
// near. The layout is the same either way, so wherever it was laid out, everyone's world agrees.
// Where there are no workers (or one fails), they're laid out when they're wanted, as ever.

import { CHUNKS } from "../core/overworld.js";

/** How far ahead (chunks, each way round the player's) settlements are laid out. */
export const AHEAD = 5;

export class Layouts {
    /** @param {object} settlements - The world's (core/settlements.js Settlements). */
    constructor(settlements) {
        this.settlements = settlements;

        // The places asked for, by id
        this.asked = new Map();
        this.worker = null;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./layout-worker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { id, spec, town } }) => {
            const place = this.asked.get(id);

            if (place) {
                this.settlements.give(place, spec, town);
            }
        };
        // (Laid out when they're wanted, then)
        this.worker.onerror = () => this.dispose();
    }

    /** Lay out the settlements near the chunks within AHEAD of a chunk that aren't yet (nearest first). */
    ahead(cx, cy) {
        if (!this.worker) {
            return;
        }

        const wanted = [];

        for (let dy = -AHEAD; dy <= AHEAD; dy++) {
            for (let dx = -AHEAD; dx <= AHEAD; dx++) {
                if (cx + dx < 0 || cy + dy < 0 || cx + dx >= CHUNKS || cy + dy >= CHUNKS) {
                    continue;
                }

                for (const place of this.settlements.near(cx + dx, cy + dy)) {
                    if (!this.asked.has(place.id) && !this.settlements.laid.has(place.id)) {
                        this.asked.set(place.id, place);
                        wanted.push([Math.max(Math.abs(dx), Math.abs(dy)), place]);
                    }
                }
            }
        }

        for (const [, place] of wanted.sort(([a], [b]) => a - b)) {
            this.worker.postMessage({ id: place.id, spec: this.settlements.specOf(place) });
        }
    }

    /** Stop laying out. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
    }
}
