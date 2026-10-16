// Textures the GPU keeps compressed (KTX2, Basis Universal: KHR_texture_basisu). A phone's GPU
// holds a 2048-pixel texture in 4 to 5 MB this way, mipmaps and all, where a WebP or PNG takes 21
// MB once it's decoded. Each texture is encoded as what it's used for:
//   - colour (base colour, emission): ETC1S by default, in sRGB;
//   - data (occlusion, roughness and metal): ETC1S by default, linear;
//   - normals: UASTC by default (sharper, larger), linear, as a normal map.
// Each is made a power of two on each side first (a bought model's 3248 x 2877 fur, shrunk to 1024
// x 907, made 1024 x 1024): the GPU's compressed formats are made of 4 x 4 blocks, and a texture
// whose side, or whose mipmaps' sides, aren't can't be relied on (three.js warns of it, and drew
// that fur black).
// ETC1S is small to download but blockier; UASTC is close to the original but 4 to 5 times the
// size. Three.js reads them with KTX2Loader and the Basis transcoder (WebAssembly), which turns
// each into whatever compressed format the device's GPU takes (ASTC, BC7, ETC2...).

import { KHRTextureBasisu } from "@gltf-transform/extensions";
import { decode as decodePng } from "fast-png";
import jpeg from "jpeg-js";
import { encodeToKTX2 } from "ktx2-encoder";

/** What each texture is used for: "normal", "color" or "data" (the first of those that it's used as). */
export function textureUses(document) {
    const uses = new Map();
    const use = (texture, kind) => {
        const order = ["normal", "color", "data"];

        if (texture && (!uses.has(texture) || order.indexOf(kind) < order.indexOf(uses.get(texture)))) {
            uses.set(texture, kind);
        }
    };

    for (const material of document.getRoot().listMaterials()) {
        use(material.getNormalTexture(), "normal");
        use(material.getBaseColorTexture(), "color");
        use(material.getEmissiveTexture(), "color");
        use(material.getMetallicRoughnessTexture(), "data");
        use(material.getOcclusionTexture(), "data");
    }

    return uses;
}

/** A PNG's or JPEG's pixels: { data (RGBA, 8 bits a channel), width, height }. */
export function decodeImage(bytes, mimeType) {
    if (mimeType === "image/jpeg") {
        const { data, width, height } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });

        return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height };
    }

    if (mimeType !== "image/png") {
        throw new Error(`a KTX2 texture is made from a PNG or JPEG, not ${mimeType}`);
    }

    const png = decodePng(bytes);
    const { width, height, channels } = png;
    const rgba = new Uint8Array(width * height * 4);
    // (16-bit PNGs to 8 bits; grey and grey with alpha spread over red, green and blue)
    const scale = png.depth === 16 ? 1 / 257 : 1;

    for (let i = 0; i < width * height; i++) {
        const at = i * channels;
        const grey = channels <= 2;

        rgba[i * 4] = Math.round(png.data[at] * scale);
        rgba[i * 4 + 1] = Math.round(png.data[grey ? at : at + 1] * scale);
        rgba[i * 4 + 2] = Math.round(png.data[grey ? at : at + 2] * scale);
        rgba[i * 4 + 3] = channels === 4 || channels === 2 ? Math.round(png.data[at + channels - 1] * scale) : 255;
    }

    return { data: rgba, width, height };
}

/** The image halved (a box filter, each pixel the mean of four) until it's at most `size` across. */
export function shrinkImage(image, size) {
    let { data, width, height } = image;

    while (Math.max(width, height) > size && width > 1 && height > 1) {
        const w = Math.floor(width / 2);
        const h = Math.floor(height / 2);
        const out = new Uint8Array(w * h * 4);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                for (let c = 0; c < 4; c++) {
                    const at = (yy, xx) => data[((y * 2 + yy) * width + x * 2 + xx) * 4 + c];

                    out[(y * w + x) * 4 + c] = (at(0, 0) + at(0, 1) + at(1, 0) + at(1, 1) + 2) >> 2;
                }
            }
        }

        data = out;
        width = w;
        height = h;
    }

    return { data, width, height };
}

/**
 * The power of two nearest `size` (by its logarithm: 907 is 1024, 600 is 512); if that's more
 * than `most`, the largest power of two within it.
 */
