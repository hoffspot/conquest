// What GpuMemory counts for a compressed texture given as three.js r186 gives it in WebGL2:
// texStorage2D (the compressed internal format), then compressedTexSubImage2D a level
import { GpuMemory, texelBytes } from "/home/user/conquest/.claude/worktrees/agent-a6dcab61fbc43fe04/client/js/world/gpumemory.js";
const bound = {};
const gl = { getParameter: (binding) => bound[binding] ?? null };
for (const name of ["bufferData", "deleteBuffer", "texImage2D", "texImage3D", "texStorage2D", "texStorage3D", "compressedTexImage2D", "compressedTexSubImage2D", "copyTexImage2D", "generateMipmap", "deleteTexture", "renderbufferStorage", "renderbufferStorageMultisample", "deleteRenderbuffer"]) gl[name] = () => {};
const memory = new GpuMemory().watch(gl);
const ASTC_4x4 = 0x93b0, ASTC_4x4_SRGB = 0x93d0, BC7 = 0x8e8c, ETC2_RGBA8 = 0x9278, ETC2_RGB8 = 0x9274;
for (const [label, format, real] of [["ASTC 4x4", ASTC_4x4, 1], ["ASTC 4x4 sRGB", ASTC_4x4_SRGB, 1], ["BC7", BC7, 1], ["ETC2 RGBA8", ETC2_RGBA8, 1], ["ETC2 RGB8", ETC2_RGB8, 0.5]]) {
    const texture = {};
    bound[0x8069] = texture;
    const before = memory.bytes.textures;
    gl.texStorage2D(0x0de1, 11, format, 1024, 1024);
    for (let level = 0; level < 11; level++) { const s = Math.max(1, 1024 >> level); gl.compressedTexSubImage2D(0x0de1, level, 0, 0, s, s, format, new Uint8Array(Math.ceil(s / 4) * Math.ceil(s / 4) * 16 * real)); }
    const counted = memory.bytes.textures - before;
    let actual = 0;
    for (let level = 0; level < 11; level++) { const s = Math.max(1, 1024 >> level); actual += Math.ceil(s / 4) * Math.ceil(s / 4) * 16 * real; }
    console.log(`${label.padEnd(14)} 1024x1024 with mipmaps: counted ${(counted / 1048576).toFixed(2)} MB, held ${(actual / 1048576).toFixed(2)} MB (x${(counted / actual).toFixed(1)}); texelBytes(${format.toString(16)}) = ${texelBytes(format)}`);
}
