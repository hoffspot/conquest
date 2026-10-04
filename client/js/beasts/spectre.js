// The restless dead that never lay down (the ruins' own, and the ruined castles': core/places.js):
// a ghost, the pale shade of one who lived there long ago, see-through and faintly aglow, a
// hooded shroud round a face worn to the bone (beasts/bones.js: its skull, the lights deep in its
// sockets, its jaw), the bones of its arms dim through its sleeves; and a wraith, darker and
// greater, nothing under its deep cowl but two cold lights, bony claws out of its sleeves, its
// black robe torn to rags at the hem. Neither has legs: below the waist each is its shroud,
// thinning (a ghost's) or flaring (a wraith's) into tatters, sculpted in one piece with the rest
// of it (sculpt.js), so the whole of it is one thing to draw.
//
// Each floats a hand above the ground, bobbing, and glides, leaning into it, its tatters streaming
// back the faster it goes and stirring as it hangs. A ghost reaches out to touch with the grave's
// cold, claws, or throws back its head and wails; a wraith rakes, claws, or holds its hand out to
// draw the life out of whoever it's after. Resting, a ghost drifts, mourns (head bowed, hands to
// its face) or fades almost away; a wraith hovers, looms (rising tall, arms spread) or turns its
// head slowly round. Struck, it wavers; dying, a ghost sinks and fades to nothing, and a wraith
// collapses into its empty robe, its lights going out.

import * as THREE from "three";
import { arm as armBones, skull } from "./bones.js";
import { Sculpt } from "./sculpt.js";
import { ellipsoid, glowSpot, joint, part, skin } from "./shapes.js";

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

/**
 * Build a spectre from its look ({ kind: "ghost" or "wraith", height (m), colours: { shroud,
 * glow, bone, eyes } }): { object, height, length, joints, materials, pose(state) }. `key` shares
 * its body with every other built from the same look.
 */
