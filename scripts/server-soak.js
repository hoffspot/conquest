// The world server's soak (generated/world_server_plan.md §15 S9, §17): a real world server
// (server/world-server.js, its world in a thread of its own) with players in Node, each in a
// process of its own, coming in as the game does (app/servers.js ServerClient: /enter, then the
// play socket) and playing by themselves (core/bot.js), for as long as it's told. Every minute it
// asks the server how it's keeping up (manage.js health: the world's steps, its thread's memory)
// and notes the server's own memory. Then it says whether memory kept flat after the first hour
// (the world's thread no more than SERVER_SOAK.growth above where it stood an hour in), whether
// the steps' 99th percentile stayed under a step's time (STEP_MS) each minute once they were all
// in, and whether every player stayed in. Nothing else should be running on the machine: the
// players' copies of the world share its cores with the server's, so they're run at a lower
// priority (as if they were on devices of their own), and the world's thread's own CPU time is
// noted each minute beside its steps, which are timed by the clock.
//
//     npm run soak:server                                # 2 hours, 8 players
//     npm run soak:server -- --minutes 10 --players 4    # a quick look
//     npm run soak:server -- --seed 7 --json             # another world; the report as JSON
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
import { Bot } from "../client/js/core/bot.js";
import { WorldServer } from "../server/world-server.js";

