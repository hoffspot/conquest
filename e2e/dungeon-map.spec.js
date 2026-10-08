import { expect, test } from "./fixtures.js";

// The dungeon map (dungeon-map.html): a dungeon cooked up from a seed and a theme, drawn level by
// level. It exposes itself as window.dungeonMap, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

test("cooks up a dungeon for a seed and theme and draws each level, and another theme or seed", async ({ page }) => {
    await page.goto("/dungeon-map.html?seed=7&theme=caves&levels=2&tier=3");
    await page.waitForFunction(() => window.dungeonMap?.state.dungeon, null, { timeout: 60000 });
    await expect(page.locator("#status")).toBeHidden();
    await expect(page.locator("#counts")).toContainText("stairs down to level 2");
    await expect(page.locator("#levels button")).toHaveCount(2);

    const read = () =>
        page.evaluate(() => {
            const { state } = window.dungeonMap;
            const canvas = document.querySelector("#map");
            const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
            const colours = new Set();

            for (let k = 0; k < pixels.length; k += 4 * 97) {
                colours.add(`${pixels[k]},${pixels[k + 1]},${pixels[k + 2]}`);
            }

            return {
                seed: state.seed,
                theme: state.dungeon.theme,
                levels: state.dungeon.levels.length,
                level: state.level,
                name: state.dungeon.name,
                first: state.dungeon.levels[0].rows.join(""),
                colours: colours.size,
                address: location.search,
            };
        });

    const caves = await read();

    expect(caves).toMatchObject({ seed: 7, theme: "caves", levels: 2, level: 0 });
    expect(caves.address).toContain("theme=caves");
    expect(caves.colours).toBeGreaterThan(8);

    // The bottom level: the boss and its hoard
    await page.locator("#levels button", { hasText: "Level 2" }).click();
    await expect(page.locator("#counts")).toContainText("the boss:");
    expect((await read()).level).toBe(1);

    // Another theme: the same seed, another dungeon
    await page.locator("#theme").selectOption("ancient");

    const ancient = await read();

    expect(ancient.theme).toBe("ancient");
    expect(ancient.first).not.toBe(caves.first);
    await expect(page.locator("#name")).toHaveText(ancient.name);

    // Another seed
    await page.locator("#seed").fill("8");
    await page.locator("#seedform button[type=submit]").click();

    expect((await read()).seed).toBe(8);
});
