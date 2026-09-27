import { expect, test } from "@playwright/test";

// The town map (town-map.html): a village, town or city laid out from a seed, drawn. It exposes
// itself as window.townMap, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

test("lays out a town for a seed and draws it, and a village or a city, or another seed", async ({ page }) => {
    await page.goto("/town-map.html?seed=5&kind=town");
    await page.waitForFunction(() => window.townMap?.state.town, null, { timeout: 60000 });
    await expect(page.locator("#status")).toBeHidden();
    await expect(page.locator("#counts")).toContainText("houses");
    await expect(page.locator("#counts")).toContainText("tavern");

    const read = () =>
        page.evaluate(() => {
            const { state } = window.townMap;
            const canvas = document.querySelector("#map");
            const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
            const colours = new Set();

            for (let k = 0; k < pixels.length; k += 4 * 89) {
                colours.add(`${pixels[k]},${pixels[k + 1]},${pixels[k + 2]}`);
            }

            return {
                seed: state.seed,
                kind: state.kind,
                width: state.town.width,
                houses: state.town.pieces.filter(({ kind }) => kind === "house").length,
                first: state.town.pieces[0],
                colours: colours.size,
                address: location.search,
            };
        });

    const town = await read();

    expect(town).toMatchObject({ seed: 5, kind: "town", width: 132, address: "?seed=5&kind=town" });
    expect(town.houses).toBeGreaterThan(20);
    expect(town.colours).toBeGreaterThan(8);

    // A city is bigger, with more houses
    await page.locator("#kind").selectOption("city");

    const city = await read();

    expect(city).toMatchObject({ kind: "city", width: 204, address: "?seed=5&kind=city" });
    expect(city.houses).toBeGreaterThan(town.houses);

    // Another seed, another town
    await page.locator("#kind").selectOption("town");
    await page.locator("#seed").fill("6");
    await page.locator("#seedform button[type=submit]").click();

    const other = await read();

    expect(other.seed).toBe(6);
    expect(other.first).not.toEqual(town.first);
});
