// The page letting go of what the graphics card has (client/js/world/release.js): a static mesh's
// attributes once uploaded, a picture's pixels once uploaded (and whatever else holds them), the
// atlas's painted layers held by its texture alone (art/engine/atlas.js prepareAtlas); how
// much of its own copies the page still holds (heldOnPage); and Recast's WebAssembly starting with
// the memory it needs (scripts/wasm-memory.js, the vendored copy)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import * as THREE from "three";
import { atlasMaterial, LAYERS, prepareAtlas } from "../client/js/world/art/engine/atlas.js";
import { heldOnPage, releaseCompressed, released, releaseGeometry, releaseTexture } from "../client/js/world/release.js";
import { startingMemory, withStartingMemory } from "../scripts/wasm-memory.js";

const RECAST = new URL("../client/vendor/recast-navigation-0.44.0/recast-navigation.wasm.wasm", import.meta.url);

// A square ETC2 picture's levels as KTX2Loader makes them (half a byte a pixel, eight a block of
// four by four), down to a pixel
function etc2Levels(size) {
    const levels = [];

    for (let side = size; side >= 1; side >>= 1) {
        levels.push({ data: new Uint8Array(Math.ceil(side / 4) ** 2 * 8), width: side, height: side });
    }

    return levels;
}

describe("letting go of what the graphics card has (release.js)", () => {
    it("lets go of a mesh's attributes and index once each is uploaded, its bounds worked out first", () => {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
        geometry.setIndex([0, 1, 2]);
        released.any = false;
        assert.equal(releaseGeometry(geometry), geometry);
        assert.ok(geometry.boundingSphere.radius > 0, "its bounds, from its corners while there are any");
        assert.equal(released.any, false, "nothing gone till it's uploaded");

        // (As three.js's renderer does once a buffer's on the graphics card)
        geometry.attributes.position.onUploadCallback();
        assert.equal(geometry.attributes.position.array, null);
        assert.equal(geometry.attributes.position.count, 3, "how many it has, still known");
        assert.ok(geometry.attributes.uv.array, "each let go of as it's uploaded");
        geometry.attributes.uv.onUploadCallback();
        geometry.index.onUploadCallback();
        assert.equal(geometry.index.array, null);
        assert.equal(released.any, true);
    });

    it("lets go of a picture's pixels once uploaded, and whatever else holds them; not before, nor a picture with none yet", () => {
        const data = new Uint8Array(16);
        const texture = new THREE.DataTexture(data, 2, 2);
        const holder = { data };
        let was = 0;

        texture.onUpdate = () => was++;
        released.any = false;
        releaseTexture(texture, () => (holder.data = null));
        assert.equal(texture.image.data, data);

        // (As three.js's renderer does once a picture's on the graphics card)
        texture.onUpdate(texture);
        assert.equal(texture.image.data, null);
        assert.equal(holder.data, null);
        assert.equal(was, 1, "what it was told before, still told");
        assert.equal(released.any, true);

        // (A picture waiting for its pixels: uploaded empty, nothing to let go of, nor told)
        const waiting = new THREE.DataArrayTexture(null, 2, 2, 2);
        let also = 0;

        releaseTexture(waiting, () => also++);
        waiting.onUpdate(waiting);
        assert.equal(also, 0);
        waiting.image.data = new Uint8Array(32);
        waiting.onUpdate(waiting);
        assert.equal(waiting.image.data, null);
        assert.equal(also, 1);
    });

    it("hands the atlas's painted layers to nothing that waits for them: its texture alone has them, till it's sent", async () => {
        // (Small layers, painted here and now: Node has no workers of the page's kind)
        const waited = prepareAtlas(8);
        const texture = atlasMaterial().userData.atlas;

        assert.equal(texture.image.data, null, "asked for while they're painted: none yet");
        // (A promise keeps what it resolved with as long as anything keeps the promise, and the
        // game's build keeps this one in a closure for the whole game)
        assert.equal(await waited, undefined, "what waits for them is given nothing to keep");
        assert.equal(prepareAtlas(8), waited);
        assert.equal(texture.image.data.byteLength, 8 * 8 * 4 * LAYERS.length, "the texture has them once they're painted");

        // (As three.js's renderer does once a picture's on the graphics card)
        texture.onUpdate(texture);
        assert.equal(texture.image.data, null);
        assert.equal(await prepareAtlas(8), undefined);
    });

    it("lets go of a compressed picture's bytes once uploaded: its levels left as new ones of their sizes, so a copy made before still has them to send; marked to be sent again, it isn't", () => {
        const texture = new THREE.CompressedTexture(etc2Levels(64), 64, 64, THREE.RGB_ETC2_Format);
        const levels = texture.mipmaps;
        let [was, also] = [0, 0];

        texture.needsUpdate = true;
        texture.onUpdate = () => was++;
        released.any = false;
        assert.equal(releaseCompressed(texture, () => also++), texture);
        assert.ok(texture.mipmaps[0].data, "nothing gone till it's uploaded");

        // (A copy made before it's sent shares its levels, as three.js's clone does)
        const copy = texture.clone();
        const version = texture.version;

        // (As three.js's renderer does once a picture's on the graphics card)
        texture.onUpdate(texture);
        assert.deepEqual(
            texture.mipmaps.map(({ width, height, data }) => [width, height, data]),
            levels.map(({ width, height }) => [width, height, undefined]),
        );
        assert.ok(
            levels.every((level) => level.data),
            "the levels it had, as they were",
        );
        assert.ok(
            copy.mipmaps.every((level, k) => level === levels[k] && level.data),
            "its copy's, still to send",
        );
        assert.deepEqual([was, also, released.any], [1, 1, true]);

        // (Marked again, by what sets it up for another use: nothing to send, so it isn't sent)
        texture.needsUpdate = true;
        assert.equal(texture.version, version);
        texture.onUpdate(texture);
        assert.deepEqual([was, also], [2, 1], "let go of once");

        // (A copy of it is its own to mark)
        copy.needsUpdate = true;
        assert.ok(copy.version > 0);
    });

    it("lets go of a compressed picture given as any picture is (releaseTexture): its bytes are its levels', not its image's", () => {
        const texture = new THREE.CompressedTexture(etc2Levels(16), 16, 16, THREE.RGB_ETC2_Format);
        let also = 0;

        releaseTexture(texture, () => also++);
        texture.onUpdate(texture);
        assert.ok(texture.mipmaps.length > 1 && texture.mipmaps.every((level) => !("data" in level)));
        assert.equal(also, 1);
    });
});

