// The creatures drawn from a model (client/js/beasts/model.js): what's asked for near their
// lairs, how their clips are posed for what the game asks of a body (walking into a run), when a
// breath's fire is out, and that every clip, bone and skin named for one is in its model and its
// skins as the catalog has them. (Drawn in a browser: e2e/models.spec.js.)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PropertyBinding } from "three";

const { MODELS, breathing, hasModel, modelsNear, poseOf } = await import("../client/js/beasts/model.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { CREATURES, LAIRS } = await import("../client/js/core/creatures.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

// (Reading the Dreadthorn's model, a licensed one: left out where it isn't here, saying so)
const licensed = licensedModelsHere() || LEFT_OUT;

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
    it("are in the catalog, each a lair's master or met in the wilds, with a look that stands in for it till it's read, and its skins there too", () => {
        for (const [id, { asset, skins = [""] }] of Object.entries(MODELS)) {
            assert.ok(hasModel(id), id);
            assert.equal(ASSETS.models[asset].tier, "demand", "downloaded only as it's wanted");
            assert.ok(LOOKS[id], `${id}'s stand-in`);

            // (Its model wanted near its lair (modelsNear), or as one of them is put out in the
            // wilds (game.js, wantModel "now"))
            assert.ok(Object.values(LAIRS).some(({ master }) => master[0] === id) || CREATURES[id].biomes?.length, `${id} keeps a lair, or is met in the wilds`);

            // (Each of its skins but its own one of the catalog's "<asset>-skins")
            const files = (ASSETS.models[`${asset}-skins`]?.files ?? []).map(({ path }) => path);

            assert.equal(skins[0], "", `${id}: its own skin first`);

            for (const skin of skins.slice(1)) {
                assert.ok(files.some((path) => path.endsWith(`.${skin}.bin`)), `${id}'s ${skin}`);
                assert.equal(ASSETS.models[`${asset}-skins`].tier, "demand");
            }
        }

        assert.equal(hasModel("dragon"), false);
    });

    it("has every clip and bone it names in its model, as the glTF loader names them, its detail packed in, its skins' materials its own", { skip: licensed !== true && licensed }, async () => {
        for (const { asset, skins = [""], clips, attacks, specials, aloft, rests, fire, joints, mouth } of Object.values(MODELS)) {
            const gltf = await gltfOf(ASSETS.models[asset].files[0].path);
            const named = new Set(gltf.animations.map(({ name }) => name));
            const nodes = new Set(gltf.nodes.map(({ name }) => PropertyBinding.sanitizeNodeName(name)));

            for (const clip of [...Object.values(clips), ...Object.values(attacks), ...Object.values(specials), ...Object.values(aloft ?? {}), ...Object.values(rests), ...Object.keys(fire)]) {
                assert.ok(named.has(clip), clip);
            }

            for (const bone of [...Object.values(joints), ...Object.values(mouth ?? {})]) {
                assert.ok(nodes.has(bone), bone);
            }

            // (Its detail packed in: three levels, each of as many meshes as the full one, one for
            // each of its parts)
            const levels = gltf.nodes.filter(({ mesh }) => mesh !== undefined).map(({ extras }) => extras?.lod ?? 0);
            const parts = levels.filter((level) => level === 0).length;

            assert.deepEqual(
                [0, 1, 2].map((level) => levels.filter((each) => each === level).length),
                [parts, parts, parts],
            );

            // (Each skin's materials some of its model's, by name: put on in their place)
            const materials = new Set(gltf.materials.map(({ name }) => name));

            for (const skin of skins.slice(1)) {
                const file = ASSETS.models[`${asset}-skins`].files.find(({ path }) => path.endsWith(`.${skin}.bin`));
                const worn = await gltfOf(file.path);

                assert.ok(worn.materials.length && worn.materials.every(({ name }) => materials.has(name)), `${asset}'s ${skin}`);
                assert.equal(worn.meshes, undefined, `${asset}'s ${skin}: only its textures`);
            }
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

    it("walks one that has a run into it as it goes faster: its walk at its pace, its run at twice that", () => {
        const werewolf = MODELS.werewolf;
        const strides = { Idle: 1.88, Walk: 1.38, Run: 1.38, Claw: 1.3, Attack: 2.21, "Hit React": 0.96, Death: 2.92, Howl: 3, "Idle Alert": 2 };

        assert.equal(weightOf(poseOf(werewolf, { speed: werewolf.pace, t: 1 }, { lengths: strides }), "Walk"), 1);
        assert.equal(weightOf(poseOf(werewolf, { speed: werewolf.pace, t: 1 }, { lengths: strides }), "Run"), 0);

        let posed = poseOf(werewolf, { speed: werewolf.pace * 1.6, t: 1 }, { lengths: strides });

        assert.ok(weightOf(posed, "Walk") > 0.2 && weightOf(posed, "Run") > 0.2 && Math.abs(total(posed) - 1) < 1e-6);
        posed = poseOf(werewolf, { speed: werewolf.pace * 2.2, t: 1 }, { lengths: strides });
        assert.equal(weightOf(posed, "Run"), 1);

        // (Its claws, its leap as a special, its howl as a rest)
        assert.equal(weightOf(poseOf(werewolf, { attack: { style: "claw", u: 0.5 }, t: 1 }, { lengths: strides }), "Claw"), 1);
        assert.equal(weightOf(poseOf(werewolf, { attack: { style: "pounce", u: 0.5 }, t: 1 }, { lengths: strides }), "Attack"), 1);
        assert.ok(Math.abs(weightOf(poseOf(werewolf, { rest: { name: "howl", w: 1, t: 1 }, t: 1 }, { lengths: strides }), "Howl") - 1) < 1e-6);

        // (The Dreadthorn has no run: its walk, however fast)
        assert.equal(weightOf(poseOf(model, { speed: model.pace * 3, t: 3 }, { lengths }), "Crawling"), 1);
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
