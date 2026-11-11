// The world's plans kept between the unit tests' processes (test/plan-cache.js, through
// worldplan/plan.js keepPlans): a plan read back is the plan laid out afresh, whole and its own,
// with the same waters; kept by its seed and by the planner's code, every module of it found by
// following the imports, so a change to any of them misses; and nothing but a miss ever comes of
// what can't be read or written, or of many keeping and reading at once
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { watersOf } from "../client/js/core/terrain/waters.js";
import { keepPlans, planWorld } from "../client/js/core/worldplan/plan.js";
import { keyOf, PLANNER, plansIn, sourcesOf } from "./plan-cache.js";

const CACHE = fileURLToPath(new URL("./plan-cache.js", import.meta.url));

// (A seed whose river runs by Bellhaven's crag: its waters are the land's as it was settled, and
// made from the plan itself, the crag set into its land, they'd stand elsewhere in fifty cells)
const SEED = 6;

const made = [];

// A new empty folder of its own, for a test (all of them taken away after)
function scratch() {
    const folder = mkdtempSync(path.join(os.tmpdir(), "pellagos-plans-"));

    made.push(folder);

    return folder;
}

// Wherever plans were kept before these tests (the real folder, under `npm test`), kept there again after
const before = keepPlans(null);

after(() => {
    keepPlans(before);

    for (const folder of made) {
        rmSync(folder, { recursive: true, force: true });
    }
});

// Files written into a folder ({ name: text })
function write(folder, files) {
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
        writeFileSync(path.join(folder, name), text);
    }

    return folder;
}

// A store that notes what's asked of it and what came of it
function watched(store) {
    const asked = [];

    return {
        asked,
        get(seed) {
            const plan = store.get(seed);

            asked.push(["get", seed, plan ? "had" : "none"]);

            return plan;
        },
        put(seed, plan) {
            asked.push(["put", seed]);
            store.put(seed, plan);
        },
    };
}

// Code run in a thread of its own (another copy of the game's code, as another process has), given `data`: what it posts back
function inThread(code, data) {
    return new Promise((resolve, reject) => {
        const thread = new Worker(`const { parentPort, workerData } = require("node:worker_threads");\n(async () => {\n${code}\n})();`, { eval: true, workerData: data });

        thread.once("message", resolve);
        thread.once("error", reject);
        thread.once("exit", (code_) => reject(new Error(`the thread ended (${code_}) having said nothing`)));
    });
}

