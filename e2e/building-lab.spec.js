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
    // (The keep's banners and flags, stirring in the breeze: world/cloth.js)
    expect(built.names).toContain("cloth");
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

        return { kind: window.buildingLab.state.place.kind, stats: window.buildingLab.state.stats, yards: window.buildingLab.state.yards, names: [...names] };
    });

    expect(village.kind).toBe("village");
    expect(village.stats.pieces).toBeGreaterThan(10);
    expect(village.stats.calls).toBeLessThan(120);
    expect(village.names.some((name) => name.startsWith("board ") && name !== "board guild")).toBe(true);
    expect(village.names).toContain("sign guild");
    expect(village.names).toContain("sign blacksmith");
    // (Smoke rising from its chimneys and its forge: world/smoke.js)
    expect(village.names).toContain("chimney smoke");
    // (Yards behind its houses: kits/yards.js)
    expect(village.yards).toBeGreaterThan(3);
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

test("works out the fields seen from afar on the GPU just as the rules do, metre by metre", async ({ page }) => {
    await page.goto("/building-lab.html?seed=7&show=street");
    await page.waitForFunction(() => window.buildingLab?.state.ready, null, { timeout: 120000 });

    // (The ground's shader's cropAt, world/ground.js FIELDS_GLSL, drawn a pixel a metre over
    // farmland and the land round it, against core/fields.js fieldAt)
    const fields = await page.evaluate(async () => {
        const THREE = await import("three");
        const { FIELDS_GLSL, landColours, landLayers } = await import("/js/world/ground.js");
        const { fieldAt } = await import("/js/core/fields.js");
        const { BIOMES, CELL, CELLS, planWorld } = await import("/js/core/worldplan/plan.js");
        const plan = planWorld(1);
        const land = landColours(plan);
        const renderer = new THREE.WebGLRenderer();
        const size = 64;
        const target = new THREE.WebGLRenderTarget(size, size);
        const material = new THREE.ShaderMaterial({
            uniforms: { markMaps: { value: landLayers(land).marks }, fieldSeed: { value: land.userData.seed }, origin: { value: new THREE.Vector2() } },
            vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
            // (The farmland read as the ground reads it: the third of the land's marks)
            fragmentShader: `uniform highp sampler2DArray markMaps;\nuniform int fieldSeed;\nuniform vec2 origin;\nivec2 farmSize() { return textureSize(markMaps, 0).xy; }\nfloat farmAt(ivec2 cell) { return texelFetch(markMaps, ivec3(cell, 2), 0).r; }\n${FIELDS_GLSL}\nvoid main() { gl_FragColor = vec4(float(cropAt(origin + floor(gl_FragCoord.xy) + 0.5, true, false) + 1) / 255.0, 0.0, 0.0, 1.0); }`,
        });
        const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const pixels = new Uint8Array(size * size * 4);
        const farmland = BIOMES.findIndex(({ id }) => id === "farmland");
        const cell = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));
        const found = { same: 0, differ: 0, sown: 0, crops: new Set() };

        for (const [x0, y0] of [[2950, 5380], [3080, 5440], [3016, 5330], [1200, 2600]]) {
            material.uniforms.origin.value.set(x0, y0);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const field = fieldAt(plan.seed, x0 + x, y0 + y);
                    const want = plan.biome[cell(field.middle[1]) * CELLS + cell(field.middle[0])] === farmland ? field.crop : 0;

                    found[pixels[(y * size + x) * 4] - 1 === want ? "same" : "differ"]++;
                    found.sown += want > 0 ? 1 : 0;
                    found.crops.add(want);
                }
            }
        }

        renderer.setRenderTarget(null);
        [target, material, renderer, land.userData.farm, land.userData.grass, ...land.userData.home, land].forEach((thing) => thing.dispose());

        return { ...found, crops: found.crops.size };
    });

    expect(fields.differ).toBe(0);
    expect(fields.same).toBe(4 * 64 * 64);
    expect(fields.sown).toBeGreaterThan(2000);
    expect(fields.crops).toBeGreaterThan(4);
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
