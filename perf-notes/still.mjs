import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
const t0 = Date.now();
for (let k = 0; k < 14; k++) {
    const s = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const v = session.view;
        const me = game.avatars.get(game.me);
        const p = v.toScreen(me.point(0.5));
        return { x: Math.round(p.x), y: Math.round(p.y), dist: +v.distance.toFixed(2), cam: +v.camera.position.distanceTo(me.object.position).toFixed(2), pitch: +game.cameraFollow.pitch.toFixed(1), fly: Boolean(game.flyIn ?? game.cameraFollow.flying) };
    });
    console.log(((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(s));
    await page.waitForTimeout(1500);
}
await browser.close();
