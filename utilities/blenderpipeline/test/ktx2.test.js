// KTX2 textures (lib/ktx2.js): each made a power of two on each side before it's encoded, the
// GPU's compressed formats being made of 4 x 4 blocks; resampled, larger or smaller, keeping what
// it shows.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Document } from "@gltf-transform/core";
import { encode as encodePng } from "fast-png";
import { encodeTextures, powerOfTwo, resizeImage } from "../lib/ktx2.js";

// An RGBA image: pixel(x, y) -> [r, g, b, a]
function image(width, height, pixel) {
    const data = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            data.set(pixel(x, y), (y * width + x) * 4);
        }
    }

    return { data, width, height };
}

// A KTX2 file's size, from its header (pixelWidth and pixelHeight, after the 12-byte identifier
// and the format and type size)
function sizeOf(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    return [view.getUint32(20, true), view.getUint32(24, true)];
}

describe("KTX2 textures (lib/ktx2.js)", () => {
    it("are a power of two on each side: the nearest, no more than the most asked for", () => {
        assert.deepEqual([907, 1024, 600, 768, 12, 7, 1, 3].map((size) => powerOfTwo(size)), [1024, 1024, 512, 1024, 16, 8, 1, 4]);
        assert.equal(powerOfTwo(907, 1000), 512);
        assert.equal(powerOfTwo(907, 1024), 1024);
        assert.equal(powerOfTwo(3000, 2048), 2048);
    });

    it("are resampled larger or smaller keeping what they show: a flat colour stays flat, a left-to-right ramp stays one", () => {
        const flat = resizeImage(image(13, 7, () => [200, 100, 50, 128]), 16, 8);

        assert.deepEqual([flat.width, flat.height], [16, 8]);
        assert.ok(flat.data.every((value, i) => value === [200, 100, 50, 128][i % 4]));

        for (const width of [32, 4]) {
            const ramp = resizeImage(image(10, 3, (x) => [x * 25, 0, 0, 255]), width, 4);
            const row = Array.from({ length: width }, (_, x) => ramp.data[x * 4]);

            assert.ok(row.every((value, x) => x === 0 || value >= row[x - 1]), `${width} across: ${row}`);
            assert.ok(row[0] < 40 && row.at(-1) > 185, `${width} across: ${row}`);
        }

        const same = image(4, 4, () => [1, 2, 3, 4]);

        assert.equal(resizeImage(same, 4, 4), same);
    });

    it("are encoded at that size, the texture 12 x 7 a KTX2 16 x 8 (and one of 1000 most, 300 x 30 a 256 x 32)", async () => {
        const document = new Document();
        const png = (width, height) => encodePng(image(width, height, (x, y) => [x * 20, y * 30, 90, 255]));
        const odd = document.createTexture("odd").setImage(png(12, 7)).setMimeType("image/png");
        const long = document.createTexture("long").setImage(png(300, 30)).setMimeType("image/png");

        document.createMaterial("one").setBaseColorTexture(odd).setEmissiveTexture(long);

        const done = await encodeTextures(document, { color: "etc1s", data: "etc1s", normal: "uastc", quality: 128, normalSize: null }, { maxSize: 1000 });

        assert.deepEqual(
            done.map(({ name, width, height }) => [name, width, height]),
            [
                ["odd", 16, 8],
                ["long", 256, 32],
            ],
        );
        assert.deepEqual(sizeOf(odd.getImage()), [16, 8]);
        assert.deepEqual(sizeOf(long.getImage()), [256, 32]);
        assert.equal(odd.getMimeType(), "image/ktx2");
    });
});
