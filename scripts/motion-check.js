// The motion check (the terrain plan's M8, §10.1: client/js/characters/motioncheck.js): every motion
// the characters make, on each people's bodies at the ends of their builds, holding what they
// hold, measured for joints past their ranges, things and limbs in the body, feet sliding or in
// the ground, and second hands off their hafts:
//
//     npm run check:motion                      # everything, against the baseline
//     npm run check:motion -- --only rest/      # only the motions whose ids start so
//     npm run check:motion -- --body orc-       # only the bodies whose ids start so
//     npm run check:motion -- --update          # keep this run's failures as the baseline (saying
//                                               # first what's worse and better than it was)
//     npm run check:motion -- --jobs 2          # how many threads (all the machine's, else)
//     npm run check:motion -- --data human      # on another body (body.js BODIES; the game's,
//                                               # GAME_BODY, else)
//
// What's already wrong is kept in test/motion-baseline.json; a failure that's new, or worse than
// it was by more than a little (TOLERANCE), fails the check (exit code 1), so CI fails on any
// regression and only what's wrong needs looking at. What's got better is said, so the baseline
// can be brought down with --update. The report (test-results/motion/report.json, and a copy at
// client/motion-report.json) has every motion on every body, its failures worst first; the
// contact sheet (motion-sheet.html, served by npm start) draws them as they happened.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { GAME_BODY } from "../client/js/characters/body.js";
import { BODIES, failures, MEASURES, motions, play } from "../client/js/characters/motioncheck.js";
import { readHumanData } from "./lib/human-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(root, "test/motion-baseline.json");
const REPORT = path.join(root, "test-results/motion/report.json");
// (A copy beside the contact sheet, so npm start serves it there: not kept in git)
const SHEET_COPY = path.join(root, "client/motion-report.json");

/** How much worse than the baseline a failure may come out before it counts as a regression (its measure's units). */
export const TOLERANCE = Object.freeze({ joint: 1, item: 0.003, limb: 0.003, slide: 0.003, ground: 0.003, grip: 0.003 });


// A measure's value as kept (degrees to a hundredth, metres to a tenth of a millimetre)
const kept = (kind, value) => Math.round(value * (kind === "joint" ? 100 : 10000)) / (kind === "joint" ? 100 : 10000);

/**
 * Compare a run's results ({ "motion|body": worst }) with the baseline's failures (the same, only
 * what was past its limit): { regressions, better }, each [{ key, kind, value, was }]. A failure
 * the baseline hasn't got is new, but a regression only once it's past its limit by more than a
 * little too (so what was just inside it and comes out just past it isn't).
 */
export function compare(results, baseline) {
    const regressions = [];
    const better = [];

    for (const [key, worst] of Object.entries(results)) {
        const was = baseline[key] ?? {};

        for (const [kind, { value }] of failures(worst)) {
            if (value > (was[kind] ?? MEASURES[kind].limit) + TOLERANCE[kind]) {
                regressions.push({ key, kind, value: kept(kind, value), was: was[kind] ?? null });
            }
        }

        for (const [kind, before] of Object.entries(was)) {
            const value = worst?.[kind]?.value ?? 0;

            if (value < before - TOLERANCE[kind] || value <= MEASURES[kind].limit) {
                better.push({ key, kind, value: kept(kind, value), was: before });
            }
        }
    }

    return { regressions, better };
}

// What a run's results keep as the baseline: each failure's value
function baselineOf(results) {
    return Object.fromEntries(
        Object.entries(results)
            .map(([key, worst]) => [key, Object.fromEntries(failures(worst).map(([kind, { value }]) => [kind, kept(kind, value)]))])
            .filter(([, kinds]) => Object.keys(kinds).length),
    );
}

const say = (kind, value) => `${(value * MEASURES[kind].scale).toFixed(1)}${MEASURES[kind].unit}`;

// --- A thread: play its share of the pairs, and hand back their worst ---

if (!isMainThread) {
    // (The body all bodies are shaped from)
    const human = readHumanData(workerData.data);
    const all = new Map(motions().map((motion) => [motion.id, motion]));
    const bodies = new Map(BODIES.map((body) => [body.id, body]));
    const results = {};

    for (const key of workerData.keys) {
        const [motion, body] = key.split("|");
        const played = play(human, all.get(motion), bodies.get(body));

        if (played) {
            results[key] = played.worst;
        }

        parentPort.postMessage({ done: 1 });
    }

    parentPort.postMessage({ results });
}

// --- The check ---

