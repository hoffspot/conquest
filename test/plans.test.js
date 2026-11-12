// A world's plan got ready off the page's thread and kept between visits (client/js/app/plans.js,
// plan-worker.js; core/worldplan/plan.js adoptPlan, landOf): what's handed over is the plan the
// page would lay out, byte for byte, and makes the same world; it's kept by the code's version and
// the seed, never another release's given; and the page lays it out itself where there's no
// worker or nowhere to keep it
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { answer } from "../client/js/app/plan-worker.js";
import { planKey, Plans, PLANS, planStore, stamped } from "../client/js/app/plans.js";
import { COMMIT } from "../client/js/app/version.js";
import { heightAt } from "../client/js/core/terrain/height.js";
import { watersOf } from "../client/js/core/terrain/waters.js";
import { adoptPlan, CELLS, landOf, layOutWorld, planWorld, WORLD_SIZE } from "../client/js/core/worldplan/plan.js";

const VERSION = "9c6a608eb2fcfae241790ecde86eab7d2d41d17a";
const NEXT = "1b3723da53007b056bc8b51c506cce84823510f4";

// A stand-in for a plan: its seed, and land the size the game lays out (what tells a plan from
// anything else kept or handed over), with a little of what else one holds
const planOf = (seed) => ({ seed, cells: CELLS, height: Float32Array.from({ length: CELLS * CELLS }, (_, k) => (k % 7) + seed), water: new Uint8Array(CELLS * CELLS), places: [{ id: `town-${seed}`, at: [seed, 2] }] });

// The same with the land its waters are worked out from, as they're handed over and kept: one
// piece, the land's arrays the plan's own
const madeOf = (seed) => {
    const plan = planOf(seed);

    return { plan, land: { height: plan.height, water: plan.water, seed } };
};

// A worker, as the page sees it: `answers(seed)` is what it posts back to { seed } (nothing, for
// one that never answers), handed over as a worker's messages are (a structured clone, its typed
// arrays moved); or it fails as `fails` says ("made": none can be made; "error": it can't run)
function workers({ answers = (seed) => [{ seed, ...madeOf(seed) }, []], fails = null } = {}) {
    const made = [];
    const make = () => {
        if (fails === "made") {
            throw new Error("no module workers here");
        }

        const listeners = {};
        const worker = {
            asked: [],
            terminated: false,
            addEventListener: (type, listener) => (listeners[type] = listener),
            terminate: () => (worker.terminated = true),
            postMessage: ({ seed }) => {
                worker.asked.push(seed);
                setImmediate(() => {
                    if (fails === "error") {
                        listeners.error({ message: "Failed to load the module", preventDefault() {} });

                        return;
                    }

                    const answered = answers(seed);

                    if (answered) {
                        listeners.message({ data: structuredClone(answered[0], { transfer: answered[1] }) });
                    }
                });
            },
        };

        made.push(worker);

        return worker;
    };

    return { make, made };
}

// Where plans are kept between visits, as planStore is: what's kept is a copy (IndexedDB's own
// structured clone), and every get and put noted
function keeping() {
    const kept = new Map();
    const calls = [];

    return {
        kept,
        calls,
        store: {
            get: async (key) => {
                calls.push(["get", key]);

                return kept.has(key) ? structuredClone(kept.get(key)) : null;
            },
            put: async (key, made, version) => {
                calls.push(["put", key, version]);
                kept.set(key, structuredClone(made));
            },
        },
    };
}

// The page's own side of it: plans laid out here noted, and those taken as its own, each with the
// land it came with
function page() {
    const laid = [];
    const adopted = [];

    return { laid, adopted, layOut: (seed) => (laid.push(seed), planOf(seed)), adopt: (plan, land) => (adopted.push([plan, land]), Object.freeze(plan)) };
}

const now = (work) => work();

