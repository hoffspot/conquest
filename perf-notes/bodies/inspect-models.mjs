// What's inside the bought models (client/models/beasts/*.bin), read in memory only (unscrambled
// in place in a buffer; nothing written anywhere): node inspect-models.mjs [name-filter]
import { readFileSync, readdirSync } from "node:fs";

const REPO = "/home/user/conquest";
const { unscramble, isScrambled } = await import(`${REPO}/client/js/app/scramble.js`);
const folder = `${REPO}/client/models/beasts`;
const filter = process.argv[2] ?? "";
const MB = (b) => (b / 1048576).toFixed(2);
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
// A few of KTX2's vkFormat numbers
const VK = { 0: "UNDEFINED (Basis universal: ETC1S/UASTC)", 37: "R8G8B8A8_UNORM", 43: "R8G8B8A8_SRGB", 23: "R8G8B8_UNORM", 29: "R8G8B8_SRGB", 9: "R8_UNORM", 16: "R8G8_UNORM" };
const SCHEME = { 0: "none", 1: "BasisLZ (ETC1S)", 2: "Zstandard", 3: "ZLIB" };

const rows = [];
let totals = { files: 0, bytes: 0 };

for (const name of readdirSync(folder).filter((n) => n.endsWith(".bin") && n.includes(filter)).sort()) {
    const bytes = new Uint8Array(readFileSync(`${folder}/${name}`));
    const t0 = process.cpuUsage();

    if (isScrambled(bytes)) {
        unscramble(bytes);
    }

    const cpu = process.cpuUsage(t0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (view.getUint32(0, true) !== 0x46546c67) {
        console.log(`${name}: not a GLB`);
        continue;
    }

    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    const binStart = 20 + jsonLength + 8;
    const binLength = bytes.length > 20 + jsonLength ? view.getUint32(20 + jsonLength, true) : 0;
    const accessor = (i) => json.accessors[i];
    const accessorBytes = (a) => a.count * TYPE_COUNT[a.type] * COMPONENT_BYTES[a.componentType];

    // Meshes
    let vertices = 0;
    let triangles = 0;
    let primitives = 0;
    let vertexBytes = 0;
    let indexBytes = 0;
    const attributeKinds = new Map();
    const seenAccessors = new Set();

    for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives) {
            primitives++;
            vertices += accessor(primitive.attributes.POSITION).count;

            for (const [key, index] of Object.entries(primitive.attributes)) {
                const a = accessor(index);

                attributeKinds.set(key, `${a.type}/${{ 5120: "i8", 5121: "u8", 5122: "i16", 5123: "u16", 5125: "u32", 5126: "f32" }[a.componentType]}${a.normalized ? "n" : ""}`);

                if (!seenAccessors.has(index)) {
                    seenAccessors.add(index);
                    vertexBytes += accessorBytes(a);
                }
            }

            if (primitive.indices !== undefined) {
                triangles += accessor(primitive.indices).count / 3;

                if (!seenAccessors.has(primitive.indices)) {
                    seenAccessors.add(primitive.indices);
                    indexBytes += accessorBytes(accessor(primitive.indices));
                }
            }

            for (const target of primitive.targets ?? []) {
                for (const index of Object.values(target)) {
                    if (!seenAccessors.has(index)) {
                        seenAccessors.add(index);
                        vertexBytes += accessorBytes(accessor(index));
                    }
                }
            }
        }
    }

    // Animations: decoded keyframe bytes (three.js makes Float32Arrays of times and values)
    let animationFloats = 0;
    let channels = 0;
    const samplersSeen = new Set();
    let seconds = 0;

    for (const animation of json.animations ?? []) {
        channels += animation.channels.length;

        let longest = 0;

        for (const sampler of animation.samplers) {
            for (const index of [sampler.input, sampler.output]) {
                const a = accessor(index);

                if (!samplersSeen.has(index)) {
                    samplersSeen.add(index);
                    animationFloats += a.count * TYPE_COUNT[a.type];
                }
            }

            longest = Math.max(longest, accessor(sampler.input).max?.[0] ?? 0);
        }

        seconds += longest;
    }

    // Images
    const images = [];
    let gpu = 0;
    let rgba = 0;

    for (const image of json.images ?? []) {
        const bv = json.bufferViews[image.bufferView];
        const at = binStart + (bv.byteOffset ?? 0);
        const data = bytes.subarray(at, at + bv.byteLength);
        const info = { mime: image.mimeType, bytes: bv.byteLength };

        if (image.mimeType === "image/ktx2") {
            const v = new DataView(data.buffer, data.byteOffset, data.byteLength);

            info.vkFormat = v.getUint32(12, true);
            info.w = v.getUint32(20, true);
            info.h = v.getUint32(24, true);
            info.levels = v.getUint32(40, true);
            info.scheme = v.getUint32(44, true);
            // (Transcoded to a block format: ASTC 4x4, ETC2 or BC7, a byte a texel; ETC1/BC1 RGB half)
            const mips = info.levels > 1 ? 4 / 3 : 1;

            gpu += info.w * info.h * 1 * mips;
            rgba += info.w * info.h * 4 * mips;
        } else if (image.mimeType === "image/png") {
            const v = new DataView(data.buffer, data.byteOffset, data.byteLength);

            info.w = v.getUint32(16, false);
            info.h = v.getUint32(20, false);
            gpu += info.w * info.h * 4 * (4 / 3);
            rgba += info.w * info.h * 4 * (4 / 3);
        }

        images.push(info);
    }

    const joints = (json.skins ?? []).map((skin) => skin.joints.length);
    const meshopt = (json.bufferViews ?? []).filter((bv) => bv.extensions?.EXT_meshopt_compression).length;
    const decoded = (json.bufferViews ?? []).reduce((sum, bv) => sum + (bv.extensions?.EXT_meshopt_compression ? bv.extensions.EXT_meshopt_compression.count * bv.extensions.EXT_meshopt_compression.byteStride : 0), 0);

    totals.files++;
    totals.bytes += bytes.length;
    rows.push({ name, file: bytes.length, json: jsonLength, unscrambleCpuMs: cpu.user / 1000, primitives, meshes: json.meshes?.length ?? 0, nodes: json.nodes?.length ?? 0, vertices, triangles, vertexBytes, indexBytes, joints, clips: json.animations?.length ?? 0, channels, seconds, animationBytes: animationFloats * 4, images, gpu, rgba, materials: json.materials?.length ?? 0, textures: json.textures?.length ?? 0, extensions: json.extensionsUsed ?? [], meshoptViews: meshopt, decoded, attributeKinds });
}

