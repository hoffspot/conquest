// A slime: a quivering see-through blob with something darker floating in it and two beady eyes,
// that hops where it goes (squashing as it lands and stretching as it springs). It rears up and
// slams down, surges forward to engulf, or spits a glob; resting, it spreads into a quivering
// puddle, bounces in place, or bubbles, its insides rising and sinking; it wobbles when struck,
// and spreads out flat when it dies. A magma slime is the same under a lumpy crust of cooling
// rock, cracked all over, molten rock glowing in the cracks (white-hot in the deepest, orange,
// then dull red at their edges) and slowly pulsing, sparks spitting from it now and then.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { ellipsoid, glowSpot, joint, part, skin } from "./shapes.js";

const smooth = (u) => u * u * (3 - 2 * u);

// A smooth noise in three dimensions (about -1 to 1), from hashed whole-number corners
function hash(x, y, z) {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;

    return (n - Math.floor(n)) * 2 - 1;
}

function noise(x, y, z) {
    const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [fx, fy, fz] = [smooth(x - ix), smooth(y - iy), smooth(z - iz)];
    const lerp = (a, b, u) => a + (b - a) * u;
    const corner = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);

    return lerp(
        lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), fx), lerp(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
        lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), fx), lerp(corner(0, 1, 1), corner(1, 1, 1), fx), fy),
        fz,
    );
}

// How molten a point on a crust is (0 to 1): the cracks are where two layers of noise cross
// nothing (thin, branching lines), wider and hotter where both are near it
function molten(x, y, z, scale) {
    const a = Math.abs(noise(x * scale, y * scale, z * scale) + noise(x * scale * 2.1 + 7, y * scale * 2.1, z * scale * 2.1) * 0.45);
    const b = Math.abs(noise(x * scale * 1.3 + 31, y * scale * 1.3, z * scale * 1.3 + 5));
    const crack = Math.max(0, 1 - a / 0.16) ** 1.5;
    const pool = Math.max(0, 1 - b / 0.1) ** 2 * 0.6;

    return Math.min(1, crack + pool * crack + pool * 0.35);
}

