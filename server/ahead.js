// What a world needs near its players made ahead of need, between its steps, so that a step never
// waits on making it (generated/world_server_plan.md §3.1). In the browser the game's drawing does
// this as a side effect: the chunks round the player are made as they're drawn, the settlements
// a little further off laid out (world/layouts.js) and the navigation's tiles baked (world/
// navbaker.js) off the page's thread. The server draws nothing, so without this the world's
// steps would make each chunk, settlement and tile the moment someone first walked into it: tens
// of milliseconds a chunk, a couple of hundred a capital, held up in the middle of a step.
//
// So round each player out in the world (core/runner.js bakeAhead asks: around), the chunks within
// AHEAD.chunks are made between steps, a piece of one at a time (pump, AHEAD.budget each time:
// core/overworld.js chunkWithin), their land's heights worked out on a worker first (world/
// terrains.js), the settlements near laid out on another, and the navigation's tiles baked on a
// third once their ground's made (server/workers.js gives Node the workers). And the insides of
// the buildings opened near them (core/host.js open: their folk about) have their meshes baked
// between steps too, a tile at a time, before their folk first walk there.
//
// Given the world's host, it asks it besides what the world will soon want (core/host.js soon,
// twice a second: generated/multiplayer_scaling_plan.md 1-6): the ground a town's soldiers, its
// townsfolk, a camp or an army will be stood on in the step a player comes near enough, made
// after what's round the players; and a dungeon's levels, worked out on the layouts' worker
// before anyone's at its door. From the same answer it knows where the players are now: what was
// waiting round one who's gone (out of the world, or through a portal to somewhere else) is let
// go, and the world keeps as many chunks as those who are here want (core/overworld.js keep), so
// that it never lets one go to make another.
//
// And it's told where those not yet in will stand (expect: those waiting their turn to come in,
// core/netplay.js Session coming, and at a server's start the heroes who were last in the world;
// generated/multiplayer_scaling_plan.md 1-26): the chunks round each, the ground a town by them
// will stand its soldiers and townsfolk on as they arrive (core/host.js soon's `theirs`) and the
// navigation's tiles round them are made after what's round the players who are in, in the order
// they wait, and kept as a player's are; and it says when one's are made (grounded), for the world
// to let them in then and not before (Session ground). Without it each who came back, and
// everyone after a restart, came to ground the step they arrived in had to make.

import { keepRooms, navigatorOf } from "../client/js/core/navigation.js";
import { CHUNK, CHUNKS } from "../client/js/core/overworld.js";
import { Layouts } from "../client/js/world/layouts.js";
import { NavBaker } from "../client/js/world/navbaker.js";
import { Terrains } from "../client/js/world/terrains.js";

export const AHEAD = Object.freeze({
    // How far round a player (chunks, each way) the world's chunks are made; and how far round
    // them (m, at the least) the navigation's tiles are baked: further than the browser's
    // (core/runner.js RUNNER.bakeReach), as a way that falls short is looked for again over the
    // tiles up to three further out (core/navigation.js path), and those near a player are baked
    // where they're wanted, not waited for
    chunks: 3,
    reach: 160,
    // How many buildings' insides keep their navigation (core/navigation.js keepRooms) at the
    // least: the open buildings of a few towns, players in each. More are kept while more are open
    // (every open building's, and `spare` besides: a dungeon's levels, a building walked into), or
    // baking them ahead would let one go to make another, over and over
    rooms: 64,
    spare: 16,
    // How long (ms) each pump may spend making chunks; and how many navigation tiles it sends off
    budget: 8,
    tiles: 8,
    // How many more chunks the world keeps than its players and what's wanted soon take (those
    // the steps make for themselves besides: a way's far end, an army's road), so that making
    // one of those never lets go of one a player's standing by
    spareChunks: 64,
    // How many more navigation tiles the mesh keeps than those round its players (those the
    // steps' ways bake for themselves besides: round a way that falls short, along an army's
    // road), so that baking one of those never lets go of one a player's standing by
    spareTiles: 256,
    // How long (ms) a chunk waits for its land's heights, or a settlement by it, to come back
    // from a worker before it's made without them (worked out here, as ever: a worker gone quiet)
    patience: 2000,
    // Round one not yet in (expect): how far the chunks are made (each way, of AHEAD.chunks: the
    // rest once they're in, as round anyone), and how far the navigation's tiles are baked (m)
    // before their ground's said to be made (grounded)
    coming: Object.freeze({ chunks: 2, reach: 96 }),
    // What's no longer wanted (the ground round players who've gone, and its navigation) let go
    // a little each pump, not all at the look after they went: so many chunks, with their
    // heights, and so many of the navigation's tiles at the most. Some six towns' ground a
    // second, at a server's two pumps a step (49 chunks round each); a hundred towns' in seven
    ease: Object.freeze({ chunks: 16, tiles: 32 }),
});

