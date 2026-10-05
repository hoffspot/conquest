// A body's data (client/characters/<body>.json and <body>.bin) read in Node, for the scripts and
// the tests, as body.js loads it in the browser: the game's body (body.js GAME_BODY), else another
// of body.js BODIES.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { GAME_BODY, HumanData } from "../../client/js/characters/body.js";

const FOLDER = new URL("../../client/characters/", import.meta.url);

/** A body's files as they are, unpacked: { manifest (`body`.json), data (`body`.bin) }, as body.js loadHumanFiles's. */
export function readHumanFiles(body = GAME_BODY) {
    const manifest = JSON.parse(readFileSync(new URL(`${body}.json`, FOLDER), "utf8"));
    const unpacked = gunzipSync(readFileSync(new URL(`${body}.bin`, FOLDER)));

    return { manifest, data: unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength) };
}

/** A body (HumanData), read from its files. */
export function readHumanData(body = GAME_BODY) {
    const { manifest, data } = readHumanFiles(body);

    return new HumanData(manifest, data);
}
