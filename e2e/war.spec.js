import { expect, test } from "./fixtures.js";

// The war (war.html): the war for the continent played out on a world's map. It exposes itself as
// window.warViewer, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function openWar(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.warViewer?.state.war, null, { timeout: 60000, polling: 100 });
    await expect(page.locator("#status")).toBeHidden();
}

test("lays out the war for a seed: each realm, its ruler and how they stand, the towns drawn in their holders' colours", async ({ page }) => {
    await openWar(page, "/war.html?seed=3&might=0");

    const start = await page.evaluate(() => {
        const { state } = window.warViewer;
        const canvas = document.querySelector("#map");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const colours = new Set();

        for (let k = 0; k < pixels.length; k += 4 * 97) {
            colours.add(`${pixels[k]},${pixels[k + 1]},${pixels[k + 2]}`);
        }

        return {
            seed: state.seed,
            turn: state.war.turn,
            realms: [...document.querySelectorAll("#realms li")].map((li) => li.textContent),
            cells: document.querySelectorAll("#relations td").length,
            age: document.querySelector("#age").textContent,
            colours: colours.size,
            capital: state.war.towns.find(({ kind, race }) => kind === "capital" && race === "human"),
            works: state.war.works.find(({ race }) => race === "human"),
        };
    });

    expect(start.seed).toBe(3);
    expect(start.turn).toBe(0);
    expect(start.realms).toHaveLength(6);
    expect(start.realms[0]).toMatch(/^The Kingdom of .+(King|Queen) .+\d+ towns · 6 works · \d+ under arms · 60 gold0 wood · 0 stone · 0 metal$/);
    expect(start.cells).toBe(36);
    expect(start.age).toContain("An uneasy peace");
    expect(start.age).toContain("can only raid");
    expect(start.colours).toBeGreaterThan(40);

    // Pointing at a capital says whose it is and who guards it
    const [x, y] = await page.evaluate((at) => window.warViewer.toScreen(...at), start.capital.at);
    const box = await page.locator("#map").boundingBox();

    await page.mouse.move(box.x + x, box.y + y);
    await expect(page.locator("#hover")).toContainText(`${start.capital.name}: the Humans' capital, 40 of 40 on guard`);

    // And at one of their works, whose it is, its guard and what's waiting in its yard
    const [wx, wy] = await page.evaluate((at) => window.warViewer.toScreen(...at), start.works.at);

    await page.mouse.move(box.x + wx, box.y + wy);
    await expect(page.locator("#hover")).toContainText(`The ${start.works.name} ${start.works.kind}: the Humans', 6 on guard, 0 waiting in its yard`);
});

test("plays the war on: forces march and camp, the news tells of it, and the players' might brings on the next age", async ({ page }) => {
    await openWar(page, "/war.html?seed=3&might=0");

    const war = await page.evaluate(() => {
        const viewer = window.warViewer;

        viewer.step(40);

        return {
            turn: viewer.state.war.turn,
            forces: viewer.state.war.forces.map(({ kind, realm, at }) => ({ kind, realm, at })),
            stores: viewer.state.war.realms.map(({ stores }) => stores.wood + stores.stone + stores.metal),
            news: [...document.querySelectorAll("#news li")].map((li) => ({ text: li.textContent, turn: li.value })),
            wars: document.querySelectorAll("#relations td.hostile").length,
        };
    });

    expect(war.turn).toBe(40);
    expect(war.news.length).toBeGreaterThan(5);
    expect(war.news[0].turn).toBeGreaterThanOrEqual(war.news.at(-1).turn);
    expect(war.news.some(({ text }) => /declared war on/.test(text))).toBe(true);
    expect(war.news.every(({ text }) => !/undefined|null/.test(text))).toBe(true);
    expect(war.wars).toBeGreaterThan(0);

    // Their works' convoys have brought wood, stone and metal into every people's stores (too
    // everyday to be in the news)
    expect(war.stores.every((stores) => stores > 0)).toBe(true);
    expect(war.news.some(({ text }) => /^A convoy of/.test(text))).toBe(false);

    // Pointing at a force says whose it is and what it's about
    const force = war.forces.find(({ kind }) => kind !== "envoy" && kind !== "convoy");

    if (force) {
        const [x, y] = await page.evaluate((at) => window.warViewer.toScreen(...at), force.at);
        const box = await page.locator("#map").boundingBox();

        await page.mouse.move(box.x + x, box.y + y);
        await expect(page.locator("#hover")).toContainText(/The .+ \d+, (marching on|camped outside|going to relieve)/);
    }

    // The players' might: the war comes on (and it's in the address)
    await page.locator("#might").fill("4");
    await expect(page.locator("#mightvalue")).toHaveText("4");
    await page.locator("#next").click();
    await expect(page.locator("#age")).toContainText("Turn 41: War.");
    await expect(page.locator("#news li.big", { hasText: "The war enters a new age: war." })).toHaveAttribute("value", "41");
    expect(await page.evaluate(() => location.search)).toBe("?seed=3&might=4");

    // Playing it on by itself, and pausing
    await page.locator("#speed").selectOption("16");
    await page.locator("#play").click();
    await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "true");
    await page.waitForFunction(() => window.warViewer.state.war.turn >= 60, null, { polling: 100 });
    await page.locator("#play").click();
    await expect(page.locator("#play")).toHaveText("Play");

    const paused = await page.evaluate(() => window.warViewer.state.war.turn);

    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.warViewer.state.war.turn)).toBe(paused);
});

test("fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWar(page, "/war.html?seed=5");

    const fits = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, map: document.querySelector("#map").clientHeight }));

    expect(fits.scroll).toBeLessThanOrEqual(fits.width);
    expect(fits.map).toBeGreaterThan(300);
});
