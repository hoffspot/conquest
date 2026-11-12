# Brings test/plan-cache.test.js (in the folder given) up to landOf and adoptPlan, with the same world
# from a plan read back for seed 7: python3 edit-test.py <folder>
import sys

p = sys.argv[1] + "/test/plan-cache.test.js"
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old)
    s = s.replace(old, new)


rep("""// The world's plans kept between the unit tests' processes (test/plan-cache.js, through
// worldplan/plan.js keepPlans): a plan read back is the plan laid out afresh, whole and its own,
// with the same waters; kept by its seed and by the planner's code, every module of it found by
// following the imports, so a change to any of them misses, and by the dungeons' themes as they
// stand; and nothing but a miss ever comes of what can't be read or written, or of many keeping
// and reading at once
""", """// The world's plans kept between the unit tests' processes (test/plan-cache.js, through
// worldplan/plan.js keepPlans, landOf and adoptPlan): a plan read back is the plan laid out
// afresh, whole and its own, with the same waters, and makes the same world; kept by its seed and
// by the planner's code, every module of it found by following the imports, so a change to any of
// them misses, and by the dungeons' themes as they stand; and nothing but a miss ever comes of
// what can't be read or written, or of many keeping and reading at once
""")
rep("""import { keepPlans, planWorld } from "../client/js/core/worldplan/plan.js";
""", """import { adoptPlan, keepPlans, landOf, planWorld } from "../client/js/core/worldplan/plan.js";
""")
rep("""// (A seed whose river runs by Bellhaven's crag: its waters are the land's as it was settled, and
// made from the plan itself, the crag set into its land, they'd stand elsewhere in fifty cells)
const SEED = 6;
""", """// (A seed whose rivers run by Bellhaven's crag: its waters are the land's as it was settled, and
// made from the plan itself, the crag set into its land, they'd stand elsewhere in 32 cells, by
// up to 16 m)
const SEED = 7;
""")

rep("""describe("the planner's code, found by following its imports (plan-cache.js sourcesOf, keyOf)", () => {""", """// In a thread: the world of a seed built from its plan, the plan read back from where they're kept
// (`kept`) or laid out there with nothing kept, and a print of it: its waters; the squares and the
// ground's heights of the chunks round the scene set into its land, and over every cell whose
// river would stand elsewhere were its waters made from the plan alone; and a host's world on it,
// its player in and its people out, played a second. With the plan itself, where it was read back
const WORLD = `
    const { createHash } = require("node:crypto");
    const { plansIn } = await import(workerData.cache);
    const { CELL, CELLS, CHUNK, keepPlans, planWorld } = await import(workerData.planner);
    const { Waters, watersOf } = await import(workerData.waters);
    const { buildWorld } = await import(workerData.overworld);
    const { HOST_PLAYER, Host } = await import(workerData.host);
    const { STEP_MS } = await import(workerData.battle);
    const store = plansIn(workerData.folder, workerData.key);
    const asked = [];

    keepPlans(workerData.kept ? { get: (seed) => { const made = store.get(seed); asked.push(["get", seed, made ? "had" : "none"]); return made; }, put: (seed) => asked.push(["put", seed]) } : null);

    const plan = planWorld(workerData.seed);
    const waters = watersOf(plan);
    const world = buildWorld({ seed: workerData.seed, plan });
    const town = world.maps.town;
    const print = (arrays) => arrays.reduce((hash, array) => hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)), createHash("sha256")).digest("hex").slice(0, 16);

    const alone = new Waters(plan).surfaces;
    const cells = [...waters.surfaces.keys()].filter((k) => waters.surfaces[k] !== alone[k]);
    const scene = plan.sites.find((site) => site.scenery);
    const chunks = new Set(cells.map((k) => Math.floor(((k % CELLS) * CELL) / CHUNK) + "," + Math.floor((Math.floor(k / CELLS) * CELL) / CHUNK)));

    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            chunks.add((Math.floor(scene.at[0] / CHUNK) + dx) + "," + (Math.floor(scene.at[1] / CHUNK) + dy));
        }
    }

    const made = [...chunks].sort().map((key) => key.split(",").map(Number));
    const squares = made.flatMap(([cx, cy]) => Object.values(town.chunk(cx, cy)).filter(ArrayBuffer.isView));
    const heights = made.map(([cx, cy]) => town.ground.chunk(cx, cy).heights);
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();

    for (let t = 0; t < 1000; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    parentPort.postMessage({
        asked,
        cells: cells.length,
        chunks: made.length,
        print: { waters: print([waters.surfaces, waters.running]), fords: waters.fords().length, squares: print(squares), arrays: squares.length, heights: print(heights), checksum: host.checksum(), time: host.battle.time },
        ...(workerData.kept ? { plan, frozen: Object.isFrozen(plan) && Object.isFrozen(plan.places[0].at), shared: planWorld(workerData.seed) === plan, surfaces: waters.surfaces, running: waters.running, fords: waters.fords() } : {}),
    });
`;

describe("the planner's code, found by following its imports (plan-cache.js sourcesOf, keyOf)", () => {""")

