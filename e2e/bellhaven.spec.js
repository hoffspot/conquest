import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";
import { expect, test } from "./fixtures.js";

// Bellhaven (core/scenery.js, core/terrain/scenes.js, world/landmark3d.js, world/scenery3d.js,
// docs/WORLD.md): set into the world, its castle seen from its road's end; a fixed scene's own map,
// gone into by stepping onto its way in there, its art got ready behind the readying card, drawn
// out of doors under the sky, each cell at its detail; walked over its bridge, and left, its art
// let go of.
// The game exposes itself as window.pellagos ({ game, session, fetcher, ... }), which these tests use.

// (No service worker: it would fetch the licensed models round what the page is kept from, in the
// test without them, models.spec.js's way)
test.use({ serviceWorkers: "block" });

// Open the game and wait for it to be playing (as pellagos.spec.js's)
async function playing(page, address) {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(address);

    try {
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
    } catch (error) {
        throw new Error(`Not playing; errors: ${JSON.stringify(errors.slice(0, 5))}`, { cause: error });
    }

    return errors;
}

// The player brought to its road's end, before its way in, the world made round them till its
// castle's far model's drawn there (or its stand-in, without the licensed models); then stepped
// onto its way in: the readying card's state at once, and the castle's door
const stepIn = (page) =>
    page.evaluate(async () => {
        const { game } = window.pellagos;
        const { squaresOf } = await import("/js/core/grid.js");
        const { FOREST_FLOOR } = await import("/js/world/ground.js");
        const site = game.world.plan.sites.find(({ scenery }) => scenery === "bellhaven");
        const building = game.world.interiors.buildings.get(`site:${site.id}`);
        const [outside] = building.door.ends;
        const player = game.battle.actor("player");
        const squares = squaresOf(game.world.maps.town);
        const [x, y] = outside.arrive;

        game.stop();
        Object.assign(game.battle.actor("orc") ?? {}, { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6, x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, progress: null, facing: site.facing + Math.PI });

        // (The world made round them, and the castle seen from its road's end)
        const start = performance.now();

        while (performance.now() - start < 90000 && !(game.setIn?.scenes[0]?.drawn && game.mapId === "town")) {
            game.advance(0.05);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // (Its own terrain drawn as the world's ground is, so all on it stands on it, darkened round
        // what stands on it; its rocks and walls darkened at their feet; its boulders, its scree and
        // its chasm's mist: world/landmarkdress.js)
        let [ground, contact, feet] = [false, false, 0];
        const dressing = new Set();

        game.setIn?.far.traverse((part) => {
            ground ||= part.isMesh && part.visible && part.material?.name === "landmark ground";
            contact ||= part.isMesh && part.material?.name === "landmark ground" && Boolean(part.material.userData.contact);
            feet += part.isMesh && "LANDMARK_FEET_ON" in (part.material?.defines ?? {}) ? 1 : 0;
        });

        // (Its terrain's ground materials, the far land's and the near world's: never one in both,
        // or the far one's drawn as a pale sheet)
        const grounds = [new Set(), new Set()];

        for (const [k, group] of [game.setIn?.far, game.setIn?.near].entries()) {
            group?.traverse((part) => {
                if (part.isMesh && part.name.startsWith("landmark ") && part.name !== "landmark stand-in") {
                    dressing.add(part.name);
                }

                if (part.isMesh && part.material?.name === "landmark ground") {
                    grounds[k].add(part.material);
                }
            });
        }

        // (Its hill's woods on a forest's floor, the world's ground's, from the plan, with its art or
        // without: ground.js FOREST_FLOOR)
        const floor = FOREST_FLOOR.map.value?.image;
        const forest = Boolean(floor && floor.width > 1 && floor.data.some((share) => share === 255));
        const seen = { drawn: game.setIn?.scenes[0]?.drawn ?? null, forest, ground, contact, feet: feet > 0, grounds: { far: grounds[0].size, near: grounds[1].size, shared: [...grounds[0]].filter((material) => grounds[1].has(material)).length }, dressing: [...dressing].sort(), dressed: game.setIn?.scenes[0]?.dressing ?? null, open: outside.squares.every(([sx, sy]) => !squares.blocked(sx, sy)), stood: squares.blocked(...site.at.map(Math.floor)) };

        // (Onto its way in: the nearest of its squares)
        const [to] = [...outside.squares].sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y));

        game.host.command("player", { type: "move", to });

        for (let k = 0; k < 200 && !game.readyingAt && player.map === "town"; k++) {
            game.advance(0.05);
        }

        return { key: building.key, map: `${building.key}/grounds`, door: building.door.id, running: game.running, card: Boolean(game.readyingAt), named: document.querySelector("#readyingname").textContent, ...seen };
    });

