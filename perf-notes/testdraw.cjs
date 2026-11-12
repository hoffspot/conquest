// What a browser test's drawing costs in software, as the tests run it (1000 x 600 at half scale,
// --enable-unsafe-swiftshader): time to playing, and a drawn frame (finished on the graphics side)
// for the start view at High, then looking down, without shadows, and at Low.
//   node testdraw.cjs [port]
const { chromium, devices } = require("playwright");
const port = process.argv[2] ?? "4917";
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
(async () => {
    const out = {};
    for (const [label, settings] of [["high", null], ["low", { quality: "low", shadows: false }]]) {
        const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader"] });
        const context = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
        const page = await context.newPage();
        if (settings) await page.addInitScript((s) => localStorage.setItem("pellagos.settings", JSON.stringify(s)), settings);
        const t0 = Date.now();
        await page.goto(`http://localhost:${port}/?play&seed=1`);
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 300000, polling: 100 });
        const toPlaying = Date.now() - t0;
        const frames = await page.evaluate(async () => {
            const { game, session } = window.pellagos;
            const gl = session.view.renderer.getContext();
            game.stop();
            const time = (n = 24) => {
                const each = [];
                for (let k = 0; k < n; k++) {
                    const start = performance.now();
                    game.advance(1 / 30);
                    gl.finish();
                    each.push(performance.now() - start);
                }
                return each;
            };
            const undrawn = (n = 24) => {
                const each = [];
                for (let k = 0; k < n; k++) { const start = performance.now(); game.advance(1 / 30, { render: false }); each.push(performance.now() - start); }
                return each;
            };
            const result = { quality: session.view.qualityName, shadows: session.view.sun?.castShadow ?? null, size: [session.view.renderer.domElement.width, session.view.renderer.domElement.height] };
            time(6);
            result.startView = time();
            result.notDrawn = undrawn();
            game.cameraFollow.pitch = 35; session.view.distance = 10.5; session.view.zoomTo = null; game.advance(1 / 30);
            time(4);
            result.lookingDown = time();
            return result;
        });
        out[label] = { toPlayingMs: toPlaying, quality: frames.quality, shadows: frames.shadows, size: frames.size, startViewMs: +median(frames.startView).toFixed(1), lookingDownMs: +median(frames.lookingDown).toFixed(1), notDrawnMs: +median(frames.notDrawn).toFixed(2) };
        await browser.close();
    }
    console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
