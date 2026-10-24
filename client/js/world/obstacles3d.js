// What the wilds director's put across the way (core/director.js OBSTACLES), as it's seen once a
// player's near (app/game.js #obstaclesNear), over the squares it lies on:
// - a fallen tree: its trunk on the ground the length of them, its roots torn up out of the earth
//   at one end in a plate of soil, broken branches and a little dead leaf at the other;
// - a rockslide: boulders heaped over them, the biggest in the middle, stones scattered round.
// Drawn for as many as are near at once (OBSTACLE_LOOK.seen); their shapes and stuff made once,
// shared.

import * as THREE from "three";

/**
 * How they look: how near the player one's drawn (`seen`, metres), how much further than it a tap
 * on it is (`tap`, metres), and the colours of bark, the trunk's broken wood, soil, dead leaves and
 * rock.
 */
export const OBSTACLE_LOOK = Object.freeze({ seen: 140, tap: 0.3, bark: 0x4e3b2a, wood: 0x9c7c55, soil: 0x4a3a2a, leaves: 0x5d5a2e, rock: 0x7a746c, stone: 0x66615b });

// A number from 0 up to 1, the same for a seed and a step (an obstacle's own dice)
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

// An obstacle's seed, from its id
const seedOf = (id) => [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 11) >>> 0;

export class ObstacleProps {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.geometries = null;
        this.materials = null;

        /** What's drawn, by the obstacle's id: its group. */
        this.shown = new Map();

