// Things that walk on two legs but aren't people: a skeleton (a skull with glowing points in its
// sockets and a jaw that chatters, a ribcage, a spine of knuckled vertebrae, a pelvis and long
// bones), the wight lord (a skeleton in blackened armour, crowned, in a tattered cloak, with a
// greatsword), and a treant (a trunk sculpted in one piece with its limbs, sculpt.js: a face in
// its bark, branches for arms with twigs for fingers, roots for feet, a crown of leaves; blighted,
// grey and fungus-grown).
//
// Each walks and runs (legs swinging, knees lifting, arms swinging against them). A skeleton
// slashes, thrusts or chops, and the wight lord lays a curse; resting, it slumps, rattles its jaw,
// or turns its skull right round. A treant slams both arms down or sweeps one across, or calls up
// roots; resting, it roots itself and stands still as a tree, sways, or stretches its limbs,
// creaking. Each jolts when struck and dies its own way: a skeleton collapsing in a heap, a
// treant falling like a felled tree.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { box, cone, ellipsoid, joint, limb, lump, membrane, part, ring, shade, skin } from "./shapes.js";

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

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

    // Proportions: legs half its height; a spine to the shoulders; the head on top
    const legLength = H * (treant ? 0.4 : 0.48);
    const thigh = legLength * 0.5;
    const shin = legLength * 0.5;
    const spine = H * (treant ? 0.42 : 0.3);
    const shoulderWidth = H * (treant ? 0.15 : 0.11);
    const hipWidth = H * (treant ? 0.1 : 0.055);
    const upperArm = H * (treant ? 0.24 : 0.17);
    const foreArm = H * (treant ? 0.24 : 0.15);
    const bone = H * 0.012;

    const object = new THREE.Group();
    const root = joint(object, "root");
    const body = joint(root, "body", [0, legLength, 0]);
    const torso = joint(body, "torso");
    const chest = joint(torso, "chest", [0, spine * 0.55, 0]);
    const neck = joint(chest, "neck", [0, spine * 0.45, 0]);
    const head = joint(neck, "head", [0, treant ? -spine * 0.25 : H * 0.03, 0]);
    let jaw = head;
    let crown = null;
    let cloak = null;

    if (treant) {
        // A trunk, broadening to the roots, with ridges down it; a face in it; a crown of leaves
        const leaves = skin(colours.leaves, { roughness: 0.85, flat: true });
        const leavesDark = skin(shade(colours.leaves, -0.25).getHex(), { roughness: 0.9, flat: true });
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

        for (let k = 0; k < (look.blight ? 22 : 34); k++) {
            const round = random() * TAU;
            const reach = H * (0.05 + random() * 0.18);

            part(crown, lump(H * [0.05, 0.075, 0.1][Math.floor(random() * 3)]), random() > 0.4 ? leaves : leavesDark, {
                at: [Math.sin(round) * reach, H * (random() * 0.2), Math.cos(round) * reach * 0.8 - H * 0.03],
                turn: [random() * 3, random() * 3, 0],
            });
        }

        for (let k = 0; k < 5; k++) {
            sculpt.add(crown, { limb: [H * (0.15 + random() * 0.1), H * 0.02, H * 0.008] }, bark, { turn: [Math.PI + (random() - 0.5) * 1.2, 0, (random() - 0.5) * 1.4], blend: H * 0.02 });
        }

        if (look.blight) {
            const fungus = skin(colours.fungus ?? 0x8a4a9a, { roughness: 0.6, glow: colours.fungus ?? 0x8a4a9a, glowing: 0.35 });

            for (let k = 0; k < 7; k++) {
                const round = Math.PI * (0.35 + random() * 1.3);

                part(torso, ellipsoid(H * 0.035, H * 0.012, H * 0.035, 7), fungus, { at: [Math.sin(round) * H * 0.15, spine * (0.15 + random() * 0.7), Math.cos(round) * H * 0.15], turn: [0, 0, Math.sin(round) * 0.3], shadow: false });
            }
        }
    } else {
        // Bones: a pelvis, a spine of vertebrae, a ribcage open at the front, collarbones
        part(body, ellipsoid(H * 0.075, H * 0.04, H * 0.045, 10), main);

        for (let k = 0; k < 6; k++) {
            part(torso, ellipsoid(H * 0.018, H * 0.012, H * 0.018, 6), main, { at: [0, (k + 0.5) * (spine * 0.55) / 6, -H * 0.015], shadow: false });
        }

        const gap = 0.7;

        for (let k = 0; k < 5; k++) {
            part(chest, ring(H * (0.07 - k * 0.004), bone * 0.7, TAU - gap, 16), main, { at: [0, spine * 0.4 - k * H * 0.026, 0], turn: [Math.PI / 2, 0, Math.PI / 2 + gap / 2], scale: [1, 0.75, 1] });
        }

        part(chest, box(H * 0.018, H * 0.11, H * 0.012), main, { at: [0, spine * 0.3, H * 0.052] });
        part(chest, limb(shoulderWidth * 2, bone, bone, 5), main, { at: [-shoulderWidth, spine * 0.43, H * 0.01], turn: [0, 0, Math.PI / 2] });
        part(neck, limb(H * 0.05, bone * 1.2, bone, 5), main, { at: [0, H * 0.05, 0] });

        // The skull: a cranium, cheekbones, dark sockets with a point of light in each, a jaw
        part(head, ellipsoid(H * 0.052, H * 0.06, H * 0.064, 12), main, { at: [0, H * 0.05, 0] });
        part(head, ellipsoid(H * 0.042, H * 0.03, H * 0.036, 10), main, { at: [0, H * 0.028, H * 0.032] });

        for (const side of [-1, 1]) {
            part(head, ellipsoid(H * 0.016, H * 0.015, H * 0.01, 8), dark, { at: [side * H * 0.02, H * 0.048, H * 0.058], shadow: false });
            part(head, ellipsoid(H * 0.006, H * 0.006, H * 0.004, 5), eyes, { at: [side * H * 0.02, H * 0.048, H * 0.064], shadow: false });
        }

        part(head, cone(H * 0.012, H * 0.008, 3), dark, { at: [0, H * 0.03, H * 0.064], turn: [Math.PI, 0, 0], shadow: false });

        for (let k = 0; k < 6; k++) {
            part(head, box(H * 0.006, H * 0.008, H * 0.004), main, { at: [(k - 2.5) * H * 0.008, H * 0.012, H * 0.06], shadow: false });
        }

        jaw = joint(head, "jaw", [0, H * 0.012, H * 0.01]);
        part(jaw, ellipsoid(H * 0.034, H * 0.011, H * 0.036, 8), main, { at: [0, -H * 0.006, H * 0.028] });

        // The wight lord's armour, crown and cloak
        if (look.armour) {
            part(chest, ellipsoid(H * 0.085, H * 0.09, H * 0.06, 12), metal, { at: [0, spine * 0.3, H * 0.012] });

            for (const side of [-1, 1]) {
                part(chest, ellipsoid(H * 0.045, H * 0.03, H * 0.045, 8), metal, { at: [side * shoulderWidth, spine * 0.45, 0] });
                part(chest, cone(H * 0.04, H * 0.012, 4), metal, { at: [side * shoulderWidth, spine * 0.5, 0], turn: [0, 0, -side * 0.4] });
            }

            part(body, ellipsoid(H * 0.085, H * 0.05, H * 0.055, 10), metal, { at: [0, -H * 0.02, 0] });
        }

        if (look.crown) {
            const gold = skin(colours.crown ?? 0x9a8440, { roughness: 0.35, metalness: 0.9 });

            part(head, ring(H * 0.05, H * 0.006, TAU, 16), gold, { at: [0, H * 0.085, 0], turn: [Math.PI / 2, 0, 0] });

            for (let k = 0; k < 7; k++) {
                const round = (k / 7) * TAU;

                part(head, cone(H * 0.03, H * 0.008, 4), gold, { at: [Math.sin(round) * H * 0.05, H * 0.088, Math.cos(round) * H * 0.05] });
            }
        }

        if (look.cloak) {
            const cloth = skin(colours.cloak, { roughness: 0.95, side: THREE.DoubleSide });
            const w = shoulderWidth * 1.25;
            const drop = spine * 0.95 + thigh;
            const points = [[-w, 0], [w, 0], [w * 1.2, -drop * 0.8]];

            for (let k = 6; k >= 0; k--) {
                points.push([-w * 1.2 + (k / 6) * w * 2.4, -drop * (k % 2 ? 0.88 : 1) - random() * drop * 0.12]);
            }

            points.push([-w * 1.2, -drop * 0.8]);
            cloak = joint(chest, "cloak", [0, spine * 0.45, -H * 0.05]);
            part(cloak, membrane(points), cloth, { turn: [-Math.PI / 2, 0, 0], shadow: false });
        }
    }

    // Arms and legs: shoulders and hips to elbows and knees to hands and feet
    const arms = {};
    const legs = {};

    for (const side of [-1, 1]) {
        const name = side < 0 ? "left" : "right";
        const shoulder = joint(chest, `shoulder-${name}`, [side * shoulderWidth, spine * (treant ? 0.3 : 0.42), 0]);

        shoulder.rotation.z = side * (treant ? 0.3 : 0.08);
        flesh(shoulder, { limb: [upperArm, treant ? H * 0.05 : bone, treant ? H * 0.035 : bone * 0.85] });

        const elbow = joint(shoulder, "elbow", [0, -upperArm, 0]);

        flesh(elbow, { limb: [foreArm, treant ? H * 0.035 : bone * 0.85, treant ? H * 0.022 : bone * 0.8] });

        const hand = joint(elbow, "hand", [0, -foreArm, 0]);

        if (treant) {
            for (let k = 0; k < 4; k++) {
                sculpt.add(hand, { limb: [H * 0.12, H * 0.014, H * 0.005] }, bark, { turn: [(k - 1.5) * 0.3, 0, (k - 1.5) * 0.35], blend: H * 0.012 });
            }

            part(elbow, lump(H * 0.05), skin(colours.leaves, { roughness: 0.85, flat: true }), { at: [side * H * 0.03, 0, 0] });
        } else {
            part(shoulder, ellipsoid(bone * 1.8, bone * 1.8, bone * 1.8, 6), main, { shadow: false });
            part(elbow, ellipsoid(bone * 1.5, bone * 1.5, bone * 1.5, 6), main, { shadow: false });
            part(hand, ellipsoid(H * 0.018, H * 0.025, H * 0.01, 6), main, { at: [0, -H * 0.015, 0] });

            for (let k = 0; k < 4; k++) {
                part(hand, limb(H * 0.035, bone * 0.4, bone * 0.3, 4), main, { at: [(k - 1.5) * H * 0.008, -H * 0.035, 0], shadow: false });
            }
        }

        arms[name] = { shoulder, elbow, hand, side };

        const hip = joint(body, `hip-${name}`, [side * hipWidth, -H * 0.02, 0]);

        flesh(hip, { limb: [thigh, treant ? H * 0.07 : bone * 1.2, treant ? H * 0.055 : bone] });

        const knee = joint(hip, "knee", [0, -thigh, 0]);

        flesh(knee, { limb: [shin, treant ? H * 0.055 : bone, treant ? H * 0.075 : bone * 0.9] });

        const foot = joint(knee, "foot", [0, -shin, 0]);

        if (treant) {
            for (let k = 0; k < 4; k++) {
                sculpt.add(foot, { limb: [H * 0.14, H * 0.035, H * 0.012] }, bark, { at: [0, H * 0.01, 0], turn: [Math.PI / 2 - 0.25, (k - 1.5) * 0.55, 0], blend: H * 0.02 });
            }
        } else {
            part(knee, ellipsoid(bone * 1.8, bone * 1.8, bone * 1.8, 6), main, { shadow: false });
            part(foot, ellipsoid(H * 0.022, H * 0.012, H * 0.05, 6), main, { at: [0, -H * 0.004, H * 0.025] });
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
    let phase = random();
    let lastSide = 0;

    return {
        object,
        height: H * 0.93,
        length: H * 0.3,
        joints: { torso: chest, head, jaw, mouth: arms.right.hand, left: arms.left.hand, body },
        materials: { body: main },
        attacks: treant ? ["slam", "sweep", "roots"] : ["slash", "thrust", "chop", "curse"],
        rests: treant ? ["root", "sway", "creak"] : ["slump", "rattle", "look"],

        pose({ dt, t, speed, run, attack, react, dead, rest: resting, onStep }) {
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

            if (cloak) {
                cloak.rotation.x = 0.1 + moving * (run ? 0.6 : 0.3) + Math.sin(t * 2.1) * 0.05;
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
        },
    };
}