describe("the planner's code, found by following its imports (plan-cache.js sourcesOf, keyOf)", () => {
    it("follows every way a module imports another: over several lines, re-exported, for its doing alone, and as it runs", () => {
        const folder = write(scratch(), {
            "a.js": 'import {\n    b,\n    other,\n} from "./deep/b.js";\nexport { c } from "./c.js";\nexport * from "./d.js";\nimport "./e.js";\n\nexport const a = () => import("./f.js");\n// (Told of, not imported: taken from "./nowhere.js")\n',
            "deep/b.js": 'import * as g from "../g.js";\nexport const b = g;\nexport const other = 1;\n',
            "c.js": "export const c = 1;\n",
            "d.js": "export const d = 1;\n",
            "e.js": "globalThis.e = 1;\n",
            "f.js": "export default 1;\n",
            "g.js": "export default 1;\n",
            "unused.js": "export default 1;\n",
        });

        assert.deepEqual(
            sourcesOf(path.join(folder, "a.js")).map((file) => path.relative(folder, file).split(path.sep).join("/")),
            ["a.js", "c.js", "d.js", "deep/b.js", "e.js", "f.js", "g.js"],
        );

        // (What can't be followed to a file is said, never guessed at)
        write(folder, { "package.js": 'import three from "three";\n', "worked-out.js": "export const load = (name) => import(name);\n", "gone.js": 'import "./missing.js";\n' });
        assert.throws(() => sourcesOf(path.join(folder, "package.js")), /imports three/);
        assert.throws(() => sourcesOf(path.join(folder, "worked-out.js")), /worked out as it runs/);
        assert.throws(() => sourcesOf(path.join(folder, "gone.js")), /ENOENT/);
    });

    it("finds every module Node loads for the planner", () => {
        const sources = sourcesOf(PLANNER);
        const coverage = scratch();
        const ran = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(PLANNER).href)});`], { env: { ...process.env, NODE_OPTIONS: "", NODE_V8_COVERAGE: coverage }, encoding: "utf8" });

        assert.equal(ran.status, 0, ran.stderr);

        // (Every script that process ran, as V8 counted them: the game's own among them)
        const game = fileURLToPath(new URL("../client/", import.meta.url));
        const loaded = readdirSync(coverage)
            .flatMap((name) => JSON.parse(readFileSync(path.join(coverage, name), "utf8")).result)
            .filter(({ url }) => url.startsWith("file:"))
            .map(({ url }) => fileURLToPath(url))
            .filter((file) => file.startsWith(game));

        assert.ok(loaded.includes(PLANNER) && loaded.length > 5, `${loaded.length} of the game's modules loaded`);
        assert.deepEqual(loaded.filter((file) => !sources.includes(file)), [], "loaded, but not among those it's kept by");
    });

    it("keys the code by every file of it: another key when any changes, the same again when it's as it was", () => {
        const folder = write(scratch(), { "a.js": 'import { b } from "./b.js";\nexport const a = b;\n', "b.js": 'import { c } from "./c.js";\nexport const b = c;\n', "c.js": "export const c = 1;\n" });
        const key = () => keyOf(path.join(folder, "a.js"));
        const first = key();

        assert.match(first, /^[0-9a-f]{24}$/);
        assert.equal(key(), first);

        // (The furthest of them changed by a character; put back; and what one imports changed)
        write(folder, { "c.js": "export const c = 2;\n" });

        const changed = key();

        assert.notEqual(changed, first);
        write(folder, { "c.js": "export const c = 1;\n" });
        assert.equal(key(), first);
        write(folder, { "b.js": 'import { c } from "./d.js";\nexport const b = c;\n', "d.js": "export const c = 1;\n" });
        assert.ok(![first, changed].includes(key()));

        // (The planner's own: worked out, as the tests' processes do)
        assert.match(keyOf(PLANNER), /^[0-9a-f]{24}$/);
    });
});

