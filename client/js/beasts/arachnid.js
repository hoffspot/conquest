// A spider or a scorpion: a body of two parts sculpted in one piece (sculpt.js: a front part with
// a cluster of glowing eyes and its fangs, a big marked abdomen behind, or a scorpion's segments),
// and eight legs, each high-kneed, that walk in alternating fours; a scorpion also has two pincers
// and a segmented tail curled over its back with a sting.
//
// Each leg reaches for its own place on the ground, spread round the body like the spokes of a
// wheel (so no two cross, and none crosses the body), and bends to reach it (two bones: the thigh
// up and out to a high knee, the shin down to the foot, solved each moment). Walking, each foot
// stays planted as the body goes over it, then lifts and steps forward, the two sets of four in
// turn, a ripple from front to back within each.
//
// A spider bites or leaps on its prey, or spits a web; a scorpion snaps its pincers, grabs, or
// brings its sting over. Resting, it grooms its fangs with its forelegs, crouches low and still,
// twitches its legs in turn, or (a scorpion) rears in threat, pincers wide. It jerks when struck
// and curls its legs up when it dies.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { cone, ellipsoid, joint, limb, part, shade, skin } from "./shapes.js";

const smooth = (u) => u * u * (3 - 2 * u);

// Where each pair of legs' feet go (degrees round from straight ahead), how far out (a share of
// the creature's size), and each pair's length (a share of the longest)
const SPIDER = { angles: [38, 74, 106, 142], out: [1.08, 1.02, 1, 1.1], long: [1, 0.92, 0.88, 0.98] };
const SCORPION = { angles: [58, 82, 104, 128], out: [0.86, 0.84, 0.84, 0.88], long: [0.9, 0.94, 0.98, 1] };

