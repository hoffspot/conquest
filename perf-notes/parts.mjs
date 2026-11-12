import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(5000);
console.log(await page.evaluate(() => window.pellagos.session.view.far.scene.children.map((c) => `${c.name || c.type}:${c.children.length}`).join(" ")));
const trials = ["base", "nosky", "nofar", "base"];
for (const name of trials) {
    const r = await page.evaluate(async (name) => {
        const { game, session } = window.pellagos;
        const view = session.view;
        game.cameraFollow.pitch = 12; view.distance = 10.5; view.zoomTo = null;
        const kids = view.far.scene.children;
        const was = kids.map((c) => c.visible);
        if (name === "nosky") view.sky.object.visible = false;
        if (name === "nofar") kids.forEach((c) => { if (c !== view.sky.object) c.visible = false; });
        await new Promise((r) => setTimeout(r, 1500));
        let n = 0; const t0 = performance.now();
        await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        kids.forEach((c, i) => (c.visible = was[i]));
        view.sky.object.visible = true;
        return n / ((performance.now() - t0) / 1000);
    }, name);
    console.log(name, r.toFixed(2));
}
await browser.close();
