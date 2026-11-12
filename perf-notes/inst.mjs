import { chromium } from "/home/user/conquest/node_modules/playwright/index.mjs";
const port = process.argv[2] ?? "8097";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
await page.goto(`http://localhost:${port}/?play&seed=1`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(4000);
for (const [name, pitch, distance] of [["new", 12, 10.5], ["old", 25, 5.5]]) {
    const r = await page.evaluate(async ([pitch, distance]) => {
        const { game, session } = window.pellagos;
        const view = session.view;
        game.cameraFollow.pitch = pitch; view.distance = distance; view.zoomTo = null;
        await new Promise((r) => setTimeout(r, 2500));
        const cam = view.camera;
        const THREE = window.THREE ?? null;
        const fr = view.frustum;
        const by = {};
        let draws = 0, inst = 0, tris = 0;
        view.scene.traverseVisible((o) => {
            if (!o.isMesh) return;
            if (o.frustumCulled && !fr.intersectsObject(o)) return;
            const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
            const n = o.isInstancedMesh ? o.count : 1;
            let p = o; let top = o.name || "?"; while (p.parent && p.parent !== view.scene) { if (p.name) top = p.name; p = p.parent; }
            const k = `${p.name || p.type}/${o.isInstancedMesh ? "inst:" : ""}${o.name || o.parent?.name || "?"}`;
            by[k] ??= { draws: 0, inst: 0, tris: 0 };
            by[k].draws++; by[k].inst += n; by[k].tris += t * n;
            draws++; inst += n; tris += t * n;
        });
        const top = Object.entries(by).sort((a, b) => b[1].inst - a[1].inst).slice(0, 14).map(([k, v]) => `${k} d${v.draws} i${v.inst} t${Math.round(v.tris / 1000)}k`);
        return { draws, inst, tris: Math.round(tris / 1000) + "k", top };
    }, [pitch, distance]);
    console.log("==", name, r.draws, "draws", r.inst, "instances", r.tris, "tris");
    for (const l of r.top) console.log("   ", l);
}
await browser.close();