export function powerOfTwo(size, most = null) {
    const nearest = 2 ** Math.max(0, Math.round(Math.log2(size)));

    return most && nearest > most ? 2 ** Math.max(0, Math.floor(Math.log2(most))) : nearest;
}

// For each pixel of a row (or column) `to` long, made from one `from` long: the pixels it's a
// weighted mean of ([index, weight], a triangle filter, as wide as a pixel of the two is)
function taps(from, to) {
    const scale = from / to;
    const reach = Math.max(1, scale);

    return Array.from({ length: to }, (_, i) => {
        const centre = (i + 0.5) * scale - 0.5;
        const list = [];

        for (let j = Math.floor(centre - reach); j <= Math.ceil(centre + reach); j++) {
            const weight = 1 - Math.abs(j - centre) / reach;

            if (weight > 0) {
                list.push([Math.min(from - 1, Math.max(0, j)), weight]);
            }
        }

        const total = list.reduce((sum, [, weight]) => sum + weight, 0);

        return list.map(([j, weight]) => [j, weight / total]);
    });
}

/** The image resampled to `width` x `height` (across, then down; larger or smaller). */
export function resizeImage(image, width, height) {
    if (image.width === width && image.height === height) {
        return image;
    }

    const across = taps(image.width, width);
    const down = taps(image.height, height);
    const middle = new Float32Array(width * image.height * 4);
    const out = new Uint8Array(width * height * 4);

    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < width; x++) {
            for (const [j, weight] of across[x]) {
                for (let c = 0; c < 4; c++) {
                    middle[(y * width + x) * 4 + c] += image.data[(y * image.width + j) * 4 + c] * weight;
                }
            }
        }
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 4; c++) {
                let sum = 0;

                for (const [j, weight] of down[y]) {
                    sum += middle[(j * width + x) * 4 + c] * weight;
                }

                out[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, Math.round(sum)));
            }
        }
    }

    return { data: out, width, height };
}

/** One image encoded as KTX2: `mode` "etc1s" or "uastc", `kind` "color", "data" or "normal". */
export async function encodeImage(image, { mode, kind, quality = 128 }) {
    const options =
        mode === "uastc"
            ? { isUASTC: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1, uastcLDRQualityLevel: 1 }
            : { isUASTC: false, qualityLevel: quality, compressionLevel: 2 };

    return encodeToKTX2(new Uint8Array(0), {
        ...options,
        generateMipmap: true,
        isNormalMap: kind === "normal",
        isPerceptual: kind === "color",
        isSetKTX2SRGBTransferFunc: kind === "color",
        isKTX2File: true,
        imageDecoder: async () => image,
    });
}

/**
 * Every PNG and JPEG texture in the document encoded as KTX2 (`settings`: textures.ktx2 from the
 * config), each as what it's used for, a power of two on each side (no more than `maxSize`, the
 * config's textures.maxSize, if it has one). Returns [{ name, kind, mode, width, height, from, to
 * }] (from and to: bytes).
 */
export async function encodeTextures(document, settings, { maxSize = null } = {}) {
    const done = [];
    const uses = textureUses(document);
    let any = false;

    for (const texture of document.getRoot().listTextures()) {
        const mimeType = texture.getMimeType();

        if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
            continue;
        }

        const kind = uses.get(texture) ?? "color";
        const mode = settings[kind];
        let image = decodeImage(texture.getImage(), mimeType);

        if (kind === "normal" && settings.normalSize) {
            image = shrinkImage(image, settings.normalSize);
        }

        const most = kind === "normal" && settings.normalSize ? Math.min(settings.normalSize, maxSize ?? Infinity) : maxSize;

        image = resizeImage(image, powerOfTwo(image.width, most), powerOfTwo(image.height, most));

        const from = texture.getImage().byteLength;
        const bytes = await encodeImage(image, { mode, kind, quality: settings.quality });

        texture.setImage(bytes).setMimeType("image/ktx2");

        if (texture.getURI()) {
            texture.setURI(texture.getURI().replace(/\.(png|jpe?g)$/i, ".ktx2"));
        }

        done.push({ name: texture.getName(), kind, mode, width: image.width, height: image.height, from, to: bytes.byteLength });
        any = true;
    }

    if (any) {
        document.createExtension(KHRTextureBasisu).setRequired(true);
    }

    return done;
}
