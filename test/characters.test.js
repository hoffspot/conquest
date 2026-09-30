import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { Actions, ATTACKS } from "../client/js/characters/actions.js";
import { HumanData } from "../client/js/characters/body.js";
import { parseBVH, retarget } from "../client/js/characters/bvh.js";
import { allDetailTargetNames, DETAILS, detailTargets } from "../client/js/characters/details.js";
import { EQUIPMENT, ITEMS, SLOTS, socketOn } from "../client/js/characters/equipment.js";
import { placed } from "../client/js/characters/character.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";
import { aboveHairline, beardAmount, faceFrame } from "../client/js/characters/face.js";
import { buildHair, HAIRSTYLES } from "../client/js/characters/hair.js";
import { amplitude, cadence, CURVES, curveAt, NATURAL_SPEED, phaseName, RUN_CURVES, RUN_STANCE, runCadence, runStrideLength, STANCE, strideLength, walkToRunSpeed } from "../client/js/characters/gait.js";
import { buildGarment, COMPOSITE_BUMP, compositeGarments, DESIGNS, designSolid, GARMENTS, insideOf, measureBody, paintGarment, texelMap } from "../client/js/characters/garments.js";
import { Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { allBustTargetNames, allMacroTargetNames, bustTargets, components, MACRO_DEFAULTS, macroTargets } from "../client/js/characters/macro.js";
import { buildDrape, DRAPES } from "../client/js/characters/drapes.js";
import { decodeSection, encodeSection, Packer } from "../client/js/characters/pack.js";
import { buildItem, itemMaterial } from "../client/js/characters/items.js";
import { LOOKS, PEOPLES, peopleLook } from "../client/js/characters/peoples.js";
import { FOLK, PRESETS } from "../client/js/characters/presets.js";
import { JOINTS, jointOf, jointRotation, limitRotation, Rig } from "../client/js/characters/rig.js";
import { paintEye, paintSkin, SKIN_ROUGHNESS, SkinAtlas } from "../client/js/characters/skin.js";
import { HAIR_SHINE, HairMaterial, SKIN_WRAP, SkinMaterial } from "../client/js/characters/surfaces.js";

// The real body data the build script makes (client/characters)
const manifest = JSON.parse(readFileSync(new URL("../client/characters/human.json", import.meta.url), "utf8"));
const unpacked = gunzipSync(readFileSync(new URL("../client/characters/human.bin", import.meta.url)));
const human = new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));

/** The parts of a Character the engine's modules use, without its textures (which need a DOM). */
function figure(shape = {}) {
    const { positions, joints } = human.shape(shape);
    const rig = new Rig(human.bones);
    const object = new THREE.Group();
    let height = 0;

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0) {
            height = Math.max(height, positions[v * 3 + 1]);
        }
    }

    object.add(rig.root);
    rig.fit(joints);
    object.updateMatrixWorld(true);

    return { human, rig, object, positions, normals: human.normals(positions), joints, height, holds: {}, items: [] };
}

const DEG = Math.PI / 180;

describe("body shape sliders (macro.js)", () => {
    it("blends between the two nearest shapes", () => {
        assert.deepEqual(components("gender", 0.5), [["female", 0.5], ["male", 0.5]]);
        assert.deepEqual(components("muscle", 1), [["averagemuscle", 0.0196], ["maxmuscle", 0.9804]]);
        // Height's middle is the base shape, which has no target
        assert.deepEqual(components("height", 0.5), []);
    });

    it("only ever uses the prepared targets, weights between 0 and 1", () => {
        const names = new Set(allMacroTargetNames());

        assert.equal(names.size, 60);

        for (const settings of [{}, { gender: 0, muscle: 0, weight: 0, height: 0 }, { gender: 1, muscle: 1, weight: 1, height: 1, african: 1, asian: 0, caucasian: 0 }]) {
            for (const { name, weight } of macroTargets(settings)) {
                assert.ok(names.has(name), name);
                assert.ok(weight > 0 && weight <= 1, `${name} ${weight}`);
            }
        }
    });

    it("a man uses only male shapes, and heritage shares add up to his whole", () => {
        const targets = macroTargets({ gender: 1 });

        assert.ok(targets.every(({ name }) => !name.includes("female")));

        const heritage = targets.filter(({ name }) => /(african|asian|caucasian)-male/.test(name)).reduce((sum, { weight }) => sum + weight, 0);

        assert.ok(Math.abs(heritage - 1) < 0.02, `heritage adds to ${heritage}`);
    });

    it("changes the bust of female bodies only, from shapes in the data file", () => {
        const names = new Set(allBustTargetNames());
        const total = (settings) => bustTargets(settings).reduce((sum, { weight }) => sum + weight, 0);

        assert.equal(names.size, 18);

        for (const name of names) {
            assert.ok(human.details.has(name), name);
        }

        for (const settings of [{ gender: 0, bust: 0 }, { gender: 0, bust: 1, muscle: 0.2, weight: 0.8 }, { gender: 0.3, bust: 0.9, muscle: 1, weight: 0 }]) {
            for (const { name, weight } of bustTargets(settings)) {
                assert.ok(names.has(name), name);
                assert.ok(weight > 0 && weight <= 1, `${name} ${weight}`);
            }
        }

        // The average cup is the body as it is; a woman's full bust is all hers, half a woman's half
        assert.deepEqual(bustTargets({ gender: 0 }), []);
        assert.ok(Math.abs(total({ gender: 0, bust: 1 }) - 1) < 0.03, `${total({ gender: 0, bust: 1 })}`);
        assert.ok(Math.abs(total({ gender: 0.5, bust: 1 }) - 0.5) < 0.03, `${total({ gender: 0.5, bust: 1 })}`);
        assert.deepEqual(bustTargets({ gender: 1, bust: 1 }), []);
    });

    it("gives a woman a fuller bust as the slider goes up, and leaves a man's chest alone", () => {
        const chestFront = (macro) => {
            const { positions } = human.shape({ macro });
            let height = 0;
            let front = -Infinity;

            for (let v = 0; v < human.vertexCount; v++) {
                if (human.partOf[v] === 0) {
                    height = Math.max(height, positions[v * 3 + 1]);
                }
            }

            for (let v = 0; v < human.vertexCount; v++) {
                const up = positions[v * 3 + 1] / height;

                if (human.partOf[v] === 0 && up > 0.66 && up < 0.78 && Math.abs(positions[v * 3]) < 0.15) {
                    front = Math.max(front, positions[v * 3 + 2]);
                }
            }

            return front;
        };
        const woman = [0, 0.5, 1].map((bust) => chestFront({ gender: 0, bust }));
        const man = [0, 0.5, 1].map((bust) => chestFront({ gender: 1, bust }));

        assert.ok(woman[0] < woman[1] && woman[1] + 0.02 < woman[2], `a woman's chest comes forward to ${woman.map((z) => z.toFixed(3))} m`);
        assert.ok(man[0] === man[1] && man[1] === man[2], `a man's chest stays at ${man[0]}`);
    });
});

describe("face and physique sliders (details.js)", () => {
    it("has unique ids and turns values into shapes, both ways", () => {
        assert.equal(new Set(DETAILS.map(({ id }) => id)).size, DETAILS.length);
        assert.deepEqual(detailTargets({ chin: 0.5 }), [{ name: "chin/chin-prominent-incr", weight: 0.5 }]);
        assert.deepEqual(detailTargets({ chin: -2 }), [{ name: "chin/chin-prominent-decr", weight: 1 }]);
        assert.deepEqual(detailTargets({ earPoint: -1 }), []);
    });

    it("every shape a slider uses is in the data file", () => {
        const packed = new Set(manifest.details.map(({ name }) => name));

        for (const name of allDetailTargetNames()) {
            assert.ok(packed.has(name), name);
        }
    });
});

describe("the data file's packing (pack.js)", () => {
    it("round-trips raw and delta-coded sections", () => {
        const packer = new Packer();
        const floats = Float32Array.from({ length: 101 }, (_, i) => Math.sin(i) * 3);
        const smooth = Int16Array.from({ length: 300 }, (_, i) => Math.round(Math.sin(i / 20) * 12000));
        const indices = Uint16Array.from([0, 5, 9, 60000, 60001, 2]);
        const a = packer.add(floats);
        const b = packer.add(smooth, { codec: "delta", channels: 3 });
        const c = packer.add(indices, { codec: "delta" });
        const bytes = packer.toBytes();

        for (const section of [a, b, c]) {
            assert.equal(section.offset % 4, 0, "sections are 4-byte aligned");
        }

        assert.deepEqual(decodeSection(bytes.buffer, a), floats);
        assert.deepEqual(decodeSection(bytes.buffer, b), smooth);
        assert.deepEqual(decodeSection(bytes.buffer, c), indices);
    });

    it("stores smooth data as small, repetitive bytes", () => {
        const smooth = Int16Array.from({ length: 3000 }, (_, i) => Math.round(Math.sin(i / 200) * 5000));
        const { bytes } = encodeSection(smooth, { codec: "delta" });
        const highBytes = bytes.subarray(smooth.length);

        assert.ok(highBytes.every((byte) => byte === 0), "differences fit in the low bytes");
    });
});

