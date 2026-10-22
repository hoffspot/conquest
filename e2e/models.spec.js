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

test("draws the Behemoth of the Rift from the Kaiju's model: 36 metres long, its atomic breath raked over the ground ahead as the battle has it land, each move as much of its clip as it lasts, falling in its Faint", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { wantModel } = await import("./js/beasts/model.js");
        const { NATURAL } = await import("./js/core/weapons.js");

        await wantModel("kaiju");

        const beast = new BeastAvatar("kaiju", { seed: 3 });
        const scene = new THREE.Scene();
        const move = (id) => NATURAL.kaiju.attacks.find((attack) => attack.id === id);

        scene.add(beast.object, new THREE.HemisphereLight(0xffffff, 0x404040, 2));
        beast.lowerDetail({});
        beast.update(1 / 30, 0, 0, 0);
        beast.object.updateWorldMatrix(true, true);


        // (Breathing: charged, then fired, 2.5 seconds into its breath)
        const { hitAt, duration } = move("atomicBreath");

        beast.actions.startAttack("breath", { hitAt: hitAt / 1000, duration: duration / 1000 });

        for (let i = 0; i < 75; i++) {
            beast.update(1 / 30, 0, 0, 0);
        }

        const breath = { ...beast.plan.beam.state };
        const { renderer } = window.pellagos.session.view;
        const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 300);

        camera.position.set(40, 20, 30);
        camera.lookAt(0, 5, 15);
        renderer.render(scene, camera);

        const error = renderer.getContext().getError();
        // (Its size as it's drawn, its bones posed)
        const size = new THREE.Box3().setFromObject(beast.plan.levels[0][0], true);

        // (Its breath over: none of it drawn)
        for (let i = 0; i < 120; i++) {
            beast.update(1 / 30, 0, 0, 0);
        }

        const after = { ...beast.plan.beam.state };

        // (Fallen dead: its Faint, held where it lies)
        beast.actions.die();

        for (let i = 0; i < 300; i++) {
            beast.update(1 / 30, 0, 0, 0);
        }

        beast.object.updateWorldMatrix(true, true);

        const head = beast.plan.joints.head.getWorldPosition(new THREE.Vector3());

        beast.dispose();

        return { model: beast.model, long: size.max.z - size.min.z, tall: size.max.y - size.min.y, breath, after, error, head: head.y };
    });

    expect(drawn.model).toBe(true);
    // (As long and as tall as it's made)
    expect(drawn.long).toBeGreaterThan(24);
    expect(drawn.long).toBeLessThan(40);
    expect(drawn.tall).toBeGreaterThan(8);
    // (Fired, aimed where the battle has it land: 13 to 18 metres before its mouth, raked on)
    expect(drawn.breath).toMatchObject({ firing: true, aim: 1 });
    expect(drawn.breath.glow).toBeGreaterThan(3);
    expect(drawn.breath.hit).toBeGreaterThan(10);
    expect(drawn.breath.hit).toBeLessThan(20);
    expect(drawn.after).toMatchObject({ firing: false, glow: 0 });
    expect(drawn.error).toBe(0);
    // (Lying where it fell, its head on the ground)
    expect(drawn.head).toBeLessThan(3);
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

test("draws the Moonfang from the werewolf's model, read once for both: bigger, always in its own skin", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { modelOf, wantModel } = await import("./js/beasts/model.js");

        // (Both asked for at once: the model read once, the four skins between them once each)
        const done = window.pellagos.fetcher.done;
        const [wolf, master] = await Promise.all([wantModel("werewolf"), wantModel("moonfang")]);
        const downloaded = window.pellagos.fetcher.done - done;
        const heightOf = (beast) => new THREE.Box3().setFromObject(beast.plan.levels[0][0], true).getSize(new THREE.Vector3()).y;
        const lookOf = (kind, seed) => {
            const beast = new BeastAvatar(kind, { seed });

            beast.update(1 / 30, 0, 0, 0);
            beast.object.updateMatrixWorld(true);

            const look = { model: beast.model, skin: beast.plan.skin, body: beast.plan.materials.body.map.uuid, height: heightOf(beast) };

            beast.dispose();

            return look;
        };
        const masters = [1, 2, 3, 4, 5].map((seed) => lookOf("moonfang", seed));

        return { same: wolf === master && modelOf("werewolf") === modelOf("moonfang"), skins: Object.keys(master.skins).sort(), downloaded, masters, wolf: lookOf("werewolf", 1) };
    });

    expect(drawn.same).toBe(true);
    expect(drawn.skins).toEqual(["ash", "dusk", "moonfang", "russet"]);
    expect(drawn.downloaded).toBe(5);

    // (Every one of them in the moonfang's skin, its own body's textures, not a werewolf's)
    expect(drawn.masters.map(({ model, skin }) => [model, skin])).toEqual(Array.from({ length: 5 }, () => [true, "moonfang"]));
    expect(new Set(drawn.masters.map(({ body }) => body)).size).toBe(1);
    expect(drawn.masters[0].body).not.toBe(drawn.wolf.body);

    // (3.4 metres tall to a werewolf's 2.4)
    expect(drawn.masters[0].height / drawn.wolf.height).toBeCloseTo(3.4 / 2.4, 1);
});