describe("Recast's WebAssembly memory (scripts/wasm-memory.js)", () => {
    it("counts what the page still holds of objects: their meshes' attributes, morphs and indices, and their pictures' pixels, each once however many share it; none let go of", () => {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(30), 3));
        geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(30), 3)];
        geometry.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(6), 1));

        const data = new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16);
        const canvas = new THREE.Texture({ width: 64, height: 32 });
        const material = new THREE.MeshStandardMaterial({ map: data, normalMap: canvas });
        const body = new THREE.Group();

        // (Two meshes sharing a mesh and its pictures: counted once)
        body.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));

        const once = 120 + 120 + 12 + 16 * 16 * 4 + 64 * 32 * 4;

        assert.equal(heldOnPage([body]), once);
        assert.equal(heldOnPage([body, body.clone()]), once, "a clone shares them");
        assert.equal(heldOnPage([null, undefined]), 0);

        // (Let go of once uploaded: no longer counted)
        geometry.attributes.position.array = null;
        data.image.data = null;
        assert.equal(heldOnPage([body]), once - 120 - 16 * 16 * 4);
    });

    it("counts a compressed picture as its levels' bytes, as compressed as they are, not four bytes a pixel; none once they're let go of; and the pictures of materials no mesh wears, asked for", () => {
        const levels = etc2Levels(1024);
        const held = levels.reduce((sum, { data }) => sum + data.byteLength, 0);
        const texture = new THREE.CompressedTexture(levels, 1024, 1024, THREE.RGB_ETC2_Format);
        const skin = new THREE.CompressedTexture(etc2Levels(256), 256, 256, THREE.RGB_ETC2_Format);
        const body = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [new THREE.MeshStandardMaterial({ map: texture }), new THREE.MeshStandardMaterial({ normalMap: texture })]);

        // (Bones and empty nodes: nothing of theirs to count)
        body.add(mesh, new THREE.Bone(), new THREE.Object3D());

        // (A 1024-pixel ETC2 picture with its levels: 0.67 MB, where it was counted 4)
        assert.ok(held > 0.66 * 1048576 && held < 0.67 * 1048576, `${held} bytes`);
        assert.equal(heldOnPage([body]), held);

        // (A skin's materials, which nothing of the model's own wears)
        const worn = [new THREE.MeshStandardMaterial({ map: skin, normalMap: texture })];

        assert.equal(heldOnPage([body], worn), held + etc2Levels(256).reduce((sum, { data }) => sum + data.byteLength, 0));
        assert.equal(heldOnPage([], worn) > 0, true);

        // (Let go of once uploaded: no longer counted)
        releaseCompressed(texture);
        texture.onUpdate(texture);
        assert.equal(heldOnPage([body]), 0);
    });

    it("starts with 16 MB, not the 64 it was built with, and grows from there; nothing else in it changed", async () => {
        const bytes = new Uint8Array(await readFile(RECAST));

        assert.equal(startingMemory(bytes), 16 * 1048576);

        // (Still a module, its memory its own: what the glue takes as Recast's heap)
        const module = await WebAssembly.compile(bytes);

        assert.ok(WebAssembly.Module.exports(module).some(({ kind }) => kind === "memory"));

        // (Made to start with 64 again, it's the module as it was built, but for those two bytes)
        const rebuilt = withStartingMemory(bytes, 64);
        const differing = rebuilt.reduce((count, byte, k) => count + (byte !== bytes[k]), 0);

        assert.equal(startingMemory(rebuilt), 64 * 1048576);
        assert.equal(rebuilt.length, bytes.length);
        assert.ok(differing <= 2);
        assert.throws(() => withStartingMemory(bytes, 4096), /more than the module's most/);
        assert.throws(() => startingMemory(new Uint8Array([1, 2, 3, 4])), /Not a WebAssembly module/);
    });
});