rep("""    const fileOf = (seed) => path.join(folder, `plan-${seed}-${key}.v8`);
    let fresh;
""", """    const fileOf = (seed) => path.join(folder, `plan-${seed}-${key}.v8`);
    const at = (file) => new URL(`../client/js/core/${file}`, import.meta.url).href;
    // The seed's world in a thread of its own (WORLD), from the plan kept or one laid out there
    const worldOf = (kept) => inThread(WORLD, { cache: pathToFileURL(CACHE).href, planner: pathToFileURL(PLANNER).href, waters: at("terrain/waters.js"), overworld: at("overworld.js"), host: at("host.js"), battle: at("battle.js"), folder, key, seed: SEED, kept });
    let fresh;
    let back;
""")

rep("""        const land = watersOf(fresh).plan;
""", """        const land = landOf(fresh);
""")

start = s.index("""    it("hands another copy of the game's code the plan that was kept""")
end = s.index("""    it("misses when the planner's code is other than the plan was kept by""")
s = s[:start] + """    it("hands another copy of the game's code the plan that was kept, laid out by none: frozen and shared, as one laid out is, its waters the same", async () => {
        back = await worldOf(true);

        assert.deepEqual(back.asked, [["get", SEED, "had"]], "asked for once, and never laid out");
        assert.ok(back.frozen && back.shared);
        assert.deepStrictEqual(back.plan, fresh);

        // (Where its rivers and lakes stand, what runs where, and its fords: worked out there from
        // the land read back, here as the plan was settled)
        const waters = watersOf(fresh);

        assert.deepStrictEqual(back.surfaces, waters.surfaces);
        assert.deepStrictEqual(back.running, waters.running);
        assert.deepStrictEqual(back.fords, waters.fords());
        assert.ok(back.fords.length > 20, `${back.fords.length} fords`);
    });

    it("makes the same world from a plan read back as from one laid out: its waters, the squares and the ground where its rivers would stand elsewhere made from the plan alone, a host's world played on it", async () => {
        const afresh = await worldOf(false);

        assert.deepEqual(afresh.asked, [], "laid out there, nothing kept or asked for");

        // (The seed is one that tells: were the land not kept with the plan, the waters of the
        // plan read back would stand elsewhere in these cells, and the chunks over them with them.
        // If the planner's changed and it no longer is, choose a seed that is)
        assert.ok(afresh.cells > 0 && afresh.chunks >= 25 && afresh.print.arrays > 100, `${afresh.cells} cells, ${afresh.chunks} chunks`);
        assert.ok(afresh.print.time >= 1000 && afresh.print.fords > 20);
        assert.deepStrictEqual(back.print, afresh.print);
        assert.equal(back.cells, afresh.cells);
    });

    it("takes a plan handed on only with the land its waters are worked out from, the plan's own; and gives back the one it has already for a seed", () => {
        const standIn = (seed) => ({ seed, height: new Float32Array(4), water: new Uint8Array(4), places: [] });
        const plan = standIn(990001);

        // (No land; another's; a copy of its own, no longer the plan's arrays: none taken)
        assert.throws(() => adoptPlan(plan, null), TypeError);
        assert.throws(() => adoptPlan(plan, { height: standIn(1).height, water: plan.water, seed: plan.seed }), /the plan's own/);
        assert.throws(() => adoptPlan(plan, structuredClone({ height: plan.height, water: plan.water, seed: plan.seed })), /the plan's own/);

        // (With its land: this process's own for its seed from then on, frozen, its land the one given)
        const land = { height: plan.height, water: plan.water, seed: plan.seed };

        assert.equal(adoptPlan(plan, land), plan);
        assert.equal(planWorld(990001), plan);
        assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.places));
        assert.equal(landOf(plan), land);

        // (One there already is kept: another handed on for its seed isn't taken in its place)
        assert.equal(adoptPlan(standIn(990001), null), plan);
        assert.equal(adoptPlan({ seed: SEED }, null), fresh);
    });

""" + s[end:]

rep("""        nowhere.put(SEED, { plan: fresh, land: watersOf(fresh).plan });""", """        nowhere.put(SEED, { plan: fresh, land: landOf(fresh) });""")

rep("""        copyFileSync(fileOf(SEED), path.join(other, `plan-${SEED + 2}-${key}.v8`));
        assert.equal(elsewhere.get(SEED + 2), null);
""", """        copyFileSync(fileOf(SEED), path.join(other, `plan-${SEED + 2}-${key}.v8`));
        assert.equal(elsewhere.get(SEED + 2), null);

        // (A plan kept with land that isn't its own arrays: not one adoptPlan would take)
        elsewhere.put(SEED + 3, { plan: { seed: SEED + 3, height: new Float32Array(4), water: new Uint8Array(4) }, land: { height: new Float32Array(4), water: new Uint8Array(4) } });
        assert.equal(elsewhere.get(SEED + 3), null);
""")
open(p, "w").write(s)
print("edited", p)