test("draws the ants' nests' creatures from their models: a giant ant, a great centipede and an elite dungeon spider sunk to the ground, a dungeon spider, the Ant Monster, each as long as it's drawn; the ant rolling onto its back dead till it's lent the Ant Monster's fall, then falling as it does", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    const fetched = [];

    page.on("request", (request) => fetched.push(request.url()));
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { modelOf, wantModel } = await import("./js/beasts/model.js");
        const { renderer } = window.pellagos.session.view;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
        const sizeOf = (beast) => new THREE.Box3().setFromObject(beast.plan.levels[0][0], true);
        const chestOf = (beast) => beast.plan.object.getObjectByName("Chest").getWorldPosition(new THREE.Vector3()).y;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
        camera.position.set(6, 4, 8);
        camera.lookAt(0, 0.5, 0);

        // (Each drawn from its model once read: how long and how high, as it stands (drawn as long
        // as MODELS says, whatever one of its kind's size))
        const look = async (kind) => {
            await wantModel(kind);

            const beast = new BeastAvatar(kind, { seed: 3 });

            scene.add(beast.object);
            beast.update(1 / 30, 0, 0, 0);
            beast.object.updateMatrixWorld(true);
            renderer.render(scene, camera);

            const box = sizeOf(beast);
            const seen = { model: beast.model, long: box.max.z - box.min.z, low: box.min.y, tall: box.max.y - box.min.y, ways: [...beast.plan.attacks].sort() };

            scene.remove(beast.object);
            beast.dispose();

            return seen;
        };

        // (An ant falling dead, a few seconds on: rolled over, or fallen as its lent fall has it)
        const fall = () => {
            const beast = new BeastAvatar("ant", { seed: 3 });

            beast.update(1 / 30, 0, 0, 0);
            beast.object.updateMatrixWorld(true);

            const standing = chestOf(beast);

            beast.actions.die({ from: 1 });

            for (let k = 0; k < 120; k++) {
                beast.update(1 / 30, 0, 0, 0);
            }

            beast.object.updateMatrixWorld(true);

            const fell = { roll: beast.plan.object.children[0].rotation.z, dropped: standing - chestOf(beast), lent: "Death" in beast.plan.lengths };

            beast.dispose();

            return fell;
        };

        const ant = await look("ant");
        const before = fall();
        const centipede = await look("greatCentipede");
        const spider = await look("dungeonSpider");
        const elite = await look("eliteDungeonSpider");
        const queen = await look("antMonster");
        const after = fall();

        return { ant, before, centipede, spider, elite, queen, after, lent: modelOf("ant").animations.map(({ name }) => name).filter((name) => ["Death", "Hit React"].includes(name)).sort(), error: renderer.getContext().getError() };
    });

    // (The ant: 1.5 metres long, as it's made, half a metre high; its bite)
    expect(drawn.ant.model).toBe(true);
    expect(drawn.ant.long).toBeGreaterThan(1.2);
    expect(drawn.ant.long).toBeLessThan(1.8);
    expect(drawn.ant.tall).toBeLessThan(0.7);
    expect(drawn.ant.ways).toEqual(["bite"]);

    // (Its fall not lent it yet: rolled over onto its back)
    expect(drawn.before.lent).toBe(false);
    expect(Math.abs(drawn.before.roll)).toBeCloseTo(Math.PI, 1);

    // (The great centipede: four metres long, its feet on the ground, not hanging over it)
    expect(drawn.centipede.model).toBe(true);
    expect(drawn.centipede.long).toBeGreaterThan(3);
    expect(drawn.centipede.long).toBeLessThan(5);
    expect(Math.abs(drawn.centipede.low)).toBeLessThan(0.15);
    expect(drawn.centipede.ways).toEqual(["bite", "rear"]);

    // (The dungeon spider: 1.8 metres long, legs and all; its bites, its spring and its web)
    expect(drawn.spider.model).toBe(true);
    expect(drawn.spider.long).toBeGreaterThan(1.3);
    expect(drawn.spider.long).toBeLessThan(2.3);
    expect(Math.abs(drawn.spider.low)).toBeLessThan(0.1);
    expect(drawn.spider.ways).toEqual(["bite", "leap", "snap", "web"]);

    // (The elite dungeon spider: 2.8 metres long, on the ground; its sting and its web among its ways)
    expect(drawn.elite.model).toBe(true);
    expect(drawn.elite.long).toBeGreaterThan(2.1);
    expect(drawn.elite.long).toBeLessThan(3.5);
    expect(Math.abs(drawn.elite.low)).toBeLessThan(0.12);
    expect(drawn.elite.ways).toEqual(["bite", "lunge", "sting", "web"]);

    // (The Ant Monster: 4.2 metres long, its acid, its slam and its call among its ways)
    expect(drawn.queen.model).toBe(true);
    expect(drawn.queen.long).toBeGreaterThan(3.2);
    expect(drawn.queen.long).toBeLessThan(5.2);
    expect(drawn.queen.ways).toEqual(["bite", "call", "slam", "spit", "strike"]);

    // (Once the Ant Monster's read, the ant's lent its fall and flinch: falling as it does, onto
    // its belly, not rolled over)
    expect(drawn.lent).toEqual(["Death", "Hit React"]);
    expect(drawn.after.lent).toBe(true);
    expect(drawn.after.roll).toBe(0);
    expect(drawn.after.dropped).toBeGreaterThan(0.03);
    expect(drawn.error).toBe(0);

    // (Each file downloaded once)
    expect([...new Set(fetched.filter((url) => url.includes("/models/beasts/")).map((url) => url.replace(/^.*\/models\//, "").replace(/=[0-9a-f]{10}$/, "=")))].sort()).toEqual(["beasts/ant-monster.bin?h=", "beasts/ant.bin?h=", "beasts/centipede.bin?h=", "beasts/dungeon-spider.bin?h=", "beasts/elite-dungeon-spider.bin?h="]);
});

test("draws what else has crept into the ants' nests from their models: a dungeon scorpion and a giant cockroach on the ground, each as long as it's drawn; a dungeon wasp hovering about a metre over where it is, falling to the ground there dead", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { wantModel } = await import("./js/beasts/model.js");
        const { renderer } = window.pellagos.session.view;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
        const sizeOf = (beast) => new THREE.Box3().setFromObject(beast.plan.levels[0][0], true);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
        camera.position.set(6, 4, 8);
        camera.lookAt(0, 0.5, 0);

        // (Each drawn from its model once read: how long and how high, as it stands, and dead a
        // few seconds on)
        const look = async (kind) => {
            await wantModel(kind);

            const beast = new BeastAvatar(kind, { seed: 3 });

            scene.add(beast.object);
            beast.update(1 / 30, 0, 0, 0);
            beast.object.updateMatrixWorld(true);
            renderer.render(scene, camera);

            const box = sizeOf(beast);
            const seen = { model: beast.model, long: box.max.z - box.min.z, low: box.min.y, ways: [...beast.plan.attacks].sort() };

            beast.actions.die({ from: 1 });

            for (let k = 0; k < 150; k++) {
                beast.update(1 / 30, 0, 0, 0);
            }

            beast.object.updateMatrixWorld(true);
            seen.deadLow = sizeOf(beast).min.y;
            scene.remove(beast.object);
            beast.dispose();

            return seen;
        };

        return { scorpion: await look("dungeonScorpion"), roach: await look("giantCockroach"), wasp: await look("dungeonWasp"), error: renderer.getContext().getError() };
    });

    // (The dungeon scorpion: 2.4 metres long, tail and all, on the ground; its pincers and its sting)
    expect(drawn.scorpion.model).toBe(true);
    expect(drawn.scorpion.long).toBeGreaterThan(1.8);
    expect(drawn.scorpion.long).toBeLessThan(3);
    expect(Math.abs(drawn.scorpion.low)).toBeLessThan(0.1);
    expect(drawn.scorpion.ways).toEqual(["grab", "pinch", "snap", "sting"]);

    // (The giant cockroach: 2 metres long, feelers and all, on the ground; its bite, its pawing, rearing to strike)
    expect(drawn.roach.model).toBe(true);
    expect(drawn.roach.long).toBeGreaterThan(1.5);
    expect(drawn.roach.long).toBeLessThan(2.5);
    expect(Math.abs(drawn.roach.low)).toBeLessThan(0.1);
    expect(drawn.roach.ways).toEqual(["bite", "paw", "rear"]);

    // (The dungeon wasp: hanging in the air about a metre up, its stings and its dive; dead, on the ground)
    expect(drawn.wasp.model).toBe(true);
    expect(drawn.wasp.low).toBeGreaterThan(0.5);
    expect(drawn.wasp.low).toBeLessThan(1.5);
    expect(drawn.wasp.ways).toEqual(["dive", "jab", "lunge", "sting"]);
    expect(drawn.wasp.deadLow).toBeLessThan(0.3);
    expect(drawn.error).toBe(0);
});