export const SERVER_SOAK = Object.freeze({
    // How long (minutes) before memory's expected to have settled; and how much (a share) the
    // world's thread may grow after that before it isn't flat
    settle: 60,
    growth: 0.15,
    // The first minute whose steps are judged: the first holds the players coming in (each one's
    // copy of the world made from a snapshot, a cost the step-spike budget measures on its own)
    warm: 2,
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

// A player, in a process of its own: { name, race, report(), stop() }
async function player(options) {
    const child = fork(fileURLToPath(import.meta.url), ["--join", JSON.stringify(options)], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
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
        child.once("exit", (code) => reject(new Error(`${options.name} left (${code})`)));
    });

    return {
        name: options.name,
        race: options.race,
        async report() {
            if (child.exitCode !== null || !child.connected) {
                return last ? { ...last, gone: true } : { gone: true };
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
 * Whether a soak's samples ({ minute, world: { heap, external, p99, ... } }) passed: memory flat
 * after `settle` minutes, and every minute's 99th-percentile step from minute `warm` on under a
 * step's time. Returns
 * { flat, settled (bytes, an hour in), latest (bytes, at the end), growth (share), worstP99, slowMinutes, failures }.
 */
export function judge(samples, { settle = SERVER_SOAK.settle, growth = SERVER_SOAK.growth, warm = SERVER_SOAK.warm, step = STEP_MS } = {}) {
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

    if (settled && grew > growth) {
        failures.push(`the world's memory grew ${Math.round(grew * 100)}% after the first ${settle} minutes (from ${Math.round(settled / 1048576)} MB to ${Math.round(latest / 1048576)} MB)`);
    }

    if (slow.length) {
        failures.push(`the steps' 99th percentile reached ${Math.max(...slow.map((sample) => sample.world.p99)).toFixed(1)} ms in ${slow.length} minute(s) (a step's ${step} ms)`);
    }

    return { flat: !settled || grew <= growth, settled, latest, growth: grew, worstP99: Math.max(0, ...timed.map((sample) => sample.world.p99)), slowMinutes: slow.length, failures };
}

/**
 * Soak a world server for `minutes` with `players` in Node: resolves to the report ({ seed,
 * minutes, players: [...core/bot.js report], samples: [{ minute, world, server }], judged, failures }).
 */
export async function soakServer({ seed = 2, minutes = 120, players: count = 8, log = console.log } = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-server-soak-"));
    const server = await WorldServer.open(folder, { awake: () => ({ stop() {} }), router: false, funnel: false });
    const players = [];
    const samples = [];
    const failures = [];
    const started = Date.now();

    try {
        await server.listen(0, "127.0.0.1");

        const made = await server.createWorld({ name: "The soak", seed, race: "human", heroes: "brought", settings: { debugCommands: true } });

        log(`World ${made.world} (seed ${seed}) on 127.0.0.1:${server.port}`);

        for (let k = 0; k < count; k++) {
            const race = SERVER_SOAK.peoples[k % SERVER_SOAK.peoples.length];

            // (Owners all: the fights they start are theirs to start, with the debug commands)
            players.push(await player({ port: server.port, world: made.world, key: made.ownerKey, name: `Soak${k + 1}`, race, seed: k + 1 }));
            log(`Soak${k + 1} in, as ${/^[aeiou]/.test(race) ? "an" : "a"} ${race}`);
        }

        const end = started + minutes * 60000;
        let before = { at: performance.now(), cpu: null, rooms: 0 };

        for (let minute = 1; Date.now() < end; minute++) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(SERVER_SOAK.every, Math.max(0, end - Date.now()))));

            const health = await server.manage.health();
            const world = health.worlds.find((one) => one.id === made.world) ?? null;
            const now = { at: performance.now(), cpu: world?.cpu ?? null, rooms: world?.made?.rooms ?? 0 };
            // (The share of one core the world's thread had this minute)
            const busy = now.cpu && before.cpu ? (now.cpu.user + now.cpu.system - before.cpu.user - before.cpu.system) / 1000 / (now.at - before.at) : null;
            // (And the tiles of buildings' insides it baked ahead this minute: a few as players come
            // near new buildings, none once they've stayed)
            const rooms = now.rooms - before.rooms;

            before = now;
            const sample = {
                minute,
                world: world && { heap: world.memory?.heap ?? null, external: world.memory?.external ?? null, count: world.steps?.count ?? 0, mean: world.steps?.mean ?? 0, p99: world.steps?.p99 ?? 0, worst: world.steps?.worst ?? 0, present: world.present, actors: world.actors, busy, rooms },
                server: health.server,
            };

            samples.push(sample);
            log(`${minute} min: ${world ? `${world.present} in, steps p99 ${sample.world.p99.toFixed(1)} ms (worst ${sample.world.worst.toFixed(1)}), ${world.actors} in the battle, its thread ${busy === null ? "?" : `${Math.round(busy * 100)}%`} busy (${rooms} insides' tiles baked), world ${Math.round((sample.world.heap + sample.world.external) / 1048576)} MB` : "the world isn't going"}, server ${Math.round(health.server.rss / 1048576)} MB`);
        }

        const reports = [];

        for (const one of players) {
            reports.push({ name: one.name, race: one.race, ...(await one.report()) });
        }

        for (const report of reports) {
            if (report.gone || report.closed || report.dropped) {
                failures.push(`${report.name} didn't stay in (${report.closed ?? (report.dropped ? "dropped" : "gone")})`);
            }
        }

        const judged = judge(samples);

        failures.push(...judged.failures);

        return { seed, minutes, players: reports, samples, judged, failures };
    } finally {
        for (const one of players) {
            one.stop();
        }

        await server.close().catch(() => {});
        await rm(folder, { recursive: true, force: true });
    }
}

const { values } = parseArgs({ options: { join: { type: "string" }, minutes: { type: "string" }, players: { type: "string" }, seed: { type: "string" }, json: { type: "boolean" } }, strict: false });

if (values.join) {
    await play(JSON.parse(values.join));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const report = await soakServer({ seed: Number(values.seed ?? 2), minutes: Number(values.minutes ?? 120), players: Number(values.players ?? 8) });

    await mkdir(path.dirname(REPORT), { recursive: true });
    await writeFile(REPORT, JSON.stringify(report, null, 2));

    if (values.json) {
        console.log(JSON.stringify(report, null, 2));
    }

    const { judged } = report;

    console.log(`Memory ${judged.settled ? `${Math.round(judged.settled / 1048576)} MB an hour in, ${Math.round(judged.latest / 1048576)} MB at the end (${judged.growth >= 0 ? "+" : ""}${Math.round(judged.growth * 100)}%)` : "not yet an hour in"}; steps' worst minute p99 ${judged.worstP99.toFixed(1)} ms`);
    console.log(report.failures.length ? `Failed:\n${report.failures.map((why) => `  ${why}`).join("\n")}` : "Passed");
    process.exit(report.failures.length ? 1 : 0);
}
