// The crowds' figures kept between sessions (client/js/world/figurestore.js): a figure as one run
// of bytes and back, drawn with the same numbers; what it's kept under; and the store in the
// browser's Cache storage (a stand-in for it here): under the code's version, the most recent
// kept, never failing where the storage does. (Read by the crowds: test/crowd.test.js.)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { FIGURES_KEPT, figureBytes, figureFrom, figureId, FigureStore, figureStore } from "../client/js/world/figurestore.js";
import { released } from "../client/js/world/release.js";

// A figure as templateFrom makes one (world/crowd.js), packed: three corners, a triangle near and
// one far, two moments of two bones' moves, and a picture four pixels by two on a canvas
function template(key = "human:m:sword") {
    const geometry = new THREE.BufferGeometry();
    const pixels = Uint8ClampedArray.from({ length: 32 }, (_, k) => (k * 7) % 256);
    const canvas = { width: 4, height: 2, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.5, 1.75, 0, -0.5, 1.75, 0.25]), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Int8Array([0, 0, 127, 0, 127, 0, -127, 0, 0]), 3, true));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Uint16Array([0, 0, 65535, 0, 0, 65535]), 2, true));
    geometry.setAttribute("crowdBones", new THREE.BufferAttribute(new Uint8Array([0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]), 4));
    geometry.setAttribute("crowdWeights", new THREE.BufferAttribute(new Uint8Array([200, 55, 0, 0, 255, 0, 0, 0, 128, 127, 0, 0]), 4, true));

    const nearIndex = new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1);
    const farIndex = new THREE.BufferAttribute(new Uint16Array([2, 1, 0]), 1);

    geometry.setIndex(nearIndex);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const moves = new THREE.DataTexture(Uint16Array.from({ length: 2 * 7 * 4 }, (_, k) => k * 31), 7, 2, THREE.RGBAFormat, THREE.HalfFloatType);
    const table = { guard: { start: 0, frames: 2, length: 0.1, loop: true }, die: { start: 1, frames: 1, length: 0.05, loop: false, lands: 0.9 } };

    return { key, geometry, nearIndex, farIndex, picture: new THREE.CanvasTexture(canvas), moves, table, flags: 6, height: 1.75, packed: true, pixels };
}