describe("the body (body.js)", () => {
    it("has the base mesh, 52 Mixamo-named bones and every vertex weighted", () => {
        assert.equal(human.bones.length, 52);
        assert.equal(human.bones[0].name, "Hips");
        assert.ok(human.bones.every(({ parent }, i) => parent < i), "parents come first");

        for (let v = 0; v < human.vertexCount; v++) {
            const total = human.skinWeights[v * 4] + human.skinWeights[v * 4 + 1] + human.skinWeights[v * 4 + 2] + human.skinWeights[v * 4 + 3];

            assert.equal(total, 255, `vertex ${v}'s weights add up`);
        }
    });

    it("stands on the ground at a human height, and sliders change it", () => {
        const heightOf = (shape) => figure(shape).height;
        const average = heightOf({});
        const man = heightOf({ macro: { gender: 1 } });
        const woman = heightOf({ macro: { gender: 0 } });

        assert.ok(average > 1.55 && average < 1.8, `average ${average}`);
        assert.ok(man > average && woman < average);
        assert.ok(heightOf({ macro: { height: 0.2 } }) < average);

        const { positions } = human.shape({});
        let lowest = Infinity;

        for (let v = 0; v < human.vertexCount; v++) {
            lowest = Math.min(lowest, positions[v * 3 + 1]);
        }

        assert.ok(Math.abs(lowest) < 0.02, `feet at ${lowest}`);
    });

    it("moves the joints with the body", () => {
        for (const shape of [{ macro: { height: 0 } }, { macro: { height: 1 } }, { macro: { weight: 1, muscle: 1 } }]) {
            const f = figure(shape);
            const y = (name) => f.rig.heads[f.rig.index.get(name)].y;
            const knee = (y("LeftLeg") - y("LeftFoot")) / (y("LeftUpLeg") - y("LeftFoot"));

            // The knee half way down the leg, the neck below the head, the head below the top
            assert.ok(knee > 0.4 && knee < 0.66, `knee at ${knee} of the leg`);
            assert.ok(y("Neck") < y("Head") && y("Head") < f.height);
        }

        assert.ok(figure({ macro: { height: 1 } }).rig.heads[2].y > figure({ macro: { height: 0 } }).rig.heads[2].y + 0.1, "taller bodies have higher knees");
    });

    it("detail sliders only move their part of the body", () => {
        const plain = human.shape({});
        const pointed = human.shape({ details: { earPoint: 1 } });
        const moved = [];

        for (let v = 0; v < human.vertexCount; v++) {
            if (Math.hypot(pointed.positions[v * 3] - plain.positions[v * 3], pointed.positions[v * 3 + 1] - plain.positions[v * 3 + 1], pointed.positions[v * 3 + 2] - plain.positions[v * 3 + 2]) > 1e-4) {
                moved.push(v);
            }
        }

        const headBone = human.boneIndex.get("Head");

        assert.ok(moved.length > 50);
        assert.ok(moved.every((v) => human.skinIndices[v * 4] === headBone || human.partOf[v] !== 0), "only the head moves");
    });
});

