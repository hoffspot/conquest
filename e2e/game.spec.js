import { devices, expect, test } from "@playwright/test";

// The game exposes itself as window.lastColony for debugging, which these tests use to inspect state

// Fail the test on any uncaught error in the page
test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function openGame(page) {
    await page.goto("/");
    await expect(page.locator("#gamestartscreen")).toBeVisible();
    // Wait for the sprites and sounds to finish loading
    await expect(page.locator("#loadingscreen")).toBeHidden();
}

// Convert map tile coordinates to page coordinates, taking scrolling and zoom into account
function tileToPage(page, x, y) {
    return page.evaluate(([x, y]) => {
        const { camera } = window.lastColony;
        const rect = document.getElementById("gameforegroundcanvas").getBoundingClientRect();
        const point = camera.worldToScreen(x * 20, y * 20);

        return { x: rect.left + point.x, y: rect.top + point.y };
    }, [x, y]);
}

async function clickTile(page, x, y, options) {
    const point = await tileToPage(page, x, y);

    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y, options);
}

const game = (page, fn, arg) => page.evaluate(fn, arg);

// Keep the mission's story messages (which pause the game until read) from interrupting a test
function silenceMission(page) {
    return game(page, () => {
        window.lastColony.game.triggers.pending = [];
    });
}

const tick = (page) => game(page, () => window.lastColony.game.tick);

