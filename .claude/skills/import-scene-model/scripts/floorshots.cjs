/* global console, process, window, setTimeout */
// Pictures of a scene's keep's floors in the game (core/scenery.js SCENERY's `keep`: a dungeon of
// its own behind its doors), with the game's own camera: the player put in each floor's biggest room
// (or the first of the kind ROOM names), or on its first balcony a square in from the parapet,
// facing out, if it has one; its foes kept off, a few seconds played. With LOOK=1, from each
// balcony too, as one standing on it sees past its parapet: straight out, and to the left and
// right (the land, the castle round it and the sky, drawn from where the floor stands over the
// world: core/scenery.js keepOutlook). Serve the game (`PORT=8145 node server/index.js` from the
// repository's root, after `npm run build:manifest`), then:
//   SCENE=bellhaven FLOORS=0,1,2,3 LOOK=1 OUT=<dir> DPR=2 node .claude/skills/import-scene-model/scripts/floorshots.cjs
// SEED (1), PORT (8145), CHROMIUM_PATH if Playwright's own browser won't start. Prints each
// floor's name, room, balcony, draw calls and triangles.
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.env.OUT ?? ".";
const SCENE = process.env.SCENE ?? "bellhaven";

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
    const errors = [];

    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:${process.env.PORT ?? 8145}/?play&seed=${process.env.SEED ?? 1}`);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 180000 });

    for (const k of (process.env.FLOORS ?? "0,1,2,3").split(",").map(Number)) {
        const info = await page.evaluate(
            async ([scene, k, pick]) => {
                const { game, session } = window.pellagos;
                const interiors = game.world.interiors;
                const site = game.world.plan.sites.find(({ scenery }) => scenery === scene);

                game.stop();
                game.world.maps.town.sites.heartOf(site);
                interiors.make(`site:${site.id}`);

                const keep = interiors.buildings.get(`site:${site.id}-keep`);

                interiors.make(keep.key);

                const id = keep.maps[k];
                const level = keep.dungeon.levels[k];
                const rooms = [...level.rooms].sort((a, b) => b.area - a.area);
                const room = (pick ? rooms.find((r) => r.kind === pick) : null) ?? rooms[0];
                const balcony = pick ? null : (level.balconies?.[0] ?? null);
                const player = game.battle.actor("player");
                const still = () => {
                    for (const actor of game.battle.actors) {
                        if (actor.map === id && actor.id !== "player" && !actor.dead) {
                            Object.assign(actor, { dead: true, respawnAt: Infinity });
                        }
                    }
                };
                const play = async (steps, render = true) => {
                    for (let s = 0; s < steps; s++) {
                        game.advance(0.05, { render });
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                };

                Object.assign(player, { hp: 1e7, maxHp: 1e7 });
                still();

                // (On the balcony's floor a square in from its parapet, facing out; or the room's middle)
                const [x, y] = balcony ? [balcony.x + Math.floor(balcony.w / 2) - balcony.out[0], balcony.y + Math.floor(balcony.h / 2) - balcony.out[1]] : [room.centre[0], room.centre[1] + 2];

                Object.assign(player, { map: id, x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, target: null, facing: balcony ? Math.atan2(balcony.out[0], balcony.out[1]) : Math.PI });
                await play(60);

                // (Put there, not come in by a door: the view told it's indoors once the floor's built,
                // as the game's own way in does)
                for (let s = 0; s < 600 && !game.interiors.get(id); s++) {
                    game.advance(0.05, { render: false });
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                game.view.setIndoors(game.interiors.get(id));
                game.view.setOccluders(null);
                await play(40);
                still();
                await play(40);
                game.view.render();

                const { calls, triangles } = session.view.renderer.info.render;

                return { id, name: game.world.maps[id].name, room: `${room.kind}:${room.look}`, balcony, shown: game.mapId === id, calls, triangles };
            },
            [SCENE, k, process.env.ROOM ?? null],
        );

        fs.writeFileSync(`${OUT}/floor-${k + 1}${process.env.ROOM ? "-" + process.env.ROOM : ""}.png`, await page.screenshot({ timeout: 120000 }));
        console.log(k, JSON.stringify(info));

        if (process.env.LOOK && info.balcony) {
            // (As one standing on it sees: from head height a pace back from where they stand, looking
            // out over the parapet, `down` of the way below level, turned `side` off straight out)
            for (const [name, down, side] of [
                ["out", 0.12, 0],
                ["left", 0.2, -0.7],
                ["right", 0.2, 0.7],
            ]) {
                const seen = await page.evaluate(
                    ([balcony, down, side]) => {
                        const { game } = window.pellagos;
                        const at = game.avatars.get(game.me).object.position;
                        const view = game.view;
                        const camera = view.camera.clone();
                        const [ox, oz] = balcony.out;
                        const [dx, dz] = [ox * Math.cos(side) - oz * Math.sin(side), ox * Math.sin(side) + oz * Math.cos(side)];

                        camera.position.set(at.x - ox * 1.2, at.y + 1.7, at.z - oz * 1.2);
                        camera.lookAt(at.x + dx * 30, at.y + 1.7 - 30 * down, at.z + dz * 30);
                        camera.fov = 60;
                        camera.updateProjectionMatrix();
                        camera.updateMatrixWorld();
                        view.render(view.scene, camera);

                        return { at: [at.x, at.y, at.z], outlook: game.interiors.get(game.mapId)?.outlook ?? null };
                    },
                    [info.balcony, down, side],
                );

                fs.writeFileSync(`${OUT}/look-${k + 1}-${name}.png`, await page.screenshot({ timeout: 120000 }));
                console.log(k, name, JSON.stringify(seen));
            }
        }
    }

    console.log("errors", JSON.stringify(errors.slice(0, 5)));
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
