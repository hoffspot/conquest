// The world authority's load (generated/multiplayer_scaling_plan.md 0-2): a world stepped on Node
// as the world server steps it (core/runner.js, server/ahead.js), opened to others as it opens it
// (core/netplay.js Hosting), with as many players as asked for joined over a link that only counts
// what's sent: they hold no copy of the world, so a hundred of them cost the machine nothing the
// authority wouldn't spend on a hundred real ones. Everything's in this one process and played in
// fixed steps, so the same options play the same world every time (while the navigation has
// room for every tile round the players, below: once it hasn't, which tiles are in when a way's
// looked for goes by when its workers finished, and the ways found, and so what's sent, differ a
// little from run to run).
//
// It says what a step costs and where: each pass of the step by name (core/probe.js), the step's
// mean, 99th percentile and worst, by the clock and in the thread's own processor time (the
// whole of what the authority does for a step: what it heard done, the step, and what it sent);
// what each player is sent, by kind; how big a snapshot of the world is and how long it takes to
// take and to write out; and memory.
//
//     npm run load                                         # 8 players spread, walking, 120 s, seed 2
//     npm run load -- --players 25 --layout towns          # 25, four to a town
//     npm run load -- --players 100 --layout one-town --activity stick
//     npm run load -- --activity fights --seconds 300 --seed 7
//     npm run load -- --json                               # the report as JSON, and nothing else
//     npm run load -- --ceiling 50                         # and fail if the mean step's over 50 ms
//
// --players: any number (the plan's: 8, 25, 50, 100). --layout: spread (each in a settlement of
// their own, as far from one another as the world allows), towns (four to a town), one-town (all
// in the humans' first). --activity: walk (sent somewhere near every five seconds), stick (a
// stick held: 16 commands a second each), fights (walking, and 6-a-side field battles begun ten
// seconds in, one for every twenty players), battle (one of 200 a side), invasion (the first
// player's town invaded), hellrift (a hell rift torn open by them), night (walking, in the dark:
// the world played with no one in it till nightfall first, DAY.night, so the light to see by and
// the soldiers' torches are in every step), warturn (walking, a turn of the war falling ten seconds
// in and the world saved four steps after it, as a world server saves it: what those two steps
// cost beside the seconds round them; --turns 35 for a war that many turns old, played with no one
// in first); and joinstorm and dungeons, which aren't built yet and say so.
//
// Before it's timed, what's round the players is made ahead until nothing's waiting (Ahead.settled),
// however long that takes: a step that makes ground is a loading cost, measured by npm run
// step-budget. Each player out in the world wants some 120 of the navigation's tiles baked round
// them, and the navigation keeps as many as they all want (server/ahead.js) up to the 4,096 its
// mesh takes (core/navigation.js MOST_TILES): 31 players spread. With more, the tiles are baked
// ahead less far round each (`navigation.reach`, metres) and the run says so (`navigation.capped`,
// and a line in what it prints): its steps then include the tiles further out that their ways
// baked, as a world server's would.
//
// Writes the report to test-results/load/report.json (--out for elsewhere). Exits 1 only if the
// run couldn't be made (an option it doesn't know; one that isn't built yet exits 0, saying so);
// or, given --ceiling, if what's the same on any machine went wrong (failuresOf: the report not as
// its schema says, players sent out, a fight that didn't begin) or the mean step, in the thread's
// own processor time, was over that many ms: a catastrophe's ceiling, for the nightly run
// (.github/workflows/scale.yml), not a gate. The gates are timed by hand, on one machine.

import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { gzip } from "node:zlib";
import { STEP_MS } from "../client/js/core/battle.js";
import { DAY, elapsedOf, timeOfDay, untilTime } from "../client/js/core/daytime.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { FIELD_BATTLE, Host } from "../client/js/core/host.js";
import { torchesLit } from "../client/js/core/light.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { HEARD, Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { TURN_MS } from "../client/js/core/war/war.js";
import { encode } from "../client/js/core/wire.js";
import { RACE, startFor } from "../client/js/core/worldplan/plan.js";
import { Ahead, AHEAD } from "../server/ahead.js";
import { Keeper, KEEPER } from "../server/keeper.js";
import { installWorkers } from "../server/workers.js";

export const LOAD = Object.freeze({
    // The report's format: bumped when a field's renamed or taken out (one added needn't)
    schema: 1,
    // The players, layouts and seeds the plan's tables are made of
    players: [8, 25, 50, 100],
    layouts: ["spread", "towns", "one-town"],
    seeds: [2, 7],
    seconds: 120,
    // What the players do, of what's built; and what isn't yet, with why
    activities: ["walk", "stick", "fights", "battle", "invasion", "hellrift", "night", "warturn"],
    unbuilt: Object.freeze({
        joinstorm: "not built yet: it needs the welcome queue of slice 1-5 to be told from the snapshots",
        dungeons: "not built yet: players sent down a dungeon need a way found to its door and through its levels",
    }),
    // How many to a town (the `towns` layout), and the kinds of place that are towns for it
    party: 4,
    towns: ["capital", "city", "town"],
    // Walking: sent somewhere within `roam` metres of where they came in every `every` ms. A
    // stick held: `stick` commands a second (what a stick turning sends: core/netplay.js HEARD),
    // towards somewhere chosen as a walker's is. And asking how long a word takes, every `ping` ms,
    // as every game does (one that didn't would be stopped for being quiet: netplay.js QUIET).
    // A stick's command reaches `reach` metres ahead, as the game's does (app/steering.js
    // HELD_REACH: with none, a way 400 m on is looked for every time)
    every: 5000,
    roam: 40,
    stick: 16,
    reach: 30,
    ping: 1000,
    // The fights: begun `eventAt` ms in, `fightSize` a side, one for every `fightPer` players (one
    // at the least); whoever began one goes for the nearest foe within `foeNear` metres, looked for
    // every `foeEvery` ms
    eventAt: 10000,
    fightSize: 6,
    fightPer: 20,
    foeNear: 60,
    foeEvery: 1000,
    // A turn of the war (warturn): the steps of this long before it and after its save (ms) are
    // what its two steps are read beside
    round: 1000,
    // The warm-up: after everything round the players is made, this many steps played untimed
    // (the towns' soldiers and folk put out, their buildings opened), and what those want made
    // too. And how long (ms of the clock) it goes on with nothing new made before it's given up
    // as never going to settle
    settle: 100,
    stall: 30000,
    // How many times a snapshot's taken and written out, for the middle one's time
    snapshots: 5,
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "test-results/load/report.json");

// The processor time this thread has had (ms: user and system); the whole process's, where a
// Node hasn't the thread's
const cpuNow = () => {
    const { user, system } = process.threadCpuUsage?.() ?? process.cpuUsage();

    return (user + system) / 1000;
};

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const MB = 2 ** 20;

// The mean, the middle, the 99th percentile and the worst of some times (ms), and which was the worst
function spreadOf(times) {
    const sorted = Float64Array.from(times).sort();
    const at = (share) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] : 0);
    let total = 0;
    let worstAt = -1;

    times.forEach((ms, k) => {
        total += ms;
        worstAt = worstAt < 0 || ms > times[worstAt] ? k : worstAt;
    });

    return { mean: round(times.length ? total / times.length : 0), p50: round(at(0.5)), p99: round(at(0.99)), worst: round(at(1)), worstAt };
}

