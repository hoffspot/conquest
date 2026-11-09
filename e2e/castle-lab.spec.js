import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";
import { expect, test } from "./fixtures.js";

// The castle lab (castle-lab.html): Bellhaven, the White Castle, drawn as the game draws the world
// out of doors, walked from its bridge to the keep's doors, with what it costs. It exposes itself
// as window.castleLab, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

// (A few more frames drawn: what's shown has caught up with where the walker's been put)
async function settle(page) {
    const from = await page.evaluate(() => window.castleLab.frame ?? 0);

    await page.waitForFunction((at) => (window.castleLab.frame ?? 0) >= at + 3, from, { timeout: 120000 });
}

test("draws the castle in its cells, walked from the bridge to the keep's doors, in a phone's draw calls, and measures the walk", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(480000);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto("/castle-lab.html");
    await page.waitForFunction(() => window.castleLab?.ready, null, { timeout: 180000 });

    const lab = await page.evaluate(() => ({ art: window.castleLab.art, cells: window.castleLab.cells, path: window.castleLab.path }));

    expect(lab).toEqual({ art: true, cells: 98, path: expect.any(Number) });
    expect(lab.path).toBeGreaterThan(400);

    // At the gate and at the keep's doors: the cells round it at their nearest detail, the rest
    // far off in blocks, the shadows cast by a stand-in a block
    for (const share of [0.75, 0.98]) {
        await page.evaluate((at) => window.castleLab.goTo(at), share);
        await settle(page);

        const seen = await page.evaluate(() => ({ calls: window.castleLab.calls, triangles: window.castleLab.triangles, near: window.castleLab.drawn().filter((cell) => cell.level === 0).length }));

        expect(seen.near).toBeGreaterThan(4);
        expect(seen.calls).toBeLessThan(180);
        expect(seen.triangles).toBeLessThan(300000);
    }

    // The walk measured: begun, and carried on to its end
    await page.locator("#run").click();
    await page.evaluate(() => window.castleLab.goTo(0.995));
    await page.waitForFunction(() => window.castleLab.run, null, { timeout: 120000 });

    const run = await page.evaluate(() => window.castleLab.run);

    expect(run.frames).toBeGreaterThan(0);
    expect(run.drawCalls.most).toBeGreaterThan(0);
    expect(run.casters).toBe("proxy");
    await expect(page.locator("#result")).toContainText("frameMs");
});

test("without the licensed models, draws the castle's walk instead, a block a square, and walks it all the same", async ({ page }) => {
    // (The castle's files not there, as for a copy of the game without them)
    await page.route("**/models/scenery/**", (route) => (route.request().url().includes(".bin") ? route.abort() : route.continue()));
    await page.goto("/castle-lab.html");
    await page.waitForFunction(() => window.castleLab?.ready, null, { timeout: 120000 });

    const lab = await page.evaluate(() => ({ art: window.castleLab.art, squares: window.castleLab.squares, path: window.castleLab.path }));

    expect(lab.art).toBe(false);
    expect(lab.squares).toEqual([30027]);
    expect(lab.path).toBeGreaterThan(400);
    await expect(page.locator("#status")).toContainText("No licensed models here");
});
