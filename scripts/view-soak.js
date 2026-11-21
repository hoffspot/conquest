// A replicated world's soak (generated/multiplayer_scaling_plan.md 3-30): a real world server
// (server/world-server.js) with one world played the replicated way, and players in Node who
// hold no copy of it: each is sent views and plays from them alone (core/bot.js ViewBot: a
// mirror of what its frames tell, its own hero steered by what they say of them, a foe the
// mirror shows gone for). They come in as the game does (app/servers.js ServerClient: /enter,
// then the play socket, its frames as bytes), all of them in one process of their own.
//
// It says what the world's views cost and whether they held: each player's frames and bytes a
// second, whom their mirror knew of, how evenly the frames came, and whether any mirror was told
// what couldn't be so (its faults); and, as the world server's soak does (scripts/server-soak.js),
// whether the steps' 99th percentile stayed under a step's time each minute, the world kept its
// pace, its memory kept flat after the first hour, and every player stayed in.
//
//     npm run soak:view                                  # 10 minutes, 8 players
//     npm run soak:view -- --players 25 --minutes 10     # the nightly's other run
//     npm run soak:view -- --players 50 --minutes 30     # the plan's, on the owner's Mac
//     npm run soak:view -- --seed 7 --json               # another world; the report as JSON
//
//     --fights     the players start field battles too (they come in as the world's owners)
//     --one-town   everyone human, in the humans' town (as it is without: each by their own
//                  people's town, the peoples in turn)
//
// With more in a world than a world takes (8), the server is opened with that limit raised, as
// the world server's soak raises it: an option of WorldServer.open, which no setting or request
// can give a server that's run as one.
//
// Writes the report to test-results/view-soak/report.json. Exits 1 if it fails.

import { fork } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { addressOf, KnownServers, ServerClient } from "../client/js/app/servers.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { ViewBot } from "../client/js/core/bot.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { WorldServer } from "../server/world-server.js";
import { judge, limitsFor, SERVER_SOAK, stayed, viewsOf, watched } from "./server-soak.js";

export const VIEW_SOAK = Object.freeze({
    // The most bytes a second a player's frames may come to, on the mean over the run and the
    // players (the plan's budget for a client: 20 KB a second)
    bytes: 20 * 1024,
    // The least of the world's steps, from a player's first frame to their last, that a frame
    // must have come for (the rest held back for a link that fell behind: core/viewfeed.js LAG)
    frames: 0.5,
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "test-results/view-soak/report.json");

// (The game's localStorage, in the players' process: nothing kept)
const memory = () => {
    const kept = new Map();

    return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key) };
};

// --- The players, all in one process of their own (--join-view) ---

