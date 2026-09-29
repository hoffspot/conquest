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

test("builds the taverns with their names and signs, the guild, the churches, the smithy, a town hall and a keep", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&show=landmarks");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });

    const built = await page.evaluate(() => {
        const names = new Set();

        window.buildingLab.state.built.traverse((node) => {
            if (node.isMesh) {
                [node.material].flat().forEach(({ name }) => names.add(name));
            }
        });

        return { stats: window.buildingLab.state.stats, names: [...names] };
    });

    expect(built.stats.pieces).toBe(12);
    expect(built.stats.calls).toBeLessThan(60);

    // Each tavern's name on its board and its sign by the door, the guild's, the churches'
    // patrons' signs, the town hall's board and sign, and the keep's crown
    expect(built.names.filter((name) => name.startsWith("board ")).length).toBe(6);
    expect(built.names.filter((name) => name.startsWith("sign ")).length).toBeGreaterThanOrEqual(10);
    expect(built.names).toContain("sign guild");
    expect(built.names).toContain("sign blacksmith");
    expect(built.names).toEqual(expect.arrayContaining(["board hall", "sign hall", "sign keep"]));
});

test("draws a village out in the world in its chunks, with its tavern, church, smithy and guild", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&show=village");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });

    const village = await page.evaluate(() => {
        const names = new Set();

        window.buildingLab.state.built.traverse((node) => {
            if (node.isMesh) {
                [node.material].flat().forEach(({ name }) => names.add(name));
            }
        });

        return { kind: window.buildingLab.state.place.kind, stats: window.buildingLab.state.stats, names: [...names] };
    });

    expect(village.kind).toBe("village");
    expect(village.stats.pieces).toBeGreaterThan(10);
    expect(village.stats.calls).toBeLessThan(120);
    expect(village.names.some((name) => name.startsWith("board ") && name !== "board guild")).toBe(true);
    expect(village.names).toContain("sign guild");
    expect(village.names).toContain("sign blacksmith");
});

test("draws the land itself: its features, and the undergrowth near, swaying, in a few draw calls", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&show=wilds-meadow");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });

    const land = await page.evaluate(() => {
        const found = { undergrowth: 0, shown: 0, features: 0, materials: new Set() };

        window.buildingLab.state.built.traverse((node) => {
            if (node.name === "undergrowth" && node.isMesh) {
                found.undergrowth++;
                found.shown += node.visible ? 1 : 0;
                found.materials.add(node.material.name);
            } else if (node.name === "wilds") {
                found.features++;
            }
        });

        return { ...found, materials: [...found.materials], stats: window.buildingLab.state.stats };
    });

    expect(land.undergrowth).toBeGreaterThan(4);
    expect(land.shown).toBeGreaterThan(2);
    expect(land.shown).toBeLessThanOrEqual(land.undergrowth);
    expect(land.features).toBeGreaterThan(2);
    expect(land.materials).toEqual(["wilds"]);
    expect(land.stats.calls).toBeLessThan(70);
});

test("draws a people's homeland: its own ground, its own trees, and its own things lying about", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&people=orc&show=home");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });

    const home = await page.evaluate(async () => {
        const { HOME_TREES, TREE_KINDS } = await import("/js/core/setpieces/pieces.js");
        const { HOMELANDS } = await import("/js/core/wilds.js");
        const { chunks } = window.buildingLab.state;
        const { x, z } = window.buildingLab.orbit.focus;
        const [cx, cy] = [Math.floor(x / 64), Math.floor(z / 64)];
        const near = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => chunks.overworld.chunk(cx + dx, cy + dy)));
        const trees = near.flatMap((chunk) => chunk.trees.map(({ variant }) => TREE_KINDS[variant][0]));

        return {
            people: chunks.overworld.homeAt(x, z),
            ground: chunks.land.userData.home?.length ?? 0,
            own: trees.filter((kind) => kind === HOME_TREES.orc).length,
            trees: trees.length,
            things: near.flatMap((chunk) => chunk.features.map(({ kind }) => kind)).filter((kind) => HOMELANDS.orc.kinds[kind]).length,
        };
    });

    expect(home.people).toBe("orc");
    expect(home.ground).toBe(2);
    expect(home.own).toBeGreaterThan(home.trees / 2);
    expect(home.things).toBeGreaterThan(2);
});

test("pitches every people's war camp, each of its own tents round a fire", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&show=camps");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });

    const camps = await page.evaluate(() => {
        const found = {};

        window.buildingLab.state.built.traverse((node) => {
            const camp = node.name.startsWith("camp:") ? node.name.slice(5) : null;

            if (camp) {
                const names = new Set();

                node.traverse((part) => part.isMesh && names.add(part.material.name));
                found[camp] = [...names];
            }
        });

        return found;
    });

    expect(Object.keys(camps).sort()).toEqual(["camp-cat", "camp-darkElf", "camp-elf", "camp-human", "camp-lizard", "camp-orc"]);
    expect(camps["camp-orc"]).toContain("hide-dark");
    expect(camps["camp-cat"]).toContain("matting");
    expect(camps["camp-lizard"]).toContain("thatch-palm");
    expect(camps["camp-elf"]).toContain("cloth-green");
    expect(camps["camp-darkElf"]).toContain("cloth-violet");
    expect(camps["camp-human"]).not.toContain("hide-dark");
});
