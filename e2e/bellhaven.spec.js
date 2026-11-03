import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";
import { expect, test } from "./fixtures.js";

// Bellhaven (core/scenery.js, world/scenery3d.js, docs/WORLD.md): a fixed scene's own map, gone
// into from a way in out in the world (set down by hand here, by the start: its landmark sets it in
// the world later), its art got ready at its door behind the readying card, drawn out of doors
// under the sky, each cell at its detail; walked over its bridge, and left, its art let go of.
// The game exposes itself as window.pellagos ({ game, session, fetcher, ... }), which these tests use.

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

// Its way in set down by the start, the player before it, and its door tapped: the readying card's
// state at once, and the castle's door
const tapIn = (page) =>
    page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { FACING } = await import("/js/core/interiors.js");
        const { squaresOf } = await import("/js/core/grid.js");
        const player = game.battle.actor("player");
        const squares = squaresOf(game.world.maps.town);
        const [sx, sy] = [Math.floor(player.x), Math.floor(player.y)];
        const open = (x, y) => !squares.blocked(x, y);
        const [x, y] = [...Array(30).keys()].map((k) => [sx + 3 + k, sy]).find(([ax, ay]) => open(ax, ay) && open(ax + 1, ay) && open(ax + 2, ay));
        const entrance = { inside: "scenery", scenery: "bellhaven", outside: [x, y], front: [[x + 1, y]], facing: FACING.w, door: { x: x + 2, z: y + 0.5, facing: FACING.w, width: 2, height: 3, floor: 0 } };
        const building = game.world.interiors.addSite({ site: { id: "bellhaven", kind: "bellhaven", name: "Bellhaven" }, entrance });

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6, x: x + 0.5, y: y + 0.5, path: [], order: null, progress: null, facing: FACING.e });

        for (let k = 0; k < 10; k++) {
            game.advance(0.05);
        }

        game.doors.sync();

        const target = game.doors.targets.find((each) => each.map === "town" && each.link.id === building.door.id);
        const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

        game.tap(spot.x, spot.y);

        return { key: building.key, door: building.door.id, running: game.running, card: !document.querySelector("#readying").hidden || game.readyingAt !== null };
    });

// Played on till the player's in the castle's map and its inside's built
const inside = (page) =>
    page.waitForFunction(
        () => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");

            if (game.running) {
                game.stop();
            }

            game.advance(0.1);

            return player.map === "site:bellhaven/grounds" && game.interiors.get(player.map)?.object.visible;
        },
        null,
        { timeout: 120000, polling: 100 },
    );

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
            ? "Bellhaven's way in tapped: its art got ready behind the readying card, the world stopped; gone into once it's read, drawn out of doors in its cells, a phone's draw calls; walked over its bridge to the keep's doors on its floor; left by its bridge's foot, its art let go of"
            : "Bellhaven without the licensed models: gone into all the same, its walk drawn in their place, walked and left",
        async ({ page }) => {
            test.skip(licensed && !licensedModelsHere(), LEFT_OUT);
            test.setTimeout(300000);

            if (!licensed) {
                await page.route(/\.bin(\?|$)/, (route) => route.abort());
            }

            const errors = await playing(page, "/?play&seed=1");
            const tapped = await tapIn(page);

            // (The world stopped while its art's got ready: the card up, saying what it's for)
            expect(tapped.running).toBe(false);
            await expect(page.locator("#readyingname")).toHaveText("Bellhaven");
            await expect(page.locator("#readyingnote")).toContainText("castle");
            await inside(page);

            const there = await looked(page);

            expect(there).toMatchObject({ indoors: false, sky: true, town: false, art: licensed });
            expect(there.far).toBeGreaterThan(100);
            expect(there.standing).toBeLessThan(0.3);
            expect(there.height).toBeGreaterThan(60);

            if (licensed) {
                expect(there.drawn.cells).toBeGreaterThan(4);
                expect(there.calls).toBeLessThan(220);
                expect(there.triangles).toBeLessThan(400000);
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

            expect(walked).toMatchObject({ there: true, map: "site:bellhaven/grounds" });
            expect(walked.off).toBeLessThan(0.5);

            const atKeep = await looked(page);

            expect(atKeep.height).toBeGreaterThan(78);

            if (licensed) {
                expect(atKeep.calls).toBeLessThan(220);
            }

            // And back out by the bridge's foot, to its way in in the world: its art let go of
            const left = await page.evaluate(async ([door]) => {
                const { game } = window.pellagos;
                const { sceneryOf } = await import("/js/beasts/model.js");
                const player = game.battle.actor("player");

                game.host.command("player", { type: "enter", link: door, run: true });

                for (let k = 0; k < 1200 && player.map !== "town"; k++) {
                    game.advance(0.1, { render: false });
                }

                game.advance(0.1);

                const interior = game.interiors.get("site:bellhaven/grounds");

                return { map: player.map, indoors: window.pellagos.session.view.indoors, town: game.town.object.visible, art: interior?.art ?? false, read: Boolean(sceneryOf("scenery-bellhaven")) };
            }, [tapped.door]);

            expect(left).toEqual({ map: "town", indoors: false, town: true, art: false, read: false });
            expect(errors).toEqual([]);
        },
    );
}
