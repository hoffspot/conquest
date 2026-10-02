// The peoples' banners (docs/WAR.md M2): a pole at each way out of a town the war's come to life
// in, flying the colours and emblem of whoever holds it. When the town changes hands, its
// banners come down, and the new holders' go up.
//
// Each people's cloth (its colour, a trim, its emblem: a crown for the humans, a leaf for the
// elves, a spider for the dark elves, a sun for the cat folk, a serpent for the lizard folk, a skull
// for the orcs) is the one the banners in their towns are (cloth.js), waving in the same breeze; a
// town's are drawn in one mesh.

import * as THREE from "three";
import { clothMesh } from "./cloth.js";

// A banner's size (metres): the pole's height, the cloth's width and drop, and how far the cloth
// hangs below the pole's top
const POLE = Object.freeze({ height: 4.2, radius: 0.05 });
const CLOTH = Object.freeze({ width: 0.9, drop: 1.6, below: 0.25 });

export class Banners {
    /** @param {THREE.Object3D} parent - What the banners go in (the scene). */
    constructor(parent) {
        this.group = new THREE.Group();
        this.group.name = "banners";
        parent.add(this.group);

        // The pole's shapes, shared by every banner
        this.pole = new THREE.CylinderGeometry(POLE.radius, POLE.radius * 1.3, POLE.height, 6);
        this.bar = new THREE.CylinderGeometry(POLE.radius * 0.7, POLE.radius * 0.7, CLOTH.width + 0.2, 5);
        this.wood = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.9 });

        /** Each town's banners, by its id: { people, objects (the last its cloths) }. */
        this.towns = new Map();

        /** The ground's height at a point ((x, z) => metres: set with setGround). */
        this.groundAt = () => 0;
    }

    /** Put banners up on this ground (its height at a point, (x, z) => metres; null: flat at 0). */
    setGround(at) {
        this.groundAt = at ?? (() => 0);
    }

    /**
     * Put up a town's banners: `people` (whose they are: its holders), at each spot ({ x, z (world
     * metres), y (the ground: or where the ground is there), facing (radians, as the battle has
     * it) }). Any it had come down.
     */
    raise(townId, people, spots) {
        this.lower(townId);

        const cloths = [];
        const objects = spots.map(({ x, z, y = this.groundAt(x, z), facing }) => {
            const banner = new THREE.Group();
            const pole = new THREE.Mesh(this.pole, this.wood);
            const bar = new THREE.Mesh(this.bar, this.wood);
            // (Its cloth faces the way the guards do: out along the road)
            const out = [Math.sin(facing), 0, Math.cos(facing)];

            pole.position.y = POLE.height / 2;
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, POLE.height - CLOTH.below, 0.02);

            for (const mesh of [pole, bar]) {
                mesh.castShadow = true;
            }

            banner.add(pole, bar);
            banner.position.set(x, y, z);
            banner.rotation.y = facing;
            banner.name = `banner:${townId}`;
            this.group.add(banner);
            cloths.push({ at: [x + out[0] * 0.05, y + POLE.height - CLOTH.below, z + out[2] * 0.05], out, width: CLOTH.width, drop: CLOTH.drop, kind: "hang", look: people });

            return banner;
        });
        const cloth = clothMesh(cloths);

        if (cloth) {
            cloth.name = `cloth:${townId}`;
            this.group.add(cloth);
            objects.push(cloth);
        }

        this.towns.set(townId, { people, objects });
    }

    /** Take a town's banners down. */
    lower(townId) {
        for (const banner of this.towns.get(townId)?.objects ?? []) {
            banner.removeFromParent();

            // (Its cloths' corners its own)
            if (banner.name.startsWith("cloth:")) {
                banner.geometry.dispose();
            }
        }

        this.towns.delete(townId);
    }

    /** Take everything away. */
    dispose() {
        for (const id of [...this.towns.keys()]) {
            this.lower(id);
        }

        this.group.removeFromParent();

        for (const geometry of [this.pole, this.bar]) {
            geometry.dispose();
        }

        this.wood.dispose();
    }
}