describe("joints (rig.js)", () => {
    it("knows each bone's kind of joint and side", () => {
        assert.deepEqual(jointOf("LeftUpLeg"), { kind: "UpLeg", side: 1 });
        assert.deepEqual(jointOf("RightHandIndex2"), { kind: "finger", side: -1 });
        assert.deepEqual(jointOf("Hips"), { kind: "pelvis", side: 0 });
        assert.ok(human.bones.every(({ name }) => JOINTS[jointOf(name).kind]), "every bone has a joint");
    });

    it("keeps angles within the range of motion", () => {
        const knee = jointRotation("Leg", 1, { flex: 200 });
        const straight = jointRotation("Leg", 1, { flex: -40 });

        assert.ok(Math.abs(2 * Math.acos(knee.w) - 140 * DEG) < 1e-6, "the knee bends 140 degrees at most");
        assert.ok(Math.abs(2 * Math.acos(straight.w) - 5 * DEG) < 1e-6, "and straightens 5 past straight");
    });

    it("pulls rotations from anywhere back inside the joint's range", () => {
        // A knee bent sideways and twisted: it's a hinge, so only its bend survives (within range)
        const bent = new THREE.Quaternion().setFromEuler(new THREE.Euler(60 * DEG, 30 * DEG, 50 * DEG));
        const limited = limitRotation("Leg", 1, bent.clone());
        const axis = new THREE.Vector3(limited.x, limited.y, limited.z).normalize();

        assert.ok(Math.abs(axis.x) > 0.97, `about the knee's hinge: ${axis.toArray()}`);

        // An elbow bent too far comes back to its limit; one within range is left alone
        const within = jointRotation("ForeArm", 1, { flex: 90, pronate: 30 }, new THREE.Quaternion(), false);

        assert.ok(limitRotation("ForeArm", 1, within.clone()).angleTo(within) < 1e-5);

        const beyond = jointRotation("ForeArm", 1, { flex: 175 }, new THREE.Quaternion(), false);

        assert.ok(Math.abs(limitRotation("ForeArm", 1, beyond.clone()).angleTo(new THREE.Quaternion()) - 150 * DEG) < 1e-4);
    });

    it("mirrors the right side", () => {
        const f = figure();

        f.rig.setAngles("LeftArm", { flex: 40, abduct: 30, rotate: 20 });
        f.rig.setAngles("RightArm", { flex: 40, abduct: 30, rotate: 20 });
        f.rig.apply();
        f.object.updateMatrixWorld(true);

        const hand = (side) => new THREE.Vector3().setFromMatrixPosition(f.rig.bone(`${side}Hand`).matrixWorld);
        const left = hand("Left");
        const right = hand("Right");

        assert.ok(Math.abs(left.x + right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01 && Math.abs(left.z - right.z) < 0.01, `${left.toArray()} vs ${right.toArray()}`);
    });

    it("rests with every bone unturned, and hangs the arms in the anatomical position", () => {
        const f = figure();

        f.rig.reset(true);
        f.rig.apply();
        assert.ok(f.rig.bones.every((bone) => bone.quaternion.angleTo(new THREE.Quaternion()) < 1e-5), "rest pose");

        f.rig.reset();
        f.rig.apply();
        f.object.updateMatrixWorld(true);

        const shoulder = new THREE.Vector3().setFromMatrixPosition(f.rig.bone("LeftArm").matrixWorld);
        const wrist = new THREE.Vector3().setFromMatrixPosition(f.rig.bone("LeftHand").matrixWorld);
        const arm = wrist.sub(shoulder).normalize();

        assert.ok(arm.y < -0.99, `the arm hangs straight down: ${arm.toArray()}`);
    });

    it("reaches with two-bone inverse kinematics", () => {
        const f = figure();

        f.rig.reset();
        f.rig.apply();
        f.object.updateMatrixWorld(true);

        const ankle = new THREE.Vector3().setFromMatrixPosition(f.rig.bone("LeftFoot").matrixWorld);
        const target = ankle.clone().add(new THREE.Vector3(0, 0.15, 0.2));

        f.rig.reach("LeftUpLeg", "LeftLeg", "LeftFoot", target);
        f.object.updateMatrixWorld(true);

        const reached = new THREE.Vector3().setFromMatrixPosition(f.rig.bone("LeftFoot").matrixWorld);

        assert.ok(reached.distanceTo(target) < 0.002, `${reached.distanceTo(target)}`);
    });
});

describe("gait (gait.js)", () => {
    it("follows normal walking's joint angles", () => {
        // Knee nearly straight at heel strike, a small bend taking the weight, a big one in swing
        assert.ok(curveAt(CURVES.kneeFlexion, 0) < 10);
        assert.ok(curveAt(CURVES.kneeFlexion, 0.15) > 15);
        assert.ok(curveAt(CURVES.kneeFlexion, 0.72) > 60);
        // The ankle pushes off (plantarflexes) at the end of stance
        assert.ok(curveAt(CURVES.ankleDorsiflexion, 0.62) < -10);
        // Curves are periodic
        assert.ok(Math.abs(curveAt(CURVES.hipFlexion, 0.3) - curveAt(CURVES.hipFlexion, 1.3)) < 1e-9);
        assert.equal(phaseName(0.05), "Loading response");
        assert.equal(phaseName(STANCE + 0.1), "Swing");
    });

    it("steps faster and further the faster it goes, as people do", () => {
        assert.ok(Math.abs(cadence(1.4) - 114) < 1.5, `${cadence(1.4)} steps a minute at 1.4 m/s`);
        assert.ok(Math.abs(strideLength(1.4) - 1.48) < 0.02);
        assert.ok(strideLength(1.4, 1.1) > strideLength(1.4, 0.9), "longer legs, longer strides");
        assert.equal(amplitude(NATURAL_SPEED), 1);
        assert.ok(Math.abs(walkToRunSpeed(0.9) - 2.1) < 0.01);
    });

    it("sprints with the knee driven high, the heel kicked up and a push off the toes", () => {
        const range = (curve) => Array.from({ length: 200 }, (_, k) => curveAt(curve, k / 200));

        // The thigh reaches well forward in swing and well back at push-off
        assert.ok(Math.max(...range(RUN_CURVES.thigh)) > 55 && Math.min(...range(RUN_CURVES.thigh)) < -20);
        // The heel comes up towards the buttock
        assert.ok(Math.max(...range(RUN_CURVES.kneeFlexion)) > 110);
        assert.ok(curveAt(RUN_CURVES.ankleDorsiflexion, RUN_STANCE) < -20, "pushing off the toes");
        // The elbows stay bent, near a right angle
        assert.ok(range(RUN_CURVES.elbowFlexion).every((angle) => angle > 60 && angle < 115));

        // Keyed curves go through their keys and loop smoothly round the end of the stride
        for (const curve of Object.values(RUN_CURVES)) {
            for (const [phase, value] of curve.keys) {
                assert.ok(Math.abs(curveAt(curve, phase) - value) < 1e-9, curve.label);
            }

            assert.ok(Math.abs(curveAt(curve, 1 - 1e-6) - curveAt(curve, 0)) < 1e-3, curve.label);
            assert.ok(Math.abs(curveAt(curve, 0.3) - curveAt(curve, -0.7)) < 1e-9, curve.label);
        }
    });

    it("runs faster with longer and quicker steps, as people do", () => {
        // About 2.7 steps a second jogging, 4 sprinting, with longer legs taking longer steps
        assert.ok(Math.abs(runCadence(3) - 2.7) < 0.01);
        assert.ok(Math.abs(runCadence(8) - 3.95) < 0.01);
        assert.ok(runCadence(20) <= 4.6);
        assert.ok(runStrideLength(8) > 3.8 && runStrideLength(8) < 4.3, `${runStrideLength(8)} m strides at 8 m/s`);
        assert.ok(runStrideLength(8, 1.1) > runStrideLength(8, 0.9));
        assert.ok(runStrideLength(3) > strideLength(1.4));
    });
});

describe("walking (locomotion.js)", () => {
    it("walks forward at its speed without its planted foot sliding or going through the ground", () => {
        const f = figure();
        const walker = new Walker(f);
        const dt = 1 / 60;

        for (let t = 0; t < 2; t += dt) {
            walker.update(dt, { speed: 1.3 });
        }

        const start = f.object.position.z;
        let slide = 0;
        let lowest = Infinity;
        let planted = null;

        for (let t = 0; t < 3; t += dt) {
            walker.update(dt, { speed: 1.3 });

            // During mid-stance the left foot's pivot must stay where it is
            const phase = walker.phase;

            if (phase > 0.12 && phase < 0.28) {
                const point = walker.footPoint(0, "heel");

                planted ??= point.clone();
                slide = Math.max(slide, Math.hypot(point.x - planted.x, point.z - planted.z));
            } else {
                planted = null;
            }

            lowest = Math.min(lowest, walker.footHeight(0), walker.footHeight(1));
        }

        assert.ok(Math.abs((f.object.position.z - start) / 3 - 1.3) < 0.05, "moves at its speed");
        assert.ok(slide < 0.01, `the planted foot slides ${slide} m`);
        assert.ok(lowest > -0.003, `feet stay out of the ground (${lowest})`);
    });

    it("rises and falls smoothly, without dropping as a foot lifts off", () => {
        for (const style of [WALK_STYLES.natural, WALK_STYLES.orc]) {
            const f = figure();
            const walker = new Walker(f, style);
            const hips = f.rig.bone("Hips");
            const dt = 1 / 120;
            const heights = [];

            for (let t = 0; t < 5; t += dt) {
                walker.update(dt, { speed: 1.3 });

                if (t > 2) {
                    heights.push(hips.getWorldPosition(new THREE.Vector3()).y);
                }
            }

            const steepest = Math.max(...heights.slice(1).map((h, k) => Math.abs(h - heights[k])));
            const range = Math.max(...heights) - Math.min(...heights);

            // People's hips rise and fall about 4 cm, at up to about a quarter of a metre a second
            assert.ok(steepest < 0.003, `the hips move ${(steepest * 1000).toFixed(1)} mm in a 120th of a second`);
            assert.ok(range > 0.015 && range < 0.065, `the hips rise and fall ${(range * 100).toFixed(1)} cm`);
        }
    });

    it("hears a footstep as each foot lands, one foot then the other, as often as it steps", () => {
        const walker = new Walker(figure());
        const steps = [];
        let time = 0;

        walker.onStep = (foot, speed) => steps.push({ foot, speed, time });

        for (; time < 1; time += 1 / 60) {
            walker.update(1 / 60, { speed: 0 });
        }

        assert.equal(steps.length, 0, "standing still, no steps");

        for (; time < 5; time += 1 / 60) {
            walker.update(1 / 60, { speed: 1.4 });
        }

        const walking = steps.filter((step) => step.time > 3);

        // About 1.9 steps a second at 1.4 m/s (114 a minute), left and right in turn
        assert.ok(Math.abs(walking.length / 2 - cadence(1.4, walker.legLength) / 60) < 0.4, `${walking.length / 2} steps a second`);
        assert.ok(walking.every((step, k) => k === 0 || step.foot !== walking[k - 1].foot));
        assert.ok(walking.every(({ speed }) => Math.abs(speed - 1.4) < 0.05));
    });

    it("sprints: in the air between steps, landing on the ball of the foot without sliding, lowest mid-step", () => {
        for (const [shape, style] of [[{}, WALK_STYLES.natural], [PRESETS.orc.shape, WALK_STYLES.orc]]) {
            const f = figure(shape);
            const walker = new Walker(f, style);
            const hips = f.rig.bone("Hips");
            const dt = 1 / 120;

            for (let t = 0; t < 4; t += dt) {
                walker.update(dt, { speed: 8 });
            }

            const start = f.object.position.z;
            const heights = [];
            const middles = { stance: [], flight: [] };
            let slide = 0;
            let lowest = Infinity;
            let flying = 0;
            let steps = 0;
            let planted = null;
            let last = walker.phase;

            for (let t = 0; t < 2; t += dt) {
                walker.update(dt, { speed: 8 });

                const phase = walker.phase;
                const height = hips.getWorldPosition(new THREE.Vector3()).y;

                steps += Math.floor(phase * 2) !== Math.floor(last * 2) ? 1 : 0;
                last = phase;

                // While the left foot is on the ground, its ball stays where it landed
                if (phase > 0.03 && phase < RUN_STANCE - 0.03) {
                    const point = walker.footPoint(0, "ball");

                    planted ??= point.clone();
                    slide = Math.max(slide, Math.hypot(point.x - planted.x, point.z - planted.z));
                } else {
                    planted = null;
                }

                lowest = Math.min(lowest, walker.footHeight(0), walker.footHeight(1));
                flying += walker.footHeight(0) > 0.01 && walker.footHeight(1) > 0.01 ? 1 : 0;
                heights.push(height);

                // The middle of a foot's time on the ground, and of the flight after it
                const half = phase % 0.5;

                if (half > 0.08 && half < 0.14) {
                    middles.stance.push(height);
                } else if (half > 0.33 && half < 0.39) {
                    middles.flight.push(height);
                }
            }

            const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
            const change = heights.slice(1).map((height, k) => height - heights[k]);
            const jerk = Math.max(...change.slice(1).map((d, k) => Math.abs(d - change[k])));
            const range = Math.max(...heights) - Math.min(...heights);

            assert.ok(walker.run > 0.99, "running, not walking");
            assert.ok(Math.abs((f.object.position.z - start) / 2 - 8) < 0.1, "moves at its speed");
            assert.ok(Math.abs(steps / 2 - runCadence(8, walker.legLength)) < 0.15, `${steps / 2} steps a second`);
            assert.ok(slide < 0.01, `the planted foot slides ${slide} m`);
            assert.ok(lowest > -0.003, `feet stay out of the ground (${lowest})`);
            assert.ok(flying / heights.length > 0.4 && flying / heights.length < 0.65, `both feet off the ground ${flying / heights.length} of the time`);
            assert.ok(range > 0.04 && range < 0.1, `the hips rise and fall ${(range * 100).toFixed(1)} cm`);
            assert.ok(mean(middles.stance) < mean(middles.flight) - 0.02, "lowest on the ground, highest in the air");
            assert.ok(jerk < 0.0025, `the hips change speed ${(jerk * 1000).toFixed(2)} mm a frame`);
        }
    });

    it("keeps its knees bending forward, never flicking sideways or backwards, run and walked round corners, starting and stopping", () => {
        for (const [speed, fps] of [[7.9, 60], [7.9, 30], [1.7, 60]]) {
            const f = figure();
            const walker = new Walker(f);
            const object = f.object;
            const dt = 1 / fps;
            const bone = (name) => object.worldToLocal(f.rig.bone(name).getWorldPosition(new THREE.Vector3()));
            let facing = 0;
            let pace = 0;
            let backwards = Infinity;
            let sideways = 0;
            let flick = 0;
            const last = [null, null];

            // As the game moves a character: speeding up, a sharp corner every second (the way it
            // goes changes at once, and it turns to face it at 9 radians a second), then stopping
            for (let t = 0; t < 5; t += dt) {
                const heading = t > 4 ? 0 : [0, Math.PI / 2, 0, -Math.PI / 2][Math.floor(t)];
                const target = t > 4 ? 0 : speed;
                const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));

                pace = target > pace ? Math.min(target, pace + 6 * dt) : Math.max(target, pace - 7 * dt);
                facing += Math.max(-9 * dt, Math.min(9 * dt, turn));
                object.position.x += Math.sin(heading) * pace * dt;
                object.position.z += Math.cos(heading) * pace * dt;
                object.rotation.y = facing;
                object.updateMatrixWorld(true);
                walker.update(dt, { moved: pace * dt });

                ["Left", "Right"].forEach((side, i) => {
                    // The knee, off the line from the hip to the ankle: forwards (z) and sideways (x)
                    const hip = bone(`${side}UpLeg`);
                    const ankle = bone(`${side}Foot`);
                    const along = ankle.clone().sub(hip).normalize();
                    const off = bone(`${side}Leg`).sub(hip);

                    off.addScaledVector(along, -off.dot(along));
                    backwards = Math.min(backwards, off.z);
                    sideways = Math.max(sideways, Math.abs(off.x));

                    if (last[i] !== null) {
                        flick = Math.max(flick, Math.abs(off.x - last[i]) / (dt * 60));
                    }

                    last[i] = off.x;
                });
            }

            const at = `at ${speed} m/s, ${fps} frames a second`;

            assert.ok(backwards > -0.005, `a knee bends ${(-backwards * 100).toFixed(1)} cm backwards ${at}`);
            assert.ok(sideways < 0.11, `a knee is ${(sideways * 100).toFixed(1)} cm off to the side ${at}`);
            assert.ok(flick < 0.03, `a knee flicks ${(flick * 100).toFixed(1)} cm sideways in a 60th of a second ${at}`);
        }
    });

    it("breaks into a run and back into a walk smoothly as it's moved faster and slower", () => {
        const f = figure();
        const walker = new Walker(f);
        const hips = f.rig.bone("Hips");
        const dt = 1 / 60;
        const heights = [];
        let speed = 1.7;
        let lowest = Infinity;
        let fastest = 0;

        // As the game moves a character: walking, speeding up to a sprint, then slowing to a walk
        for (let t = 0; t < 7; t += dt) {
            const target = t < 1.5 ? 1.7 : t < 4.5 ? 8 : 1.7;

            speed = target > speed ? Math.min(target, speed + 6 * dt) : Math.max(target, speed - 7 * dt);
            f.object.translateZ(speed * dt);
            walker.update(dt, { moved: speed * dt });
            fastest = Math.max(fastest, walker.run);
            lowest = Math.min(lowest, walker.footHeight(0), walker.footHeight(1));

            if (t > 0.5) {
                heights.push(hips.getWorldPosition(new THREE.Vector3()).y);
            }
        }

        const change = heights.slice(1).map((height, k) => height - heights[k]);
        const jerk = Math.max(...change.slice(1).map((d, k) => Math.abs(d - change[k])));

        assert.ok(fastest > 0.99 && walker.run === 0, "ran, then walked again");
        assert.ok(lowest > -0.003, `feet stay out of the ground (${lowest})`);
        // No jolts changing gait: the hips change speed no more than they do running
        assert.ok(jerk < 0.008, `the hips change speed ${(jerk * 1000).toFixed(2)} mm a frame`);
    });
});

