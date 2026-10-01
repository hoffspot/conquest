// Navigation tiles baked ahead of need, off the page's thread (navworker.js): the triangles of a
// tile worked out here (core/navigation/tiles.js: the world's ground and what stands on it, which
// only the page has), baked there (Recast's few milliseconds a tile), and added to the mesh when
// they come back. A tile wanted before then is baked where it's wanted (core/navigation.js
// ensure), to the same bytes. Where there are no workers (or one fails), every tile is.

import { tileInput } from "../core/navigation/tiles.js";

export class NavBaker {
    /** @param {object} navigation - The Navigation (core/navigation.js) the tiles are for. */
    constructor(navigation) {
        this.navigation = navigation;
        this.asked = new Set();
        this.worker = null;
        this.onBaked = null;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./navworker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { tx, ty, data } }) => {
            this.asked.delete(`${tx} ${ty}`);
            this.navigation.add(tx, ty, data);
            this.onBaked?.(tx, ty);
        };
        this.worker.onerror = () => this.dispose();
    }

    /** Have a tile baked, if it isn't in or asked for already (here and now, without a worker). */
    bake(tx, ty) {
        const key = `${tx} ${ty}`;

        if (this.navigation.has(tx, ty) || this.asked.has(key)) {
            return;
        }

        if (!this.worker) {
            this.navigation.ensure(tx, ty);
            this.onBaked?.(tx, ty);

            return;
        }

        const input = tileInput(this.navigation.world, tx, ty);

        this.asked.add(key);
        this.worker.postMessage({ tx, ty, input }, [input.positions.buffer, input.indices.buffer, input.areas.buffer]);
    }

    /** Stop baking off the page's thread. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.asked.clear();
    }
}
