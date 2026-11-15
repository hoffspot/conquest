// The creatures drawn from a model (client/js/beasts/model.js): what's asked for near their
// lairs, what's kept and let go of once none's drawn from it, how their clips are posed for what the game asks of a body (walking into a run), when a
// breath's fire is out, and that every clip, bone and skin named for one is in its model and its
// skins as the catalog has them. (Drawn in a browser: e2e/models.spec.js.)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { AnimationClip, Bone, BoxGeometry, Color, CompressedTexture, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, PropertyBinding, QuaternionKeyframeTrack, RGB_ETC2_Format, ShaderLib, Skeleton, SkinnedMesh, SphereGeometry, Texture, Uint16BufferAttribute } from "three";

const { AREA_LINGER, MODELS, OWN_MODELS, TINT, breathing, fallOf, fetchModelsWith, forgetModels, hasModel, holdModel, keptModels, modelBody, modelOf, modelsAhead, modelsHeld, modelsInside, modelsMet, modelsNear, poseOf, quarryModel, readyModels, releaseModel, strideOn, useModel } = await import("../client/js/beasts/model.js");
const { NEW_BEASTS } = await import("../client/js/core/materials.js");
const { heldOnPage, releaseCompressed } = await import("../client/js/world/release.js");
const { THEMES } = await import("../client/js/core/dungeons/themes.js");
const { landAt, planWorld, startFor } = await import("../client/js/core/worldplan/plan.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { CREATURES, LAIRS, tierAt } = await import("../client/js/core/creatures.js");
const { BEHEMOTH } = await import("../client/js/core/invasions.js");
const { RARE_CARDS } = await import("../client/js/core/rare.js");
const { SCENERY } = await import("../client/js/core/scenery.js");
const { HORSE_MODEL } = await import("../client/js/core/mounts.js");
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
    it("are in the catalog, each a lair's master or guard, met in the wilds, in a kind of dungeon or against a town, with a look that stands in for it till it's read, and its skins there too", () => {
        for (const [id, { asset, skins = [""] }] of Object.entries(MODELS)) {
            assert.ok(hasModel(id), id);
            assert.equal(ASSETS.models[asset].tier, "demand", "downloaded only as it's wanted");
            assert.ok(LOOKS[id], `${id}'s stand-in`);

            // (Its model wanted near its lair (modelsNear), as one of them is put out in the wilds
            // (game.js, wantModel "now"), or on the way to and at the door of a dungeon whose
            // theme it's in (modelsInside))
            const inDungeons = Object.values(THEMES).some((theme) => modelsInside({ kind: "dungeon", theme: theme.id }).includes(id));

            // (Or it comes against a town: the Behemoth of the Rift, core/invasions.js BEHEMOTH; or
            // it guards a lair whose master's drawn from its model, wanted with it: a riftling; or
            // it's a rare card's foe, a world's boss, its model wanted as soon as it's about: the
            // Stone Golem)
            const guarding = Object.values(LAIRS).some(({ master, guards = [] }) => MODELS[master[0]]?.asset === asset && guards.some(([kind]) => kind === id));
            const carded = Object.values(RARE_CARDS).some(({ shape }) => shape?.creature === id) && CREATURES[id].worldBoss;
            // (Or a rare card's world boss calls it to it as it's worn down, its model wanted with
            // its own: the Orc King's champions)
            const rallied = Object.entries(CREATURES).some(([boss, one]) => one.worldBoss && one.rally?.some(({ call }) => call.kind === id) && Object.values(RARE_CARDS).some(({ shape }) => shape?.creature === boss));
            // (Or it rides a scene's patrols, its model wanted near the scene as a lair's is:
            // Bellhaven's riders, game.js #modelLairs)
            const patrolling = Object.values(SCENERY).some(({ patrols }) => patrols?.riders.flat().includes(id));
            // (Or it's no creature but the horse a player rides, called with its whistle
            // (core/mounts.js; world/mounts3d.js), its model wanted as it's called)
            const ridden = id === HORSE_MODEL && !CREATURES[id];

            assert.ok(ridden || Object.values(LAIRS).some(({ master }) => master[0] === id) || guarding || CREATURES[id].biomes?.length !== 0 || inDungeons || id === BEHEMOTH.creature || carded || rallied || patrolling, `${id} keeps a lair, guards one, is met in the wilds, in a kind of dungeon, comes against a town, is a rare card's world boss or one it calls, rides a scene's patrols, or is a player's horse`);

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
        for (const { asset, skins = [""], clips, attacks, specials, chains = {}, carry = {}, aloft, rests, lurk, fire, joints, mouth, mouths = [], together = [], borrows, detail = 3, parts: worn = [], choose = [] } of Object.values(MODELS)) {
            const gltf = await gltfOf(ASSETS.models[asset].files[0].path);
            const named = new Set(gltf.animations.map(({ name }) => name));
            const nodes = new Set(gltf.nodes.map(({ name }) => PropertyBinding.sanitizeNodeName(name)));

            for (const clip of [...Object.values(clips), ...Object.values(attacks), ...Object.values(specials), ...Object.values(chains).flatMap((links) => links.map((link) => link.clip)), ...Object.values(aloft ?? {}), ...Object.values(rests), ...(lurk ? [lurk.clip] : []), ...Object.keys(fire)].filter((each) => !borrows?.clips.includes(each))) {
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

            for (const bone of [...Object.values(joints), ...Object.values(mouth ?? {}), ...mouths.flatMap((other) => Object.values(other)), ...Object.values(carry).map((held) => held.bone)]) {
                assert.ok(nodes.has(bone), bone);
            }

            // (The parts it wears, of a model whose parts are kept apart (the Order of the Bell's): each
            // a part of its model, a mesh by that name, as partOf finds it)
            for (const part of [...worn, ...choose.flat()]) {
                assert.ok(gltf.nodes.some((node) => node.mesh !== undefined && PropertyBinding.sanitizeNodeName(node.name) === part), `${asset}: ${part}`);
            }

            // (Its other heads breathing with it only in a clip it breathes in, from a mouth of its own:
            // a cerberus's three)
            assert.ok(together.every((clip) => fire[clip]) && (!together.length || (mouth && mouths.length)), asset);

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

    it("draws each of the crafters' quarry from the model of the creature it's like, in its own skin, colour and size, and names its own model to come; drawn from that once it's bought and in the catalog (quarryModel)", () => {
        const kebab = (id) => id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

        assert.equal(Object.keys(NEW_BEASTS).length, 9);

        for (const [id, { like, skin, tint, size, model: own }] of Object.entries(NEW_BEASTS)) {
            // (Its own model to come, by a key of its own: not in the catalog yet, none bought)
            assert.equal(own, `beast-${kebab(id)}`);
            assert.ok(!ASSETS.models[own] && !ASSETS.models[`${own}-skins`] && !OWN_MODELS[id], `${own}: none bought yet`);
            assert.ok(LOOKS[id] && CREATURES[id], `${id}'s stand-in`);

            const lent = MODELS[like];

            // (Like a kind with no model, a treant: its stand-in, till its own model's bought)
            if (!lent) {
                assert.equal(MODELS[id], undefined, id);
                assert.equal(hasModel(id), false, id);
                assert.equal(quarryModel(id), null, id);
                continue;
            }

            const model = MODELS[id];

            assert.ok(hasModel(id), id);
            assert.deepEqual([model.asset, model.own, model.tint, model.skins ?? [""]], [lent.asset, own, tint, skin ? [skin] : (lent.skins ?? [""])], id);
            assert.deepEqual([model.clips, model.attacks, model.specials, model.rests, model.joints, model.made, model.chains, model.carry], [lent.clips, lent.attacks, lent.specials, lent.rests, lent.joints, lent.made, lent.chains, lent.carry], `${id} moves as ${like} does`);
            assert.ok(Math.abs(model.length - lent.length * size) < 0.001 && Math.abs(model.pace - lent.pace * size) < 0.01, `${id} drawn ${size} times as long, and going as much faster`);
            assert.equal(model.runPace === undefined, lent.runPace === undefined, id);
        }

        // (A model bought for one: its entry written (OWN_MODELS, as any of MODELS' is, its asset its
        // own key) and the catalog given it. Then it's drawn from that, as it's made, in no tint;
        // till both are there, from what it borrows, or its stand-in)
        const file = (name) => ({ tier: "demand", licensed: true, files: [{ path: `models/beasts/${name}.bin`, hash: "0123456789", bytes: 1 }] });
        const catalog = { ...ASSETS.models, "beast-mythril-golem": file("mythril-golem"), "beast-ironbark-treant": file("ironbark-treant") };
        const entry = (asset) => ({ asset, length: 1.6, made: { long: 0.8, tall: 1.6 }, clips: { idle: "Idle", walk: "Walk" }, attacks: { smash: "Smash" }, specials: {}, rests: {}, fire: {}, joints: { torso: "chest", body: "hips", head: "head", mouth: "head", left: "hand_l" }, mouth: null, pace: 1.1, flinch: 0.5 });
        const bought = { mythrilGolem: entry("beast-mythril-golem"), ironbarkTreant: entry("beast-ironbark-treant") };

        assert.deepEqual(quarryModel("mythrilGolem", { catalog, bought }), { ...bought.mythrilGolem, own: "beast-mythril-golem" });
        assert.deepEqual(quarryModel("ironbarkTreant", { catalog, bought }), { ...bought.ironbarkTreant, own: "beast-ironbark-treant" });
        assert.equal(quarryModel("mythrilGolem", { catalog }).asset, "beast-golem", "in the catalog, but its entry not written: the Stone Golem's");
        assert.equal(quarryModel("mythrilGolem", { bought }).asset, "beast-golem", "its entry written, but not in the catalog: the Stone Golem's");
        assert.equal(quarryModel("mythrilGolem", { bought }).tint, NEW_BEASTS.mythrilGolem.tint);
        assert.equal(quarryModel("ironbarkTreant", { bought }), null, "its stand-in");
        assert.deepEqual(quarryModel("mythrilGolem"), MODELS.mythrilGolem);
    });

    it("draws one of the crafters' quarry from another's model in its own colour (TINT): each of its materials its own, its picture's light and shade mixed toward the tint; the one it's like as ever", () => {
        // (A small model in code: a ball on two bones, as the giant cockroach's are named, of one
        // material with a picture, its idle a clip)
        const made = () => {
            const [root, torso] = [new Bone(), new Bone()];
            const geometry = new SphereGeometry(0.5, 6, 4);
            const count = geometry.attributes.position.count;
            const material = Object.assign(new MeshStandardMaterial({ map: new Texture() }), { name: "Shell" });

            root.name = "COG";
            torso.name = "Torso";
            torso.position.set(0, 0.5, 0);
            root.add(torso);
            geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
            geometry.setAttribute("skinWeight", new Float32BufferAttribute(Array.from({ length: count * 4 }, (_, k) => (k % 4 === 0 ? 1 : 0)), 4));

            const scene = new Group();
            const mesh = new SkinnedMesh(geometry, material);

            scene.add(root, mesh);
            scene.updateMatrixWorld(true);
            mesh.bind(new Skeleton([root, torso]), new Matrix4());

            return { scene, animations: [new AnimationClip("Idle", 1, [])], material };
        };
        const materialsOf = (plan) => {
            const found = new Set();

            plan.object.traverse((node) => node.isSkinnedMesh && node.material.isMeshStandardMaterial && found.add(node.material));

            return [...found];
        };
        const gltf = made();
        const [scarab] = materialsOf(modelBody("gildedScarab", gltf));
        const [roach] = materialsOf(modelBody("giantCockroach", gltf));

        // (Each its own copy: the model as read untouched)
        assert.ok(scarab !== gltf.material && roach !== gltf.material && scarab !== roach);
        assert.equal(gltf.material.customProgramCacheKey(), new MeshStandardMaterial().customProgramCacheKey());

        // (Its shader given the tint, as three.js compiles it; the cockroach's as ever)
        const compiled = (material) => {
            const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };

            material.onBeforeCompile(shader, null);

            return shader;
        };
        const tinted = compiled(scarab);
        const plain = compiled(roach);

        assert.equal(scarab.customProgramCacheKey(), "beast-tinted");
        assert.ok(tinted.uniforms.tint.value.equals(new Color(NEW_BEASTS.gildedScarab.tint)));
        assert.match(tinted.fragmentShader, /uniform vec3 tint;\s*void main\(\) \{/);
        assert.ok(tinted.fragmentShader.includes(`#include <map_fragment>\n            diffuseColor.rgb = mix(diffuseColor.rgb, tint * (${TINT.least.toFixed(2)} + ${TINT.more.toFixed(2)} * sqrt(`));
        assert.ok(tinted.fragmentShader.includes(`, ${TINT.share.toFixed(2)});`));
        assert.equal(plain.uniforms.tint, undefined);
        assert.ok(!plain.fragmentShader.includes("tint"));
        assert.notEqual(roach.customProgramCacheKey(), "beast-tinted");
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

    it("reads what's predicted ahead of its being met; on a touch screen only fetches it, and reads what the player's close to the lair of or has met", () => {
        const predicted = ["dreadthorn", "werewolf", "moonfang", "werewolf"];

        // (As it was, everywhere else: all of them read)
        assert.deepEqual(modelsAhead({ predicted, close: ["riftFiend"], met: [] }), { read: ["dreadthorn", "werewolf", "moonfang", "riftFiend"], fetch: [] });

        // (Short of memory: what's only predicted fetched and kept, not held on the page)
        assert.deepEqual(modelsAhead({ predicted, close: [], met: [], sparing: true }), { read: [], fetch: ["dreadthorn", "werewolf", "moonfang"] });

        // (Close to the Dreadthorn's lair, and a werewolf come into the battle: those read)
        assert.deepEqual(modelsAhead({ predicted, close: ["dreadthorn"], met: ["werewolf", "ant"], sparing: true }), { read: ["dreadthorn", "werewolf", "ant"], fetch: ["moonfang"] });
        assert.deepEqual(modelsAhead({}), { read: [], fetch: [] });

        // (How close is close: within modelsNear's reach, as near as asked)
        const lairs = [{ at: [1000, 0], beast: "dreadthorn" }];

        assert.deepEqual(modelsNear([0, 0], lairs), ["dreadthorn"]);
        assert.deepEqual(modelsNear([0, 0], lairs, 400), []);
        assert.deepEqual(modelsNear([650, 0], lairs, 400), ["dreadthorn"]);
    });

    it("counts what the models read hold on the page: their shapes, their clips' keys, and their pictures and their skins' till the graphics card has them; each file once, and nothing the bodies drawn from them were counted for", () => {
        const levels = (size) => [{ data: new Uint8Array((size / 4) ** 2 * 8), width: size, height: size }];
        const picture = new CompressedTexture(levels(64), 64, 64, RGB_ETC2_Format);
        const glow = new CompressedTexture(levels(32), 32, 32, RGB_ETC2_Format);
        const shape = new BoxGeometry();
        const scene = new Group().add(new Mesh(shape, new MeshStandardMaterial({ map: picture })));
        const times = new Float32Array(10);
        const clip = (name) => new AnimationClip(name, 1, [new QuaternionKeyframeTrack("Bone.quaternion", times, new Float32Array(40))]);
        const gltf = { scene, animations: [clip("Idle"), clip("Walk")], skins: { moonfang: [new MeshStandardMaterial({ emissiveMap: glow })] } };
        const shapes = [...Object.values(shape.attributes), shape.index].reduce((sum, { array }) => sum + array.byteLength, 0);
        // (Two clips' turns, and the times they share once)
        const keys = 2 * 160 + 40;

        assert.equal(modelsHeld(), 0);
        useModel("werewolf", gltf);
        useModel("moonfang", gltf);
        holdModel("werewolf");
        assert.equal(modelsHeld(), shapes + keys + 2048 + 512);

        // (A body drawn from it shares its shape and its picture: counted with the bodies first,
        // they aren't again)
        const counted = new Set();
        const body = heldOnPage([scene.clone()], [], counted);

        assert.equal(body, shapes + 2048);
        assert.equal(modelsHeld(counted), keys + 512);

        // (Its picture on the graphics card: let go of off the page, and no longer counted)
        releaseCompressed(picture);
        picture.onUpdate(picture);
        assert.equal(modelsHeld(), shapes + keys + 512);

        // (A clip lent it since: counted)
        gltf.animations.push(new AnimationClip("Fall", 1, [new QuaternionKeyframeTrack("Bone.quaternion", new Float32Array(5), new Float32Array(20))]));
        assert.equal(modelsHeld(), shapes + keys + 512 + 20 + 80);

        releaseModel("werewolf", 0);
        forgetModels(1e9, 1000);
        assert.equal(modelsHeld(), 0);
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
            // (Today's caves and outlaws' hideouts: only the orc that may be on their throne, and
            // the caves' golems, the crafters' quarry's, drawn from the Stone Golem's model)
            assert.deepEqual(modelsInside({ kind: "dungeon", theme: "caves" }), ["mythrilGolem", "adamantiteGolem", "orcWarlord"], "the caves' golems and Orc Warlord");
            assert.deepEqual(modelsInside({ kind: "dungeon", theme: "hideout" }), ["orcReaver"], "the hideouts' Orc Reaver");
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

    it("breathes a cerberus's fire from its middle head, or from all three at once, as far into its clip as its flames are out", () => {
        const hound = MODELS.cerberus;
        const lent = { Fire: 2.52, "Fire All": 5.04, "Attack 3": 2.04 };
        const at = (style, u) => breathing(hound, { style, u }, lent);

        // (Its middle head's: the whole of its Fire, its flames out from 0.9 to 2.1 seconds)
        assert.equal(at("breath", 0.8 / 2.52), false);
        assert.equal(at("breath", 1.5 / 2.52), true);
        assert.equal(at("breath", 2.3 / 2.52), false);
        // (All three's: Fire All played from 0.6 to 4.2 seconds, their flames out from 1.2 to 3.6)
        assert.equal(at("inferno", 0.1), false);
        assert.equal(at("inferno", (2 - 0.6) / 3.6), true);
        assert.equal(at("inferno", (3.9 - 0.6) / 3.6), false);
        assert.equal(at("bite", 0.5), false);
        assert.deepEqual([hound.together, hound.mouths.length, MODELS.ashmaw.length > hound.length], [["Fire All"], 2, true]);
    });
});
