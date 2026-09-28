// A spider or a scorpion: a body of two parts sculpted in one piece (sculpt.js: a front part with
// a cluster of glowing eyes and its fangs, a big marked abdomen behind, or a scorpion's segments),
// and eight legs, each high-kneed, that walk in alternating fours; a scorpion also has two pincers
// and a segmented tail curled over its back with a sting.
//
// A spider bites or leaps on its prey, or spits a web; a scorpion snaps its pincers, grabs, or
// brings its sting over. Resting, it grooms its fangs with its forelegs, crouches low and still,
// twitches its legs in turn, or (a scorpion) rears in threat, pincers wide. It jerks when struck
// and curls its legs up when it dies.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { cone, ellipsoid, joint, limb, part, shade, skin } from "./shapes.js";

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

/** Build a spider or scorpion from its look ({ size, colours, scorpion }). */
export function arachnid(look, random, key = null) {
    const size = look.size;
    const colours = look.colours;
    const scorpion = Boolean(look.scorpion);
    const shellColour = new THREE.Color(colours.shell);
    const markColour = colours.marks ?? shade(colours.shell, 0.35).getHex();
    const sculpt = new Sculpt({ blend: size * 0.08, grain: scorpion ? "stone" : "fur", grainSize: size * (scorpion ? 0.12 : 0.03), countershade: 0.08 });
    const material = new THREE.MeshStandardMaterial({ roughness: scorpion ? 0.4 : 0.75, metalness: scorpion ? 0.12 : 0 });
    const shell = skin(colours.shell, { roughness: scorpion ? 0.4 : 0.8, metalness: scorpion ? 0.1 : 0, flat: scorpion });
    const dark = skin(colours.dark ?? shade(colours.shell, -0.5).getHex(), { roughness: 0.6 });
    const eyes = skin(colours.eyes ?? 0xd02020, { roughness: 0.1, glow: colours.eyes ?? 0xd02020, glowing: 1.8 });

    const object = new THREE.Group();
    const body = joint(object, "body", [0, size * 0.55, 0]);
    const torso = joint(body, "torso");

    // The front part; the abdomen behind (a spider's great round one, marked; a scorpion's segments)
    sculpt.add(torso, { ellipsoid: [size * 0.34, size * 0.22, size * 0.38] }, shellColour, { at: [0, 0, size * 0.25] });

    const abdomen = joint(torso, "abdomen", [0, size * 0.08, -size * 0.2]);

    if (scorpion) {
        for (let k = 0; k < 4; k++) {
            sculpt.add(abdomen, { ellipsoid: [size * (0.36 - k * 0.03), size * 0.15, size * 0.14] }, shellColour, { at: [0, 0, -k * size * 0.2], blend: size * 0.03 });
        }
    } else {
        sculpt.add(torso, { ellipsoid: [size * 0.06, size * 0.06, size * 0.1] }, shellColour, { at: [0, size * 0.04, -size * 0.14], blend: size * 0.03 });
        sculpt.add(abdomen, { ellipsoid: [size * 0.5, size * 0.42, size * 0.58] }, shellColour, { at: [0, size * 0.1, -size * 0.45], blend: size * 0.04, group: 1 });
        sculpt.paint(abdomen, [size * 0.12, size * 0.06, size * 0.34], markColour, { at: [0, size * 0.5, -size * 0.42], soft: size * 0.04, strength: 0.95 });

        for (const side of [-1, 1]) {
            sculpt.paint(abdomen, [size * 0.08, size * 0.08, size * 0.08], markColour, { at: [side * size * 0.2, size * 0.42, -size * 0.25], soft: size * 0.03, strength: 0.9 });
            sculpt.paint(abdomen, [size * 0.07, size * 0.07, size * 0.07], markColour, { at: [side * size * 0.24, size * 0.36, -size * 0.6], soft: size * 0.03, strength: 0.9 });
        }
    }

    for (let k = 0; k < 8; k++) {
        const side = k % 2 ? 1 : -1;
        const row = Math.floor(k / 2);

        part(torso, ellipsoid(size * (row === 0 ? 0.05 : 0.035), size * (row === 0 ? 0.05 : 0.035), size * 0.03, 6), eyes, { at: [side * size * (0.05 + row * 0.05), size * (0.2 - row * 0.02), size * 0.58 - row * size * 0.05], shadow: false });
    }

    const fangs = joint(torso, "fangs", [0, -size * 0.06, size * 0.6]);

    for (const side of [-1, 1]) {
        part(fangs, ellipsoid(size * 0.06, size * 0.08, size * 0.06, 8), shell, { at: [side * size * 0.07, 0, 0] });
        part(fangs, cone(size * 0.16, size * 0.035, 5), dark, { at: [side * size * 0.07, -size * 0.04, size * 0.02], turn: [Math.PI * 0.85, 0, 0] });
    }

    // Eight legs: each up and out from the body, then down to the ground
    const legs = [];

    for (let k = 0; k < 8; k++) {
        const side = k < 4 ? -1 : 1;
        const pair = k % 4;
        const hip = joint(torso, `leg-${k}`, [side * size * 0.26, 0, size * (0.4 - pair * 0.16)]);
        const spread = (pair - 1.5) * 0.45;

        hip.rotation.set(0, side * (Math.PI / 2) - side * spread, 0);

        const thigh = joint(hip, "thigh");
        const rise = scorpion ? 0.45 : 0.9;
        const upper = size * (scorpion ? 0.34 : 0.55);

        part(thigh, limb(upper, size * 0.055, size * 0.04, 6), scorpion ? shell : dark, { turn: [0, 0, Math.PI / 2 + rise] });

        const knee = joint(thigh, "knee", [Math.cos(rise) * upper, Math.sin(rise) * upper, 0]);

        part(knee, ellipsoid(size * 0.05, size * 0.05, size * 0.05, 6), scorpion ? shell : dark, { shadow: false });
        part(knee, limb(size * (scorpion ? 0.52 : 0.78), size * 0.04, size * 0.018, 6), scorpion ? shell : dark, { turn: [0, 0, scorpion ? 0.6 : 0.35] });
        legs.push({ hip, thigh, knee, side, pair, set: (pair % 2) ^ (side > 0 ? 1 : 0) });
    }

    // A scorpion's pincers and tail
    const claws = [];
    let tail = null;
    const tailParts = [];

    if (scorpion) {
        for (const side of [-1, 1]) {
            const arm = joint(torso, `claw-${side}`, [side * size * 0.25, 0, size * 0.55]);

            arm.rotation.set(0, side * 0.5, 0);
            part(arm, limb(size * 0.45, size * 0.06, size * 0.05, 6), shell, { turn: [-Math.PI / 2, 0, 0] });

            const hand = joint(arm, "hand", [0, 0, size * 0.45]);

            hand.rotation.y = -side * 0.9;
            part(hand, ellipsoid(size * 0.15, size * 0.09, size * 0.22, 10), shell, { at: [0, 0, size * 0.15] });

            const pincer = joint(hand, "pincer", [side * size * 0.04, 0, size * 0.32]);

            part(pincer, cone(size * 0.24, size * 0.05, 5), shell, { turn: [Math.PI / 2, 0, 0] });
            part(hand, cone(size * 0.24, size * 0.05, 5), shell, { at: [-side * size * 0.06, 0, size * 0.32], turn: [Math.PI / 2, 0, 0] });
            claws.push({ arm, hand, pincer, side });
        }

        tail = joint(abdomen, "tail", [0, size * 0.05, -size * 0.7]);
        let from = tail;

        for (let k = 0; k < 5; k++) {
            part(from, ellipsoid(size * 0.1, size * 0.1, size * 0.13, 8), shell, { at: [0, 0, -size * 0.1] });

            const next = joint(from, `sting-${k}`, [0, 0, -size * 0.2]);

            next.rotation.x = 0.5;
            tailParts.push(from);
            from = next;
        }

        part(from, ellipsoid(size * 0.11, size * 0.11, size * 0.16, 8), skin(markColour, { roughness: 0.4 }), { at: [0, 0, -size * 0.1] });
        part(from, cone(size * 0.18, size * 0.04, 5), dark, { at: [0, -size * 0.05, -size * 0.2], turn: [-2.4, 0, 0] });
        tail.rotation.x = 0.6;
    }

    sculpt.build(object, material, key);

    let phase = random();

    return {
        object,
        height: size * (scorpion ? 1.4 : 1.1),
        length: size * 2,
        joints: { torso, head: torso, jaw: fangs, mouth: fangs, body },
        materials: { body: material },
        attacks: scorpion ? ["pinch", "grab", "sting"] : ["bite", "leap", "web"],
        rests: scorpion ? ["crouch", "twitch", "raise"] : ["groom", "crouch", "twitch"],

        pose({ dt, t, speed, attack, react, dead, rest, onStep }) {
            const moving = Math.min(1, speed / 0.3);
            const before = phase;

            phase = (phase + dt * (speed / (size * 1.3))) % 1;

            if (Math.floor(before * 2) !== Math.floor(phase * 2) && moving > 0.3) {
                onStep?.("legs", speed);
            }

            // Walking in alternating fours: each leg swinging and lifting in turn
            for (const leg of legs) {
                const p = (phase + leg.set * 0.5) % 1;

                leg.thigh.rotation.set(0, Math.cos(p * TAU) * 0.35 * moving, -leg.side * Math.max(0, -Math.sin(p * TAU)) * 0.35 * moving);
                leg.knee.rotation.z = 0;
            }

            body.position.set(0, size * 0.55 + Math.sin(t * 1.7) * size * 0.01, 0);
            body.rotation.set(0, 0, 0);
            fangs.rotation.x = Math.sin(t * 3) * 0.05;

            if (tail) {
                tail.rotation.x = 0.6 + Math.sin(t * 1.3) * 0.08;
                tailParts.forEach((each) => (each.rotation.x = 0.5));

                for (const claw of claws) {
                    claw.arm.rotation.set(0, claw.side * 0.5, 0);
                    claw.pincer.rotation.y = -claw.side * (0.2 + Math.max(0, Math.sin(t * 2 + claw.side)) * 0.25);
                }
            }

            // Resting: grooming its fangs with its forelegs, crouched low, twitching, or rearing
            // in threat
            if (rest) {
                const { name, w } = rest;

                if (name === "groom") {
                    for (const leg of legs.filter((each) => each.pair === 0)) {
                        leg.thigh.rotation.z += -leg.side * (0.9 + Math.sin(t * 8 + leg.side) * 0.25) * w;
                        leg.thigh.rotation.y += leg.side * 0.6 * w;
                    }

                    fangs.rotation.x += Math.sin(t * 8) * 0.25 * w;
                } else if (name === "crouch") {
                    body.position.y -= size * 0.25 * w;

                    for (const leg of legs) {
                        leg.thigh.rotation.z += leg.side * 0.25 * w;
                    }
                } else if (name === "twitch") {
                    legs.forEach((leg, k) => {
                        leg.thigh.rotation.z -= leg.side * Math.max(0, Math.sin(t * 3 - k * 0.8)) ** 8 * 0.5 * w;
                    });
                } else if (name === "raise" && tail) {
                    body.rotation.x -= 0.25 * w;
                    tail.rotation.x += 0.4 * w;

                    for (const claw of claws) {
                        claw.arm.rotation.y += claw.side * 0.6 * w;
                        claw.arm.rotation.x -= 0.4 * w;
                        claw.pincer.rotation.y = -claw.side * 0.7 * w;
                    }
                }
            }

            // Attacking: a lunge and a bite, a leap, a web spat (a spider); pincers snapped, a grab,
            // the sting brought over (a scorpion)
            if (attack) {
                const { u, hit, style } = attack;
                const out = u < hit ? smooth(u / hit) : 1 - smooth(Math.min(1, (u - hit) / (1 - hit)));

                if (style === "sting" && tail) {
                    tail.rotation.x = 0.6 + out * 0.9;
                    tailParts.forEach((each) => (each.rotation.x = 0.5 + out * 0.25));
                    body.position.z = size * 0.15 * out;
                } else if (style === "pinch" || style === "grab") {
                    for (const claw of claws) {
                        const reach = style === "grab" ? out : out * (claw.side > 0 ? 1 : 0.3);

                        claw.arm.rotation.y = claw.side * (0.5 - 0.45 * reach);
                        claw.arm.rotation.x = -0.25 * reach;
                        claw.pincer.rotation.y = -claw.side * (u < hit ? 0.7 : 0.05) * (style === "grab" ? out : 1);
                    }

                    body.position.z = size * (style === "grab" ? 0.3 : 0.15) * out;
                } else if (style === "leap") {
                    body.position.z = size * 1.1 * out;
                    body.position.y += size * 0.5 * Math.sin(Math.min(1, u / hit) * Math.PI) * (u < hit ? 1 : 0);
                    fangs.rotation.x = 0.6 * out;
                } else if (style === "web") {
                    body.rotation.x = 0.35 * out;
                    body.position.z = -size * 0.1 * out;
                } else {
                    body.position.z = size * 0.35 * out;
                    body.rotation.x = 0.25 * out;
                    fangs.rotation.x = 0.6 * out;
                }
            } else {
                body.position.z = 0;
            }

            if (react) {
                body.position.y += Math.sin(react.u * Math.PI) * size * 0.12;
            }

            // Dead: the legs curled up under it, the body sunk
            if (dead) {
                const curl = smooth(Math.min(1, dead.u));

                for (const leg of legs) {
                    leg.thigh.rotation.z = leg.side * 0.8 * curl;
                    leg.knee.rotation.z = 1.4 * curl;
                }

                body.position.y = size * (0.55 - 0.35 * curl);
            }
        },
    };
}
