// How many frames a second a browser test's game draws in software, as the tests run it
// (1000 x 600 at half scale, --enable-unsafe-swiftshader), the game running itself, once the
// town's people are built: by view, shadows and quality.
const { chromium, devices } = require("playwright");
const port = process.argv[2] ?? "4917";
(async () => {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader"] });
    const context = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/?play&seed=1`);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 300000, polling: 100 });
    await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        game.stop();
        for (let k = 0; k < 500; k++) { game.advance(0.1, { render: false, wait: true }); await new Promise((r) => setTimeout(r, 0)); }
        const view = session.view;
        const render = view.render.bind(view);
        window.__drawn = 0;
        view.render = (...args) => { window.__drawn++; return render(...args); };
        window.__start = { pitch: game.cameraFollow.pitch, distance: view.distance };
        game.start();
    });
    const out = {};
    const variants = [
        ["High, start view", { down: false, shadows: true, quality: "high" }],
        ["High, looking down", { down: true, shadows: true, quality: "high" }],
        ["High, start view, no shadows", { down: false, shadows: false, quality: "high" }],
        ["Low, start view, no shadows", { down: false, shadows: false, quality: "low" }],
        ["Low, looking down, no shadows", { down: true, shadows: false, quality: "low" }],
    ];
    for (const [label, v] of variants) {
        await page.evaluate((v) => {
            const { game, session } = window.pellagos;
            const view = session.view;
            if (view.qualityName !== v.quality) view.setQuality(v.quality);
            view.setShadows(v.shadows);
            game.cameraFollow.pitch = v.down ? 35 : window.__start.pitch;
            view.distance = v.down ? 10.5 : window.__start.distance;
            view.zoomTo = null;
        }, v);
        await page.waitForTimeout(6000);
        const a = await page.evaluate(() => [window.__drawn, performance.now()]);
        await page.waitForTimeout(10000);
        const b = await page.evaluate(() => [window.__drawn, performance.now(), window.pellagos.session.view.renderer.info.render.calls, window.pellagos.session.view.renderer.info.render.triangles]);
        out[label] = { fps: +(((b[0] - a[0]) * 1000) / (b[1] - a[1])).toFixed(1), calls: b[2], triangles: b[3] };
    }
    console.log(JSON.stringify(out, null, 1));
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
