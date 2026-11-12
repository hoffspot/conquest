// The world server's soak (generated/world_server_plan.md §15 S9, §17): a real world server
// (server/world-server.js, its world in a thread of its own) with players in Node, each in a
// process of its own, coming in as the game does (app/servers.js ServerClient: /enter, then the
// play socket) and playing by themselves (core/bot.js), for as long as it's told. Every minute it
// asks the server how it's keeping up (manage.js health: the world's steps, its thread's memory)
// and notes the server's own memory. Then it says whether memory kept flat after the first hour
// (the world's thread no more than SERVER_SOAK.growth above where it stood an hour in), whether
// the steps' 99th percentile stayed under a step's time (STEP_MS) each minute once they were all
// in, whether the world kept its pace (played SERVER_SOAK.pace of its clock's time or more, letting
// go of no more than the rest: core/runner.js letGo), and whether every player stayed in. Nothing else should be running on the machine: the
// players' copies of the world share its cores with the server's, so they're run at a lower
// priority (as if they were on devices of their own), and the world's thread's own CPU time is
// noted each minute beside its steps, which are timed by the clock.
//
//     npm run soak:server                                # 2 hours, 8 players
//     npm run soak:server -- --minutes 10 --players 4    # a quick look
//     npm run soak:server -- --seed 7 --json             # another world; the report as JSON
//     npm run soak:server -- --minutes 10 --players 4 --thin 25   # 4 as above and 25 thin ones
//
// Thin players (--thin M; generated/multiplayer_scaling_plan.md 0-3) hold no copy of the world:
// they speak what a game speaks and steer by what they're told of their own hero (core/bot.js
// ThinBot), all of them in one process, so there can be many more of them than the machine could
// play whole copies for. The others (--players N) keep their copies, and say whether a copy still
// keeps to the host's with that many in the world. With more in a world than a world takes (8), or
// in a server than a server does, the server is opened with those limits raised: as options of
// WorldServer.open (`limits`), which no setting or request can give a server that's run as one.
//
//     --hold       the thin ones hold a stick (16 commands a second each) rather than tap
//     --fights     the thin ones start field battles too, as the others do
//     --spread     everyone by their own people's start town, the peoples in turn (as it is
//                  without: a server puts a hero in their people's town, so six towns at the most)
//     --one-town   everyone human, in the humans' town
//     --tunnel     everyone comes in through the tunnel listener (world-server.js listenTunnel:
//                  where Tailscale Funnel brings the internet), so as the internet's, not home's
//
// Writes the report to test-results/server-soak/report.json. Exits 1 if it fails.

import { fork } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { addressOf, KnownServers, ServerClient } from "../client/js/app/servers.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { Bot, ThinBot } from "../client/js/core/bot.js";
import { LIMITS } from "../server/access/limits.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";

export const SERVER_SOAK = Object.freeze({
    // How long (minutes) before memory's expected to have settled; and how much (a share) the
    // world's thread may grow after that before it isn't flat
    settle: 60,
    growth: 0.15,
    // The first minute whose steps are judged: the first holds the players coming in (each one's
    // copy of the world made from a snapshot, a cost the step-spike budget measures on its own)
    warm: 2,
    // The least of its clock's time the world may have played from that minute on (its pace: 1,
    // unless it fell behind and let time go, core/runner.js letGo; generated/multiplayer_scaling_plan.md 1-1)
    pace: 0.99,
    // The peoples the players come in as, in turn
    peoples: ["human", "elf", "orc", "cat", "lizard", "darkElf"],
    // How often (ms) each player plays a little, and how often the server's asked how it's going
    tick: 10,
    every: 60000,
    // How far behind the server the players' processes are for the machine's cores (os.setPriority)
    nice: 10,
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "test-results/server-soak/report.json");

// (The game's localStorage, in a player's process: nothing kept)
const memory = () => {
    const kept = new Map();

    return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key) };
};

// --- A player, in a process of its own (--join) ---

