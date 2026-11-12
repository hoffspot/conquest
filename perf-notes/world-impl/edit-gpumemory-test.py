import sys
p = sys.argv[1] + '/test/gpumemory.test.js'
s = open(p).read()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


swap('''import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GpuMemory, megabytes, texelBytes } from "../client/js/world/gpumemory.js";
''', '''import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import * as THREE from "three";
// (How three.js names the formats it asks WebGL for: not part of what it gives out)
import { WebGLUtils } from "three/src/renderers/webgl/WebGLUtils.js";
import { GpuMemory, imageBytes, megabytes, texelBytes } from "../client/js/world/gpumemory.js";
''')

swap('''    for (const name of ["bufferData", "deleteBuffer", "texImage2D", "texImage3D", "texStorage2D", "texStorage3D", "compressedTexImage2D", "copyTexImage2D", "generateMipmap", "deleteTexture", "renderbufferStorage", "renderbufferStorageMultisample", "deleteRenderbuffer"]) {''',
     '''    for (const name of ["bufferData", "deleteBuffer", "texImage2D", "texImage3D", "texStorage2D", "texStorage3D", "compressedTexImage2D", "compressedTexSubImage2D", "compressedTexSubImage3D", "copyTexImage2D", "generateMipmap", "deleteTexture", "renderbufferStorage", "renderbufferStorageMultisample", "deleteRenderbuffer"]) {''')