// A leg's two bones bent to reach a point (in its hip's parent's frame): the hip turned towards it
// and the thigh raised, the knee bent back down, the knee always up
function reach(leg, [x, y, z]) {
    const dx = x - leg.hip.position.x;
    const dy = y - leg.hip.position.y;
    const dz = z - leg.hip.position.z;
    const across = Math.hypot(dx, dz);
    const [a, b] = [leg.upper, leg.lower];
    const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, Math.hypot(across, dy)));
    const toward = Math.atan2(dy, across);
    const atHip = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
    const atKnee = Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - d * d) / (2 * a * b))));

    leg.hip.rotation.set(0, Math.atan2(-dz, dx), toward + atHip);
    leg.knee.rotation.z = -(Math.PI - atKnee);
}

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

    // A point on the ground (in the creature's frame) in its body's, wherever the body is
    const frame = new THREE.Matrix4();
    const inverse = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const settle = () => {
        body.updateMatrix();
        torso.updateMatrix();
        frame.multiplyMatrices(body.matrix, torso.matrix);
        inverse.copy(frame).invert();
    };
    const toTorso = ([x, y, z]) => {
        point.set(x, y, z).applyMatrix4(inverse);

        return [point.x, point.y, point.z];
    };

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

    // Eight legs: each from the front part's edge, up and out to a high knee, then down to the
    // ground: a thigh and a shin, and a clawed foot
    const legs = [];
    const plan = scorpion ? SCORPION : SPIDER;
    const bodyY = size * (scorpion ? 0.4 : 0.55);
    const legSkin = scorpion ? shell : dark;
    const middle = size * 0.25;

    for (let k = 0; k < 8; k++) {
        const side = k < 4 ? -1 : 1;
        const pair = k % 4;
        const angle = (plan.angles[pair] * Math.PI) / 180;
        const hip = joint(torso, `leg-${k}`, [side * size * 0.24 * Math.sin(angle), -size * 0.04, middle + size * 0.3 * Math.cos(angle)]);
        const longest = size * (scorpion ? 0.95 : 1.4) * plan.long[pair];
        const upper = longest * (scorpion ? 0.42 : 0.4);
        const lower = longest - upper;

        hip.rotation.order = "YZX";
        part(hip, ellipsoid(size * 0.05, size * 0.045, size * 0.05, 6), legSkin, { shadow: false });
        part(hip, limb(upper, size * (scorpion ? 0.05 : 0.048), size * 0.036, 6), legSkin, { turn: [0, 0, Math.PI / 2] });

        const knee = joint(hip, "knee", [upper, 0, 0]);

        part(knee, ellipsoid(size * 0.042, size * 0.042, size * 0.042, 6), legSkin, { shadow: false });
        part(knee, limb(lower * 0.62, size * 0.036, size * 0.026, 6), legSkin, { turn: [0, 0, Math.PI / 2] });
        part(knee, limb(lower * 0.4, size * 0.024, size * 0.012, 5), legSkin, { at: [lower * 0.6, 0, 0], turn: [0, 0, Math.PI / 2] });

        // (Where its foot goes: round from the front part's middle, out on the ground)
        const out = size * plan.out[pair];
        const home = [side * out * Math.sin(angle), 0, middle + out * Math.cos(angle)];

        legs.push({ hip, knee, upper, lower, side, pair, home, set: (pair % 2) ^ (side > 0 ? 1 : 0) });
    }

    body.position.y = bodyY;
    settle();

    // (The legs reaching their places at rest, before the skin's bound)
    for (const leg of legs) {
        reach(leg, toTorso(leg.home));
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
            const cycle = size * (scorpion ? 0.7 : 0.85);
            const before = phase;

            phase = (phase + dt * (speed / cycle)) % 1;

            if (Math.floor(before * 2) !== Math.floor(phase * 2) && moving > 0.3) {
                onStep?.("legs", speed);
            }

            body.position.set(0, bodyY + Math.sin(t * 1.7) * size * 0.01, 0);
            body.rotation.set(0, 0, 0);
            fangs.rotation.x = Math.sin(t * 3) * 0.05;

            // Where each foot is: planted and passing back under the body as it goes on, then
            // lifted and stepped forward (half the time each), the two fours in turn
            const stride = cycle * 0.25 * moving;

            for (const leg of legs) {
                const p = (phase + leg.set * 0.5 + leg.pair * 0.06) % 1;
                const target = leg.target ?? (leg.target = [0, 0, 0]);

                target[0] = leg.home[0];
                target[1] = 0;
                target[2] = leg.home[2];

                if (p < 0.5) {
                    target[2] += stride * (1 - 4 * p);
                } else {
                    const v = (p - 0.5) / 0.5;

                    target[2] += stride * (2 * smooth(v) - 1);
                    target[1] += size * (scorpion ? 0.12 : 0.18) * Math.sin(Math.PI * v) * moving;
                }
            }

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
                        const lift = [leg.side * size * 0.14, bodyY + size * (0.02 + Math.sin(t * 8 + leg.side) * 0.05), size * 0.78];

                        leg.target.forEach((value, axis) => (leg.target[axis] = value + (lift[axis] - value) * w));
                    }

                    fangs.rotation.x += Math.sin(t * 8) * 0.25 * w;
                } else if (name === "crouch") {
                    body.position.y -= size * (scorpion ? 0.18 : 0.28) * w;
                } else if (name === "twitch") {
                    legs.forEach((leg, k) => {
                        leg.target[1] += size * 0.16 * Math.max(0, Math.sin(t * 3 - k * 0.8)) ** 8 * w;
                    });
                } else if (name === "raise" && tail) {
                    body.rotation.x -= 0.25 * w;
                    body.position.y += size * 0.08 * w;
                    tail.rotation.x += 0.4 * w;

                    for (const claw of claws) {
                        claw.arm.rotation.y += claw.side * 0.6 * w;
                        claw.arm.rotation.x -= 0.4 * w;
                        claw.pincer.rotation.y = -claw.side * 0.7 * w;
                    }
                }
            }

            // Attacking: a lunge and a bite, a leap (its legs carried with it), a web spat (a
            // spider); pincers snapped, a grab, the sting brought over (a scorpion)
            if (attack) {
                const { u, hit, style } = attack;
                const out = u < hit ? smooth(u / hit) : 1 - smooth(Math.min(1, (u - hit) / (1 - hit)));

                if (style === "sting" && tail) {
                    tail.rotation.x = 0.6 + out * 0.9;
                    tailParts.forEach((each) => (each.rotation.x = 0.5 + out * 0.25));
                    body.position.z = size * 0.15 * out;
                } else if (style === "pinch" || style === "grab") {
                    for (const claw of claws) {
                        const reachOut = style === "grab" ? out : out * (claw.side > 0 ? 1 : 0.3);

                        claw.arm.rotation.y = claw.side * (0.5 - 0.45 * reachOut);
                        claw.arm.rotation.x = -0.25 * reachOut;
                        claw.pincer.rotation.y = -claw.side * (u < hit ? 0.7 : 0.05) * (style === "grab" ? out : 1);
                    }

                    body.position.z = size * (style === "grab" ? 0.3 : 0.15) * out;
                } else if (style === "leap") {
                    const up = size * 0.5 * Math.sin(Math.min(1, u / hit) * Math.PI) * (u < hit ? 1 : 0);

                    body.position.z = size * 1.1 * out;
                    body.position.y += up;
                    fangs.rotation.x = 0.6 * out;

                    for (const leg of legs) {
                        leg.target[2] += body.position.z;
                        leg.target[1] += up * 0.7;
                    }
                } else if (style === "web") {
                    body.rotation.x = 0.35 * out;
                    body.position.z = -size * 0.1 * out;
                } else {
                    body.position.z = size * 0.3 * out;
                    body.rotation.x = 0.25 * out;
                    fangs.rotation.x = 0.6 * out;
                }
            } else {
                body.position.z = 0;
            }

            if (react) {
                body.position.y += Math.sin(react.u * Math.PI) * size * 0.12;
            }

            // Dead: the body sunk, the legs curled up under and over it
            if (dead) {
                const curl = smooth(Math.min(1, dead.u));

                body.position.y = bodyY - (bodyY - size * 0.18) * curl;

                for (const leg of legs) {
                    const tuck = [leg.home[0] * 0.3, size * 0.55, middle + (leg.home[2] - middle) * 0.35];

                    leg.target.forEach((value, axis) => (leg.target[axis] = value + (tuck[axis] - value) * curl));
                }
            }

            // Each leg bent to reach its foot's place, wherever the body's gone
            settle();

            for (const leg of legs) {
                reach(leg, toTorso(leg.target));
            }
        },
    };
}
