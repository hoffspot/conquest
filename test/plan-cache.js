// The world's plans kept between the unit tests' processes. `npm test` loads this into every one
// of them before its test file (package.json: node --import ./test/plan-cache.js; into the threads
// they start too). Laying a plan out takes two or three seconds of the processor, each test file
// runs in a process of its own, and nearly half of them want a plan, most the same two or three
// seeds': 15% of all the unit tests' work, measured. So a plan laid out by one process is written
// under node_modules/.cache/, and the next process to ask for that seed's reads it back, in a few
// hundredths of a second, through worldplan/plan.js keepPlans (which says what of a plan is kept:
// the plan, and the land its waters are worked out from, landOf), and taken as that process's own
// (adoptPlan).
//
// A plan read back must be the one layOutWorld would make now. Each is kept by its seed and by a
// hash of the planner's code: plan.js and every module it imports, and those they import, found
// by following the imports (sourcesOf), with the engine's version. Change any of them and no plan
// kept before is asked for again. And by the dungeons' themes as they stand when it's asked for
// (plannerKey): the one thing the planner goes by that can be added to as the game runs, so a
// plan laid out with a theme of a test's own is never read by a process without it.
//
// CI doesn't restore that folder: a CI run starts with none, so every plan there it laid out
// itself, afresh, from the code it's testing (the first test file to want a seed's; those after it
// read that one back). A plan kept by an earlier run never reaches the gate.
//
// Anything that goes wrong here (no node_modules, a folder that can't be written, a file cut
// short) only means the plan's laid out, as without this. To lay every plan out afresh in every
// process, run the tests with PLAN_CACHE=off, or a test file without the --import; to start again
// with none kept, delete node_modules/.cache/pellagos-plans.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize, serialize } from "node:v8";
import { threadId } from "node:worker_threads";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { keepPlans } from "../client/js/core/worldplan/plan.js";
import { importsIn, importsWorkedOut } from "../scripts/lib/imports.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** The planner: the module whose layOutWorld makes a plan. */
export const PLANNER = path.join(ROOT, "client/js/core/worldplan/plan.js");

/** Where the plans are kept. */
export const FOLDER = path.join(ROOT, "node_modules/.cache/pellagos-plans");

// How a kept plan's file is laid out: changed, none kept before is read
const FORMAT = 1;

// A plan kept for other code, or a file a process died writing, is let go once it's this old (ms)
const STALE = 3600 * 1000;

// A module and all it imports, and they import: each one's file and its bytes. It throws if what
// one imports can't be followed to a file (a package, or a name worked out as it runs)
function read(entry) {
    const found = new Map([[path.resolve(entry), null]]);

    // (Those found as it goes are read in their turn)
    for (const file of found.keys()) {
        const bytes = readFileSync(file);
        const code = bytes.toString("utf8");

        found.set(file, bytes);

        if (importsWorkedOut(code)) {
            throw new Error(`${file} imports something worked out as it runs`);
        }

        for (const from of importsIn(code)) {
            if (!from.startsWith(".")) {
                throw new Error(`${file} imports ${from}, which isn't a file beside it`);
            }

            const imported = path.resolve(path.dirname(file), from);

            if (!found.has(imported)) {
                found.set(imported, null);
            }
        }
    }

    return found;
}

/**
 * Every file a module is made of: itself and all it imports, and they import, found by following
 * the imports (in order of their paths). It throws if any can't be followed to a file.
 */
export function sourcesOf(entry) {
    return [...read(entry).keys()].sort();
}

/**
 * What a module's code is kept by: a hash of every file it's made of (sourcesOf: where each is from
 * the module, and its bytes), of the engine's version (which writes and reads a plan's bytes) and
 * the processor's kind. It throws as sourcesOf does.
 */
export function keyOf(entry) {
    const files = read(entry);
    const hash = createHash("sha256").update(`${FORMAT}\n${process.versions.v8}\n${process.arch}\n`);

    for (const file of [...files.keys()].sort()) {
        hash.update(`${path.relative(path.dirname(path.resolve(entry)), file)}\n${files.get(file).length}\n`).update(files.get(file));
    }

    return hash.digest("hex").slice(0, 24);
}