export function spectre(look, random, key = null) {
    const H = look.height;
    const s = H / 1.8;
    const wraith = look.kind === "wraith";
    const colours = look.colours;

    // Its shroud: a ghost's pale, half see-through and faintly aglow; a wraith's black and dull
    const shroud = new THREE.Color(colours.shroud);
    const material = new THREE.MeshStandardMaterial({
        roughness: wraith ? 0.95 : 0.55,
        transparent: !wraith,
        opacity: wraith ? 1 : 0.55,
        depthWrite: wraith,
        emissive: new THREE.Color(colours.glow),
        emissiveIntensity: wraith ? 0.06 : 0.5,
    });
    const sculpt = new Sculpt({ blend: H * 0.045, grain: wraith ? "fur" : "slick", grainSize: H * 0.012, countershade: 0.04 });
    const bone = skin(colours.bone, wraith ? { roughness: 0.75 } : { roughness: 0.5, clear: 0.5, glow: colours.glow, glowing: 0.2 });
    const eyes = skin(colours.eyes, { glow: colours.eyes, glowing: 2.6 });
    const dark = skin(0x050407, { roughness: 1 });

    // Proportions: its waist where a body's hips would be (a ghost's higher: it floats clear of
    // the ground); the spine to the shoulders, the neck, the head; below the waist, its shroud
    // (a ghost's thinning to a wisp, a wraith's flaring to its hem) and the tatters it ends in
    const spine = H * 0.3;
    const neckLength = 0.11 * s;
    const shoulderWidth = H * 0.11;
    const upperArm = H * 0.17;
    const foreArm = H * 0.15;
    const skirtLength = (wraith ? 0.62 : 0.5) * s;
    const hem = (wraith ? 0.24 : 0.06) * s;
    const tatterCount = wraith ? 12 : 5;

    const object = new THREE.Group();
    const root = joint(object, "root");
    const body = joint(root, "body", [0, H * (wraith ? 0.5 : 0.57), 0]);
    const skirt = joint(body, "skirt");
    const torso = joint(body, "torso");
    const chest = joint(torso, "chest", [0, spine * 0.55, 0]);
    const neck = joint(chest, "neck", [0, spine * 0.45, 0]);
    const head = joint(neck, "head", [0, neckLength, 0]);

    // The shroud: hips, belly and chest, a cowl over the shoulders; below, the skirt, and its
    // tatters (each two joints, to curl), hanging from its hem
    sculpt.add(body, { ellipsoid: [0.16 * s, 0.13 * s, 0.12 * s] }, shroud, { at: [0, 0.02 * s, 0] });
    sculpt.add(torso, { ellipsoid: [0.16 * s, 0.18 * s, 0.115 * s] }, shroud, { at: [0, 0.15 * s, 0] });
    sculpt.add(chest, { ellipsoid: [0.185 * s, 0.22 * s, 0.12 * s] }, shroud, { at: [0, 0.08 * s, -0.01 * s] });
    sculpt.add(chest, { ellipsoid: [0.2 * s, 0.07 * s, 0.13 * s] }, shroud, { at: [0, 0.2 * s, -0.02 * s] });
    sculpt.add(skirt, { limb: [skirtLength, 0.155 * s, hem + 0.03 * s] }, shroud, { at: [0, 0.04 * s, 0] });

    const tatters = [];

    // (Round its hem, splayed out a little, each as long as it's torn)
    for (let k = 0; k < tatterCount; k++) {
        const round = (k / tatterCount) * TAU + (random() - 0.5) * 0.4;
        const long = (wraith ? 0.14 + random() * 0.26 : 0.2 + random() * 0.14) * s;
        const width = (wraith ? 0.042 : 0.045) * s;
        const tatter = joint(skirt, `tatter-${k}`, [Math.sin(round) * (hem + 0.01 * s), 0.05 * s - skirtLength, Math.cos(round) * (hem + 0.01 * s)]);
        const tip = joint(tatter, "tip", [0, -long * 0.5, 0]);

        sculpt.add(tatter, { limb: [long * 0.55, width, width * 0.8] }, shroud, { blend: H * 0.02 });
        sculpt.add(tip, { limb: [long * 0.5, width * 0.8, width * 0.6] }, shroud, { blend: H * 0.015 });
        tatters.push({ tatter, tip, phase: random() * TAU, round, splay: wraith ? 0.25 : 0.12 });
    }

    // (Darker and dirtier towards the hem; a ghost's paler about its face)
    sculpt.paint(skirt, [hem + 0.1 * s, 0.3 * s, hem + 0.1 * s], shroud.clone().multiplyScalar(wraith ? 0.6 : 0.8), { at: [0, -skirtLength, 0], soft: 0.15 * s, strength: 0.8 });

    // The hood: its back over the skull, its sides either side of the face and a brow over it,
    // falling onto the shoulders; a wraith's deeper, drawn forward round the dark where its face
    // should be
    const deep = wraith ? 0.03 * s : 0;

    sculpt.add(head, { ellipsoid: [0.105 * s, 0.15 * s, 0.105 * s] }, shroud, { at: [0, 0.04 * s, -0.06 * s] });
    sculpt.add(head, { ellipsoid: [0.1 * s, 0.065 * s, 0.11 * s] }, shroud, { at: [0, 0.14 * s, -0.03 * s] });

    for (const side of [-1, 1]) {
        sculpt.add(head, { ellipsoid: [0.035 * s, 0.11 * s, 0.065 * s] }, shroud, { at: [side * 0.082 * s, 0.045 * s, 0.035 * s + deep], blend: H * 0.012 });
    }

    sculpt.add(head, { ellipsoid: [0.085 * s, 0.035 * s, 0.06 * s] }, shroud, { at: [0, 0.14 * s, 0.035 * s + deep], blend: H * 0.012 });

    // Arms: sleeves hanging from the shoulders, wider at the cuff; the bones of the arm and hand
    // within (bones.js), the hand reaching out of the cuff. (Sculpted held out from the body, so
    // each sleeve's its own and goes with its arm, not webbed to the shroud's side)
    const arms = {};

    for (const side of [-1, 1]) {
        const name = side < 0 ? "left" : "right";
        const shoulder = joint(chest, `shoulder-${name}`, [side * shoulderWidth, spine * 0.42, 0]);
        const elbow = joint(shoulder, "elbow", [0, -upperArm, 0]);
        const hand = joint(elbow, "hand", [0, -foreArm, 0]);

        shoulder.rotation.z = side * 0.6;
        sculpt.add(shoulder, { limb: [upperArm, 0.058 * s, 0.062 * s] }, shroud, { blend: H * 0.015 });
        sculpt.add(elbow, { limb: [foreArm * 0.92, 0.062 * s, (wraith ? 0.1 : 0.085) * s] }, shroud, { blend: H * 0.02 });
        armBones({ shoulder, elbow, hand }, s, { bone, upperArm, foreArm, side });
        arms[name] = { shoulder, elbow, hand, side };
    }

    // The face: a ghost's skull, the lights in its sockets; a wraith's nothing, a dark with two
    // cold lights in it
    let jaw = head;
    let glows = [];

    if (wraith) {
        part(head, ellipsoid(0.07 * s, 0.085 * s, 0.045 * s, 10), dark, { at: [0, 0.055 * s, 0.035 * s], shadow: false });

        for (const side of [-1, 1]) {
            part(head, ellipsoid(0.011 * s, 0.007 * s, 0.006 * s, 6), eyes, { at: [side * 0.026 * s, 0.065 * s, 0.078 * s], shadow: false });

            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpot(), color: colours.eyes, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));

            glow.position.set(side * 0.026 * s, 0.065 * s, 0.085 * s);
            glow.scale.setScalar(0.07 * s);
            head.add(glow);
            glows.push(glow);
        }
    } else {
        ({ jaw, glows } = skull(head, s, { bone, teeth: bone, dark: bone, eyes, light: colours.eyes }));
    }

    // (A ghost's own faint light round it, seen in the dark)
    let halo = null;

    if (!wraith) {
        halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpot(), color: colours.glow, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.position.set(0, 0.05 * s, 0.05 * s);
        halo.scale.set(H * 0.75, H * 1.05, 1);
        chest.add(halo);
    }

    // (A ghost, light passing through it, casts no shadow)
    sculpt.build(object, material, key).castShadow = wraith;

    const rest = { bodyY: body.position.y };
    let looks = null;
    const phase = random() * TAU;

    // Everything it's drawn with, once it's folded (beast.js), as it was: a ghost faded all
    // together, a wraith's lights put out
    const lookOf = () => {
        const found = new Map();

        object.traverse((node) => {
            if (node.material && !found.has(node.material)) {
                found.set(node.material, { material: node.material, opacity: node.material.opacity, colour: node.material.color.clone(), sprite: node.isSprite });

                if (!wraith) {
                    node.material.transparent = true;
                    node.material.depthWrite = false;
                }
            }
        });

        return [...found.values()];
    };

    return {
        object,
        height: H * 0.97,
        length: H * 0.3,
        joints: { torso: chest, head, jaw, mouth: wraith ? arms.right.hand : jaw, left: arms.left.hand, body },
        materials: { body: material },
        attacks: wraith ? ["rake", "claw", "drain"] : ["reach", "claw", "wail"],
        rests: wraith ? ["hover", "loom", "turn"] : ["drift", "mourn", "fade"],

        pose({ t, speed, attack, react, dead, rest: resting }) {
            looks ??= lookOf();

            const moving = Math.min(1, speed / 0.6);
            let fade = 1;
            let flare = 0;

            // Floating: bobbing, leaning into its glide, its shroud and tatters trailing back
            // and stirring
            root.position.set(0, 0, 0);
            root.rotation.set(0, 0, 0);
            body.position.set(0, rest.bodyY + Math.sin(t * 1.4 + phase) * H * 0.02, 0);
            body.rotation.set(0, 0, 0);
            skirt.rotation.set(0.32 * moving + Math.sin(t * 1.1 + phase) * 0.05, 0, Math.sin(t * 0.9) * 0.05);
            skirt.scale.set(1, 1, 1);
            torso.rotation.set(0.2 * moving, 0, Math.sin(t * 0.7 + phase) * 0.04);
            neck.rotation.set(0.08 - 0.1 * moving, Math.sin(t * 0.37 + phase) * (wraith ? 0.15 : 0.3) * (1 - moving), 0);
            head.rotation.set(0, 0, 0);
            jaw.rotation.x = wraith ? 0 : Math.max(0, Math.sin(t * 0.9 + phase)) * 0.08;

            for (const { tatter, tip, phase: own, round, splay } of tatters) {
                tatter.rotation.set(0.25 * moving - Math.cos(round) * splay + Math.sin(t * 2.1 + own) * 0.12, 0, Math.sin(round) * splay + Math.sin(t * 1.6 + own * 1.3) * 0.12);
                tip.rotation.set(0.3 * moving + Math.sin(t * 2.7 + own * 0.7) * 0.18, 0, Math.sin(t * 2.2 + own) * 0.1);
            }

            // Its arms: a ghost's half raised before it, reaching; a wraith's hanging, its claws
            // ready; both trailing as it goes
            for (const arm of Object.values(arms)) {
                const lift = wraith ? -0.12 : -0.4 + Math.sin(t * 0.8 + arm.side) * 0.08;

                arm.shoulder.rotation.set(lift * (1 - moving) + 0.35 * moving, 0, arm.side * (wraith ? 0.12 : 0.15));
                arm.elbow.rotation.set(wraith ? -0.3 : -0.4, 0, 0);
            }

            // Resting its way
            if (resting && !dead) {
                const { name, w, t: into } = resting;

                if (name === "drift") {
                    body.position.x = Math.sin(into * 0.5) * H * 0.07 * w;
                    root.rotation.y = Math.sin(into * 0.3) * 0.5 * w;
                } else if (name === "mourn") {
                    neck.rotation.x += 0.55 * w;
                    torso.rotation.x += 0.15 * w;
                    torso.rotation.z += Math.sin(into * 9) * 0.015 * w;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-1.25 * w + arm.shoulder.rotation.x * (1 - w), 0, arm.side * (0.15 - 0.45 * w));
                        arm.elbow.rotation.x = -0.4 - 1.5 * w;
                    }
                } else if (name === "fade") {
                    fade = 1 - 0.7 * w * (0.5 + 0.5 * Math.sin(into * 0.8 - Math.PI / 2));
                } else if (name === "hover") {
                    body.position.y += H * 0.05 * w;
                    neck.rotation.x += 0.25 * w;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.x *= 1 - w;
                        arm.elbow.rotation.x = -0.3 + 0.25 * w;
                    }
                } else if (name === "loom") {
                    const rise = Math.max(0, Math.sin(Math.min(1, into / 5) * Math.PI));

                    body.position.y += H * 0.08 * rise * w;
                    torso.rotation.x -= 0.12 * rise * w;
                    neck.rotation.x -= 0.15 * rise * w;
                    flare = 0.5 * rise * w;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-0.5 * rise * w, 0, arm.side * (0.12 + 0.85 * rise * w));
                    }
                } else if (name === "turn") {
                    neck.rotation.y = Math.sin(into * 0.5) * 0.9 * w;
                }
            }

            // Attacking: reaching out to touch, a claw over and down, a wail; a rake of both
            // claws, a hand held out to drain
            if (attack) {
                const { u, hit, style } = attack;
                const wind = Math.min(1, u / hit);
                const after = u > hit ? Math.min(1, (u - hit) / (1 - hit)) : 0;
                const out = u < hit ? smooth(wind) : 1 - smooth(after);
                const up = u < hit ? smooth(wind) : 0;
                const down = u < hit ? 0 : 1 - smooth(after);
                const right = arms.right;

                if (style === "reach") {
                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-1.45 * out, 0, arm.side * (0.15 - 0.12 * out));
                        arm.elbow.rotation.x = -0.4 + 0.3 * out;
                    }

                    torso.rotation.x += 0.2 * out;
                    neck.rotation.x -= 0.2 * out;
                    body.position.z = H * 0.1 * down;
                    jaw.rotation.x = 0.25 * out;
                } else if (style === "wail") {
                    neck.rotation.x = -0.55 * up + 0.3 * down;
                    jaw.rotation.x = 0.7 * out;
                    body.position.y += H * 0.05 * out;
                    flare = out;

                    for (const arm of Object.values(arms)) {
                        arm.shoulder.rotation.set(-0.45 * out, 0, arm.side * (0.15 + 1.0 * out));
                        arm.elbow.rotation.x = -0.4 + 0.3 * out;
                    }
                } else if (style === "rake") {
                    for (const arm of Object.values(arms)) {
                        const late = arm === right ? 0 : 0.3;
                        const a = u < hit ? smooth(Math.min(1, wind * (1 + late))) : 0;
                        const b = u < hit ? 0 : 1 - smooth(Math.min(1, after * (1 + late)));

                        arm.shoulder.rotation.set(-2.4 * a - 0.7 * b, 0, arm.side * (0.12 + 0.3 * a));
                        arm.elbow.rotation.x = -0.3 - 0.8 * a;
                    }

                    torso.rotation.x += -0.12 * up + 0.3 * down;
                    body.position.z = H * 0.08 * down;
                } else if (style === "drain") {
                    right.shoulder.rotation.set(-1.5 * out, 0, 0.1);
                    right.elbow.rotation.x = -0.08 * out - 0.3 * (1 - out);
                    arms.left.shoulder.rotation.set(0.3 * out, 0, -0.2);
                    torso.rotation.x -= 0.1 * out;
                    body.position.y += H * 0.06 * out;
                    flare = out;
                } else {
                    // (A claw: raised high and brought down across)
                    const raise = u < hit ? smooth(wind) : 0;
                    const cut = u < hit ? 0 : Math.sin(Math.min(1, after * 1.5) * Math.PI * 0.5) * (1 - smooth(Math.max(0, after - 0.5) * 2));

                    right.shoulder.rotation.set(-2.5 * raise - 0.9 * cut, 0, 0.5 * raise - 0.3 * cut);
                    right.elbow.rotation.set(-1.0 * raise - 0.1 * cut, 0, 0);
                    torso.rotation.y = 0.45 * raise - 0.45 * cut;
                }
            }

            // Struck: wavering back (a ghost flickering)
            if (react) {
                const jolt = Math.sin(react.u * Math.PI);

                torso.rotation.x -= 0.35 * jolt;
                neck.rotation.x -= 0.25 * jolt;
                body.position.z -= H * 0.05 * jolt;
                fade *= wraith ? 1 : 1 - 0.45 * jolt * (0.5 + 0.5 * Math.sin(react.u * 40));
            }

            // Dead: a ghost sinking and fading to nothing; a wraith collapsing into its empty robe
            let lit = 1;

            if (dead) {
                const fall = smooth(Math.min(1, dead.u));

                torso.rotation.set(0.6 * fall, 0, dead.side * 0.2 * fall);
                neck.rotation.set(0.5 * fall, 0, 0);
                lit = 1 - fall;

                for (const arm of Object.values(arms)) {
                    arm.shoulder.rotation.set(-0.3 * fall, 0, arm.side * (0.15 + 0.6 * fall));
                    arm.elbow.rotation.x = -0.2;
                }

                if (wraith) {
                    body.position.y = rest.bodyY - (rest.bodyY - H * 0.1) * fall;
                    skirt.scale.set(1 + 0.3 * fall, 1 - 0.8 * fall, 1 + 0.3 * fall);
                    torso.rotation.x = 1.1 * fall;
                } else {
                    body.position.y = rest.bodyY - H * 0.25 * fall;
                    fade *= 1 - fall;
                }
            }

            // Its look: a ghost faded as it is (and brighter as it wails), the lights in its
            // eyes flickering, and going out as it dies
            for (const { material: each, opacity, colour, sprite } of looks) {
                if (!wraith) {
                    each.opacity = Math.min(1, opacity * fade * (1 + 0.4 * flare));
                }

                if (sprite && glows.some((glow) => glow.material === each)) {
                    each.opacity = (0.72 + 0.28 * Math.sin(t * 6.3) * Math.sin(t * 2.3)) * (1 + flare) * lit * fade;
                } else if (each.isMeshBasicMaterial) {
                    each.color.copy(colour).multiplyScalar(lit * (1 + 0.5 * flare));
                }
            }

            if (halo) {
                halo.material.opacity = 0.16 * fade * (1 + flare) * lit;
            }

            object.visible = fade > 0.01;
        },
    };
}
