/* global console, process, window, document, performance, setTimeout */
// Pictures in a scene's own map (core/scenery.js SCENERY: the castle walked as its walk has it),
// with the game's own camera: the player taken through its way in from the world (the readying card
// and all, as play does), then stood at each point asked, facing the way asked, a few moments
// played. Serve the game (`PORT=8145 node server/index.js` from the repository's root, after
// `npm run build:manifest`), then:
//   SCENE=bellhaven SHOTS='[["bridge",[0,-30],180]]' OUT=<dir> DPR=2 node .claude/skills/import-scene-model/scripts/mapshots.cjs
// Each shot: [label, where the player stands (the scene's metres, [x, z]), the way they face
// (degrees: 0 toward +z, its front; 180 toward its back)]. SEED (1), PORT (8145), CHROMIUM_PATH if
// Playwright's own browser won't start. Prints each shot's draw calls and triangles.
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.env.OUT ?? ".";
const SCENE = process.env.SCENE ?? "bellhaven";
const SHOTS = JSON.parse(
    process.env.SHOTS ??
        JSON.stringify([
            ["way-in", [0, 64], 180],
            ["bridge", [0, -30], 180],
            ["gate", [0, -85], 180],
            ["court", [-0.5, -133], 180],
            ["back-to-the-bridge", [0, -120], 0],
        ]),
);

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
    const errors = [];

    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:${process.env.PORT ?? 8145}/?play&seed=${process.env.SEED ?? 1}`);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 180000 });

    // (In by its way in from the world: stood on its outside end and sent through its door, the
    // world played on while the readying card's closed, till its map's shown)
    const map = await page.evaluate(async (scene) => {
        const { game } = window.pellagos;
        const site = game.world.plan.sites.find(({ scenery }) => scenery === scene);
        const building = game.world.interiors.buildings.get(`site:${site.id}`);
        const [outside] = building.door.ends;
        const player = game.battle.actor("player");
        const id = `${building.key}/grounds`;
        const [x, y] = outside.arrive;

        game.stop();
        Object.assign(player, { hp: 1e7, maxHp: 1e7, x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: building.door.id, run: true });

        const start = performance.now();
        const shown = () => player.map === id && game.mapId === id && Boolean(game.interiors.get(id)?.object.visible);

        while (!shown() && performance.now() - start < 240000) {
            if (!game.readyingAt) {
                if (game.running) {
                    game.stop();
                }

                game.advance(0.1, { render: false });
            }

            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // (And its art drawn in its walk's stand-in's place, a frame drawn now and then for it to be
        // put there; without the licensed models, the stand-in after a minute)
        const drawing = performance.now();

        for (let k = 0; !game.interiors.get(id)?.art && performance.now() - drawing < 60000; k++) {
            game.advance(0.05, { render: k % 10 === 0 });
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        return { id, shown: shown(), at: player.map, art: Boolean(game.interiors.get(id)?.art) };
    }, SCENE);

    console.log("map", JSON.stringify(map));

    for (const [label, at, facing] of SHOTS) {
        const info = await page.evaluate(
            async ([scene, at, facing]) => {
                const { game, session } = window.pellagos;
                const { squareIn } = await import("/js/core/scenery.js");
                const player = game.battle.actor("player");
                const [x, y] = squareIn(scene, at);

                // (Its foes about it kept off: the place alone in the picture)
                for (const actor of game.battle.actors) {
                    if (actor.map === player.map && actor.id !== "player") {
                        Object.assign(actor, { dead: true, respawnAt: Infinity });
                    }
                }

                Object.assign(player, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, target: null, facing: (facing * Math.PI) / 180 });

                for (let k = 0; k < 30; k++) {
                    game.advance(0.1, { render: k % 5 === 4 });
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                game.advance(0.05);

                const { calls, triangles } = session.view.renderer.info.render;

                return { square: [x, y], map: player.map, calls, triangles, cells: game.interiors.get(player.map)?.drawn?.() ?? null };
            },
            [SCENE, at, facing],
        );

        // (The page's own overlays left as the player sees them)
        await page.evaluate(() => document.activeElement?.blur?.());
        fs.writeFileSync(`${OUT}/${SCENE}-${label}.png`, await page.screenshot({ timeout: 120000 }));
        console.log(label, JSON.stringify(info));
    }

    console.log("errors", JSON.stringify(errors.slice(0, 5)));
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