for (const r of rows) {
    const sizes = new Map();

    for (const image of r.images) {
        const key = `${image.w}x${image.h} ${image.mime === "image/ktx2" ? `ktx2 ${SCHEME[image.scheme] ?? image.scheme} vk${image.vkFormat} L${image.levels}` : image.mime}`;

        sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }

    console.log(`${r.name}: file ${MB(r.file)} MB (json ${MB(r.json)}), unscramble ${r.unscrambleCpuMs.toFixed(1)} ms cpu`);
    console.log(`   meshes ${r.meshes} (${r.primitives} primitives), ${r.vertices} vertices, ${Math.round(r.triangles)} triangles; vertex data ${MB(r.vertexBytes)} MB + index ${MB(r.indexBytes)} MB; skins joints [${r.joints}]; nodes ${r.nodes}`);
    console.log(`   attributes ${[...r.attributeKinds].map(([k, v]) => `${k}:${v}`).join(" ")}`);
    console.log(`   clips ${r.clips} (${r.channels} channels, ${r.seconds.toFixed(0)} s) -> keyframes as Float32 ${MB(r.animationBytes)} MB`);
    console.log(`   materials ${r.materials}, textures ${r.textures}, images ${r.images.length}: ${[...sizes].map(([k, n]) => `${n}x ${k}`).join("; ")}; image bytes in file ${MB(r.images.reduce((s, i) => s + i.bytes, 0))} MB`);
    console.log(`   on the card: compressed (1 B/texel, mips) ${MB(r.gpu)} MB; were they RGBA8 ${MB(r.rgba)} MB`);
    console.log(`   extensions ${r.extensions.join(", ")}; meshopt views ${r.meshoptViews} (decoded ${MB(r.decoded)} MB)`);
}

console.log(`\n${totals.files} files, ${MB(totals.bytes)} MB`);
