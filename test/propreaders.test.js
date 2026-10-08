import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readObj, readStl } from "../scripts/lib/meshes.js";
import { readPng } from "../scripts/lib/png.js";

// A PNG of `rows` (each a filter type and its bytes), `kind` its colour type, `palette` if it has one,
// `depth` bits to a channel
function png(width, height, kind, rows, palette = null, depth = 8) {
    const chunk = (type, body) => {
        const head = Buffer.alloc(8);

        head.writeUInt32BE(body.length, 0);
        head.write(type, 4, "latin1");

        // (The reader doesn't check the CRC: any four bytes do)
        return Buffer.concat([head, body, Buffer.alloc(4)]);
    };
    const header = Buffer.alloc(13);

    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([depth, kind, 0, 0, 0], 8);

    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        ...(palette ? [chunk("PLTE", Buffer.from(palette))] : []),
        chunk("IDAT", deflateSync(Buffer.from(rows.flat()))),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

describe("the readers of models' own files (scripts/lib: png.js, meshes.js)", () => {
    test("reads a PNG's pixels whatever its rows' filters and its kind of colour", () => {
        // (Colour: one row unfiltered, the next by "up", each pixel adding to the one above)
        const colour = readPng(png(2, 2, 2, [[0, 10, 20, 30, 40, 50, 60], [2, 1, 1, 1, 2, 2, 2]]));

        assert.deepEqual([...colour.data], [10, 20, 30, 255, 40, 50, 60, 255, 11, 21, 31, 255, 42, 52, 62, 255]);

        // (Grey and alpha, by "sub": each byte adding to the one a pixel left)
        const grey = readPng(png(2, 1, 4, [[1, 100, 200, 5, 10]]));

        assert.deepEqual([...grey.data], [100, 100, 100, 200, 105, 105, 105, 210]);

        // (A palette's, and by "average" and "Paeth")
        const indexed = readPng(png(2, 1, 3, [[0, 1, 0]], [1, 2, 3, 4, 5, 6]));

        assert.deepEqual([...indexed.data], [4, 5, 6, 255, 1, 2, 3, 255]);
        assert.deepEqual([...readPng(png(1, 2, 0, [[0, 80], [3, 10]])).data], [80, 80, 80, 255, 50, 50, 50, 255]);
        assert.deepEqual([...readPng(png(1, 2, 0, [[0, 80], [4, 10]])).data], [80, 80, 80, 255, 90, 90, 90, 255]);
        assert.throws(() => readPng(png(1, 1, 5, [[0, 0]])), /8-bit/);

        // (A palette's of one bit to a pixel, eight to a byte; a grey's of two)
        assert.deepEqual([...readPng(png(3, 1, 3, [[0, 0b10100000]], [1, 2, 3, 4, 5, 6], 1)).data], [4, 5, 6, 255, 1, 2, 3, 255, 4, 5, 6, 255]);
        assert.deepEqual([...readPng(png(2, 1, 0, [[0, 0b11010000]], null, 2)).data], [255, 255, 255, 255, 85, 85, 85, 255]);
    });

    test("reads an OBJ's faces as triangles, a corner used again where it's the same", () => {
        const quad = readObj(["v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "vt 0 0", "vt 1 0", "vt 1 1", "vt 0 1", "vn 0 0 1", "f 1/1/1 2/2/1 3/3/1 4/4/1"].join("\n"));

        assert.equal(quad.indices.length, 6);
        assert.equal(quad.positions.length, 4 * 3);
        assert.deepEqual([...quad.uvs.slice(4, 6)], [1, 1]);
        assert.deepEqual([...quad.normals.slice(0, 3)], [0, 0, 1]);

        // (No normals of its own: each point's made from its faces; negative indices count back)
        const bare = readObj(["v 0 0 0", "v 0 0 1", "v 1 0 0", "f -3 -2 -1"].join("\n"));

        assert.equal(bare.uvs, null);
        assert.deepEqual([...bare.normals.slice(0, 3)].map((value) => Math.round(value)), [0, 1, 0]);
    });

    test("reads an STL's triangles, binary or text, its corners in the same place made one", () => {
        const text = readStl(Buffer.from("solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nfacet normal 0 0 1\nouter loop\nvertex 1 0 0\nvertex 1 1 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid s\n"));

        assert.equal(text.indices.length, 6);
        assert.equal(text.positions.length, 4 * 3);

        const binary = Buffer.alloc(84 + 50);

        binary.writeUInt32LE(1, 80);
        // (Its normal, then its three corners)
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, k) => binary.writeFloatLE(value, 84 + k * 4));

        const one = readStl(binary);

        assert.equal(one.indices.length, 3);
        assert.deepEqual([...one.normals.slice(0, 3)].map((value) => Math.round(value)), [0, 0, 1]);
    });
});
