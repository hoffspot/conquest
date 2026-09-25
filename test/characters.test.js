import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { HumanData } from "../client/js/characters/body.js";
import { parseBVH, retarget } from "../client/js/characters/bvh.js";
import { allDetailTargetNames, DETAILS, detailTargets } from "../client/js/characters/details.js";
import { EQUIPMENT, ITEMS, SLOTS } from "../client/js/characters/equipment.js";
import { aboveHairline, beardAmount } from "../client/js/characters/face.js";
import { amplitude, cadence, CURVES, curveAt, NATURAL_SPEED, phaseName, RUN_CURVES, RUN_STANCE, runCadence, runStrideLength, STANCE, strideLength, walkToRunSpeed } from "../client/js/characters/gait.js";
import { buildGarment, GARMENTS, measureBody, texelMap } from "../client/js/characters/garments.js";
import { Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { allBustTargetNames, allMacroTargetNames, bustTargets, components, MACRO_DEFAULTS, macroTargets } from "../client/js/characters/macro.js";
import { decodeSection, encodeSection, Packer } from "../client/js/characters/pack.js";
import { PRESETS } from "../client/js/characters/presets.js";
import { JOINTS, jointOf, jointRotation, limitRotation, Rig } from "../client/js/characters/rig.js";
import { paintEye, paintSkin, SkinAtlas } from "../client/js/characters/skin.js";

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

    return { human, rig, object, positions, normals: human.normals(positions), joints, height, holds: {} };
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

            assert.ok(covers.size > 10, `${id} covers some of the body`);
            assert.equal(sources.length, geometry.index.count / 3, `${id}: a source for every triangle`);
            assert.ok(position.array.every(Number.isFinite), `${id} has no broken vertices`);

            for (let i = 0; i < weights.length; i += 4) {
                assert.equal(weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3], 255, `${id} vertex ${i / 4}'s weights`);
            }
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

        for (const preset of Object.values(PRESETS)) {
            for (const id of preset.equipment) {
                assert.ok(EQUIPMENT[id], id);
            }
        }

        assert.ok(Object.values(ITEMS).every(({ socket }) => socket));
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
