// What a browser test's drawing costs in software, as the tests run it (1000 x 600 at half scale,
// --enable-unsafe-swiftshader), once the town's people are built: a frame not drawn, and a drawn
// frame (finished on the graphics side) by view, shadows and quality.
const { chromium, devices } = require("playwright");
const port = process.argv[2] ?? "4917";
(async () => {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader"] });
    const context = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
    const page = await context.newPage();
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/?play&seed=1`);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 300000, polling: 100 });
    const toPlaying = Date.now() - t0;
    const result = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const view = session.view;
        const gl = view.renderer.getContext();
        const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
        game.stop();
        // (Everyone built first: played on without drawing, the workers' answers let in)
        for (let k = 0; k < 500; k++) { game.advance(0.1, { render: false, wait: true }); await new Promise((r) => setTimeout(r, 0)); }
        const drawn = (n = 20) => { const each = []; for (let k = 0; k < n; k++) { const s = performance.now(); game.advance(1 / 30); gl.finish(); each.push(performance.now() - s); } return +median(each).toFixed(1); };
        const undrawn = (n = 20) => { const each = []; for (let k = 0; k < n; k++) { const s = performance.now(); game.advance(1 / 30, { render: false }); each.push(performance.now() - s); } return +median(each).toFixed(2); };
        const start = { pitch: game.cameraFollow.pitch, distance: view.distance };
        const look = (down) => { game.cameraFollow.pitch = down ? 35 : start.pitch; view.distance = down ? 10.5 : start.distance; view.zoomTo = null; game.advance(1 / 30); drawn(4); };
        const out = { quality: view.qualityName, size: [view.renderer.domElement.width, view.renderer.domElement.height], startPitch: start.pitch };
        out.notDrawn = undrawn();
        look(false); out["High, start view"] = drawn();
        look(true); out["High, looking down"] = drawn();
        view.setShadows(false); look(false); out["High, start view, no shadows"] = drawn();
        look(true); out["High, looking down, no shadows"] = drawn();
        view.setShadows(true); view.setQuality("low"); look(false); out["Low, start view"] = drawn();
        look(true); out["Low, looking down"] = drawn();
        view.setShadows(false); look(false); out["Low, start view, no shadows"] = drawn();
        look(true); out["Low, looking down, no shadows"] = drawn();
        out.info = { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
        return out;
    });
    console.log(JSON.stringify({ toPlayingMs: toPlaying, ...result }, null, 1));
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
