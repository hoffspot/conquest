// Things that walk on two legs but aren't people: a skeleton (every bone a body has, near enough,
// beasts/bones.js: a skull with glowing lights deep in its sockets and a jaw that chatters, the
// spine's vertebrae, twelve pairs of ribs, collarbones and shoulder blades, a pelvis, the long
// bones of the limbs, hands and feet), the wight lord (a skeleton in blackened armour, crowned, a
// tattered cape hanging from its shoulders and moving as cloth does, cloth.js, with a greatsword),
// and a treant (a trunk sculpted in one piece with its limbs, sculpt.js: a face in its bark,
// branches for arms with twigs for fingers, roots for feet, and a crown of boughs forking into
// branches and twigs, sparse leaves at their tips; blighted, grey and fungus-grown).
//
// Each walks and runs (legs swinging, knees lifting, arms swinging against them). A skeleton
// slashes, thrusts or chops, and the wight lord lays a curse; resting, it slumps, rattles its jaw,
// or turns its skull right round. A treant slams both arms down or sweeps one across, or calls up
// roots; resting, it roots itself and stands still as a tree, sways, or stretches its limbs,
// creaking. Each jolts when struck and dies its own way: a skeleton collapsing in a heap, a
// treant falling like a felled tree.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { arm as armBones, leg as legBones, skull, trunk } from "./bones.js";
import { Cloth } from "./cloth.js";
import { aim, box, cone, ellipsoid, joint, limb, membrane, part, ring, shade, skin } from "./shapes.js";

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

// How long its spine is, hips to shoulders
const spineOf = (H, treant) => H * (treant ? 0.42 : 0.3);

// A leaf (flat, both sides seen): from its stalk at 0, 0 out along +z, a unit long
const LEAF = [[0, 0], [0.4, 0.25], [0.5, 0.6], [0.3, 0.95], [0, 1.25], [-0.3, 0.95], [-0.5, 0.6], [-0.4, 0.25]];

/**
 * Build a biped from its look ({ kind: "skeleton" or "treant", height (m), colours, armour,
 * crown, cloak, weapon: "sword" or "greatsword", blight }).
 */
