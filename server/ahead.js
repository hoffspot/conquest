// What a world needs near its players made ahead of need, between its steps, so that a step never
// waits on making it (generated/world_server_plan.md §3.1). In the browser the game's drawing does
// this as a side effect: the chunks round the player are made as they're drawn, the settlements
// a little further off laid out (world/layouts.js) and the navigation's tiles baked (world/
// navbaker.js) off the page's thread. The server draws nothing, so without this the world's
// steps would make each chunk, settlement and tile the moment someone first walked into it: tens
// of milliseconds a chunk, a couple of hundred a capital, held up in the middle of a step.
//
// So round each player out in the world (core/runner.js bakeAhead asks: around), the chunks within
// AHEAD.chunks are made a few at a time between steps (pump, AHEAD.budget each time), the
// settlements near laid out on a worker, and the navigation's tiles baked on another once their
// ground's made (server/workers.js gives Node the workers). And the insides of the buildings
// opened near them (core/host.js open: their folk about) have their meshes baked between steps
// too, a tile at a time, before their folk first walk there.

import { keepRooms, navigatorOf } from "../client/js/core/navigation.js";
import { CHUNK, CHUNKS } from "../client/js/core/overworld.js";
import { Layouts } from "../client/js/world/layouts.js";
import { NavBaker } from "../client/js/world/navbaker.js";

export const AHEAD = Object.freeze({
    // How far round a player (chunks, each way) the world's chunks are made; and how far round
    // them (m, at the least) the navigation's tiles are baked: further than the browser's
    // (core/runner.js RUNNER.bakeReach), as a way that falls short is looked for again over the
    // tiles up to three further out (core/navigation.js path), and those near a player are baked
    // where they're wanted, not waited for
    chunks: 3,
    reach: 160,
    // How many buildings' insides keep their navigation (core/navigation.js keepRooms): the open
    // buildings of a few towns, players in each
    rooms: 64,
    // How long (ms) each pump may spend making chunks; and how many navigation tiles it sends off
    budget: 8,
    tiles: 8,
});

export class Ahead {
    /**
     * @param {object} world - The world (core/overworld.js buildWorld's: its overworld, maps.town).
     * @param {object} [options]
     * @param {object} [options.host] - The world's host (core/host.js), for the buildings it's
     *     opened (their insides' meshes baked ahead too); none, they aren't.
     * @param {function} [options.clock] - The time (ms), to keep each pump within AHEAD.budget.
     */
    constructor(world, { host = null, clock = () => performance.now() } = {}) {
        this.world = world;
        this.overworld = world.maps.town;
        this.host = host;
        this.clock = clock;

        keepRooms(AHEAD.rooms);

        // The navigation's tiles, baked on a worker (those a way's waiting for, too, after those
        // round the players: core/navigation.js later)
        const navigation = navigatorOf(this.overworld);

        this.navBaker = new NavBaker(navigation);

        if (this.navBaker.worker) {
            navigation.later = (tx, ty) => this.navBaker.want(tx, ty);
            navigation.widenLater = true;
        }

        this.layouts = this.overworld.settlements ? new Layouts(this.overworld.settlements) : null;

        /** The chunks waiting to be made ([cx, cy], nearest a player first). */
        this.chunks = [];

        /** How many chunks it's made (not what the steps made), and buildings' insides' tiles baked. */
        this.made = 0;
        this.rooms = 0;
    }

    /**
     * Have what's round a point out in the world (metres) made ahead: the chunks within
     * AHEAD.chunks of its own, nearest first; the settlements near laid out; and the navigation's
     * tiles within `reach` baked, each once its ground's made.
     */
    around(x, y, reach) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
        const wanted = [];

        for (let dy = -AHEAD.chunks; dy <= AHEAD.chunks; dy++) {
            for (let dx = -AHEAD.chunks; dx <= AHEAD.chunks; dx++) {
                const [ax, ay] = [cx + dx, cy + dy];

                if (ax >= 0 && ay >= 0 && ax < CHUNKS && ay < CHUNKS && !this.#made(ax, ay)) {
                    wanted.push([ax, ay, Math.max(Math.abs(dx), Math.abs(dy))]);
                }
            }
        }

        wanted.sort((a, b) => a[2] - b[2]);

        const first = new Set(wanted.map(([ax, ay]) => ay * CHUNKS + ax));

        this.chunks = [...wanted.map(([ax, ay]) => [ax, ay]), ...this.chunks.filter(([ax, ay]) => !first.has(ay * CHUNKS + ax))];
        this.layouts?.ahead(cx, cy);
        this.navBaker.around(x, y, Math.max(reach, AHEAD.reach));
    }

    /**
     * Between steps: make the chunks waiting for as long as AHEAD.budget allows (at least one);
     * with none waiting, a tile of an open building's inside; then send the next of the
     * navigation's tiles off to be baked.
     */
    pump() {
        const until = this.clock() + AHEAD.budget;

        while (this.chunks.length) {
            const [cx, cy] = this.chunks.shift();

            if (!this.#made(cx, cy)) {
                this.overworld.chunk(cx, cy);
                this.made++;
            }

            if (this.clock() >= until) {
                break;
            }
        }

        if (!this.chunks.length) {
            this.#inside();
        }

        this.navBaker.pump(AHEAD.tiles);
    }

    // The next tile not baked yet of the insides of the buildings the host has open, baked
    // (Recast's tens of milliseconds: one at a time); whether there was one
    #inside() {
        for (const key of this.host?.open.keys() ?? []) {
            for (const id of this.world.interiors?.buildings.get(key)?.maps ?? []) {
                const map = this.world.maps[id];
                const navigation = map && navigatorOf(map);
                const tile = navigation && this.#unbaked(navigation);

                if (tile) {
                    navigation.ensure(...tile);
                    this.rooms++;

                    return true;
                }
            }
        }

        return false;
    }

    // A tile of a building's inside's mesh not baked yet ([tx, ty]), or null
    #unbaked(navigation) {
        const { tile } = navigation.measures;

        for (let ty = 0; ty * tile < navigation.size[1]; ty++) {
            for (let tx = 0; tx * tile < navigation.size[0]; tx++) {
                if (!navigation.has(tx, ty)) {
                    return [tx, ty];
                }
            }
        }

        return null;
    }

    /**
     * Whether all that's been asked for is made: no chunk waiting, no navigation tile waiting or
     * being baked. (A player arriving waits for this before their world's clock starts:
     * generated/world_server_plan.md §4.)
     */
    get settled() {
        const baker = this.navBaker;

        return !this.chunks.length && !baker.queue.length && !baker.wanted.length && !baker.asked.size && !this.#insideWaiting();
    }

    // Whether any open building's inside has a tile not baked yet
    #insideWaiting() {
        for (const key of this.host?.open.keys() ?? []) {
            for (const id of this.world.interiors?.buildings.get(key)?.maps ?? []) {
                const map = this.world.maps[id];

                if (map && this.#unbaked(navigatorOf(map))) {
                    return true;
                }
            }
        }

        return false;
    }

    // Whether a chunk's been made (and is kept)
    #made(cx, cy) {
        return this.overworld.made(cx * CHUNK, cy * CHUNK, cx * CHUNK, cy * CHUNK);
    }

    /** Stop: the workers ended. */
    dispose() {
        this.navBaker.dispose();
        this.layouts?.dispose();
        this.chunks = [];
    }
}