test.describe("desktop", () => {
    test("the campaign starts with a briefing and the first mission", async ({ page }) => {
        await openGame(page);

        await page.getByRole("button", { name: "Campaign" }).click();
        await expect(page.locator("#missionbriefing")).toContainText("In the months since the great war");

        await page.getByRole("button", { name: "Enter mission" }).click();
        await expect(page.locator("#gameinterfacescreen")).toBeVisible();

        // The operator calls in after three seconds of game time, and the game waits until the
        // message has been read
        const operator = page.getByRole("dialog", { name: "Operator" });

        await expect(operator).toContainText("We haven't heard from the last convoy", { timeout: 10000 });

        const pausedAt = await tick(page);

        await page.waitForTimeout(400);
        expect(await tick(page)).toBe(pausedAt);

        await operator.getByRole("button", { name: "Continue" }).click();
        await expect(operator).toBeHidden();
        await expect.poll(() => tick(page)).toBeGreaterThan(pausedAt);

        // The view starts over the player's base (at tile 55, 6)
        const view = await game(page, () => {
            const { offsetX, offsetY, width, height } = window.lastColony.camera;

            return { offsetX, offsetY, width, height };
        });

        expect(55 * 20).toBeGreaterThanOrEqual(view.offsetX);
        expect(57 * 20).toBeLessThanOrEqual(view.offsetX + view.width);
        expect(6 * 20).toBeLessThan(view.offsetY + view.height);
    });

    test("units can be selected and ordered around, the view zoomed, and the game paused", async ({ page }) => {
        await openGame(page);
        await page.getByRole("button", { name: "Campaign" }).click();
        await page.getByRole("button", { name: "Enter mission" }).click();
        await silenceMission(page);

        // Click the hero tank to select it, then right click the ground to move it
        await clickTile(page, 57, 12.2);
        await expect.poll(() => game(page, () => window.lastColony.game.selectedItems.map((item) => item.uid))).toEqual([-1]);

        await clickTile(page, 56, 14, { button: "right" });
        expect(await game(page, () => window.lastColony.game.getItemByUid(-1).orders.type)).toBe("move");

        // The mouse wheel zooms around the pointer
        const zoom = await game(page, () => window.lastColony.camera.zoom);

        await page.mouse.wheel(0, -300);
        await expect.poll(() => game(page, () => window.lastColony.camera.zoom)).toBeGreaterThan(zoom);

        // P pauses the game and opens the menu
        await page.keyboard.press("p");
        await expect(page.locator("#pausescreen")).toBeVisible();

        const pausedAt = await game(page, () => window.lastColony.game.tick);

        await page.waitForTimeout(500);
        expect(await game(page, () => window.lastColony.game.tick)).toBe(pausedAt);

        await page.getByRole("button", { name: "Resume" }).click();
        await expect.poll(() => game(page, () => window.lastColony.game.tick)).toBeGreaterThan(pausedAt);
    });

    test("buildings and units can be constructed", async ({ page }) => {
        await openGame(page);

        // Jump straight to the second mission, which allows construction
        await game(page, () => {
            const app = window.lastColony;

            app.singleplayer.currentLevel = 1;
            app.singleplayer.initLevel();
        });
        await page.getByRole("button", { name: "Enter mission" }).click();
        await silenceMission(page);
        await game(page, () => {
            window.lastColony.game.cash.blue = 5000;
        });

        // Select the base: only the building buttons become available
        await clickTile(page, 56, 7);
        await expect(page.locator("#ground-turret")).toBeEnabled();
        await expect(page.locator("#scout-tank")).toBeDisabled();
        await expect(page.locator("#ground-turret")).toContainText("1,500");

        // Place a turret next to the base
        await page.locator("#ground-turret").click();
        await clickTile(page, 54.5, 4.5);
        await expect.poll(() => game(page, () => window.lastColony.game.cash.blue)).toBe(3500);
        expect(await game(page, () => window.lastColony.game.buildings.some((item) => item.name === "ground-turret" && item.x === 54 && item.y === 4))).toBe(true);

        // Building on top of the base is refused
        await clickTile(page, 56, 7);
        await page.locator("#ground-turret").click();
        await clickTile(page, 56, 7);
        await expect(page.locator("#gamemessages")).toContainText("Cannot deploy building here");

        // Right click cancels placement
        await clickTile(page, 56, 7, { button: "right" });
        expect(await game(page, () => window.lastColony.sidebar.deployBuilding)).toBeUndefined();
    });

    test("messages from the mission's characters wait for the player, one at a time", async ({ page }) => {
        await openGame(page);
        await page.getByRole("button", { name: "Campaign" }).click();
        await page.getByRole("button", { name: "Enter mission" }).click();
        await silenceMission(page);

        // Two messages at once are shown one after the other
        await game(page, () => {
            window.lastColony.game.showMessage("driver", "Can anyone hear us?");
            window.lastColony.game.showMessage("pilot", "Hang tight. I'm on my way.");
        });
        await expect(page.getByRole("dialog", { name: "Driver" })).toContainText("Can anyone hear us?");

        const pausedAt = await tick(page);

        // The pause menu opens on top; resuming returns to the message, and the game still waits
        await page.keyboard.press("p");
        await expect(page.locator("#pausescreen")).toBeVisible();
        await page.getByRole("button", { name: "Resume" }).click();
        await expect(page.getByRole("dialog", { name: "Driver" })).toBeVisible();
        await page.waitForTimeout(400);
        expect(await tick(page)).toBe(pausedAt);

        // Enter continues to the next message, and the last one resumes the game
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog", { name: "Pilot" })).toContainText("Hang tight. I'm on my way.");
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.locator("#transmissionscreen")).toBeHidden();
        await expect.poll(() => tick(page)).toBeGreaterThan(pausedAt);

        // Status messages appear over the map without pausing. Older ones that no longer fit are
        // removed whole instead of being cut off.
        await game(page, () => {
            for (const message of ["Sound off.", "Sound on.", "Warning! Cannot deploy building here. ".repeat(3)]) {
                window.lastColony.game.showMessage("system", message);
            }
        });
        await expect(page.locator("#gamemessages")).toContainText("Warning! Cannot deploy building here.");
        await expect(page.locator("#transmissionscreen")).toBeHidden();

        const cutOff = await game(page, () => {
            const panel = document.getElementById("gamemessages").getBoundingClientRect();

            return [...document.getElementById("gamemessages").children].some((line) => {
                const { top, bottom } = line.getBoundingClientRect();

                return top < panel.top || bottom > panel.bottom;
            });
        });

        expect(cutOff).toBe(false);
    });

    test("the minimap moves the view", async ({ page }) => {
        await openGame(page);
        await page.getByRole("button", { name: "Campaign" }).click();
        await page.getByRole("button", { name: "Enter mission" }).click();
        await silenceMission(page);

        const minimap = await page.locator("#minimap").boundingBox();

        // The left edge of the minimap is the left edge of the map
        await page.mouse.click(minimap.x + 3, minimap.y + minimap.height / 2);
        await expect.poll(() => game(page, () => window.lastColony.camera.offsetX)).toBe(0);
    });
});

