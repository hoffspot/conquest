// The server's own load test (generated/multiplayer_scaling_plan.md 0-11, 1-14): the world
// authority's load (scripts/load.js) played on this computer from the admin page, each run in a
// process of its own, one after another, and what each said kept as one report in plain text, to
// download and hand to whoever reads it. What it measures is the load's own: what a step costs
// and where (its mean, 99th percentile and worst, by the clock and in processor time, each pass
// by name, the late steps with their parts), what each player's sent, a snapshot's size and
// time, and memory; here it only adds what the computer is and how busy it was.
//
// Its kinds (LOADTEST.kinds): `table`, 8, 25, 50 and 100 players spread and walking (the plan's
// baseline table); `gate`, Stage 1's gate (six runs and its verdict); `both`; and `quick`, one
// short run of 8, to see that it works. One test at a time. It takes the computer's processors
// while it runs: the worlds going are slower for it, and its numbers worse for them, so the
// report says how many were going.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NET_VERSION } from "../client/js/core/netplay.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const walk = (players, seconds = 120) => ({ title: `${players} players spread, walking, ${seconds} s, seed 2`, args: ["--players", players, "--layout", "spread", "--activity", "walk", "--seconds", seconds, "--seed", 2] });
const GATE = { title: "Stage 1's gate: 100 spread walking, 100 spread with fights, an invasion and night, and 8 spread, each on two seeds", args: ["--gate"] };

/** The load test's kinds: each its name on the page, about how long it takes (minutes) and its runs ({ title, args: scripts/load.js's }). */
export const LOADTEST = Object.freeze({
    kinds: Object.freeze({
        quick: { name: "A quick look", minutes: 1, runs: [walk(8, 20)] },
        table: { name: "The baseline table", minutes: 10, runs: [8, 25, 50, 100].map((players) => walk(players)) },
        gate: { name: "Stage 1's gate", minutes: 15, runs: [GATE] },
        both: { name: "The table and the gate", minutes: 25, runs: [...[8, 25, 50, 100].map((players) => walk(players)), GATE] },
    }),
    /** The most of a run's words kept (characters): a run gone wrong can say a great deal. */
    most: 200000,
});

// One run: scripts/load.js in a process of its own; what it said, and how it ended
function play(script, args, onChild) {
    return new Promise((resolve) => {
        const child = execFile(process.execPath, [script, ...args.map(String)], { maxBuffer: 2 ** 28, cwd: os.tmpdir() }, (error, out, said) => {
            resolve({ out: String(out ?? ""), said: String(said ?? ""), code: error ? (error.code ?? 1) : 0, killed: Boolean(error?.killed) });
        });

        onChild(child);
    });
}

export class LoadTest {
    /**
     * @param {object} [options]
     * @param {() => { worlds: number, players: number }} [options.busy] - What's going on this server now.
     * @param {Function} [options.play] - Plays a run ((script, args, onChild) => Promise<{ out, said, code, killed }>): the tests' own.
     * @param {string} [options.script] - The load's script.
     * @param {() => number} [options.now]
     */
    constructor({ busy = () => ({ worlds: 0, players: 0 }), play: playing = play, script = path.join(ROOT, "scripts/load.js"), now = Date.now } = {}) {
        Object.assign(this, { busy, playing, script, now });

        /** The test going, or the last: { kind, started, ended, run, runs, title, stopped, error }, or null. */
        this.state = null;

        /** The last report made (text), or null; and its file's name. */
        this.report = null;
        this.name = null;
        this.child = null;
        process.once("exit", () => this.child?.kill());
    }

    /** How it stands: whether one's going, which run of how many, and whether there's a report to download. */
    status() {
        const state = this.state;

        return {
            kinds: Object.entries(LOADTEST.kinds).map(([id, { name, minutes, runs }]) => ({ id, name, minutes, runs: runs.length })),
            going: Boolean(state && !state.ended),
            test: state && { kind: state.kind, started: state.started, ended: state.ended, run: state.run, runs: state.runs, title: state.title, stopped: state.stopped, error: state.error },
            report: this.report ? { name: this.name, bytes: Buffer.byteLength(this.report) } : null,
        };
    }