// Places as far from one another as can be, `count` of them, the first given: each next the one
// furthest from all those chosen (the same every time: ties go to the first in the list)
function farApart(places, count, first) {
    const chosen = [first];
    const nearest = places.map(({ at }) => Math.hypot(at[0] - first.at[0], at[1] - first.at[1]));

    while (chosen.length < count) {
        let best = -1;

        for (let k = 0; k < places.length; k++) {
            if (nearest[k] > 0 && (best < 0 || nearest[k] > nearest[best])) {
                best = k;
            }
        }

        if (best < 0) {
            break;
        }

        const { at } = places[best];

        chosen.push(places[best]);
        places.forEach((place, k) => (nearest[k] = Math.min(nearest[k], Math.hypot(place.at[0] - at[0], place.at[1] - at[1]))));
    }

    return chosen;
}

/**
 * Where `players` players are put in a world (its plan), by layout: [{ race, place (its id), at
 * ([x, y] metres) }], each of the people whose settlement they're in (so its guards are theirs).
 * `spread`: each in a settlement of their own, as far apart as the world's allow. `towns`:
 * LOAD.party to a town, the towns as far apart. `one-town`: all in the humans' first. Throws if the
 * world hasn't the settlements for it.
 */
export function layoutOf(plan, players, layout) {
    const home = startFor(plan, "human");
    const peopled = plan.places.filter(({ race }) => RACE[race]);
    const first = peopled.find(({ id }) => id === home.id) ?? home;
    const within = (place, k) => [Math.round(place.at[0]) + (k % 2) * 2, Math.round(place.at[1]) + (k >> 1) * 2];
    let homes;

    if (layout === "spread") {
        homes = farApart(peopled, players, first).map((place) => [place, 0]);
    } else if (layout === "towns") {
        const towns = farApart(peopled.filter(({ kind, id }) => LOAD.towns.includes(kind) || id === first.id), Math.ceil(players / LOAD.party), first);

        homes = Array.from({ length: Math.min(players, towns.length * LOAD.party) }, (_, k) => [towns[Math.floor(k / LOAD.party)], k % LOAD.party]);
    } else if (layout === "one-town") {
        homes = Array.from({ length: players }, (_, k) => [first, k % 16]);
    } else {
        throw new Error(`No layout called ${layout}: ${LOAD.layouts.join(", ")}`);
    }

    if (homes.length < players) {
        throw new Error(`The world has settlements for ${homes.length} players in the ${layout} layout, not ${players}`);
    }

    return homes.map(([place, k]) => ({ race: place.race, place: place.id, at: within(place, k) }));
}

/**
 * How many of the navigation's tiles players at `places` ([[x, y]], out in the world) want baked
 * round them (server/ahead.js AHEAD.reach each way, as world/navbaker.js around asks for them),
 * beside how many it can keep: { tile (m), keep, wanted, capped (more wanted, with `spare` more
 * for the steps' own, than can be kept) }.
 */
export function tilesWanted(places, { tile, keep, spare = 0, reach = AHEAD.reach }) {
    const wanted = new Set();

    for (const [x, y] of places) {
        for (let ty = Math.floor((y - reach) / tile); ty <= Math.floor((y + reach) / tile); ty++) {
            for (let tx = Math.floor((x - reach) / tile); tx <= Math.floor((x + reach) / tile); tx++) {
                wanted.add(ty * 65536 + tx);
            }
        }
    }

    return { tile, keep, wanted: wanted.size, capped: wanted.size + spare > keep };
}

// One who's joined over a link that only counts: what they're sent (bytes, messages, their
// busiest second) and what they send; where they came in, and what they're doing
class Peer {
    constructor(k, home) {
        this.peer = `peer-${k + 1}`;
        this.k = k;
        this.home = home;
        this.id = null;
        this.bytes = 0;
        this.messages = 0;
        this.second = 0;
        this.worstSecond = 0;
        this.seq = 0;
        this.random = (k + 1) * 2654435761 >>> 0 || 1;
        this.to = null;
        this.owed = 0;
        this.fights = false;
    }

    // A number from -1 to 1, the next of their own
    roll() {
        this.random = (Math.imul(this.random, 1103515245) + 12345) >>> 0;

        return (this.random / 2 ** 32 - 0.5) * 2;
    }

    command(command) {
        return encode({ kind: "command", seq: ++this.seq, command });
    }

    somewhere() {
        return [Math.round(this.home.at[0] + this.roll() * LOAD.roam), Math.round(this.home.at[1] + this.roll() * LOAD.roam)];
    }
}

// The kind of a message, read off its front without reading the rest ({"kind":"ops",...)
const kindOf = (text) => (text.startsWith('{"kind":"') ? text.slice(9, text.indexOf('"', 9)) : "?");

/**
 * Play a world under load: resolves to the report (checkReport says what's in it). `log` is told
 * how it's going, a line at a time. An activity that isn't built yet resolves to a report that
 * only says so ({ schema, run, built: false, reason }).
 */
