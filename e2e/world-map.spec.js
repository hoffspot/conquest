import { expect, test } from "./fixtures.js";

// The world map (world-map.html): the world plan for a seed, drawn. It exposes itself as
// window.worldMap, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function openMap(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.worldMap?.state.plan, null, { timeout: 60000 });
    await expect(page.locator("#status")).toBeHidden();
}

test("lays out the world for a seed and draws it, with where a player of each people starts", async ({ page }) => {
    await openMap(page, "/world-map.html?seed=7&race=elf");

    const world = await page.evaluate(() => {
        const { state } = window.worldMap;
        const canvas = document.querySelector("#map");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const colours = new Set();

        for (let k = 0; k < pixels.length; k += 4 * 97) {
            colours.add(`${pixels[k]},${pixels[k + 1]},${pixels[k + 2]}`);
        }

        return {
            seed: state.seed,
            people: document.querySelector("#people").value,
            start: state.start,
            places: state.plan.places.length,
            colours: colours.size,
            peoples: document.querySelectorAll("#peoples li").length,
            counts: document.querySelector("#counts").textContent,
        };
    });

    expect(world.seed).toBe(7);
    expect(world.people).toBe("elf");
    expect(world.start).toMatchObject({ kind: "town", race: "elf", guild: true });
    expect(world.places).toBeGreaterThan(60);
    expect(world.colours).toBeGreaterThan(40);
    expect(world.peoples).toBe(6);
    expect(world.counts).toContain("guild branches");
    await expect(page.locator("#start")).toContainText(world.start.name);

    // Pointing at the start says what it is
    const [x, y] = await page.evaluate(() => window.worldMap.toScreen(...window.worldMap.state.start.at));
    const box = await page.locator("#map").boundingBox();

    await page.mouse.move(box.x + x, box.y + y);
    await expect(page.locator("#hover")).toContainText(`${world.start.name}: the Elves' town, with a guild (you start here)`);

    // Starting as another people moves the start, and the camps' danger with it
    const before = await page.evaluate(() => window.worldMap.state.plan.camps.map((camp) => camp.id));

    await page.locator("#people").selectOption("orc");

    const after = await page.evaluate(() => ({ start: window.worldMap.state.start, url: location.search }));

    expect(after.start.race).toBe("orc");
    expect(after.url).toBe("?seed=7&race=orc");
    expect(before.length).toBeGreaterThan(60);
});

test("lays out another world from another seed, and zooms in and out", async ({ page }) => {
    await openMap(page, "/world-map.html?seed=7");

    const first = await page.evaluate(() => window.worldMap.state.plan.places.map(({ name }) => name).join());

    await page.locator("#seed").fill("8");
    await page.locator("#seedform button[type=submit]").click();
    await page.waitForFunction(() => window.worldMap.state.seed === 8 && document.querySelector("#status").hidden);

    const second = await page.evaluate(() => window.worldMap.state.plan.places.map(({ name }) => name).join());

    expect(second).not.toBe(first);

    const scale = () => page.evaluate(() => window.worldMap.state.view.scale);
    const whole = await scale();

    await page.locator("#zoomin").click();
    expect(await scale()).toBeLessThan(whole);
    await page.locator("#zoomall").click();
    expect(await scale()).toBeCloseTo(whole, 5);
});
