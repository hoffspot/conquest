import { expect, test } from "@playwright/test";

// The character lab (character-lab.html) exposes itself as window.lab, which these tests use

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function openLab(page, address = "/character-lab.html") {
    await page.goto(address);
    await page.waitForFunction(() => window.lab?.ready, null, { timeout: 60000 });
    await expect(page.locator("#status")).toBeHidden();
}

test("builds a dressed, armed human and walks them", async ({ page }) => {
    await openLab(page);

    const hero = await page.evaluate(() => ({
        garments: window.lab.character.garments.length,
        items: window.lab.character.items.map((item) => item.name),
        hidden: window.lab.character.hidden.size,
        height: window.lab.character.height,
    }));

    expect(hero.garments).toBeGreaterThan(4);
    expect(hero.items).toEqual(expect.arrayContaining(["sword", "roundShield"]));
    expect(hero.hidden).toBeGreaterThan(1000);
    expect(hero.height).toBeGreaterThan(1.6);

    // Walking moves them forward, whatever the frame rate
    const moved = await page.evaluate(() => {
        const { walker, step } = window.lab;
        const start = walker.distance;

        for (let i = 0; i < 60; i++) {
            step(1 / 30);
        }

        return walker.distance - start;
    });

    expect(moved).toBeGreaterThan(1);
});

test("switches to the orc, changes gear and looks", async ({ page }) => {
    await openLab(page);

    await page.getByRole("radio", { name: "Orc" }).click();
    await page.waitForFunction(() => window.lab.character.equipment.get("face") === "tusks");

    await page.getByRole("tab", { name: "Gear" }).click();
    await expect(page.locator("#slot-face")).toHaveValue("tusks");
    await page.getByRole("button", { name: "Knight" }).click();
    await page.waitForFunction(() => window.lab.character.equipment.get("armour") === "breastplate");

    await page.locator("#slot-head").selectOption("");
    await page.waitForFunction(() => !window.lab.character.equipment.has("head"));

    await page.getByRole("tab", { name: "Look" }).click();
    await page.getByRole("tabpanel", { name: "Look" }).getByLabel("Hairstyle").selectOption("long");
    await page.waitForFunction(() => window.lab.character.hairMesh?.geometry.attributes.position.count > 1000);
});

test("sizes a woman's bust, and not a man's", async ({ page }) => {
    await openLab(page);

    // The human is a man: the slider is off
    const bust = page.getByRole("tabpanel", { name: "Body" }).getByLabel("Bust");

    await expect(bust).toBeDisabled();

    await page.getByRole("radio", { name: "Heroine" }).click();
    await expect(bust).toBeEnabled();

    const chestFront = () => page.evaluate(() => {
        const { character } = window.lab;
        const positions = character.positions;
        let front = -Infinity;

        for (let v = 0; v < character.human.vertexCount; v++) {
            const up = positions[v * 3 + 1] / character.height;

            if (character.human.partOf[v] === 0 && up > 0.66 && up < 0.78 && Math.abs(positions[v * 3]) < 0.15) {
                front = Math.max(front, positions[v * 3 + 2]);
            }
        }

        return front;
    });
    const before = await chestFront();

    await bust.fill("1");
    await expect.poll(chestFront).toBeGreaterThan(before + 0.02);
});

test("plays a motion capture clip", async ({ page }) => {
    await openLab(page, "/character-lab.html?clip=zombie-walk&tab=motion");
    await page.waitForFunction(() => window.lab.player?.clip.frames.length > 10);
});

test("fits a phone screen", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    page.on("pageerror", (error) => {
        throw error;
    });
    await openLab(page);

    const panel = await page.locator("#panel").boundingBox();
    const view = await page.locator("#view").boundingBox();

    expect(panel.y).toBeGreaterThan(view.y + view.height - 1);
    expect(panel.width).toBeGreaterThan(380);
    await page.close();
});
