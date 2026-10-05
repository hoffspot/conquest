// Reading a Blender file's data without Blender (for scripts/build-vitruvian.js): the file's
// blocks, and the structures Blender describes in it (its "SDNA"), enough to read a mesh's
// attributes, such as its texture coordinates.
//
// Only uncompressed files, 64-bit and little-endian, as Blender 2.8 to 4.x writes them; a file
// saved compressed has to be saved again without compression first.

import { readFileSync } from "node:fs";

/**
 * A Blender file: { version, blocks ([{ code, length, address, struct, count, start }]), dna
 * ({ structs: Map(name → { size, fields }) }), at(address) (the block at a pointer) }.
 */
export function readBlend(path) {
    const buffer = readFileSync(path);
    const header = buffer.toString("latin1", 0, 12);

    if (!header.startsWith("BLENDER") || header[7] !== "-" || header[8] !== "v") {
        throw new Error(`${path} isn't an uncompressed 64-bit little-endian Blender file (${JSON.stringify(header)})`);
    }

    const blocks = [];

    for (let at = 12; at < buffer.length;) {
        const code = buffer.toString("latin1", at, at + 4).replace(/\0+$/, "");
        const length = buffer.readInt32LE(at + 4);

        blocks.push({ code, length, address: buffer.readBigUInt64LE(at + 8), struct: buffer.readInt32LE(at + 16), count: buffer.readInt32LE(at + 20), start: at + 24 });
        at += 24 + length;

        if (code === "ENDB") {
            break;
        }
    }

    const byAddress = new Map(blocks.map((block) => [block.address, block]));

    return { buffer, version: header.slice(9), blocks, dna: readDna(buffer, blocks.find(({ code }) => code === "DNA1")), at: (address) => byAddress.get(address) };
}

// The file's own description of its structures: names, types, their sizes and fields
function readDna(buffer, block) {
    let at = block.start;
    const expect = (tag) => {
        if (buffer.toString("latin1", at, at + 4) !== tag) {
            throw new Error(`Blender file: expected ${tag} at ${at}`);
        }

        at += 4;
    };
    const align = () => {
        at = (at + 3) & ~3;
    };
    const strings = () => {
        const count = buffer.readInt32LE(at);
        const list = [];

        at += 4;

        for (let k = 0; k < count; k++) {
            const end = buffer.indexOf(0, at);

            list.push(buffer.toString("latin1", at, end));
            at = end + 1;
        }

        align();

        return list;
    };

    expect("SDNA");
    expect("NAME");
    const names = strings();

    expect("TYPE");
    const types = strings();

    expect("TLEN");
    const sizes = types.map((_, k) => buffer.readInt16LE(at + k * 2));

    at += types.length * 2;
    align();
    expect("STRC");

    const count = buffer.readInt32LE(at);
    const structs = new Map();

    at += 4;

    for (let s = 0; s < count; s++) {
        const type = buffer.readInt16LE(at);
        const fieldCount = buffer.readInt16LE(at + 2);
        const fields = new Map();
        let offset = 0;

        at += 4;

        for (let f = 0; f < fieldCount; f++) {
            const fieldType = types[buffer.readInt16LE(at)];
            const name = names[buffer.readInt16LE(at + 2)];
            const pointer = name.startsWith("*") || name.startsWith("(*");
            const length = [...name.matchAll(/\[(\d+)\]/g)].reduce((product, [, n]) => product * Number(n), 1);
            const size = (pointer ? 8 : sizes[types.indexOf(fieldType)]) * length;

            at += 4;
            fields.set(name.replace(/^[(*]+|\).*$|\[.*$/g, ""), { type: fieldType, pointer, length, size, offset });
            offset += size;
        }

        structs.set(types[type], { size: sizes[type], fields });
    }

    return { structs };
}

/**
 * A structure's fields at a place in the file: numbers as numbers, pointers as addresses
 * (BigInt), character arrays as strings, and anything else (a nested structure, an array) as
 * { offset } to read further.
 */
export function readStruct(blend, name, offset) {
    const { buffer, dna } = blend;
    const values = {};

    for (const [field, { type, pointer, length, size, offset: at }] of dna.structs.get(name).fields) {
        const start = offset + at;

        if (pointer) {
            values[field] = buffer.readBigUInt64LE(start);
        } else if (type === "char" && length > 1) {
            const end = buffer.indexOf(0, start);

            values[field] = buffer.toString("latin1", start, end >= 0 && end < start + size ? end : start + size);
        } else if (length === 1 && type === "int") {
            values[field] = buffer.readInt32LE(start);
        } else if (length === 1 && type === "short") {
            values[field] = buffer.readInt16LE(start);
        } else if (length === 1 && type === "float") {
            values[field] = buffer.readFloatLE(start);
        } else if (length === 1 && (type === "char" || type === "uchar")) {
            values[field] = buffer.readUInt8(start);
        } else {
            values[field] = { offset: start };
        }
    }

    return values;
}

/**
 * A mesh's attribute layer (positions, texture coordinates, ...) as a copy of its bytes, by the
 * domain it's on ("vdata": vertices, "pdata": faces, "ldata": face corners) and its name, or
 * null if it has none of that name.
 */
export function meshLayer(blend, mesh, domain, name) {
    const data = readStruct(blend, "CustomData", mesh[domain].offset);
    const block = blend.at(data.layers);
    const size = blend.dna.structs.get("CustomDataLayer").size;

    for (let k = 0; k < data.totlayer; k++) {
        const layer = readStruct(blend, "CustomDataLayer", block.start + k * size);

        if (layer.name === name) {
            const values = blend.at(layer.data);

            return Uint8Array.from(blend.buffer.subarray(values.start, values.start + values.length)).buffer;
        }
    }

    return null;
}

/** The file's meshes: [{ name, ...Mesh fields }]. */
export function meshes(blend) {
    return blend.blocks.filter(({ code }) => code === "ME").map((block) => {
        const mesh = readStruct(blend, "Mesh", block.start);

        return { ...mesh, name: readStruct(blend, "ID", mesh.id.offset).name.slice(2) };
    });
}