// The crust's glow, added to its lighting: each point by how molten it is, a white-hot yellow in
// the deepest cracks through orange to a dull red, pulsing slowly in waves across it
function meltable(material, glow) {
    const uniforms = { time: { value: 0 }, heat: { value: 1 }, glow: { value: new THREE.Color(glow) } };

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute float molten;\nvarying float vMolten;\nvarying vec3 vSpot;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMolten = molten;\nvSpot = position;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform float time;\nuniform float heat;\nuniform vec3 glow;\nvarying float vMolten;\nvarying vec3 vSpot;")
            .replace(
                "#include <emissivemap_fragment>",
                [
                    "#include <emissivemap_fragment>",
                    "float pulse = 0.72 + 0.28 * sin(time * 1.3 + vSpot.y * 9.0 + vSpot.x * 5.0) * sin(time * 0.7 + vSpot.z * 7.0 + 1.3);",
                    "float m = clamp(vMolten, 0.0, 1.0) * pulse * heat;",
                    "vec3 hot = mix(glow * vec3(0.55, 0.12, 0.05), glow, smoothstep(0.15, 0.55, m));",
                    "hot = mix(hot, vec3(1.0, 0.86, 0.45), smoothstep(0.6, 0.95, m));",
                    "totalEmissiveRadiance += hot * m * 2.6;",
                    "diffuseColor.rgb *= 1.0 - 0.8 * smoothstep(0.1, 0.5, m);",
                ].join("\n"),
            );
    };
    material.customProgramCacheKey = () => "molten";

    return uniforms;
}

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
    let melt = null;

    if (look.crust) {
        const crust = new Sculpt({ blend: size * 0.14, grain: "stone", grainSize: size * 0.18, countershade: 0.1 });

        skinMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: new THREE.Color(colours.glow), emissiveIntensity: 0.03 });
        crust.add(shape, { ellipsoid: [size, size * 0.8, size] }, colours.body, { at: [0, size * 0.8, 0] });

        for (let k = 0; k < 9; k++) {
            const round = random() * Math.PI * 2;
            const up = random() * 1.2 - 0.2;

            crust.add(shape, { ellipsoid: [size * 0.35, size * 0.25, size * 0.35] }, colours.body, { at: [Math.sin(round) * Math.cos(up) * size * 0.75, size * 0.8 + Math.sin(up) * size * 0.6, Math.cos(round) * Math.cos(up) * size * 0.75] });
        }

        const built = crust.build(object, skinMaterial, key);
        const geometry = built.geometry;

        // (How molten each point of it is: made once for the body it shares)
        if (!geometry.attributes.molten) {
            const position = geometry.attributes.position;
            const heat = new Float32Array(position.count);

            for (let k = 0; k < position.count; k++) {
                heat[k] = molten(position.getX(k), position.getY(k), position.getZ(k), 2.6 / size);
            }

            geometry.setAttribute("molten", new THREE.BufferAttribute(heat, 1));
        }

        melt = meltable(skinMaterial, colours.glow);
    } else {
        part(shape, ellipsoid(size, size * 0.8, size, 20), gel, { at: [0, size * 0.8, 0] }).userData.alive = true;
    }

    part(inside, ellipsoid(size * 0.35, size * 0.3, size * 0.35, 10), core, { shadow: false });

    // (Sparks, a magma slime's: spat from its crust now and then, flying up and out, falling
    // and fading; each a point of light that goes out, then waits its turn again)
    const sparks = [];
    let sparkPoints = null;

    if (look.crust) {
        const count = 18;
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        sparkPoints = new THREE.Points(geometry, new THREE.PointsMaterial({ size: size * 0.2, map: glowSpot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sparkPoints.frustumCulled = false;
        sparkPoints.userData.alive = true;
        object.add(sparkPoints);

        for (let k = 0; k < count; k++) {
            sparks.push({ born: -random() * 4, life: 0.6 + random() * 0.7, from: [0, 0, 0], way: [0, 0, 0] });
        }
    }

    // (Bubbles, rising through it)
    const bubbles = [];

    for (let k = 0; k < (look.crust ? 0 : 5); k++) {
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

            // The crust's cracks pulsing, flaring as it strikes, dimming as it dies; its sparks
            if (melt) {
                melt.time.value = t;
                melt.heat.value = (1 + (attack ? 0.6 * Math.sin(Math.min(1, attack.u) * Math.PI) : 0)) * (dead ? 1 - 0.8 * smooth(Math.min(1, dead.u)) : 1);
            }

            if (sparkPoints) {
                const positions = sparkPoints.geometry.attributes.position;
                const tints = sparkPoints.geometry.attributes.color;
                const often = dead ? 0 : attack ? 3 : 1;

                sparks.forEach((spark, k) => {
                    let age = t - spark.born;

                    // (Its turn again: from somewhere on the upper crust, up and out)
                    if (age > spark.life + 2.5 / (often || 0.001) * ((k * 0.37) % 1) && often > 0) {
                        const round = random() * Math.PI * 2;
                        const up = 0.3 + random() * 0.9;
                        const out = [Math.sin(round) * Math.cos(up), Math.sin(up), Math.cos(round) * Math.cos(up)];

                        spark.born = t;
                        spark.from = [out[0] * size * 0.95 * shape.scale.x, body.position.y + size * 0.8 * shape.scale.y + out[1] * size * 0.75 * shape.scale.y, out[2] * size * 0.95 * shape.scale.z + shape.position.z];
                        spark.way = [out[0] * size * 1.6, size * (2 + random() * 1.8), out[2] * size * 1.6];
                        age = 0;
                    }

                    const alive = age >= 0 && age < spark.life;
                    const fade = alive ? (1 - age / spark.life) ** 0.8 : 0;

                    positions.setXYZ(k, spark.from[0] + spark.way[0] * age, spark.from[1] + spark.way[1] * age - 4.9 * size * age * age, spark.from[2] + spark.way[2] * age);
                    tints.setXYZ(k, fade * 1.4, fade * (0.5 + 0.55 * fade), fade * fade * 0.3);
                });

                positions.needsUpdate = true;
                tints.needsUpdate = true;
            }
        },
    };
}
