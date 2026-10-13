// A snake, sculpted in one piece (sculpt.js): a body of bones down its length that the skin's
// bound to, tapering to the tail, banded or zig-zagged along its back and pale beneath; a head
// with a jaw that opens on its fangs and a flickering tongue. Some are more than a snake: a hood
// spread beside the neck (a cobra's); a crown of spikes on the head (a basilisk's); a great head
// with fins, and a ridge of them down the back (a knucker's); a pair of legs to each piece of its
// length, rippling as it goes (a centipede's). A cobra rears up high, its hood spread.
//
// It slithers (a wave down its length, quicker the faster it goes), stands with its front raised
// in an S, and rests coiled up, tasting the air with its head raised high, or stretched out
// basking. It strikes (once, or twice quick), spits venom, jerks back when struck, and turns
// belly up when it dies.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { cone, ellipsoid, joint, limb, part, shade, skin } from "./shapes.js";

const smooth = (u) => u * u * (3 - 2 * u);

/**
 * Build a snake from its look ({ length, thickness, segments, banded, zigzag, colours }; and `hood`,
 * how wide a hood spreads beside its neck, as many times its body's width; `crest`, how many
 * spikes crown its head; `fins` on its head and down its back; `legs`, a pair to each piece of its
 * length; `head`, how much bigger its head is than a snake's; `rear`, how many times as high as a
 * snake's it holds its front up when it's still).
 */
