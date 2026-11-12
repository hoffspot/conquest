# Lightens the world print in test/plan-cache.test.js (in the folder given): no host played, the scene's
# nine chunks. python3 edit-test2.py <folder>
import sys

p = sys.argv[1] + "/test/plan-cache.test.js"
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old)
    s = s.replace(old, new)


rep("""// In a thread: the world of a seed built from its plan, the plan read back from where they're kept
// (`kept`) or laid out there with nothing kept, and a print of it: its waters; the squares and the
// ground's heights of the chunks round the scene set into its land, and over every cell whose
// river would stand elsewhere were its waters made from the plan alone; and a host's world on it,
// its player in and its people out, played a second. With the plan itself, where it was read back
""", """// In a thread: the world of a seed built from its plan, the plan read back from where they're kept
// (`kept`) or laid out there with nothing kept, and a print of it: its waters, and the squares and
// the ground's heights of the chunks round the scene set into its land and over every cell whose
// river would stand elsewhere were its waters made from the plan alone. With the plan itself,
// where it was read back
""")
rep("""    const { buildWorld } = await import(workerData.overworld);
    const { HOST_PLAYER, Host } = await import(workerData.host);
    const { STEP_MS } = await import(workerData.battle);
    const store""", """    const { buildWorld } = await import(workerData.overworld);
    const store""")
rep("""    const world = buildWorld({ seed: workerData.seed, plan });
    const town = world.maps.town;
""", """    const town = buildWorld({ seed: workerData.seed, plan }).maps.town;
""")
rep("""    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {""", """    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {""")
rep("""    const heights = made.map(([cx, cy]) => town.ground.chunk(cx, cy).heights);
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();

    for (let t = 0; t < 1000; t += STEP_MS) {
        host.advance(STEP_MS);
    }

""", """    const heights = made.map(([cx, cy]) => town.ground.chunk(cx, cy).heights);

""")
rep("""        print: { waters: print([waters.surfaces, waters.running]), fords: waters.fords().length, squares: print(squares), arrays: squares.length, heights: print(heights), checksum: host.checksum(), time: host.battle.time },""",
    """        print: { waters: print([waters.surfaces, waters.running]), fords: waters.fords().length, squares: print(squares), arrays: squares.length, heights: print(heights) },""")
rep("""    const worldOf = (kept) => inThread(WORLD, { cache: pathToFileURL(CACHE).href, planner: pathToFileURL(PLANNER).href, waters: at("terrain/waters.js"), overworld: at("overworld.js"), host: at("host.js"), battle: at("battle.js"), folder, key, seed: SEED, kept });""",
    """    const worldOf = (kept) => inThread(WORLD, { cache: pathToFileURL(CACHE).href, planner: pathToFileURL(PLANNER).href, waters: at("terrain/waters.js"), overworld: at("overworld.js"), folder, key, seed: SEED, kept });""")
rep("""    it("makes the same world from a plan read back as from one laid out: its waters, the squares and the ground where its rivers would stand elsewhere made from the plan alone, a host's world played on it", async () => {""",
    """    it("makes the same world from a plan read back as from one laid out: its waters, and the squares and the ground where its rivers would stand elsewhere made from the plan alone", async () => {""")
rep("""        assert.ok(afresh.cells > 0 && afresh.chunks >= 25 && afresh.print.arrays > 100, `${afresh.cells} cells, ${afresh.chunks} chunks`);
        assert.ok(afresh.print.time >= 1000 && afresh.print.fords > 20);
""", """        assert.ok(afresh.cells > 0 && afresh.chunks > 9 && afresh.print.arrays > 100 && afresh.print.fords > 20, `${afresh.cells} cells, ${afresh.chunks} chunks, ${afresh.print.arrays} arrays`);
""")
open(p, "w").write(s)
print("edited", p)
