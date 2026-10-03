// The torches carried at night (the terrain plan's M7e, §9 Day and night: "the guards on night
// watch carrying torches"): each soldier with a hand free (core/light.js carriesTorch) holding one
// in place of their shield from half through the dusk to half through the dawn (Character
// holdTorch), its flame (fire.js's, a torch's) burning at its head wherever they go, and lighting
// what's round it as the world's torches do, a light of its own (lights.js). In the rules they
// light their way too: what's near them is seen as by day (core/light.js).

import * as THREE from "three";
import { fireSeed, firesMesh } from "./fire.js";

const _at = new THREE.Vector3();

export class CarriedTorches {
    /** @param {THREE.Scene} scene */
    constructor(scene) {
        this.group = new THREE.Group();
        this.group.name = "carried torches";
        scene.add(this.group);

        // Those carrying one (by their id): { character, torch, flames, light }
        this.carried = new Map();

        // Their lights (lights.js lightNow's: { x, y, z, kind "torch", seed, out }), the same list each time
        this.list = [];
    }

    /**
     * Who carries a torch now (`carriers`: { id, character, shown } each, `shown` whether they're
     * drawn): their torches taken up, burning at their heads; anyone else's put out.
     */
    update(carriers) {
        const now = new Set();

        for (const { id, character, shown } of carriers) {
            now.add(id);

            let held = this.carried.get(id);

            if (!held || held.character !== character) {
                this.#putOut(id);

                const torch = character.holdTorch(true);
                const flames = firesMesh([{ x: 0, y: 0, z: 0, kind: "torch", seed: fireSeed({ x: id.length * 7.1, y: 1.3, z: hashOf(id) }) }]);

                held = { character, torch, flames, light: { x: 0, y: 0, z: 0, kind: "torch", seed: (hashOf(id) * 0.618) % 1, out: null } };
                this.group.add(flames);
                this.carried.set(id, held);
            }

            // (Its flame where its head is, in the world, as the hand that holds it was last drawn)
            held.torch.updateWorldMatrix(true, false);
            _at.copy(held.torch.userData.flame).applyMatrix4(held.torch.matrixWorld);
            held.flames.position.copy(_at);
            held.flames.visible = shown;
            Object.assign(held.light, { x: _at.x, y: _at.y, z: _at.z });
        }

        for (const id of [...this.carried.keys()]) {
            if (!now.has(id)) {
                this.#putOut(id);
            }
        }

        this.list.length = 0;

        for (const { flames, light } of this.carried.values()) {
            if (flames.visible) {
                this.list.push(light);
            }
        }
    }

    /** The carried torches' lights now (lights.js's: each its own). */
    lights() {
        return this.list;
    }

    // Someone's torch put out: their shield taken up again, its flame gone
    #putOut(id) {
        const held = this.carried.get(id);

        if (!held) {
            return;
        }

        held.character.holdTorch(false);
        held.flames.removeFromParent();
        held.flames.traverse((part) => part.geometry?.dispose());
        this.carried.delete(id);
    }

    /** Every torch put out (the game's over, or the world's being let go). */
    dispose() {
        for (const id of [...this.carried.keys()]) {
            this.#putOut(id);
        }

        this.group.removeFromParent();
    }
}

// A number from an id (0 to 1000): each torch's own flicker
function hashOf(id) {
    let hash = 0;

    for (let k = 0; k < id.length; k++) {
        hash = (hash * 31 + id.charCodeAt(k)) % 1000;
    }

    return hash;
}
