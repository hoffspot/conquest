// The creatures drawn from a model (client/js/beasts/model.js): what's asked for near their
// lairs, what's kept and let go of once none's drawn from it, how their clips are posed for what the game asks of a body (walking into a run), when a
// breath's fire is out, and that every clip, bone and skin named for one is in its model and its
// skins as the catalog has them. (Drawn in a browser: e2e/models.spec.js.)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PropertyBinding, Texture } from "three";

const { AREA_LINGER, MODELS, breathing, fallOf, fetchModelsWith, forgetModels, hasModel, holdModel, keptModels, modelOf, modelsInside, modelsMet, modelsNear, poseOf, readyModels, releaseModel, strideOn, useModel } = await import("../client/js/beasts/model.js");
const { THEMES } = await import("../client/js/core/dungeons/themes.js");
const { landAt, planWorld, startFor } = await import("../client/js/core/worldplan/plan.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { CREATURES, LAIRS, tierAt } = await import("../client/js/core/creatures.js");
const { BEHEMOTH } = await import("../client/js/core/invasions.js");
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
    it("are in the catalog, each a lair's master, met in the wilds, in a kind of dungeon or against a town, with a look that stands in for it till it's read, and its skins there too", () => {
        for (const [id, { asset, skins = [""] }] of Object.entries(MODELS)) {
            assert.ok(hasModel(id), id);
            assert.equal(ASSETS.models[asset].tier, "demand", "downloaded only as it's wanted");
            assert.ok(LOOKS[id], `${id}'s stand-in`);

            // (Its model wanted near its lair (modelsNear), as one of them is put out in the wilds
            // (game.js, wantModel "now"), or on the way to and at the door of a dungeon whose
            // theme it's in (modelsInside))
            const inDungeons = Object.values(THEMES).some((theme) => modelsInside({ kind: "dungeon", theme: theme.id }).includes(id));

            // (Or it comes against a town: the Behemoth of the Rift, core/invasions.js BEHEMOTH)
            assert.ok(Object.values(LAIRS).some(({ master }) => master[0] === id) || CREATURES[id].biomes?.length || inDungeons || id === BEHEMOTH.creature, `${id} keeps a lair, is met in the wilds, in a kind of dungeon, or comes against a town`);

            // (Each of its skins but its own one of the catalog's "<asset>-skins")
            const files = (ASSETS.models[`${asset}-skins`]?.files ?? []).map(({ path }) => path);

            // (Its own skin first, if one may wear it: the Moonfang's always in its own)
            assert.ok(skins.length > 0 && skins.indexOf("") <= 0, `${id}: its own skin first`);

            for (const skin of skins.filter(Boolean)) {
                assert.ok(files.some((path) => path.endsWith(`.${skin}.bin`)), `${id}'s ${skin}`);
                assert.equal(ASSETS.models[`${asset}-skins`].tier, "demand");
            }
        }

        assert.equal(hasModel("dragon"), false);
    });

    it("has every clip and bone it names in its model, as the glTF loader names them (a clip it borrows, and the bones it's played on, in the lender's), its detail packed in, its skins' materials its own", { skip: licensed !== true && licensed }, async () => {
        for (const { asset, skins = [""], clips, attacks, specials, aloft, rests, lurk, fire, joints, mouth, borrows, detail = 3 } of Object.values(MODELS)) {
            const gltf = await gltfOf(ASSETS.models[asset].files[0].path);
            const named = new Set(gltf.animations.map(({ name }) => name));
            const nodes = new Set(gltf.nodes.map(({ name }) => PropertyBinding.sanitizeNodeName(name)));

            for (const clip of [...Object.values(clips), ...Object.values(attacks), ...Object.values(specials), ...Object.values(aloft ?? {}), ...Object.values(rests), ...(lurk ? [lurk.clip] : []), ...Object.keys(fire)].filter((each) => !borrows?.clips.includes(each))) {
                assert.ok(named.has(clip), clip);
            }

            // (What it borrows in the lender's model: the clips, and the bones each of its own is
            // lent, borrowClips; its own, and the one carried, in its own)
            if (borrows) {
                const lender = await gltfOf(ASSETS.models[MODELS[borrows.from].asset].files[0].path);
                const theirs = new Set(lender.nodes.map(({ name }) => PropertyBinding.sanitizeNodeName(name)));

                assert.ok(borrows.clips.every((clip) => !named.has(clip) && lender.animations.some(({ name }) => name === clip)), `${asset} borrows ${borrows.clips}`);

                for (const [own, other] of [...Object.entries(borrows.bones), borrows.carried]) {
                    assert.ok(nodes.has(own) && theirs.has(other), `${own} lent ${other}`);
                }
            }

            for (const bone of [...Object.values(joints), ...Object.values(mouth ?? {})]) {
                assert.ok(nodes.has(bone), bone);
            }

            // (Its detail packed in: three levels, each of as many meshes as the full one, one for
            // each of its parts; or as many as it says it has, `detail`: the black widow's full
            // detail only)
            const levels = gltf.nodes.filter(({ mesh }) => mesh !== undefined).map(({ extras }) => extras?.lod ?? 0);
            const parts = levels.filter((level) => level === 0).length;

            assert.deepEqual(
                [0, 1, 2].map((level) => levels.filter((each) => each === level).length),
                [0, 1, 2].map((level) => (level < detail ? parts : 0)),
                asset,
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

    it("asks for a kind's model where one may be met, at that hour: a werewolf's in the woods far from home by night, not by day, nor near home; a lair's master's only near its lair", () => {
        const plan = planWorld(2);
        const home = startFor(plan, "human").at;

        // (Woods out in the wild, five to eight tiers out: a ring of spots round home)
        const woods = [];

        for (let far = 3000; far < 7000 && woods.length < 3; far += 250) {
            for (let a = 0; a < Math.PI * 2 && woods.length < 3; a += 0.3) {
                const at = [Math.round(home[0] + Math.cos(a) * far), Math.round(home[1] + Math.sin(a) * far)];
                const land = landAt(plan, ...at);
                const tier = tierAt(at, [home], land.biome);

                if (["woods", "darkwood"].includes(land.biome) && !land.race && !land.water && tier >= 5 && tier <= 8) {
                    woods.push(at);
                }
            }
        }

        assert.equal(woods.length, 3);

        for (const at of woods) {
            assert.deepEqual(modelsMet(plan, at, home, true), ["werewolf"], `${at} by night`);
            assert.deepEqual(modelsMet(plan, at, home, false), [], `${at} by day`);
        }

        // (Near home, the wild's tamest: none, by night or day; the Dreadthorn and the Moonfang
        // are met only at their lairs and dens: modelsNear)
        assert.deepEqual(modelsMet(plan, [home[0] + 700, home[1]], home, true), []);
        assert.equal(CREATURES.dreadthorn.perilous && CREATURES.moonfang.perilous, true);
        assert.deepEqual(CREATURES.moonfang.biomes, []);
    });

    it("keeps a model while any's drawn from it, and a while after, then lets it go off the graphics card, its skins with it; but not one still wanted near its lair", () => {
        // (A model as read, shared by the werewolf and its den's Moonfang: its body's shape and
        // picture, and the moonfang's skin's own material, each counting when they're let go)
        const disposed = [];
        const counted = (thing, name) => Object.assign(thing, { dispose: () => disposed.push(name) });
        const body = counted(new MeshStandardMaterial({ map: counted(new Texture(), "picture") }), "material");
        const scene = new Group().add(new Mesh(counted(new BoxGeometry(), "shape"), body));
        const gltf = { scene, animations: [], skins: { moonfang: [counted(new MeshStandardMaterial({ emissiveMap: counted(new Texture(), "glow") }), "skin")] } };

        useModel("werewolf", gltf);
        useModel("moonfang", gltf);
        holdModel("werewolf");
        holdModel("moonfang");
        holdModel("moonfang");
        assert.deepEqual(keptModels(), { models: 1, unheld: 0 });

        // (Still drawn from, by the Moonfang: kept, however long)
        releaseModel("werewolf", 0);
        releaseModel("moonfang", 0);
        assert.equal(forgetModels(1e9, 1000), 0);

        // (None drawn from it: kept a while, and while it's wanted near its lair)
        releaseModel("moonfang", 1000);
        assert.deepEqual(keptModels(), { models: 1, unheld: 1 });
        assert.equal(forgetModels(1500, 1000), 0);
        assert.equal(forgetModels(5000, 1000, ["moonfang"]), 0);
        assert.equal(modelOf("werewolf"), gltf);
        assert.deepEqual(disposed, []);

        // (Then let go of, for both kinds drawn from it, all of it off the graphics card)
        assert.equal(forgetModels(5000, 1000, ["dreadthorn"]), 1);
        assert.equal(modelOf("werewolf"), null);
        assert.equal(modelOf("moonfang"), null);
        assert.deepEqual(disposed.sort(), ["glow", "material", "picture", "shape", "skin"]);
        assert.deepEqual(keptModels(), { models: 0, unheld: 0 });

        // (Drawn from again once it's read again: held again)
        useModel("werewolf", gltf);
        holdModel("werewolf");
        assert.equal(forgetModels(1e9, 1000), 0);
        releaseModel("werewolf", 0);
        forgetModels(1e9, 1000);
        assert.equal(modelOf("werewolf"), null);
    });

    it("keeps the models of the place the player's in, or at the door of, while they are, however long; and lets them go AREA_LINGER after they've left", () => {
        const disposed = [];
        const gltf = { scene: new Group().add(new Mesh(Object.assign(new BoxGeometry(), { dispose: () => disposed.push("shape") }), new MeshStandardMaterial())), animations: [] };

        useModel("werewolf", gltf);
        holdModel("werewolf");
        releaseModel("werewolf", 0);

        // (In it a long while, none drawn: kept)
        assert.equal(forgetModels(1e6, 1000, [], ["werewolf"]), 0);
        assert.equal(modelOf("werewolf"), gltf);

        // (Left: kept AREA_LINGER, then let go of off the graphics card)
        assert.equal(forgetModels(1e6 + AREA_LINGER - 1, 1000, [], []), 0);
        assert.equal(forgetModels(1e6 + AREA_LINGER, 1000, [], []), 1);
        assert.equal(modelOf("werewolf"), null);
        assert.deepEqual(disposed, ["shape"]);
        assert.equal(AREA_LINGER, 30000);
    });

    it("lists the kinds drawn from a model a place holds: a dungeon's foes once it's made, else all its theme may put in it; none for other places", () => {
        THEMES.denTest = { ...THEMES.caves, id: "denTest", packs: [{ id: "wolves", creatures: ["werewolf", "direWolf"], size: [1, 2], weight: 1 }], minis: [{ id: "rat", creature: "rat", title: "A rat", weight: 1 }], bosses: [{ id: "troll", creature: "troll", title: "A troll", weight: 1, guard: ["moonfang"] }] };

        try {
            assert.deepEqual(modelsInside({ kind: "dungeon", theme: "denTest" }).sort(), ["moonfang", "werewolf"]);
            assert.deepEqual(modelsInside({ kind: "dungeon", theme: "denTest", dungeon: { levels: [{ packs: [{ foes: [{ creature: "direWolf" }, { creature: "werewolf" }] }] }, { packs: [] }] } }), ["werewolf"]);
            assert.deepEqual(modelsInside({ kind: "dungeon", theme: "caves" }), [], "none in today's caves");
            assert.deepEqual(modelsInside({ kind: "tavern" }), []);
            assert.deepEqual(modelsInside(null), []);
        } finally {
            delete THEMES.denTest;
        }
    });

    it("gets a place's models ready for a player waiting at its door: each file kept first, hurried, then read; saying how far it's got; calmed when they stop waiting", async () => {
        const asked = [];
        const calmed = [];
        const received = new Map();

        // (A downloader that has the werewolf's model and skins half here, then kept; it hands
        // over nothing to be read, as one that's saving data would)
        fetchModelsWith({
            keep: async (file, priority, options) => {
                asked.push([file.path, priority, options]);
                received.set(file.path, file.bytes / 2);

                return !file.path.endsWith(".ash.bin");
            },
            received: (file) => received.get(file.path) ?? 0,
            calm: (file) => calmed.push(file.path),
            want: async () => null,
        });

        try {
            const readying = readyModels(["werewolf", "rat", "moonfang"]);
            const { asset, skins } = MODELS.werewolf;
            const paths = [ASSETS.models[asset].files[0].path, ...ASSETS.models[`${asset}-skins`].files.filter(({ path }) => [...skins, ...MODELS.moonfang.skins].some((skin) => skin && path.endsWith(`.${skin}.bin`))).map(({ path }) => path)];

            assert.deepEqual(readying.kinds, ["werewolf", "moonfang"]);
            assert.deepEqual(readying.files.map(({ path }) => path).sort(), [...paths].sort(), "each file once, the werewolf's and the Moonfang's skins between them");

            await readying.ready;

            const now = readying.progress();
            const bytes = readying.files.reduce((sum, file) => sum + file.bytes, 0);

            assert.equal(now.bytes, bytes);
            assert.equal(now.received, bytes, "each file done with, kept or not");
            assert.deepEqual(now.read, []);
            assert.deepEqual(now.failed, paths.filter((path) => path.endsWith(".ash.bin")));
            assert.ok(asked.every(([, priority, options]) => priority === "now" && options.hurry === true));

            readying.calm();
            assert.deepEqual(calmed.sort(), [...paths].sort());
        } finally {
            fetchModelsWith(null);
        }
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

    it("carries its walk and its run on through their strides as it gets up to speed, never leaping along them", () => {
        const werewolf = MODELS.werewolf;
        const lengths = { Idle: 1.88, Walk: 1.38, Run: 1.38 };
        const frame = 1 / 60;
        let strides = { walk: 100, run: 100 };

        // (A hundred seconds about, setting off from a stand to a sprint in half a second, a frame at
        // a time: each a frame's worth further on, from half as fast as its pace to twice; its clock
        // times the rate would have leapt a second along each frame)
        for (let i = 1; i <= 30; i++) {
            const next = strideOn(werewolf, strides, werewolf.pace * 2.2 * (i / 30), frame);

            for (const gait of ["walk", "run"]) {
                const step = next[gait] - strides[gait];

                assert.ok(step >= frame * 0.5 - 1e-9 && step <= frame * 2 + 1e-9, `${gait} ${step}`);
            }

            strides = next;
        }

        // (Posed where it's got to in each)
        const posed = poseOf(werewolf, { speed: werewolf.pace * 1.6, t: 100.5, strides }, { lengths });

        assert.ok(Math.abs(posed.find(({ clip }) => clip === "Walk").time - (strides.walk % lengths.Walk)) < 1e-9);
        assert.ok(Math.abs(posed.find(({ clip }) => clip === "Run").time - (strides.run % lengths.Run)) < 1e-9);
    });

    it("plays a giant ant's fall and flinch once it's been lent them (the Ant Monster's: borrowClips); till then, struck, it doesn't flinch, and dead, it rolls onto its back", () => {
        const ant = MODELS.ant;
        const own = { Idle: 4, Walk: 2, Run: 2, Attack: 3.33, Drink: 3, "Idle 2": 8, "Play 2": 3 };
        const lent = { ...own, "Hit React": 2.5, Death: 4 };
        const dead = { u: 0.5, side: -1 };

        assert.equal(ant.borrows.from, "antMonster");
        assert.deepEqual(ant.borrows.clips, [ant.clips.react, ant.clips.dead]);

        // (Not lent them yet: standing still as it rolls over, and no flinch)
        assert.deepEqual(poseOf(ant, { dead, t: 1 }, { lengths: own, died: 2 }), [{ clip: "Idle", weight: 1, time: 0 }]);
        assert.equal(weightOf(poseOf(ant, { react: { u: 0.5 }, t: 1 }, { lengths: own }), "Idle"), 1);
        assert.deepEqual(fallOf(ant, null, own), { roll: 0, lift: 0 });
        assert.deepEqual(fallOf(ant, { u: 1, side: -1 }, own), { roll: -Math.PI, lift: 1 });

        const half = fallOf(ant, dead, own);

        assert.ok(Math.abs(half.roll + Math.PI / 2) < 1e-9 && Math.abs(half.lift - 0.5) < 1e-9);

        // (Lent them: its fall played through, its flinch's start; no roll)
        assert.deepEqual(poseOf(ant, { dead, t: 1 }, { lengths: lent, died: 2 }), [{ clip: "Death", weight: 1, time: 2 }]);
        assert.ok(weightOf(poseOf(ant, { react: { u: 0.5 }, t: 1 }, { lengths: lent }), "Hit React") > 0.8);
        assert.deepEqual(fallOf(ant, dead, lent), { roll: 0, lift: 0 });

        // (One with a fall of its own never rolls)
        assert.deepEqual(fallOf(model, { u: 1, side: 1 }, lengths), { roll: 0, lift: 0 });
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