// Whether two typed arrays hold the same bytes; and a plan as JSON without its typed arrays (its
// names and their order, with what's under each)
const same = (a, b) => a.constructor === b.constructor && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
const rest = (key, value) => (ArrayBuffer.isView(value) ? `${value.constructor.name} ${value.length}` : value);

describe("a world's plan laid out off the page's thread (plan-worker.js, plan.js adoptPlan)", () => {
    // (Seed 7: one of those whose rivers come out elsewhere if they're worked out from the plan
    // and not from the land alone, a scene set into the land beside them)
    const seed = 7;

    it("hands over the plan the page would lay out, byte for byte, its typed arrays moved, not copied; and from it the page has the same waters and the same ground", () => {
        const [message, transfer] = answer(seed);
        const arrays = Object.values(message.plan).filter(ArrayBuffer.isView);

        // (All its typed arrays handed over: the land's nine, a cell each; the land its waters are
        // worked out from is some of the same, nothing more)
        assert.equal(arrays.length, 9);
        assert.deepEqual(new Set(transfer), new Set(arrays.map(({ buffer }) => buffer)));
        assert.ok(arrays.every(({ length }) => length === CELLS * CELLS));
        assert.equal(message.land, landOf(message.plan));
        assert.ok(Object.values(message.land).filter(ArrayBuffer.isView).every((array) => arrays.includes(array)));

        // (As a worker's message crosses to the page)
        const { plan, land } = structuredClone(message, { transfer });
        const here = layOutWorld(seed);

        assert.ok(arrays.every(({ byteLength }) => byteLength === 0), "moved: the worker's own are empty");
        assert.equal(message.seed, seed);
        assert.ok(land.height === plan.height && land.water === plan.water && land.level === plan.level, "the land still the plan's own arrays");
        assert.ok(isDeepStrictEqual(land, landOf(here)));

        // (Its land, a byte at a time: nine tenths of it)
        for (const [name, array] of Object.entries(here).filter(([, value]) => ArrayBuffer.isView(value))) {
            assert.equal(plan[name].constructor, array.constructor, name);
            assert.ok(same(plan[name], array), `${name}: the same bytes`);
        }

        // (And the rest: every value the same one, of the same kind, under the same name, in the
        // same order. Said as true or false: all of a plan that differs is megabytes to print)
        assert.ok(isDeepStrictEqual(plan, here), "the plan handed over is the plan laid out here");
        assert.ok(JSON.stringify(plan, rest) === JSON.stringify(here, rest), "in the same order");
        assert.ok(plan.places.length > 10 && plan.roads.length > 10 && plan.camps.length > 10, "a whole plan");

        // (Not taken without the land its waters are worked out from, nor with one that isn't its
        // own: worked out from the plan itself, this seed's rivers come out elsewhere)
        assert.throws(() => adoptPlan(plan), /with the land its waters are worked out from/);
        assert.throws(() => adoptPlan(plan, structuredClone(land)), /the plan's own/);

        // (Taken as the page's own: frozen as one laid out here is, and planWorld's from then on)
        const own = adoptPlan(plan, land);

        assert.equal(own, plan);
        assert.equal(planWorld(seed), plan, "not laid out again");
        assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.places) && Object.isFrozen(plan.places[0].at) && Object.isFrozen(plan.roads[0].cells));
        assert.ok(isDeepStrictEqual(planWorld(seed), here));

        // (Its waters, left behind in the worker with what else was worked out as it was laid
        // out: worked out again on the page from the same land, the same as those worked out with
        // it. Their surfaces, what runs where, and every river's course worked out by then)
        const [waters, settled] = [watersOf(plan), watersOf(here)];

        assert.equal(landOf(plan), land);
        assert.ok(same(waters.surfaces, settled.surfaces), "its waters' surfaces");
        assert.ok(same(waters.running, settled.running), "and what runs where");
        assert.ok(settled.courses.size > 500);
        assert.ok([...settled.courses.keys()].every((k) => isDeepStrictEqual(waters.course(k), settled.courses.get(k))), "every river's course");

        // (And so the ground: its height every quarter of a kilometre, rivers' beds and all that
        // stands in the land with it)
        let differ = 0;

        for (let y = 128; y < WORLD_SIZE; y += 256) {
            for (let x = 128; x < WORLD_SIZE; x += 256) {
                differ += Number(!Object.is(heightAt(plan, x, y), heightAt(here, x, y)));
            }
        }

        assert.equal(differ, 0, "the same ground");
    });

    it("keeps the plan that's there already for a seed, handed another: one plan for a seed, whoever asks", () => {
        const here = planWorld(seed);

        assert.equal(adoptPlan({ seed, places: [{ id: "another" }] }, null), here);
        assert.equal(planWorld(seed), here);
    });
});

