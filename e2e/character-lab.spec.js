import { expect, test } from "./fixtures.js";

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

test("builds the hero on the Vitruvian body, as tall as on MakeHuman's", async ({ page }) => {
    await openLab(page, "/character-lab.html?body=vitruvian");

    const hero = await page.evaluate(() => {
        const { character } = window.lab;

        return {
            vertices: character.human.vertexCount,
            neck: character.human.landmarks.neck,
            garments: character.garments.length,
            items: character.items.map((item) => item.name),
            height: character.height,
        };
    });

    // (Vitruvian's own vertices, not MakeHuman's 13,774, dressed and armed as the hero is)
    expect(hero.vertices).toBeGreaterThan(15000);
    expect(hero.neck).toBeGreaterThan(0.2);
    expect(hero.garments).toBeGreaterThan(4);
    expect(hero.items).toEqual(expect.arrayContaining(["sword", "roundShield"]));
    expect(hero.height).toBeGreaterThan(1.78);
    expect(hero.height).toBeLessThan(1.84);
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

test("shows the other peoples: elves' ears, cat folk's ears, tail and fur, lizard folk's scales and tail", async ({ page }) => {
    await openLab(page);

    await page.getByRole("radio", { name: "Elf", exact: true }).click();
    await page.waitForFunction(() => window.lab.state.shape.details.earLength >= 0.8);

    await page.getByRole("radio", { name: "Cat folk" }).click();
    await page.waitForFunction(() => window.lab.character.equipment.get("tail") === "catTail");

    const cat = await page.evaluate(() => {
        const { character, step } = window.lab;
        const tail = character.items.find((item) => item.name === "catTail");
        const before = tail.quaternion.clone();

        for (let i = 0; i < 20; i++) {
            step(1 / 30);
        }

        let tinted = false;

        tail.traverse((mesh) => {
            tinted ||= mesh.isMesh && mesh.material === character.materials.tint;
        });

        return {
            ears: character.equipment.get("ears"),
            swayed: before.angleTo(tail.quaternion),
            tinted,
            tint: character.materials.tint.color.getHexString(),
            tone: window.lab.state.look.skin.tone.replace("#", "").toLowerCase(),
        };
    });

    expect(cat.ears).toBe("catEars");
    expect(cat.swayed).toBeGreaterThan(0.001);
    expect(cat.tinted).toBe(true);
    expect(cat.tint).toBe(cat.tone);

    await page.getByRole("radio", { name: "Lizard folk" }).click();
    await page.waitForFunction(() => window.lab.character.equipment.get("tail") === "lizardTail" && !window.lab.character.equipment.has("ears"));
    expect(await page.evaluate(() => window.lab.state.look.skin.scales)).toBeGreaterThan(0.8);
});

test("plays a motion capture clip", async ({ page }) => {
    await openLab(page, "/character-lab.html?clip=zombie-walk&tab=motion");
    await page.waitForFunction(() => window.lab.player?.clip.frames.length > 10);

    // And one of Mesh2Motion's (glTF), played once, standing where it is
    await page.evaluate(() => window.lab.chooseClip("m2m-death"));
    await page.waitForFunction(() => window.lab.player?.clip.loop === false);
    expect(await page.evaluate(() => ({ frames: window.lab.player.clip.frames.length, moves: window.lab.player.moves }))).toEqual({ frames: 136, moves: false });
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

test("dresses each people's townsfolk in their everyday dress: their own cut and colours, their own basket, a hoe over the shoulder", async ({ page }) => {
    // (Each people's own: dress.js; drawn as the game draws them, garments all at once, skirts and
    // what's carried apart)
    const row = async (people) => {
        await openLab(page, `/uniform-lab.html?people=${people}&show=townsfolk`);

        return page.evaluate(() =>
            window.lab.figures.map(({ label, character }) => ({
                label,
                worn: [...(character.garments.find((mesh) => mesh.name === "garments")?.userData.merged ?? []), ...character.garments.map((mesh) => mesh.name).filter((name) => name !== "garments")],
                items: character.items.map((item) => item.name),
            })),
        );
    };
    const human = await row("human");
    const cat = await row("cat");
    const orc = await row("orc");

    expect(human.map(({ label }) => label)).toEqual(["Shopper", "Field hand", "Porter", "Merchant", "Merchant", "Priest"]);
    expect(human[0].items).toContain("basket");
    expect(human[1].items).toContain("hoe");
    expect(cat[0].items).toContain("catBasket");
    expect(orc[0].items).toContain("orcBasket");

    // (The cat folk's wraps and shukas, barefoot; the orcs' hide; none of the humans' homespun)
    const homespun = ["chemise", "kirtle", "skirt", "tunic", "smock", "boots", "brownTunic", "russetTunic", "blueKirtle", "brownSkirt"];

    expect(cat.flatMap(({ worn }) => worn).some((id) => /^cat(Wrap|Bandeau|Shuka|Sarong)/.test(id))).toBe(true);
    expect(orc.flatMap(({ worn }) => worn).some((id) => /^hide/.test(id))).toBe(true);

    for (const { worn } of [...cat, ...orc]) {
        expect(worn.filter((id) => homespun.includes(id))).toEqual([]);
    }

    expect(cat.flatMap(({ worn }) => worn).filter((id) => /boots/i.test(id))).toEqual([]);
});

test("dresses each people's soldiers and officials, their garments drawn all at once as in the game", async ({ page }) => {
    const figures = async () =>
        page.evaluate(() =>
            window.lab.figures.map(({ label, character }) => ({
                label,
                garments: character.garments.map((mesh) => mesh.name),
                merged: character.garments.find((mesh) => mesh.name === "garments")?.userData.merged ?? [],
                material: character.garments.find((mesh) => mesh.name === "garments")?.material.uuid ?? null,
            })),
        );

    await openLab(page, "/uniform-lab.html?people=orc");

    const merged = await figures();
    const [captain, soldier, reeve] = merged;

    // (One mesh for a soldier's garments, but for their cloak and a robe: drapes, hanging free)
    expect(merged.map(({ label }) => label)).toEqual(["Captain", "Soldier", "Reeve", "Ruler"]);
    expect(soldier.garments).toEqual(["garments"]);
    expect(soldier.merged).toEqual(expect.arrayContaining(["breastplate.orc", "trousers.orc", "sabatons.orc", "belt.orc"]));
    expect(captain.garments).toEqual(["garments", "cloak.orc"]);
    expect(reeve.merged).toEqual(expect.arrayContaining(["livery.orc", "chain"]));

    // (Everyone in the same outfit drawn with one picture of it)
    if (captain.merged.join() === soldier.merged.join()) {
        expect(captain.material).toBe(soldier.material);
    }

    await openLab(page, "/uniform-lab.html?people=orc&show=soldiers&drawn=apart");

    const apart = await figures();

    expect(apart[1].garments).toEqual(expect.arrayContaining(soldier.merged));
    expect(apart[1].garments).not.toContain("garments");
});
