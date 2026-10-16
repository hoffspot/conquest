// Scrambles a licensed model as the game serves it (docs/LICENSED_MODELS.md, *Scrambling*;
// client/js/app/scramble.js): `npm run scramble -- <model.glb> <model.bin>`. The model's one
// that utilities/blenderpipeline made; the scrambled copy is what goes in the catalog
// (client/models/assets.json, its entry marked "licensed"). It checks the copy comes back as the
// model before it writes it.

import { readFile, writeFile } from "node:fs/promises";
import { isScrambled, scramble, unscramble } from "../client/js/app/scramble.js";

const [from, to] = process.argv.slice(2);

if (!from || !to || from === to) {
    console.error("npm run scramble -- <model.glb> <model.bin>");
    process.exit(1);
}

const model = await readFile(from);

if (model.length < 12 || model.toString("latin1", 0, 4) !== "glTF") {
    console.error(`${from} isn't a GLB (it doesn't start "glTF")${isScrambled(model) ? ": it's scrambled already" : ""}`);
    process.exit(1);
}

const scrambled = scramble(Uint8Array.from(model));

if (!Buffer.from(unscramble(Uint8Array.from(scrambled))).equals(model)) {
    throw new Error("the scrambled copy doesn't come back as the model");
}

await writeFile(to, scrambled);
console.log(`${to}: ${from} scrambled, ${scrambled.length} bytes. Then npm run build:manifest`);
