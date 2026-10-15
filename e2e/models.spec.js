import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures.js";

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