// The chunks a box of squares touches, on the world: [[cx, cy]...]
function chunksIn([x0, y0, x1, y1]) {
    const chunks = [];

    for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(CHUNKS - 1, Math.floor(y1 / CHUNK)); cy++) {
        for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(CHUNKS - 1, Math.floor(x1 / CHUNK)); cx++) {
            chunks.push([cx, cy]);
        }
    }

    return chunks;
}

export class Ahead {
    /**
     * Whether what the host says the world will soon want (core/host.js soon) is made ahead, as
     * it always is, or only what's round the players: only for the tests and scripts that check
     * the world's steps come out the same either way, and what it saves them.
     */
    static soon = true;

    /**
     * Whether what's round those not yet in is made ahead (expect) and waited for (grounded), as
     * it always is, or nothing's made for them till they're in and none of them waits, as it
     * was: only for the tests and scripts that check the world's steps come out the same either
     * way, and what it saves them.
     */
    static coming = true;

    /**
     * Whether what's no longer wanted is let go a little each pump (AHEAD.ease), as it always
     * is, or all of it at the look after it stopped being wanted, the navigation's tiles as the
     * next is added, as it was: only for the tests and scripts that check the world's steps come
     * out the same either way (generated/multiplayer_scaling_plan.md 1-27).
     */
    static easing = true;

    /**
     * Whether the host is asked what the war's next turn will bring near its players as well
     * (core/host.js soon's `turn`), and that ground made ahead, as it always is, or only what
     * the war has near them now, as it was: only for the tests and scripts that check the
     * world's steps come out the same either way, and what it saves them
     * (generated/multiplayer_scaling_plan.md 1-28).
     */
    static turns = true;

    /**
     * @param {object} world - The world (core/overworld.js buildWorld's: its overworld, maps.town).
     * @param {object} [options]
     * @param {object} [options.host] - The world's host (core/host.js), for the buildings it's
     *     opened (their insides' meshes baked ahead too), where its players are and what it will
     *     soon want (soon); none, only what's asked for (around) is made.
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

        this.layouts = this.overworld.settlements ? new Layouts(this.overworld.settlements, world.interiors ?? null) : null;

        // The land's heights for the chunks waiting, and the trails' ways near them, worked out
        // on a worker as the browser's are (a fifth of a chunk's making, off the world's thread)
        this.terrains = this.overworld.ground ? new Terrains(world.plan, this.overworld.ground, this.overworld.trails ?? null) : null;

        /** The chunks waiting to be made ([cx, cy], nearest a player first, then what's wanted soon). */
        this.chunks = [];

        /** How many chunks it's made (not what the steps made), and buildings' insides' tiles baked. */
        this.made = 0;
        this.rooms = 0;

        /** How many chunks the players and what's wanted soon take now (with a host: #review). */
        this.wanted = 0;

        /**
         * How many chunks the world's to keep, once it's let go of those it has over that
         * (#ease: null, not looked over yet); and how many chunks and navigation tiles have been
         * let go by easing, a few each pump.
         */
        this.keeping = null;
        this.eased = { chunks: 0, tiles: 0 };

        /**
         * What the war's next turn will bring near the players (core/host.js soon's `foreseen`):
         * how many boxes of ground the host last said it would want that nothing wants yet, and
         * how many chunks have been made for such, in all.
         */
        this.turn = { boxes: 0, chunks: 0 };
        this.turnChunks = new Set();
        navigation.gently = Ahead.easing;

        /**
         * How far round each player the navigation's tiles are baked now (m: AHEAD.reach, or
         * less with more players apart than the mesh has room for at that: #tiles), and how many
         * tiles that takes.
         */
        this.reach = AHEAD.reach;
        this.tiles = 0;