test.describe("3D units", () => {
    const nextFrames = (page) => game(page, () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    // A fingerprint of the pixels around the hero tank on the map
    function pixelsAroundHero(page) {
        return game(page, () => {
            const { camera, game: { items } } = window.lastColony;
            const tank = items.find((item) => item.uid === -1);
            const canvas = document.getElementById("gameforegroundcanvas");
            const ratio = canvas.width / canvas.getBoundingClientRect().width;
            const center = camera.worldToScreen(tank.x * 20, tank.y * 20);
            const size = Math.round(40 * camera.zoom * ratio);
            const { data } = canvas.getContext("2d").getImageData(Math.round(center.x * ratio - size / 2), Math.round(center.y * ratio - size / 2), size, size);
            let hash = 0;

            for (const value of data) {
                hash = (hash * 31 + value) % 1000000007;
            }

            return hash;
        });
    }

    test("units and buildings are drawn as 3D models", async ({ page }) => {
        await openGame(page);
        await page.getByRole("button", { name: "Campaign" }).click();
        await page.getByRole("button", { name: "Enter mission" }).click();
        await silenceMission(page);

        const drawnIn3D = () => game(page, () => {
            const { renderer, game: { items } } = window.lastColony;

            return items.filter((item) => renderer.units3d?.has(item)).map((item) => `${item.type}/${item.name}`).sort();
        });

        // The hero's tank and the base start in view (enemy patrols may be in view too)
        await expect.poll(drawnIn3D).toEqual(expect.arrayContaining(["buildings/base", "vehicles/heavy-tank"]));

        // The 3D model replaces the sprite, and draws the same way every time
        await game(page, () => {
            window.lastColony.loop.paused = true;
        });
        await nextFrames(page);

        const in3D = await pixelsAroundHero(page);

        await game(page, () => {
            const { renderer } = window.lastColony;

            window.units3d = renderer.units3d;
            renderer.units3d = undefined;
        });
        await nextFrames(page);
        expect(await pixelsAroundHero(page)).not.toBe(in3D);

        await game(page, () => {
            window.lastColony.renderer.units3d = window.units3d;
        });
        await nextFrames(page);
        expect(await pixelsAroundHero(page)).toBe(in3D);
    });

    test("without WebGL, units are drawn as sprites", async ({ page }) => {
        await page.addInitScript(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;

            HTMLCanvasElement.prototype.getContext = function (type, ...options) {
                return type.startsWith("webgl") ? null : getContext.call(this, type, ...options);
            };
        });

        await openGame(page);
        await page.getByRole("button", { name: "Campaign" }).click();
        await page.getByRole("button", { name: "Enter mission" }).click();
        await silenceMission(page);

        expect(await game(page, () => window.lastColony.renderer.units3d)).toBeUndefined();
        await expect.poll(() => tick(page)).toBeGreaterThan(5);
    });
});

