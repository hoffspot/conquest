import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(4000);
const textures = await page.evaluate(() => {
    const { session } = window.pellagos;
    const seen = new Set();
    window.__tex = [];
    session.view.scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
            const cands = [];
            for (const k of Object.keys(m)) if (m[k]?.isTexture) cands.push(m[k]);
            for (const u of Object.values(m.uniforms ?? {})) if (u?.value?.isTexture) cands.push(u.value);
            for (const t of cands) if (!seen.has(t) && t.anisotropy > 1) { seen.add(t); window.__tex.push([t, t.anisotropy, o.name || o.parent?.name]); }
        }
    });
    return window.__tex.map(([t, a, n]) => `${n}:${a}`);
});
console.log(textures.length, textures.slice(0, 30).join(" "));
const measure = (pitch, distance, flat) => page.evaluate(async ([pitch, distance, flat]) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    game.cameraFollow.pitch = pitch; view.distance = distance; view.zoomTo = null;
    for (const [t, a] of window.__tex) { t.anisotropy = flat ? 1 : a; t.needsUpdate = true; }
    await new Promise((r) => setTimeout(r, 2500));
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return +(n / ((performance.now() - t0) / 1000)).toFixed(2);
}, [pitch, distance, flat]);
console.log("new aniso", await measure(12, 10.5, false), "flat", await measure(12, 10.5, true));
console.log("old aniso", await measure(25, 5.5, false), "flat", await measure(25, 5.5, true));
await browser.close();
