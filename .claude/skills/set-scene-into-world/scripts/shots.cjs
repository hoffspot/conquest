/* global console, performance, process, setTimeout, window */
// Pictures of a scene set into the world (the first site with a `scenery`), from where you say:
// the player brought to a spot (the scene's own metres), the world made round them, the camera put
// where asked and drawn. Serve the game (`PORT=8145 node server/index.js` from the repository's
// root, after `npm run build:manifest`), then:
//   SEED=1 SHOTS='[["road",[0,200],[12,10,230],[0,-80,80]]]' node .claude/skills/set-scene-into-world/scripts/shots.cjs
// Each shot: [label, where the player stands [x, z], the camera [x, height over the land, z], what
// it looks at [x, z, height over the scene's 0]]. HIDE=land draws the scene alone; HIDE=castle the
// land alone; HIDE="landmark mist" (or any name its parts start with) all but those. OUT is where the pictures go (the scratchpad), DPR 2 for pictures the owner sees.
// NEAR_FAR (metres) draws the near world further than the game does (160 m), to look at its near
// copy alone. CHROMIUM_PATH if Playwright's own browser won't start.
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.env.OUT ?? ".";
const SEED = Number(process.env.SEED ?? 2);
// [label, where the player stands (scene x, z), camera (scene x, height over the land there, z), what it looks at (scene x, z, height over the scene's 0)]
const SHOTS = JSON.parse(process.env.SHOTS ?? JSON.stringify([
    ["way-in", [0, 95], [0, 6, 108], [0, -60, 70]],
    ["road", [0, 200], [12, 10, 230], [0, -80, 80]],
    ["far", [0, 650], [0, 25, 700], [0, -80, 90]],
    ["side", [420, -60], [440, 30, -20], [0, -100, 80]],
    ["high", [0, 380], [0, 260, 520], [0, -60, 40]],
]));
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "warning" && /scene|Couldn't/.test(m.text()) && errors.push(m.text()));
    await page.goto(`http://localhost:${process.env.PORT ?? 8145}/?play&seed=${SEED}`);
    if (process.env.HIDE) {await page.evaluate((hide) => (window.HIDE = hide), process.env.HIDE);}
    if (process.env.NEAR_FAR) {await page.evaluate((far) => (window.NEAR_FAR = far), Number(process.env.NEAR_FAR));}
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 180000 });
    for (const [label, stand, eye, look] of SHOTS) {
        const info = await page.evaluate(async ([stand, eye, look]) => {
            const { game } = window.pellagos;
            const { toWorld } = await import("/js/core/terrain/scenes.js");
            const { scenesIn } = await import("/js/core/terrain/height.js");
            const [placed] = scenesIn(game.world.plan);
            const player = game.battle.actor("player");
            game.stop();
            Object.assign(game.battle.actor("orc") ?? {}, { dead: true, respawnAt: Infinity });
            const [px, py] = toWorld(placed, ...stand);
            Object.assign(player, { hp: 1e6, maxHp: 1e6, x: px, y: py, square: [Math.floor(px), Math.floor(py)], path: [], order: null, facing: placed.facing + Math.PI });
            const start = performance.now();
            for (let k = 0; k < 400 && performance.now() - start < 60000; k++) {
                game.advance(0.05);
                await new Promise((r) => setTimeout(r, 15));
                if (k > 60 && game.setIn?.scenes[0]?.drawn && !game.chunks?.queue?.length) {break;}
            }
            const view = game.view;
            const land = game.world.maps.town;
            const [ex, ey] = toWorld(placed, eye[0], eye[2]);
            const [lx, ly] = toWorld(placed, look[0], look[1]);
            view.camera.position.set(ex, land.heightAt(ex, ey) + eye[1], ey);
            view.camera.lookAt(lx, placed.base + look[2], ly);
            // (The near world drawn only as far as the game draws it, 160 m: drawn further, the
            // scene's near copy's drawn over the far land in front of it, and a hill behind it from
            // here seems to cut it. NEAR_FAR for further, to look at the near copy alone)
            if (window.NEAR_FAR) {
                view.camera.far = window.NEAR_FAR;
                view.camera.updateProjectionMatrix();
            }
            const hide = window.HIDE ?? null;
            const hidden = [];
            if (hide === "land") {
                for (const scene of [view.scene, view.far.scene]) {
                    for (const child of scene.children) {
                        if (child !== view.horizon.near && child !== view.horizon.far && !child.isLight && child.name !== "sky" && child.visible) { child.visible = false; hidden.push(child); }
                    }
                }
            } else if (hide === "castle") {
                for (const group of [game.setIn.far, game.setIn.near]) { group.visible = false; hidden.push(group); }
            } else if (hide) {
                // (What of it, or whose material, is named so: "landmark mist", "landmark scree", "landmark boulders", "landmark dressing", "landmark ground")
                // ("far:" or "near:" before it: only what's drawn with the far land, or the near world)
                const [pass, name] = /^(far|near):/.test(hide) ? hide.split(/:(.*)/) : [null, hide];
                for (const group of [game.setIn.far, game.setIn.near].filter((each) => !pass || each === game.setIn[pass])) { group.traverse((part) => { if ((part.name.startsWith(name) || [part.material].flat().some((material) => material?.name?.startsWith(name))) && part.visible) { part.visible = false; hidden.push(part); } }); }
            }
            view.render();
            setTimeout(() => hidden.forEach((each) => (each.visible = true)), 2000);
            return { drawn: game.setIn?.scenes[0]?.drawn, base: placed.base, at: placed.at, land: land.heightAt(px, py), calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles };
        }, [stand, eye, look]);
        fs.writeFileSync(`${OUT}/world-${SEED}-${label}${process.env.HIDE ? "-no-" + process.env.HIDE.replace(/[ :]/g, "-") : ""}.png`, await page.screenshot());
        console.log(label, JSON.stringify(info));
    }
    console.log("errors", JSON.stringify(errors.slice(0, 5)));
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
