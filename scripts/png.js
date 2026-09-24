// A minimal PNG decoder for the game's own images: 8-bit RGB or RGBA, not interlaced. Used by
// the scripts that read the map (and their tests), so they need no image libraries.

import { inflateSync } from "node:zlib";

/** Decode a PNG file into { width, height, data } with 4 bytes (RGBA) per pixel. */
export function decodePng(buffer) {
    if (buffer.toString("latin1", 1, 4) !== "PNG") {
        throw new Error("Not a PNG file");
    }

    let width = 0;
    let height = 0;
    let channels = 0;
    const compressed = [];

    for (let offset = 8; offset < buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("latin1", offset + 4, offset + 8);
        const chunk = buffer.subarray(offset + 8, offset + 8 + length);

        if (type === "IHDR") {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);

            const [bitDepth, colorType, , , interlace] = chunk.subarray(8, 13);

            if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
                throw new Error("Only 8-bit, non-interlaced RGB and RGBA PNGs are supported");
            }

            channels = colorType === 6 ? 4 : 3;
        } else if (type === "IDAT") {
            compressed.push(chunk);
        }

        offset += 12 + length;
    }

    const raw = inflateSync(Buffer.concat(compressed));
    const stride = width * channels;
    const pixels = Buffer.alloc(stride * height);

    // Undo each row's filter (https://www.w3.org/TR/png/#9Filters)
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);

        for (let i = 0; i < stride; i++) {
            const left = i >= channels ? row[i - channels] : 0;
            const up = above[i];
            const upLeft = i >= channels ? above[i - channels] : 0;
            let predictor = 0;

            if (filter === 1) {
                predictor = left;
            } else if (filter === 2) {
                predictor = up;
            } else if (filter === 3) {
                predictor = (left + up) >> 1;
            } else if (filter === 4) {
                const estimate = left + up - upLeft;
                const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];

                predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
            }

            row[i] = (source[i] + predictor) & 0xff;
        }
    }

    if (channels === 4) {
        return { width, height, data: pixels };
    }

    const data = Buffer.alloc(width * height * 4);

    for (let i = 0; i < width * height; i++) {
        pixels.copy(data, i * 4, i * 3, i * 3 + 3);
        data[i * 4 + 3] = 255;
    }

    return { width, height, data };
}