describe("the plans the page asks for (plans.js Plans)", () => {
    it("has a worker lay each out, once for a seed, takes it as the page's own, and lets the worker go", async () => {
        const { make, made } = workers();
        const { laid, adopted, layOut, adopt } = page();
        const plans = new Plans({ version: VERSION, worker: make, store: null, layOut, adopt, later: now });
        const [one, again, other] = await Promise.all([plans.of(12), plans.of(12), plans.of(13)]);

        assert.equal(one, again);
        assert.deepEqual(one, planOf(12));
        assert.deepEqual(other, planOf(13));
        assert.deepEqual(made.map(({ asked }) => asked), [[12], [13]]);
        assert.ok(made.every(({ terminated }) => terminated));

        // (Each taken with the land its waters are worked out from, the plan's own arrays still)
        assert.deepEqual(adopted.map(([plan]) => plan), [one, other]);
        assert.ok(adopted.every(([plan, land]) => land.seed === plan.seed && land.height === plan.height && land.water === plan.water));
        assert.deepEqual(laid, [], "none laid out on the page");
        assert.deepEqual([plans.how.get(12), plans.how.get(13)], ["worker", "worker"]);
        assert.equal(await plans.of(12), one);
        assert.equal(made.length, 2);
    });

    it("keeps each between visits by the code's version and the seed, and reads it back the next visit with no worker", async () => {
        const { store, kept, calls } = keeping();
        const first = workers();
        const plans = new Plans({ version: VERSION, worker: first.make, store, ...page(), later: now });
        const plan = await plans.of(12);

        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(calls, [["get", planKey(VERSION, 12)], ["put", planKey(VERSION, 12), VERSION]]);

        // (The plan and its land, as one: the land's arrays the plan's own in what's kept too)
        assert.deepStrictEqual(kept.get(`${VERSION}/12`), madeOf(12));
        assert.equal(kept.get(`${VERSION}/12`).land.height, kept.get(`${VERSION}/12`).plan.height);

        // (The next visit: the page loaded again, the same release)
        const second = workers();
        const next = page();
        const visit = new Plans({ version: VERSION, worker: second.make, store, ...next, later: now });
        const read = await visit.of(12);

        assert.deepStrictEqual(read, plan);
        assert.equal(visit.how.get(12), "kept");
        assert.deepEqual(second.made, [], "no worker");
        assert.deepEqual(next.laid, []);
        assert.deepEqual(next.adopted.map(([each]) => each), [read], "taken as the page's own, as one laid out is");
        assert.ok(next.adopted[0][1].height === read.height && next.adopted[0][1].water === read.water, "with its land, its own arrays still");
        assert.deepEqual(calls.slice(2), [["get", planKey(VERSION, 12)]], "nor kept again");

        // (Another world there: laid out, and kept beside it)
        await visit.of(13);
        assert.deepEqual(second.made.map(({ asked }) => asked), [[13]]);
        assert.deepEqual([...kept.keys()], [`${VERSION}/12`, `${VERSION}/13`]);
    });

    it("never gives a new release an older one's plan: another version, another key", async () => {
        const { store, kept } = keeping();

        assert.notEqual(planKey(VERSION, 12), planKey(NEXT, 12));
        assert.notEqual(planKey(VERSION, 12), planKey(VERSION, 13));
        assert.equal(planKey(VERSION, 12), `${VERSION}/12`);

        // (Kept by the release before, and wrong for this one)
        const old = madeOf(12);

        old.plan.places = [{ id: "as the old code laid it out" }];
        kept.set(planKey(VERSION, 12), old);

        const { make, made } = workers();
        const plans = new Plans({ version: NEXT, worker: make, store, ...page(), later: now });
        const plan = await plans.of(12);

        assert.deepEqual(plan, planOf(12));
        assert.equal(plans.how.get(12), "worker");
        assert.equal(made.length, 1);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepStrictEqual(kept.get(planKey(NEXT, 12)), madeOf(12));
    });

    it("keeps none for a copy run from the repository, whose version is all noughts whatever its code", async () => {
        assert.equal(COMMIT, "0".repeat(40), "as the repository keeps it");
        assert.equal(stamped(COMMIT), false);
        assert.equal(stamped(VERSION), true);
        assert.equal(stamped("main"), false);

        const { store, calls } = keeping();
        const { make, made } = workers();
        const plans = new Plans({ worker: make, store, ...page(), later: now });

        assert.equal(plans.version, COMMIT);
        assert.deepEqual(await plans.of(12), planOf(12));
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(calls, [], "neither read nor kept");
        assert.equal(made.length, 1, "laid out in a worker all the same");
    });

    it("lays it out on the page, as before, where no worker can be made, it can't run, it answers with no plan or one without its land, or never answers", async () => {
        for (const [why, options, wait] of [
            ["none can be made", { fails: "made" }, 1000],
            ["it can't run", { fails: "error" }, 1000],
            ["it can't lay it out", { answers: (seed) => [{ seed, error: "no" }, []] }, 1000],
            ["another seed's", { answers: (seed) => [{ seed, ...madeOf(seed + 1) }, []] }, 1000],
            ["not a plan", { answers: (seed) => [{ seed, plan: { seed, cells: CELLS, height: new Float32Array(3) }, land: {} }, []] }, 1000],
            ["no land with it", { answers: (seed) => [{ seed, plan: planOf(seed) }, []] }, 1000],
            ["a land that isn't the plan's own", { answers: (seed) => [{ seed, plan: planOf(seed), land: madeOf(seed).land }, []] }, 1000],
            ["it never answers", { answers: () => null }, 30],
        ]) {
            const { make, made } = workers(options);
            const { store, calls } = keeping();
            const { laid, adopted, layOut, adopt } = page();
            const plans = new Plans({ version: VERSION, worker: make, store, layOut, adopt, later: now, wait });

            assert.deepEqual(await plans.of(12), planOf(12), why);
            assert.deepEqual(laid, [12], why);
            assert.deepEqual(adopted, [], `${why}: its own already`);
            assert.equal(plans.how.get(12), "page", why);
            assert.ok(made.every(({ terminated }) => terminated), `${why}: the worker let go`);
            await new Promise((resolve) => setImmediate(resolve));
            assert.deepEqual(calls, [["get", planKey(VERSION, 12)]], `${why}: not kept (the next visit tries a worker again)`);
        }
    });

    it("carries on where plans can't be kept: nowhere to keep them, nothing read, nothing written, or what's kept isn't this seed's plan", async () => {
        const failing = { get: () => Promise.reject(new Error("no")), put: () => Promise.reject(new Error("full")) };
        const muddled = { get: async () => madeOf(99), put: async () => {} };
        const broken = { get: async () => ({ plan: { seed: 12 }, land: {} }), put: async () => {} };
        const landless = { get: async () => ({ plan: planOf(12) }), put: async () => {} };
        const apart = { get: async () => ({ plan: planOf(12), land: madeOf(12).land }), put: async () => {} };

        for (const store of [null, failing, muddled, broken, landless, apart]) {
            const { make, made } = workers();
            const plans = new Plans({ version: VERSION, worker: make, store, ...page(), later: now });

            assert.deepEqual(await plans.of(12), planOf(12));
            assert.equal(plans.how.get(12), "worker");
            assert.equal(made.length, 1);
            await new Promise((resolve) => setImmediate(resolve));
        }
    });

    it("tries again for a plan that couldn't be had at all", async () => {
        let fails = true;
        const plans = new Plans({
            version: VERSION,
            worker: workers({ fails: "made" }).make,
            store: null,
            layOut: (seed) => {
                if (fails) {
                    throw new Error("no such world");
                }

                return planOf(seed);
            },
            adopt: (plan) => plan,
            later: now,
        });

        await assert.rejects(plans.of(12), /no such world/);
        fails = false;
        assert.deepEqual(await plans.of(12), planOf(12));
    });
});