async function playViews({ port, world, key, players, fights }) {
    const bots = [];
    // (One world for all their mirrors' battles to stand in: never stepped, so it's shared)
    const worlds = new Map();
    const build = ({ seed, race }) => worlds.get(`${seed}:${race}`) ?? worlds.set(`${seed}:${race}`, buildWorld({ seed, race })).get(`${seed}:${race}`);

    for (const { name, race, seed } of players) {
        const servers = new KnownServers(memory());
        const client = new ServerClient(servers.remember(addressOf(`127.0.0.1:${port}`)), { servers, secure: false });
        const entered = await client.enter({ world, key });
        const one = { name, race, closed: null, dropped: false, lost: 0, bot: null };
        // (The link a game's, and its hello a replicated game's: said by it. What comes back is
        // the bot's to take, not a game's)
        const { link } = await client.play({
            world,
            session: entered.session,
            netcode: "replicated",
            character: { hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } },
            onClosed: (reason) => (one.closed = reason),
            onDrop: () => (one.dropped = true),
        });

        one.bot = new ViewBot({ send: (text) => link.data(text), seed, fights, clock: () => performance.now(), build });
        link.onData = (text) => one.bot.hear(text);
        link.onBinary = (data) => one.bot.frame(new Uint8Array(data));
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

// The players' process: { report(): each one's, stop() }
async function viewers(options) {
    const child = fork(fileURLToPath(import.meta.url), ["--join-view", JSON.stringify(options)], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    let answer = null;
    let last = null;

    // (Behind the server for the machine's cores, as the players' own devices would be)
    try {
        os.setPriority(child.pid, SERVER_SOAK.nice);
    } catch {
        // (Not allowed here: they share the cores evenly)
    }

    child.on("message", (message) => {
        if (message !== "ready") {
            answer?.(message);
            answer = null;
        }
    });

    await new Promise((resolve, reject) => {
        child.once("message", resolve);
        child.once("exit", (code) => reject(new Error(`The players left (${code})`)));
    });

    return {
        async report() {
            if (child.exitCode !== null || !child.connected) {
                return (last ?? options.players).map((one) => ({ ...one, viewer: true, gone: true }));
            }

            last = await new Promise((resolve) => {
                answer = resolve;
                child.send("report");
                setTimeout(() => resolve(last), 5000);
            });

            return last ?? options.players.map((one) => ({ ...one, viewer: true, gone: true }));
        },
        stop: () => child.kill(),
    };
}

/**
 * How a soak's players' views went (their reports: core/bot.js ViewBot report), added up:
 * { players, frames, bytes, bytesASecond (each player's frames, on the mean, by the world's own
 * time: 20 steps a second, over the steps their frames spanned), most (the dearest player's),
 * rate (the share of those steps a frame came for), known (whom a mirror knew of, on the mean),
 * faults, again (views told again), commands (done and refused), arrivals (the worst player's
 * 95th and 99th percentile between frames, and the longest: ms), failures }. It fails if a
 * player was never welcomed or sent no frame, a mirror was told what couldn't be so, a player's
 * own hero isn't in their mirror, bytes that weren't a frame came, too few of the steps had a
 * frame (`frames`), or the frames came to more than `bytes` a second each on the mean.
 */
export function viewersOf(reports, { bytes = VIEW_SOAK.bytes, frames = VIEW_SOAK.frames } = {}) {
    const had = reports.filter((report) => report.viewer);
    const failures = [];
    const sum = (key) => had.reduce((all, report) => all + (report[key] ?? 0), 0);
    const perSecond = (report) => (report.steps ? (report.bytes / report.steps) * (1000 / STEP_MS) : 0);
    const steps = sum("steps");

    for (const report of had) {
        if (report.gone) {
            continue;
        }

        if (!report.me) {
            failures.push(`${report.name} was never welcomed${report.refused ? ` (refused: ${report.refused})` : ""}`);
        } else if (!report.frames) {
            failures.push(`${report.name} was sent no frame`);
        } else {
            if (report.faults) {
                failures.push(`${report.name}'s mirror was told ${report.faults} thing(s) that couldn't be so: ${report.lines?.[0] ?? ""}`);
            }

            if (report.unread) {
                failures.push(`${report.name} was sent ${report.unread} lot(s) of bytes that weren't a frame`);
            }

            if (!report.self && !report.kicked) {
                failures.push(`${report.name}'s own hero isn't among those its mirror knows of`);
            }

            if (report.frames < report.steps * frames) {
                failures.push(`${report.name} was sent a frame for ${report.frames} of ${report.steps} steps (${Math.round(frames * 100)}% at the least)`);
            }
        }
    }

    const mean = steps ? (sum("bytes") / steps) * (1000 / STEP_MS) : 0;

    if (mean > bytes) {
        failures.push(`each player's frames came to ${(mean / 1024).toFixed(1)} KB a second on the mean (${(bytes / 1024).toFixed(0)} KB at the most)`);
    }

    const worst = (key) => Math.max(0, ...had.map((report) => report.arrivals?.[key] ?? 0));

    return {
        players: had.length,
        frames: sum("frames"),
        bytes: sum("bytes"),
        bytesASecond: mean,
        most: Math.max(0, ...had.map(perSecond)),
        rate: steps ? sum("frames") / steps : 0,
        known: had.length ? sum("known") / had.length : 0,
        faults: sum("faults"),
        again: sum("again"),
        commands: { done: had.reduce((all, report) => all + (report.results?.done ?? 0), 0), refused: had.reduce((all, report) => all + (report.results?.refused ?? 0), 0) },
        arrivals: { p95: worst("p95"), p99: worst("p99"), worst: worst("worst") },
        failures,
    };
}

/**
 * Soak a world server's replicated world for `minutes` with `players` in Node who play from
 * their views alone (core/bot.js ViewBot; `fights`, starting fights too), all in the humans'
 * town (`oneTown`) or by their own peoples': resolves to the report ({ seed, minutes, options,
 * limits, players: [...ViewBot report], samples, histograms, passes, views (what the view feed
 * cost the world: scripts/server-soak.js viewsOf), viewers (viewersOf), judged, failures }).
 */
export async function soakView({ seed = 2, minutes = 10, players: count = 8, fights = false, oneTown = false, log = console.log } = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-view-soak-"));
    const limits = limitsFor(count);
    const server = await WorldServer.open(folder, { awake: () => ({ stop() {} }), router: false, funnel: false, ...(Object.keys(limits).length ? { limits } : {}) });
    const failures = [];
    const started = Date.now();
    let playing = null;

    try {
        await server.listen(0, "127.0.0.1");
        // (Before the world's opened, so its thread begins with its views on)
        await server.settings.change({ replication: "on" });

        const made = await server.createWorld({ name: "The view soak", seed, race: "human", heroes: "brought", settings: { debugCommands: true, netcode: "replicated", experimental: true } });
        const raceOf = (k) => (oneTown ? "human" : SERVER_SOAK.peoples[k % SERVER_SOAK.peoples.length]);

        log(`World ${made.world} (seed ${seed}), replicated, on 127.0.0.1:${server.port}${Object.keys(limits).length ? `; opened with ${JSON.stringify(limits)} in place of its limits` : ""}`);

        // (Owners all: the fights they start are theirs to start, with the debug commands)
        playing = await viewers({ port: server.port, world: made.world, key: made.ownerKey, players: Array.from({ length: count }, (_, k) => ({ name: `View${k + 1}`, race: raceOf(k), seed: k + 1 })), fights });
        log(`${count} players in, each sent views and holding no copy${fights ? ", starting fights" : ""}`);

        const samples = await watched(server, made.world, { minutes, started, log });
        const reports = await playing.report();

        failures.push(...stayed(reports));

        const seen = viewersOf(reports);

        failures.push(...seen.failures);

        const judged = judge(samples);

        failures.push(...judged.failures);

        const passes = server.metrics.passesOf(made.world);

        return { seed, minutes, options: { players: count, fights, layout: oneTown ? "one-town" : "spread" }, limits, players: reports, samples, histograms: server.metrics.histogramsOf(made.world), passes, views: viewsOf(passes, count), viewers: seen, judged, failures };
    } finally {
        playing?.stop();
        await server.close().catch(() => {});
        await rm(folder, { recursive: true, force: true });
    }
}

const { values } = parseArgs({
    options: {
        "join-view": { type: "string" },
        minutes: { type: "string" },
        players: { type: "string" },
        fights: { type: "boolean" },
        "one-town": { type: "boolean" },
        seed: { type: "string" },
        json: { type: "boolean" },
    },
    strict: false,
});

if (values["join-view"]) {
    await playViews(JSON.parse(values["join-view"]));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const report = await soakView({
        seed: Number(values.seed ?? 2),
        minutes: Number(values.minutes ?? 10),
        players: Number(values.players ?? 8),
        fights: values.fights === true,
        oneTown: values["one-town"] === true,
    });

    await mkdir(path.dirname(REPORT), { recursive: true });
    await writeFile(REPORT, JSON.stringify(report, null, 2));

    if (values.json) {
        console.log(JSON.stringify(report, null, 2));
    }

    const { judged, viewers: seen, views } = report;

    console.log(`${seen.players} players sent views: ${(seen.bytesASecond / 1024).toFixed(1)} KB a second each on the mean (the dearest ${(seen.most / 1024).toFixed(1)}), a frame for ${(seen.rate * 100).toFixed(1)}% of the steps, ${seen.known.toFixed(0)} known of each; ${seen.faults} faults, ${seen.again} views told again; ${seen.commands.done} commands done and ${seen.commands.refused} refused`);
    console.log(`Frames came, at the worst player's: 95 in a hundred within ${seen.arrivals.p95.toFixed(0)} ms of the last, 99 within ${seen.arrivals.p99.toFixed(0)} ms, the longest ${seen.arrivals.worst.toFixed(0)} ms`);

    if (views) {
        console.log(`The view feed: ${views.ms.toFixed(3)} ms a step on the mean for everyone's, ${views.frames} frames made`);
    }

    console.log(`Memory ${judged.settled ? `${Math.round(judged.settled / 1048576)} MB an hour in, ${Math.round(judged.latest / 1048576)} MB at the end (${judged.growth >= 0 ? "+" : ""}${Math.round(judged.growth * 100)}%)` : "not yet an hour in"}; steps' worst minute p99 ${judged.worstP99.toFixed(1)} ms; pace ${(judged.pace * 100).toFixed(1)}%`);
    console.log(report.failures.length ? `Failed:\n${report.failures.map((why) => `  ${why}`).join("\n")}` : "Passed");
    process.exit(report.failures.length ? 1 : 0);
}
