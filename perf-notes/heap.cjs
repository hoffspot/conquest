// Take a heap snapshot of the game playing (an emulated iPhone, or a desktop), after a scenario's
// set up, and write it to out/<tag>.heapsnapshot; heapsum.cjs reads it.
//   node heap.cjs <scenario: town|city> <device: phone|desktop> [seed] [port]
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const [scenario = "town", device = "phone", seed = "2", port = "4917"] = process.argv.slice(2);
const out = path.join(__dirname, "out");
fs.mkdirSync(out, { recursive: true });
const tag = `${scenario}-${device}`;

(async () => {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-precise-memory-info"] });
    const context = await browser.newContext(device === "phone" ? { ...devices["iPhone 15 Pro"] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    await page.goto(`http://localhost:${port}/?play&seed=${seed}`);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 300000, polling: 250 });
    await page.evaluate(async (scenario) => {
        const { game } = window.pellagos;
        game.stop();
        if (scenario === "city") {
            const places = game.world.plan.places;
            const city = places.find((p) => p.race === "human" && p.kind === "city") ?? places.find((p) => p.kind === "city") ?? places.find((p) => p.kind === "capital");
            game.host.battle.place(game.me, "town", [Math.floor(city.at[0]) + 3, Math.floor(city.at[1]) + 3]);
        }
        // (Played on a while, a frame at a time, drawn now and then: what's built a step at a time built)
        for (let k = 0; k < (scenario === "city" ? 900 : 300); k++) {
            game.advance(0.1, { render: k % 10 === 9, wait: true });
            await new Promise((r) => setTimeout(r, 0));
        }
    }, scenario);
    const cdp = await context.newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(1000);
    await cdp.send("HeapProfiler.collectGarbage");
    const state = await page.evaluate(() => {
        const { game } = window.pellagos;
        return { mem: game.memoryNow(), used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, avatars: game.avatars.size, actors: game.battle.actors.length, quality: game.view.qualityName };
    });
    console.log(JSON.stringify(state, null, 1));
    fs.writeFileSync(path.join(out, `${tag}.heapstate.json`), JSON.stringify(state, null, 1));
    const file = fs.createWriteStream(path.join(out, `${tag}.heapsnapshot`));
    cdp.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => file.write(chunk));
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
    await new Promise((r) => file.end(r));
    console.log("snapshot", fs.statSync(path.join(out, `${tag}.heapsnapshot`)).size);
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