async function play({ port, world, key, name, race, seed }) {
    const servers = new KnownServers(memory());
    const client = new ServerClient(servers.remember(addressOf(`127.0.0.1:${port}`)), { servers, secure: false });
    const entered = await client.enter({ world, key });
    let closed = null;
    let dropped = false;
    const { joining } = await client.play({
        world,
        session: entered.session,
        character: { hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } },
        onClosed: (reason) => (closed = reason),
        onDrop: () => (dropped = true),
    });
    const bot = new Bot(joining, { seed });
    let ready = false;
    let last = performance.now();

    setInterval(() => {
        const now = performance.now();

        bot.tick(now - last);
        last = now;

        // (Its copy made: playing, as the game says once it's loaded)
        if (!ready && joining.host) {
            ready = true;
            joining.ready();
        }
    }, SERVER_SOAK.tick);

    process.on("message", (message) => {
        if (message === "report") {
            process.send({ ...bot.report(), closed, dropped });
        }
    });

    // (The soak gone, however it went: so is its player)
    process.on("disconnect", () => process.exit(0));
    process.send("ready");
}

// --- The thin players, all in one process of their own (--join-thin) ---

async function playThin({ port, world, key, players, hold, fights }) {
    const bots = [];

    for (const { name, race, seed } of players) {
        const servers = new KnownServers(memory());
        const client = new ServerClient(servers.remember(addressOf(`127.0.0.1:${port}`)), { servers, secure: false });
        const entered = await client.enter({ world, key });
        const one = { name, race, closed: null, dropped: false, lost: 0, bot: null };
        // (The link a game's: its hello said by it. What comes back is the thin bot's to hear, not
        // a copy's to play)
        const { link } = await client.play({
            world,
            session: entered.session,
            character: { hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } },
            onClosed: (reason) => (one.closed = reason),
            onDrop: () => (one.dropped = true),
        });

        one.bot = new ThinBot({ send: (text) => link.data(text), seed, hold, fights, clock: () => performance.now() });
        link.onData = (text) => one.bot.hear(text);
        link.onLost = () => one.lost++;
        link.onFound = () => {};
        bots.push(one);
    }

    let last = performance.now();

    setInterval(() => {
        const now = performance.now();

        for (const { bot } of bots) {
            bot.tick(now - last);
        }

        last = now;
    }, SERVER_SOAK.tick);

    process.on("message", (message) => {
        if (message === "report") {
            process.send(bots.map(({ name, race, closed, dropped, lost, bot }) => ({ name, race, ...bot.report(), closed, dropped, lost })));
        }
    });
    process.on("disconnect", () => process.exit(0));
    process.send("ready");
}