// Played on till the player's in the castle's map (`id`) and its inside's shown (the readying
// card closed itself once the art was read, and sent them through): what's there if they aren't
const inside = (page, id) =>
    page.evaluate(async (id) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const start = performance.now();
        const shown = () => player.map === id && game.mapId === player.map && Boolean(game.interiors.get(player.map)?.object.visible);

        while (!shown() && performance.now() - start < 150000) {
            // (The card's open meanwhile: the world stopped till it's closed)
            if (!game.readyingAt) {
                if (game.running) {
                    game.stop();
                }

                game.advance(0.1, { render: false });
            }

            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        return { shown: shown(), map: player.map, mapId: game.mapId, order: player.order?.type ?? null, readying: Boolean(game.readyingAt), built: Boolean(game.interiors.get(id)) };
    }, id);

// What's drawn and how, in the castle: lit as out of doors, the world hidden, the player standing on
// its floor, the cells and blocks drawn, draw calls and triangles
const looked = (page) =>
    page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const interior = game.interiors.get(player.map);
        const avatar = game.avatars.get("player").object.position;
        const map = game.world.maps[player.map];
        const [ox, oz] = map.origin;

        game.advance(0.1);

        const { calls, triangles } = session.view.renderer.info.render;

        return {
            indoors: session.view.indoors,
            sky: session.view.sky.object.visible,
            town: game.town.object.visible,
            far: session.view.camera.far,
            art: interior.art,
            drawn: interior.drawn(),
            standing: Math.abs(avatar.y - map.heightAt(avatar.x - ox, avatar.z - oz)),
            height: avatar.y,
            calls,
            triangles,
        };
    });

