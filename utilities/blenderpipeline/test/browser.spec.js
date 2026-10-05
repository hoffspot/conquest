// Every GLB in dist/ loaded in Three.js r186 (the game's version), in Chromium, as the game would
// load it, through the viewer (viewer/viewer.js): its clips all there and all moving it, as big as
// its report says at rest and in motion, its travel where the report says, drawn; and the UDIM
// creature's tiles each where their segment is on its atlas. npm run test:browser
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const dist = new URL("../dist/", import.meta.url);
const reports = readdirSync(dist)
    .filter((file) => file.endsWith(".report.json"))
    .map((file) => JSON.parse(readFileSync(new URL(file, dist), "utf8")));

// The UDIM creature's tiles' colours (sRGB), head to tail (fixtures/make_udim_creature.py)
const TILE_COLOURS = [
    [220, 40, 40],
    [40, 200, 60],
    [50, 80, 230],
    [230, 200, 30],
];

async function openViewer(page) {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto("/viewer/?test");
    await page.waitForFunction(() => window.viewerReady);

    return errors;
}

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const sizeOf = (pose) => pose.max.map((v, i) => v - pose.min[i]);

test("there are built assets to test", () => {
    expect(reports.map((report) => report.name).sort()).toEqual(["dragon", "dragon-statue", "horse", "palette-crate", "udim-creature", "udim-creature-split"]);
});

for (const report of reports) {
    test(`${report.name}: Three.js loads it and plays every clip`, async ({ page }) => {
        const errors = await openViewer(page);
        const info = await page.evaluate((url) => window.viewer.load(url), `/${report.glb}`);
        const longest = Math.max(...report.bounds.rest.size);

        expect(info.clips.map((clip) => clip.name)).toEqual(report.clips.map((clip) => clip.name));
        expect(info.drawCalls).toBe(report.meshes.drawCalls);
        expect(info.skinned).toBe(report.meshes.skinned);

        if (report.meshes.skinned) {
            expect(info.bones).toBe(report.meshes.joints);
        }

        // At rest, as big as the pipeline measured it (its skinning and Three.js's agree)
        const rest = await page.evaluate(() => window.viewer.pose(null));

        sizeOf(rest).forEach((size, i) => expect(Math.abs(size - report.bounds.rest.size[i])).toBeLessThan(0.01 * longest + 0.002));

        for (const clip of report.clips) {
            const seconds = info.clips.find((one) => one.name === clip.name).seconds;

            expect(Math.abs(seconds - clip.seconds)).toBeLessThan(0.01);

            const moments = [0, 0.25, 0.5, 0.75, 1].map((share) => share * clip.seconds);
            const poses = [];

            for (const time of moments) {
                poses.push(await page.evaluate(([name, at]) => window.viewer.pose(name, at), [clip.name, time]));
            }

            // It moves: some bone goes somewhere over the clip
            const bones = Object.keys(poses[0].bones);
            const moved = Math.max(...bones.flatMap((bone) => poses.map((pose) => distance(pose.bones[bone], poses[0].bones[bone]))));

            expect(moved, `${clip.name} moves`).toBeGreaterThan(0.002 * longest);

            // It stays inside the box the report says it reaches
            for (const pose of poses) {
                pose.min.forEach((v, i) => expect(v).toBeGreaterThan(report.bounds.animated.min[i] - 0.03 * longest));
                pose.max.forEach((v, i) => expect(v).toBeLessThan(report.bounds.animated.max[i] + 0.03 * longest));
            }

            // A clip that loops ends as it starts
            if (clip.loops) {
                const apart = Math.max(...bones.map((bone) => distance(poses[4].bones[bone], poses[0].bones[bone])));

                expect(apart, `${clip.name} loops`).toBeLessThan(0.02 * longest);
            }

            // Its root bone goes as far across the ground as the report says (none, in place)
            if (clip.rootMotion?.bone && clip.rootMotion.bone in poses[0].bones) {
                const [from, to] = [poses[0].bones[clip.rootMotion.bone], poses[4].bones[clip.rootMotion.bone]];
                const across = Math.hypot(to[0] - from[0], to[2] - from[2]);

                expect(Math.abs(across - (clip.inPlace ? 0 : clip.rootMotion.distance)), `${clip.name}'s travel`).toBeLessThan(0.01 * longest + 0.002);
            }
        }

        // It's drawn
        expect(await page.evaluate(() => window.viewer.coverage())).toBeGreaterThan(0.01);

        // Its lower-detail copies load too, with the same clips
        for (const lod of report.lods) {
            const copy = await page.evaluate((url) => window.viewer.load(url), `/${lod.file}`);

            expect(copy.clips.map((clip) => clip.name)).toEqual(report.clips.map((clip) => clip.name));
            expect(await page.evaluate(() => window.viewer.coverage())).toBeGreaterThan(0.01);
        }

        expect(errors).toEqual([]);
    });
}