test("draws the black widow from its model: on the ground, as long as it's drawn; lurking, hanging from its thread out of a blade's reach, drawn wherever the camera looks; dropping on it to the ground; its stand-in hanging upside down under its own thread", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const drawn = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { wantModel } = await import("./js/beasts/model.js");
        const { renderer } = window.pellagos.session.view;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
        const boxOf = (object) => new THREE.Box3().setFromObject(object, true);
        const culled = (beast) => {
            const meshes = [];

            beast.plan.object.traverse((node) => node.isSkinnedMesh && meshes.push(node.frustumCulled));

            return meshes.every(Boolean);
        };
        // (Posed a moment as it's told to hang, or not)
        const pose = (beast, hang) => {
            beast.hang(hang);
            beast.update(1 / 30, 0, 0, 0);
            beast.object.updateMatrixWorld(true);
        };

        scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
        camera.position.set(6, 4, 8);
        camera.lookAt(0, 1.5, 0);

        // Its stand-in first (before its model's read): upside down, under its thread
        const standIn = new BeastAvatar("blackWidow", { seed: 3 });

        scene.add(standIn.object);
        pose(standIn, { height: 4, roof: 4.9, u: null });

        const hungIn = { model: standIn.model, low: boxOf(standIn.plan.object).min.y, upside: Math.abs(standIn.plan.object.rotation.x - Math.PI) < 0.01, thread: Boolean(standIn.thread?.visible) };

        for (let k = 0; k <= 30; k++) {
            pose(standIn, { height: 4, roof: 4.9, u: k / 30 });
        }

        pose(standIn, null);
        hungIn.landed = boxOf(standIn.plan.object).min.y;
        hungIn.righted = standIn.plan.object.rotation.x;
        hungIn.threadGone = !standIn.thread.visible;
        scene.remove(standIn.object);
        standIn.dispose();

        // Then drawn from its model
        await wantModel("blackWidow");

        const beast = new BeastAvatar("blackWidow", { seed: 3 });

        scene.add(beast.object);
        pose(beast, null);
        renderer.render(scene, camera);

        const body = beast.plan.levels[0][0];
        const standing = boxOf(body);
        const seen = { model: beast.model, long: standing.max.z - standing.min.z, low: standing.min.y, ways: [...beast.plan.attacks].sort(), culled: culled(beast) };

        // (Hanging, its middle 4 metres up under a roof at 4.9: the lowest of it out of reach)
        pose(beast, { height: 4, roof: 4.9, u: null });
        renderer.render(scene, camera);
        seen.hanging = { low: boxOf(body).min.y, culled: culled(beast) };

        // (Dropping: halfway, on its way down; at its end, on its feet on the ground)
        pose(beast, { height: 4, roof: 4.9, u: 0.3 });
        seen.dropping = boxOf(body).min.y;
        pose(beast, { height: 4, roof: 4.9, u: 1 });
        seen.landed = boxOf(body).min.y;
        pose(beast, null);
        seen.after = { low: boxOf(body).min.y, culled: culled(beast) };
        scene.remove(beast.object);
        beast.dispose();

        return { standIn: hungIn, widow: seen, error: renderer.getContext().getError() };
    });

    // (Its stand-in: upside down, its lowest well over a head, its thread up to the roof; let down
    // onto its feet, its thread gone)
    expect(drawn.standIn.model).toBe(false);
    expect(drawn.standIn.upside).toBe(true);
    expect(drawn.standIn.low).toBeGreaterThan(2.5);
    expect(drawn.standIn.thread).toBe(true);
    expect(Math.abs(drawn.standIn.landed)).toBeLessThan(0.2);
    expect(drawn.standIn.righted).toBe(0);
    expect(drawn.standIn.threadGone).toBe(true);

    // (The black widow: 2.2 metres long, legs and all, on the ground; its bite and its pounce)
    expect(drawn.widow.model).toBe(true);
    expect(drawn.widow.long).toBeGreaterThan(1.8);
    expect(drawn.widow.long).toBeLessThan(2.6);
    expect(Math.abs(drawn.widow.low)).toBeLessThan(0.1);
    expect(drawn.widow.ways).toEqual(["bite", "leap"]);
    expect(drawn.widow.culled).toBe(true);

    // (Hanging out of a blade's reach, drawn wherever the camera looks; dropping, lower; down, on
    // the ground, culled as it was)
    expect(drawn.widow.hanging.low).toBeGreaterThan(2.2);
    expect(drawn.widow.hanging.low).toBeLessThan(4);
    expect(drawn.widow.hanging.culled).toBe(false);
    expect(drawn.widow.dropping).toBeLessThan(drawn.widow.hanging.low);
    expect(Math.abs(drawn.widow.landed)).toBeLessThan(0.15);
    expect(Math.abs(drawn.widow.after.low)).toBeLessThan(0.1);
    expect(drawn.widow.after.culled).toBe(true);
    expect(drawn.error).toBe(0);
});

