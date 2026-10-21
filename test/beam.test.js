// A kaiju's atomic breath (client/js/beasts/beam.js): each one's clip and bones in its model, its
// moments inside the clip; and, on a small rig of its own, its head and neck turned to aim it at
// the ground in front of it, lit only in its clip, the same at a moment whatever came before, and
// the model's own materials given back. (Drawn in a browser: e2e/model-viewer.spec.js.)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { Bone, BoxGeometry, Group, MeshStandardMaterial, PropertyBinding, Quaternion, Skeleton, SkinnedMesh, Texture, Vector3 } from "three";

const { BEAMS, EnergyBreath } = await import("../client/js/beasts/beam.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

// (Reading the Kaiju's model, a licensed one: left out where it isn't here, saying so)
const licensed = licensedModelsHere() || LEFT_OUT;

// A GLB's JSON (its first chunk), unscrambled first if it's a licensed model's (app/scramble.js)
async function gltfOf(path) {
    const file = await readFile(new URL(`../client/${path}`, import.meta.url));
    const bytes = isScrambled(file) ? unscramble(file) : file;
    const length = bytes.readUInt32LE(12);

    return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
}

// A small beast that breathes one: facing +z, its neck 8 m up, its head's +y along its snout, its
// jaw dropped 40° (whose own line, halfway between its jaws, hits the ground 22 m out); a skinned
// box that glows, its tail's tip 10 m behind. Its bones are put back as they were made before each
// moment (as a mixer playing a clip would pose them)
function beast() {
    const model = new Group();
    const bones = Object.fromEntries(["Root", "Tail", "Neck", "Head", "Jaw", "Lip"].map((name) => [name, Object.assign(new Bone(), { name })]));

    bones.Root.add(bones.Tail, bones.Neck);
    bones.Tail.position.set(0, 4, -10);
    bones.Neck.position.set(0, 8, 2);
    bones.Neck.add(bones.Head);
    bones.Head.position.set(0, 0, 1);
    bones.Head.rotation.x = Math.PI / 2;
    bones.Head.add(bones.Jaw);
    bones.Jaw.rotation.x = (40 * Math.PI) / 180;
    bones.Jaw.add(bones.Lip);
    bones.Lip.position.set(0, 1, 0);
    model.add(bones.Root);

    const material = new MeshStandardMaterial({ emissiveMap: new Texture() });
    const mesh = new SkinnedMesh(new BoxGeometry(1, 1, 1), material);

    model.add(mesh);
    model.updateMatrixWorld(true);
    mesh.bind(new Skeleton(Object.values(bones)));

    const made = Object.values(bones).map((bone) => [bone, bone.quaternion.clone()]);
    const posed = () => made.forEach(([bone, turn]) => bone.quaternion.copy(turn));

    return { model, mesh, material, posed };
}

const SETTING = { clip: "Breath", mouth: { head: "Head", upper: [0, 1, 0], lower: "Lip", hinge: "Jaw" }, neck: [["Neck", 0.5], ["Head", 0.5]], charge: [0.3, 1.3], fire: [1.3, 4.6], reach: [13, 18], width: [1, 2] };

describe("a kaiju's atomic breath (beasts/beam.js)", () => {
    it("each one's clip and bones are in its model, and it charges, then fires, inside the clip", { skip: licensed !== true && licensed }, async () => {
        for (const [asset, { clip, mouth, neck, charge, fire, reach, width }] of Object.entries(BEAMS)) {
            const gltf = await gltfOf(ASSETS.models[asset].files[0].path);
            const nodes = new Set(gltf.nodes.map(({ name }) => PropertyBinding.sanitizeNodeName(name)));
            const animation = gltf.animations.find(({ name }) => name === clip);

            assert.ok(animation, `${asset}'s ${clip}`);

            for (const bone of [mouth.head, mouth.lower, mouth.hinge, ...neck.map(([name]) => name)]) {
                assert.ok(nodes.has(bone), `${asset}'s ${bone}`);
            }

            // (How long the clip is: its keys' last time)
            const length = Math.max(...animation.samplers.map(({ input }) => gltf.accessors[input].max[0]));

            assert.ok(charge[0] < charge[1] && charge[1] <= fire[0] && fire[0] < fire[1] && fire[1] < length, `${asset}: charged, then fired, in its ${length.toFixed(2)} s`);
            assert.ok(reach[0] > 0 && reach[0] <= reach[1] && width[0] > 0 && width[0] <= width[1]);
            assert.equal(neck.reduce((sum, [, share]) => sum + share, 0).toFixed(6), (1).toFixed(6), "its neck's shares, the whole turn");
        }
    });

    it("turns its head and neck to hit the ground where it means to, raking on from where it first lands; nothing of it before it charges or out of its clip", () => {
        const { model, posed } = beast();
        const breath = new EnergyBreath(model, SETTING);
        const at = (clip, time) => {
            posed();
            model.updateMatrixWorld(true);
            breath.at(clip, time);

            return breath.state;
        };

        assert.deepEqual(at("Breath", 0.1), { firing: false, glow: 0, aim: 0, hit: breath.state.hit, length: 0 });

        // (Charging: its glow lit, not yet aimed or fired)
        const charging = at("Breath", 0.6);

        assert.equal(charging.firing, false);
        assert.ok(charging.glow > 0);
        assert.equal(charging.aim, 0);

        // (Firing: aimed, landing where it means to, 13 m out raked on to 18 by the end)
        for (const [time, reach] of [
            [1.4, 13 + (5 * 0.1) / 3.3],
            [2.5, 13 + (5 * 1.2) / 3.3],
            [4.4, 13 + (5 * 3.1) / 3.3],
        ]) {
            const firing = at("Breath", time);

            assert.equal(firing.firing, true, `${time} s`);
            assert.equal(firing.aim, 1);
            assert.ok(firing.glow > 3);
            assert.ok(Math.abs(firing.hit - reach) < 0.5, `${time} s: ${firing.hit.toFixed(2)} m out, meant ${reach.toFixed(2)}`);
            assert.ok(firing.length > reach);
        }

        // (The same at a moment, whatever moment came before)
        const again = at("Breath", 2.5);

        at("Breath", 4.0);
        assert.deepEqual(at("Breath", 2.5), again);

        // (Its head left as the clip has it, unlit and none of it drawn, in any other clip)
        const head = model.getObjectByName("Head");

        assert.deepEqual(at("Roar", 2.5), { firing: false, glow: 0, aim: 0, hit: null, length: 0 });
        assert.equal(breath.object.visible, false);
        assert.ok(head.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)) < 1e-9);
        assert.equal(breath.glow.uGain.value, 0);
    });

    it("glows by a copy of the model's material, measured from its tail's tip to its head, and gives the model its own back", () => {
        const { model, mesh, material } = beast();
        const breath = new EnergyBreath(model, SETTING);

        assert.notEqual(mesh.material, material);
        assert.equal(mesh.material.customProgramCacheKey(), "charged glow");
        assert.equal(mesh.material.emissiveMap, material.emissiveMap);

        // (Along it, 0 at its tail's tip, 1 at its head: where its head is from its tail's, over
        // the distance squared)
        const { uTail, uSpan } = breath.glow;
        const head = new Vector3(0, 8, 3);
        const tail = new Vector3(0, 4, -10);

        assert.ok(uTail.value.distanceTo(tail) < 1e-6);
        assert.ok(Math.abs(head.clone().sub(uTail.value).dot(uSpan.value) - 1) < 1e-6);

        breath.dispose();
        assert.equal(mesh.material, material);
    });
});