    /** Begin a test of a kind (LOADTEST.kinds): returns its status at once; `done` (a promise) settles when it's over. Throws if one's going, or the kind's unknown. */
    start(kind) {
        const chosen = Object.hasOwn(LOADTEST.kinds, kind) ? LOADTEST.kinds[kind] : null;

        if (!chosen) {
            throw new Error(`There's no load test called "${kind}".`);
        }

        if (this.state && !this.state.ended) {
            throw new Error("A load test is going already.");
        }

        const state = { kind, started: this.now(), ended: null, run: 0, runs: chosen.runs.length, title: "", stopped: false, error: null };

        this.state = state;
        this.done = this.#run(state, chosen).catch((error) => {
            state.error = error.message;
            state.ended = this.now();
        });

        return this.status();
    }

    /** Stop the test going, if one is: what it had measured is still reported. */
    stop() {
        if (this.state && !this.state.ended) {
            this.state.stopped = true;
            this.child?.kill();
        }

        return this.status();
    }

    async #run(state, chosen) {
        const before = { load: os.loadavg(), free: os.freemem(), ...this.busy() };
        const parts = [];

        for (const { title, args } of chosen.runs) {
            if (state.stopped) {
                break;
            }

            state.run++;
            state.title = title;

            const out = path.join(os.tmpdir(), `pellagos-load-${state.started}-${state.run}.json`);
            const began = this.now();
            const { out: words, said, code, killed } = await this.playing(this.script, [...args, "--out", out], (child) => (this.child = child));

            this.child = null;
            parts.push([`=== ${state.run} of ${state.runs}: ${title} (${Math.round((this.now() - began) / 1000)} s to play) ===`, words.trim().slice(0, LOADTEST.most) || "(It said nothing.)", ...(killed ? ["(Stopped before it ended.)"] : code && said.trim() ? [`(It ended with ${code}: ${said.trim().slice(0, 4000)})`] : [])].join("\n"));
        }

        const after = this.busy();
        const cpus = os.cpus();
        const version = await readFile(path.join(ROOT, "package.json"), "utf8").then((text) => JSON.parse(text).version, () => "unknown");
        const gb = (bytes) => `${(bytes / 2 ** 30).toFixed(1)} GB`;

        state.ended = this.now();
        this.name = `pellagos-load-${chosen === LOADTEST.kinds.quick ? "quick-" : ""}${new Date(state.started).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
        this.report = [
            "Pellagos load test report (server/loadtest.js; generated/multiplayer_scaling_plan.md 0-11 and 1-14)",
            `Test: ${chosen.name} (${state.kind}), ${state.run} of ${state.runs} runs${state.stopped ? ", stopped early" : ""}`,
            `Started: ${new Date(state.started).toISOString()}; took ${Math.round((state.ended - state.started) / 1000)} s`,
            `Game: version ${version}, NET_VERSION ${NET_VERSION}`,
            `Computer: ${os.platform()} ${os.arch()} ${os.release()}; ${cpus[0]?.model ?? "unknown processor"}, ${cpus.length} cores; ${gb(os.totalmem())} memory, ${gb(before.free)} free before; Node ${process.version}`,
            `Its load before (1, 5 and 15 minutes): ${before.load.map((load) => load.toFixed(2)).join(", ")}; after: ${os.loadavg().map((load) => load.toFixed(2)).join(", ")}`,
            `Worlds going on this server meanwhile: ${before.worlds} with ${before.players} players in before, ${after.worlds} with ${after.players} after${before.players || after.players ? " (their steps shared the processors: the numbers are worse for it)" : ""}`,
            "",
            parts.join("\n\n"),
            "",
        ].join("\n");
    }
}
