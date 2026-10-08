// Reading a PNG's pixels (scripts/build-props.js: the pictures some models come with): grey, grey
// and alpha, colour, colour and alpha or a palette's, 8 bits to a channel (or fewer to a grey's or
// a palette's pixel: 1, 2 or 4), not interlaced.

import { inflateSync } from "node:zlib";

// How many channels each kind of PNG has (its IHDR's colour type)
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// The Paeth predictor (PNG's filter type 4): whichever of left, up and up-left is nearest their sum
function paeth(a, b, c) {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];

    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** A PNG's pixels: { width, height, data } (four bytes to a pixel: red, green, blue, alpha). */
export function readPng(bytes) {
    const file = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
    const parts = [];
    let [width, height, depth, kind, interlaced, palette] = [0, 0, 0, 0, 0, null];

    for (let at = 8; at < file.length; ) {
        const length = file.readUInt32BE(at);
        const type = file.toString("latin1", at + 4, at + 8);
        const body = file.subarray(at + 8, at + 8 + length);

        if (type === "IHDR") {
            [width, height, depth, kind, interlaced] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9], body[12]];
        } else if (type === "PLTE") {
            palette = body;
        } else if (type === "IDAT") {
            parts.push(body);
        }

        at += 12 + length;
    }

    // (Fewer than 8 bits to a pixel only for one channel: grey, or a palette's)
    const packed = depth < 8 && (kind === 0 || kind === 3);

    if ((depth !== 8 && !(packed && [1, 2, 4].includes(depth))) || interlaced || !(kind in CHANNELS)) {
        throw new Error(`only 8-bit PNGs (or 1, 2 or 4 to a grey's or a palette's pixel) that aren't interlaced are read (this: ${depth} bits, colour type ${kind}${interlaced ? ", interlaced" : ""})`);
    }

    const channels = packed ? 1 : CHANNELS[kind];
    const stride = packed ? Math.ceil((width * depth) / 8) : width * channels;
    const raw = inflateSync(Buffer.concat(parts));
    const rows = Buffer.alloc(stride * height);

    // Each row unfiltered against the one above it (PNG's five filter types)
    for (let y = 0; y < height; y++) {
        const [filter, from, to] = [raw[y * (stride + 1)], y * (stride + 1) + 1, y * stride];

        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? rows[to + x - channels] : 0;
            const up = y > 0 ? rows[to - stride + x] : 0;
            const corner = y > 0 && x >= channels ? rows[to - stride + x - channels] : 0;
            const guess = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, corner) : 0;

            rows[to + x] = (raw[from + x] + guess) & 255;
        }
    }

    // (A packed pixel's value: its bits in its row's bytes, a grey's spread over 0 to 255)
    const valueOf = (p) => {
        const [y, x] = [Math.floor(p / width), p % width];
        const bit = x * depth;
        const value = (rows[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);

        return kind === 0 ? Math.round((value * 255) / ((1 << depth) - 1)) : value;
    };
    const data = new Uint8Array(width * height * 4);

    for (let p = 0; p < width * height; p++) {
        const q = p * channels;

        if (packed) {
            const value = valueOf(p);

            data.set(kind === 3 ? [...palette.subarray(value * 3, value * 3 + 3), 255] : [value, value, value, 255], p * 4);
            continue;
        }

        const rgba = kind === 3 ? [...palette.subarray(rows[q] * 3, rows[q] * 3 + 3), 255] : kind === 0 ? [rows[q], rows[q], rows[q], 255] : kind === 4 ? [rows[q], rows[q], rows[q], rows[q + 1]] : kind === 2 ? [rows[q], rows[q + 1], rows[q + 2], 255] : rows.subarray(q, q + 4);

        data.set(rgba, p * 4);
    }

    return { width, height, data };
}