test.describe("multiplayer", () => {
    test("two players can play a game", async ({ browser }) => {
        const players = [];

        for (let i = 0; i < 2; i++) {
            const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();

            page.on("pageerror", (error) => {
                throw error;
            });

            await openGame(page);
            await page.getByRole("button", { name: "Multiplayer" }).click();
            await expect(page.locator("#multiplayerlobbyscreen")).toBeVisible();
            players.push(page);
        }

        const [blue, green] = players;
        // Use a room that the other tests are not using
        const room = (page) => page.locator("#multiplayergameslist li").nth(7);

        await room(blue).click();
        await blue.getByRole("button", { name: "Join" }).click();
        await expect(room(green)).toContainText("Waiting for second player");

        await room(green).click();
        await green.getByRole("button", { name: "Join" }).click();

        for (const page of players) {
            await expect(page.locator("#gameinterfacescreen")).toBeVisible();
            await expect.poll(() => game(page, () => window.lastColony.game.tick)).toBeGreaterThan(5);
        }

        expect(await game(blue, () => window.lastColony.game.team)).toBe("blue");
        expect(await game(green, () => window.lastColony.game.team)).toBe("green");

        // Record the simulation state at every tick on both clients and check that they match
        const recordStates = (page) => game(page, () => {
            const { game } = window.lastColony;
            const update = game.update.bind(game);

            window.states = {};
            game.update = () => {
                update();
                window.states[game.tick] = JSON.stringify(game.items.map((item) => [item.uid, item.x, item.y, item.life]));
            };
        });

        await Promise.all(players.map(recordStates));

        // Blue sends its tanks to the middle of the map
        await game(blue, () => {
            const { game } = window.lastColony;

            game.sendCommand(game.items.filter((item) => item.team === "blue" && item.canAttack).map((item) => item.uid), { type: "move", to: { x: 30, y: 20 } });
        });

        await blue.waitForTimeout(2000);

        const [blueStates, greenStates] = await Promise.all(players.map((page) => game(page, () => window.states)));
        const commonTicks = Object.keys(blueStates).filter((tick) => tick in greenStates);

        expect(commonTicks.length).toBeGreaterThan(5);

        for (const tick of commonTicks) {
            expect(greenStates[tick], `tick ${tick}`).toBe(blueStates[tick]);
        }

        // Chat, from the keyboard and from the chat button
        await blue.keyboard.press("Enter");
        await blue.keyboard.type("good luck");
        await blue.keyboard.press("Enter");
        await expect(green.locator("#gamemessages")).toContainText("blue: good luck");

        await green.getByRole("button", { name: "Chat" }).click();
        await green.keyboard.type("thanks");
        await green.keyboard.press("Enter");
        await expect(blue.locator("#gamemessages")).toContainText("green: thanks");

        // When one player leaves, the other is told and returns to the menu
        await green.close();
        await expect(blue.locator("#messageboxtext")).toContainText("The green player has been disconnected.");
        await blue.getByRole("button", { name: "OK" }).click();
        await expect(blue.locator("#gamestartscreen")).toBeVisible();
    });

    test("the lobby reports when the server cannot be reached", async ({ page }) => {
        await page.goto("/?server=ws://localhost:1");
        await expect(page.locator("#loadingscreen")).toBeHidden();

        await page.getByRole("button", { name: "Multiplayer" }).click();
        await expect(page.locator("#messageboxtext")).toContainText("Error connecting to multiplayer server.");
        await page.getByRole("button", { name: "OK" }).click();
        await expect(page.locator("#gamestartscreen")).toBeVisible();
    });

    test("copies of the game without a server (GitHub Pages) only offer the campaign", async ({ page }) => {
        // What the Pages workflow publishes
        await page.route("**/js/app/hosting.js", (route) => route.fulfill({
            contentType: "text/javascript",
            body: "export const MULTIPLAYER_SERVER = null;\n",
        }));
        await page.goto("/");
        await expect(page.locator("#loadingscreen")).toBeHidden();

        await expect(page.getByRole("button", { name: "Campaign" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Multiplayer" })).toBeHidden();
    });
});

test.describe("phone (iPhone 16 Pro, landscape)", () => {
    // eslint-disable-next-line no-unused-vars
    const { defaultBrowserType, ...iPhone } = devices["iPhone 16 Pro landscape"];

    test.use(iPhone);

    // Like Safari on iPhone, which only lets videos go full screen. (Newer headless Chromium really
    // goes full screen when a mission starts, and a full screen window can't be resized.)
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => false });
        });
    });

    // Multi-finger gestures are sent through the Chrome DevTools Protocol
    async function touchScreen(page) {
        const cdp = await page.context().newCDPSession(page);
        const send = (type, points) => cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map(([x, y], id) => ({ x, y, id })),
        });

        return {
            async drag(from, to, { holdMs = 0, steps = 8 } = {}) {
                await send("touchStart", [[from.x, from.y]]);

                if (holdMs) {
                    await page.waitForTimeout(holdMs);
                }

                for (let i = 1; i <= steps; i++) {
                    await send("touchMove", [[from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps]]);
                }

                await send("touchEnd", []);
            },
            async pinch(center, fromGap, toGap) {
                const at = (gap) => [[center.x - gap / 2, center.y], [center.x + gap / 2, center.y]];

                await send("touchStart", at(fromGap));

                for (let i = 1; i <= 8; i++) {
                    await send("touchMove", at(fromGap + (toGap - fromGap) * i / 8));
                }

                await send("touchEnd", []);
            },
        };
    }

    async function startMission(page, level = 0) {
        await openGame(page);

        if (level > 0) {
            await game(page, (level) => {
                window.lastColony.singleplayer.currentLevel = level;
                window.lastColony.singleplayer.initLevel();
            }, level);
        } else {
            await page.locator("#campaignbutton").tap();
        }

        await page.locator("#entermission").tap();
        await expect(page.locator("#gameinterfacescreen")).toBeVisible();
        await silenceMission(page);
    }

    test("the game fills the screen with touch-sized controls", async ({ page }) => {
        await startMission(page);

        const layout = await game(page, () => {
            const rect = (id) => document.getElementById(id).getBoundingClientRect();

            return {
                viewport: { width: innerWidth, height: innerHeight },
                map: rect("maparea"),
                sidebar: rect("sidebar"),
                menu: rect("menubutton"),
                build: rect("starport"),
                zoom: window.lastColony.camera.zoom,
            };
        });

        // The map and the sidebar share the whole screen
        expect(layout.map.left).toBe(0);
        expect(Math.round(layout.map.right)).toBe(Math.round(layout.sidebar.left));
        expect(Math.round(layout.sidebar.right)).toBe(layout.viewport.width);
        expect(layout.map.height).toBe(layout.viewport.height);

        // Buttons are big enough for fingers, and units are drawn larger than on desktop
        expect(layout.menu.width).toBeGreaterThanOrEqual(44);
        expect(layout.build.width).toBeGreaterThanOrEqual(44);
        expect(layout.zoom).toBeGreaterThanOrEqual(1.3);

        // The hero tank is drawn in 3D
        await expect.poll(() => game(page, () => {
            const { renderer, game: { items } } = window.lastColony;

            return renderer.units3d?.has(items.find((item) => item.uid === -1));
        })).toBe(true);
    });

    test("tap to select and move, drag to scroll, pinch to zoom", async ({ page }) => {
        await startMission(page);
        const touch = await touchScreen(page);

        // Tap the hero tank, then tap the ground: one tap each
        const hero = await tileToPage(page, 57, 12.2);

        await page.touchscreen.tap(hero.x, hero.y);
        await expect.poll(() => game(page, () => window.lastColony.game.selectedItems.map((item) => item.uid))).toEqual([-1]);

        // Open ground just left of the hero, which is always in view
        const ground = await tileToPage(page, 55, 12.7);

        await page.touchscreen.tap(ground.x, ground.y);
        expect(await game(page, () => window.lastColony.game.getItemByUid(-1).orders.type)).toBe("move");

        // The deselect button clears the selection
        await page.locator("#deselectbutton").tap();
        expect(await game(page, () => window.lastColony.game.selectedItems.length)).toBe(0);

        // One finger drags the map
        const before = await game(page, () => window.lastColony.camera.offsetX);

        await touch.drag({ x: 150, y: 200 }, { x: 400, y: 200 });
        expect(await game(page, () => window.lastColony.camera.offsetX)).toBeLessThan(before - 100);

        // Two fingers zoom
        const zoom = await game(page, () => window.lastColony.camera.zoom);

        await touch.pinch({ x: 300, y: 180 }, 100, 250);
        expect(await game(page, () => window.lastColony.camera.zoom)).toBeGreaterThan(zoom * 1.5);
    });

    test("touch and hold, then drag, to select units", async ({ page }) => {
        await startMission(page);
        const touch = await touchScreen(page);

        const hero = await game(page, () => {
            const { x, y } = window.lastColony.game.getItemByUid(-1);

            return { x, y };
        });
        const from = await tileToPage(page, hero.x - 2, hero.y - 2);
        const to = await tileToPage(page, hero.x + 2, hero.y + 2);

        await touch.drag(from, to, { holdMs: 500 });

        expect(await game(page, () => window.lastColony.game.selectedItems.map((item) => item.uid))).toEqual([-1]);
    });

    test("buildings are placed by tapping the map and confirming", async ({ page }) => {
        await startMission(page, 1);
        await game(page, () => {
            window.lastColony.game.cash.blue = 5000;
        });

        const base = await tileToPage(page, 56, 7);

        await page.touchscreen.tap(base.x, base.y);
        await page.locator("#ground-turret").tap();
        await expect(page.locator("#placebutton")).toBeVisible();

        const spot = await tileToPage(page, 54.5, 4.5);

        await page.touchscreen.tap(spot.x, spot.y);
        await expect(page.locator("#placebutton")).toBeEnabled();
        await page.locator("#placebutton").tap();

        await expect.poll(() => game(page, () => window.lastColony.game.cash.blue)).toBe(3500);
        await expect(page.locator("#placebutton")).toBeHidden();
    });

    test("messages from the mission's characters fit the screen and wait for a tap", async ({ page }) => {
        await startMission(page);

        // The campaign's longest message fits without scrolling
        await game(page, () => window.lastColony.game.showMessage("driver", "Commander!! The colony has sent some extra supplies. We are coming in from the North East sector through rebel territory. We could use a little protection."));

        const dialog = page.getByRole("dialog", { name: "Driver" });
        const measure = () => game(page, () => {
            const text = document.getElementById("transmissiontext");
            const box = document.getElementById("transmission").getBoundingClientRect();
            const button = document.getElementById("transmissioncontinue").getBoundingClientRect();

            return {
                scrolls: text.scrollHeight > text.clientHeight,
                moreToRead: text.classList.contains("more"),
                onScreen: box.top >= 0 && box.bottom <= innerHeight && button.bottom <= innerHeight,
            };
        });

        await expect(dialog).toContainText("We could use a little protection.");
        expect(await measure()).toEqual({ scrolls: false, moreToRead: false, onScreen: true });

        const pausedAt = await tick(page);

        await page.waitForTimeout(400);
        expect(await tick(page)).toBe(pausedAt);
        await dialog.getByRole("button", { name: "Continue" }).tap();
        await expect(dialog).toBeHidden();
        await expect.poll(() => tick(page)).toBeGreaterThan(pausedAt);

        // A message too long for the screen scrolls, with Continue still in view
        await game(page, () => window.lastColony.game.showMessage("op", "A very long report from the operator. ".repeat(40)));
        await expect(page.getByRole("dialog", { name: "Operator" })).toBeVisible();
        expect(await measure()).toEqual({ scrolls: true, moreToRead: true, onScreen: true });

        await game(page, () => {
            const text = document.getElementById("transmissiontext");

            text.scrollTop = text.scrollHeight;
        });
        await expect.poll(async () => (await measure()).moreToRead).toBe(false);
        await page.getByRole("button", { name: "Continue" }).tap();
        await expect(page.locator("#transmissionscreen")).toBeHidden();
    });

    test("the game asks to be turned sideways and pauses in portrait", async ({ page }) => {
        await startMission(page);

        await page.setViewportSize({ width: 402, height: 681 });
        await expect(page.locator("#rotatescreen")).toBeVisible();

        const tick = await game(page, () => window.lastColony.game.tick);

        await page.waitForTimeout(400);
        expect(await game(page, () => window.lastColony.game.tick)).toBe(tick);

        // Back in landscape the game waits, paused, for the player to resume
        await page.setViewportSize({ width: 756, height: 352 });
        await expect(page.locator("#rotatescreen")).toBeHidden();
        await expect(page.locator("#pausescreen")).toBeVisible();
        await page.locator("#resumebutton").tap();
        await expect.poll(() => game(page, () => window.lastColony.game.tick)).toBeGreaterThan(tick);
    });
});