describe("hair (hair.js)", () => {
    // A body to grow hair on, with the head's triangles as Character.sourceTriangles gives them
    function head(shape) {
        const body = figure(shape);

        body.sourceTriangles = (part, bones) => {
            const indices = human.renderIndices(part);
            const triangles = [];

            for (let t = 0; t < indices.length; t += 3) {
                const a = human.renderSource[indices[t]];

                if (bones.has(human.skinIndices[a * 4])) {
                    triangles.push(a, human.renderSource[indices[t + 1]], human.renderSource[indices[t + 2]]);
                }
            }

            return triangles;
        };

        return { body, face: faceFrame(human, body.positions) };
    }

    // Every point of a style's hair, in face coordinates (metres from between the eyes: x to the
    // left, y up, z forward)
    function grown({ body, face }, style, detail = 0.2) {
        const position = buildHair(body, style, "none", { detail })?.attributes.position;

        return Array.from({ length: position?.count ?? 0 }, (_, i) => face.toFace(position.getX(i), position.getY(i), position.getZ(i)));
    }

    const woman = head(FOLK.courtesan2.shape);
    const man = head(PRESETS.hero.shape);
    const styles = Object.keys(HAIRSTYLES).filter((style) => HAIRSTYLES[style].strands);

    it("covers the back of the head: styles parted in the middle part only over the top", () => {
        // Of the hair behind the head, from the nape to the crown, as much down its middle (a
        // strip 3 cm wide) as anywhere else: not combed away from it, leaving the scalp bare
        // (but for hair drawn to a tie, a knot or a strip; twin tails part down the back, to
        // either tie)
        for (const style of styles.filter((one) => !HAIRSTYLES[one].tail && !HAIRSTYLES[one].tails && !HAIRSTYLES[one].knot && !HAIRSTYLES[one].strip)) {
            const behind = grown(woman, style).filter(([, y, z]) => z < -0.14 && y > -0.02 && y < 0.07);
            const middle = behind.filter(([x]) => Math.abs(x) < 0.015);

            assert.ok(behind.length > 100 && middle.length / behind.length > 0.13, `${style}: ${middle.length} of ${behind.length} points behind the head down its middle`);
        }
    });

    it("lies close to the head and hangs straight: nothing sticks out, nothing falls over the face, nothing grows inside the mouth", () => {
        for (const who of [woman, man]) {
            for (const style of styles) {
                for (const detail of [0.2, 0.45]) {
                    const points = grown(who, style, detail);
                    const widest = Math.max(...points.filter(([, y]) => y > -0.1).map(([x]) => Math.abs(x)));

                    // (The head's about 9 cm either side of the middle, with the ears; twin
                    // tails stand a little out from their ties high on either side of it, as
                    // they're drawn)
                    const most = HAIRSTYLES[style].tails ? 0.185 : 0.125;

                    assert.ok(widest < most, `${style} (${detail}) reaches ${widest.toFixed(3)} out from the middle of the face`);
                    assert.ok(!points.some(([x, y, z]) => Math.abs(x) < 0.045 && y < 0.02 && y > -0.1 && z > -0.02), `${style} (${detail}) falls over the face`);
                    assert.ok(!points.some(([x, y, z]) => Math.abs(x) < 0.02 && y < -0.13 && y > -0.25 && z > -0.07), `${style} (${detail}) hangs down the throat`);
                }
            }
        }
    });

    it("cuts long hair and a bob to a clean hem", () => {
        for (const style of ["bob", "long"]) {
            const [back, front] = HAIRSTYLES[style].hem;
            const lowest = Math.min(...grown(woman, style).map(([, y]) => y));

            assert.ok(lowest > back - 0.03 && lowest < front, `${style} ends ${lowest.toFixed(3)} (its hem ${back} to ${front})`);
        }
    });

    it("starts parted hair right at the parting, either side of it", () => {
        for (const style of ["bob", "long"]) {
            const parting = grown(woman, style).filter(([x, y, z]) => Math.abs(x) < 0.006 && y > 0.07 && z > -0.1);

            assert.ok(parting.filter(([x]) => x > 0).length > 8 && parting.filter(([x]) => x < 0).length > 8, `${style}: ${parting.length} points at the parting`);
        }
    });

    it("grows a ponytail full and round, not flat", () => {
        const tail = grown(woman, "ponytail").filter(([, y, z]) => z < -0.2 && y < -0.08);
        const span = (k) => Math.max(...tail.map((p) => p[k])) - Math.min(...tail.map((p) => p[k]));

        assert.ok(tail.length > 200);
        assert.ok(span(0) > 0.04 && span(2) > 0.04, `the tail is ${span(0).toFixed(3)} wide and ${span(2).toFixed(3)} deep`);
    });

    it("grows twin tails, one either side as full as the other, and bangs over the brow", () => {
        const points = grown(woman, "twintails");
        const low = points.filter(([, y, z]) => z < -0.08 && y < -0.08);
        const [left, right] = [low.filter(([x]) => x > 0.03).length, low.filter(([x]) => x < -0.03).length];
        const bangs = points.filter(([x, y, z]) => Math.abs(x) < 0.04 && y > 0.02 && y < 0.07 && z > 0);

        assert.ok(left > 150 && right > 150 && Math.min(left, right) / Math.max(left, right) > 0.8, `${left} points in the left tail, ${right} in the right`);
        assert.ok(low.filter(([x]) => Math.abs(x) < 0.015).length < 0.1 * low.length, "the tails hang either side, not down the middle");
        assert.ok(bangs.length > 20, `${bangs.length} points in the bangs`);
    });
});