async function main() {
    const args = process.argv.slice(2);
    const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
    const update = args.includes("--update");
    const only = option("--only") ?? "";
    const bodyOnly = option("--body") ?? "";
    const jobs = Math.max(1, Number(option("--jobs")) || availableParallelism());
    const data = option("--data") ?? GAME_BODY;

    // (The baseline is the game's body's)
    if (update && data !== GAME_BODY) {
        throw new Error(`--update keeps the baseline of the game's body (${GAME_BODY}), not of --data's`);
    }
    const list = motions().filter(({ id }) => id.startsWith(only));
    const bodies = BODIES.filter(({ id }) => id.startsWith(bodyOnly));
    // (Longest first, dealt round the threads, so they finish together)
    const keys = list.toSorted((a, b) => b.seconds / b.every - a.seconds / a.every).flatMap(({ id }) => bodies.map((body) => `${id}|${body.id}`));
    const shares = Array.from({ length: Math.min(jobs, keys.length) }, (_, k) => keys.filter((_, i) => i % jobs === k));
    const started = performance.now();
    let done = 0;

    console.log(`The motion check: ${list.length} motions on ${bodies.length} bodies (${keys.length}) of ${data}'s data, ${shares.length} threads`);

    const parts = await Promise.all(
        shares.map(
            (share) =>
                new Promise((resolve, reject) => {
                    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { keys: share, data } });

                    worker.on("message", (message) => {
                        if (message.results) {
                            resolve(message.results);
                        } else if (++done % 500 === 0) {
                            console.log(`  ${done} of ${keys.length}, ${((performance.now() - started) / 1000).toFixed(0)} s`);
                        }
                    });
                    worker.on("error", reject);
                }),
        ),
    );
    const results = Object.assign({}, ...parts);
    const seconds = (performance.now() - started) / 1000;
    const everything = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { failures: {} };
    // (Only the pairs this run played are compared: --only, --body)
    const played = new Set(keys);
    const baseline = Object.fromEntries(Object.entries(everything.failures).filter(([key]) => played.has(key)));
    const { regressions, better } = compare(results, baseline);
    const failing = Object.entries(results).flatMap(([key, worst]) => failures(worst).map(([kind, { value, t, what, at }]) => ({ key, kind, value: kept(kind, value), t, what, at })));

    mkdirSync(path.dirname(REPORT), { recursive: true });

    const written = JSON.stringify({
        seconds: Math.round(seconds),
        measures: MEASURES,
        bodies: BODIES,
        motions: list.map(({ id, group, label, seconds: length }) => ({ id, group, label: label ?? null, seconds: length })),
        failures: failing.toSorted((a, b) => b.value / MEASURES[b.kind].limit - a.value / MEASURES[a.kind].limit),
        regressions,
        better,
        results,
    });

    writeFileSync(REPORT, written);
    writeFileSync(SHEET_COPY, written);

    const kinds = Object.keys(MEASURES).map((kind) => `${kind} ${failing.filter((one) => one.kind === kind).length}`);

    console.log(`${keys.length} played in ${seconds.toFixed(0)} s; failing (past their limits): ${kinds.join(", ")}`);
    console.log(`The report: ${path.relative(root, REPORT)} (drawn by client/motion-sheet.html)`);

    for (const { key, kind, value, was } of better.slice(0, 20)) {
        console.log(`  better: ${key} ${kind} ${say(kind, value)} (was ${say(kind, was)})`);
    }

    if (better.length) {
        console.log(`${better.length} better than the baseline${update ? "" : ": bring it down with --update"}`);
    }

    for (const { key, kind, value, was } of regressions.slice(0, 50)) {
        const { t, what } = results[key][kind];

        console.log(`  WORSE: ${key} ${MEASURES[kind].label} ${say(kind, value)}${was === null ? " (new)" : ` (was ${say(kind, was)})`} at ${t} s: ${what}`);
    }

    // (Kept: what's worse is then known, as said above, and doesn't fail; say why in the pull request)
    if (update) {
        const failures = { ...Object.fromEntries(Object.entries(everything.failures).filter(([key]) => !played.has(key))), ...baselineOf(results) };

        writeFileSync(BASELINE, `${JSON.stringify({ about: "The motion check's known failures (scripts/motion-check.js): motion|body → measure → value (degrees, metres). Kept with --update.", failures: Object.fromEntries(Object.entries(failures).toSorted(([a], [b]) => a.localeCompare(b))) }, null, 1)}\n`);
        console.log(`${regressions.length} worse than the baseline was; the baseline kept: ${path.relative(root, BASELINE)}`);
    } else if (regressions.length) {
        console.log(`${regressions.length} regressions against the baseline (drawn by motion-sheet.html?new=1)`);
        process.exitCode = 1;
    } else {
        console.log("No regressions against the baseline");
    }
}

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
