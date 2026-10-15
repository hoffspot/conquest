// Navigation tiles baked ahead of need, off the page's thread (navworker.js): the triangles of a
// tile worked out here (core/navigation/tiles.js: the world's ground and what stands on it, which
// only the page has), baked there (Recast's few milliseconds a tile), and added to the mesh when
// they come back. A tile wanted before then is baked where it's wanted (core/navigation.js
// ensure), to the same bytes. Where there are no workers (or one fails), every tile is.
//
// The game has the tiles round each player baked so (around, then pump each frame: one tile's
// triangles worked out a frame), so the ways the battle finds near them (core/battle.js) seldom
// wait for a tile to be baked, those nearest the player all at once as it loads (ready); and
// those the ways of anyone else are waiting for (want: the navigation's later), after them, so a
// creature or a soldier further off never holds a step up while the world under its way is made
// and baked.

/** How many tiles ways are waiting for are kept waiting at most (the longest waiting let go). */
export const WANTED = 256;

export class NavBaker {
    /** @param {object} navigation - The Navigation (core/navigation.js) the tiles are for. */
    constructor(navigation) {
        this.navigation = navigation;
        this.asked = new Set();
        this.worker = null;
        this.onBaked = null;

        // The tiles waiting to be sent off (around), nearest first; and those ways are waiting
        // for (want), the longest waiting first
        this.queue = [];
        this.wanted = [];

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
     * Have every tile within `reach` metres of a point baked now, not a frame at a time, the
     * world's ground under them made here first if need be (as the game loads, with nothing
     * being drawn): each sent off in a turn of its own (the page's other work going on between),
     * resolving once they're all in, or after `patience` ms (a worker gone quiet: those not in
     * then are baked where they're wanted, as ever).
     */
    async ready(x, y, reach, { patience = 10000 } = {}) {
        const { tile } = this.navigation.measures;
        const [width, height] = this.navigation.size;
        const [tx0, ty0] = this.navigation.tileOf(x - reach, y - reach);
        const [tx1, ty1] = this.navigation.tileOf(x + reach, y + reach);
        const tiles = [];
        const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

        for (let ty = Math.max(0, ty0); ty <= ty1 && ty * tile < height; ty++) {
            for (let tx = Math.max(0, tx0); tx <= tx1 && tx * tile < width; tx++) {
                tiles.push(`${tx} ${ty}`);
                this.bake(tx, ty);
                await turn();
            }
        }

        const end = performance.now() + patience;

        while (tiles.some((key) => this.asked.has(key)) && performance.now() < end) {
            await turn();
        }
    }

    /**
     * Have a tile baked that a way's waiting for (core/navigation.js later), after those round
     * the players, if it isn't in or asked for or waiting already. At most WANTED wait (the
     * longest waiting let go: a way still waiting for it asks again).
     */
    want(tx, ty) {
        if (this.navigation.has(tx, ty) || this.asked.has(`${tx} ${ty}`) || this.wanted.some(([x, y]) => x === tx && y === ty)) {
            return;
        }

        this.wanted.push([tx, ty]);

        if (this.wanted.length > WANTED) {
            this.wanted.shift();
        }
    }

    /**
     * Send off the next `most` tiles waiting (each frame), those round the players first: those
     * whose ground has been made (the world's chunks, made as they're drawn: making them here,
     * for a tile, would take a frame's time several times over), the others left waiting.
     */
    pump(most = 1) {
        let sent = 0;

        for (const list of [this.queue, this.wanted]) {
            sent += this.#send(list, most - sent);
        }
    }

    // Send off up to `most` of a list's tiles whose ground has been made, the rest left in it as
    // they were. Returns how many were sent
    #send(list, most) {
        const { tile, border } = this.navigation.measures;
        const world = this.navigation.world;
        const waiting = [];
        let sent = 0;

        while (sent < most && list.length) {
            const [tx, ty] = list.shift();

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

        list.unshift(...waiting);

        return sent;
    }

    /** Stop baking off the page's thread. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.asked.clear();
        this.queue = [];
        this.wanted = [];
    }
}