// The browser's Cache storage, as much of it as the store asks of: each cache a Map of bytes by
// address; `fail`, everything it's asked refused
function storage({ fail = false } = {}) {
    const stores = new Map();
    const refuse = () => {
        if (fail) {
            throw new DOMException("The operation is insecure.", "SecurityError");
        }
    };

    return {
        stores,
        async open(name) {
            refuse();

            const entries = stores.get(name) ?? stores.set(name, new Map()).get(name);

            return {
                match: async (url) => (entries.has(String(url)) ? new Response(entries.get(String(url)).slice(0)) : undefined),
                put: async (url, response) => void entries.set(String(url), await response.arrayBuffer()),
                delete: async (url) => entries.delete(String(url)),
                keys: async () => [...entries.keys()].map((url) => ({ url })),
            };
        },
    };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("a crowd's figure as bytes (figurestore.js figureBytes, figureFrom)", () => {
    it("comes back as it was kept: its corners, each as what it's kept as, its triangles near and far, its moves, its picture's pixels, its bounds and what its moves are", () => {
        const made = template();
        const bytes = figureBytes(made);

        assert.ok(bytes instanceof ArrayBuffer && bytes.byteLength % 8 === 0);

        const read = figureFrom(bytes, "human:m:sword");

        assert.deepEqual(Object.keys(read.geometry.attributes), Object.keys(made.geometry.attributes));

        for (const [name, attribute] of Object.entries(made.geometry.attributes)) {
            const kept = read.geometry.attributes[name];

            assert.equal(kept.array.constructor, attribute.array.constructor, name);
            assert.deepEqual([kept.itemSize, kept.normalized, [...kept.array]], [attribute.itemSize, attribute.normalized, [...attribute.array]], name);
            assert.equal(kept.array.buffer, bytes, "read where it is, not copied");
        }

        assert.deepEqual([...read.nearIndex.array], [0, 1, 2]);
        assert.deepEqual([...read.farIndex.array], [2, 1, 0]);
        assert.equal(read.geometry.index, read.nearIndex);
        assert.deepEqual(read.geometry.boundingBox, made.geometry.boundingBox);
        assert.deepEqual(read.geometry.boundingSphere, made.geometry.boundingSphere);
        assert.deepEqual([read.key, read.height, read.flags, read.packed, read.kept], ["human:m:sword", 1.75, 6, true, true]);
        assert.deepEqual(read.table, made.table);

        // (Its moves as half floats, a row a moment; its picture as the canvas it was painted on
        // is drawn: smoothed, mipmapped, the right way up)
        assert.deepEqual([read.moves.image.width, read.moves.image.height, read.moves.type, [...read.moves.image.data]], [7, 2, THREE.HalfFloatType, [...made.moves.image.data]]);
        assert.ok(read.moves.version > 0 && read.picture.version > 0, "each to be sent");
        assert.deepEqual([read.picture.image.width, read.picture.image.height, [...read.picture.image.data]], [4, 2, [...made.pixels]]);
        assert.deepEqual(
            [read.picture.flipY, read.picture.colorSpace, read.picture.anisotropy, read.picture.magFilter, read.picture.minFilter, read.picture.generateMipmaps],
            [false, THREE.SRGBColorSpace, 2, made.picture.magFilter, made.picture.minFilter, true],
        );
    });

    it("lets go of the page's copy of all of it once the graphics card has each", () => {
        const read = figureFrom(figureBytes(template()), "human:m:sword");

        released.any = false;

        for (const attribute of [...Object.values(read.geometry.attributes), read.nearIndex, read.farIndex]) {
            attribute.onUploadCallback();
            assert.equal(attribute.array, null);
        }

        for (const texture of [read.moves, read.picture]) {
            texture.onUpdate(texture);
            assert.equal(texture.image.data, null);
        }

        assert.equal(released.any, true);
    });

    it("keeps none that isn't as it's meant to be kept, and reads none that isn't a figure's bytes or isn't the kind asked for", () => {
        // (Its fewer triangles still to come: every corner as it was numbered, a list to come late)
        assert.equal(figureBytes({ ...template(), packed: false }), null);
        assert.equal(figureBytes({ ...template(), farIndex: null }), null);
        // (No picture to read; its corners already let go of)
        assert.equal(figureBytes({ ...template(), picture: null }), null);

        const gone = template();

        gone.nearIndex.array = null;
        assert.equal(figureBytes(gone), null);

        const bytes = figureBytes(template());

        assert.throws(() => figureFrom(bytes, "orc:m:axe"), /human:m:sword's, not orc:m:axe's/);
        assert.throws(() => figureFrom(new ArrayBuffer(64), "human:m:sword"), /Not a figure/);
        assert.throws(() => figureFrom(new ArrayBuffer(4), "human:m:sword"), /Not a figure/);
        assert.throws(() => figureFrom(bytes.slice(0, bytes.byteLength - 16), "human:m:sword"), /cut short/);

        // (Laid out another way, by other code)
        const other = bytes.slice(0);

        new DataView(other).setUint32(4, FIGURES_KEPT.format + 1, true);
        assert.throws(() => figureFrom(other, "human:m:sword"), /Not a figure/);
    });
});

describe("what a figure's kept under (figurestore.js figureId)", () => {
    const kit = { atlas: { size: 512 }, lods: {} };
    const spec = { size: 256, look: { shape: { macro: { height: 0.6 } }, look: { hair: "bob" }, equipment: ["sword", "shield"], walk: "plain" }, guard: "sword", attack: { animation: "sword", hitAt: 380, duration: 760 }, reaction: "slash" };

    it("is its kind and all it's made from: the same for the same, another for another picture size, look, skin size or kind", () => {
        const id = figureId(kit, "human:m:sword", spec);

        assert.match(id, /^human-m-sword-[0-9a-f]{16}$/);
        assert.equal(figureId({ ...kit }, "human:m:sword", structuredClone(spec)), id);

        const others = [
            figureId(kit, "human:m:sword", { ...spec, size: 512 }),
            figureId(kit, "human:m:sword", { ...spec, look: { ...spec.look, walk: "proud" } }),
            figureId(kit, "human:m:sword", { ...spec, calm: true }),
            figureId({ ...kit, atlas: { size: 1024 } }, "human:m:sword", spec),
            figureId({ ...kit, lods: null }, "human:m:sword", spec),
            figureId(kit, "human:f:sword", spec),
        ];

        assert.equal(new Set([id, ...others]).size, others.length + 1);
    });

    it("is none for a kind made its own way (a beast's), or whose making can't be written down", () => {
        const round = { size: 256 };

        round.self = round;
        assert.equal(figureId(kit, "herd:wolf:0", { size: 256, make: function* () {}, id: "wolf" }), null);
        assert.equal(figureId(kit, "human:m:sword", round), null);
    });
});

describe("the figures kept in the browser's storage (figurestore.js FigureStore)", () => {
    const base = "https://pellagos.test/game/";
    const bytesOf = (text) => new TextEncoder().encode(text).buffer;
    const textOf = (bytes) => bytes && new TextDecoder().decode(bytes);

    it("keeps a figure's bytes under the code's version and finds them again, in another session too; none it wasn't given", async () => {
        const caches = storage();
        const store = new FigureStore({ caches, version: "0123456789", base, settle: 0 });

        assert.equal(store.on, true);
        assert.equal(await store.find("human-m-sword-aa"), null);
        assert.equal(await store.keep("human-m-sword-aa", bytesOf("a swordsman")), true);
        assert.equal(textOf(await store.find("human-m-sword-aa")), "a swordsman");
        assert.equal(await store.find("orc-m-axe-bb"), null);
        assert.deepEqual([...caches.stores.keys()], [FIGURES_KEPT.cache]);
        assert.ok(caches.stores.get(FIGURES_KEPT.cache).has(`${base}figures/0123456789/human-m-sword-aa.bin`));
        await settled();

        // (The next session: read, not made)
        const next = new FigureStore({ caches, version: "0123456789", base, settle: 0 });

        assert.equal(textOf(await next.find("human-m-sword-aa")), "a swordsman");
    });

    it("lets go of what other code's version kept, the first time it's opened", async () => {
        const caches = storage();
        const old = new FigureStore({ caches, version: "aaaaaaaaaa", base, settle: 0 });

        await old.keep("human-m-sword-aa", bytesOf("as the old code made it"));
        await settled();

        const store = new FigureStore({ caches, version: "bbbbbbbbbb", base, settle: 0 });

        assert.equal(await store.find("human-m-sword-aa"), null);
        await store.keep("human-m-sword-aa", bytesOf("as the new code makes it"));
        await settled();
        assert.deepEqual([...caches.stores.get(FIGURES_KEPT.cache).keys()].sort(), [`${base}figures/bbbbbbbbbb/human-m-sword-aa.bin`, `${base}figures/used.json`]);
        assert.equal(textOf(await store.find("human-m-sword-aa")), "as the new code makes it");
    });

    it("keeps the most recent, by when each was last kept or read, across sessions; the longest unused let go of", async () => {
        const caches = storage();
        const time = { now: 1000 };
        const session = () => new FigureStore({ caches, version: "0123456789", base, most: 3, now: () => time.now, settle: 0 });
        const first = session();

        for (const id of ["a", "b", "c"]) {
            time.now += 1000;
            await first.keep(id, bytesOf(id));
        }

        // (The oldest read since: not the longest unused any more)
        time.now += 1000;
        assert.equal(textOf(await first.find("a")), "a");
        await settled();

        // (Another session: a fourth kept, and the one unused longest, the second, let go of)
        const second = session();

        time.now += 1000;
        await second.keep("d", bytesOf("d"));
        assert.deepEqual([textOf(await second.find("a")), await second.find("b"), textOf(await second.find("c")), textOf(await second.find("d"))], ["a", null, "c", "d"]);
        assert.equal(FIGURES_KEPT.most, 40);

        // (One whose time was never written down: taken as the oldest)
        caches.stores.get(FIGURES_KEPT.cache).set(`${base}figures/0123456789/e.bin`, bytesOf("e"));

        const third = session();

        time.now += 1000;
        await third.keep("f", bytesOf("f"));
        assert.deepEqual([await third.find("e"), textOf(await third.find("f"))], [null, "f"]);
        await settled();
    });

    it("keeps none and finds none for a copy run from the repository (\"dev\"), where there's no storage, or where it refuses; and never fails", async () => {
        const caches = storage();
        const dev = new FigureStore({ caches, version: "dev", base });

        assert.equal(dev.on, false);
        assert.equal(await dev.keep("a", bytesOf("a")), false);
        assert.equal(await dev.find("a"), null);
        assert.equal(caches.stores.size, 0);

        const none = new FigureStore({ caches: null, version: "0123456789", base });

        assert.equal(none.on, false);
        assert.equal(await none.find("a"), null);

        const refused = new FigureStore({ caches: storage({ fail: true }), version: "0123456789", base });

        assert.equal(await refused.keep("a", bytesOf("a")), false);
        assert.equal(await refused.find("a"), null);

        // (Nothing to keep: a figure that couldn't be written down)
        assert.equal(await new FigureStore({ caches, version: "0123456789", base, settle: 0 }).keep("a", null), false);

        // (The game's own, here: no storage, and the code's unstamped)
        assert.equal(figureStore(), null);
    });
});