// A player, in a process of its own: { name, race, report(), stop() }; or, `thin`, all the thin
// ones in one process ({ report(): each one's, stop() })
async function player(options, { thin = false } = {}) {
    const child = fork(fileURLToPath(import.meta.url), [thin ? "--join-thin" : "--join", JSON.stringify(options)], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    let answer = null;

    // (Behind the server for the machine's cores, as a player's own device would be)
    try {
        os.setPriority(child.pid, SERVER_SOAK.nice);
    } catch {
        // (Not allowed here: they share the cores evenly)
    }

    let last = null;

    child.on("message", (message) => {
        if (message !== "ready") {
            answer?.(message);
            answer = null;
        }
    });

    await new Promise((resolve, reject) => {
        child.once("message", resolve);
        child.once("exit", (code) => reject(new Error(`${options.name ?? "The thin players"} left (${code})`)));
    });

    return {
        name: options.name,
        race: options.race,
        async report() {
            if (child.exitCode !== null || !child.connected) {
                return thin ? (last ?? options.players).map((one) => ({ ...one, thin: true, gone: true })) : last ? { ...last, gone: true } : { gone: true };
            }

            last = await new Promise((resolve) => {
                answer = resolve;
                child.send("report");
                setTimeout(() => resolve(last), 5000);
            });

            return last;
        },
        stop: () => child.kill(),
    };
}

/**
 * Who didn't stay in, of a soak's players (their reports: core/bot.js report, a thin one's with
 * `thin`), a line each saying why: gone (their process), their link closed or dropped, sent out,
 * or, a thin one, refused or never welcomed. None, if they all did.
 */
export function stayed(reports) {
    return reports.flatMap((report) => {
        const why = report.gone ? "gone" : report.closed ? report.closed : report.dropped ? "dropped" : report.kicked ? `sent out: ${report.kicked.reason}` : report.thin && report.refused ? `refused: ${report.refused}` : report.thin && !report.me ? "never welcomed" : null;

        return why ? [`${report.name} didn't stay in (${why})`] : [];
    });
}

/**
 * Whether a soak's samples ({ minute, world: { heap, external, p99, ... } }) passed: memory flat
 * after `settle` minutes, every minute's 99th-percentile step from minute `warm` on under a
 * step's time, and the world's pace over those minutes (the share of its clock's time it played:
 * each sample's `ms` gone by less the `dropped` it let go of) no less than `pace`. Returns
 * { flat, settled (bytes, an hour in), latest (bytes, at the end), growth (share), worstP99,
 * slowMinutes, pace (1 with nothing let go, or none timed), dropped (ms), failures }.
 */
export function judge(samples, { settle = SERVER_SOAK.settle, growth = SERVER_SOAK.growth, warm = SERVER_SOAK.warm, step = STEP_MS, pace = SERVER_SOAK.pace } = {}) {
    const failures = [];
    const used = (sample) => (sample.world?.heap ?? 0) + (sample.world?.external ?? 0);
    const after = samples.filter((sample) => sample.minute >= settle && sample.world);
    const settled = after.length ? used(after[0]) : null;
    // (The end: the last ten minutes' least, so a collection that's due doesn't count against it)
    const tail = after.slice(-10);
    const latest = tail.length ? Math.min(...tail.map(used)) : null;
    const grew = settled ? (latest - settled) / settled : 0;
    const timed = samples.filter((sample) => sample.minute >= warm && sample.world?.p99 !== undefined && sample.world.count > 0);
    const slow = timed.filter((sample) => sample.world.p99 >= step);
    // (What it let go of in the minutes judged, of the time those minutes were)
    const paced = timed.filter((sample) => sample.world.ms > 0 && Number.isFinite(sample.world.dropped));
    const dropped = paced.reduce((sum, sample) => sum + sample.world.dropped, 0);
    const given = paced.reduce((sum, sample) => sum + sample.world.ms, 0);
    const kept = given > 0 ? Math.max(0, 1 - dropped / given) : 1;

    if (settled && grew > growth) {
        failures.push(`the world's memory grew ${Math.round(grew * 100)}% after the first ${settle} minutes (from ${Math.round(settled / 1048576)} MB to ${Math.round(latest / 1048576)} MB)`);
    }

    if (slow.length) {
        failures.push(`the steps' 99th percentile reached ${Math.max(...slow.map((sample) => sample.world.p99)).toFixed(1)} ms in ${slow.length} minute(s) (a step's ${step} ms)`);
    }

    if (kept < pace) {
        failures.push(`the world played ${(kept * 100).toFixed(1)}% of its clock's time, letting ${(dropped / 1000).toFixed(1)} s go (it's to keep ${pace * 100}%)`);
    }

    return { flat: !settled || grew <= growth, settled, latest, growth: grew, worstP99: Math.max(0, ...timed.map((sample) => sample.world.p99)), slowMinutes: slow.length, pace: kept, dropped, failures };
}

/**
 * The limits a soak's server is opened with in place of its own (world-server.js open's `limits`),
 * for `players` in one world: only those that many are over (none, for 8 or fewer: the server as
 * it always is). A world's own setting takes 8 at the most, a server LIMITS.players in all its
 * worlds and LIMITS.socketsPerAddress from one address, which they all come from here.
 */
export function limitsFor(players) {
    return {
        ...(players > WORLD_SETTINGS.mostPlayers.max ? { mostPlayers: players } : {}),
        ...(players > LIMITS.players ? { players } : {}),
        ...(players > LIMITS.socketsPerAddress ? { socketsPerAddress: players } : {}),
    };
}

/**
 * Soak a world server for `minutes` with `players` in Node, each with a copy of the world, and
 * `thin` more with none (core/bot.js ThinBot: `hold`, holding a stick; `fights`, starting fights
 * too), all in the humans' town (`oneTown`) or by their own peoples', and through the tunnel
 * listener (`tunnel`) or not: resolves to the report ({ seed, minutes, options, limits, players:
 * [...core/bot.js report, the thin ones' with `thin`], samples: [{ minute, world, server }],
 * histograms (the world's steps, ticks, their parts and its saves, as the server's metrics count
 * them: server/server-metrics.js histogramsOf), judged, resyncs (the world sent a copy again, in all: `desyncs` of them for a copy a check
 * found astray, `skips` for one fallen too far behind to catch up, as one slow to load is as it
 * comes in), failures }).
 */
export async function soakServer({ seed = 2, minutes = 120, players: count = 8, thin = 0, hold = false, fights = false, oneTown = false, tunnel = false, log = console.log } = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-server-soak-"));
    const limits = limitsFor(count + thin);
    const server = await WorldServer.open(folder, { awake: () => ({ stop() {} }), router: false, funnel: false, ...(Object.keys(limits).length ? { limits } : {}) });
    const players = [];
    const samples = [];
    const failures = [];
    const started = Date.now();

    try {
        await server.listen(0, "127.0.0.1");

        // (Through the tunnel listener: the internet answered there, as with Funnel on, on a port
        // of this machine's own that nothing outside it reaches)
        if (tunnel) {
            await server.settings.change({ internet: true, funnel: true });
            await server.listenTunnel(0);
        }

        const port = tunnel ? server.tunnelPort : server.port;
        const made = await server.createWorld({ name: "The soak", seed, race: "human", heroes: "brought", settings: { debugCommands: true } });
        const raceOf = (k) => (oneTown ? "human" : SERVER_SOAK.peoples[k % SERVER_SOAK.peoples.length]);

        log(`World ${made.world} (seed ${seed}) on 127.0.0.1:${port}${tunnel ? ", its tunnel listener" : ""}${Object.keys(limits).length ? `; opened with ${JSON.stringify(limits)} in place of its limits` : ""}`);

        for (let k = 0; k < count; k++) {
            const race = raceOf(k);

            // (Owners all: the fights they start are theirs to start, with the debug commands)
            players.push(await player({ port, world: made.world, key: made.ownerKey, name: `Soak${k + 1}`, race, seed: k + 1 }));
            log(`Soak${k + 1} in, as ${/^[aeiou]/.test(race) ? "an" : "a"} ${race}`);
        }

        if (thin) {
            const thins = Array.from({ length: thin }, (_, k) => ({ name: `Thin${k + 1}`, race: raceOf(count + k), seed: count + k + 1 }));

            players.push(await player({ port, world: made.world, key: made.ownerKey, players: thins, hold, fights }, { thin: true }));
            log(`${thin} thin players in${hold ? ", holding their sticks" : ""}${fights ? ", starting fights" : ""}`);
        }

        const end = started + minutes * 60000;
        let before = { at: performance.now(), cpu: null, rooms: 0, dropped: 0 };

        for (let minute = 1; Date.now() < end; minute++) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(SERVER_SOAK.every, Math.max(0, end - Date.now()))));

            const health = await server.manage.health();
            const world = health.worlds.find((one) => one.id === made.world) ?? null;
            const now = { at: performance.now(), cpu: world?.cpu ?? null, rooms: world?.made?.rooms ?? 0, dropped: world?.dropped ?? 0 };
            // (The share of one core the world's thread had this minute)
            const busy = now.cpu && before.cpu ? (now.cpu.user + now.cpu.system - before.cpu.user - before.cpu.system) / 1000 / (now.at - before.at) : null;
            // (And the tiles of buildings' insides it baked ahead this minute: a few as players come
            // near new buildings, none once they've stayed)
            const rooms = now.rooms - before.rooms;
            // (And the time it let go of this minute, fallen behind its clock, of the minute's own)
            const dropped = Math.max(0, now.dropped - before.dropped);
            const ms = now.at - before.at;

            before = now;
            const sample = {
                minute,
                world: world && { heap: world.memory?.heap ?? null, external: world.memory?.external ?? null, count: world.steps?.count ?? 0, mean: world.steps?.mean ?? 0, p99: world.steps?.p99 ?? 0, worst: world.steps?.worst ?? 0, present: world.present, actors: world.actors, busy, rooms, ms, dropped },
                server: health.server,
            };

            samples.push(sample);
            log(`${minute} min: ${world ? `${world.present} in, steps p99 ${sample.world.p99.toFixed(1)} ms (worst ${sample.world.worst.toFixed(1)}), ${world.actors} in the battle, its thread ${busy === null ? "?" : `${Math.round(busy * 100)}%`} busy (${rooms} insides' tiles baked)${dropped > 0 ? `, ${(dropped / 1000).toFixed(1)} s let go` : ""}, world ${Math.round((sample.world.heap + sample.world.external) / 1048576)} MB` : "the world isn't going"}, server ${Math.round(health.server.rss / 1048576)} MB`);
        }

        const reports = [];

        for (const one of players) {
            const said = await one.report();

            reports.push(...(Array.isArray(said) ? said : [{ name: one.name, race: one.race, ...said }]));
        }

        failures.push(...stayed(reports));

        const judged = judge(samples);

        failures.push(...judged.failures);

        // (And every step, tick and save of the run counted into the buckets the server's own
        // metrics keep: what its /metrics would say, so a run and a live server are read alike)
        const sum = (key) => reports.reduce((all, report) => all + (report[key] ?? 0), 0);

        return { seed, minutes, options: { players: count, thin, hold, fights, layout: oneTown ? "one-town" : "spread", tunnel }, limits, players: reports, samples, histograms: server.metrics.histogramsOf(made.world), judged, resyncs: sum("resyncs"), desyncs: sum("desyncs"), skips: sum("skips"), failures };
    } finally {
        for (const one of players) {
            one.stop();
        }

        await server.close().catch(() => {});
        await rm(folder, { recursive: true, force: true });
    }
}

