import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures.js";
import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";

// The models the game reads (world/art/engine/models.js) in a real browser: one made for phones by
// utilities/blenderpipeline (its dragon-phone example: textures in KTX2, lower details packed in),
// read as the game reads any model, its textures kept compressed on the GPU, the transcoder that
// reads them fetched from the catalog by its hash.

const DRAGON = new URL("../utilities/blenderpipeline/dist/dragon-phone.glb", import.meta.url);

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

test("reads a model's KTX2 textures, kept compressed on the GPU, with the transcoder from the catalog, and draws it", async ({ page }) => {
    const fetched = [];

    page.on("request", (request) => fetched.push(request.url()));
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const read = await page.evaluate(async (bytes) => {
        const THREE = await import("three");
        const { loadGltf } = await import("./js/world/art/engine/models.js");
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }));
        const { scene } = await loadGltf(url);
        const textures = new Set();
        const levels = new Set();

        scene.traverse((node) => {
            if (node.isMesh) {
                levels.add(node.userData.lod ?? 0);

                for (const slot of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
                    if (node.material[slot]) {
                        textures.add(node.material[slot]);
                    }
                }
            }
        });

        // (Drawn by the game's own renderer, which the transcoder was told the formats of)
        const { renderer } = window.pellagos.session.view;
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

        camera.position.set(0, 2, 8);
        camera.lookAt(0, 0.5, 0);
        renderer.render(scene, camera);

        const gl = renderer.getContext();

        return {
            levels: [...levels].sort(),
            textures: [...textures].map((texture) => ({ mimeType: texture.userData.mimeType, compressed: Boolean(texture.isCompressedTexture), mipmaps: texture.mipmaps.length })),
            error: gl.getError(),
        };
    }, [...(await readFile(DRAGON))]);

    expect(read.levels).toEqual([0, 1, 2]);
    expect(read.textures.length).toBeGreaterThan(0);

    for (const texture of read.textures) {
        expect(texture).toMatchObject({ mimeType: "image/ktx2", compressed: true });
        expect(texture.mipmaps).toBeGreaterThan(1);
    }

    expect(read.error).toBe(0);

    // (Its two files, each at its address with its hash, as the catalog has them)
    const transcoder = fetched.filter((url) => url.includes("/libs/basis/"));

    expect(transcoder.map((url) => url.replace(/^.*\/basis\//, "").replace(/=[0-9a-f]{10}$/, "=")).sort()).toEqual(["basis_transcoder.js?h=", "basis_transcoder.wasm?h="]);
});

test("draws the Dreadthorn from its model once it's read, in place of its stand-in: a level of detail at a time, its fire out of its mouth", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    const fetched = [];

    page.on("request", (request) => fetched.push(request.url()));
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { modelOf, wantModel } = await import("./js/beasts/model.js");

        // (Its stand-in till its model's read)
        const standIn = new BeastAvatar("dreadthorn", { seed: 3 });
        const before = { model: standIn.model, read: Boolean(modelOf("dreadthorn")) };

        standIn.dispose();
        await wantModel("dreadthorn");

        const downloaded = window.pellagos.fetcher.done;

        const beast = new BeastAvatar("dreadthorn", { seed: 3 });
        const scene = new THREE.Scene();
        const size = new THREE.Box3();

        scene.add(beast.object, new THREE.HemisphereLight(0xffffff, 0x404040, 2));
        beast.lowerDetail({});
        beast.object.updateWorldMatrix(true, true);

        // (Breathing fire, a second and a half into its breath: its puffs out in front of it)
        beast.actions.startAttack("breath", { hitAt: 1.1, duration: 3.4 });

        for (let i = 0; i < 45; i++) {
            beast.update(1 / 30, 0, 0, 0);
        }

        const puffs = beast.plan.breath.puffs.reduce((sum, { alive }) => sum + alive, 0);

        // (Its levels: in full near; its least when it's small on the screen)
        const shown = () => beast.plan.levels.map((meshes) => meshes.every((mesh) => mesh.visible && mesh.material.colorWrite));
        const near = shown();

        beast.fitDetail(100);

        const far = shown();

        const { renderer } = window.pellagos.session.view;
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

        camera.position.set(14, 8, 30);
        camera.lookAt(0, 3, 0);
        renderer.render(scene, camera);

        const gl = renderer.getContext();
        const error = gl.getError();

        // (Its body as it's drawn, its fire left out: measured once it's drawn, its skin bound to
        // where it is then)
        size.setFromObject(beast.plan.levels[0][0], true);

        beast.dispose();

        return { before, downloaded, model: beast.model, puffs, near, far, long: size.max.z - size.min.z, shadow: beast.plan.levels.at(-1).every((mesh) => mesh.castShadow), error };
    });

    expect(drawn.before).toEqual({ model: false, read: false });
    expect(drawn.downloaded).toBe(1);
    expect(drawn.model).toBe(true);
    expect(drawn.near).toEqual([true, false, false]);
    expect(drawn.far).toEqual([false, false, true]);
    expect(drawn.shadow).toBe(true);
    expect(drawn.puffs).toBeGreaterThan(0);
    // (Drawn about as long as MODELS says: 17 metres, nose to tail)
    expect(drawn.long).toBeGreaterThan(12);
    expect(drawn.long).toBeLessThan(22);
    expect(drawn.error).toBe(0);

    // (Its model fetched by its hash, as the catalog has it, by the game's downloader: a part at a
    // time, all from the one address)
    expect([...new Set(fetched.filter((url) => url.includes("/models/beasts/")).map((url) => url.replace(/^.*\/models\//, "").replace(/=[0-9a-f]{10}$/, "=")))]).toEqual(["beasts/dreadthorn.bin?h="]);
});

test("draws the werewolf from its model once it's read, each in a skin of its own: its body and fur a level of detail at a time, all of it flushed red when it's struck", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    const fetched = [];

    page.on("request", (request) => fetched.push(request.url()));
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar, skinOf } = await import("./js/beasts/beast.js");
        const { MODELS, wantModel } = await import("./js/beasts/model.js");

        // (Its model and the three skins one of its kind may wear besides its own, read together)
        const done = window.pellagos.fetcher.done;
        const gltf = await wantModel("werewolf");
        const downloaded = window.pellagos.fetcher.done - done;

        // (One of each skin, by their seeds)
        const seeds = Object.fromEntries(MODELS.werewolf.skins.map((skin) => [skin, Array.from({ length: 40 }, (_, i) => i + 1).find((seed) => skinOf("werewolf", seed) === skin)]));
        const looks = Object.entries(seeds).map(([skin, seed]) => {
            const beast = new BeastAvatar("werewolf", { seed });
            const fur = beast.plan.levels[0].find((mesh) => mesh.material !== beast.plan.materials.body).material;
            const look = { skin, worn: beast.plan.skin, model: beast.model, fur: fur.map.uuid, normals: fur.normalMap.uuid, body: beast.plan.materials.body.map.uuid };

            beast.dispose();

            return look;
        });

        const beast = new BeastAvatar("werewolf", { seed: seeds.dusk });
        const scene = new THREE.Scene();

        scene.add(beast.object, new THREE.HemisphereLight(0xffffff, 0x404040, 2));
        beast.lowerDetail({});
        beast.update(1 / 30, 0, 0, 0);

        // (Its levels, each its body and two lengths of fur: in full near; its least when it's small)
        const shown = () => beast.plan.levels.map((meshes) => meshes.filter((mesh) => mesh.visible && mesh.material.colorWrite).length);
        const counts = beast.plan.levels.map((meshes) => meshes.length);
        const near = shown();

        beast.fitDetail(100);

        const far = shown();

        // (Struck: a flush of red on its fur as on its body)
        beast.flush.emissive.setRGB(0.6, 0, 0);
        beast.update(1 / 30, 0, 0, 0);

        const flushed = beast.plan.materials.others.every((material) => material.emissive.r > 0.1);
        const { renderer } = window.pellagos.session.view;
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

        camera.position.set(3, 2, 5);
        camera.lookAt(0, 1.2, 0);
        renderer.render(scene, camera);

        const error = renderer.getContext().getError();
        const height = new THREE.Box3().setFromObject(beast.plan.levels[0][0], true).getSize(new THREE.Vector3()).y;

        beast.dispose();

        return { read: Boolean(gltf), skins: Object.keys(gltf.skins).sort(), downloaded, looks, counts, near, far, flushed, height, error };
    });

    expect(drawn.read).toBe(true);
    expect(drawn.skins).toEqual(["ash", "dusk", "russet"]);
    expect(drawn.downloaded).toBe(4);
    expect(drawn.looks.map(({ skin, worn, model }) => [skin, worn, model])).toEqual([
        ["", "", true],
        ["dusk", "dusk", true],
        ["ash", "ash", true],
        ["russet", "russet", true],
    ]);

    // (Each skin its own fur and body, its normals the model's own)
    expect(new Set(drawn.looks.map(({ fur }) => fur)).size).toBe(4);
    expect(new Set(drawn.looks.map(({ body }) => body)).size).toBe(4);
    expect(new Set(drawn.looks.map(({ normals }) => normals)).size).toBe(1);
    expect(drawn.counts).toEqual([3, 3, 3]);
    expect(drawn.near).toEqual([3, 0, 0]);
    expect(drawn.far).toEqual([0, 0, 3]);
    expect(drawn.flushed).toBe(true);
    // (About as tall as it's made: 2.4 metres, its body without its fur a little less)
    expect(drawn.height).toBeGreaterThan(1.6);
    expect(drawn.height).toBeLessThan(2.8);
    expect(drawn.error).toBe(0);
    expect([...new Set(fetched.filter((url) => url.includes("/models/beasts/werewolf")).map((url) => url.replace(/^.*\/models\//, "").replace(/=[0-9a-f]{10}$/, "=")))].sort()).toEqual(["beasts/werewolf-2.bin?h=", "beasts/werewolf.ash.bin?h=", "beasts/werewolf.dusk.bin?h=", "beasts/werewolf.russet.bin?h="]);
});

// (The service worker kept out: a page's routes don't see what it fetches)
test.describe("its model missing", () => {
    test.use({ serviceWorkers: "block" });

    test("leaves the Dreadthorn's stand-in drawn, with no error, when its model can't be read", async ({ page }) => {
        await page.route(/\/models\/beasts\/dreadthorn\.bin/, (route) => route.fulfill({ status: 404, body: "" }));
        await page.goto("/");
        await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

        const drawn = await page.evaluate(async () => {
            const { BeastAvatar } = await import("./js/beasts/beast.js");
            const { modelOf, wantModel } = await import("./js/beasts/model.js");
            const got = await wantModel("dreadthorn");
            const beast = new BeastAvatar("dreadthorn", { seed: 3 });

            beast.update(1 / 30, 0, 0, 0);

            const drawn = { got, read: modelOf("dreadthorn"), model: beast.model };

            beast.dispose();

            return drawn;
        });

        expect(drawn).toEqual({ got: null, read: null, model: false });
    });
});