export async function load({ seed = 2, players: count = 8, layout = "spread", activity = "walk", seconds = LOAD.seconds, eventAt = LOAD.eventAt, turns = 0, log = () => {} } = {}) {
    const run = { seed, players: count, layout, activity, seconds, node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length };

    if (Object.hasOwn(LOAD.unbuilt, activity)) {
        return { schema: LOAD.schema, run, built: false, reason: LOAD.unbuilt[activity] };
    }

    if (!LOAD.activities.includes(activity)) {
        throw new Error(`No activity called ${activity}: ${[...LOAD.activities, ...Object.keys(LOAD.unbuilt)].join(", ")}`);
    }

    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(seconds) || seconds <= 0) {
        throw new Error("--players takes a whole number of players, --seconds how long to play");
    }

    if (!Number.isInteger(turns) || turns < 0 || !Number.isInteger(eventAt / STEP_MS) || eventAt < 0) {
        throw new Error("--turns takes how many turns of the war to play with no one in first");
    }

    installWorkers();

    const clock = () => performance.now();
    const began = clock();
    const world = buildWorld({ seed });
    const homes = layoutOf(world.plan, count, layout);
    const overworld = world.maps.town;
    const navigation = navigatorOf(overworld);
    // (As a world server's: everyone rests together, and its owners' debug commands are theirs,
    // so the fights are the players' to begin: they're all owners here)
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });
    const problems = [];

    host.populate();

    // --- Night, or a war some turns old: the world played with no one in it first, as its own rules play it ---

    // (The time of day is the war's clock, core/daytime.js, and nothing sets it or turns the war
    // but the world's steps: so they're played, the war's turns with them, before anyone's in and
    // before anything's timed. An empty world's step is some 0.05 ms)
    const night = activity === "night" ? { waited: untilTime(elapsedOf(host.war), DAY.night), turn: 0, from: 0, to: 0, dark: false } : null;
    const played = night ? night.waited : turns * TURN_MS;

    for (let ms = 0; ms < played; ms += STEP_MS) {
        host.advance(STEP_MS);
    }

    if (played) {
        log(`Played ${night ? "to nightfall " : ""}with no one in: ${played / 60000} minutes of the world's time, ${host.war.turn} turns of its war, ${((clock() - began) / 1000).toFixed(1)} s`);
    }

    // The world's own time (ms), which is the clock Hosting holds the players to (HEARD: 30
    // commands a second each, 60 at once), so the limits bind as they would on a server whatever
    // this machine's speed
    let time = 0;
    const outbox = [];
    const hosting = new Hosting(host, { send: (peer, text) => outbox.push(peer, text), clock: () => time });
    const runner = new WorldRunner(host, { hosting });
    const peers = homes.map((home, k) => new Peer(k, home));
    const byPeer = new Map(peers.map((peer) => [peer.peer, peer]));
    const kinds = new Map();
    const up = { messages: 0, bytes: 0 };

    hosting.most = count;
    hosting.roleOf = () => "owner";

    // (warturn: the world kept as a world server keeps it, server/keeper.js: written out four steps
    // after each turn of its war, in the step, and gzipped off it; to nowhere, which costs the
    // thread nothing a disk would. And each turn and each writing noted as it comes)
    const zipped = promisify(gzip);
    const kept = { turned: null, wrote: null, saves: [] };
    const keeper =
        activity === "warturn"
            ? new Keeper(runner, {
                  meta: { played: 0 },
                  journal: async () => {},
                  saveText: async (text) => {
                      const before = clock();
                      const packed = await zipped(Buffer.from(text, "utf8"));

                      kept.saves.push({ bytes: Buffer.byteLength(text), zipped: packed.length, ms: clock() - before });
                  },
              })
            : null;

    if (keeper) {
        const [onTurn, snapshotText] = [runner.onTurn, host.snapshotText.bind(host)];

        runner.onTurn = (war) => {
            kept.turned = war.turn;
            onTurn(war);
        };
        host.snapshotText = (...given) => {
            const before = clock();
            const text = snapshotText(...given);

            kept.wrote = clock() - before;

            return text;
        };
    }

    // What's been sent counted, by who it was to and its kind (after the step that sent it's been
    // timed: counting bytes is this script's work, not the authority's)
    const counted = () => {
        for (let k = 0; k < outbox.length; k += 2) {
            const peer = byPeer.get(outbox[k]);
            const bytes = Buffer.byteLength(outbox[k + 1]);
            const kind = kindOf(outbox[k + 1]);
            const sum = kinds.get(kind) ?? kinds.set(kind, { messages: 0, bytes: 0 }).get(kind);

            sum.messages++;
            sum.bytes += bytes;

            if (peer) {
                peer.bytes += bytes;
                peer.messages++;
                peer.second += bytes;
            }
        }

        outbox.length = 0;
    };

    const hear = (peer, text) => {
        up.messages++;
        up.bytes += Buffer.byteLength(text);
        hosting.hear(peer.peer, text);
    };

    // --- Everyone in: each welcomed with the world as it is, then put where the layout has them ---

    const welcomes = { ms: [], bytes: [] };

    for (const peer of peers) {
        const before = clock();

        hear(peer, encode({ kind: "hello", version: NET_VERSION, character: { hero: { name: `Load${peer.k + 1}`, race: peer.home.race, weapon: "sword", boots: false, shape: {}, look: {} } } }));
        welcomes.ms.push(clock() - before);
        peer.id = hosting.players.get(peer.peer) ?? null;

        for (let k = 0; k < outbox.length; k += 2) {
            if (outbox[k] === peer.peer && kindOf(outbox[k + 1]) === "welcome") {
                welcomes.bytes.push(Buffer.byteLength(outbox[k + 1]));
            }
        }

        counted();

        if (!peer.id) {
            throw new Error(`${peer.peer} wasn't let into the world`);
        }

        const there = host.battle.place(peer.id, "town", peer.home.at) ?? host.battle.place(peer.id, "town", nearestFree(squaresOf(overworld), peer.home.at, { within: 40 }));

        if (!there) {
            problems.push(`${peer.peer} couldn't be stood in ${peer.home.place}: left where they came in`);
        }
    }

    const joined = { players: hosting.players.size, ms: Math.round(welcomes.ms.reduce((sum, ms) => sum + ms, 0)), welcome: { bytes: spreadOf(welcomes.bytes), ms: spreadOf(welcomes.ms) } };
    const standing = () => peers.map((peer) => host.battle.actor(peer.id)).filter((actor) => actor?.map === "town");
    const tiles = tilesWanted(standing().map(({ x, y }) => [x, y]), { tile: navigation.measures.tile, keep: navigation.most, spare: AHEAD.spareTiles });

    log(`${count} players in (${layout}), ${joined.ms} ms; each welcomed with ${Math.round(joined.welcome.bytes.mean / 1024)} KB`);

    // (The tiles the navigation lets go of to keep within what it keeps, counted)
    let dropped = 0;
    const drop = navigation.drop.bind(navigation);

    navigation.drop = (...tile) => {
        dropped++;

        return drop(...tile);
    };

    if (tiles.capped) {
        problems.push(
            `the navigation takes ${tiles.keep} tiles at most (core/navigation.js MOST_TILES) and these ${count} players want ${tiles.wanted} baked round them: they're baked ahead less far round each, and the steps timed include the tiles further out that their ways baked`,
        );
        log(`The navigation's tile cap: ${tiles.wanted} tiles wanted round the players, ${tiles.keep} at most. They're baked ahead less far round each, and this run's steps include those further out.`);
    }

    // --- The warm-up: the world's opening step, then all that's round the players made ahead ---

    const ahead = new Ahead(world, { host, clock });
    const warmed = clock();
    let settled;

    // What's round the players made between steps until nothing's waiting (true), or until
    // nothing new has been made for LOAD.stall, or, the navigation over its cap, until the chunks
    // are all made and it's as full as it gets (false)
    const makeAhead = async () => {
        let progress = clock();
        let had = -1;

        for (;;) {
            runner.bakeAhead(ahead);

            if (ahead.settled) {
                return true;
            }

            const has = ahead.made + ahead.rooms + navigation.tiles.size + dropped;

            if (has !== had) {
                had = has;
                progress = clock();
            }

            if (clock() - progress > LOAD.stall || (tiles.capped && !ahead.chunks.length && navigation.tiles.size >= navigation.keep - AHEAD.tiles && dropped > tiles.wanted)) {
                return false;
            }

            await new Promise((resolve) => setTimeout(resolve, 1));
        }
    };

    runner.advance(STEP_MS);
    time += STEP_MS;
    counted();
    settled = await makeAhead();

    for (let k = 0; k < LOAD.settle; k++) {
        for (const peer of peers) {
            if (k % (LOAD.ping / STEP_MS) === peer.k % (LOAD.ping / STEP_MS)) {
                hear(peer, encode({ kind: "ping", t: time }));
            }
        }

        runner.advance(STEP_MS);
        time += STEP_MS;
        counted();
        runner.bakeAhead(ahead);
        await new Promise((resolve) => setImmediate(resolve));
    }

    settled = (await makeAhead()) && settled;

    if (!settled && !tiles.capped) {
        problems.push(`the warm-up gave up with ground still waiting after ${LOAD.stall / 1000} s with nothing new made: the steps timed may make ground`);
    }

    // (warturn: played on, untimed, till the war's next turn is `eventAt` into the run: a turn
    // can't be called for, only waited for, a minute at the most)
    if (keeper) {
        const wait = (((TURN_MS - STEP_MS - eventAt - host.war.clock) % TURN_MS) + TURN_MS) % TURN_MS;

        for (let k = 0; k < wait / STEP_MS; k++) {
            for (const peer of peers) {
                if (k % (LOAD.ping / STEP_MS) === peer.k % (LOAD.ping / STEP_MS)) {
                    hear(peer, encode({ kind: "ping", t: time }));
                }
            }

            runner.advance(STEP_MS);
            time += STEP_MS;
            counted();
            runner.bakeAhead(ahead);
            await new Promise((resolve) => setImmediate(resolve));
        }

        await keeper.settled();
        settled = (await makeAhead()) && settled;
        Object.assign(kept, { turned: null, wrote: null, saves: [] });
    }

    const warm = { ms: Math.round(clock() - warmed), settled, chunks: ahead.made, rooms: ahead.rooms, tiles: navigation.tiles.size };

    log(`Warmed up in ${(warm.ms / 1000).toFixed(1)} s (${warm.chunks} chunks, ${warm.tiles} navigation tiles, ${warm.rooms} insides' tiles)${settled ? "" : ", not settled"}`);

    // --- The run ---

    const fighters = ["fights"].includes(activity) ? Math.max(1, Math.round(count / LOAD.fightPer)) : ["battle", "invasion", "hellrift"].includes(activity) ? 1 : 0;

    peers.forEach((peer) => (peer.fights = fighters > 0 && peer.k % Math.ceil(count / fighters) === 0 && peer.k / Math.ceil(count / fighters) < fighters));

    const event = fighters ? { type: activity, at: eventAt, asked: 0, ok: false, actors: 0 } : null;
    const eventCommand = (peer) =>
        activity === "fights"
            ? { type: "fieldBattle", size: LOAD.fightSize, facing: peer.roll() * Math.PI }
            : activity === "battle"
              ? { type: "fieldBattle", size: FIELD_BATTLE.most, facing: peer.roll() * Math.PI }
              : activity === "invasion"
                ? { type: "invade" }
                : { type: "hellrift" };

    // The nearest foe to a fighter within LOAD.foeNear, as bots look for theirs (core/bot.js): read
    // off the host's world, which a real player's game would have a copy of
    const foeOf = (me) => {
        let best = null;
        let nearest = LOAD.foeNear * LOAD.foeNear;

        for (const actor of host.battle.actors) {
            if (actor === me || actor.dead || actor.map !== me.map || host.battle.formations[actor.formation?.id]?.broken) {
                continue;
            }

            const [dx, dy] = [actor.x - me.x, actor.y - me.y];
            const far = dx * dx + dy * dy;

            if (far < nearest && host.battle.hostile(me, actor) && host.canFight(me, actor)) {
                best = actor;
                nearest = far;
            }
        }

        return best;
    };

    // What each player says before a step (`step` of the run), as text: [[peer, text]]
    const said = (step) => {
        const saying = [];
        const at = step * STEP_MS;
        const every = (ms, peer) => step % (ms / STEP_MS) === peer.k % (ms / STEP_MS);

        for (const peer of peers) {
            const me = host.battle.actor(peer.id);

            if (every(LOAD.ping, peer)) {
                saying.push([peer, encode({ kind: "ping", t: time })]);
            }

            if (!me || me.dead || !hosting.players.has(peer.peer)) {
                continue;
            }

            if (peer.fights && at === eventAt) {
                saying.push([peer, peer.command(eventCommand(peer))]);
                event.asked++;

                continue;
            }

            // (One who's begun a fight goes for whoever's nearest, once it's begun)
            if (peer.fights && activity !== "invasion" && activity !== "hellrift" && at > eventAt) {
                const fighting = me.order?.type === "engage" && host.battle.actor(me.order.target) && !host.battle.actor(me.order.target).dead;
                const foe = !fighting && every(LOAD.foeEvery, peer) ? foeOf(me) : null;

                if (foe) {
                    saying.push([peer, peer.command({ type: "engage", target: foe.id })]);
                }

                if (fighting || foe) {
                    continue;
                }
            }

            if (activity === "stick") {
                // (A stick held towards somewhere near home, another once they're there or every
                // LOAD.every: LOAD.stick commands a second, the fraction carried over)
                if (!peer.to || every(LOAD.every, peer) || Math.hypot(peer.to[0] - me.x, peer.to[1] - me.y) < 2) {
                    peer.to = peer.somewhere();
                }

                peer.owed += (LOAD.stick * STEP_MS) / 1000;

                while (peer.owed >= 1) {
                    peer.owed--;
                    saying.push([peer, peer.command({ type: "ahead", facing: Math.atan2(peer.to[0] - me.x, peer.to[1] - me.y), reach: LOAD.reach })]);
                }
            } else if (every(LOAD.every, peer)) {
                saying.push([peer, peer.command({ type: "move", to: peer.somewhere() })]);
            }
        }

        return saying;
    };

    const steps = Math.round((seconds * 1000) / STEP_MS);
    const wall = new Float64Array(steps);
    const cpu = new Float64Array(steps);
    const parts = { hear: 0, step: 0, ahead: 0 };
    const actors = { start: host.battle.actors.length, most: host.battle.actors.length, end: 0 };
    const memory = { before: process.memoryUsage(), heapMost: 0 };
    const droppedBefore = dropped;
    // (warturn: each turn of the war that fell in the run, and each save: the step it was in, and
    // of that step's time, the war's own pass and the world's writing out)
    const turnsIn = [];
    const savesIn = [];
    const commandsBefore = hosting.dropped;
    const probes = install(new Probes({ clock }));
    const started = clock();

    if (night) {
        Object.assign(night, { turn: host.war.turn, from: round(timeOfDay(elapsedOf(host.war)) / 60000), dark: torchesLit(elapsedOf(host.war)) });
    }
    let late = 0;
    let over = 0;

    counted();
    kinds.clear();
    up.messages = 0;
    up.bytes = 0;
    peers.forEach((peer) => Object.assign(peer, { bytes: 0, messages: 0, second: 0, worstSecond: 0 }));

    for (let step = 0; step < steps; step++) {
        const saying = said(step);
        const passesBefore = keeper ? new Map([...probes.passes].map(([name, { ms }]) => [name, ms])) : null;
        const cpuBefore = cpuNow();
        const before = clock();

        for (const [peer, text] of saying) {
            hear(peer, text);
        }

        const heard = clock();

        runner.advance(STEP_MS);

        const after = clock();

        cpu[step] = cpuNow() - cpuBefore;
        wall[step] = after - before;
        parts.hear += heard - before;
        parts.step += after - heard;
        late += wall[step] > STEP_MS ? 1 : 0;
        over += cpu[step] > STEP_MS ? 1 : 0;
        time += STEP_MS;
        counted();

        // (Each pass's time in this step, for the turn's step and those up to its save)
        if (keeper && (kept.turned !== null || (turnsIn.length && step - turnsIn.at(-1).step <= KEEPER.after))) {
            const spent = [...probes.passes].map(([name, { ms }]) => [name, ms - (passesBefore.get(name) ?? 0)]).sort(([, a], [, b]) => b - a);

            if (kept.turned !== null) {
                turnsIn.push({ step, number: kept.turned, war: spent.find(([name]) => name === "war")?.[1] ?? 0, next: [] });
                kept.turned = null;
            } else {
                turnsIn.at(-1).next.push({ step, pass: spent[0][0], ms: spent[0][1] });
            }
        }

        if (kept.wrote !== null) {
            savesIn.push({ step, text: kept.wrote });
            kept.wrote = null;
        }

        if (event && step * STEP_MS === eventAt) {
            event.actors = host.battle.actors.length - actors.most;
            event.ok = activity === "invasion" ? host.invasions.length > 0 : activity === "hellrift" ? Boolean(host.hellRifts.open) : event.actors > 0;
        }

        actors.most = Math.max(actors.most, host.battle.actors.length);

        if ((step + 1) % (1000 / STEP_MS) === 0) {
            for (const peer of peers) {
                peer.worstSecond = Math.max(peer.worstSecond, peer.second);
                peer.second = 0;
            }

            memory.heapMost = Math.max(memory.heapMost, process.memoryUsage().heapUsed);
        }

        // (Between steps, as on a server: what's wanted made ahead, and the workers heard)
        const making = clock();

        runner.bakeAhead(ahead);
        parts.ahead += clock() - making;
        await new Promise((resolve) => setImmediate(resolve));
    }

    uninstall();

    const took = clock() - started;
    const total = wall.reduce((sum, ms) => sum + ms, 0);
    const measured = probes.toJSON();
    const passes = Object.fromEntries(Object.entries(measured.passes).map(([name, { ms, calls }]) => [name, { ms: round(ms), mean: round(ms / steps, 4), share: round(ms / total, 4), calls }]));
    const named = Object.entries(measured.passes).reduce((sum, [name, { ms }]) => sum + (name === "end" ? 0 : ms), 0) + parts.hear;

    actors.end = host.battle.actors.length;

    if (night) {
        // (Dark from its first step to its last: the night's 14 minutes, DAY.night to DAY.dawn)
        Object.assign(night, { to: round(timeOfDay(elapsedOf(host.war)) / 60000), dark: night.dark && torchesLit(elapsedOf(host.war)) && seconds * 1000 < DAY.length - DAY.night + DAY.dawn });

        if (!night.dark) {
            problems.push(`the night run wasn't dark from its first step to its last (minute ${night.from} to minute ${night.to} of the day's ${DAY.length / 60000})`);
        }
    }

    // (warturn: the first turn that fell in the run and the save after it, beside the steps round them)
    let warturn = null;

    if (keeper) {
        await keeper.settled();

        const turn = turnsIn[0] ?? null;
        const save = turn ? (savesIn.find(({ step }) => step > turn.step) ?? null) : null;
        const written = save ? (kept.saves[savesIn.indexOf(save)] ?? null) : null;
        const span = LOAD.round / STEP_MS;
        // (The longest of the steps between a turn's and its save's: the turn's doings acted on)
        const between = (one) => one.next.filter(({ step }) => !savesIn.some((saved) => saved.step === step)).reduce((worst, each) => (!worst || wall[each.step] > wall[worst.step] ? each : worst), null);
        const longest = turn ? between(turn) : null;
        const stepsOf = (from) => spreadOf(wall.subarray(Math.max(0, Math.min(steps, from)), Math.max(0, Math.min(steps, from + span))));

        warturn = {
            played,
            turns: turnsIn.length,
            turn: turn ? { at: turn.step * STEP_MS, number: turn.number, wall: round(wall[turn.step]), cpu: round(cpu[turn.step]), war: round(turn.war) } : { at: -1, number: 0, wall: 0, cpu: 0, war: 0 },
            save: save
                ? { at: save.step * STEP_MS, after: save.step - turn.step, wall: round(wall[save.step]), cpu: round(cpu[save.step]), text: round(save.text), bytes: written?.bytes ?? 0, zipped: written?.zipped ?? 0, gzip: round(written?.ms ?? 0), written: kept.saves.length }
                : { at: -1, after: 0, wall: 0, cpu: 0, text: 0, bytes: 0, zipped: 0, gzip: 0, written: kept.saves.length },
            between: longest ? { after: longest.step - turn.step, wall: round(wall[longest.step]), cpu: round(cpu[longest.step]), pass: longest.pass, ms: round(longest.ms) } : { after: 0, wall: 0, cpu: 0, pass: "", ms: 0 },
            round: { before: stepsOf(turn ? turn.step - span : 0), after: stepsOf(save ? save.step + 1 : steps) },
            // (Every turn that fell in the run: its step, the longest between it and its save, and its save's)
            all: turnsIn.map((one) => ({ at: one.step * STEP_MS, number: one.number, turn: round(wall[one.step]), between: round(wall[between(one)?.step] ?? 0), save: round(wall[savesIn.find(({ step }) => step > one.step && step <= one.step + KEEPER.after)?.step] ?? 0) })),
        };

        if (!turn || turn.step * STEP_MS !== eventAt) {
            problems.push(`the war's turn waited for at ${eventAt / 1000} s didn't come then`);
        } else if (!save || !written) {
            problems.push("the war's turn wasn't saved within the run");
        }
    }

    if (event && !event.ok) {
        problems.push(`the ${activity} asked for at ${eventAt / 1000} s didn't begin`);
    }

    if (hosting.players.size < count) {
        problems.push(`${count - hosting.players.size} of the players were sent out of the world`);
    }

    // --- A snapshot: how big, how long to take and to write out (the middle of a few) ---

    const shots = Array.from({ length: LOAD.snapshots }, () => {
        const before = clock();
        const snapshot = host.snapshot();
        const taken = clock();
        const text = encode(snapshot);

        const encoded = clock();

        // (And written straight from the world's own, as the server's saves are and what's sent
        // those who join: Host.snapshotText)
        host.snapshotText();

        return { take: taken - before, encode: encoded - taken, text: clock() - encoded, bytes: Buffer.byteLength(text) };
    });
    const middle = (key) => shots.map((shot) => shot[key]).sort((a, b) => a - b)[shots.length >> 1];
    const after = process.memoryUsage();
    const sent = [...kinds.values()].reduce((sum, { bytes }) => sum + bytes, 0);

    ahead.dispose();

    return {
        schema: LOAD.schema,
        run,
        built: true,
        joined,
        warm,
        navigation: { ...tiles, held: navigation.tiles.size, dropped: dropped - droppedBefore, reach: ahead.reach },
        steps: {
            count: steps,
            wall: spreadOf(wall),
            cpu: spreadOf(cpu),
            late,
            over,
            // (How fast the world was played: its time over the clock's)
            speed: round((steps * STEP_MS) / took, 1),
        },
        parts: { hear: round(parts.hear / steps, 4), step: round(parts.step / steps, 4), ahead: round(parts.ahead / steps, 4) },
        passes,
        // (The share of the steps' time that falls to a named pass or to what was heard: all but
        // `end` and whatever the runner does between the step and what's sent)
        named: round(named / total, 4),
        counts: measured.counts,
        bytes: {
            total: sent,
            perPeer: {
                // (Bytes a second: the mean player's, the busiest player's, and any player's busiest second)
                mean: Math.round(sent / count / seconds),
                most: Math.round(Math.max(...peers.map((peer) => peer.bytes)) / seconds),
                worstSecond: Math.max(...peers.map((peer) => peer.worstSecond)),
            },
            byKind: Object.fromEntries([...kinds].sort(([a], [b]) => (a < b ? -1 : 1))),
            up: { ...up, refused: hosting.dropped - commandsBefore, allowed: HEARD.commands },
        },
        snapshot: { bytes: middle("bytes"), take: round(middle("take")), encode: round(middle("encode")), text: round(middle("text")) },
        memory: {
            // (MB)
            heap: round(after.heapUsed / MB, 1),
            heapBefore: round(memory.before.heapUsed / MB, 1),
            heapMost: round(Math.max(memory.heapMost, after.heapUsed) / MB, 1),
            external: round(after.external / MB, 1),
            rss: round(after.rss / MB, 1),
        },
        actors,
        ...(event ? { event } : {}),
        ...(night ? { night } : {}),
        ...(warturn ? { warturn } : {}),
        problems,
        took: { run: round(took / 1000, 1), all: round((clock() - began) / 1000, 1) },
    };
}

