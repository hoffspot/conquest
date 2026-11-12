import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(5000);
const names = await page.evaluate(() => window.pellagos.session.view.scene.children.map((c, i) => `${i}:${c.name || c.type}:${c.children.length}`));
console.log(names.join(" | "));
const measure = (hide, pitch = 12, distance = 10.5) => page.evaluate(async ([hide, pitch, distance]) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    game.cameraFollow.pitch = pitch; view.distance = distance; view.zoomTo = null;
    const kids = view.scene.children;
    const was = kids.map((c) => c.visible);
    kids.forEach((c, i) => { if (hide.includes(i)) c.visible = false; });
    await new Promise((r) => setTimeout(r, 1200));
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    kids.forEach((c, i) => (c.visible = was[i]));
    return n / ((performance.now() - t0) / 1000);
}, [hide, pitch, distance]);
console.log("base", (await measure([])).toFixed(2));
const count = names.length;
const step = Math.ceil(count / 6);
for (let a = 0; a < count; a += step) {
    const hide = Array.from({ length: Math.min(step, count - a) }, (_, k) => a + k);
    console.log("hide", hide.join(","), (await measure(hide)).toFixed(2));
}
console.log("all hidden", (await measure(names.map((_, i) => i))).toFixed(2));
console.log("old view", (await measure([], 25, 5.5)).toFixed(2));
await browser.close();
