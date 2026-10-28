// The roaming beasts' dens (core/dens.js), as they're seen once a player's near (app/game.js
// #denning): each kind its own, of a few plain shapes, each set on the ground where it lies:
// - a bear's den: a mound of earth with a dark mouth dug into its front, boulders either side of
//   it, bones before it;
// - a boars' wallow: a hollow of wet mud, the earth rooted up round it, a fallen log by it;
// - a puma's or a jaguar's lair: a flat-topped rock to lie up on, boulders by it, bones about;
// - a wyverns' nest: a ring of sticks heaped round a hollow, eggs in it, bones about it;
// - a knucker's hole: a dark pool, still and deep, ringed with stones and reeds.
// Drawn for as many as are near at once (DEN_LOOK.seen); their shapes and stuff made once, shared.

import * as THREE from "three";
import { randomOf, rockLook } from "./art/kits/rocks.js";

/**
 * How they look: how near the player one's drawn (`seen`, metres), and the colours of their
 * rock, earth, mud, bones, sticks, eggs, water and reeds.
 */
export const DEN_LOOK = Object.freeze({ seen: 140, rock: 0x6f675c, earth: 0x4f3d29, mud: 0x33251a, bone: 0xd9d0bc, wood: 0x5a4430, egg: 0xcbc3a6, water: 0x0d1814, reed: 0x5d7a3a, mouth: 0x0b0806 });

