import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(5000);
const measure = (pitch, distance, opts) => page.evaluate(async ([pitch, distance, opts]) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    game.cameraFollow.pitch = pitch; view.distance = distance; view.zoomTo = null;
    const ratio = view.renderer.getPixelRatio();
    if (opts.shadowsOff) view.sun.castShadow = false;
    if (opts.tiny) view.renderer.setPixelRatio(0.1);
    await new Promise((r) => setTimeout(r, 1500));
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const info = { calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles };
    view.sun.castShadow = true;
    view.renderer.setPixelRatio(ratio);
    return { fps: +(n / ((performance.now() - t0) / 1000)).toFixed(2), ...info };
}, [pitch, distance, opts]);
for (const [name, opts] of [["plain", {}], ["no shadows", { shadowsOff: true }], ["tiny pixels", { tiny: true }], ["both", { shadowsOff: true, tiny: true }]]) {
    console.log(name.padEnd(12), "new", JSON.stringify(await measure(12, 10.5, opts)), " old", JSON.stringify(await measure(25, 5.5, opts)));
}
await browser.close();
