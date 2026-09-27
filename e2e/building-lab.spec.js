import { expect, test } from "@playwright/test";

// The building lab (building-lab.html): a street of every style of house, or a whole town, built
// in 3D from a seed. It exposes itself as window.buildingLab, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

test("builds a street of every style of house in a few draw calls, and the town", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&show=street");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });
    await expect(page.locator("#status")).toBeHidden();

    const street = await page.evaluate(() => window.buildingLab.state.stats);

    // Twenty houses (and the ground), drawn with the art's one material: a handful of draw calls
    // for tens of thousands of triangles
    expect(street.pieces).toBe(20);
    expect(street.triangles).toBeGreaterThan(20000);
    expect(street.calls).toBeLessThan(30);

    await page.locator("#show").selectOption("town");
    await page.waitForFunction(() => window.buildingLab.state.ready && window.buildingLab.state.stats.pieces !== 20, null, { timeout: 120000 });

    const town = await page.evaluate(() => ({ ...window.buildingLab.state.stats, address: location.search }));

    expect(town.pieces).toBeGreaterThan(20);
    expect(town.address).toBe("?seed=7&show=town");
});