// What's read back, each of its arrays given memory of its own, as layOutWorld made them: read
// back they're all windows on the one file's bytes, which would be kept whole while any was, and
// taken from all of them if one's were handed to a thread. (One array in two places is still one)
function owned(value, done = new Map()) {
    if (!value || typeof value !== "object") {
        return value;
    }

    if (!done.has(value)) {
        if (ArrayBuffer.isView(value)) {
            done.set(value, value.slice());
        } else {
            done.set(value, value);

            for (const [name, each] of Object.entries(value)) {
                if (each && typeof each === "object") {
                    value[name] = owned(each, done);
                }
            }
        }
    }

    return done.get(value);
}

// The planner's code's key, worked out when it's first wanted (the processes that never want a
// plan read no code for it): null if it can't be
let code;

/**
 * What the planner's plans are kept by, as it now stands: its code (keyOf), and the dungeons'
 * themes just now (dungeons/themes.js THEMES, which registerTheme adds to: the planner gives each
 * dungeon in the wilds one of them, so with another theme it lays out another world). Null if the
 * planner's code can't be followed: nothing's kept then.
 */
export function plannerKey() {
    if (code === undefined) {
        try {
            code = keyOf(PLANNER);
        } catch {
            code = null;
        }
    }

    return code && `${code}-${createHash("sha256").update(JSON.stringify(THEMES)).digest("hex").slice(0, 8)}`;
}

/**
 * Plans kept in a folder, by their seed and a key (what made them: a string, or a function that
 * says it each time one's asked for or kept, null if it can't): { get(seed) (what was put, or
 * null), put(seed, laid) }, as worldplan/plan.js keepPlans takes them (`laid`: { plan, land },
 * written as one, so the arrays they share are shared when they're read back). Neither ever
 * throws: a plan that can't be read is laid out, one that can't be written isn't kept.
 *
 * Many processes may keep and read at once: a plan's written under a name of the writer's own and
 * given its name only once it's whole, so no one reads half of one, and two that write the same
 * plan leave one of them.
 */
export function plansIn(folder, key) {
    const keyNow = typeof key === "function" ? key : () => key;
    // (Whole numbers only: a seed is one, and its file's name is made of it)
    const fileOf = (seed, by) => (Number.isSafeInteger(seed) && by ? path.join(folder, `plan-${seed}-${by}.v8`) : null);

    return {
        get(seed) {
            try {
                const by = keyNow();
                const file = fileOf(seed, by);
                const kept = file ? deserialize(readFileSync(file)) : null;

                // (Its own word for what it is, besides its name's; and the land the plan's own
                // arrays still, as plan.js adoptPlan takes it)
                const laid = kept && kept.format === FORMAT && kept.key === by && kept.seed === seed && kept.laid?.plan?.seed === seed && kept.laid.land ? owned(kept.laid) : null;

                return laid && laid.land.height === laid.plan.height && laid.land.water === laid.plan.water ? laid : null;
            } catch {
                return null;
            }
        },

        put(seed, laid) {
            let writing = null;

            try {
                const by = keyNow();
                const file = fileOf(seed, by);

                if (!file) {
                    return;
                }

                writing = `${file}.${process.pid}-${threadId}-${randomBytes(4).toString("hex")}.tmp`;
                mkdirSync(folder, { recursive: true });
                writeFileSync(writing, serialize({ format: FORMAT, key: by, seed, laid }));
                renameSync(writing, file);
                writing = null;

                // (And what's there for other code, or was never finished, let go once it's old)
                for (const name of readdirSync(folder)) {
                    const other = path.join(folder, name);

                    try {
                        if (!name.endsWith(`-${by}.v8`) && Date.now() - statSync(other).mtimeMs > STALE) {
                            rmSync(other, { force: true });
                        }
                    } catch {
                        // (Another process let it go first)
                    }
                }
            } catch {
                // (Not kept: it's laid out again next time. What was half-written isn't left)
                try {
                    if (writing) {
                        rmSync(writing, { force: true });
                    }
                } catch {
                    // (It's let go of once it's old)
                }
            }
        },
    };
}

// Kept from here on (unless PLAN_CACHE=off), where npm has put the packages (never made where it
// hasn't: nothing's kept in a checkout with no node_modules)
if (process.env.PLAN_CACHE !== "off" && existsSync(path.join(ROOT, "node_modules"))) {
    keepPlans(plansIn(FOLDER, plannerKey));
}