export function serpent(look, random, key = null) {
    const { length, thickness } = look;
    const colours = look.colours;
    const hs = thickness * (look.head ?? 1);
    const rear = look.rear ?? 1;
    const count = look.segments ?? 16;
    const spacing = length / count;
    const scales = new THREE.Color(colours.scales);
    const bands = colours.bands ?? shade(colours.scales, -0.45).getHex();
    const belly = colours.belly ?? shade(colours.scales, 0.4).getHex();
    const sculpt = new Sculpt({ blend: thickness * 0.8, grain: "scales", grainSize: thickness * 0.5, countershade: 0.1 });
    const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
    const eyes = skin(colours.eyes ?? 0xd8b020, { roughness: 0.1, glow: colours.eyes ?? 0xd8b020, glowing: 0.5 });
    const ivory = skin(0xeee6d0, { roughness: 0.4 });
    const tongueSkin = skin(0xb0243a, { roughness: 0.5 });
    const mouthSkin = skin(0x5a1a22, { roughness: 0.6 });

    const object = new THREE.Group();
    const body = joint(object, "body");
    const beads = [];
    const legs = [];
    const finSkin = skin(colours.fins ?? bands, { roughness: 0.6, side: THREE.DoubleSide });
    const legSkin = skin(colours.legs ?? bands, { roughness: 0.5 });
    const crown = skin(colours.crown ?? 0xe8e0c8, { roughness: 0.4 });

    // Its length: a bone every so far along, each with its piece of body, tapering to the tail
    for (let k = 0; k < count; k++) {
        const taper = 1 - (k / count) ** 1.5 * 0.85;
        const radius = thickness * taper * (k < 2 ? 0.8 + k * 0.1 : 1);
        const bead = joint(body, `bead-${k}`, [0, thickness * 0.85, -(k + 0.5) * spacing]);

        bead.rotation.order = "YXZ";
        sculpt.add(bead, { ellipsoid: [radius, radius * 0.85, spacing * 0.72] }, scales);
        sculpt.paint(bead, [radius * 0.85, radius * 0.4, spacing * 0.7], belly, { at: [0, -radius * 0.7, 0], soft: radius * 0.35 });

        if (look.banded && k % 3 === 1) {
            sculpt.paint(bead, [radius * 1.2, radius * 1.1, spacing * 0.22], bands, { soft: radius * 0.2, strength: 0.9 });
        }

        if (look.zigzag) {
            sculpt.paint(bead, [radius * 0.3, radius * 0.3, spacing * 0.45], bands, { at: [(k % 2 ? 1 : -1) * radius * 0.25, radius * 0.75, 0], turn: [0, (k % 2 ? 0.6 : -0.6), 0], soft: radius * 0.12, strength: 0.95 });
        }

        // (A cobra's hood: spread wide and flat beside the neck, widest a little behind the head)
        if (look.hood && k >= 1 && k <= 4) {
            sculpt.add(bead, { ellipsoid: [radius * look.hood * [0, 0.75, 1, 0.85, 0.5][k], radius * 0.6, spacing * 0.9] }, scales, { at: [0, radius * 0.1, 0], blend: radius * 0.4 });
        }

        // (A ridge of fins down its back, smaller towards the tail)
        if (look.fins && k < count - 2) {
            part(bead, cone(radius * 0.9, radius * 0.22, 4), finSkin, { at: [0, radius * 0.75, 0], turn: [-0.7, 0, 0], shadow: false });
        }

        // (A centipede's legs, a pair to each piece of its length, each from a joint of its own to
        // ripple as it goes)
        if (look.legs && k >= 1 && k < count - 1) {
            for (const side of [-1, 1]) {
                const leg = joint(bead, `leg-${k}-${side}`, [side * radius * 0.75, -radius * 0.25, 0]);

                part(leg, limb(radius * 2.4, radius * 0.16, radius * 0.08, 5), legSkin, { turn: [0, 0, side * 1.15], shadow: false });
                legs.push({ leg, side, k });
            }
        }

        beads.push(bead);
    }

    // The head: a wedge, eyes, a jaw of its own that opens on its fangs, a tongue
    const head = joint(body, "head", [0, thickness * 0.85, 0]);

    head.rotation.order = "YXZ";
    sculpt.add(head, { ellipsoid: [hs * 1.25, hs * 0.7, hs * 1.8] }, scales, { at: [0, hs * 0.1, hs * 0.9], blend: hs * 0.5 });
    sculpt.add(head, { ellipsoid: [hs * 0.8, hs * 0.55, hs * 1.1] }, scales, { at: [0, hs * 0.05, hs * 2.2], blend: hs * 0.5 });
    part(head, ellipsoid(hs * 0.8, hs * 0.25, hs * 1.2, 8), mouthSkin, { at: [0, -hs * 0.35, hs * 1.6], shadow: false });

    const jaw = joint(head, "jaw", [0, -hs * 0.4, hs * 0.3]);

    sculpt.add(jaw, { ellipsoid: [hs * 1.0, hs * 0.28, hs * 1.6] }, belly, { at: [0, -hs * 0.05, hs * 1.2], blend: hs * 0.2, group: 1 });

    for (const side of [-1, 1]) {
        part(head, cone(hs * 0.55, hs * 0.08, 5), ivory, { at: [side * hs * 0.35, -hs * 0.3, hs * 2.5], turn: [Math.PI, 0, 0], shadow: false });
        part(head, ellipsoid(hs * 0.24, hs * 0.24, hs * 0.2, 8), eyes, { at: [side * hs * 0.8, hs * 0.35, hs * 1.5] });
    }

    // (A crown of spikes standing up on its head, swept back)
    for (let k = 0; k < (look.crest ?? 0); k++) {
        const across = k - (look.crest - 1) / 2;

        part(head, cone(hs * (0.7 - Math.abs(across) * 0.15), hs * 0.12, 5), crown, { at: [across * hs * 0.38, hs * 0.6, hs * 1.1], turn: [-0.45, 0, -across * 0.35], shadow: false });
    }

    // (Fins swept back from the sides of its head; and, a centipede's, feelers)
    for (const side of [-1, 1]) {
        if (look.fins) {
            part(head, cone(hs * 1.4, hs * 0.18, 4), finSkin, { at: [side * hs * 1.05, hs * 0.15, hs * 0.9], turn: [-1.35, 0, -side * 0.6], shadow: false });
        }

        if (look.legs) {
            part(head, limb(hs * 3, hs * 0.08, hs * 0.04, 5), legSkin, { at: [side * hs * 0.4, hs * 0.3, hs * 2.3], turn: [-1.1, 0, -side * 0.4], shadow: false });
        }
    }

    const flick = joint(head, "tongue", [0, -hs * 0.2, hs * 2.9]);

    part(flick, limb(hs * 1.3, hs * 0.08, hs * 0.05, 5), tongueSkin, { turn: [-Math.PI / 2, 0, 0], shadow: false });

    const mesh = sculpt.build(object, material, key);

    mesh.geometry.computeBoundingBox();

    let wave = random() * 6;
    const points = Array.from({ length: count + 1 }, () => new THREE.Vector3());
    const coiled = new THREE.Vector3();

    // Where each point down its length would be, coiled up (the head in the middle, raised)
    const coilAt = (k, target) => {
        const along = k * spacing;
        const round = length / (Math.PI * 2 * 1.6);
        const radius = round * (0.45 + 0.55 * Math.min(1, along / (length * 0.35)));
        const angle = along / Math.max(radius, 1e-3);

        return target.set(Math.sin(angle) * radius, thickness * 0.85 + Math.max(0, 1 - along / (length * 0.2)) * thickness * 4, Math.cos(angle) * radius - round * 0.5);
    };

    return {
        object,
        /** How far through its stride it is (0 to 1): its moves recorded a stride at a time (herd.js). */
        get phase() {
            return (wave / (Math.PI * 2)) % 1;
        },
        height: thickness * 4,
        length,
        joints: { torso: beads[2], head, jaw, mouth: head, body },
        materials: { body: material },
        attacks: ["strike", "double", "spit"],
        rests: ["coil", "taste", "bask"],

        pose({ dt, t, speed, attack, react, dead, rest, onStep }) {
            const moving = Math.min(1, speed / 0.4);
            const quick = 1.5 + speed * 5;

            wave += dt * quick;

            if (Math.floor(wave / Math.PI) !== Math.floor((wave - dt * quick) / Math.PI) && moving > 0.3) {
                onStep?.("body", speed);
            }

            // Striking: out and back (twice, quick, for a double; drawn back and spat, for venom)
            let strike = 0;
            let gape = 0;

            if (attack) {
                const { u, hit, style } = attack;
                const out = u < hit ? smooth(u / hit) : 1 - smooth(Math.min(1, (u - hit) / (1 - hit)));

                if (style === "double") {
                    strike = Math.abs(Math.sin(u * Math.PI * 2)) * (u < 0.95 ? 1 : 0);
                    gape = strike;
                } else if (style === "spit") {
                    strike = u < hit ? -0.4 * smooth(u / hit) : -0.4 + 0.7 * out;
                    gape = u < hit ? 0.2 : out;
                } else {
                    strike = out;
                    gape = out;
                }
            }

            // The front raised in an S when it's still (and more when it strikes); tasting the air,
            // raised higher
            const tasting = rest?.name === "taste" ? rest.w : 0;
            const basking = rest?.name === "bask" ? rest.w : 0;
            const coiling = rest?.name === "coil" ? rest.w : 0;
            const raise = thickness * (3 * rear + Math.max(0, strike) * 1.5 + tasting * 4) * ((1 - moving) * 0.8 + Math.max(0, strike) * 0.4 + tasting * 0.5) * (1 - basking);

            for (let k = 0; k <= count; k++) {
                const along = k / count;
                const amplitude = thickness * 1.6 * (0.3 + along) * (moving * 0.9 + 0.3) * (1 - basking * 0.7);
                const x = Math.sin(wave * (1 - basking * 0.8) - along * 7) * amplitude;
                const z = -k * spacing + strike * spacing * 3;
                const y = thickness * 0.85 + Math.max(0, 1 - along * 4) * raise;

                points[k].set(x, y, z);

                if (coiling > 0) {
                    points[k].lerp(coilAt(k, coiled), coiling);
                }
            }

            beads.forEach((bead, k) => {
                const [a, b] = [points[k + 1], points[k]];

                bead.position.copy(a).lerp(b, 0.5);
                bead.rotation.set(-Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)), Math.atan2(b.x - a.x, b.z - a.z), 0);
            });

            // (Its legs rippling down its length as it goes, a wave behind its body's)
            for (const { leg, side, k } of legs) {
                leg.rotation.y = Math.sin(wave * 2.2 - k * 0.9) * (0.15 + moving * 0.45) * side * (dead ? 0 : 1);
            }

            const heading = Math.atan2(points[0].x - points[1].x, points[0].z - points[1].z);

            head.position.copy(points[0]);
            head.rotation.set(-0.1 + Math.max(0, strike) * 0.2 - tasting * 0.3 + coiling * 0.1, heading * (coiling > 0.5 ? 1 : 0.6), 0);
            jaw.rotation.x = 0.05 + gape * 0.9 + Math.max(0, Math.sin(t * 0.4)) * 0.05 * basking;
            flick.scale.z = Math.max(0, Math.sin(t * (7 + tasting * 8))) * (1 - gape) * (1 + tasting * 0.5);
            flick.visible = flick.scale.z > 0.05;
            body.rotation.z = 0;
            body.position.y = 0;

            if (react) {
                head.rotation.x -= Math.sin(react.u * Math.PI) * 0.5;
            }

            // Dead: rolled belly up, lying straight
            if (dead) {
                const roll = smooth(Math.min(1, dead.u));

                body.rotation.z = Math.PI * roll;
                body.position.y = thickness * 1.7 * roll;
                jaw.rotation.x = 0.5 * roll;
            }
        },
    };
}