const { values } = parseArgs({
    options: {
        join: { type: "string" },
        "join-thin": { type: "string" },
        minutes: { type: "string" },
        players: { type: "string" },
        thin: { type: "string" },
        hold: { type: "boolean" },
        fights: { type: "boolean" },
        spread: { type: "boolean" },
        "one-town": { type: "boolean" },
        tunnel: { type: "boolean" },
        seed: { type: "string" },
        json: { type: "boolean" },
    },
    strict: false,
});

if (values.join) {
    await play(JSON.parse(values.join));
} else if (values["join-thin"]) {
    await playThin(JSON.parse(values["join-thin"]));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (values.spread && values["one-town"]) {
        console.error("--spread or --one-town, not both");
        process.exit(1);
    }

    const report = await soakServer({
        seed: Number(values.seed ?? 2),
        minutes: Number(values.minutes ?? 120),
        players: Number(values.players ?? 8),
        thin: Number(values.thin ?? 0),
        hold: values.hold === true,
        fights: values.fights === true,
        oneTown: values["one-town"] === true,
        tunnel: values.tunnel === true,
    });

    await mkdir(path.dirname(REPORT), { recursive: true });
    await writeFile(REPORT, JSON.stringify(report, null, 2));

    if (values.json) {
        console.log(JSON.stringify(report, null, 2));
    }

    const { judged } = report;

    const thins = report.players.filter((one) => one.thin);

    if (thins.length) {
        const chars = thins.reduce((sum, one) => sum + Object.values(one.heard ?? {}).reduce((all, { chars: each }) => all + each, 0), 0);

        console.log(`${thins.length} thin players: each sent ${(chars / thins.length / (report.minutes * 60) / 1024).toFixed(1)} KB a second on the mean, ${thins.reduce((sum, one) => sum + (one.states ?? 0), 0)} sent the world again`);
    }

    console.log(`The world sent again to a copy ${report.resyncs} time(s) in all: ${report.desyncs} for a copy found astray, ${report.skips} for one fallen too far behind to catch up`);
    console.log(`Memory ${judged.settled ? `${Math.round(judged.settled / 1048576)} MB an hour in, ${Math.round(judged.latest / 1048576)} MB at the end (${judged.growth >= 0 ? "+" : ""}${Math.round(judged.growth * 100)}%)` : "not yet an hour in"}; steps' worst minute p99 ${judged.worstP99.toFixed(1)} ms; pace ${(judged.pace * 100).toFixed(1)}%`);
    console.log(report.failures.length ? `Failed:\n${report.failures.map((why) => `  ${why}`).join("\n")}` : "Passed");
    process.exit(report.failures.length ? 1 : 0);
}
