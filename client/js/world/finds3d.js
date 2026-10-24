// The wilds director's peaceful finds (core/director.js FINDS), as they're seen once a player's
// near (app/game.js #findsNear): each of a few plain shapes, set on the ground where it lies:
// - a fallen adventurer's remains: a skull, ribs and the long bones stretched out where they lay,
//   a cloak gone to rags under them, their sword rusting by their hand and their pack by their
//   head;
// - an old campsite: a ring of stones round a bed of grey ash and logs burnt black, a log rolled up
//   to sit on, and a lean-to of branches over a pole between two forked sticks.
// Drawn for as many as are near at once (FIND_LOOK.seen); their shapes and stuff made once, shared.

import * as THREE from "three";

/**
 * How they look: how near the player one's drawn (`seen`, metres), and the colours of their rock,
 * ash, burnt and weathered wood, bones, rag, rust and leather.
 */
export const FIND_LOOK = Object.freeze({ seen: 140, rock: 0x77706a, ash: 0x55524e, char: 0x1d1814, wood: 0x6a5238, bone: 0xd6cdb8, rag: 0x3a3a30, rust: 0x6e4a32, leather: 0x5a3c22 });

// A number from 0 up to 1, the same for a seed and a step (a find's own dice)
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

// A find's seed, from its id
const seedOf = (id) => [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7) >>> 0;

export class FindProps {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.geometries = null;
        this.materials = null;