// What a report must hold: each key's type ("number", "string", "boolean", "array", an object of
// the same, or [type] for an object of any keys whose values are all of it)
const SPREAD = { mean: "number", p50: "number", p99: "number", worst: "number", worstAt: "number" };
const RUN = { seed: "number", players: "number", layout: "string", activity: "string", seconds: "number", node: "string", platform: "string", arch: "string", cpus: "number" };

export const REPORT_SCHEMA = Object.freeze({
    schema: "number",
    run: RUN,
    built: "boolean",
    joined: { players: "number", ms: "number", welcome: { bytes: SPREAD, ms: SPREAD } },
    warm: { ms: "number", settled: "boolean", chunks: "number", rooms: "number", tiles: "number" },
    navigation: { tile: "number", keep: "number", wanted: "number", capped: "boolean", held: "number", dropped: "number", reach: "number" },
    steps: { count: "number", wall: SPREAD, cpu: SPREAD, late: "number", over: "number", speed: "number" },
    parts: { hear: "number", step: "number", ahead: "number" },
    passes: [{ ms: "number", mean: "number", share: "number", calls: "number" }],
    named: "number",
    counts: ["number"],
    bytes: {
        total: "number",
        perPeer: { mean: "number", most: "number", worstSecond: "number" },
        byKind: [{ messages: "number", bytes: "number" }],
        up: { messages: "number", bytes: "number", refused: "number", allowed: "number" },
    },
    snapshot: { bytes: "number", take: "number", encode: "number", text: "number" },
    memory: { heap: "number", heapBefore: "number", heapMost: "number", external: "number", rss: "number" },
    actors: { start: "number", most: "number", end: "number" },
    problems: "array",
    took: { run: "number", all: "number" },
});