for (const licensed of [true, false]) {
    test(
        licensed
            ? "Bellhaven seen from its road's end, its way in stepped onto: its art got ready behind the readying card, the world stopped; gone into once it's read, drawn out of doors in its cells, a phone's draw calls; walked over its bridge to the keep's doors on its floor; left by its bridge's foot, its art let go of"
            : "Bellhaven without the licensed models: its stand-in seen from its road's end, gone into all the same, its walk drawn in their place, walked and left",
        async ({ page }) => {
            test.skip(licensed && !licensedModelsHere(), LEFT_OUT);
            test.setTimeout(480000);

            if (!licensed) {
                await page.route("**/models/scenery/**", (route) => (route.request().url().includes(".bin") ? route.abort() : route.continue()));
            }

            const errors = await playing(page, "/?play&seed=1");
            const tapped = await stepIn(page);

            // (Seen from its road's end: its far model, its own terrain drawn as the world's ground,
            // darkened round what stands on it, or its stand-in; its hill's forest floor either way;
            // its way in open, the rest of it stood on)
            expect(tapped).toMatchObject({ drawn: licensed ? "art" : "stand-in", forest: true, ground: licensed, contact: licensed, feet: licensed, open: true, stood: true });
            // (Dressed with its art: its boulders and scree along its crag's foot, its chasm's mist;
            // its stand-in isn't)
            expect(tapped.dressing).toEqual(licensed ? ["landmark boulders", "landmark mist", "landmark scree"] : []);
            // (Its terrain's ground a material of its own in each pass)
            expect(tapped.grounds).toEqual(licensed ? { far: 1, near: 1, shared: 0 } : { far: 0, near: 0, shared: 0 });

            if (licensed) {
                expect(tapped.dressed.mist).toBeGreaterThan(50);
                expect(tapped.dressed.boulders).toBeGreaterThan(20);
            }


            // (Stepped onto: the world stopped while its art's got ready, the card up, saying what
            // it's for)
            expect(tapped).toMatchObject({ running: false, card: true, named: "Bellhaven" });
            await expect(page.locator("#readyingnote")).toContainText("castle");
            expect(await inside(page, tapped.map)).toMatchObject({ shown: true });

            const there = await looked(page);

            expect(there).toMatchObject({ indoors: false, sky: true, town: false, art: licensed });
            expect(there.far).toBeGreaterThan(100);
            expect(there.standing).toBeLessThan(0.3);
            expect(there.height).toBeGreaterThan(60);

            // (At High, the browser tests' quality: the game's own 42 draw calls and 250,000
            // triangles, the castle's about 80 and 125,000 more at its bridge's foot)
            if (licensed) {
                expect(there.drawn.cells).toBeGreaterThan(4);
                expect(there.calls).toBeLessThan(160);
                expect(there.triangles).toBeLessThan(500000);
            }

            // Over the bridge to the keep's doors, on its floor all the way
            const walked = await page.evaluate(async () => {
                const { game } = window.pellagos;
                const { squareIn } = await import("/js/core/scenery.js");
                const player = game.battle.actor("player");
                const doors = squareIn("bellhaven", [-0.5, -140]);
                const map = game.world.maps[player.map];
                const [ox, oz] = map.origin;
                let off = 0;

                game.host.command("player", { type: "move", to: doors, run: true });

                for (let k = 0; k < 900 && Math.hypot(player.x - doors[0] - 0.5, player.y - doors[1] - 0.5) > 2; k++) {
                    game.advance(0.1, { render: k % 10 === 0 });

                    const at = game.avatars.get("player").object.position;

                    off = Math.max(off, Math.abs(at.y - map.heightAt(at.x - ox, at.z - oz)));
                }

                return { there: Math.hypot(player.x - doors[0] - 0.5, player.y - doors[1] - 0.5) <= 2, off, map: player.map };
            });

            expect(walked).toMatchObject({ there: true, map: tapped.map });
            expect(walked.off).toBeLessThan(0.5);

            const atKeep = await looked(page);

            expect(atKeep.height).toBeGreaterThan(78);

            if (licensed) {
                expect(atKeep.calls).toBeLessThan(160);
                expect(atKeep.triangles).toBeLessThan(550000);
            }

            // Into its keep (core/dungeons/themes.js keep), stepped into its doorway off the court:
            // its creatures got ready behind the card, its first floor shown, a dungeon's, indoors,
            // its stairs up and its doors out glowing to tap; the castle's art kept meanwhile
            const keep = await page.evaluate(async () => {
                const { game } = window.pellagos;
                const { sceneryKeep } = await import("/js/core/scenery.js");
                const player = game.battle.actor("player");
                const site = game.world.plan.sites.find(({ scenery }) => scenery === "bellhaven");
                const building = game.world.interiors.buildings.get(`site:${site.id}-keep`);
                const [x, y] = sceneryKeep("bellhaven").squares.at(-1);

                game.host.command("player", { type: "move", to: [x, y], run: false });

                for (let k = 0; k < 400 && player.map !== building.door.ends[1].map && !game.readyingAt; k++) {
                    game.advance(0.1, { render: k % 10 === 0 });
                }

                return { key: building.key, door: building.door.id, map: building.door.ends[1].map, made: building.made, levels: building.maps.length, card: Boolean(game.readyingAt) || player.map === building.door.ends[1].map };
            });

            expect(keep).toMatchObject({ made: true, levels: 4, card: true });
            expect(await inside(page, keep.map)).toMatchObject({ shown: true });

            const floor = await page.evaluate(([id, castle]) => {
                const { game, session } = window.pellagos;
                const map = game.world.maps[id];
                const building = game.world.interiors.of(id);

                game.advance(0.1);

                return {
                    indoors: Boolean(session.view.indoors),
                    look: map.look,
                    level: map.dungeon?.level,
                    name: map.name,
                    // (Its doors out, and its stair up, there to tap)
                    doors: game.doors.targets.filter(({ map: on, link }) => on === id && link.building === building.key).map(({ link }) => (link.kind === "door" ? "doors" : "stair")).sort(),
                    castle: game.interiors.get(castle)?.art ?? false,
                    calls: session.view.renderer.info.render.calls,
                };
            }, [keep.map, tapped.map]);

            expect(floor).toMatchObject({ indoors: true, look: "keep", level: 0, doors: ["doors", "stair"], castle: licensed, name: "The Keep of Bellhaven: the Great Hall" });
            expect(floor.calls).toBeLessThan(250);

            // Drawn in its castle's own stone (world/keepkit.js), its kit fetched while the court was
            // crossed: its pieces set about it, its walls and floor its castle's, its own pillars put
            // away for its castle's columns; without the licensed models, none of it
            const kit = await page.evaluate(async (id) => {
                const { game, session } = window.pellagos;
                const { object } = game.interiors.get(id);
                const pieces = new Set();
                const rock = {};
                let pillars = null;

                await object.userData.furnished;
                game.advance(0.1);

                object.traverse((node) => {
                    if (node.isMesh && node.material?.name?.startsWith("prop-bellhaven-keep-")) {
                        pieces.add(node.material.name.slice("prop-bellhaven-keep-".length));
                    } else if (node.isMesh && (node.name === "walls" || node.name === "floor")) {
                        rock[node.name] = node.material.name;
                    } else if (node.isMesh && node.name === "pillars") {
                        pillars = node.visible;
                    }
                });

                return { pieces: [...pieces].sort(), rock, pillars, calls: session.view.renderer.info.render.calls };
            }, keep.map);

            expect(kit).toMatchObject(
                licensed
                    ? { pieces: ["column", "cornice", "pilaster", "window"], rock: { walls: "rock-keep-wall", floor: "rock-keep-floor" }, pillars: false }
                    : { pieces: [], rock: { walls: "rock-stone-temple", floor: "rock-floor-temple" }, pillars: true },
            );
            expect(kit.calls).toBeLessThan(250);

            // High over the land, in the open air (core/dungeons/air.js): the world seen past its
            // walls from where the floor stands in it (world/view.js outlook, core/scenery.js
            // keepOutlook), its way in at the keep's doors, as high as their floor; the sky over it,
            // the far land drawn whole round it, the keep's own walls left out of it
            const seen = await page.evaluate(async (id) => {
                const { game, session } = window.pellagos;
                const { keepFloor, outlookPoint, SCENERY } = await import("/js/core/scenery.js");
                const { scenesIn } = await import("/js/core/terrain/height.js");
                const map = game.world.maps[id];
                const { outlook, sky } = session.view;
                const placed = scenesIn(game.world.plan).find(({ scene }) => scene.id === "bellhaven");

                game.advance(0.1);

                return {
                    air: map.plan.some((row) => row.includes("_")),
                    outlook: Boolean(outlook),
                    doors: outlook ? outlookPoint(outlook, outlook.pivot[0], 0, outlook.pivot[1]).map((value, k) => Math.abs(value - [outlook.at[0], placed.base + keepFloor("bellhaven", 0, 4), outlook.at[1]][k]) < 1e-6) : null,
                    hollow: outlook?.hollow.box.join() === SCENERY.bellhaven.keep.shell.join(),
                    sky: sky.object.visible,
                    hole: game.far?.hole.value.z ?? null,
                    calls: session.view.renderer.info.render.calls,
                };
            }, keep.map);

            expect(seen).toEqual({ air: true, outlook: true, doors: [true, true, true], hollow: true, sky: true, hole: 0, calls: seen.calls });
            // (At High, the browser tests' quality: the floor's own, under 250 as above, and the
            // world seen past it, the far land's levels, the castle's far model and the horizon)
            expect(seen.calls).toBeLessThan(300);

            // Back out by its doors, to before them on the castle's court, its art there still
            const out = await page.evaluate(async ([door, castle]) => {
                const { game } = window.pellagos;
                const player = game.battle.actor("player");

                game.host.command("player", { type: "enter", link: door, run: true });

                for (let k = 0; k < 1200 && player.map !== castle; k++) {
                    game.advance(0.1, { render: false });
                }

                game.advance(0.1);

                return { map: player.map, art: game.interiors.get(castle)?.art ?? false, indoors: Boolean(window.pellagos.session.view.indoors), outlook: window.pellagos.session.view.outlook };
            }, [keep.door, tapped.map]);

            expect(out).toEqual({ map: tapped.map, art: licensed, indoors: false, outlook: null });

            // And back out by the bridge's foot, to its way in in the world: its art let go of
            const left = await page.evaluate(async ([door, id]) => {
                const { game } = window.pellagos;
                const { sceneryOf } = await import("/js/beasts/model.js");
                const player = game.battle.actor("player");

                game.host.command("player", { type: "enter", link: door, run: true });

                for (let k = 0; k < 1200 && player.map !== "town"; k++) {
                    game.advance(0.1, { render: false });
                }

                game.advance(0.1);

                const interior = game.interiors.get(id);

                return { map: player.map, indoors: window.pellagos.session.view.indoors, town: game.town.object.visible, art: interior?.art ?? false, read: Boolean(sceneryOf("scenery-bellhaven")) };
            }, [tapped.door, tapped.map]);

            expect(left).toEqual({ map: "town", indoors: false, town: true, art: false, read: false });
            expect(errors).toEqual([]);
        },
    );
}
