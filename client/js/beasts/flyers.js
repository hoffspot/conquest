// Small things of the wilds that aren't four-legged: a swarm of bats, each flapping its own way
// round the swarm's middle; a will-o'-wisp, a hovering light in a glowing haze with motes circling
// it; and a bog frog as big as a hound, sculpted in one piece (sculpt.js).
//
// Each has its own ways of attacking and resting: the bats dive together or swirl round their
// prey, settle low or scatter wide, and drop when the swarm's killed; the wisp flares or looses a
// bolt of its light, dims and sinks or drifts in wide loops, and gutters out; the frog shoots its
// tongue, leaps on its prey or spits, puffs its throat to croak, hunkers down or looks about, and
// rolls over when it dies.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { ellipsoid, joint, membrane, part, shade, skin } from "./shapes.js";

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

/** Build a swarm of bats from its look ({ size (a bat's), count, colours: { fur, wings, eyes } }). */
export function swarm(look, random) {
    const size = look.size;
    const colours = look.colours;
    const fur = skin(colours.fur, { roughness: 0.95 });
    const wing = skin(colours.wings ?? shade(colours.fur, -0.2).getHex(), { roughness: 0.8, side: THREE.DoubleSide });
    const eyes = skin(colours.eyes ?? 0xff4020, { glow: colours.eyes ?? 0xff4020, glowing: 1.5 });

    const object = new THREE.Group();
    const middle = joint(object, "middle", [0, 1.4, 0]);
    const bats = [];

    for (let k = 0; k < (look.count ?? 5); k++) {
        const bat = joint(middle, `bat-${k}`);

        part(bat, ellipsoid(size * 0.22, size * 0.2, size * 0.32), fur);
        part(bat, ellipsoid(size * 0.15, size * 0.15, size * 0.14), fur, { at: [0, size * 0.1, size * 0.3] });

        for (const side of [-1, 1]) {
            part(bat, ellipsoid(size * 0.03, size * 0.03, size * 0.03, 5), eyes, { at: [side * size * 0.06, size * 0.14, size * 0.42], shadow: false });
            part(bat, ellipsoid(size * 0.05, size * 0.1, size * 0.03, 5), fur, { at: [side * size * 0.08, size * 0.26, size * 0.28], turn: [0, 0, -side * 0.3], shadow: false });

            const pivot = joint(bat, `wing-${side}`, [side * size * 0.15, size * 0.05, 0]);

            part(pivot, membrane([[0, -0.2], [side * 1.1, -0.35], [side * 0.9, 0.1], [side * 0.55, -0.05], [side * 0.3, 0.25], [0, 0.25]].map(([x, z]) => [x * size, z * size])), wing, { shadow: false });
            bat.userData[`wing${side}`] = pivot;
        }

        bats.push({ bat, speed: 1.5 + random() * 1.2, radius: 0.35 + random() * 0.35, lift: random() * TAU, flap: 10 + random() * 4, offset: random() * TAU });
    }

    return {
        object,
        height: 1.9,
        length: 1.2,
        joints: { torso: middle, head: middle, mouth: middle, body: middle },
        materials: { body: fur },
        attacks: ["dive", "swirl"],
        rests: ["settle", "scatter"],

        pose({ t, speed, attack, react, dead, rest }) {
            const style = attack?.style ?? "dive";
            const strike = attack ? Math.sin(Math.min(1, attack.u) * Math.PI) : 0;
            const dive = style === "dive" ? strike : 0;
            const swirl = style === "swirl" ? strike : 0;
            const settle = rest?.name === "settle" ? rest.w : 0;
            const scatter = rest?.name === "scatter" ? rest.w : 0;

            middle.position.set(0, 1.4 - dive * 0.6 - settle * 0.6 + swirl * 0.1 + Math.sin(t * 1.3) * 0.08, dive * 0.8 + swirl * 0.9);

            bats.forEach((one, k) => {
                const pace = one.speed * (1 + swirl * 1.8) * (1 - settle * 0.5);
                const a = t * pace + one.offset + speed * 0.2;
                const r = one.radius * (1 - dive * 0.6 + swirl * 0.5 + scatter * 1.2 - settle * 0.3) * (react ? 1 + Math.sin(react.u * Math.PI) * 0.6 : 1);

                if (dead) {
                    const drop = smooth(Math.min(1, dead.u + k * 0.05));

                    one.bat.position.set(Math.cos(a) * r, -1.35 * drop + Math.sin(t * 2 + k) * 0.2 * (1 - drop), Math.sin(a) * r);
                    one.bat.rotation.set(0, 0, Math.PI * drop);
                } else {
                    one.bat.position.set(Math.cos(a) * r, Math.sin(t * 2.3 + one.lift) * (0.25 + scatter * 0.3), Math.sin(a) * r);
                    one.bat.rotation.set(0, -a - Math.PI, Math.sin(t * 3 + k) * 0.3);
                }

                const beat = dead ? 0.2 : Math.sin(t * one.flap * (1 - settle * 0.3) + one.offset) * 0.9;

                one.bat.userData["wing-1"].rotation.z = -beat;
                one.bat.userData.wing1.rotation.z = beat;
            });
        },
    };
}