/**
 * What a report holds besides, by its activity, under the activity's own name. `night`: how long
 * the world was played with no one in to get to nightfall (ms of its time), the war's turn as the
 * timed run began, the time of day it began and ended at (minutes from midnight), and whether it
 * was dark all through. `warturn`: how long the world was played with no one in first (ms of its
 * time: --turns), how many turns of the war fell in the run, and of the first: the step that
 * turned it (when, ms into the run; which turn; the step by the clock and in the thread's time;
 * the war's own pass in it), the step that saved it (when; how many steps after; the step; the
 * world's writing out in it, `text`; the save's size, and gzipped, and how long gzipping took off
 * the step; how many saves were written in all), the longest of the steps between the two (how
 * many after the turn; the step; and the pass that took most of it, by name, and its time), the
 * steps of the second before the turn and of the second after the save, by the clock, and every
 * turn that fell in the run ([{ at, number, turn, between, save }]: those three steps of each).
 */
export const ACTIVITY_SCHEMAS = Object.freeze({
    night: { waited: "number", turn: "number", from: "number", to: "number", dark: "boolean" },
    warturn: {
        played: "number",
        turns: "number",
        turn: { at: "number", number: "number", wall: "number", cpu: "number", war: "number" },
        save: { at: "number", after: "number", wall: "number", cpu: "number", text: "number", bytes: "number", zipped: "number", gzip: "number", written: "number" },
        between: { after: "number", wall: "number", cpu: "number", pass: "string", ms: "number" },
        round: { before: SPREAD, after: SPREAD },
        all: "array",
    },
});

