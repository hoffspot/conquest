// Scrambles a licensed model as the game serves it (docs/LICENSED_MODELS.md, *Scrambling*;
// client/js/app/scramble.js): `npm run scramble -- <model.glb> <model.bin> --copyright "<whose>"`.
// The model's one that utilities/blenderpipeline made; `--copyright` says whose it is in the model
// itself (its glTF asset's `copyright`, which 3D tools show). The scrambled copy is what goes in
// the private repository (hoffspot/conquest-models), its catalog entry in
// client/models/assets.json marked "licensed" with its hash and size. It checks the copy comes
// back as the model before it writes it.

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { isScrambled, scramble, unscramble } from "../client/js/app/scramble.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { copyright: { type: "string" } } });
const [from, to] = positionals;

if (!from || !to || from === to) {
    console.error('npm run scramble -- <model.glb> <model.bin> --copyright "<whose it is>"');
    process.exit(1);
}

let model = await readFile(from);

if (model.length < 20 || model.toString("latin1", 0, 4) !== "glTF" || model.toString("latin1", 16, 20) !== "JSON") {
    console.error(`${from} isn't a GLB (it doesn't start "glTF", then its JSON)${isScrambled(model) ? ": it's scrambled already" : ""}`);
    process.exit(1);
}

// Whose it is, in the model's JSON (padded with spaces to four bytes, as a GLB's chunks are)
if (values.copyright) {
    const length = model.readUInt32LE(12);
    const gltf = JSON.parse(model.toString("utf8", 20, 20 + length));

    gltf.asset = { ...gltf.asset, copyright: values.copyright };

    const json = Buffer.from(JSON.stringify(gltf), "utf8");
    const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
    const rest = model.subarray(20 + length);
    const head = Buffer.alloc(20);

    head.write("glTF", 0, "latin1");
    head.writeUInt32LE(model.readUInt32LE(4), 4);
    head.writeUInt32LE(20 + padded.length + rest.length, 8);
    head.writeUInt32LE(padded.length, 12);
    head.write("JSON", 16, "latin1");
    model = Buffer.concat([head, padded, rest]);
}

const scrambled = scramble(Uint8Array.from(model));

if (!Buffer.from(unscramble(Uint8Array.from(scrambled))).equals(model)) {
    throw new Error("the scrambled copy doesn't come back as the model");
}

await writeFile(to, scrambled);
console.log(`${to}: ${from} scrambled, ${scrambled.length} bytes${values.copyright ? `, its copyright "${values.copyright}"` : ""}. Then its hash and size in client/models/assets.json, and npm run build:manifest`);