/** Build a will-o'-wisp from its look ({ size, colours: { light, haze } }). */
export function wisp(look, random) {
    const size = look.size;
    const colours = look.colours;
    const light = skin(colours.light, { roughness: 0.2, glow: colours.light, glowing: 3 });
    const haze = skin(colours.haze ?? colours.light, { roughness: 1, glow: colours.haze ?? colours.light, glowing: 0.8, clear: 0.72 });

    const object = new THREE.Group();
    const middle = joint(object, "middle", [0, 1.2, 0]);

    // (All of it animated as it is: none of it folded)
    middle.userData.alive = true;

    const core = part(middle, ellipsoid(size * 0.3, size * 0.3, size * 0.3, 12), light, { shadow: false });
    const glow = part(middle, ellipsoid(size, size * 1.1, size, 14), haze, { shadow: false });
    const motes = [];

    for (let k = 0; k < 6; k++) {
        motes.push({ mote: part(middle, ellipsoid(size * 0.07, size * 0.07, size * 0.07, 6), light, { shadow: false }), speed: 1 + random() * 2, tilt: random() * TAU });
    }

    return {
        object,
        height: 1.6,
        length: size * 2,
        joints: { torso: middle, head: middle, mouth: middle, body: middle },
        materials: { body: light },
        attacks: ["flare", "bolt"],
        rests: ["dim", "drift"],

        pose({ t, attack, react, dead, rest }) {
            const flare = attack ? Math.sin(Math.min(1, attack.u) * Math.PI) * (attack.style === "bolt" ? 0.6 : 1) : 0;
            const out = dead ? smooth(Math.min(1, dead.u)) : 0;
            const dim = rest?.name === "dim" ? rest.w : 0;
            const drift = rest?.name === "drift" ? rest.w : 0;
            const pulse = (1 + Math.sin(t * 4) * 0.08 + flare * 0.6 + (react ? Math.sin(react.u * Math.PI) * 0.4 : 0)) * (1 - dim * 0.4);

            middle.position.set(Math.sin(t * 0.7) * (0.1 + drift * 0.9), 1.2 + Math.sin(t * 1.6) * 0.12 - out * 0.9 - dim * 0.6, flare * 0.6 + Math.cos(t * 0.5) * drift * 0.9);
            core.scale.setScalar(pulse * (1 - out * 0.9));
            glow.scale.setScalar((1 + Math.sin(t * 2.3) * 0.06 + flare * 0.3) * (1 - out * 0.95) * (1 - dim * 0.3));
            haze.opacity = 0.28 * (1 - out) * (1 - dim * 0.5);
            light.emissiveIntensity = 3 * (1 - dim * 0.6) * (1 + flare * 0.5);

            motes.forEach(({ mote, speed, tilt }, k) => {
                const a = t * speed * (1 + flare) + k;
                const reach = size * (1.4 - (attack?.style === "bolt" ? flare * 0.8 : 0));

                mote.position.set(Math.cos(a) * reach, Math.sin(a * 1.3 + tilt) * size * 0.8, Math.sin(a) * reach);
                mote.visible = out < 0.9;
            });
        },
    };
}