describe("clothing and armour (garments.js)", () => {
    const f = figure({ macro: { gender: 1 } });
    const measures = measureBody(f);

    it("measures how far down the limbs every vertex is", () => {
        const handVertex = measures.vertices.findIndex((v) => v.region === "hand");
        const thighVertex = measures.vertices.findIndex((v) => v.region === "leg" && v.leg < 0.3);

        assert.ok(measures.vertices[handVertex].arm > 0.95);
        assert.ok(measures.vertices[thighVertex].leg < 0.5);
        assert.ok(measures.landmarks.neck > measures.landmarks.chest && measures.landmarks.chest > measures.landmarks.waist && measures.landmarks.waist > measures.landmarks.hips);
    });

    it("fits every garment round the body, covering the skin under it", () => {
        for (const id of Object.keys(GARMENTS)) {
            const built = buildGarment(f, id, measures);

            assert.ok(built, id);

            const { geometry, covers, sources } = built;
            const position = geometry.attributes.position;
            const weights = geometry.attributes.skinWeight.array;

            // (Lingerie hides only what's under its opaque parts: none of the skin, under sheer stockings)
            assert.ok(covers.size > 10 || GARMENTS[id].design, `${id} covers some of the body`);
            assert.equal(sources.length, geometry.index.count / 3, `${id}: a source for every triangle`);
            assert.ok(position.array.every(Number.isFinite), `${id} has no broken vertices`);

            for (let i = 0; i < weights.length; i += 4) {
                assert.equal(weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3], 255, `${id} vertex ${i / 4}'s weights`);
            }
        }
    });

    it("spreads each picture a few texels past the body's pieces, so seams don't show, by a list the texel map makes once", () => {
        const map = texelMap(human, 128);
        const { size, covered, spread } = map;
        const filled = covered.slice();
        const ring = new Uint8Array(size * size);
        let last = 1;

        assert.ok(spread.length > 0 && spread.length % 2 === 0);

        // Each texel spread to is outside the pieces, filled once, from a neighbour beside it
        // (left, right, above or below) that's painted or was spread to in an earlier ring; three
        // rings out at most
        for (let p = 0; p < spread.length; p += 2) {
            const [i, from] = [spread[p], spread[p + 1]];

            assert.equal(covered[i], 0);
            assert.equal(filled[i], 0, "each texel filled once");
            assert.ok([1, size].includes(Math.abs(i - from)), "from a neighbour");
            assert.equal(filled[from], 1);
            ring[i] = covered[from] ? 1 : ring[from] + 1;
            assert.ok(ring[i] >= last && ring[i] <= 3, "the rings in turn");
            last = ring[i];
            filled[i] = 1;
        }

        // A garment's picture, spread: each texel spread to has its neighbour's colour and height
        const { data, bump } = paintGarment(map, GARMENTS["livery.human"]);

        for (let p = 0; p < spread.length; p += 2) {
            const [i, from] = [spread[p], spread[p + 1]];

            assert.deepEqual([...data.subarray(i * 4, i * 4 + 4), bump[i]], [...data.subarray(from * 4, from * 4 + 4), bump[from]]);
        }
    });

    it("paints lingerie from its design: clear where there's none, lace to see through, opaque where it's lined or a band, white to be tinted", () => {
        const map = texelMap(human, 512);

        for (const design of Object.keys(DESIGNS)) {
            const { data } = paintGarment(map, { design });
            let clear = 0;
            let sheer = 0;
            let opaque = 0;

            for (let i = 0; i < map.size * map.size; i++) {
                const alpha = data[i * 4 + 3];

                if (!map.covered[i]) {
                    continue;
                }

                clear += alpha === 0 ? 1 : 0;
                sheer += alpha > 20 && alpha < 235 ? 1 : 0;
                opaque += alpha === 255 ? 1 : 0;
                assert.ok(data[i * 4] === data[i * 4 + 1] && data[i * 4 + 1] === data[i * 4 + 2], `${design} is painted in greys`);
            }

            assert.ok(clear > opaque && opaque > 100, `${design}: ${clear} texels clear, ${opaque} opaque`);
            assert.ok(sheer > 100, `${design}: ${sheer} texels see-through`);
        }
    });

    it("lines lingerie over the nipples and the groin, hiding the skin there, on any body in any pose", () => {
        // Where the skin's nipples and groin are (as its masks paint them: characters/masks), on
        // the base body the designs are drawn on
        const base = human.basePositions;
        const near = (v, [x, y, z], r) => Math.hypot(Math.abs(base[v * 3]) - x, base[v * 3 + 1] - y, base[v * 3 + 2] - z) < r;
        const nipples = [];
        const groin = [];

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0 && near(v, [0.08, 0.381, 0.157], 0.016)) {
                nipples.push(v);
            }

            if (human.partOf[v] === 0 && Math.abs(base[v * 3]) < 0.022 && base[v * 3 + 1] > -0.045 && base[v * 3 + 1] < -0.002 && base[v * 3 + 2] > 0.035) {
                groin.push(v);
            }
        }

        assert.ok(nipples.length > 10 && groin.length > 10);

        const brief = designSolid(human, "briefs");
        const bra = designSolid(human, "bra");

        assert.ok(nipples.every((v) => bra[v]), "the bra's cups are lined over the nipples");
        assert.ok(groin.every((v) => brief[v]), "the briefs are lined over the groin");

        // Built on a courtesan (the fullest bust), every triangle of skin there is hidden: it's
        // not drawn, so it can't show through whatever the pose (the lining bends with it)
        const body = figure(FOLK.courtesan4.shape);
        const shaped = measureBody(body);
        const triangles = human.renderIndices("body");

        for (const [id, spots] of [["laceBraIvory", nipples], ["laceBriefsIvory", groin]]) {
            const { covers } = buildGarment(body, id, shaped);
            const spot = new Set(spots);
            let touching = 0;

            for (let t = 0; t < triangles.length; t += 3) {
                if ([0, 1, 2].some((k) => spot.has(human.renderSource[triangles[t + k]]))) {
                    touching++;
                    assert.ok(covers.has(t / 3), `${id} hides body triangle ${t / 3}`);
                }
            }

            assert.ok(touching > 10);
        }

        // And every courtesan wears both
        for (const id of ["courtesan", "courtesan2", "courtesan3", "courtesan4"]) {
            const designs = FOLK[id].equipment.map((piece) => GARMENTS[piece]?.design);

            assert.ok(designs.includes("bra") && designs.includes("briefs"), `${id} is covered`);
        }
    });

    it("cuts hems exactly, not along the mesh's edges", () => {
        // A short sleeve ends at the same place all round the arm
        const { geometry } = buildGarment(f, "tunic", measures);
        const position = geometry.attributes.position;
        const shoulder = f.rig.heads[f.rig.index.get("LeftArm")];
        const elbow = f.rig.heads[f.rig.index.get("LeftForeArm")];
        const along = elbow.clone().sub(shoulder);
        const lowest = [];

        for (let i = 0; i < position.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(position, i);

            if (p.x > shoulder.x) {
                lowest.push(p.sub(shoulder).dot(along) / along.lengthSq());
            }
        }

        const end = Math.max(...lowest);

        assert.ok(end > 0.8 && end < 1.02, `the sleeve ends near the elbow (${end})`);
    });

    it("draws a soldier's garments all at once: one picture, of the outermost garment wherever it's seen", () => {
        // (Each garment a plain colour of its own, to tell which is where: under ones first)
        const outfit = ["livery.human", "trousers.human", "mail.human", "gauntlets.human", "sabatons.human", "vambraces.human", "greaves.human", "surcoat.human", "belt.human"];
        const map = texelMap(human, 256);
        const count = map.size * map.size;
        const colourOf = (k) => [20 + k * 25, 230 - k * 20, 90];
        const layers = outfit.map((id, k) => ({
            data: Uint8ClampedArray.from({ length: count * 4 }, (_, i) => (i % 4 === 3 ? 255 : colourOf(k)[i % 4])),
            bump: new Uint8ClampedArray(count).fill(128 + k),
            tint: null,
            bumpScale: COMPOSITE_BUMP,
            roughness: GARMENTS[id].roughness,
            metalness: GARMENTS[id].metalness ?? 0,
            inside: insideOf(human, GARMENTS[id], measures, { toes: true }),
        }));
        const { data, surface } = compositeGarments(map, layers);
        const layerAt = (u, v) => {
            const i = Math.min(map.size - 1, Math.floor((1 - v) * map.size)) * map.size + Math.min(map.size - 1, Math.floor(u * map.size));

            return map.covered[i] ? (data[i * 4] - 20) / 25 : null;
        };
        const built = outfit.map((id) => buildGarment(f, id, measures));

        // Where only one garment is (no other has any of the body there), its own picture; where
        // an outer one's edge crosses an inner one, the outer one's, on its side of the edge
        built.forEach(({ geometry, sources }, k) => {
            const others = new Set(built.filter((_, j) => j !== k).flatMap((other) => [...other.sources]));
            const outer = new Set(built.filter((_, j) => j > k).flatMap((other) => [...other.sources]));
            const uv = geometry.attributes.uv;
            const index = geometry.index.array;
            let alone = 0;
            let alike = 0;
            let edged = 0;
            let over = 0;

            for (let t = 0; t < sources.length; t++) {
                const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
                const area = (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) - (uv.getX(c) - uv.getX(a)) * (uv.getY(b) - uv.getY(a));

                // (Not a hem, folded back along the edge: it has no area on the texture)
                if (Math.abs(area) < 1e-10) {
                    continue;
                }

                const layer = layerAt((uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3);

                if (layer === null) {
                    continue;
                }

                if (!others.has(sources[t])) {
                    alone++;
                    alike += layer === k ? 1 : 0;
                } else if (!outer.has(sources[t]) && built.some((other, j) => j < k && other.sources.includes(sources[t]))) {
                    edged++;
                    over += layer === k ? 1 : 0;
                }
            }

            assert.ok(alone === 0 || alike / alone > 0.97, `${outfit[k]} shows its own picture where it's alone: ${alike} of ${alone}`);
            assert.ok(edged === 0 || over / edged > 0.85, `${outfit[k]} shows its own picture over what's under it: ${over} of ${edged}`);
        });

        // The surcoat on the chest; mail at the shoulders under it; the livery's sleeves below the
        // mail's; a boot's toes; each one's roughness and metalness, and heights, with its picture
        const at = (region, test) => {
            const v = measures.vertices.findIndex((vertex, n) => human.partOf[n] === 0 && vertex.region === region && test(vertex));
            const r = human.renderSource.indexOf(v);

            return layerAt(human.uvs[r * 2], human.uvs[r * 2 + 1]);
        };

        assert.equal(outfit[at("torso", (v) => v.z > 0.1 && Math.abs(v.x) < 0.03 && Math.abs(v.y - measures.landmarks.chest) < 0.03)], "surcoat.human");
        assert.equal(outfit[at("arm", (v) => v.arm > 0.14 && v.arm < 0.3)], "mail.human");
        assert.equal(outfit[at("arm", (v) => v.arm > 0.45 && v.arm < 0.55)], "livery.human");
        assert.equal(outfit[at("foot", (v) => v.foot > 1.05)], "sabatons.human");

        for (let i = 0; i < count; i++) {
            if (map.covered[i]) {
                const k = (data[i * 4] - 20) / 25;

                assert.equal(surface[i * 4], 128 + k);
                assert.equal(surface[i * 4 + 2], Math.round((GARMENTS[outfit[k]].metalness ?? 0) * 255));
            }
        }

        // Tinted (in linear light), and spread past the edges of what's painted
        const tinted = compositeGarments(map, [{ ...layers[0], data: new Uint8ClampedArray(count * 4).fill(188), tint: [0.5, 1, 1] }]);
        const covered = map.covered.indexOf(1);
        const edge = map.covered.findIndex((value, i) => !value && map.covered[i + 1]);

        assert.deepEqual([...tinted.data.slice(covered * 4, covered * 4 + 4)], [137, 188, 188, 255]);
        assert.equal(tinted.data[edge * 4 + 3], 255);
    });

    it("makes footwear the size of the foot, with one toe box", () => {
        const ankle = f.rig.heads[f.rig.index.get("LeftFoot")].y;
        const size = (points) => {
            const xs = points.map(([x]) => x);
            const zs = points.map(([, , z]) => z);

            return { width: Math.max(...xs) - Math.min(...xs), length: Math.max(...zs) - Math.min(...zs) };
        };
        const bare = [];

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0 && measures.vertices[v].region === "foot" && f.positions[v * 3] > 0.02 && f.positions[v * 3 + 1] < ankle - 0.02) {
                bare.push([f.positions[v * 3], f.positions[v * 3 + 1], f.positions[v * 3 + 2]]);
            }
        }

        const foot = size(bare);

        for (const id of ["boots", "sabatons"]) {
            const { geometry } = buildGarment(f, id, measures);
            const position = geometry.attributes.position;
            const points = [];

            for (let i = 0; i < position.count; i++) {
                if (position.getX(i) > 0.02 && position.getY(i) < ankle - 0.02) {
                    points.push([position.getX(i), position.getY(i), position.getZ(i)]);
                }
            }

            const boot = size(points);

            // Covering the foot, but no more than a few centimetres bigger (not clown shoes)
            assert.ok(boot.length > foot.length && boot.length < foot.length + 0.03, `${id} is ${boot.length} long for a ${foot.length} foot`);
            assert.ok(boot.width > foot.width && boot.width < foot.width + 0.025, `${id} is ${boot.width} wide for a ${foot.width} foot`);
        }
    });

    it("joins smooth toe boxes onto footwear, closed, unfolded and on its texture", () => {
        const { covered, size } = texelMap(human, 512);

        for (const id of ["boots", "sabatons"]) {
            const { geometry, sources } = buildGarment(f, id, measures);
            const position = geometry.attributes.position;
            const normal = geometry.attributes.normal;
            const uv = geometry.attributes.uv;
            const index = geometry.index.array;
            const place = (i) => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
            const edges = new Map();
            const capPoints = new Set();
            let folded = 0;
            let offTexture = 0;
            let capTriangles = 0;

            for (let t = 0; t < sources.length; t++) {
                const corners = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
                const [a, b, c] = corners.map((i) => new THREE.Vector3().fromBufferAttribute(position, i));
                const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
                const smooth = corners.reduce((sum, i) => sum.add(new THREE.Vector3().fromBufferAttribute(normal, i)), new THREE.Vector3());
                const nearToes = sources[t] === -1 || Math.max(a.y, b.y, c.y) < 0.08;

                corners.forEach((i, k) => {
                    const key = [place(i), place(corners[(k + 1) % 3])].sort().join("|");

                    edges.set(key, (edges.get(key) ?? 0) + 1);
                });

                if (nearToes && face.lengthSq() > 1e-14 && face.dot(smooth) < 0) {
                    folded++;
                }

                if (sources[t] === -1) {
                    capTriangles++;
                    corners.forEach((i) => capPoints.add(place(i)));

                    const u = corners.reduce((sum, i) => sum + uv.getX(i), 0) / 3;
                    const v = corners.reduce((sum, i) => sum + uv.getY(i), 0) / 3;

                    offTexture += covered[Math.floor((1 - v) * size) * size + Math.floor(u * size)] ? 0 : 1;
                }
            }

            const open = [...edges].filter(([key, uses]) => uses === 1 && key.split("|").every((point) => capPoints.has(point)));

            assert.ok(capTriangles > 1000, `${id} has toe boxes`);
            assert.equal(folded, 0, `${id} has no triangles folded over near the toes`);
            assert.equal(open.length, 0, `${id}'s toe boxes are closed and joined on`);
            assert.ok(offTexture / capTriangles < 0.01, `${id}'s toe boxes stay on the painted texture (${offTexture} of ${capTriangles} off it)`);
        }
    });

    it("has a slot for every piece of equipment", () => {
        const slots = new Set(SLOTS.map(({ id }) => id));

        for (const [id, entry] of Object.entries(EQUIPMENT)) {
            assert.ok(slots.has(entry.slot), `${id}'s slot ${entry.slot}`);
        }

        for (const preset of [...Object.values(PRESETS), ...Object.values(FOLK)]) {
            for (const id of preset.equipment) {
                assert.ok(EQUIPMENT[id], id);
            }
        }

        assert.ok(Object.values(ITEMS).every(({ socket, parts }) => socket || parts.every((part) => part.socket && part.model)));
    });
});

