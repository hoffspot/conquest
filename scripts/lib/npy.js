// Reading NumPy's array files (.npy) and archives of them (.npz), as CharMorph keeps its
// characters' data (for scripts/build-vitruvian.js).

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const TYPES = { "<f8": Float64Array, "<f4": Float32Array, "<i4": Int32Array, "<u4": Uint32Array, "<u2": Uint16Array, "<i2": Int16Array, "|u1": Uint8Array };

/**
 * An array from a .npy file's bytes: { type (NumPy's, such as "<f4"), shape ([...]), data (a typed
 * array, or for strings and other kinds the raw bytes) }.
 */
export function parseNpy(bytes) {
    if (bytes.toString("latin1", 1, 6) !== "NUMPY") {
        throw new Error("Not a .npy array");
    }

    const headerLength = bytes[6] === 1 ? bytes.readUInt16LE(8) : bytes.readUInt32LE(8);
    const headerStart = bytes[6] === 1 ? 10 : 12;
    const header = bytes.toString("latin1", headerStart, headerStart + headerLength);
    const type = /'descr':\s*'([^']+)'/.exec(header)[1];
    const shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1].split(",").map((part) => part.trim()).filter(Boolean).map(Number);
    const body = bytes.subarray(headerStart + headerLength);

    if (/'fortran_order':\s*True/.test(header)) {
        throw new Error("Fortran-ordered arrays aren't read");
    }

    const Type = TYPES[type];

    return { type, shape, data: Type ? new Type(Uint8Array.from(body).buffer) : Buffer.from(body) };
}

export const readNpy = (path) => parseNpy(readFileSync(path));

/** Every array in a .npz archive (a zip of .npy files), by name. */
export function readNpz(path) {
    const zip = readFileSync(path);
    const arrays = {};
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(end + 10);

    for (let at = zip.readUInt32LE(end + 16), k = 0; k < count; k++) {
        const method = zip.readUInt16LE(at + 10);
        const size = zip.readUInt32LE(at + 20);
        const nameLength = zip.readUInt16LE(at + 28);
        const extraLength = zip.readUInt16LE(at + 30);
        const commentLength = zip.readUInt16LE(at + 32);
        const local = zip.readUInt32LE(at + 42);
        const name = zip.toString("utf8", at + 46, at + 46 + nameLength).replace(/\.npy$/, "");
        const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        const stored = zip.subarray(start, start + size);

        if (size === 0xffffffff || local === 0xffffffff) {
            throw new Error(`${path}: archives over 4 GB aren't read`);
        }

        arrays[name] = parseNpy(method === 0 ? stored : inflateRawSync(stored));
        at += 46 + nameLength + extraLength + commentLength;
    }

    return arrays;
}

/** The names in a CharMorph archive's `names` array (strings separated by zero bytes). */
export const namesOf = (array) => array.data.toString("latin1").split("\0").filter(Boolean);