/** What an unbuilt activity's report holds instead. */
export const UNBUILT_SCHEMA = Object.freeze({ schema: "number", run: RUN, built: "boolean", reason: "string" });

/**
 * What's wrong with a report by its schema (REPORT_SCHEMA; UNBUILT_SCHEMA for one that says its
 * activity isn't built): a line for each key missing, of the wrong type, or not a finite number;
 * none, if it's as it should be.
 */
export function checkReport(report, schema = report?.built === false ? UNBUILT_SCHEMA : REPORT_SCHEMA, at = "report") {
    const wrong = [];
    const check = (value, type, where) => {
        if (Array.isArray(type)) {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                wrong.push(`${where}: not an object`);
            } else {
                Object.entries(value).forEach(([key, each]) => check(each, type[0], `${where}.${key}`));
            }
        } else if (typeof type === "object") {
            wrong.push(...checkReport(value, type, where));
        } else if (type === "array" ? !Array.isArray(value) : type === "number" ? !Number.isFinite(value) : typeof value !== type) {
            wrong.push(`${where}: not ${type === "array" ? "an array" : `a ${type}`}`);
        }
    };

    if (report === null || typeof report !== "object" || Array.isArray(report)) {
        return [`${at}: not an object`];
    }

    // (A whole report of a run: what its activity adds, too)
    const whole = schema === REPORT_SCHEMA && Object.hasOwn(ACTIVITY_SCHEMAS, report.run?.activity) ? { ...schema, [report.run.activity]: ACTIVITY_SCHEMAS[report.run.activity] } : schema;

    for (const [key, type] of Object.entries(whole)) {
        if (!Object.hasOwn(report, key)) {
            wrong.push(`${at}.${key}: missing`);
        } else {
            check(report[key], type, `${at}.${key}`);
        }
    }

    return wrong;
}

