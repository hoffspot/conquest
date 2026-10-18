// Pictures the graphics card keeps compressed (KTX2, Basis Universal), as the dungeons'
// photographs (build-textures.js) and the pictures in their models (build-props.js: in the GLB,
// as KHR_texture_basisu has it) are made. A JPEG is decoded to four bytes a pixel on the graphics
// card, a 512-pixel picture and its mipmaps 1.4 MB; one of these stays compressed there, a sixth
// to an eighth of that (ETC1S) or a quarter (UASTC), and is no bigger a download. Each is made
// with its mipmaps (a compressed picture's can't be made on the graphics card), as what it's for:
//   - a colour (`kind` "colour"): in sRGB, ETC1S;
//   - a normal map ("normal"): linear, ETC1S, or UASTC (`mode`) where it's seen close to, over
//     a dungeon's rock (sharper, but four to five times the download).
// The game reads them with three.js's KTX2Loader (world/art/engine/models.js readKtx2With), whose
// transcoder turns each into whatever compressed format the device's graphics card takes (ASTC
// or ETC2 on a phone, BC7 or BC1 on a desktop...).

import { encodeToKTX2 } from "ktx2-encoder";

// ETC1S's quality (1 to 255: the higher, the closer to the picture and the bigger the file)
export const KTX2_QUALITY = 128;

/**
 * A picture ({ width, height, data: four bytes to a pixel }, each side a power of two) encoded as
 * KTX2, mipmaps and all: `kind` "colour" or "normal", `mode` "etc1s" or "uastc".
 */
export async function encodeKtx2(picture, { kind, mode = "etc1s", quality = KTX2_QUALITY }) {
    const { width, height } = picture;

    if (width & (width - 1) || height & (height - 1)) {
        throw new Error(`a KTX2 picture's sides are each a power of two, not ${width} x ${height}`);
    }

    const options =
        mode === "uastc"
            ? { isUASTC: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1, uastcLDRQualityLevel: 1 }
            : { isUASTC: false, qualityLevel: quality, compressionLevel: 2 };
    const data = new Uint8Array(picture.data.buffer, picture.data.byteOffset, picture.data.byteLength);

    return encodeToKTX2(new Uint8Array(0), {
        ...options,
        generateMipmap: true,
        isNormalMap: kind === "normal",
        isPerceptual: kind === "colour",
        isSetKTX2SRGBTransferFunc: kind === "colour",
        isKTX2File: true,
        imageDecoder: async () => ({ width, height, data }),
    });
}