        /** Where each drawn one is, to be tapped (by its id: a box round it, a little wider: OBSTACLE_LOOK.tap). */
        this.boxes = new Map();
    }

    /** What's across the way a ray (THREE.Ray, from the camera through a point on the screen) meets first: its id, or null. */
    at(ray) {
        let found = null;
        let nearest = Infinity;
        const hit = new THREE.Vector3();

        for (const [id, box] of this.boxes) {
            if (ray.intersectBox(box, hit) && ray.origin.distanceTo(hit) < nearest) {
                [found, nearest] = [id, ray.origin.distanceTo(hit)];
            }
        }

        return found;
    }

    /**
     * What's across the way to show (`obstacles`: [{ id, kind ("tree" or "rocks"), x, z (its
     * middle, world metres), width, depth (metres it lies over, along x and along z) }]), each set
     * on the ground (`groundAt(x, z)`: its height there), and those no longer in it let go.
     */
    set(obstacles, groundAt) {
        const wanted = new Set(obstacles.map(({ id }) => id));

        for (const [id, group] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(group);
                this.shown.delete(id);
                this.boxes.delete(id);
            }
        }

        for (const obstacle of obstacles) {
            if (!this.shown.has(obstacle.id)) {
                const group = this.#build(obstacle, groundAt);

                this.scene.add(group);
                this.shown.set(obstacle.id, group);
                group.updateMatrixWorld(true);
                this.boxes.set(obstacle.id, new THREE.Box3().setFromObject(group).expandByScalar(OBSTACLE_LOOK.tap));
            }
        }
    }

    dispose() {
        for (const group of this.shown.values()) {
            this.scene.remove(group);
        }

        this.shown.clear();
        this.boxes.clear();

        for (const each of [...Object.values(this.geometries ?? {}), ...Object.values(this.materials ?? {})]) {
            each.dispose();
        }
    }

    // An obstacle of its kind, its pieces each on the ground where it lies, along the longer way
    #build({ id, kind, x, z, width, depth }, groundAt) {
        this.geometries ??= {
            trunk: new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2),
            disc: new THREE.CylinderGeometry(1, 1, 1, 14),
            stone: new THREE.DodecahedronGeometry(1, 0),
            leaf: new THREE.IcosahedronGeometry(1, 0),
        };
        this.materials ??= {
            bark: new THREE.MeshStandardMaterial({ color: OBSTACLE_LOOK.bark, roughness: 0.95 }),
            wood: new THREE.MeshStandardMaterial({ color: OBSTACLE_LOOK.wood, roughness: 0.85 }),
            soil: new THREE.MeshStandardMaterial({ color: OBSTACLE_LOOK.soil, roughness: 1 }),
            leaves: new THREE.MeshStandardMaterial({ color: OBSTACLE_LOOK.leaves, roughness: 1 }),
            rock: new THREE.MeshStandardMaterial({ color: OBSTACLE_LOOK.rock, roughness: 0.95, flatShading: true }),
            stone: new THREE.MeshStandardMaterial({ color: OBSTACLE_LOOK.stone, roughness: 0.95, flatShading: true }),
        };

        const group = new THREE.Group();
        const next = dice(seedOf(id));
        const base = groundAt(x, z);
        const { geometries: g, materials: m } = this;
        // (Along its length: east to west, or north to south)
        const [long, deep, turn] = width >= depth ? [width, depth, 0] : [depth, width, Math.PI / 2];

        // (A piece at [along, across] metres from its middle, turned with it, `up` above the
        // ground there, `scale` big, turned `spin` about its own up and tipped `tilt`)
        const put = (geometry, material, [along, across], { up = 0, scale = [1, 1, 1], spin = 0, tilt = 0, roll = 0 } = {}) => {
            const mesh = new THREE.Mesh(geometry, material);
            const [dx, dz] = [along * Math.cos(turn) + across * Math.sin(turn), -along * Math.sin(turn) + across * Math.cos(turn)];

            mesh.position.set(dx, groundAt(x + dx, z + dz) - base + up, dz);
            mesh.scale.set(...scale);
            mesh.rotation.set(tilt, turn + spin, roll);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            return mesh;
        };

        if (kind === "tree") {
            // (The trunk the length of it, thicker at the roots' end, lying on the ground)
            const thick = 0.32 + next() * 0.08;
            const sag = (next() - 0.5) * 0.12;

            put(g.trunk, m.bark, [-long * 0.22, 0], { up: thick * 1.05, scale: [long * 0.62, thick * 1.12, thick * 1.12], spin: sag });
            put(g.trunk, m.bark, [long * 0.28, 0], { up: thick * 0.95, scale: [long * 0.5, thick * 0.85, thick * 0.85], spin: sag });

            // (Its roots torn up in a plate of soil, standing on edge at one end)
            put(g.disc, m.soil, [-long / 2 - 0.15, 0], { up: 0.95, scale: [1.15, 0.35, 1.05], roll: Math.PI / 2 });

            for (let k = 0; k < 5; k++) {
                const angle = (k / 5) * Math.PI * 2 + next();

                put(g.trunk, m.bark, [-long / 2 - 0.25, Math.cos(angle) * 0.7], { up: 0.95 + Math.sin(angle) * 0.7, scale: [0.6, 0.07, 0.07], spin: Math.PI / 2 + (next() - 0.5) * 0.8, roll: angle });
            }

            // (Broken branches at the crown's end, a little dead leaf on them; the snapped wood pale)
            for (let k = 0; k < 4; k++) {
                const side = k % 2 ? 1 : -1;

                put(g.trunk, m.bark, [long / 2 - 0.4 - k * 0.5, side * 0.45], { up: 0.55 + next() * 0.25, scale: [0.9 + next() * 0.6, 0.08, 0.08], spin: side * (0.7 + next() * 0.4), roll: 0.35 });
                put(g.leaf, m.leaves, [long / 2 - 0.1 - k * 0.45, side * (0.8 + next() * 0.3)], { up: 0.45, scale: [0.42, 0.3, 0.38], spin: next() * 6 });
            }

            put(g.disc, m.wood, [long / 2 + 0.02, 0], { up: thick * 0.95, scale: [thick * 0.8, 0.02, thick * 0.8], roll: Math.PI / 2 });
        } else {
            // (Boulders heaped over it, the biggest in its middle, smaller ones round them)
            for (let k = 0; k < 9; k++) {
                const [along, across] = [(next() - 0.5) * (long - 0.8), (next() - 0.5) * (deep - 0.6)];
                const big = (0.45 + next() * 0.4) * (1 - (Math.abs(along) / long) * 0.6);

                put(g.stone, m.rock, [along, across], { up: big * 0.55, scale: [big * (1 + next() * 0.3), big * 0.8, big * (1 + next() * 0.3)], spin: next() * 6, tilt: (next() - 0.5) * 0.6 });
            }

            for (let k = 0; k < 10; k++) {
                const [along, across] = [(next() - 0.5) * (long + 1.2), (next() - 0.5) * (deep + 1)];
                const small = 0.1 + next() * 0.12;

                put(g.stone, m.stone, [along, across], { up: small * 0.5, scale: [small, small * 0.8, small], spin: next() * 6 });
            }
        }

        group.name = `obstacle ${id}`;
        group.position.set(x, base, z);

        return group;
    }
}