// A number from 0 up to 1, the same for a seed and a step (a den's own dice)
function dice(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A boulder: a granite corestone (kits/rocks.js), its joints worn round, smooth-lit, about a metre
// round its middle (as a ball of radius 1 is), its corners shared
function boulderGeometry() {
    const look = rockLook(randomOf(7), { family: "corestone", detail: 2, layer: "rock" });
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(look.count * 3);
    const middle = (look.top + Math.min(...look.position.filter((_, i) => i % 3 === 1))) / 2;

    for (let i = 0; i < look.count; i++) {
        position[i * 3] = look.position[i * 3] * 2;
        position[i * 3 + 1] = (look.position[i * 3 + 1] - middle) * 2;
        position[i * 3 + 2] = look.position[i * 3 + 2] * 2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(Float32Array.from(look.normal), 3));
    geometry.setIndex(new THREE.BufferAttribute(look.index, 1));
    geometry.computeBoundingSphere();

    return geometry;
}

export class DenProps {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.geometries = null;
        this.materials = null;

        /** What's drawn, by the den's id: its group. */
        this.shown = new Map();
    }

    /**
     * The dens to show (`dens`: [{ id, kind (core/dens.js DENS key), x, z (world metres), seed }]),
     * each set on the ground (`groundAt(x, z)`: its height there), and those no longer in it let go.
     */
    set(dens, groundAt) {
        const wanted = new Set(dens.map(({ id }) => id));

        for (const [id, group] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(group);
                this.shown.delete(id);
            }
        }

        for (const den of dens) {
            if (!this.shown.has(den.id)) {
                const group = this.#build(den, groundAt);

                this.scene.add(group);
                this.shown.set(den.id, group);
            }
        }
    }

    dispose() {
        for (const group of this.shown.values()) {
            this.scene.remove(group);
        }

        this.shown.clear();

        for (const each of [...Object.values(this.geometries ?? {}), ...Object.values(this.materials ?? {})]) {
            each.dispose();
        }
    }

    // A den of its kind, its pieces each on the ground where it lies, turned its own way
    #build({ id, kind, x, z, seed }, groundAt) {
        this.geometries ??= {
            boulder: boulderGeometry(),
            ball: new THREE.SphereGeometry(1, 14, 10),
            bone: new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6).rotateZ(Math.PI / 2),
            knob: new THREE.SphereGeometry(0.06, 8, 6),
            stick: new THREE.CylinderGeometry(0.035, 0.045, 1.5, 5).rotateZ(Math.PI / 2),
            log: new THREE.CylinderGeometry(0.24, 0.28, 3.4, 10).rotateZ(Math.PI / 2),
            disc: new THREE.CylinderGeometry(1, 1, 0.06, 28),
            reed: new THREE.ConeGeometry(0.03, 1.1, 4),
        };
        this.materials ??= {
            rock: new THREE.MeshStandardMaterial({ color: DEN_LOOK.rock, roughness: 0.95 }),
            earth: new THREE.MeshStandardMaterial({ color: DEN_LOOK.earth, roughness: 1 }),
            mud: new THREE.MeshStandardMaterial({ color: DEN_LOOK.mud, roughness: 0.55 }),
            bone: new THREE.MeshStandardMaterial({ color: DEN_LOOK.bone, roughness: 0.7 }),
            wood: new THREE.MeshStandardMaterial({ color: DEN_LOOK.wood, roughness: 0.9 }),
            egg: new THREE.MeshStandardMaterial({ color: DEN_LOOK.egg, roughness: 0.5 }),
            water: new THREE.MeshStandardMaterial({ color: DEN_LOOK.water, roughness: 0.08, metalness: 0.3 }),
            reed: new THREE.MeshStandardMaterial({ color: DEN_LOOK.reed, roughness: 0.8 }),
            mouth: new THREE.MeshBasicMaterial({ color: DEN_LOOK.mouth }),
        };

        const group = new THREE.Group();
        const next = dice(seed);
        const turn = next() * Math.PI * 2;
        const base = groundAt(x, z);
        const { geometries: g, materials: m } = this;

        // (A piece at [across, ahead] metres from the den's middle, turned with it, `up` above the
        // ground there, `scale` big, turned `spin` about its own up)
        const put = (geometry, material, [across, ahead], { up = 0, scale = [1, 1, 1], spin = 0, tilt = 0, shadow = true } = {}) => {
            const mesh = new THREE.Mesh(geometry, material);
            const [dx, dz] = [across * Math.cos(turn) + ahead * Math.sin(turn), -across * Math.sin(turn) + ahead * Math.cos(turn)];

            mesh.position.set(dx, groundAt(x + dx, z + dz) - base + up, dz);
            mesh.scale.set(...scale);
            mesh.rotation.set(tilt, turn + spin, 0);
            mesh.castShadow = shadow;
            mesh.receiveShadow = true;
            group.add(mesh);

            return mesh;
        };
        const bones = (count, [across, ahead], spread) => {
            for (let k = 0; k < count; k++) {
                const at = [across + (next() - 0.5) * spread, ahead + (next() - 0.5) * spread];
                const spin = next() * Math.PI;

                put(g.bone, m.bone, at, { up: 0.03, spin, shadow: false });
                put(g.knob, m.bone, [at[0] + Math.cos(spin) * 0.25, at[1] - Math.sin(spin) * 0.25], { up: 0.04, shadow: false });
                put(g.knob, m.bone, [at[0] - Math.cos(spin) * 0.25, at[1] + Math.sin(spin) * 0.25], { up: 0.04, shadow: false });
            }
        };

        switch (kind) {
            case "bear's den": {
                put(g.ball, m.earth, [0, -0.6], { up: -0.5, scale: [3.2, 1.9, 2.7] });
                put(g.ball, m.mouth, [0, 1.8], { up: 0.55, scale: [0.9, 0.75, 0.35], shadow: false });
                put(g.boulder, m.rock, [-2.2, 1.2], { up: 0.2, scale: [1, 0.8, 0.9], spin: next() * 6 });
                put(g.boulder, m.rock, [2.3, 0.9], { up: 0.1, scale: [0.8, 0.7, 0.9], spin: next() * 6 });
                bones(4, [0, 3], 2);
                break;
            }
            case "boars' wallow": {
                put(g.disc, m.mud, [0, 0], { up: -0.01, scale: [2.6, 1, 2] });

                for (let k = 0; k < 9; k++) {
                    const angle = (k / 9) * Math.PI * 2 + next() * 0.4;

                    put(g.ball, m.earth, [Math.cos(angle) * 2.9, Math.sin(angle) * 2.3], { up: -0.05, scale: [0.35, 0.18, 0.3], spin: next() * 6 });
                }

                put(g.log, m.wood, [0.5, -3.4], { up: 0.2, spin: 0.3 });
                break;
            }
            case "puma's lair":
            case "jaguar's lair": {
                put(g.boulder, m.rock, [0, 0], { up: -0.1, scale: [2.2, 0.9, 1.6] });
                put(g.boulder, m.rock, [-2, -1.4], { up: 0.1, scale: [0.9, 1.1, 0.8], spin: next() * 6 });
                put(g.boulder, m.rock, [1.9, -1.2], { up: 0, scale: [0.7, 0.6, 0.8], spin: next() * 6 });
                bones(5, [0, 2.2], 2.6);
                break;
            }
            case "wyverns' nest": {
                put(g.disc, m.earth, [0, 0], { up: -0.01, scale: [1.6, 1, 1.6], shadow: false });

                for (let k = 0; k < 30; k++) {
                    const angle = (k / 30) * Math.PI * 2;
                    const out = 1.6 + next() * 0.3;

                    put(g.stick, m.wood, [Math.cos(angle) * out, Math.sin(angle) * out], { up: 0.08 + (k % 3) * 0.09, spin: -angle + Math.PI / 2 + (next() - 0.5) * 0.5, tilt: (next() - 0.5) * 0.3 });
                }

                for (let k = 0; k < 3; k++) {
                    put(g.ball, m.egg, [(k - 1) * 0.45, (next() - 0.5) * 0.4], { up: 0.2, scale: [0.2, 0.27, 0.2] });
                }

                bones(4, [0, 2.8], 2.4);
                break;
            }
            case "knucker's hole": {
                put(g.disc, m.water, [0, 0], { up: 0.02, scale: [2.2, 1, 2.2], shadow: false });

                for (let k = 0; k < 11; k++) {
                    const angle = (k / 11) * Math.PI * 2 + next() * 0.3;
                    const big = 0.25 + next() * 0.2;

                    put(g.boulder, m.rock, [Math.cos(angle) * 2.35, Math.sin(angle) * 2.35], { up: 0, scale: [big, big * 0.7, big], spin: next() * 6 });
                }

                for (let k = 0; k < 14; k++) {
                    const angle = next() * Math.PI * 2;
                    const out = 2.6 + next() * 0.8;

                    put(g.reed, m.reed, [Math.cos(angle) * out, Math.sin(angle) * out], { up: 0.5, tilt: (next() - 0.5) * 0.3, shadow: false });
                }

                break;
            }
            default:
                break;
        }

        group.name = `den ${id}`;
        group.position.set(x, base, z);

        return group;
    }
}