describe("weapons put away, and spiked boots (equipment.js)", () => {
    const f = figure(PRESETS.hero.shape);
    const head = (name) => f.rig.heads[f.rig.index.get(name)];
    const where = (socket, spec = {}) => {
        const place = placed(socketOn(f, socket), spec);

        return place.position.clone().add(head(place.bone));
    };

    it("puts every weapon away somewhere on the body, or has it worn", () => {
        for (const id of [...STARTING_WEAPONS, "cleaver"]) {
            for (const item of WEAPONS[id].equipment.map((each) => ITEMS[each]).filter((each) => each?.hold)) {
                assert.ok(item.sheath, `${id}: ${item.label}`);

                if (!item.sheath.worn) {
                    // (Close against the body: within a hand's breadth of its middle, front to back)
                    const grip = where(item.sheath.socket, item.sheath);

                    assert.ok(Math.abs(grip.x) < 0.25 && grip.z > -0.25 && grip.z < 0.2, `${id}: at ${grip.toArray().map((v) => v.toFixed(2))}`);
                }
            }
        }
    });

    it("hangs things at the hips from the belt, on the outside of each hip", () => {
        const belt = head("Spine").y - 0.048 * (f.height / 1.7);

        for (const [socket, side] of [["leftHip", 1], ["rightHip", -1]]) {
            const hip = where(socket);

            assert.ok(Math.abs(hip.y - belt) < 0.01, socket);
            assert.ok(hip.x * side > 0.1 && hip.x * side < 0.25, `${socket}: ${hip.x.toFixed(2)}`);
        }
    });

    it("puts spiked boots' iron over the toes, round the heels and down the shins", () => {
        for (const side of ["Left", "Right"]) {
            const Side = side.toLowerCase();
            const [ankle, ball, knee] = [head(`${side}Foot`), head(`${side}ToeBase`), head(`${side}Leg`)];
            const toe = where(`${Side}Toe`);
            const heel = where(`${Side}Heel`);
            const shin = where(`${Side}Shin`);

            assert.ok(toe.z > ball.z && toe.y < 0.06, `${side} toe`);
            assert.ok(heel.z < ankle.z - 0.04 && heel.y < ankle.y, `${side} heel`);
            assert.ok(shin.y > ankle.y && shin.y < knee.y && shin.z > ankle.z, `${side} shin`);
        }

        assert.equal(ITEMS.spikedBoots.parts.length, 6);
        assert.equal(GARMENTS[ITEMS.spikedBoots.garment].slot, "feet");
    });
});

describe("skirts, gowns and aprons (drapes.js)", () => {
    const f = figure(FOLK.wench.shape);
    const measures = measureBody(f);
    const { landmarks: l } = measures;

    // Each vertex: where it is, and its skin weights' sum
    const vertices = (geometry) => {
        const position = geometry.attributes.position;
        const weights = geometry.attributes.skinWeight.array;

        return Array.from({ length: position.count }, (_, i) => ({ x: position.getX(i), y: position.getY(i), z: position.getZ(i), weight: weights[i * 4] + weights[i * 4 + 1] + weights[i * 4 + 2] + weights[i * 4 + 3] }));
    };

    it("hangs every drape from the waist, fitted round the body, flaring to its hem", () => {
        for (const id of Object.keys(DRAPES).filter((each) => !DRAPES[each].cape)) {
            const { geometry } = buildDrape(f, id, measures);
            const points = vertices(geometry);
            const top = Math.max(...points.map(({ y }) => y));
            const hem = Math.min(...points.map(({ y }) => y));

            assert.ok(points.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)), `${id}: no broken vertices`);
            assert.ok(points.every(({ weight }) => Math.abs(weight - 1) < 1e-5), `${id}: skin weights sum to one`);
            assert.ok(Math.abs(top - (l.waist - 0.01 * (f.height / 1.7))) < 0.01, `${id} starts at the waist`);
            assert.ok(hem < l.hips - 0.3, `${id} hangs well below the hips`);

            // Wider at the hem than round the waist (at the sides)
            const width = (y) => Math.max(...points.filter((p) => Math.abs(p.y - y) < 1e-4).map(({ x }) => Math.abs(x)));

            assert.ok(width(hem) > width(top), `${id} flares`);
        }

        // The long ones reach the ankles; the apron only the thighs, and only at the front
        assert.ok(Math.min(...vertices(buildDrape(f, "kirtle", measures).geometry).map(({ y }) => y)) < l.ankle + 0.05);

        const apron = vertices(buildDrape(f, "apron", measures).geometry);
        const middle = apron.reduce((sum, { z }) => sum + z, 0) / apron.length;

        assert.ok(Math.min(...apron.map(({ y }) => y)) > l.ankle + 0.25);
        assert.ok(apron.every(({ z }) => z > middle - 0.12), "the apron's at the front");
    });

    it("hangs a cloak from the shoulders down the back, behind the arms, edged in its trim, swinging with the legs below the hips", () => {
        for (const id of Object.keys(DRAPES).filter((each) => DRAPES[each].cape)) {
            const { geometry } = buildDrape(f, id, measures);
            const points = vertices(geometry);
            const top = Math.max(...points.map(({ y }) => y));
            const hem = Math.min(...points.map(({ y }) => y));
            const colours = geometry.attributes.color;
            const trim = new THREE.Color(DRAPES[id].trim);
            const indices = geometry.attributes.skinIndex;
            const legs = new Set(["LeftUpLeg", "RightUpLeg"].map((name) => f.rig.index.get(name)));

            assert.ok(points.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)), `${id}: no broken vertices`);
            assert.ok(points.every(({ weight }) => Math.abs(weight - 1) < 1e-5), `${id}: skin weights sum to one`);
            assert.ok(top > l.armpit && top < l.neck, `${id}: from the shoulders`);
            assert.ok(hem < l.crotch - 0.2 && hem > l.ankle, `${id}: down past the knees`);

            // (Behind: every point below the shoulders further back than the body's middle)
            assert.ok(points.filter(({ y }) => y < l.armpit).every(({ z }) => z < 0.06), `${id}: down the back`);

            // (Its hem in its trim, and swinging with the thighs)
            const last = colours.count - 1;

            assert.ok(Math.abs(colours.getX(last) / trim.r - colours.getY(last) / trim.g) < 0.05, `${id}: trimmed`);
            assert.ok(Array.from({ length: indices.count }, (_, i) => i).some((i) => points[i].y < l.crotch && [0, 1, 2, 3].some((k) => legs.has(indices.getComponent(i, k)))), `${id}: moves with the legs`);
        }
    });

    it("swings with the thighs and shins below the hips, each side with its own", () => {
        const { geometry } = buildDrape(f, "skirt", measures);
        const index = geometry.attributes.skinIndex.array;
        const weight = geometry.attributes.skinWeight.array;
        const position = geometry.attributes.position;
        const bone = (name) => f.rig.index.get(name);
        const on = (i, name) => [0, 1, 2, 3].reduce((sum, k) => sum + (index[i * 4 + k] === bone(name) ? weight[i * 4 + k] : 0), 0);
        const hem = Math.min(...Array.from({ length: position.count }, (_, i) => position.getY(i)));

        for (let i = 0; i < position.count; i++) {
            if (Math.abs(position.getY(i) - hem) < 1e-4 && Math.abs(position.getX(i)) > 0.1) {
                const side = position.getX(i) > 0 ? "Left" : "Right";

                assert.ok(on(i, `${side}Leg`) > 0.5, "the hem's sides follow their shins");
                assert.ok(on(i, "Hips") < 0.2);
            }
        }
    });
});

