// The page letting go of what the graphics card has (client/js/world/release.js): a static mesh's
// attributes once uploaded, a picture's pixels once uploaded (and whatever else holds them); and
// Recast's WebAssembly starting with the memory it needs (scripts/wasm-memory.js, the vendored copy)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import * as THREE from "three";
import { released, releaseGeometry, releaseTexture } from "../client/js/world/release.js";
import { startingMemory, withStartingMemory } from "../scripts/wasm-memory.js";

const RECAST = new URL("../client/vendor/recast-navigation-0.43.1/recast-navigation.wasm.wasm", import.meta.url);

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
});

describe("Recast's WebAssembly memory (scripts/wasm-memory.js)", () => {
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
