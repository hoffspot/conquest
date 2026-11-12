import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
    const { session } = window.pellagos;
    const chunks = session.view.scene.children[5];
    const kinds = {};
    for (const chunk of chunks.children) for (const c of chunk.children) { const k = c.name || c.type; kinds[k] = (kinds[k] ?? 0) + 1; }
    return { quality: session.quality ?? session.view.quality?.label ?? null, kinds };
});
console.log(JSON.stringify(info));
const measure = (hideName, pitch = 12, distance = 10.5) => page.evaluate(async ([hideName, pitch, distance]) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    game.cameraFollow.pitch = pitch; view.distance = distance; view.zoomTo = null;
    const chunks = view.scene.children[5];
    const hidden = [];
    for (const chunk of chunks.children) for (const c of chunk.children) if ((c.name || c.type) === hideName && c.visible) { c.visible = false; hidden.push(c); }
    await new Promise((r) => setTimeout(r, 1200));
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    hidden.forEach((c) => (c.visible = true));
    return n / ((performance.now() - t0) / 1000);
}, [hideName, pitch, distance]);
console.log("base", (await measure("-")).toFixed(2));
for (const k of Object.keys(info.kinds)) console.log("hide", k, (await measure(k)).toFixed(2));
await browser.close();