describe("plans kept in a folder (plan-cache.js plansIn; plan.js keepPlans)", () => {
    const folder = scratch();
    const key = keyOf(PLANNER);
    const store = plansIn(folder, key);
    const fileOf = (seed) => path.join(folder, `plan-${seed}-${key}.v8`);
    let fresh;

    it("keeps a plan as it's laid out, and reads back the same plan: all of it, plain data, its arrays its own; and the land its waters were worked out on", () => {
        const kept = watched(store);

        keepPlans(kept);
        fresh = planWorld(SEED);
        keepPlans(null);

        // (None kept yet: laid out here, and kept; whole, with nothing left half-written)
        assert.deepEqual(kept.asked, [["get", SEED, "none"], ["put", SEED]]);
        assert.deepEqual(readdirSync(folder), [path.basename(fileOf(SEED))]);

        const back = store.get(SEED);

        assert.notEqual(back.plan, fresh);
        assert.deepStrictEqual(back.plan, fresh);

        // (The land as it was settled: some of the plan's own arrays, and still the very same ones read back)
        const land = watersOf(fresh).plan;

        assert.deepStrictEqual(back.land, land);
        assert.ok(Object.keys(land).length >= 5);

        for (const name of Object.keys(land)) {
            assert.equal(land[name], fresh[name], name);
            assert.equal(back.land[name], back.plan[name], `${name} read back`);
        }

        // (A plan is plain objects, lists and arrays of numbers, all of it there to be listed: so
        // nothing of it is lost written as bytes. Each array read back has memory of its own)
        let arrays = 0;
        const plain = (value, read, where) => {
            if (!value || typeof value !== "object") {
                return;
            }

            if (ArrayBuffer.isView(value)) {
                assert.equal(Object.getPrototypeOf(read), Object.getPrototypeOf(value), where);
                assert.ok(read.byteOffset === 0 && read.buffer.byteLength === read.byteLength, `${where} has its own memory`);
                arrays++;

                return;
            }

            assert.ok([Object.prototype, Array.prototype].includes(Object.getPrototypeOf(value)), `${where} is a plain object or a list`);

            for (const name of Reflect.ownKeys(value)) {
                if (Array.isArray(value) && name === "length") {
                    continue;
                }

                const { enumerable, get, set } = Object.getOwnPropertyDescriptor(value, name);

                assert.ok(typeof name === "string" && enumerable && !get && !set, `${where}.${String(name)} is plain`);
                plain(value[name], read[name], `${where}.${name}`);
            }
        };

        plain(fresh, back.plan, "plan");
        assert.ok(arrays >= 9, `${arrays} arrays`);
    });

    it("hands another copy of the game's code the plan that was kept, laid out by none: frozen and shared, as one laid out is, its waters the same", async () => {
        const told = await inThread(
            `
            const { plansIn } = await import(workerData.cache);
            const { keepPlans, planWorld } = await import(workerData.planner);
            const { watersOf } = await import(workerData.waters);
            const store = plansIn(workerData.folder, workerData.key);
            const asked = [];

            keepPlans({ get: (seed) => { const laid = store.get(seed); asked.push(["get", seed, laid ? "had" : "none"]); return laid; }, put: (seed) => asked.push(["put", seed]) });

            const plan = planWorld(workerData.seed);
            const waters = watersOf(plan);

            parentPort.postMessage({ plan, asked, frozen: Object.isFrozen(plan) && Object.isFrozen(plan.places[0].at), shared: planWorld(workerData.seed) === plan, surfaces: waters.surfaces, running: waters.running, fords: waters.fords() });
            `,
            { cache: pathToFileURL(CACHE).href, planner: pathToFileURL(PLANNER).href, waters: new URL("../client/js/core/terrain/waters.js", import.meta.url).href, folder, key, seed: SEED },
        );

        assert.deepEqual(told.asked, [["get", SEED, "had"]], "asked for once, and never laid out");
        assert.ok(told.frozen && told.shared);
        assert.deepStrictEqual(told.plan, fresh);

        // (Where its rivers and lakes stand, what runs where, and its fords: worked out there on
        // the land read back, here as the plan was settled)
        const waters = watersOf(fresh);

        assert.deepStrictEqual(told.surfaces, waters.surfaces);
        assert.deepStrictEqual(told.running, waters.running);
        assert.deepStrictEqual(told.fords, waters.fords());
        assert.ok(told.fords.length > 20, `${told.fords.length} fords`);
    });

    it("misses when the planner's code is other than the plan was kept by, or the seed is", () => {
        assert.equal(plansIn(folder, "0".repeat(24)).get(SEED), null);
        assert.equal(store.get(SEED + 1), null);
        assert.equal(store.get(String(SEED)), null, "a seed is a number");

        // (A key worked out when it's first wanted, once; one that can't be: nothing kept or read)
        let worked = 0;
        const late = plansIn(folder, () => {
            worked++;

            return key;
        });

        assert.equal(worked, 0);
        assert.deepStrictEqual(late.get(SEED).plan, fresh);
        assert.deepStrictEqual(late.get(SEED).plan, fresh);
        assert.equal(worked, 1);

        const unknown = plansIn(folder, () => {
            throw new Error("its imports can't be followed");
        });

        assert.equal(unknown.get(SEED), null);
        unknown.put(SEED + 2, { plan: { seed: SEED + 2 }, land: {} });
        assert.deepEqual(readdirSync(folder), [path.basename(fileOf(SEED))]);
    });

    it("misses, and never throws, on what isn't the plan asked for: a file cut short, another seed's under its name, nothing written where it can't be", () => {
        const other = scratch();
        const elsewhere = plansIn(other, key);
        const whole = readFileSync(fileOf(SEED));

        // (Cut short, as a full disk would leave it; and not a plan at all)
        write(other, { [path.basename(fileOf(SEED))]: whole.subarray(0, whole.length / 2), [`plan-${SEED + 1}-${key}.v8`]: "not a plan" });
        assert.equal(elsewhere.get(SEED), null);
        assert.equal(elsewhere.get(SEED + 1), null);

        // (Another seed's plan, whole, under this one's name)
        copyFileSync(fileOf(SEED), path.join(other, `plan-${SEED + 2}-${key}.v8`));
        assert.equal(elsewhere.get(SEED + 2), null);

        // (A folder that can't be made: its way lies through a file)
        const nowhere = plansIn(path.join(fileOf(SEED), "plans"), key);

        nowhere.put(SEED, { plan: fresh, land: watersOf(fresh).plan });
        assert.equal(nowhere.get(SEED), null);
        assert.deepStrictEqual(store.get(SEED).plan, fresh, "the one kept is as it was");
    });

    it("lets go of plans kept for other code, and files never finished, once they're old: none of this code's, none new", () => {
        const other = scratch();
        const elsewhere = plansIn(other, key);
        const old = new Date(Date.now() - 2 * 3600 * 1000);

        write(other, { "plan-1-000000000000000000000000.v8": "old", "plan-2-000000000000000000000000.v8": "new", [`plan-1-${key}.v8.123-0-abcd.tmp`]: "old", [`plan-3-${key}.v8`]: "old" });

        for (const name of ["plan-1-000000000000000000000000.v8", `plan-1-${key}.v8.123-0-abcd.tmp`, `plan-3-${key}.v8`]) {
            utimesSync(path.join(other, name), old, old);
        }

        elsewhere.put(4, { plan: { seed: 4 }, land: {} });
        assert.deepEqual(readdirSync(other).sort(), ["plan-2-000000000000000000000000.v8", `plan-3-${key}.v8`, `plan-4-${key}.v8`].sort());
        assert.deepStrictEqual(elsewhere.get(4), { plan: { seed: 4 }, land: {} });
    });

    it("is kept and read by many at once, none ever reading half a plan", async () => {
        const shared = scratch();
        // (Each thread keeps a plan of its own making under the one seed, over and over, reading between: whatever it reads is one of theirs, whole)
        const rounds = await Promise.all(
            [1, 2, 3, 4].map((thread) =>
                inThread(
                    `
                    const { plansIn } = await import(workerData.cache);
                    const store = plansIn(workerData.folder, workerData.key);
                    const whole = ({ plan }) => plan.seed === 9 && plan.cells.length === 200000 && plan.cells.every((cell) => cell === plan.by);
                    let [read, torn] = [0, 0];

                    for (let round = 0; round < 25; round++) {
                        store.put(9, { plan: { seed: 9, by: workerData.thread, cells: new Float64Array(200000).fill(workerData.thread) }, land: {} });

                        const laid = store.get(9);

                        read += laid ? 1 : 0;
                        torn += laid && !whole(laid) ? 1 : 0;
                    }

                    parentPort.postMessage({ read, torn });
                    `,
                    { cache: pathToFileURL(CACHE).href, folder: shared, key, thread },
                ),
            ),
        );

        assert.deepEqual(rounds, [1, 2, 3, 4].map(() => ({ read: 25, torn: 0 })));
        assert.deepEqual(readdirSync(shared), [`plan-9-${key}.v8`], "one plan left, and nothing half-written");
    });
});