        /** What's drawn, by the find's id: its group. */
        this.shown = new Map();
    }

    /**
     * The finds to show (`finds`: [{ id, kind ("remains" or "campsite"), x, z (world metres) }]),
     * each set on the ground (`groundAt(x, z)`: its height there), and those no longer in it let go.
     */
    set(finds, groundAt) {
        const wanted = new Set(finds.map(({ id }) => id));

        for (const [id, group] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(group);
                this.shown.delete(id);
            }
        }

        for (const find of finds) {
            if (!this.shown.has(find.id)) {
                const group = this.#build(find, groundAt);

                this.scene.add(group);
                this.shown.set(find.id, group);
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

    // A find of its kind, its pieces each on the ground where it lies, turned its own way
    #build({ id, kind, x, z }, groundAt) {
        this.geometries ??= {
            stone: new THREE.DodecahedronGeometry(1, 1),
            ball: new THREE.SphereGeometry(1, 14, 10),
            bone: new THREE.CylinderGeometry(0.03, 0.03, 1, 6).rotateZ(Math.PI / 2),
            rib: new THREE.TorusGeometry(0.17, 0.018, 5, 12, Math.PI),
            disc: new THREE.CylinderGeometry(1, 1, 0.05, 24),
            box: new THREE.BoxGeometry(1, 1, 1),
            log: new THREE.CylinderGeometry(0.1, 0.12, 1, 8).rotateZ(Math.PI / 2),
            pole: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
        };
        this.materials ??= {
            rock: new THREE.MeshStandardMaterial({ color: FIND_LOOK.rock, roughness: 0.95 }),
            ash: new THREE.MeshStandardMaterial({ color: FIND_LOOK.ash, roughness: 1 }),
            char: new THREE.MeshStandardMaterial({ color: FIND_LOOK.char, roughness: 0.9 }),
            wood: new THREE.MeshStandardMaterial({ color: FIND_LOOK.wood, roughness: 0.9 }),
            bone: new THREE.MeshStandardMaterial({ color: FIND_LOOK.bone, roughness: 0.7 }),
            rag: new THREE.MeshStandardMaterial({ color: FIND_LOOK.rag, roughness: 1 }),
            rust: new THREE.MeshStandardMaterial({ color: FIND_LOOK.rust, roughness: 0.6, metalness: 0.4 }),
            leather: new THREE.MeshStandardMaterial({ color: FIND_LOOK.leather, roughness: 0.85 }),
        };

        const group = new THREE.Group();
        const next = dice(seedOf(id));
        const turn = next() * Math.PI * 2;
        const base = groundAt(x, z);
        const { geometries: g, materials: m } = this;

        // (A piece at [across, ahead] metres from the find's middle, turned with it, `up` above the
        // ground there, `scale` big, turned `spin` about its own up and tipped `tilt`)
        const put = (geometry, material, [across, ahead], { up = 0, scale = [1, 1, 1], spin = 0, tilt = 0, roll = 0, shadow = true } = {}) => {
            const mesh = new THREE.Mesh(geometry, material);
            const [dx, dz] = [across * Math.cos(turn) + ahead * Math.sin(turn), -across * Math.sin(turn) + ahead * Math.cos(turn)];

            mesh.position.set(dx, groundAt(x + dx, z + dz) - base + up, dz);
            mesh.scale.set(...scale);
            mesh.rotation.set(tilt, turn + spin, roll);
            mesh.castShadow = shadow;
            mesh.receiveShadow = true;
            group.add(mesh);

            return mesh;
        };

        if (kind === "remains") {
            // (Their cloak in rags under them, their skull at its head, ribs, arms and legs down it)
            put(g.disc, m.rag, [0, 0.1], { up: 0.005, scale: [0.55, 1, 1.05], shadow: false });
            put(g.ball, m.bone, [0.02, -0.78], { up: 0.1, scale: [0.11, 0.1, 0.13], spin: next() - 0.5 });

            for (let k = 0; k < 5; k++) {
                put(g.rib, m.bone, [0, -0.5 + k * 0.08], { up: 0.02, scale: [1 - k * 0.08, 1, 1], tilt: -Math.PI / 2, shadow: false });
            }

            put(g.bone, m.bone, [0, -0.15], { up: 0.03, scale: [0.6, 1, 1], spin: Math.PI / 2, shadow: false });

            for (const [across, ahead, long] of [[-0.24, -0.25, 0.55], [0.26, -0.2, 0.5], [-0.12, 0.45, 0.8], [0.12, 0.5, 0.75]]) {
                put(g.bone, m.bone, [across, ahead], { up: 0.03, scale: [long, 1, 1], spin: Math.PI / 2 + (next() - 0.5) * 0.4, shadow: false });
            }

            // (Their sword by their hand, rusting; their pack by their head, its flap open)
            put(g.box, m.rust, [0.55, 0.05], { up: 0.02, scale: [0.06, 0.02, 0.95], spin: 0.15 });
            put(g.box, m.rust, [0.55, -0.4], { up: 0.03, scale: [0.24, 0.04, 0.05], spin: 0.15 });
            put(g.box, m.leather, [-0.45, -1.05], { up: 0.15, scale: [0.42, 0.3, 0.26], spin: 0.5 + next() * 0.4, tilt: 0.2 });
            put(g.box, m.leather, [-0.3, -0.85], { up: 0.03, scale: [0.36, 0.02, 0.3], spin: 0.6 });
        } else if (kind === "campsite") {
            // (A ring of stones round a bed of ash and logs burnt black)
            put(g.disc, m.ash, [0, 0], { up: 0.01, scale: [0.62, 1, 0.62], shadow: false });

            for (let k = 0; k < 9; k++) {
                const angle = (k / 9) * Math.PI * 2 + (next() - 0.5) * 0.3;
                const big = 0.15 + next() * 0.07;

                put(g.stone, m.rock, [Math.cos(angle) * 0.78, Math.sin(angle) * 0.78], { up: big * 0.45, scale: [big, big * 0.75, big * 1.1], spin: next() * 6 });
            }

            for (let k = 0; k < 3; k++) {
                const angle = (k / 3) * Math.PI * 2 + next();

                put(g.log, m.char, [Math.cos(angle) * 0.12, Math.sin(angle) * 0.12], { up: 0.07, scale: [0.75, 0.6, 0.6], spin: angle });
            }

            // (A log rolled up to sit on, the fire's far side from the lean-to)
            put(g.log, m.wood, [0, 1.7], { up: 0.12, scale: [1.6, 1.15, 1.15], spin: (next() - 0.5) * 0.3 });

            // (The lean-to: a ridge pole on two forked sticks, branches leant on it to the ground)
            for (const across of [-0.9, 0.9]) {
                put(g.pole, m.wood, [across, -1.8], { up: 0.55, scale: [1, 1.1, 1] });
            }

            put(g.pole, m.wood, [0, -1.8], { up: 1.08, scale: [1, 2, 1], roll: Math.PI / 2, spin: Math.PI / 2 });

            for (let k = 0; k < 8; k++) {
                put(g.pole, m.wood, [-0.8 + k * 0.23, -2.3], { up: 0.55, scale: [0.9, 1.3, 0.9], tilt: -0.75 + (next() - 0.5) * 0.1 });
            }
        }

        group.name = `find ${id}`;
        group.position.set(x, base, z);

        return group;
    }
}