export function biped(look, random, key = null) {
    const H = look.height;
    const treant = look.kind === "treant";
    const colours = look.colours;
    const main = treant ? new THREE.MeshStandardMaterial({ roughness: 1 }) : skin(colours.bone ?? 0xd8cfb4, { roughness: 0.65 });
    const bark = new THREE.Color(colours.bark ?? 0x4a4038);
    const sculpt = treant ? new Sculpt({ blend: H * 0.04, grain: "bark", grainSize: H * 0.012, countershade: 0.05 }) : null;
    const dark = skin(colours.dark ?? shade(treant ? colours.bark : colours.bone ?? 0xd8cfb4, -0.6).getHex(), { roughness: 0.9 });
    const eyes = skin(colours.eyes ?? 0xff6020, { glow: colours.eyes ?? 0xff6020, glowing: 2.4 });
    const metal = skin(colours.metal ?? 0x6e6458, { roughness: 0.55, metalness: 0.6 });

    // (A piece of it: sculpted bark for a treant, a bone for a skeleton)
    const flesh = (parent, shape, { at = [0, 0, 0], turn = [0, 0, 0], blend } = {}) => {
        if (treant) {
            sculpt.add(parent, shape, bark, { at, turn, blend });
        } else if (shape.limb) {
            part(parent, limb(...shape.limb, 6), main, { at, turn });
        } else {
            part(parent, ellipsoid(...shape.ellipsoid, 10), main, { at, turn });
        }
    };

    // Proportions: legs half its height (a skeleton's ankles a hand above the ground); a spine to
    // the shoulders; the neck, and the head on top
    const s = H / 1.8;
    const legLength = H * (treant ? 0.4 : 0.48);
    const ankle = treant ? 0 : H * 0.02 + 0.065 * s;
    const thigh = (legLength - ankle) * 0.5;
    const shin = (legLength - ankle) * 0.5;
    const neckLength = treant ? -spineOf(H, treant) * 0.25 : 0.11 * s;
    const spine = spineOf(H, treant);
    const shoulderWidth = H * (treant ? 0.15 : 0.11);
    const hipWidth = H * (treant ? 0.1 : 0.055);
    const upperArm = H * (treant ? 0.24 : 0.17);
    const foreArm = H * (treant ? 0.24 : 0.15);

    const object = new THREE.Group();
    const root = joint(object, "root");
    const body = joint(root, "body", [0, legLength, 0]);
    const torso = joint(body, "torso");
    const chest = joint(torso, "chest", [0, spine * 0.55, 0]);
    const neck = joint(chest, "neck", [0, spine * 0.45, 0]);
    const head = joint(neck, "head", [0, neckLength, 0]);
    let jaw = head;
    let crown = null;
    let cloth = null;
    let glows = [];

    if (treant) {
        // A trunk, broadening to the roots, with ridges down it; a face in it; a crown of leaves
        const leaves = skin(colours.leaves, { roughness: 0.85, side: THREE.DoubleSide });
        const leavesDark = skin(shade(colours.leaves, -0.25).getHex(), { roughness: 0.9, side: THREE.DoubleSide });
        const moss = colours.moss ?? shade(colours.leaves, -0.25).getHex();

        sculpt.add(body, { ellipsoid: [H * 0.15, H * 0.09, H * 0.13] }, bark);
        sculpt.add(torso, { limb: [spine * 1.1, H * 0.12, H * 0.16] }, bark, { at: [0, spine * 1.05, 0] });

        for (let k = 0; k < 9; k++) {
            const round = (k / 9) * TAU + random() * 0.3;

            sculpt.add(torso, { limb: [spine * (0.55 + random() * 0.45), H * 0.035, H * 0.02] }, bark, { at: [Math.sin(round) * H * 0.12, spine * (0.85 + random() * 0.2), Math.cos(round) * H * 0.12], blend: H * 0.03 });
        }

        for (let k = 0; k < 6; k++) {
            sculpt.paint(torso, [H * (0.05 + random() * 0.04), H * 0.06, H * 0.05], moss, { at: [(random() - 0.5) * H * 0.25, spine * (0.15 + random() * 0.7), (random() - 0.5) * H * 0.25], soft: H * 0.02, strength: 0.8 });
        }

        // The face: hollows with a light in them, a knot of a nose, a crack of a mouth
        const face = H * 0.14;

        for (const side of [-1, 1]) {
            part(head, ellipsoid(H * 0.035, H * 0.025, H * 0.02, 8), dark, { at: [side * H * 0.05, H * 0.03, face], shadow: false });
            part(head, ellipsoid(H * 0.014, H * 0.012, H * 0.01, 6), eyes, { at: [side * H * 0.05, H * 0.03, face + H * 0.012], shadow: false });
            sculpt.add(head, { ellipsoid: [H * 0.05, H * 0.015, H * 0.03] }, bark, { at: [side * H * 0.05, H * 0.06, face - H * 0.01], blend: H * 0.01 });
        }

        sculpt.add(head, { ellipsoid: [H * 0.02, H * 0.035, H * 0.03] }, bark, { at: [0, 0, face - H * 0.005], blend: H * 0.01 });
        jaw = joint(head, "jaw", [0, -H * 0.05, face]);
        part(jaw, ellipsoid(H * 0.06, H * 0.014, H * 0.02, 8), dark, { shadow: false });

        crown = joint(chest, "crown", [0, spine * 0.55, 0]);

        // The crown: boughs growing up and out of the top of the trunk, each forking into
        // branches and those into twigs, a spray of leaves at each twig's tip (few, blighted)
        const wood = skin(shade(colours.bark, -0.08).getHex(), { roughness: 1 });
        const leafSkins = [leaves, leavesDark, skin(colours.dying ?? 0x7a6a34, { roughness: 0.9, side: THREE.DoubleSide })];
        const unit = (way) => {
            const length = Math.hypot(...way);

            return way.map((each) => each / length);
        };
        const sprout = (from, way, long, radius, depth) => {
            const w = unit(way);

            part(crown, limb(long, radius, radius * 0.62, depth > 1 ? 6 : 4), wood, { at: from, turn: aim(w) });

            const end = from.map((each, axis) => each + w[axis] * long);

            if (depth === 0) {
                for (let k = 0; k < (look.blight ? 3 : 6); k++) {
                    const size = H * (0.028 + random() * 0.018);

                    part(crown, membrane(LEAF), leafSkins[Math.floor(random() * (look.blight ? 3 : 2))], {
                        at: end.map((each) => each + (random() - 0.5) * H * 0.04),
                        turn: [(random() - 0.7) * 1.6, random() * TAU, (random() - 0.5) * 1.2],
                        scale: [size, size, size],
                        shadow: false,
                    });
                }

                return;
            }

            for (let k = 0; k < (depth === 2 ? 3 : 2); k++) {
                const round = random() * TAU;
                const spread = 0.55 + random() * 0.4;
                const along = 0.6 + random() * 0.4;

                sprout(
                    from.map((each, axis) => each + w[axis] * long * along),
                    [w[0] + Math.sin(round) * spread, w[1] + 0.2, w[2] + Math.cos(round) * spread],
                    long * (0.55 + random() * 0.15),
                    radius * 0.58,
                    depth - 1,
                );
            }
        };

        for (let k = 0; k < 6; k++) {
            const round = (k / 6) * TAU + random() * 0.5;
            const out = 0.45 + random() * 0.45;
            const way = unit([Math.sin(round) * out, 1, Math.cos(round) * out * 0.75]);

            sculpt.add(crown, { limb: [H * 0.1, H * 0.034, H * 0.024] }, bark, { turn: aim(way), blend: H * 0.02 });
            sprout(way.map((each) => each * H * 0.08), way, H * (0.15 + random() * 0.08), H * 0.022, 2);
        }

        if (look.blight) {
            const fungus = skin(colours.fungus ?? 0x8a4a9a, { roughness: 0.6, glow: colours.fungus ?? 0x8a4a9a, glowing: 0.35 });

            for (let k = 0; k < 7; k++) {
                const round = Math.PI * (0.35 + random() * 1.3);

                part(torso, ellipsoid(H * 0.035, H * 0.012, H * 0.035, 7), fungus, { at: [Math.sin(round) * H * 0.15, spine * (0.15 + random() * 0.7), Math.cos(round) * H * 0.15], turn: [0, 0, Math.sin(round) * 0.3], shadow: false });
            }
        }
    } else {
        // Its bones (bones.js): the spine, ribs, shoulders and pelvis; the skull and its jaw
        const bone = colours.bone ?? 0xd8cfb4;
        const teeth = skin(colours.teeth ?? shade(bone, 0.1).getHex(), { roughness: 0.4 });
        const gristle = skin(shade(bone, -0.3).getHex(), { roughness: 0.8 });

        trunk({ pelvis: body, waist: torso, chest, neck }, s, { bone: main, gristle, waistLength: spine * 0.55, chestLength: spine * 0.45, neckLength, shoulders: shoulderWidth, shoulderY: spine * 0.42 });
        ({ jaw, glows } = skull(head, s, { bone: main, teeth, dark, eyes, light: colours.eyes ?? 0xff6020 }));

        // The wight lord's armour, crown and cloak
        // (The wight lord's armour: a breastplate with a ridge down it and a gorget at the neck,
        // shoulder plates in overlapping layers with a spike, a skirt of plates at the hips)
        if (look.armour) {
            part(chest, ellipsoid(H * 0.078, H * 0.085, H * 0.05, 14), metal, { at: [0, spine * 0.3, H * 0.018] });
            part(chest, box(H * 0.008, H * 0.13, H * 0.01), metal, { at: [0, spine * 0.3, H * 0.066], turn: [-0.12, 0, Math.PI / 4] });
            part(chest, ring(H * 0.04, H * 0.009, Math.PI * 2, 14), metal, { at: [0, spine * 0.47, 0], turn: [Math.PI / 2 - 0.2, 0, 0] });

            for (const side of [-1, 1]) {
                for (let k = 0; k < 3; k++) {
                    part(chest, ellipsoid(H * (0.052 - k * 0.006), H * 0.014, H * (0.05 - k * 0.005), 10), metal, { at: [side * (shoulderWidth + k * H * 0.008), spine * (0.47 - k * 0.07), 0], turn: [0, 0, -side * (0.35 + k * 0.2)] });
                }

                part(chest, cone(H * 0.045, H * 0.011, 5), metal, { at: [side * shoulderWidth * 0.95, spine * 0.49, 0], turn: [0, 0, -side * 0.45] });
            }

            for (let k = 0; k < 5; k++) {
                const round = (k - 2) * 0.55;

                part(body, box(H * 0.06, H * 0.075, H * 0.008), metal, { at: [Math.sin(round) * H * 0.075, -H * 0.04, Math.cos(round) * H * 0.06], turn: [-0.18, round, 0] });
            }

            part(body, ring(H * 0.08, H * 0.01, Math.PI * 2, 16), metal, { at: [0, H * 0.005, 0], turn: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1] });
        }

        if (look.crown) {
            const gold = skin(colours.crown ?? 0x9a8440, { roughness: 0.35, metalness: 0.9 });

            part(head, ring(H * 0.05, H * 0.006, TAU, 16), gold, { at: [0, H * 0.085, 0], turn: [Math.PI / 2, 0, 0] });

            for (let k = 0; k < 7; k++) {
                const round = (k / 7) * TAU;

                part(head, cone(H * 0.03, H * 0.008, 4), gold, { at: [Math.sin(round) * H * 0.05, H * 0.088, Math.cos(round) * H * 0.05] });
            }
        }

        // (A cape: cloth hung from across the back of its shoulders, cloth.js)
        if (look.cloak) {
            cloth = new Cloth({ columns: 9, rows: 13, width: shoulderWidth * 2.1, drop: spine * 0.95 + legLength * 0.8, flare: 0.6, colour: colours.cloak, random });
            object.add(cloth.mesh);
        }
    }

    // Arms and legs: shoulders and hips to elbows and knees to hands and feet
    const arms = {};
    const legs = {};

    for (const side of [-1, 1]) {
        const name = side < 0 ? "left" : "right";
        const shoulder = joint(chest, `shoulder-${name}`, [side * shoulderWidth, spine * (treant ? 0.3 : 0.42), 0]);

        shoulder.rotation.z = side * (treant ? 0.3 : 0.08);

        const elbow = joint(shoulder, "elbow", [0, -upperArm, 0]);
        const hand = joint(elbow, "hand", [0, -foreArm, 0]);

        if (treant) {
            flesh(shoulder, { limb: [upperArm, H * 0.05, H * 0.035] });
            flesh(elbow, { limb: [foreArm, H * 0.035, H * 0.022] });
        }

        if (treant) {
            for (let k = 0; k < 4; k++) {
                sculpt.add(hand, { limb: [H * 0.12, H * 0.014, H * 0.005] }, bark, { turn: [(k - 1.5) * 0.3, 0, (k - 1.5) * 0.35], blend: H * 0.012 });
            }

            // (A few leaves sprouting at the elbow)
            for (let k = 0; k < 4; k++) {
                const size = H * 0.035;

                part(elbow, membrane(LEAF), skin(colours.leaves, { roughness: 0.85, side: THREE.DoubleSide }), { at: [side * H * 0.03, -k * H * 0.02, 0], turn: [-0.6 + random() * 0.4, random() * TAU, side * 0.8], scale: [size, size, size], shadow: false });
            }
        } else {
            armBones({ shoulder, elbow, hand }, s, { bone: main, upperArm, foreArm, side, grip: side > 0 && Boolean(look.weapon) });
        }

        arms[name] = { shoulder, elbow, hand, side };

        const hip = joint(body, `hip-${name}`, [side * hipWidth, -H * 0.02, 0]);
        const knee = joint(hip, "knee", [0, -thigh, 0]);
        const foot = joint(knee, "foot", [0, -shin, 0]);

        if (treant) {
            flesh(hip, { limb: [thigh, H * 0.07, H * 0.055] });
            flesh(knee, { limb: [shin, H * 0.055, H * 0.075] });
        }

        if (treant) {
            for (let k = 0; k < 4; k++) {
                sculpt.add(foot, { limb: [H * 0.14, H * 0.035, H * 0.012] }, bark, { at: [0, H * 0.01, 0], turn: [Math.PI / 2 - 0.25, (k - 1.5) * 0.55, 0], blend: H * 0.02 });
            }
        } else {
            legBones({ hip, knee, foot }, s, { bone: main, thigh, shin, side });
        }

        legs[name] = { hip, knee, foot, side };
    }

    // What it carries: a rusty sword, or the wight lord's greatsword
    if (look.weapon) {
        const long = look.weapon === "greatsword" ? H * 0.62 : H * 0.42;
        const grip = joint(arms.right.hand, "weapon", [0, -H * 0.03, 0]);

        grip.rotation.x = Math.PI / 2 - 0.35;
        part(grip, box(H * 0.014, H * 0.07, H * 0.014), dark);
        part(grip, box(H * 0.1, H * 0.014, H * 0.02), metal, { at: [0, H * 0.04, 0] });
        part(grip, box(H * (look.weapon === "greatsword" ? 0.034 : 0.026), long, H * 0.007), metal, { at: [0, H * 0.047 + long / 2, 0] });
    }

    if (treant) {
        sculpt.build(object, main, key);
    }

    const rest = { bodyY: body.position.y };

    // Where a point on one of its joints is in its own frame (the cape's), each moment
    const frame = new THREE.Matrix4();
    const inverse = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const inObject = (bone, local) => point.set(...local).applyMatrix4(frame.multiplyMatrices(inverse, bone.matrixWorld)).toArray();

    // The cape's fastenings, across the back of its shoulders (behind any armour), in its chest's
    // frame; and what it's kept out of: the chest and hips, each leg down to the foot
    const pins = [];

    for (let k = 0; cloth && k < cloth.columns; k++) {
        const u = (k / (cloth.columns - 1)) * 2 - 1;

        pins.push([u * shoulderWidth * 1.05, spine * 0.44 - 0.03 * s * u * u, -(look.armour ? H * 0.064 : 0.07 * s) - 0.02 * s * (1 - u * u)]);
    }

    const blocks = cloth
        ? [
              [chest, [0, spine * 0.3, H * 0.012], look.armour ? H * 0.074 : 0.13 * s],
              [body, [0, -H * 0.02, 0], look.armour ? H * 0.072 : 0.12 * s],
              ...Object.values(legs).flatMap((each) => [
                  [each.hip, [0, 0, 0], 0.09 * s],
                  [each.hip, [0, -thigh * 0.5, 0], 0.075 * s],
                  [each.knee, [0, 0, 0], 0.07 * s],
                  [each.knee, [0, -shin * 0.5, 0], 0.06 * s],
                  [each.foot, [0, -0.03 * s, 0.03 * s], 0.06 * s],
              ]),
          ]
        : [];
    let phase = random();
    let lastSide = 0;

    return {
        object,
        height: H * (treant ? 1.12 : 0.93),
        length: H * 0.3,
        joints: { torso: chest, head, jaw, mouth: arms.right.hand, left: arms.left.hand, body },
        materials: { body: main },
        cloth: cloth?.mesh ?? null,
        attacks: treant ? ["slam", "sweep", "roots"] : ["slash", "thrust", "chop", "curse"],
        rests: treant ? ["root", "sway", "creak"] : ["slump", "rattle", "look"],

        pose({ dt, t, speed, run, attack, react, dead, rest: resting, onStep, seen = true }) {
            const moving = Math.min(1, speed / 0.5);
            const stride = legLength * (run ? 3.4 : 2.3);

            phase = (phase + (speed / stride) * dt) % 1;

            // Walking: legs swinging, knees lifting as each comes through, arms swinging against them
            const swing = (run ? 0.75 : 0.45) * moving;
            const s = Math.sin(phase * TAU);
            const c = Math.cos(phase * TAU);

            for (const [name, leg] of Object.entries(legs)) {
                const sign = name === "left" ? 1 : -1;

                leg.hip.rotation.set(-sign * s * swing, 0, 0);
                leg.knee.rotation.x = Math.max(0, sign * c) * (run ? 1.3 : 0.7) * moving;
                leg.foot.rotation.x = -leg.knee.rotation.x * 0.3;
            }

            if (Math.sign(s) !== lastSide && moving > 0.3) {
                onStep?.(s > 0 ? "left" : "right", speed);
            }

            lastSide = Math.sign(s);

            for (const [name, arm] of Object.entries(arms)) {
                const sign = name === "left" ? -1 : 1;

                arm.shoulder.rotation.set(-sign * s * swing * 0.7, 0, arm.side * (treant ? 0.3 : 0.08));
                arm.elbow.rotation.set(-0.15 - (run ? 0.9 : 0.15) * moving, 0, 0);
            }

            // Standing: swaying, looking about; a skeleton's jaw chattering now and then
            const sway = Math.sin(t * (treant ? 0.6 : 1.1)) * (1 - moving);

            root.rotation.set(0, 0, 0);
            root.position.set(0, 0, 0);
            body.position.set(0, rest.bodyY + Math.abs(c) * H * (run ? 0.035 : 0.015) * moving, 0);
            body.rotation.set(0, 0, 0);
            torso.rotation.set(run ? 0.2 * moving : 0.04 * moving, 0, sway * 0.03);
            neck.rotation.set(0, Math.sin(t * 0.43) * (treant ? 0.12 : 0.4) * (1 - moving), 0);
            head.rotation.set(0, 0, 0);
            jaw.rotation.x = treant ? 0.1 + Math.max(0, Math.sin(t * 0.7)) * 0.2 : Math.max(0, Math.sin(t * 9)) * 0.12 * (Math.sin(t * 0.8) > 0.6 ? 1 : 0.15);

            if (crown) {
                crown.rotation.set(Math.sin(t * 1.3) * 0.03, 0, Math.sin(t * 0.9) * 0.04);
            }

            // Resting its way
            if (resting && !dead) {
                const { name, w, t: into } = resting;

                if (name === "slump") {
                    torso.rotation.x += 0.35 * w;
                    neck.rotation.x = 0.7 * w;
                    jaw.rotation.x = 0.25 * w;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.x = 0.1 * w;
                        arm.elbow.rotation.x = -0.05 * w;
                    }

                    body.position.y -= H * 0.02 * w;
                } else if (name === "rattle") {
                    jaw.rotation.x = Math.abs(Math.sin(into * 18)) * 0.3 * w;
                    head.rotation.z = Math.sin(into * 1.5) * 0.35 * w;
                    torso.rotation.z += Math.sin(into * 20) * 0.02 * w;
                } else if (name === "look") {
                    neck.rotation.y = Math.sin(into * 0.6) * 1.6 * w;
                    head.rotation.z = Math.sin(into * 0.6) * 0.3 * w;
                } else if (name === "root") {
                    body.position.y -= H * 0.08 * w;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-2.6 * w, 0, arm.side * (0.3 + 0.35 * w));
                        arm.elbow.rotation.x = -0.4 * w;
                    }

                    neck.rotation.x = -0.15 * w;
                    crown.rotation.z += Math.sin(into * 3) * 0.05 * w;
                } else if (name === "sway") {
                    torso.rotation.z += Math.sin(into * 0.9) * 0.12 * w;
                    torso.rotation.x += Math.sin(into * 0.6) * 0.05 * w;
                } else if (name === "creak") {
                    const reach = Math.max(0, Math.sin(Math.min(1, into / 4) * Math.PI));

                    torso.rotation.x -= 0.15 * reach * w;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.z += arm.side * 1.2 * reach * w;
                    }

                    jaw.rotation.x += 0.3 * reach * w;
                }
            }

            // Attacking: a slash over and across, a thrust, an overhead chop, a curse; a slam of
            // both arms, a sweep of one, roots called up
            if (attack) {
                const { u, hit, style } = attack;
                const wind = Math.min(1, u / hit);
                const after = u > hit ? Math.min(1, (u - hit) / (1 - hit)) : 0;
                const out = u < hit ? smooth(wind) : 1 - smooth(after);
                const up = u < hit ? smooth(wind) : 0;
                const down = u < hit ? 0 : 1 - smooth(after);
                const right = arms.right;

                if (style === "slam") {
                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-2.7 * up - 1.2 * down, 0, arm.side * 0.2);
                        arm.elbow.rotation.set(-0.4 * up, 0, 0);
                    }

                    torso.rotation.x = -0.2 * up + 0.45 * down;
                    jaw.rotation.x = 0.4 * out;
                } else if (style === "sweep") {
                    right.shoulder.rotation.set(-1.4 * out, 0, (u < hit ? 1.2 * smooth(wind) : 1.2 - 2.2 * smooth(after)) * 0.8);
                    right.elbow.rotation.x = -0.2 * out;
                    torso.rotation.y = u < hit ? 0.5 * smooth(wind) : 0.5 - 1.0 * smooth(after);
                } else if (style === "roots" || style === "curse") {
                    const reach = style === "curse" ? right : arms.left;

                    reach.shoulder.rotation.set(-1.5 * out, 0, reach.side * 0.3 * out);
                    reach.elbow.rotation.x = -0.1 * out;
                    torso.rotation.x = -0.1 * out;
                    neck.rotation.x = -0.2 * out;
                    jaw.rotation.x = 0.35 * out;
                } else if (style === "thrust") {
                    right.shoulder.rotation.set(-1.3 * (u < hit ? 0.6 * smooth(wind) : 0.6 + 0.4 * down), 0, 0.2);
                    right.elbow.rotation.x = u < hit ? -1.5 * smooth(wind) : -1.5 * (1 - smooth(Math.min(1, after * 3)));
                    torso.rotation.y = u < hit ? 0.35 * smooth(wind) : -0.2 * down;
                    body.position.z = H * 0.08 * down;
                } else if (style === "chop") {
                    right.shoulder.rotation.set(-2.9 * up - 0.7 * down, 0, 0.15);
                    right.elbow.rotation.set(-1.2 * up, 0, 0);
                    arms.left.shoulder.rotation.set(-2.6 * up - 0.6 * down, 0, -0.3 * out);
                    torso.rotation.x = -0.15 * up + 0.3 * down;
                } else {
                    const raise = u < hit ? smooth(wind) : 0;
                    const cut = u < hit ? 0 : Math.sin(Math.min(1, after * 1.5) * Math.PI * 0.5) * (1 - smooth(Math.max(0, after - 0.5) * 2));

                    right.shoulder.rotation.set(-2.5 * raise - 0.9 * cut, 0, 0.5 * raise - 0.3 * cut);
                    right.elbow.rotation.set(-1.0 * raise - 0.1 * cut, 0, 0);
                    torso.rotation.y = 0.45 * raise - 0.45 * cut;
                    arms.left.shoulder.rotation.x = -0.4 * out;
                }
            }

            // Struck: jolted back
            if (react) {
                const jolt = Math.sin(react.u * Math.PI);

                torso.rotation.x -= 0.35 * jolt;
                head.rotation.x = -0.3 * jolt;
            }

            // The lights in its sockets flickering (going out as it dies)
            glows.forEach((glow, k) => {
                glow.material.opacity = (0.72 + 0.28 * Math.sin(t * 6.3 + k * 1.7) * Math.sin(t * 2.3 + k)) * (dead ? 1 - smooth(Math.min(1, dead.u)) : 1);
            });

            // Dead: a skeleton collapsing in a heap; a treant falling back like a felled tree
            if (dead) {
                const fall = smooth(Math.min(1, dead.u * 1.3));

                if (treant) {
                    root.rotation.x = -(Math.PI / 2 - 0.08) * smooth(Math.min(1, dead.u));
                    root.rotation.z = dead.side * 0.15 * fall;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.x = -1.2 * fall;
                    }
                } else {
                    body.position.y = rest.bodyY - (legLength - H * 0.06) * fall;
                    torso.rotation.set(1.2 * fall, 0, dead.side * 0.6 * fall);
                    neck.rotation.set(0.4 * fall, 0, dead.side * 0.8 * fall);
                    jaw.rotation.x = 0.5 * fall;

                    for (const [name, leg] of Object.entries(legs)) {
                        leg.hip.rotation.set(-1.45 * fall, 0, (name === "left" ? -1 : 1) * 0.5 * fall);
                        leg.knee.rotation.x = 0.3 * fall;
                    }

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-0.3 * fall, 0, arm.side * 1.1 * fall);
                        arm.elbow.rotation.x = -0.2 * fall;
                    }
                }
            }

            // Its cape hanging from its shoulders, streaming back as it goes, kept out of its legs
            // (out of view, left as it is: it goes on from there when it's seen again)
            if (cloth && seen) {
                object.updateWorldMatrix(false, true);
                inverse.copy(object.matrixWorld).invert();

                const wind = [Math.sin(t * 1.7) * 0.4, 0, -speed * 3.5 - 0.4 - Math.sin(t * 1.1) * 0.35];
                const spheres = blocks.map(([bone, at, radius]) => [...inObject(bone, at), radius]);

                cloth.step(dt, pins.map((pin) => inObject(chest, pin)), wind, spheres);
            }
        },
    };
}
