import { expect, test } from "@playwright/test";

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

// Convert map tile coordinates to page coordinates, taking scrolling and scaling into account
function tileToPage(page, x, y) {
    return page.evaluate(([x, y]) => {
        const { renderer } = window.lastColony;
        const canvas = document.getElementById("gameforegroundcanvas");
        const rect = canvas.getBoundingClientRect();
        const scale = rect.width / canvas.offsetWidth;

        return { x: rect.left + (x * 20 - renderer.offsetX) * scale, y: rect.top + (y * 20 - renderer.offsetY) * scale };
    }, [x, y]);
}

async function clickTile(page, x, y, options) {
    const point = await tileToPage(page, x, y);

    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y, options);
}

test("the campaign starts with a briefing and the first mission", async ({ page }) => {
    await openGame(page);

    await page.getByRole("button", { name: "Campaign" }).click();
    await expect(page.locator("#missionbriefing")).toContainText("In the months since the great war");

    await page.getByRole("button", { name: "Enter mission" }).click();
    await expect(page.locator("#gameinterfacescreen")).toBeVisible();

    // The operator calls in after three seconds of game time
    await expect(page.locator("#gamemessages")).toContainText("We haven't heard from the last convoy", { timeout: 10000 });
    await expect(page.locator("#callerpicture img")).toHaveAttribute("alt", "Operator");

    // The view starts over the player's base (at tile 55, 6)
    const view = await page.evaluate(() => {
        const { offsetX, offsetY, width, height } = window.lastColony.renderer;

        return { offsetX, offsetY, width, height };
    });

    expect(55 * 20).toBeGreaterThanOrEqual(view.offsetX);
    expect(57 * 20).toBeLessThanOrEqual(view.offsetX + view.width);
    expect(6 * 20).toBeLessThan(view.offsetY + view.height);
});

test("units can be selected and ordered around, and the game can be paused", async ({ page }) => {
    await openGame(page);
    await page.getByRole("button", { name: "Campaign" }).click();
    await page.getByRole("button", { name: "Enter mission" }).click();

    // Click the hero tank to select it, then right click the ground to move it
    await clickTile(page, 57, 12.2);
    await expect.poll(() => page.evaluate(() => window.lastColony.game.selectedItems.map((item) => item.uid))).toEqual([-1]);

    await clickTile(page, 56, 17, { button: "right" });
    expect(await page.evaluate(() => window.lastColony.game.getItemByUid(-1).orders.type)).toBe("move");

    // P pauses the game
    await page.keyboard.press("p");
    const pausedAt = await page.evaluate(() => window.lastColony.game.tick);

    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.lastColony.game.tick)).toBe(pausedAt);

    await page.keyboard.press("p");
    await expect.poll(() => page.evaluate(() => window.lastColony.game.tick)).toBeGreaterThan(pausedAt);
});

test("touch screens: tap to select, double tap to give orders", async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 915, height: 412 } });
    const page = await context.newPage();

    await openGame(page);
    await page.locator("#campaignbutton").tap();
    await page.locator("#entermission").tap();

    const hero = await tileToPage(page, 57, 12.2);

    await page.touchscreen.tap(hero.x, hero.y);
    await expect.poll(() => page.evaluate(() => window.lastColony.game.selectedItems.map((item) => item.uid))).toEqual([-1]);

    const ground = await tileToPage(page, 56, 17);

    await page.touchscreen.tap(ground.x, ground.y);
    await page.touchscreen.tap(ground.x, ground.y);
    await expect.poll(() => page.evaluate(() => window.lastColony.game.getItemByUid(-1).orders.type)).toBe("move");

    await context.close();
});

test("buildings and units can be constructed", async ({ page }) => {
    await openGame(page);

    // Jump straight to the second mission, which allows construction
    await page.evaluate(() => {
        const app = window.lastColony;

        app.singleplayer.currentLevel = 1;
        app.singleplayer.initLevel();
    });
    await page.getByRole("button", { name: "Enter mission" }).click();
    await page.evaluate(() => {
        window.lastColony.game.cash.blue = 5000;
    });

    // Select the base: only the building buttons become available
    await clickTile(page, 56, 7);
    await expect(page.locator("#ground-turret")).toBeEnabled();
    await expect(page.locator("#scout-tank")).toBeDisabled();

    // Place a turret next to the base
    await page.locator("#ground-turret").click();
    await clickTile(page, 54.5, 4.5);
    await expect.poll(() => page.evaluate(() => window.lastColony.game.cash.blue)).toBe(3500);
    expect(await page.evaluate(() => window.lastColony.game.buildings.some((item) => item.name === "ground-turret" && item.x === 54 && item.y === 4))).toBe(true);

    // Building on top of the base is refused
    await clickTile(page, 56, 7);
    await page.locator("#ground-turret").click();
    await clickTile(page, 56, 7);
    await expect(page.locator("#gamemessages")).toContainText("Cannot deploy building here");

    // Right click cancels placement
    await clickTile(page, 56, 7, { button: "right" });
    expect(await page.evaluate(() => window.lastColony.sidebar.deployBuilding)).toBeUndefined();
});

test("two players can play a multiplayer game", async ({ browser }) => {
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
        await expect.poll(() => page.evaluate(() => window.lastColony.game.tick)).toBeGreaterThan(5);
    }

    expect(await blue.evaluate(() => window.lastColony.game.team)).toBe("blue");
    expect(await green.evaluate(() => window.lastColony.game.team)).toBe("green");

    // Record the simulation state at every tick on both clients and check that they match
    const recordStates = (page) => page.evaluate(() => {
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
    await blue.evaluate(() => {
        const { game } = window.lastColony;

        game.sendCommand(game.items.filter((item) => item.team === "blue" && item.canAttack).map((item) => item.uid), { type: "move", to: { x: 30, y: 20 } });
    });

    await blue.waitForTimeout(2000);

    const [blueStates, greenStates] = await Promise.all(players.map((page) => page.evaluate(() => window.states)));
    const commonTicks = Object.keys(blueStates).filter((tick) => tick in greenStates);

    expect(commonTicks.length).toBeGreaterThan(5);

    for (const tick of commonTicks) {
        expect(greenStates[tick], `tick ${tick}`).toBe(blueStates[tick]);
    }

    // Chat
    await blue.keyboard.press("Enter");
    await blue.keyboard.type("good luck");
    await blue.keyboard.press("Enter");
    await expect(green.locator("#gamemessages")).toContainText("blue: good luck");

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
