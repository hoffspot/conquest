// A slime: a quivering see-through blob with something darker floating in it and two beady eyes,
// that hops where it goes (squashing as it lands and stretching as it springs). It rears up and
// slams down, surges forward to engulf, or spits a glob; resting, it spreads into a quivering
// puddle, bounces in place, or bubbles, its insides rising and sinking; it wobbles when struck,
// and spreads out flat when it dies. A magma slime is the same, glowing from inside.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { ellipsoid, joint, part, skin } from "./shapes.js";

const smooth = (u) => u * u * (3 - 2 * u);

/** Build a slime from its look ({ size, colours: { body, core, eyes, glow } }): as quadruped does. */
export function blob(look, random, key = null) {
    const size = look.size;
    const colours = look.colours;
    const gel = skin(colours.body, { roughness: look.crust ? 0.8 : 0.15, metalness: 0.05, clear: look.clear ?? 0.3, glow: colours.glow ?? colours.body, glowing: look.crust ? 0.04 : 0.12, flat: Boolean(look.crust) });
    const core = skin(colours.core, { roughness: 0.6, glow: colours.glow ?? null, glowing: 1.4 });
    const eyes = skin(colours.eyes ?? 0x101010, { roughness: 0.2, glow: look.crust ? colours.eyes : null, glowing: 1.6 });

    const object = new THREE.Group();
    const body = joint(object, "body");
    const shape = joint(body, "shape");
    const inside = joint(shape, "inside", [size * 0.1, size * 0.7, -size * 0.1]);

    // A slime's clear jelly; a magma slime's lumpy crust, sculpted (sculpt.js), with its cracks
    let skinMaterial = gel;

    if (look.crust) {
        const crust = new Sculpt({ blend: size * 0.25, grain: "stone", grainSize: size * 0.18, countershade: 0.1 });

        skinMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: new THREE.Color(colours.glow), emissiveIntensity: 0.03 });
        crust.add(shape, { ellipsoid: [size, size * 0.8, size] }, colours.body, { at: [0, size * 0.8, 0] });

        for (let k = 0; k < 9; k++) {
            const round = random() * Math.PI * 2;
            const up = random() * 1.2 - 0.2;

            crust.add(shape, { ellipsoid: [size * 0.35, size * 0.25, size * 0.35] }, colours.body, { at: [Math.sin(round) * Math.cos(up) * size * 0.75, size * 0.8 + Math.sin(up) * size * 0.6, Math.cos(round) * Math.cos(up) * size * 0.75] });
        }

        crust.build(object, skinMaterial, key);
    } else {
        part(shape, ellipsoid(size, size * 0.8, size, 20), gel, { at: [0, size * 0.8, 0] }).userData.alive = true;
    }

    part(inside, ellipsoid(size * 0.35, size * 0.3, size * 0.35, 10), core, { shadow: false });

    // (A crust's glowing cracks, a magma slime's)
    const veins = look.crust ? skin(colours.glow, { roughness: 0.5, glow: colours.glow, glowing: 2.2 }) : null;

    if (veins) {
        veins.userData.alive = true;
    }

    for (let k = 0; veins && k < 11; k++) {
        const round = random() * Math.PI * 2;
        const up = random() * 1.2 - 0.3;
        const vein = part(shape, ellipsoid(size * 0.025, size * (0.12 + random() * 0.2), size * 0.02, 5), veins, {
            at: [Math.sin(round) * Math.cos(up) * size * 1.02, size * 0.8 + Math.sin(up) * size * 0.82, Math.cos(round) * Math.cos(up) * size * 1.02],
            shadow: false,
        });

        // (Lying along the crust: its thin side out)
        vein.rotation.order = "YXZ";
        vein.rotation.set(-up, round, random() * Math.PI);
    }

    // (Bubbles, rising through it)
    const bubbles = [];

    for (let k = 0; k < 5; k++) {
        const bubble = part(shape, ellipsoid(size * 0.06, size * 0.06, size * 0.06, 6), core, { shadow: false });

        bubble.userData.alive = true;
        bubbles.push({ bubble, x: (random() - 0.5) * size, z: (random() - 0.5) * size, speed: 0.2 + random() * 0.3, offset: random() });
    }

    for (const side of [-1, 1]) {
        part(shape, ellipsoid(size * 0.1, size * 0.14, size * 0.08, 8), eyes, { at: [side * size * 0.3, size * 1.05, size * 0.78] });
    }

    let hop = 0;

    return {
        object,
        height: size * 1.6,
        length: size * 2,
        joints: { torso: shape, head: shape, mouth: shape, body },
        materials: { body: skinMaterial },
        attacks: ["slam", "engulf", "spit"],
        rests: ["puddle", "bounce", "bubble"],

        pose({ dt, t, speed, attack, react, dead, rest, onStep }) {
            const moving = Math.min(1, speed / 0.4);
            const before = hop;
            const bouncing = rest?.name === "bounce" ? rest.w : 0;

            hop = (hop + dt * (1.2 + speed * 1.1 + bouncing * 0.8)) % 1;

            // Hopping: up in an arc, squashed as it lands, stretched as it springs
            const springy = Math.max(moving, bouncing * 0.6);
            const air = Math.sin(hop * Math.PI);
            const land = Math.max(0, Math.cos(hop * Math.PI * 2)) * springy;
            const wobble = Math.sin(t * 5) * 0.03;

            if (hop < before && moving > 0.3) {
                onStep?.("body", speed);
            }

            body.position.set(0, air * size * 0.45 * springy, 0);
            shape.scale.set(1 + land * 0.2 + wobble, 1 - land * 0.25 + air * 0.12 * springy - wobble, 1 + land * 0.2 + wobble);
            shape.position.z = 0;
            inside.position.set(size * 0.1, size * 0.7, -size * 0.1);

            // Resting: spread in a quivering puddle, or bubbling
            if (rest?.name === "puddle") {
                const spread = rest.w;
                const ripple = Math.sin(t * 7) * 0.04 * spread;

                shape.scale.set(shape.scale.x * (1 + 0.35 * spread + ripple), shape.scale.y * (1 - 0.45 * spread), shape.scale.z * (1 + 0.35 * spread - ripple));
            } else if (rest?.name === "bubble") {
                inside.position.y += Math.sin(t * 1.4) * size * 0.3 * rest.w;
                shape.scale.y *= 1 + Math.sin(t * 2.8) * 0.06 * rest.w;
            }

            bubbles.forEach(({ bubble, x, z, speed: rise, offset }) => {
                const u = (t * rise * (1 + (rest?.name === "bubble" ? rest.w * 2 : 0)) + offset) % 1;

                bubble.position.set(x * (1 - u * 0.5), size * (0.2 + u * 1.2), z * (1 - u * 0.5));
                bubble.scale.setScalar(Math.sin(u * Math.PI));
            });

            // Attacking: rearing up tall and slamming forward flat; surging to engulf; spitting
            if (attack) {
                const { u, hit, style } = attack;
                const rise = u < hit ? smooth(u / hit) : 1 - smooth(Math.min(1, (u - hit) / (1 - hit)));

                if (style === "engulf") {
                    shape.scale.set(1 + rise * 0.35, 1 - rise * 0.2, 1 + rise * 0.6);
                    shape.position.z = rise * size * 1.1;
                } else if (style === "spit") {
                    shape.scale.set(1 + (u < hit ? 0.15 * rise : -0.1 * rise), 1 - (u < hit ? 0.2 * rise : -0.25 * rise), 1);
                    inside.position.y += rise * size * 0.35;
                } else {
                    shape.scale.set(1 - rise * 0.2, 1 + rise * 0.55, 1 - rise * 0.2);
                    shape.position.z = (u > hit ? 1 - (u - hit) / (1 - hit) : smooth(u / hit)) * size * 0.8;
                }
            }

            if (react) {
                const jiggle = Math.sin(react.u * Math.PI * 4) * (1 - react.u) * 0.25;

                shape.scale.x *= 1 + jiggle;
                shape.scale.y *= 1 - jiggle;
            }

            // Dead: spread into a puddle, fading
            if (dead) {
                const spread = smooth(Math.min(1, dead.u));

                body.position.y = 0;
                shape.scale.set(1 + spread * 0.8, 1 - spread * 0.85, 1 + spread * 0.8);
                gel.opacity = Math.max(0.15, (1 - (look.clear ?? 0.3)) * (1 - spread * 0.6));
            } else {
                gel.opacity = 1 - (look.clear ?? 0.3);
            }

            if (veins) {
                veins.emissiveIntensity = 2.2 + Math.sin(t * 2.3) * 0.5 + (attack ? 1.5 * Math.sin(Math.min(1, attack.u) * Math.PI) : 0);
            }
        },
    };
}