describe("where plans are kept between visits (plans.js planStore)", () => {
    // IndexedDB, as much of it as the store uses: one database of object stores, each request's
    // answer told a moment later, what's put kept as a copy (a structured clone, as it keeps it)
    function fakeIndexedDB({ fails = false } = {}) {
        const stores = new Map();
        const opened = [];
        const request = (work) => {
            const made = {};

            setImmediate(() => {
                try {
                    made.result = work();
                    made.onsuccess?.();
                } catch (error) {
                    made.error = error;
                    made.onerror?.();
                }
            });

            return made;
        };

        return {
            stores,
            opened,
            open: (name, version) => {
                opened.push([name, version]);

                const made = {};

                setImmediate(() => {
                    if (fails) {
                        made.error = new Error("A mutation operation was attempted on a database that did not allow mutations.");
                        made.onerror?.();

                        return;
                    }

                    const fresh = !stores.size;

                    made.result = {
                        createObjectStore: (store) => stores.set(store, new Map()),
                        transaction: ([store]) => {
                            const entries = stores.get(store);
                            const transaction = {
                                objectStore: () => ({
                                    get: (key) => request(() => (entries.has(key) ? structuredClone(entries.get(key)) : undefined)),
                                    put: (value, key) => request(() => void entries.set(key, structuredClone(value))),
                                    delete: (key) => request(() => void entries.delete(key)),
                                    getAllKeys: () => request(() => [...entries.keys()].sort()),
                                }),
                            };

                            // (Done once its requests have been answered)
                            setImmediate(() => setImmediate(() => transaction.oncomplete?.()));

                            return transaction;
                        },
                    };

                    if (fresh) {
                        made.onupgradeneeded?.();
                    }

                    made.onsuccess?.();
                });

                return made;
            },
        };
    }

    it("is nowhere, where the browser has no IndexedDB", () => {
        assert.equal(planStore(undefined), null);
        assert.equal(planStore(null), null);
    });

    it("keeps a plan exactly as it is, typed arrays and all, and gives it back by its key; nothing for one not kept", async () => {
        const indexedDB = fakeIndexedDB();
        const store = planStore(indexedDB, () => 1000);
        const plan = { ...planOf(12), water: Uint8Array.of(0, 1, 2, 255), level: Float32Array.of(-0, 0.1, NaN, 1e-30), nothing: undefined, places: [{ id: "town", at: [1.5, -2], guild: false, master: null }] };
        const made = { plan, land: { height: plan.height, water: plan.water, level: plan.level, seed: 12 } };

        assert.equal(await store.get(planKey(VERSION, 12)), null);
        await store.put(planKey(VERSION, 12), made, VERSION);

        const kept = await store.get(planKey(VERSION, 12));

        assert.ok(isDeepStrictEqual(kept, made), "the same plan: NaN, -0 and what's undefined among it");
        assert.notEqual(kept.plan, plan);
        assert.ok(same(kept.plan.height, plan.height) && same(kept.plan.water, plan.water) && same(kept.plan.level, plan.level), "byte for byte");
        assert.equal(JSON.stringify(kept, rest), JSON.stringify(made, rest));
        // (Kept as one: read back, its land's arrays are the plan's own still)
        assert.ok(kept.land.height === kept.plan.height && kept.land.water === kept.plan.water && kept.land.level === kept.plan.level);
        assert.equal(await store.get(planKey(VERSION, 13)), null);
        assert.equal(await store.get(planKey(NEXT, 12)), null, "another release's key");
        assert.deepEqual(indexedDB.opened, [["pellagos-plans", 1]], "opened once");
    });

    it("lets go of every other version's plans as one of this version's is kept", async () => {
        const indexedDB = fakeIndexedDB();
        const old = planStore(indexedDB, () => 1000);

        await old.put(planKey(VERSION, 12), madeOf(12), VERSION);
        await old.put(planKey(VERSION, 13), madeOf(13), VERSION);

        const store = planStore(indexedDB, () => 2000);

        await store.put(planKey(NEXT, 12), madeOf(12), NEXT);
        assert.deepEqual([...indexedDB.stores.get("plans").keys()].sort(), [`plan/${NEXT}/12`, `used/${NEXT}/12`]);
        assert.equal(await store.get(planKey(VERSION, 12)), null);
    });

    it(`keeps the ${PLANS.kept} plans used most lately, and lets go of the rest`, async () => {
        const indexedDB = fakeIndexedDB();
        let time = 0;
        const store = planStore(indexedDB, () => ++time);

        for (let seed = 1; seed <= PLANS.kept; seed++) {
            await store.put(planKey(VERSION, seed), madeOf(seed), VERSION);
        }

        // (The first read again: used since the rest were kept)
        assert.deepEqual(await store.get(planKey(VERSION, 1)), madeOf(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        await store.put(planKey(VERSION, 100), madeOf(100), VERSION);

        const plans = [...indexedDB.stores.get("plans").keys()].filter((key) => key.startsWith("plan/")).map((key) => Number(key.split("/")[2])).sort((a, b) => a - b);

        assert.deepEqual(plans, [1, ...Array.from({ length: PLANS.kept - 2 }, (_, k) => k + 3), 100], "the second, used longest ago, let go of");
        assert.equal(indexedDB.stores.get("plans").size, PLANS.kept * 2, "and when it was used with it");
    });

    it("fails, for the page to carry on without it, where the database can't be opened; and tries again the next time", async () => {
        const indexedDB = fakeIndexedDB({ fails: true });
        const store = planStore(indexedDB);

        await assert.rejects(store.get(planKey(VERSION, 12)));
        await assert.rejects(store.put(planKey(VERSION, 12), madeOf(12), VERSION));
        assert.equal(indexedDB.opened.length, 2);
    });
});

describe("the game made once its world's plan is ready (session.js, main.js)", () => {
    const read = (path) => readFile(new URL(`../client/js/${path}`, import.meta.url), "utf8");

    it("waits for the plan, for a new game and a joined one, and hands it to buildWorld; main.js waits for the game", async () => {
        const session = await read("app/session.js");
        const main = await read("main.js");

        assert.match(session, /export async function createGame\(/);
        assert.match(session, /export async function createJoinedGame\(/);
        assert.equal(session.match(/buildWorld\(\{ seed, race[^}]*plan: await plans\.of\(seed\) \}\)/g)?.length, 2);
        assert.match(main, /const game = await createGame\(\{/);
        assert.match(main, /const game = await createJoinedGame\(\{/);
    });

    it("starts its worker by an address beside it, so the game downloads and keeps the worker's module with the rest", async () => {
        const { MANIFEST } = await import("../client/js/app/manifest.js");
        const code = MANIFEST.find(({ id }) => id === "code").files.map(([file]) => file);

        assert.match(await read("app/plans.js"), /new Worker\(new URL\("\.\/plan-worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
        assert.ok(code.includes("js/app/plan-worker.js"));
        assert.ok(code.includes("js/app/plans.js"));
    });
});