/**
 * Why a run failed, a line each, judged only by what's the same on any machine, and by a ceiling
 * (`ceiling`, ms) on the mean step in the thread's own processor time that only a catastrophe is
 * over: the report not as its schema says; players sent out of the world; what was asked for at
 * LOAD.eventAt not begun; a night run not dark all through; a war's turn that didn't come when it was waited for, or wasn't saved; the mean step over the ceiling. None, if it didn't (nor for an activity
 * that isn't built: there was no run). The navigation's cap isn't a failure: it's reported.
 */
export function failuresOf(report, { ceiling = Infinity } = {}) {
    const wrong = checkReport(report);

    if (wrong.length || !report.built) {
        return wrong;
    }

    return [
        ...(report.joined.players < report.run.players ? [`${report.run.players - report.joined.players} of the players never came in`] : []),
        ...report.problems.filter((problem) => /sent out of the world|didn't begin|couldn't be stood|wasn't dark|didn't come then|wasn't saved/.test(problem)),
        ...(report.steps.cpu.mean > ceiling ? [`the mean step took ${report.steps.cpu.mean.toFixed(1)} ms of the thread's time, over the ceiling of ${ceiling} ms`] : []),
    ];
}

/** A report as lines to read. */
export function wordsOf(report) {
    const { run } = report;
    const title = `${run.players} players, ${run.layout}, ${run.activity}, seed ${run.seed}`;

    if (!report.built) {
        return [`${title}: ${report.reason}`];
    }

    const { steps, passes, bytes, snapshot, memory, navigation, warm } = report;
    const top = Object.entries(passes)
        .sort(([, a], [, b]) => b.ms - a.ms)
        .slice(0, 8);
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

    return [
        `${title}: ${steps.count} steps (${run.seconds} s of the world's time) in ${report.took.run} s, ${steps.speed} times as fast as it's played`,
        `A step by the clock: mean ${steps.wall.mean.toFixed(2)} ms, p99 ${steps.wall.p99.toFixed(2)} ms, worst ${steps.wall.worst.toFixed(1)} ms at ${((steps.wall.worstAt * STEP_MS) / 1000).toFixed(1)} s${steps.late ? `; ${steps.late} over ${STEP_MS} ms` : ""}`,
        `In the thread's own processor time: mean ${steps.cpu.mean.toFixed(2)} ms, p99 ${steps.cpu.p99.toFixed(2)} ms, worst ${steps.cpu.worst.toFixed(1)} ms${steps.over ? `; ${steps.over} over ${STEP_MS} ms` : ""}`,
        `Of a step: what was heard ${report.parts.hear.toFixed(3)} ms, the step and what it sent ${report.parts.step.toFixed(3)} ms; made ahead between steps ${report.parts.ahead.toFixed(3)} ms. Named passes ${(report.named * 100).toFixed(1)}% of it`,
        `The passes that took most (ms a step): ${top.map(([name, { mean, share }]) => `${name} ${mean.toFixed(3)} (${(share * 100).toFixed(0)}%)`).join(", ")}`,
        `Sent each player: ${kb(bytes.perPeer.mean)}/s (the busiest ${kb(bytes.perPeer.most)}/s, a worst second of ${kb(bytes.perPeer.worstSecond)}); by kind: ${Object.entries(bytes.byKind).map(([kind, sum]) => `${kind} ${kb(sum.bytes)} in ${sum.messages}`).join(", ")}`,
        `Heard: ${bytes.up.messages} messages, ${kb(bytes.up.bytes)}; ${bytes.up.refused} commands let go of for coming faster than ${bytes.up.allowed} a second`,
        `A snapshot: ${kb(snapshot.bytes)}, ${snapshot.take.toFixed(2)} ms to take, ${snapshot.encode.toFixed(2)} ms to write out (${snapshot.text.toFixed(2)} ms both together, written straight from the world); a welcome ${kb(report.joined.welcome.bytes.mean)}, ${report.joined.welcome.ms.mean.toFixed(1)} ms`,
        `Memory: heap ${memory.heap} MB (${memory.heapBefore} before, ${memory.heapMost} at most), external ${memory.external} MB, the process ${memory.rss} MB; ${report.actors.end} in the battle (${report.actors.most} at most)`,
        `Warm-up ${(warm.ms / 1000).toFixed(1)} s${warm.settled ? "" : ", not settled"}; navigation ${navigation.held} of ${navigation.keep} tiles, ${navigation.wanted} wanted round the players${navigation.capped ? `: over its cap, baked ahead ${navigation.reach} m round each, ${navigation.dropped} let go of during the run` : ""}`,
        ...(report.event ? [`The ${report.event.type} at ${report.event.at / 1000} s: ${report.event.ok ? `begun (${report.event.actors} more in the battle)` : "not begun"}`] : []),
        ...(report.night
            ? [`At night: minute ${report.night.from} to minute ${report.night.to} of the day's ${DAY.length / 60000}${report.night.dark ? "" : ", not dark all through"}, the war's turn ${report.night.turn}; the light to see by ${(passes.light?.mean ?? 0).toFixed(3)} ms a step, ${Math.round((report.counts["light.actors"] ?? 0) / steps.count)} gone through for torches and ${Math.round((report.counts["light.pairs"] ?? 0) / steps.count)} lights measured against players' places a step`]
            : []),
        ...(report.warturn
            ? [
                  `The war's turn ${report.warturn.turn.number} at ${report.warturn.turn.at / 1000} s: its step ${report.warturn.turn.wall.toFixed(1)} ms (${report.warturn.turn.cpu.toFixed(1)} of the thread's; the war's own pass ${report.warturn.turn.war.toFixed(1)}), the second before it a mean of ${report.warturn.round.before.mean.toFixed(2)} ms a step and ${report.warturn.round.before.worst.toFixed(1)} at worst; the longest of the steps before its save, ${report.warturn.between.after} after it, ${report.warturn.between.wall.toFixed(1)} ms (${report.warturn.between.cpu.toFixed(1)} of the thread's; ${report.warturn.between.pass} ${report.warturn.between.ms.toFixed(1)})`,
                  `Its save ${report.warturn.save.after} steps after: that step ${report.warturn.save.wall.toFixed(1)} ms (${report.warturn.save.cpu.toFixed(1)} of the thread's), ${report.warturn.save.text.toFixed(2)} of it writing the world out (${kb(report.warturn.save.bytes)}; gzipped off the step to ${kb(report.warturn.save.zipped)} in ${report.warturn.save.gzip.toFixed(1)} ms); the second after it a mean of ${report.warturn.round.after.mean.toFixed(2)} ms a step and ${report.warturn.round.after.worst.toFixed(1)} at worst. ${report.warturn.turns} turn${report.warturn.turns === 1 ? "" : "s"} in the run${report.warturn.all.slice(1).map((one) => `; turn ${one.number} at ${one.at / 1000} s: ${one.turn.toFixed(1)} ms, then ${one.between.toFixed(1)} at most, its save's ${one.save.toFixed(1)}`).join("")}`,
              ]
            : []),
        ...report.problems.map((problem) => `Note: ${problem}`),
    ];
}

async function main() {
    const { values } = parseArgs({
        options: {
            seed: { type: "string", default: "2" },
            players: { type: "string", default: "8" },
            layout: { type: "string", default: "spread" },
            activity: { type: "string", default: "walk" },
            seconds: { type: "string", default: String(LOAD.seconds) },
            turns: { type: "string", default: "0" },
            out: { type: "string", default: REPORT },
            ceiling: { type: "string" },
            json: { type: "boolean", default: false },
        },
    });
    let report;

    try {
        report = await load({ seed: Number(values.seed), players: Number(values.players), layout: values.layout, activity: values.activity, seconds: Number(values.seconds), turns: Number(values.turns), log: values.json ? () => {} : console.log });
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    await mkdir(path.dirname(path.resolve(values.out)), { recursive: true });
    await writeFile(path.resolve(values.out), JSON.stringify(report, null, 2));
    console.log(values.json ? JSON.stringify(report, null, 2) : wordsOf(report).join("\n"));

    if (values.ceiling !== undefined) {
        const failures = failuresOf(report, { ceiling: Number(values.ceiling) });

        if (failures.length) {
            console.error(`Failed:\n${failures.map((why) => `  ${why}`).join("\n")}`);
            process.exitCode = 1;
        }
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
