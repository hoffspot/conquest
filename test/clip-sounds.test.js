// What a coming model's clips sound like (client/js/beasts/sounds.js): each sound a recorded one
// the game knows how loud to play and the sound studio describes, at a moment of a clip its model
// has, inside it. (Heard as its clips play in the model viewer: e2e/model-viewer.spec.js.)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const { CLIP_SOUNDS } = await import("../client/js/beasts/sounds.js");
const { RECORDED } = await import("../client/js/audio/recorded.js");
const { RECORDED_ONLY } = await import("../client/js/audio/sound.js");
const { CATALOG } = await import("../client/js/audio/catalog.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

// (Reading the models, licensed ones: left out where they aren't here, saying so)
const licensed = licensedModelsHere() || LEFT_OUT;

// A GLB's JSON (its first chunk), unscrambled first if it's a licensed model's (app/scramble.js)
async function gltfOf(path) {
    const file = await readFile(new URL(`../client/${path}`, import.meta.url));
    const bytes = isScrambled(file) ? unscramble(file) : file;
    const length = bytes.readUInt32LE(12);

    return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
}

describe("what a coming model's clips sound like (beasts/sounds.js)", () => {
    it("plays only recorded sounds the game knows how loud to play, each described, at moments from its clip's start, a few each", () => {
        for (const [asset, clips] of Object.entries(CLIP_SOUNDS)) {
            assert.ok(ASSETS.models[asset], `${asset} in the catalog`);

            for (const [clip, cues] of Object.entries(clips)) {
                assert.ok(cues.length > 0, `${asset}'s ${clip}`);

                for (const [when, name, how] of cues) {
                    assert.ok(RECORDED[name]?.length >= 2 && RECORDED_ONLY[name]?.volume > 0 && CATALOG[name], `${asset}'s ${clip}: ${name}`);
                    assert.ok(when >= -0.05, `${clip}: ${name} at ${when} s`);
                    assert.ok(how === undefined || how === "peak", `${clip}: ${name}'s ${how}`);
                }
            }
        }

        // (The Kaiju's walk: each of its four feet down once a stride, three strides in its ten
        // seconds; its run four footfalls a second)
        const { Walk, Run } = CLIP_SOUNDS["beast-kaiju"];

        assert.equal(Walk.length, 12);
        assert.equal(Run.length, 40);
    });

    it("plays them at moments of clips its model has, inside each", { skip: licensed !== true && licensed }, async () => {
        for (const [asset, clips] of Object.entries(CLIP_SOUNDS)) {
            const gltf = await gltfOf(ASSETS.models[asset].files[0].path);

            for (const [clip, cues] of Object.entries(clips)) {
                const animation = gltf.animations.find(({ name }) => name === clip);

                assert.ok(animation, `${asset}'s ${clip}`);

                // (How long the clip is: its keys' last time)
                const length = Math.max(...animation.samplers.map(({ input }) => gltf.accessors[input].max[0]));

                assert.ok(cues.every(([when]) => when < length), `${asset}'s ${clip}: inside its ${length.toFixed(2)} s`);
            }
        }
    });
});
