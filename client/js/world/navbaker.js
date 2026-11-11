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
//
// A copy of a world someone else hosts finds no ways of its own (it takes the host's: core/
// netplay.js), but its battle still asks the mesh whether a walker stepping round someone stays
// on it (core/battle.js #clear), and a tile not in is baked there, in the step. So the game has
// the tiles each of the host's ways runs over baked as the way's heard (along), some steps before
// it's played: after those round its own hero, as the tiles ways wait for are.
//
// And a building's floors, small maps with meshes of their own (core/navigation.js floorOf), are
// baked here too as the building's got ready (floor), before its folk first walk them: kept by
// the navigation till the floor's mesh is made (bakedAhead), which takes them, not baking them.

import { bakedAhead, floorOf, floorWants, forgetAhead } from "../core/navigation.js";

/** How many tiles ways are waiting for are kept waiting at most (the longest waiting let go). */
export const WANTED = 256;

/**
 * A way's tiles baked for a copy (along): those within `reach` metres of it (the few metres round
 * a walker the mesh is asked about), for its first `far` metres from its walker (a longer way's
 * next tiles are far off in time too, and the walker's next way brings them).
 */
export const ALONG = Object.freeze({ reach: 4, far: 96 });

/** How many of the floors' tiles are sent off at once (floor, then each pump): a scene's are 132. */
export const FLOOR_TILES = 16;

