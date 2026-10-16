// The creatures drawn from a model (client/js/beasts/model.js): what's asked for near their
// lairs, how their clips are posed for what the game asks of a body, when a breath's fire is out,
// and that every clip and bone named for one is in its model as the catalog has it. (Drawn in a
// browser: e2e/models.spec.js.)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PropertyBinding } from "three";

const { MODELS, breathing, hasModel, modelsNear, poseOf } = await import("../client/js/beasts/model.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { LAIRS } = await import("../client/js/core/creatures.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");

const model = MODELS.dreadthorn;
const lengths = { Idling: 8, Crawling: 8, Flying: 8, Gliding: 8, Hovering: 8, "Hit React": 8, Death: 3.6, Bite: 1.6, Claw: 1.5, "Tail Sweep": 1.7, "Fire Breath": 3.4, "Hover Breath": 3.4, Roar: 8 };
const total = (posed) => posed.reduce((sum, { weight }) => sum + weight, 0);
const weightOf = (posed, clip) => posed.find((one) => one.clip === clip)?.weight ?? 0;

// A GLB's JSON (its first chunk), unscrambled first if it's a licensed model's (app/scramble.js)
async function gltfOf(path) {
    const file = await readFile(new URL(`../client/${path}`, import.meta.url));
    const bytes = isScrambled(file) ? unscramble(file) : file;
    const length = bytes.readUInt32LE(12);

    return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
}

describe("the creatures drawn from a model (beasts/model.js)", () => {
    it("are in the catalog, each a lair's master with a look that stands in for it till it's read", () => {
        for (const [id, { asset }] of Object.entries(MODELS)) {
            assert.ok(hasModel(id), id);
            assert.equal(ASSETS.models[asset].tier, "demand", "downloaded only as it's wanted");
            assert.ok(LOOKS[id], `${id}'s stand-in`);
            assert.ok(Object.values(LAIRS).some(({ master }) => master[0] === id), `${id} keeps a lair`);
        }

        assert.equal(hasModel("dragon"), false);
    });

    it("has every clip and bone it names in its model, as the glTF loader names them", async () => {
        for (const { asset, clips, attacks, specials, aloft, rests, fire, joints, mouth } of Object.values(MODELS)) {
            const gltf = await gltfOf(ASSETS.models[asset].files[0].path);
            const named = new Set(gltf.animations.map(({ name }) => name));
            const nodes = new Set(gltf.nodes.map(({ name }) => PropertyBinding.sanitizeNodeName(name)));

            for (const clip of [...Object.values(clips), ...Object.values(attacks), ...Object.values(specials), ...Object.values(aloft ?? {}), ...Object.values(rests), ...Object.keys(fire)]) {
                assert.ok(named.has(clip), clip);
            }

            for (const bone of [...Object.values(joints), ...Object.values(mouth)]) {
                assert.ok(nodes.has(bone), bone);
            }

            // (Its detail packed in: a mesh for each level)
            assert.deepEqual(gltf.nodes.filter(({ mesh }) => mesh !== undefined).map(({ extras }) => extras?.lod ?? 0).sort(), [0, 1, 2]);
        }
    });

    it("asks for a kind's model near one of its lairs, slain or not, once each, and none for a kind without one", () => {
        const lairs = [
            { at: [1000, 0], beast: "dreadthorn" },
            { at: [0, 900], beast: "dreadthorn" },
            { at: [100, 0], beast: "dragon" },
        ];

        assert.deepEqual(modelsNear([0, 0], lairs), ["dreadthorn"]);
        assert.deepEqual(modelsNear([0, 0], lairs, 800), []);
        assert.deepEqual(modelsNear([5000, 5000], lairs), []);
    });

    it("poses its clips for what the game asks: standing, walking, attacking through to the end, struck, resting, flying, hovering, dead", () => {
        // (Standing still: idling, all of it)
        let posed = poseOf(model, { speed: 0, t: 3 }, { lengths });

        assert.ok(Math.abs(total(posed) - 1) < 1e-6);
        assert.equal(weightOf(posed, "Idling"), 1);

        // (Walking at its pace: its walk)
        posed = poseOf(model, { speed: model.pace, t: 3 }, { lengths });
        assert.equal(weightOf(posed, "Crawling"), 1);

        // (Halfway through a bite: the bite, at its middle; at its very start, eased in)
        posed = poseOf(model, { speed: 0, attack: { style: "bite", u: 0.5 }, t: 3 }, { lengths });
        assert.equal(weightOf(posed, "Bite"), 1);
        assert.ok(Math.abs(posed.find(({ clip }) => clip === "Bite").time - 0.8) < 1e-6);
        assert.ok(weightOf(poseOf(model, { attack: { style: "bite", u: 0.01 }, t: 3 }, { lengths }), "Bite") < 0.5);

        // (Its breath, a special, as named)
        assert.equal(weightOf(poseOf(model, { attack: { style: "breath", u: 0.5 }, t: 0 }, { lengths }), "Fire Breath"), 1);

        // (Struck as it walks: a share of its flinch over its walk, adding up)
        posed = poseOf(model, { speed: model.pace, react: { u: 0.5 }, t: 3 }, { lengths });
        assert.ok(weightOf(posed, "Hit React") > 0.8 && Math.abs(total(posed) - 1) < 1e-6);

        // (Roaring, half eased in)
        posed = poseOf(model, { speed: 0, rest: { name: "roar", w: 0.5, t: 1 }, t: 3 }, { lengths });
        assert.ok(Math.abs(weightOf(posed, "Roar") - 0.5) < 1e-6);

        // (In the air, beating hard: its flight, a little gliding)
        posed = poseOf(model, { fly: { amount: 1, beat: 0.8 }, t: 3 }, { lengths });
        assert.ok(Math.abs(weightOf(posed, "Flying") - 0.8) < 1e-6 && Math.abs(weightOf(posed, "Gliding") - 0.2) < 1e-6);

        // (Hanging in the air over a fight, battle.js #hover: its hover; its breath there, its
        // breath from the air)
        posed = poseOf(model, { fly: { amount: 1, beat: 1, hover: true }, t: 3 }, { lengths });
        assert.equal(weightOf(posed, "Hovering"), 1);
        posed = poseOf(model, { fly: { amount: 1, beat: 1, hover: true }, attack: { style: "breath", u: 0.5 }, t: 3 }, { lengths });
        assert.equal(weightOf(posed, "Hover Breath"), 1);
        assert.equal(weightOf(posed, "Fire Breath"), 0);

        // (Dead: its fall at its own pace, held at its end; nothing else)
        posed = poseOf(model, { dead: { u: 1 }, attack: { style: "bite", u: 0.5 }, t: 3 }, { lengths, died: 2 });
        assert.deepEqual(posed, [{ clip: "Death", weight: 1, time: 2 }]);
        assert.ok(poseOf(model, { dead: { u: 1 } }, { lengths, died: 60 })[0].time < 3.6);
    });

    it("breathes its fire only while its breath's mouth is open (from a second in to 2.8), on the ground or from the air", () => {
        const at = (u) => breathing(model, { style: "breath", u }, lengths);

        assert.equal(at(0.2), false);
        assert.equal(at(1.2 / 3.4), true);
        assert.equal(at(2.7 / 3.4), true);
        assert.equal(at(3 / 3.4), false);
        assert.equal(breathing(model, { style: "bite", u: 0.5 }, lengths), false);
        assert.equal(breathing(model, null, lengths), false);

        // (From the air, its hover's breath: the same while)
        assert.equal(breathing(model, { style: "breath", u: 0.2 }, lengths, true), false);
        assert.equal(breathing(model, { style: "breath", u: 1.2 / 3.4 }, lengths, true), true);
    });
});