test("udim-creature: each UDIM tile's colour is where its segment is on the baked atlas", async ({ page }) => {
    const report = reports.find((one) => one.name === "udim-creature");
    const errors = await openViewer(page);
    const info = await page.evaluate((url) => window.viewer.load(url), `/${report.glb}`);

    // One material, with the textures its three materials' bakes made: colour, occlusion with
    // roughness and metal (the horn's metallic, the ambient occlusion), normals (the horn's
    // bump), emission (the eyes)
    expect(info.materials).toHaveLength(1);
    expect(info.materials[0]).toMatchObject({ map: true, roughnessMap: true, aoMap: true, normalMap: true, emissiveMap: true });

    // The body's own faces: its boxes' sides (half its width out) and bottoms (on the ground),
    // where no horn or eye is
    const half = 0.2 * report.scale;
    const triangles = (await page.evaluate(() => window.viewer.triangles())).filter(({ position: [x, y] }) => Math.abs(Math.abs(x) - half) < 0.002 * report.scale || y < 0.002 * report.scale);
    const [low, high] = [report.bounds.rest.min[2], report.bounds.rest.max[2]];
    const colours = await page.evaluate((uvs) => window.viewer.sampleTexture(uvs), triangles.map((triangle) => triangle.uv));
    const found = [[], [], [], []];

    triangles.forEach(({ position }, i) => {
        const segment = Math.min(3, Math.floor(((high - position[2]) / (high - low)) * 4));

        found[segment].push(colours[i]);
    });

    for (const [segment, expected] of TILE_COLOURS.entries()) {
        expect(found[segment].length, `segment ${segment}'s faces`).toBeGreaterThanOrEqual(6);

        for (const colour of found[segment]) {
            colour.slice(0, 3).forEach((v, i) => expect(Math.abs(v - expected[i]), `segment ${segment}: ${colour}, not ${expected}`).toBeLessThan(20));
        }
    }

    expect(errors).toEqual([]);
});

test("udim-creature: its eyes, one flat colour, are drawn glowing (a flat material's faces shaded right beside a normal map)", async ({ page }) => {
    const report = reports.find((one) => one.name === "udim-creature");
    const errors = await openViewer(page);

    await page.evaluate((url) => window.viewer.load(url), `/${report.glb}`);

    // The eye on the side the camera sees: the face of it farthest out (its middle, just out from it)
    const faces = await page.evaluate(() => window.viewer.triangles());
    const outermost = Math.max(...faces.map(({ position: [x] }) => x));
    const eye = faces.filter(({ position: [x] }) => x > outermost - 1e-4);
    const middle = [0, 1, 2].map((i) => eye.reduce((sum, { position }) => sum + position[i], 0) / eye.length);
    const [red, green, blue] = await page.evaluate((point) => window.viewer.colourAt(point), [middle[0] + 0.005, middle[1], middle[2]]);

    expect(eye.length).toBe(2);
    expect(red, `drawn ${red}, ${green}, ${blue}`).toBeGreaterThan(200);
    expect(green, `drawn ${red}, ${green}, ${blue}`).toBeGreaterThan(160);
    expect(blue).toBeLessThan(red - 60);
    expect(errors).toEqual([]);
});

test("udim-creature-split: the exporter's own UDIM split, a material for each tile in its colour", async ({ page }) => {
    const report = reports.find((one) => one.name === "udim-creature-split");
    const errors = await openViewer(page);
    const info = await page.evaluate((url) => window.viewer.load(url), `/${report.glb}`);
    const linear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);

    for (const [tile, colour] of TILE_COLOURS.entries()) {
        const material = info.materials.find((one) => one.name === `Skin.${1001 + tile}`);

        expect(material, `Skin.${1001 + tile}`).toBeTruthy();
        material.color.forEach((v, i) => expect(Math.abs(v - linear(colour[i]))).toBeLessThan(0.01));
    }

    expect(errors).toEqual([]);
});

test("the viewer lists the models and plays one, for a person looking", async ({ page }) => {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/viewer/?file=dist/dragon.glb");
    await page.waitForFunction(() => window.viewerReady);

    await expect(page.locator("#models option")).toHaveCount(reports.length);
    await expect(page.locator("#clips button")).toHaveCount(1 + reports.find((report) => report.name === "dragon").clips.length);
    await expect(page.locator("#clips button[aria-pressed=true]")).toHaveCount(1);
    await expect(page.locator("#stats")).toContainText("joints");
    expect(errors).toEqual([]);
});
