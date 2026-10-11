// What the graphics card's been given to hold (client/js/world/gpumemory.js): told at the calls
// that give it something to hold and take it back, on a context of our own keeping what's bound
// as WebGL's does
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GpuMemory, megabytes, texelBytes } from "../client/js/world/gpumemory.js";

// A WebGL2 context, as far as what it's given to hold goes: what's bound, by binding
function context() {
    const bound = new Map();
    const BIND = { 0x8892: 0x8894, 0x8893: 0x8895, 0x0de1: 0x8069, 0x8513: 0x8514, 0x806f: 0x806a, 0x8c1a: 0x8c1d, 0x8d41: 0x8ca7 };
    const calls = [];
    const gl = {
        calls,
        bindBuffer: (target, buffer) => bound.set(BIND[target], buffer),
        bindTexture: (target, texture) => bound.set(BIND[target], texture),
        bindRenderbuffer: (target, renderbuffer) => bound.set(BIND[target], renderbuffer),
        getParameter: (binding) => bound.get(binding) ?? null,
    };

    for (const name of ["bufferData", "deleteBuffer", "texImage2D", "texImage3D", "texStorage2D", "texStorage3D", "compressedTexImage2D", "copyTexImage2D", "generateMipmap", "deleteTexture", "renderbufferStorage", "renderbufferStorageMultisample", "deleteRenderbuffer"]) {
        gl[name] = (...args) => calls.push([name, ...args]);
    }

    return gl;
}

const MB = 1048576;

describe("what the graphics card holds (gpumemory.js)", () => {
    it("counts buffers given data or a size, given again, and given back; the context's own calls still made", () => {
        const gl = context();
        const memory = new GpuMemory().watch(gl);
        const [a, b] = [{}, {}];

        gl.bindBuffer(0x8892, a);
        gl.bufferData(0x8892, new Float32Array(1000), 0x88e4);
        gl.bindBuffer(0x8893, b);
        gl.bufferData(0x8893, 600, 0x88e4);
        assert.deepEqual(memory.bytes, { buffers: 4600, textures: 0, renderbuffers: 0 });
        assert.equal(memory.count.buffers, 2);

        // (Given again, smaller: what it holds now, not both)
        gl.bindBuffer(0x8892, a);
        gl.bufferData(0x8892, new Uint16Array(100), 0x88e4);
        assert.equal(memory.bytes.buffers, 800);
        gl.deleteBuffer(b);
        gl.deleteBuffer(b);
        assert.equal(memory.bytes.buffers, 200);
        assert.equal(memory.count.buffers, 1);
        assert.equal(gl.calls.filter(([name]) => name === "bufferData").length, 3, "each call still made");
    });

    it("counts pictures by their format, levels and faces: given whole, by size, as storage, compressed, with their mipmaps; given back", () => {
        const gl = context();
        const memory = new GpuMemory().watch(gl);
        const [a, b, c, d] = [{}, {}, {}, {}];

        // (A picture given whole, RGBA bytes, then its mipmaps: a third again)
        gl.bindTexture(0x0de1, a);
        gl.texImage2D(0x0de1, 0, 0x1908, 0x1908, 0x1401, { width: 512, height: 256 });
        assert.equal(memory.bytes.textures, 512 * 256 * 4);
        gl.generateMipmap(0x0de1);
        assert.equal(memory.bytes.textures, Math.round((512 * 256 * 4 * 4) / 3));

        // (Storage for every level of a half-float picture; and a cube's six faces)
        gl.bindTexture(0x0de1, b);
        gl.texStorage2D(0x0de1, 3, 0x881a, 64, 64);
        gl.bindTexture(0x8513, c);
        gl.texStorage2D(0x8513, 1, 0x8058, 32, 32);

        const storage = (64 * 64 + 32 * 32 + 16 * 16) * 8 + 32 * 32 * 4 * 6;

        assert.equal(memory.bytes.textures, Math.round((512 * 256 * 4 * 4) / 3) + storage);

        // (Compressed, by its data; a level given again replacing what it held)
        gl.bindTexture(0x0de1, d);
        gl.compressedTexImage2D(0x0de1, 0, 0x83f3, 128, 128, 0, new Uint8Array(16384));
        gl.compressedTexImage2D(0x0de1, 0, 0x83f3, 128, 128, 0, new Uint8Array(8192));
        assert.equal(memory.count.textures, 4);
        gl.deleteTexture(a);
        gl.deleteTexture(b);
        gl.deleteTexture(c);
        assert.equal(memory.bytes.textures, 8192);
        assert.equal(memory.count.textures, 1);

        // (By size, with its format and type: one float a texel)
        gl.bindTexture(0x0de1, a);
        gl.texImage2D(0x0de1, 0, 0x822e, 100, 100, 0, 0x1903, 0x1406, null);
        assert.equal(memory.bytes.textures, 8192 + 40000);
    });

    it("counts render targets' buffers, with their samples, and reports it all in megabytes; nothing once the drawing's lost", () => {
        const gl = context();
        const memory = new GpuMemory().watch(gl);
        const target = {};

        gl.bindRenderbuffer(0x8d41, target);
        gl.renderbufferStorageMultisample(0x8d41, 4, 0x88f0, 1024, 512);
        assert.equal(memory.bytes.renderbuffers, 4 * 1024 * 512 * 4);

        gl.bindBuffer(0x8892, {});
        gl.bufferData(0x8892, 3 * MB, 0x88e4);
        assert.deepEqual(memory.report(), { totalMB: 11, buffersMB: 3, texturesMB: 0, targetsMB: 8, count: { buffers: 1, textures: 0, renderbuffers: 1 } });
        gl.deleteRenderbuffer(target);
        assert.equal(memory.total, 3 * MB);
        memory.reset();
        assert.equal(memory.total, 0);
    });

    it("knows each format's bytes a texel, sized or by format and type", () => {
        assert.equal(texelBytes(0x8058), 4, "RGBA8");
        assert.equal(texelBytes(0x8051), 4, "RGB8, held as RGBA");
        assert.equal(texelBytes(0x881a), 8, "RGBA16F");
        assert.equal(texelBytes(0x1908, 0x1908, 0x1406), 16, "RGBA floats");
        assert.equal(texelBytes(0x1908, 0x1908, 0x8033), 2, "RGBA packed in a short");
        assert.equal(texelBytes(0x1903, 0x1903, 0x1401), 1, "one byte of red");
        assert.equal(megabytes(1.25 * MB), 1.3);
    });
});