export class NavBaker {
    /** @param {object} navigation - The Navigation (core/navigation.js) the tiles are for. */
    constructor(navigation) {
        this.navigation = navigation;
        this.asked = new Set();

        // How often each tile asked for had changed when it was (the navigation's changed), by
        // its key: what comes back is taken only if it's changed no more since
        this.sent = new Map();
        this.worker = null;
        this.onBaked = null;

        // The tiles waiting to be sent off (around), nearest first; and those ways are waiting
        // for (want), the longest waiting first
        this.queue = [];
        this.wanted = [];

        // The small maps whose tiles are baked here too (floor), by the number each is known to
        // the worker by; and their tiles still to send ([number, tx, ty])
        this.floors = new Map();
        this.floorTiles = [];
        this.floorsMade = 0;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./navworker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { mesh, tx, ty, data } }) => {
            // (A floor's: kept for its mesh, unless its map's been let go of meanwhile)
            if (mesh) {
                const floor = this.floors.get(mesh);

                this.asked.delete(`${mesh} ${tx} ${ty}`);

                if (floor) {
                    bakedAhead(floor.map, tx, ty, data);
                }

                return;
            }

            const key = `${tx} ${ty}`;
            const was = this.sent.get(key);

            this.asked.delete(key);
            this.sent.delete(key);

            // (What stands on it changed while it was away, a fortification gone up or come
            // down: it's the ground as it was, and is baked again from what's there now. Added,
            // it stayed, a tile this game alone had wrong)
            if (was !== undefined && was !== this.navigation.changed(tx, ty)) {
                this.bake(tx, ty);

                return;
            }

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

        // (With its mesh's own measures: one that isn't the overworld's, a town laid out on its
        // own with its mesh shown, was baked as the overworld's)
        this.asked.add(key);
        this.sent.set(key, this.navigation.changed(tx, ty));
        this.worker.postMessage({ tx, ty, input, measures: this.navigation.measures }, [input.positions.buffer, input.indices.buffer, input.areas.buffer]);
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
     * Have the tiles a way runs over baked, for a copy of someone else's world (`from`: where its
     * walker stands, [x, y]; `way`: its corners, as the host found it): those within ALONG.reach
     * of its first ALONG.far metres that aren't in, asked for or waiting already, after those
     * round the players, as the tiles ways wait for (want). Nothing without a worker: a tile's
     * then baked where it's wanted, as ever. Whatever of the way isn't a point is left out (it's
     * the host's word, off the wire).
     */
    along(from, way) {
        if (!this.worker || !Array.isArray(way)) {
            return;
        }

        const { tile } = this.navigation.measures;
        const { reach } = ALONG;
        const round = (x, y) => {
            const [tx0, ty0] = this.navigation.tileOf(x - reach, y - reach);
            const [tx1, ty1] = this.navigation.tileOf(x + reach, y + reach);

            for (let ty = Math.max(0, ty0); ty <= ty1; ty++) {
                for (let tx = Math.max(0, tx0); tx <= tx1; tx++) {
                    this.want(tx, ty);
                }
            }
        };
        let [x, y] = from;
        let left = ALONG.far;

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        round(x, y);

        for (const corner of way) {
            const [cx, cy] = Array.isArray(corner) ? corner : [];
            const length = Math.hypot(cx - x, cy - y);

            if (!Number.isFinite(length)) {
                return;
            }

            // (A point every quarter of a tile along it, at the least: no tile it passes within
            // reach of is stepped over)
            const far = Math.min(length, left);
            const steps = Math.max(1, Math.ceil(far / (tile / 4)));

            for (let k = 1; k <= steps && length > 0; k++) {
                const t = (far * k) / steps / length;

                round(x + (cx - x) * t, y + (cy - y) * t);
            }

            left -= length;

            if (left <= 0) {
                return;
            }

            [x, y] = [cx, cy];
        }
    }

    /**
     * Have a small map's tiles baked (a building's floor, as it's got ready: core/navigation.js
     * floorOf), every one that's neither in its mesh nor baked already: their triangles worked
     * out here (a floor's take a fraction of a millisecond) and sent off, FLOOR_TILES now and as
     * many each pump; each kept by the navigation as it comes back (bakedAhead) till the floor's
     * mesh is made, which takes it. Nothing without a worker, or for the Overworld.
     */
    floor(map) {
        if (!this.worker || !map || !floorOf(map)) {
            return;
        }

        let number = [...this.floors].find(([, floor]) => floor.map === map)?.[0];

        if (!number) {
            number = ++this.floorsMade;
            this.floors.set(number, { map, floor: floorOf(map) });
        }

        const { size, measures } = this.floors.get(number).floor;

        for (let ty = 0; ty * measures.tile < size[1]; ty++) {
            for (let tx = 0; tx * measures.tile < size[0]; tx++) {
                if (!this.floorTiles.some(([n, x, y]) => n === number && x === tx && y === ty)) {
                    this.floorTiles.push([number, tx, ty]);
                }
            }
        }

        this.#sendFloors();
    }

    /** Let go of a small map's tiles (its building let go of): those still to send, and those kept for its mesh. */
    forget(map) {
        for (const [number, floor] of this.floors) {
            if (floor.map === map) {
                this.floors.delete(number);
                this.floorTiles = this.floorTiles.filter(([n]) => n !== number);
            }
        }

        forgetAhead(map);
    }

    // Send off the next FLOOR_TILES of the floors' tiles that still want baking
    #sendFloors() {
        let sent = 0;

        while (sent < FLOOR_TILES && this.floorTiles.length) {
            const [number, tx, ty] = this.floorTiles.shift();
            const { map, floor } = this.floors.get(number) ?? {};
            const key = `${number} ${tx} ${ty}`;

            if (!map || this.asked.has(key) || !floorWants(map, tx, ty)) {
                continue;
            }

            const input = floor.input(tx, ty);

            this.asked.add(key);
            this.worker.postMessage({ mesh: number, tx, ty, input, measures: floor.measures }, [input.positions.buffer, input.indices.buffer, input.areas.buffer]);
            sent++;
        }
    }

    /**
     * Send off the next `most` tiles waiting (each frame), those round the players first: those
     * whose ground has been made (the world's chunks, made as they're drawn: making them here,
     * for a tile, would take a frame's time several times over), the others left waiting. And
     * the next of the floors' tiles (floor).
     */
    pump(most = 1) {
        let sent = 0;

        for (const list of [this.queue, this.wanted]) {
            sent += this.#send(list, most - sent);
        }

        if (this.worker && this.floorTiles.length) {
            this.#sendFloors();
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
        this.sent.clear();
        this.queue = [];
        this.wanted = [];

        for (const { map } of this.floors.values()) {
            forgetAhead(map);
        }

        this.floors.clear();
        this.floorTiles = [];
    }
}