test("lets a model go off the graphics card once none's drawn from it, and reads it again, without downloading it again, when it's wanted", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const kept = await page.evaluate(async () => {
        const THREE = await import("three");
        const { BeastAvatar } = await import("./js/beasts/beast.js");
        const { forgetModels, keptModels, modelOf, wantModel } = await import("./js/beasts/model.js");
        const { renderer } = window.pellagos.session.view;
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
        const scene = new THREE.Scene();
        const memory = () => ({ ...renderer.info.memory });

        camera.position.set(3, 2, 5);
        camera.lookAt(0, 1.2, 0);

        // (What three.js makes once, the first time it draws such a material, made first)
        const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());

        scene.add(plain);
        renderer.render(scene, camera);
        plain.removeFromParent();

        const gltf = await wantModel("werewolf");
        const before = memory();
        const beast = new BeastAvatar("werewolf", { seed: 1 });

        scene.add(beast.object);
        renderer.render(scene, camera);

        const drawn = memory();
        const held = keptModels();

        // (Let go of: kept a while (none forgotten yet), then forgotten)
        beast.object.removeFromParent();
        beast.dispose();

        const lingering = forgetModels(performance.now(), 60000);
        const unheld = keptModels();
        const gone = forgetModels(performance.now() + 120000, 60000);

        renderer.render(scene, camera);

        const after = memory();
        const read = modelOf("werewolf");

        // (Wanted again: read again from what the downloader kept, its four files (the model and
        // its three skins), nothing downloaded again; and drawn from again)
        const { done, fetched } = window.pellagos.fetcher;
        const again = await wantModel("werewolf");
        const status = window.pellagos.fetcher;
        const downloaded = { files: status.done - done, bytes: status.fetched - fetched };
        const another = new BeastAvatar("werewolf", { seed: 1 });

        scene.add(another.object);
        renderer.render(scene, camera);

        const redrawn = { model: another.model, error: renderer.getContext().getError() };

        another.dispose();

        return { before, drawn, after, held, unheld, lingering, gone, read, fresh: again !== gltf, downloaded, redrawn };
    });

    expect(kept.held).toEqual({ models: 1, unheld: 0 });
    expect(kept.unheld).toEqual({ models: 1, unheld: 1 });
    expect(kept.lingering).toBe(0);
    expect(kept.gone).toBe(1);
    expect(kept.read).toBeNull();

    // (Its pictures and shapes sent to the graphics card when it was drawn, and let go of with it)
    expect(kept.drawn.textures).toBeGreaterThan(kept.before.textures);
    expect(kept.after.textures).toBeLessThanOrEqual(kept.before.textures);
    expect(kept.after.geometries).toBeLessThan(kept.drawn.geometries);
    expect(kept.fresh).toBe(true);
    expect(kept.downloaded).toEqual({ files: 4, bytes: 0 });
    expect(kept.redrawn).toEqual({ model: true, error: 0 });
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