describe("the tavern's folk (presets.js, actions.js)", () => {
    // Pose a body by its walk and actions for a moment, and say where a bone is (world metres)
    const posed = (f, set, seconds = 0.1) => {
        const actions = new Actions(f);
        const walker = new Walker(f);

        walker.overlay = (dt) => actions.apply(dt);
        walker.afterPose = () => actions.place();
        set(actions);

        for (let t = 0; t < seconds; t += 1 / 30) {
            walker.update(1 / 30, { moved: 0 });
        }

        return (name) => f.rig.bone(name).getWorldPosition(new THREE.Vector3());
    };

    it("builds every one of the folk's bodies", () => {
        for (const [name, preset] of Object.entries(FOLK)) {
            const f = figure(preset.shape);

            assert.ok(f.height > 1.4 && f.height < 2.1, `${name} is ${f.height} m`);
        }
    });

    it("sits on a bench: the pelvis on the seat, thighs level, shins upright, feet on the floor", () => {
        const f = figure(FOLK.drinker.shape);
        const at = posed(f, (actions) => actions.setSeated(true));
        const [hips, knee, ankle] = [at("LeftUpLeg"), at("LeftLeg"), at("LeftFoot")];

        assert.ok(hips.y > 0.5 && hips.y < 0.62, `hips ${hips.y.toFixed(2)} m up`);
        assert.ok(Math.abs(knee.y - hips.y) < 0.08, "thighs level");
        assert.ok(knee.z - hips.z > 0.3, "knees forward");
        assert.ok(Math.abs(ankle.z - knee.z) < 0.12 && ankle.y < 0.15, "shins upright, feet down");
    });

    it("raises a tankard high in a toast, then drinks from it", () => {
        assert.ok(ATTACKS.toast && ATTACKS.serve && ATTACKS.pour);

        const f = figure(FOLK.drinker.shape);
        const rest = posed(f, (actions) => actions.setSeated(true))("RightHand").y;
        const f2 = figure(FOLK.drinker.shape);
        const at = posed(f2, (actions) => {
            actions.setSeated(true);
            actions.startAttack("toast", { hitAt: 1, duration: 3.2 });
        }, 1);

        assert.ok(at("RightHand").y > rest + 0.25, `raised from ${rest.toFixed(2)} to ${at("RightHand").y.toFixed(2)} m`);
        assert.ok(at("RightHand").y > at("Neck").y, "above the shoulders");
    });
});

describe("faces and skin (face.js, skin.js)", () => {
    it("knows the scalp and the beard", () => {
        assert.ok(aboveHairline(0, 0.11, -0.05) > 0, "the crown has hair");
        assert.ok(aboveHairline(0, 0.03, 0.028) < 0, "the forehead doesn't");
        assert.ok(beardAmount(0, -0.1, 0.02) > 0.9, "the chin has a beard");
        assert.equal(beardAmount(0, 0.02, 0.03), 0, "the brow doesn't");
    });

    it("paints the skin in its colour, all over the body's texture", () => {
        const atlas = new SkinAtlas(human, {}, 128);
        const covered = atlas.covered.reduce((sum, value) => sum + value, 0) / atlas.covered.length;
        const { data } = paintSkin(atlas, { tone: "#8a5a3c", variation: 0, blush: 0, brows: 0 });
        let red = 0;
        let count = 0;

        for (let i = 0; i < atlas.covered.length; i++) {
            if (atlas.covered[i]) {
                red += data[i * 4];
                count++;
            }
        }

        assert.ok(covered > 0.4, `${covered} of the texture is body`);
        assert.ok(Math.abs(red / count - 0x8a) < 25, `average red ${red / count}`);
    });

    it("paints how rough the skin is in its picture's alpha: oilier down the forehead and nose, fur matte, scales glossy", () => {
        const atlas = new SkinAtlas(human, {}, 128);
        const rough = (data, where) => {
            let [sum, count] = [0, 0];

            for (let i = 0; i < atlas.covered.length; i++) {
                if (atlas.covered[i] && where(i)) {
                    sum += data[i * 4 + 3] / 255;
                    count++;
                }
            }

            return sum / count;
        };
        const skin = paintSkin(atlas, { tone: "#8a5a3c", brows: 0, stubble: 0, scalp: 0 }).data;
        const oily = (i) => atlas.fields.oily[i] > 180;
        const plain = (i) => atlas.fields.oily[i] === 0 && atlas.fields.cavity[i] < 128;

        assert.ok(atlas.fields.oily.some((value) => value > 180), "a T-zone");
        assert.ok(Math.abs(rough(skin, plain) - SKIN_ROUGHNESS.skin) < 0.03, `skin ${rough(skin, plain)}`);
        assert.ok(rough(skin, oily) < rough(skin, plain) - 0.08, `the T-zone ${rough(skin, oily)}`);
        assert.ok(Math.abs(rough(paintSkin(atlas, { tone: "#8a5a3c", fur: 1 }).data, plain) - SKIN_ROUGHNESS.fur) < 0.03, "fur");
        assert.ok(rough(paintSkin(atlas, { tone: "#8a5a3c", scales: 1 }).data, plain) < SKIN_ROUGHNESS.skin, "scales");

        // (The seams' texels as rough as those they're copied from)
        for (let g = 0; g < atlas.gutter.length; g += 2) {
            assert.equal(skin[atlas.gutter[g] * 4 + 3], skin[atlas.gutter[g + 1] * 4 + 3]);
        }
    });

    it("lights skin from its picture's roughness, wrapping round, red furthest; and hair in bands along its strands", () => {
        const compiled = (material) => {
            const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };

            material.onBeforeCompile(shader);

            return shader.fragmentShader;
        };
        const skin = compiled(new SkinMaterial());
        const hair = compiled(new HairMaterial());

        assert.ok(skin.includes("float skinRoughness = sampledDiffuseColor.a;") && skin.includes("diffuseColor.a = opacity;"), "rough, not see-through");
        assert.ok(skin.includes("vec3 skinLit = saturate( ( dot( geometryNormal, directLight.direction ) + SKIN_WRAP )"), "wrapped");
        assert.ok(SKIN_WRAP[0] > SKIN_WRAP[1] && SKIN_WRAP[1] > SKIN_WRAP[2] && SKIN_WRAP[0] < 0.5, "red furthest, and not far");
        assert.ok(!skin.includes("reflectedLight.directDiffuse += irradiance * BRDF_Lambert"), "in place of three.js's");
        assert.ok(hair.includes("hairBand( hairStrand, geometryNormal, hairHalfway") && hair.includes("hairStrand = hairAlongLength > 1e-8"), "banded");
        assert.ok(hair.includes("hairShift = ( sampledDiffuseColor.g - 0.85 ) * HAIR_JITTER;") && hair.includes("+ hairShift"), "each strand's bands its own");
        assert.ok(!hair.includes("reflectedLight.directSpecular += irradiance * specularBRDF"), "in place of three.js's");
        assert.ok(HAIR_SHINE.sharp > HAIR_SHINE.tintSharp, "the white band narrower than the tinted one");

        // Copied (someone unseen), still skin and hair
        assert.equal(new SkinMaterial().clone().customProgramCacheKey(), "skin");
        assert.equal(new HairMaterial().clone().customProgramCacheKey(), "hair");
        assert.equal(new SkinMaterial().roughness, 1, "the picture's roughness as it is");
    });

    it("paints eyes with a dark pupil in the middle", () => {
        const { data, width } = paintEye({ iris: "#3070c0" }, 64);
        const middle = (32 * width + 32) * 4;
        const iris = (32 * width + 32 + 10) * 4;
        const white = (32 * width + 2) * 4;

        assert.ok(data[middle] < 20 && data[middle + 2] < 20, "pupil");
        assert.ok(data[iris + 2] > data[iris], "blue iris");
        assert.ok(data[white] > 200, "white");
    });
});

describe("motion capture (bvh.js)", () => {
    const bvh = parseBVH(readFileSync(new URL("../client/characters/animations/walk.bvh", import.meta.url), "utf8"));

    it("reads MakeHuman's walk", () => {
        assert.equal(bvh.frames.length, 14);
        assert.ok(Math.abs(bvh.frameTime - 1 / 24) < 1e-4);
        assert.ok(bvh.joints.some(({ name }) => name === "UpLeg_L"));
        assert.equal(bvh.frames[0].length, bvh.joints.reduce((sum, joint) => sum + joint.channels.length, 0));
    });

    it("retargets it to our skeleton, within the joints' ranges", () => {
        const f = figure();
        const clip = retarget(bvh, f.rig);
        const knee = f.rig.index.get("LeftLeg");
        let bent = 0;

        assert.equal(clip.frames.length, 14);
        assert.ok(clip.scale > 0.05 && clip.scale < 0.2, `decimetres to metres, about: ${clip.scale}`);

        for (const frame of clip.frames) {
            const rotation = frame.rotations[knee];

            assert.ok(Math.abs(rotation.length() - 1) < 1e-6);

            // The knee only bends (about x), within its range
            const angle = 2 * Math.acos(Math.min(1, Math.abs(rotation.w)));

            assert.ok(angle <= 140 * DEG + 1e-6);
            bent = Math.max(bent, angle);
        }

        assert.ok(bent > 30 * DEG, "the knee bends while walking");
    });
});

describe("presets (presets.js)", () => {
    it("builds every preset's body", () => {
        for (const [name, preset] of Object.entries(PRESETS)) {
            const f = figure(preset.shape);

            assert.ok(f.height > 1.4 && f.height < 2.3, `${name} is ${f.height} m`);
        }

        assert.ok(figure(PRESETS.orc.shape).height > figure(PRESETS.hero.shape).height, "orcs are big");
        assert.deepEqual(Object.keys(MACRO_DEFAULTS).sort(), ["african", "asian", "bust", "caucasian", "gender", "height", "muscle", "weight"]);
    });
});