/** Build a frog from its look ({ size, colours: { skin, belly, spots, eyes } }), sculpted. */
export function frog(look, random, key = null) {
    const size = look.size;
    const colours = look.colours;
    const hide = new THREE.Color(colours.skin);
    const belly = colours.belly ?? shade(colours.skin, 0.4).getHex();
    const spots = colours.spots ?? shade(colours.skin, -0.45).getHex();
    const sculpt = new Sculpt({ blend: size * 0.14, grain: "slick", grainSize: size * 0.05, countershade: 0.12 });
    const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 });
    const eyes = skin(colours.eyes ?? 0xe0c040, { roughness: 0.05, glow: colours.eyes ?? 0xe0c040, glowing: 0.3 });
    const pupil = skin(0x080806, { roughness: 0.1 });
    const tongueSkin = skin(0xd0506a, { roughness: 0.4 });
    const sacSkin = skin(shade(colours.belly ?? colours.skin, 0.1).getHex(), { roughness: 0.3, clear: 0.15 });

    const object = new THREE.Group();
    const body = joint(object, "body", [0, size * 0.42, 0]);

    body.rotation.x = -0.35;
    sculpt.add(body, { ellipsoid: [size * 0.6, size * 0.4, size * 0.72] }, hide);
    sculpt.add(body, { ellipsoid: [size * 0.5, size * 0.3, size * 0.4] }, hide, { at: [0, -size * 0.05, -size * 0.45] });
    sculpt.paint(body, [size * 0.55, size * 0.3, size * 0.7], belly, { at: [0, -size * 0.35, 0.05], soft: size * 0.12 });

    for (let k = 0; k < 9; k++) {
        sculpt.paint(body, [size * 0.1, size * 0.1, size * 0.1], spots, { at: [(random() - 0.5) * size * 0.8, size * 0.32, (random() - 0.5) * size * 0.9], soft: size * 0.03, strength: 0.9 });
    }

    const head = joint(body, "head", [0, size * 0.15, size * 0.55]);

    head.rotation.x = 0.3;
    sculpt.add(head, { ellipsoid: [size * 0.52, size * 0.26, size * 0.42] }, hide, { at: [0, 0, size * 0.1] });

    for (const side of [-1, 1]) {
        sculpt.add(head, { ellipsoid: [size * 0.15, size * 0.14, size * 0.15] }, hide, { at: [side * size * 0.3, size * 0.16, 0], blend: size * 0.08 });
        part(head, ellipsoid(size * 0.12, size * 0.12, size * 0.1, 10), eyes, { at: [side * size * 0.33, size * 0.22, size * 0.06] });
        part(head, ellipsoid(size * 0.05, size * 0.09, size * 0.04, 8), pupil, { at: [side * size * 0.37, size * 0.23, size * 0.14], shadow: false });
    }

    const jaw = joint(head, "jaw", [0, -size * 0.1, -size * 0.1]);

    sculpt.add(jaw, { ellipsoid: [size * 0.48, size * 0.1, size * 0.45] }, belly, { at: [0, -size * 0.02, size * 0.22], blend: size * 0.04, group: 1 });

    const sac = joint(jaw, "sac", [0, -size * 0.1, size * 0.2]);

    part(sac, ellipsoid(size * 0.28, size * 0.18, size * 0.25, 12), sacSkin, { shadow: false });
    const tongue = joint(head, "tongue", [0, -size * 0.08, size * 0.3]);

    part(tongue, ellipsoid(size * 0.06, size * 0.04, size * 0.5), tongueSkin, { at: [0, 0, size * 0.5], shadow: false });
    tongue.scale.z = 0.05;

    // Legs: long hind legs folded under (thigh, shin and a webbed foot), short forelegs
    const legs = [];

    for (const side of [-1, 1]) {
        const hip = joint(body, `hip-${side}`, [side * size * 0.4, -size * 0.1, -size * 0.4]);

        hip.rotation.set(0.4, 0, side * 0.4);
        sculpt.add(hip, { limb: [size * 0.45, size * 0.17, size * 0.1] }, hide, { turn: [-1.3, 0, 0] });

        const knee = joint(hip, "knee", [0, -size * 0.45 * Math.cos(1.3), size * 0.45 * Math.sin(1.3)]);

        knee.rotation.x = 0;
        sculpt.add(knee, { limb: [size * 0.45, size * 0.1, size * 0.07] }, hide, { turn: [1.6, 0, 0] });

        const ankle = joint(knee, "ankle", [0, size * 0.45 * Math.cos(1.6 - Math.PI), -size * 0.45 * Math.sin(1.6)]);

        sculpt.add(ankle, { ellipsoid: [size * 0.16, size * 0.04, size * 0.24] }, hide, { at: [side * size * 0.05, -size * 0.02, size * 0.15], blend: size * 0.04 });

        const fore = joint(body, `fore-${side}`, [side * size * 0.32, -size * 0.12, size * 0.35]);

        sculpt.add(fore, { limb: [size * 0.3, size * 0.07, size * 0.05] }, hide, { turn: [0.3, 0, side * 0.2] });
        sculpt.add(fore, { ellipsoid: [size * 0.09, size * 0.03, size * 0.1] }, hide, { at: [side * size * 0.07, -size * 0.28, size * 0.08], blend: size * 0.03 });
        legs.push({ hip, knee, fore, side });
    }

    sculpt.build(object, material, key);

    let hop = random();

    return {
        object,
        height: size * 1.1,
        length: size * 1.6,
        joints: { torso: body, head, mouth: tongue, jaw, body },
        materials: { body: material },
        attacks: ["tongue", "leap", "spit"],
        rests: ["croak", "hunker", "look"],

        pose({ dt, t, speed, attack, react, dead, rest, onStep }) {
            const moving = Math.min(1, speed / 0.4);
            const before = hop;

            hop = (hop + dt * (0.8 + speed * 1.2)) % 1;

            if (hop < before && moving > 0.3) {
                onStep?.("body", speed);
            }

            // Hopping in arcs, the hind legs kicking out
            let air = Math.sin(hop * Math.PI) * moving;
            const croak = rest?.name === "croak" ? rest.w : 0;
            const hunker = rest?.name === "hunker" ? rest.w : 0;
            const look = rest?.name === "look" ? rest.w : 0;

            tongue.scale.z = 0.05;
            jaw.rotation.x = 0;
            head.rotation.y = Math.sin(t * 0.8) * 0.5 * look;

            // Attacking: the tongue shot out and back; a leap onto its prey; venom spat
            if (attack) {
                const { u, hit, style } = attack;
                const out = u < hit ? smooth(u / hit) : 1 - smooth(Math.min(1, (u - hit) / (1 - hit)));

                if (style === "leap") {
                    air = Math.max(air, Math.sin(Math.min(1, u / hit) * Math.PI) * (u < hit ? 1 : 0));
                    body.position.z = size * 1.2 * out;
                } else if (style === "spit") {
                    jaw.rotation.x = 0.5 * out;
                } else {
                    tongue.scale.z = 0.05 + out * 3.2;
                    jaw.rotation.x = 0.35 * out;
                }
            } else {
                body.position.z = 0;
            }

            body.position.y = size * (0.42 - hunker * 0.12) + air * size * 0.9;
            body.rotation.set(-0.35 - air * 0.4 + hunker * 0.2, 0, 0);
            body.scale.set(1, 1 + Math.max(0, Math.sin(t * 3)) * 0.04 * (1 - moving), 1);
            sac.scale.setScalar(0.4 + croak * Math.max(0, Math.sin(t * 2.2)) * 1.1 + (1 - moving) * 0.1);

            for (const leg of legs) {
                leg.hip.rotation.x = 0.4 - air * 1.2 + hunker * 0.1;
                leg.knee.rotation.x = air * 0.9;
                leg.fore.rotation.x = -air * 0.6 + hunker * 0.3;
            }

            if (react) {
                body.position.y += Math.sin(react.u * Math.PI) * size * 0.3;
            }

            if (dead) {
                const roll = smooth(Math.min(1, dead.u));

                body.rotation.z = Math.PI * 0.9 * roll * dead.side;
                body.position.y = size * (0.42 + 0.15 * roll);
                sac.scale.setScalar(0.3);

                for (const leg of legs) {
                    leg.hip.rotation.x = 0.4 - 0.9 * roll;
                }
            }
        },
    };
}