swap('''        assert.equal(texelBytes(0x1903, 0x1903, 0x1401), 1, "one byte of red");
        assert.equal(megabytes(1.25 * MB), 1.3);
    });
});
''', '''        assert.equal(texelBytes(0x1903, 0x1903, 0x1401), 1, "one byte of red");
        assert.equal(megabytes(1.25 * MB), 1.3);
    });
});

// The compressed formats WebGL has, by name: each one's number, as its extension's page gives it
const COMPRESSED = {
    COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0,
    COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1,
    COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2,
    COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3,
    COMPRESSED_SRGB_S3TC_DXT1_EXT: 0x8c4c,
    COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT: 0x8c4d,
    COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT: 0x8c4e,
    COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: 0x8c4f,
    COMPRESSED_RED_RGTC1_EXT: 0x8dbb,
    COMPRESSED_SIGNED_RED_RGTC1_EXT: 0x8dbc,
    COMPRESSED_RED_GREEN_RGTC2_EXT: 0x8dbd,
    COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT: 0x8dbe,
    COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c,
    COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d,
    COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT: 0x8e8e,
    COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT: 0x8e8f,
    COMPRESSED_RGB_ETC1_WEBGL: 0x8d64,
    COMPRESSED_R11_EAC: 0x9270,
    COMPRESSED_SIGNED_R11_EAC: 0x9271,
    COMPRESSED_RG11_EAC: 0x9272,
    COMPRESSED_SIGNED_RG11_EAC: 0x9273,
    COMPRESSED_RGB8_ETC2: 0x9274,
    COMPRESSED_SRGB8_ETC2: 0x9275,
    COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2: 0x9276,
    COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2: 0x9277,
    COMPRESSED_RGBA8_ETC2_EAC: 0x9278,
    COMPRESSED_SRGB8_ALPHA8_ETC2_EAC: 0x9279,
    COMPRESSED_RGB_PVRTC_4BPPV1_IMG: 0x8c00,
    COMPRESSED_RGB_PVRTC_2BPPV1_IMG: 0x8c01,
    COMPRESSED_RGBA_PVRTC_4BPPV1_IMG: 0x8c02,
    COMPRESSED_RGBA_PVRTC_2BPPV1_IMG: 0x8c03,
    ...Object.fromEntries(["4x4", "5x4", "5x5", "6x5", "6x6", "8x5", "8x6", "8x8", "10x5", "10x6", "10x8", "10x10", "12x10", "12x12"].flatMap((block, k) => [[`COMPRESSED_RGBA_ASTC_${block}_KHR`, 0x93b0 + k], [`COMPRESSED_SRGB8_ALPHA8_ASTC_${block}_KHR`, 0x93d0 + k]])),
};

describe("compressed pictures, counted by their blocks (gpumemory.js)", () => {
    // A picture's levels' sizes, from its full size down to a texel
    const levels = (size) => Array.from({ length: Math.log2(size) + 1 }, (_, level) => size >> level);

    it("counts one given as three.js gives it, storage for every level and then each level's blocks: a 1024 picture with its mipmaps 1.33 MB, not the 5.33 MB of four bytes a texel", () => {
        const gl = context();
        const memory = new GpuMemory().watch(gl);
        const given = (internalformat, size = 1024) => {
            const texture = {};
            const before = memory.bytes.textures;

            gl.bindTexture(0x0de1, texture);
            gl.texStorage2D(0x0de1, levels(size).length, internalformat, size, size);

            const stored = memory.bytes.textures - before;

            levels(size).forEach((side, level) => gl.compressedTexSubImage2D(0x0de1, level, 0, 0, side, side, internalformat, new Uint8Array(imageBytes(internalformat, side, side))));
            assert.equal(memory.bytes.textures - before, stored, "its blocks hold no more than its storage");

            return stored;
        };
        // (Blocks of 4 by 4: 256 a side, 128, ... 1, 1, 1)
        const blocks = 65536 + 16384 + 4096 + 1024 + 256 + 64 + 16 + 4 + 1 + 1 + 1;

        assert.equal(given(COMPRESSED.COMPRESSED_RGBA_ASTC_4x4_KHR), blocks * 16);
        assert.equal(megabytes(blocks * 16), 1.3);
        assert.equal(given(COMPRESSED.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR), blocks * 16);
        assert.equal(given(COMPRESSED.COMPRESSED_RGBA_BPTC_UNORM_EXT), blocks * 16, "BC7");
        assert.equal(given(COMPRESSED.COMPRESSED_RGBA8_ETC2_EAC), blocks * 16);
        assert.equal(given(COMPRESSED.COMPRESSED_RGB8_ETC2), blocks * 8, "ETC2 without alpha: half");
        assert.equal(given(COMPRESSED.COMPRESSED_RGB_S3TC_DXT1_EXT), blocks * 8);
        // (Blocks of 8 by 8: 128 a side down to 1, the last three levels a block each)
        assert.equal(given(COMPRESSED.COMPRESSED_RGBA_ASTC_8x8_KHR), (16384 + 4096 + 1024 + 256 + 64 + 16 + 4 + 1 + 1 + 1 + 1) * 16);
        assert.equal(memory.count.textures, 7);
        assert.equal(gl.calls.filter(([name]) => name === "compressedTexSubImage2D").length, 7 * 11, "each call still made");

        // (A cube's six faces; an array's layers, a level at a time)
        const [cube, array] = [{}, {}];
        const before = memory.bytes.textures;

        gl.bindTexture(0x8513, cube);
        gl.texStorage2D(0x8513, 1, COMPRESSED.COMPRESSED_RGBA_ASTC_4x4_KHR, 64, 64);
        assert.equal(memory.bytes.textures - before, 6 * 16 * 16 * 16);
        gl.bindTexture(0x8c1a, array);
        gl.texStorage3D(0x8c1a, 2, COMPRESSED.COMPRESSED_RGB8_ETC2, 64, 64, 5);
        assert.equal(memory.bytes.textures - before, 6 * 16 * 16 * 16 + 5 * (16 * 16 + 8 * 8) * 8);

        // (Given back)
        gl.deleteTexture(cube);
        gl.deleteTexture(array);
        assert.equal(memory.bytes.textures, before);
    });

    it("knows a compressed format's bytes a texel and a picture's bytes, a level smaller than a block still a block", () => {
        assert.equal(texelBytes(COMPRESSED.COMPRESSED_RGBA_ASTC_4x4_KHR), 1);
        assert.equal(texelBytes(COMPRESSED.COMPRESSED_RGB8_ETC2), 0.5);
        assert.equal(texelBytes(COMPRESSED.COMPRESSED_RGBA_ASTC_12x12_KHR), 16 / 144);
        assert.equal(texelBytes(COMPRESSED.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG), 0.25);
        assert.equal(imageBytes(COMPRESSED.COMPRESSED_RGBA_ASTC_8x8_KHR, 1, 1), 16);
        assert.equal(imageBytes(COMPRESSED.COMPRESSED_RGBA_ASTC_10x5_KHR, 21, 11), 3 * 3 * 16);
        assert.equal(imageBytes(COMPRESSED.COMPRESSED_RGBA_S3TC_DXT5_EXT, 128, 64), 32 * 16 * 16);
        // (PVRTC's held no smaller than 8 texels a side, 16 across at 2 bits a texel)
        assert.equal(imageBytes(COMPRESSED.COMPRESSED_RGB_PVRTC_4BPPV1_IMG, 64, 64), 2048);
        assert.equal(imageBytes(COMPRESSED.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG, 2, 2), 32);
        assert.equal(imageBytes(COMPRESSED.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG, 4, 4), 32);
        // (And any other format's, its texels')
        assert.equal(imageBytes(0x8058, 3, 5), 60);
        assert.equal(imageBytes(0x1908, 3, 5, 0x1908, 0x1406), 240);
    });

    it("knows every compressed format three.js can ask WebGL for: none counted at four bytes a texel (a newer three.js with one more fails here)", () => {
        // (WebGL and its extensions, as far as their names go: each constant its own name)
        const named = new Proxy({}, { get: (_, name) => name });
        const utils = new WebGLUtils(named, { get: () => named, has: () => true });
        const asked = new Set();

        for (const [name, format] of Object.entries(THREE)) {
            if (name.endsWith("_Format") && typeof format === "number") {
                for (const colorSpace of [THREE.NoColorSpace, THREE.SRGBColorSpace]) {
                    const told = utils.convert(format, colorSpace);

                    if (typeof told === "string" && told.startsWith("COMPRESSED")) {
                        asked.add(told);
                    }
                }
            }
        }

        assert.ok(asked.size >= 50, `${asked.size} formats`);
        assert.deepEqual([...asked].filter((name) => !(name in COMPRESSED)), [], "(not known here: add it, and to gpumemory.js)");

        for (const name of asked) {
            // (A texel alone takes a whole block: 8 bytes or more, where a format not known takes 4)
            assert.ok(imageBytes(COMPRESSED[name], 1, 1) >= 8, name);
            assert.ok(texelBytes(COMPRESSED[name]) <= 2, name);
        }
    });
});

describe("what's gone with nothing said, counted out once it's collected (gpumemory.js)", () => {
    // The garbage collector, to hand; and it run till something's so, a few times at most (what's
    // collected is told of a little after)
    setFlagsFromString("--expose-gc");

    const collect = runInNewContext("gc");

    setFlagsFromString("--no-expose-gc");

    const collected = async (done) => {
        for (let k = 0; k < 100 && !done(); k++) {
            collect();
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        return done();
    };

    it("a buffer whose geometry was simply let go, as three.js leaves a body's index made again: freed by the browser when it's collected, never deleted; and a picture and a render buffer alike", async () => {
        const gl = context();
        const memory = new GpuMemory().watch(gl);
        const kept = {};

        // (Each given, and then let go of with nothing said)
        (() => {
            gl.bindBuffer(0x8893, {});
            gl.bufferData(0x8893, new Uint32Array(1250), 0x88e4);
            gl.bindBuffer(0x8893, null);
            gl.bindTexture(0x0de1, {});
            gl.texStorage2D(0x0de1, 2, 0x8058, 32, 32);
            gl.generateMipmap(0x0de1);
            gl.bindTexture(0x0de1, null);
            gl.bindRenderbuffer(0x8d41, {});
            gl.renderbufferStorage(0x8d41, 0x88f0, 16, 16);
            gl.bindRenderbuffer(0x8d41, null);
        })();
        gl.bindBuffer(0x8892, kept);
        gl.bufferData(0x8892, 300, 0x88e4);
        assert.deepEqual(memory.count, { buffers: 2, textures: 1, renderbuffers: 1 });
        assert.equal(memory.bytes.buffers, 5300);
        assert.ok(memory.bytes.textures > 5000 && memory.bytes.renderbuffers === 1024);

        assert.equal(await collected(() => memory.count.buffers === 1 && memory.count.textures === 0 && memory.count.renderbuffers === 0), true);
        assert.deepEqual(memory.bytes, { buffers: 300, textures: 0, renderbuffers: 0 });
        assert.ok(kept, "(what's still held, still counted)");
    });

    it("not one given back since, nor one of a drawing that's been lost: each counted out once", async () => {
        const gl = context();
        const memory = new GpuMemory().watch(gl);
        const marks = new FinalizationRegistry((mark) => mark.gone++);
        const mark = { gone: 0 };

        // (One deleted, then collected; one of a drawing lost, then collected)
        (() => {
            const [deleted, lost] = [{}, {}];

            marks.register(deleted, mark);
            marks.register(lost, mark);
            gl.bindBuffer(0x8892, deleted);
            gl.bufferData(0x8892, 700, 0x88e4);
            gl.deleteBuffer(deleted);
            gl.bindBuffer(0x8892, lost);
            gl.bufferData(0x8892, 900, 0x88e4);
            gl.bindBuffer(0x8892, null);
        })();
        assert.equal(memory.bytes.buffers, 900);
        memory.reset();

        const again = {};

        gl.bindBuffer(0x8892, again);
        gl.bufferData(0x8892, 40, 0x88e4);
        assert.equal(await collected(() => mark.gone === 2), true);
        // (And what they'd have been told of, a little after)
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual([memory.bytes.buffers, memory.count.buffers], [40, 1]);
        assert.ok(again);
    });
});
''')

open(p, 'w').write(s)