describe("the other peoples (peoples.js, equipment.js, skin.js)", () => {
    const sliders = new Set(DETAILS.map(({ id }) => id));

    it("gives each people a look of their own, each one a little different, the same from the same seed", () => {
        for (const people of PEOPLES) {
            for (const sex of ["m", "f"]) {
                const look = peopleLook({ people, sex, seed: 7 });

                assert.deepEqual(peopleLook({ people, sex, seed: 7 }), look, `${people} ${sex}`);
                assert.notDeepEqual(peopleLook({ people, sex, seed: 8 }).shape, look.shape, `${people} ${sex}: another seed, another body`);
                assert.equal(look.shape.macro.gender, sex === "f" ? 0 : 1);

                for (const id of Object.keys(look.shape.details)) {
                    assert.ok(sliders.has(id), `${people}: ${id}`);
                }

                for (const id of look.parts) {
                    assert.ok(ITEMS[id], `${people}: ${id}`);
                }

                const spec = LOOKS[people];

                if (spec) {
                    for (const [id, [least, most]] of Object.entries(spec.build[sex])) {
                        assert.ok(look.shape.macro[id] >= least - 1e-9 && look.shape.macro[id] <= most + 1e-9, `${people} ${sex}: ${id}`);
                    }

                    assert.ok(Math.abs(look.shape.macro.african + look.shape.macro.asian + look.shape.macro.caucasian - 1) < 1e-9);
                    assert.ok((spec.styles[sex] ?? spec.styles.m).includes(look.look.hair.style), `${people}: ${look.look.hair.style}`);
                }
            }
        }

        assert.equal(peopleLook({ people: "troll" }), null);
    });

    it("gives elves long, pointed ears and cat folk and lizard folk slit eyes, fur, stripes and scales, ears and tails", () => {
        for (const people of ["elf", "darkElf"]) {
            const { shape, parts } = peopleLook({ people, seed: 3 });

            assert.ok(shape.details.earLength >= 0.8 && shape.details.earPoint >= 0.85, people);
            assert.deepEqual(parts, []);
        }

        const cats = Array.from({ length: 12 }, (_, seed) => peopleLook({ people: "cat", seed }));
        const lizard = peopleLook({ people: "lizard", seed: 3 });

        assert.ok(cats.every(({ look, parts }) => look.eyes.slit && look.skin.fur >= 0.8 && parts.includes("catEars") && parts.includes("catTail")));
        assert.ok(cats.some(({ look }) => look.skin.stripes > 0) && cats.some(({ look }) => !look.skin.stripes), "some are striped");
        assert.ok(lizard.look.eyes.slit && lizard.look.skin.scales >= 0.85 && lizard.shape.details.snout >= 0.8);
        assert.deepEqual(lizard.parts, ["lizardTail"]);
        assert.equal(lizard.look.hair.style, "bald");
    });

    it("makes orcs each a little different from the orc, their women women", () => {
        const orcs = Array.from({ length: 8 }, (_, seed) => peopleLook({ people: "orc", seed }));
        const woman = peopleLook({ people: "orc", sex: "f", seed: 2 });

        assert.ok(new Set(orcs.map(({ shape }) => shape.macro.height)).size > 4);
        assert.ok(orcs.every(({ parts, walk }) => parts.includes("tusks") && walk === "orc"));
        assert.equal(woman.shape.macro.gender, 0);
        assert.ok(woman.shape.details.jawWidth < PRESETS.orc.shape.details.jawWidth);
    });

    it("puts cat folk's ears on top of the head and tails at the base of the spine, in their skin's colour", () => {
        const f = figure(peopleLook({ people: "cat", seed: 3 }).shape);
        const head = (name) => f.rig.heads[f.rig.index.get(name)];
        const where = (socket) => {
            const place = placed(socketOn(f, socket), {});

            return place.position.clone().add(head(place.bone));
        };
        const [left, right, tail] = [where("leftEar"), where("rightEar"), where("tail")];
        const hips = head("Hips");

        assert.ok(left.x > 0.02 && right.x < -0.02 && Math.abs(left.x + right.x) < 0.01, "either side");
        assert.ok(left.y > head("Head").y + 0.08 && Math.abs(left.y - right.y) < 0.005, "on top of the head");
        assert.ok(Math.abs(tail.x) < 0.01 && tail.z < hips.z - 0.05 && Math.abs(tail.y - hips.y) < 0.1, `behind the hips: ${tail.toArray().map((v) => v.toFixed(2))}`);

        for (const id of ["catEars", "catTail", "lizardTail"]) {
            const item = ITEMS[id];

            assert.ok(item.tinted && SLOTS.some(({ id: slot }) => slot === item.slot), id);

            for (const { model } of item.parts ?? [item]) {
                const names = [];

                buildItem(model, {}).traverse((mesh) => mesh.isMesh && names.push(mesh.material.name));
                assert.ok(names.includes("skin"), `${id}: ${names}`);
            }
        }

        assert.ok(ITEMS.catTail.sway > 0 && ITEMS.lizardTail.sway > 0, "tails sway");
    });

    it("paints fur (striped) and scales over the skin", () => {
        const atlas = new SkinAtlas(human, {}, 128);
        const spread = (data) => {
            let [sum, squares, count] = [0, 0, 0];

            for (let i = 0; i < atlas.covered.length; i++) {
                if (atlas.covered[i]) {
                    sum += data[i * 4];
                    squares += data[i * 4] ** 2;
                    count++;
                }
            }

            return Math.sqrt(squares / count - (sum / count) ** 2);
        };
        const plain = paintSkin(atlas, { tone: "#b88a52", variation: 0, blush: 0, brows: 0 });
        const striped = paintSkin(atlas, { tone: "#b88a52", variation: 0, blush: 0, brows: 0, fur: 1, stripes: 1, stripeColour: "#3a2410" });
        const scaled = paintSkin(atlas, { tone: "#5f7d4a", variation: 0, blush: 0, brows: 0, scales: 1 });
        const smooth = paintSkin(atlas, { tone: "#5f7d4a", variation: 0, blush: 0, brows: 0 });

        assert.ok(atlas.fields.fur && atlas.fields.scales, "the fields for them made when first wanted");
        assert.ok(spread(striped.data) > spread(plain.data) + 5, `stripes: ${spread(striped.data)} against ${spread(plain.data)}`);
        assert.ok(spread(scaled.data) > spread(smooth.data) + 3, `scales: ${spread(scaled.data)} against ${spread(smooth.data)}`);
        assert.notDeepEqual(scaled.bump, smooth.bump, "the scales raised");
    });
});


describe("items (items.js)", () => {
    // Every item's every model: held, put away, and what it hangs in
    const models = [...new Set(Object.values(ITEMS).flatMap((item) => [...(item.parts ?? [item]).map(({ model }) => model), item.sheath?.model, item.sheath?.holder]).filter(Boolean))];
    const folded = (mesh) => Boolean(mesh.geometry.attributes.fold);
    // (Whether a material's parts could be folded in with others': opaque, not glowing, not skin)
    const foldable = ({ name, transparent, emissive }) => name !== "skin" && !transparent && emissive.getHex() === 0;

    it("draws each item's opaque parts in one mesh, each part as its own material, and the rest a mesh for each", () => {
        let [before, after] = [0, 0];

        for (const model of models) {
            for (const ears of [false, true]) {
                const meshes = [];

                buildItem(model, { headRadius: 0.1, scale: 1, ears }).traverse((node) => node.isMesh && meshes.push(node));

                const one = meshes.filter(folded);
                const apart = meshes.filter((mesh) => !folded(mesh));

                assert.ok(one.length <= 1, `${model}: one folded mesh at most`);
                assert.ok(apart.filter((mesh) => foldable(mesh.material)).length <= (one.length ? 0 : 1), `${model}: nothing left apart that could be folded in`);
                assert.ok(apart.every((mesh) => mesh.material === itemMaterial(mesh.material.name)), `${model}: those apart in the shared materials`);

                if (one.length) {
                    const [{ geometry, material }] = one;
                    const names = material.name.split("+");
                    const folds = geometry.attributes.fold.array;

                    assert.ok(names.length > 1 && names.every((name) => foldable(itemMaterial(name))), `${model}: ${material.name}`);
                    assert.ok(names.every((_, fold) => folds.includes(fold)) && folds.every((fold) => fold < names.length), `${model}: every vertex of one of them`);

                    // (Each fold its material's colour, metalness and roughness)
                    names.forEach((name, fold) => {
                        const { color, metalness, roughness } = itemMaterial(name);

                        assert.deepEqual([...material.colours.slice(fold * 3, fold * 3 + 3)], color.toArray().map(Math.fround), `${model}: ${name}`);
                        assert.deepEqual([...material.surfaces.slice(fold * 2, fold * 2 + 2)], [metalness, roughness].map(Math.fround), `${model}: ${name}`);
                    });
                }

                before += new Set([...one.flatMap(({ material }) => material.name.split("+")), ...apart.map(({ material }) => material.name)]).size;
                after += meshes.length;
            }
        }

        assert.ok(after < before * 0.6, `${after} meshes where there'd be ${before}`);
    });

    it("gives a thin part folded in its other side: each face turned over, facing the other way", () => {
        const meshes = [];

        buildItem("quiver").traverse((node) => node.isMesh && meshes.push(node));

        const [{ geometry, material }] = meshes.filter(folded);
        const feather = material.name.split("+").indexOf("feather");
        const { position, normal, fold } = geometry.attributes;
        const faces = new Set();
        const key = (v, sign) => [position.getX(v), position.getY(v), position.getZ(v), sign * normal.getX(v), sign * normal.getY(v), sign * normal.getZ(v)].map((n) => n.toFixed(5)).join();

        assert.equal(itemMaterial("feather").side, THREE.DoubleSide);

        for (let v = 0; v < position.count; v++) {
            if (fold.getX(v) === feather) {
                faces.add(key(v, 1));
            }
        }

        assert.ok(faces.size > 0);

        for (let v = 0; v < position.count; v++) {
            if (fold.getX(v) === feather) {
                assert.ok(faces.has(key(v, -1)), "turned over");
            }
        }
    });

    it("draws the folds in one shader, its lines put in three.js's; copied with its folds", () => {
        const meshes = [];

        buildItem("sword").traverse((node) => node.isMesh && meshes.push(node));

        const { material } = meshes.find(folded);
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };

        material.onBeforeCompile(shader);
        assert.ok(shader.vertexShader.includes("vFoldColour = foldColours[int(fold)];"));
        assert.ok(shader.fragmentShader.includes("diffuseColor.rgb *= vFoldColour;") && shader.fragmentShader.includes("roughnessFactor *= vFoldSurface.y;"));
        assert.equal(shader.uniforms.foldColours.value, material.colours);

        const copy = material.clone();

        assert.deepEqual(copy.colours, material.colours);
        assert.ok(copy.colours !== material.colours, "its own");
        assert.equal(copy.customProgramCacheKey(), material.customProgramCacheKey());
    });
});
