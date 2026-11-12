import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(6000);
const views = [["new", null, null], ["old 25/5.5", 25, 5.5], ["overlook 35/10.5", 35, 10.5], ["new again", null, null]];
for (const [name, pitch, distance] of views) {
    const r = await page.evaluate(async ([pitch, distance]) => {
        const { game, session } = window.pellagos;
        if (pitch !== null) { game.cameraFollow.pitch = pitch; session.view.distance = distance; session.view.zoomTo = null; }
        else { game.cameraFollow.pitch = 12; session.view.distance = 10.5; session.view.zoomTo = null; }
        await new Promise((r) => setTimeout(r, 1500));
        const r0 = session.renderer?.info?.render;
        let n = 0; const t0 = performance.now();
        await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        const info = (session.view?.renderer ?? session.renderer)?.info?.render;
        return { fps: n / ((performance.now() - t0) / 1000), calls: info?.calls, triangles: info?.triangles };
    }, [pitch, distance]);
    console.log(name, JSON.stringify(r));
}
await browser.close();
