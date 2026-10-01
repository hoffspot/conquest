// Navigation tiles baked ahead of need, off the page's thread (navworker.js): the triangles of a
// tile worked out here (core/navigation/tiles.js: the world's ground and what stands on it, which
// only the page has), baked there (Recast's few milliseconds a tile), and added to the mesh when
// they come back. A tile wanted before then is baked where it's wanted (core/navigation.js
// ensure), to the same bytes. Where there are no workers (or one fails), every tile is.
//
// The game has the tiles round each player baked so (around, then pump each frame: one tile's
// triangles worked out a frame), so the ways the battle finds near them (core/battle.js) seldom
// wait for a tile to be baked.

export class NavBaker {
    /** @param {object} navigation - The Navigation (core/navigation.js) the tiles are for. */
    constructor(navigation) {
        this.navigation = navigation;
        this.asked = new Set();
        this.worker = null;
        this.onBaked = null;

        // The tiles waiting to be sent off (around), nearest first
        this.queue = [];

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

        const input = this.navigation.input(tx, ty);

        this.asked.add(key);
        this.worker.postMessage({ tx, ty, input }, [input.positions.buffer, input.indices.buffer, input.areas.buffer]);
    }

    /**
     * Have every tile within `reach` metres of a point baked that isn't, the nearest first, a
     * few a frame (pump). What was waiting from before is put after them.
     */
    around(x, y, reach) {
        const { tile } = this.navigation.measures;
        const [tx0, ty0] = this.navigation.tileOf(x - reach, y - reach);
        const [tx1, ty1] = this.navigation.tileOf(x + reach, y + reach);
        const wanted = [];

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                if (!this.navigation.has(tx, ty) && !this.asked.has(`${tx} ${ty}`)) {
                    wanted.push([tx, ty, Math.hypot((tx + 0.5) * tile - x, (ty + 0.5) * tile - y)]);
                }
            }
        }

        wanted.sort((a, b) => a[2] - b[2]);

        const first = new Set(wanted.map(([tx, ty]) => `${tx} ${ty}`));

        this.queue = [...wanted.map(([tx, ty]) => [tx, ty]), ...this.queue.filter(([tx, ty]) => !first.has(`${tx} ${ty}`))];
    }

    /**
     * Send off the next `most` tiles waiting (each frame): those whose ground has been made (the
     * world's chunks, made as they're drawn: making them here, for a tile, would take a frame's
     * time several times over), the others left waiting.
     */
    pump(most = 1) {
        const { tile, border } = this.navigation.measures;
        const world = this.navigation.world;
        const waiting = [];

        for (let sent = 0; sent < most && this.queue.length; ) {
            const [tx, ty] = this.queue.shift();

            if (this.navigation.has(tx, ty) || this.asked.has(`${tx} ${ty}`)) {
                continue;
            }

            if (world.made && !world.made(tx * tile - border, ty * tile - border, (tx + 1) * tile + border, (ty + 1) * tile + border)) {
                waiting.push([tx, ty]);
                continue;
            }

            this.bake(tx, ty);
            sent++;
        }

        this.queue.push(...waiting);
    }

    /** Stop baking off the page's thread. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.asked.clear();
        this.queue = [];
    }
}