        // When the host was last asked what's wanted (its look round's time: asked again once
        // it's looked round again, or a player's moved), and since when each chunk has waited on
        // a worker (#awaited)
        this.asked = null;
        this.stale = true;
        this.waited = new Map();

        /**
         * Where those not yet in will stand (expect: [[x, y]...], in the order they wait), and
         * what each wants made, as it was last looked over (#review), by `${x},${y}`: { chunks
         * (their keys), ready (whether it was all found made, since) }.
         */
        this.coming = [];
        this.needs = new Map();
        this.expected = "";
        this.tilesAt = 0;
    }

    /**
     * Where those not yet in the world will stand when they come ([[x, y]...], metres, the first
     * to come first: core/host.js whereFor's), told as often as it may have changed (each look):
     * what's round each is made ahead after what's round the players in, and kept, till they're
     * no longer among them (in, and so among the players; or gone).
     */
    expect(places) {
        const coming = Ahead.coming ? places : [];
        const expected = coming.map(([x, y]) => `${x},${y}`).join(" ");

        if (expected !== this.expected) {
            this.expected = expected;
            this.coming = [...new Map(coming.map((place) => [`${place[0]},${place[1]}`, place])).values()];
            this.stale = true;
        }
    }

    /**
     * Whether what one who'd be stood at a place wants is made: the chunks within
     * AHEAD.coming.chunks of them, the ground a town near them will stand its people on as they
     * come, and the navigation's tiles within AHEAD.coming.reach of them (or as far as they're
     * baked round anyone now, if that's less: #tiles). Of a place it hasn't been told of yet
     * (expect), as the host says now what one there would want: so one whose ground is made
     * already, come to where others are, waits for nothing.
     */
    grounded(x, y) {
        if (!Ahead.coming) {
            return true;
        }

        const one = this.needs.get(`${x},${y}`) ?? this.#needsOf(x, y);

        if (one.ready) {
            return true;
        }

        if (one.chunks.some((key) => !this.#made(key % CHUNKS, Math.floor(key / CHUNKS)))) {
            return false;
        }

        const { navigation } = this.navBaker;

        one.ready = this.#tilesRound(x, y).every(([tx, ty]) => navigation.has(tx, ty));

        return one.ready;
    }

    // What one who'd be stood at a place wants made, asked of the host for them alone (till
    // what's wanted is next looked over, #review, which asks for everyone not yet in at once),
    // and kept: { chunks, ready }
    #needsOf(x, y) {
        const theirs = (Ahead.soon && this.host?.soon?.([[x, y]]).theirs?.[0]) || [];
        const one = { chunks: this.#chunksFor(x, y, theirs), ready: false };

        this.needs.set(`${x},${y}`, one);

        return one;
    }

    // The chunks one who'd be stood at a place wants (their keys, nearest them first): those
    // within AHEAD.coming.chunks of theirs, then those under the boxes the host says a town by
    // them would stand its people on (`theirs`: [[x0, y0, x1, y1]...], squares)
    #chunksFor(x, y, theirs) {
        const ring = this.#ring(Math.floor(x / CHUNK), Math.floor(y / CHUNK), AHEAD.coming.chunks).sort((a, b) => a[2] - b[2]);

        return [...new Set([...ring, ...theirs.flatMap(chunksIn)].map(([cx, cy]) => cy * CHUNKS + cx))];
    }

    // The navigation's tiles on the map within reach of one not yet in ([[tx, ty]...])
    #tilesRound(x, y) {
        const { navigation } = this.navBaker;
        const { tile } = navigation.measures;
        const reach = Math.min(AHEAD.coming.reach, this.reach);
        const tiles = [];

        for (let ty = Math.max(0, Math.floor((y - reach) / tile)); ty <= Math.floor((y + reach) / tile) && ty * tile < navigation.size[1]; ty++) {
            for (let tx = Math.max(0, Math.floor((x - reach) / tile)); tx <= Math.floor((x + reach) / tile) && tx * tile < navigation.size[0]; tx++) {
                tiles.push([tx, ty]);
            }
        }

        return tiles;
    }

    /**
     * Have what's round a point out in the world (metres) made ahead: the chunks within
     * AHEAD.chunks of its own, nearest first; the settlements near laid out; and the navigation's
     * tiles within `reach` baked, each once its ground's made.
     */
    around(x, y, reach) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
        const wanted = this.#ring(cx, cy).filter(([ax, ay]) => !this.#made(ax, ay));

        wanted.sort((a, b) => a[2] - b[2]);
        this.#first(wanted);
        this.layouts?.ahead(cx, cy);
        this.terrains?.ahead(cx, cy);
        this.navBaker.around(x, y, this.reach < AHEAD.reach ? this.reach : Math.max(reach, AHEAD.reach));
        this.stale = true;
    }

    // The chunks within AHEAD.chunks of one, each with how many chunks off it is: [[cx, cy, rings]]
    #ring(cx, cy, within = AHEAD.chunks) {
        const ring = [];

        for (let dy = -within; dy <= within; dy++) {
            for (let dx = -within; dx <= within; dx++) {
                const [ax, ay] = [cx + dx, cy + dy];

                if (ax >= 0 && ay >= 0 && ax < CHUNKS && ay < CHUNKS) {
                    ring.push([ax, ay, Math.max(Math.abs(dx), Math.abs(dy))]);
                }
            }
        }

        return ring;
    }

    // Chunks put first among those waiting (in the order given), what was waiting after them
    #first(chunks) {
        const first = new Set(chunks.map(([ax, ay]) => ay * CHUNKS + ax));

        this.chunks = [...chunks.map(([ax, ay]) => [ax, ay]), ...this.chunks.filter(([ax, ay]) => !first.has(ay * CHUNKS + ax))];
    }

    // With a host: what's wanted now looked over, each time its look round's gone by or a player's
    // moved (around). Where its players are (core/host.js soon `around`), the chunks round each;
    // and what it will soon want (`boxes`), after those. What was waiting that none of them takes
    // is let go: a chunk or a tile round a player who's gone. A chunk they take that isn't made
    // (never made, or let go of since) waits again. The world's told to keep as many chunks as
    // all that takes, and AHEAD.spareChunks more; and each dungeon to come has its levels worked
    // out on the layouts' worker (`dungeons`)
    #review() {
        const host = this.host;

        if (!host?.soon || (!this.stale && this.asked === host.lookAt)) {
            return;
        }

        this.asked = host.lookAt;
        this.stale = false;

        const coming = Ahead.coming ? this.coming : [];
        const { around, boxes, dungeons, theirs, foreseen } = host.soon(coming, { turn: Ahead.soon && Ahead.turns });
        const rings = new Map();
        const soon = new Map();
        // (What those not yet in want, that the players in don't: by its key, in the order it's
        // to be made, the first to come first and nearest them first; and each one's own)
        const next = new Map();
        const needs = new Map();

        for (const [x, y] of around) {
            for (const [cx, cy, off] of this.#ring(Math.floor(x / CHUNK), Math.floor(y / CHUNK))) {
                const key = cy * CHUNKS + cx;

                rings.set(key, Math.min(off, rings.get(key) ?? Infinity));
            }
        }

        coming.forEach(([x, y], k) => {
            const chunks = this.#chunksFor(x, y, Ahead.soon ? theirs[k] : []);

            needs.set(`${x},${y}`, { chunks, ready: false });

            for (const key of chunks) {
                if (!rings.has(key) && !next.has(key)) {
                    next.set(key, [key % CHUNKS, Math.floor(key / CHUNKS)]);
                }
            }
        });

        for (const [cx, cy] of (Ahead.soon ? boxes : []).flatMap(chunksIn)) {
            if (!rings.has(cy * CHUNKS + cx) && !next.has(cy * CHUNKS + cx)) {
                soon.set(cy * CHUNKS + cx, [cx, cy]);
            }
        }

        // (Those of them wanted only for what the war's next turn will bring near: counted as
        // they're made, #make)
        const wantedNow = new Set((Ahead.soon ? boxes : []).filter((box) => !foreseen.includes(box)).flatMap(chunksIn).map(([cx, cy]) => cy * CHUNKS + cx));

        this.turn.boxes = Ahead.soon ? foreseen.length : 0;
        this.turnChunks = new Set((Ahead.soon ? foreseen : []).flatMap(chunksIn).map(([cx, cy]) => cy * CHUNKS + cx).filter((key) => soon.has(key) && !wantedNow.has(key)));

        // (Those waiting: round the players nearest first, in the order they were, then what's
        // wanted soon. Those made are marked as wanted still, so that what the world lets go of
        // as it makes another is what no one wants any more, never one a player's standing by
        // that its steps happen not to have read)
        const waiting = (key) => !(this.overworld.wanted?.(key % CHUNKS, Math.floor(key / CHUNKS)) ?? this.#made(key % CHUNKS, Math.floor(key / CHUNKS)));
        const near = [...rings.keys()].filter(waiting).sort((a, b) => rings.get(a) - rings.get(b));
        const theirsNext = [...next.keys()].filter(waiting);
        const later = [...soon.keys()].filter(waiting);

        // (What those not yet in want comes after the chunks next to each player in, and before
        // those further round them, which no step wants yet: or each let in would hold up
        // everyone behind them for as long as all 49 round them took)
        const inner = theirsNext.length ? near.findIndex((key) => rings.get(key) > AHEAD.coming.chunks) : -1;
        const [nearest, further] = inner < 0 ? [near, []] : [near.slice(0, inner), near.slice(inner)];

        this.chunks = [...nearest, ...theirsNext, ...further, ...later].map((key) => [key % CHUNKS, Math.floor(key / CHUNKS)]);
        this.wanted = rings.size + next.size + soon.size;
        this.needs = needs;
        this.keeping = this.wanted + AHEAD.spareChunks;

        // (More to keep than it was told: at once, so that none wanted is let go to make
        // another. Fewer: let go a few each pump, #ease; or all now, as they were)
        if (this.overworld.keep && (!Ahead.easing || !(this.keeping < this.overworld.kept))) {
            this.overworld.keep(this.keeping);
        }

        for (const key of this.waited.keys()) {
            if (!rings.has(key) && !next.has(key) && !soon.has(key)) {
                this.waited.delete(key);
            }
        }

        // (Their land's heights, and the settlements by them: asked of the workers now, to be
        // back by the time they're made)
        this.terrains?.want(this.chunks);

        for (const [cx, cy] of this.#spread([...theirsNext, ...later])) {
            this.layouts?.ahead(cx, cy);
        }

        const standing = coming.length ? [...around, ...coming] : around;

        this.#tiles(standing, around);

        // (The navigation's tiles waiting round where no player is any more, nor is to be: let go)
        const { navigation } = this.navBaker;
        const { tile } = navigation.measures;
        const reach = this.reach + tile;

        this.navBaker.queue = this.navBaker.queue.filter(([tx, ty]) => standing.some(([x, y]) => Math.abs((tx + 0.5) * tile - x) <= reach && Math.abs((ty + 0.5) * tile - y) <= reach));

        this.#tilesComing();

        this.layouts?.delve(Ahead.soon ? dungeons : []);
    }

    // The navigation's tiles round the first few of those not yet in whose ground isn't all made
    // (AHEAD.tiles of them: grounded), those of them whose own ground is made by now: put after
    // whatever's waiting to be baked already (round the players in, first). The rest once theirs
    // is: looked at again whenever a chunk's been made since (pump)
    #tilesComing() {
        const { queue, asked } = this.navBaker;
        let queued = null;
        let places = 0;

        this.tilesAt = this.made;

        for (const [x, y] of this.coming) {
            if (places >= AHEAD.tiles) {
                break;
            }

            if (this.grounded(x, y)) {
                continue;
            }

            places++;
            queued ??= new Set(queue.map(([tx, ty]) => ty * 65536 + tx));

            for (const [tx, ty] of this.#tilesRound(x, y)) {
                if (!queued.has(ty * 65536 + tx) && !asked.has(`${tx} ${ty}`) && this.#bakeable(tx, ty)) {
                    queued.add(ty * 65536 + tx);
                    queue.push([tx, ty]);
                }
            }
        }
    }

    // The navigation's tiles round the players, and those not yet in with them (`around`: [[x,
    // y]]; `players`, those in alone): the mesh told to keep as many
    // as are within AHEAD.reach of them all, and AHEAD.spareTiles more (it kept 1,024 whoever was
    // in, eight players' at 121 each, and with more apart let go of one's to bake another's, over
    // and over, in the steps too: 25 apart want 3,025). Its most is Detour's (core/navigation.js
    // MOST_TILES, 4,096: 31 players' apart), so with more than that the reach is brought in a
    // tile at a time till they fit, and the tiles further out are baked by the ways that want
    // them, as ever: nothing a step works out changes, only when the tile's baked. Those in
    // are counted as used whenever one's been added since (the next let go of is then one no
    // one's near), and what's newly within reach is asked for
    #tiles(around, players = around) {
        const { navigation } = this.navBaker;

        if (!navigation.keepTiles) {
            return;
        }

        const { tile } = navigation.measures;
        const round = (reach) => {
            const tiles = new Map();

            for (const [x, y] of around) {
                for (let ty = Math.floor((y - reach) / tile); ty <= Math.floor((y + reach) / tile); ty++) {
                    for (let tx = Math.floor((x - reach) / tile); tx <= Math.floor((x + reach) / tile); tx++) {
                        tiles.set(ty * 65536 + tx, [tx, ty]);
                    }
                }
            }

            return tiles;
        };

        // (Only when a player's in another tile, or a tile's been added, since it was last done)
        const where = `${navigation.added} ${around.map(([x, y]) => `${Math.floor(x / tile)},${Math.floor(y / tile)}`).join(" ")}`;

        if (where === this.tiled) {
            return;
        }

        let reach = AHEAD.reach;
        let tiles = round(reach);

        while (tiles.size + AHEAD.spareTiles > navigation.most && reach > tile) {
            reach -= tile;
            tiles = round(reach);
        }

        const was = this.reach;

        this.tiled = where;
        this.reach = reach;
        this.tiles = tiles.size;
        navigation.keepTiles(tiles.size + AHEAD.spareTiles);

        for (const [tx, ty] of tiles.values()) {
            navigation.hold(tx, ty);
        }

        // (Room for more round each than there was, players having left: asked for)
        if (reach > was) {
            for (const [x, y] of players) {
                this.navBaker.around(x, y, reach);
            }
        }
    }

    // What's no longer wanted let go a little: of the chunks the world has over what it's to
    // keep (`keeping`: #review), and their heights, AHEAD.ease.chunks at the most, the longest
    // unused first (those wanted were marked as used when they were looked over); and of the
    // tiles the navigation has over what it's to keep (#tiles), AHEAD.ease.tiles. Nothing a
    // step works out changes by it: a chunk or a tile kept a while longer is the one a step
    // would make again
    #ease() {
        const { overworld } = this;
        const { navigation } = this.navBaker;

        navigation.gently = Ahead.easing;

        if (!Ahead.easing) {
            return;
        }

        if (overworld.keep && this.keeping !== null && this.keeping < overworld.kept) {
            // (As many as it has, or its ground has heights for, if that's fewer than it may keep)
            const has = Math.max(overworld.chunks.size, overworld.ground?.chunks?.size ?? 0, overworld.ground?.natural?.size ?? 0);
            const had = overworld.chunks.size;

            overworld.keep(Math.max(this.keeping, Math.min(overworld.kept, has) - AHEAD.ease.chunks));
            this.eased.chunks += had - overworld.chunks.size;
        }

        if (navigation.keepTiles) {
            this.eased.tiles += navigation.shed(AHEAD.ease.tiles);
        }
    }

    // A few chunks among some (keys) that the settlements near all of them are near one of: one
    // in every so many each way, as the layouts look that far round a chunk (world/layouts.js)
    #spread(keys) {
        const seen = new Map();

        for (const key of keys) {
            const [cx, cy] = [key % CHUNKS, Math.floor(key / CHUNKS)];

            seen.set(Math.floor(cy / 4) * CHUNKS + Math.floor(cx / 4), [cx, cy]);
        }

        return [...seen.values()];
    }

    /**
     * Between steps: with a host, what's wanted now looked over (#review); then the chunks
     * waiting made for as long as AHEAD.budget allows, a piece of one at the least (core/
     * overworld.js chunkWithin: one left half made is carried on the next time), those whose
     * heights or settlement are still with a worker passed over for now; with none waiting, a
     * tile of an open building's inside; then the next of the navigation's tiles sent off to be
     * baked.
     */
    pump() {
        this.#review();
        this.#ease();

        const until = this.clock() + AHEAD.budget;

        // (Those with nothing to wait for; then, sooner than stand idle, those whose heights
        // alone aren't back yet, worked out here)
        if (this.#make(until, false)) {
            this.#make(until, true);
        }

        if (!this.chunks.length) {
            this.#inside();
        }

        // (Ground made since for one not yet in: its tiles asked for)
        if (this.coming.length && this.made !== this.tilesAt) {
            this.#tilesComing();
        }

        this.navBaker.pump(AHEAD.tiles);
    }

    // The chunks waiting made, in their order, till the clock reaches `until` (a piece of one at
    // the least): but those better left a moment (#awaited), a settlement's layout still to come
    // or, unless they're to be made `unheighted`, their heights. Returns whether there's time left
    #make(until, unheighted) {
        let k = 0;

        while (k < this.chunks.length) {
            const [cx, cy] = this.chunks[k];

            if (this.#made(cx, cy)) {
                this.chunks.splice(k, 1);
                continue;
            }

            const waits = this.#awaited(cx, cy);

            if (waits === "layout" || (waits === "heights" && !unheighted)) {
                k++;
                continue;
            }

            if (this.overworld.chunkWithin(cx, cy, until, this.clock)) {
                this.chunks.splice(k, 1);
                this.waited.delete(cy * CHUNKS + cx);
                this.made++;
                this.turn.chunks += this.turnChunks.has(cy * CHUNKS + cx) ? 1 : 0;
            }

            if (this.clock() >= until) {
                return false;
            }
        }

        return true;
    }

    // What a chunk waiting is better left a moment for, if anything: a settlement by it still
    // being laid out on its worker, or a trail near it still being found on the heights' ("layout":
    // made now, the chunk would do that here on the world's thread, a couple of hundred
    // milliseconds for a capital; waited for no longer than AHEAD.patience, should the worker
    // have gone quiet), or its land's heights asked of theirs and not back yet ("heights": a few
    // milliseconds' work here, so only while there's another chunk to make meanwhile)
    #awaited(cx, cy) {
        const key = cy * CHUNKS + cx;

        if (this.layouts?.pending(cx, cy) || this.terrains?.finding(cx, cy)) {
            if (!this.waited.has(key)) {
                this.waited.set(key, this.clock());
            }

            if (this.clock() - this.waited.get(key) < AHEAD.patience) {
                return "layout";
            }
        }

        return this.terrains?.worker && this.terrains.asked.has(key) && !this.overworld.ground.has(cx, cy) ? "heights" : null;
    }

    // The next tile not baked yet of the insides of the buildings the host has open, baked
    // (Recast's tens of milliseconds: one at a time); whether there was one
    #inside() {
        this.#keepOpen();

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

    // Every open building's insides' meshes kept (AHEAD.rooms at the least, `spare` more besides),
    // so none is let go of while it's open
    #keepOpen() {
        let maps = 0;

        for (const key of this.host?.open.keys() ?? []) {
            maps += this.world.interiors?.buildings.get(key)?.maps?.length ?? 0;
        }

        keepRooms(Math.max(AHEAD.rooms, maps + AHEAD.spare));
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
     * Whether all that's been asked for is made: no chunk waiting, no navigation tile being
     * baked, none waiting whose ground is made (one whose ground isn't, and isn't waiting to be,
     * is a way's far off from every player: nothing here makes its ground, and it's no reason
     * to keep anyone waiting), and no open building's inside with a tile to bake. (A player
     * arriving waits for this before their world's clock starts: generated/world_server_plan.md
     * §4.)
     */
    get settled() {
        const baker = this.navBaker;

        this.#review();

        return !this.chunks.length && !baker.asked.size && ![...baker.queue, ...baker.wanted].some(([tx, ty]) => this.#bakeable(tx, ty)) && !this.#insideWaiting();
    }

    // Whether a navigation tile waiting could be sent off now: not in, and its ground made
    #bakeable(tx, ty) {
        const { navigation } = this.navBaker;
        const { tile, border } = navigation.measures;

        return !navigation.has(tx, ty) && this.overworld.made(tx * tile - border, ty * tile - border, (tx + 1) * tile + border, (ty + 1) * tile + border);
    }

    // Whether any open building's inside has a tile not baked yet
    #insideWaiting() {
        this.#keepOpen();

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
        this.terrains?.dispose();
        this.chunks = [];
    }
}
