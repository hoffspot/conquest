// Bellhaven's castle on its crag seen in the world (core/terrain/scenes.js: a fixed scene set into
// the land, gone into at its road's end: core/scenery.js): its art's far detail (its catalog's
// `far` model, client/models/assets.json: one low detail of the whole scene, a few draw calls),
// where the land has it, turned to face its road, standing on its own ground. Read once the player's
// within `read` of it, and kept; seen from as far as the far land reaches. Drawn twice, as the
// volcano is (view.js setHorizon): with the far land (its camera reaching to the horizon, cut where
// the near world's ends) and with the near world. Without the art (a build without the licensed
// models), a stand-in: its walk's ground over each patch (the highest of its floors there, or else
// the lowest of the scene), stone grey. Only for the eye: the rules have its walk and the land.

import * as THREE from "three";
import { readyScenery, sceneryOf } from "../beasts/model.js";
import { SCENERY } from "../core/scenery.js";
import { scenesIn } from "../core/terrain/height.js";
import { NONE } from "../core/walk.js";

/**
 * How near the player comes before the art's read (metres from the scene's middle: as far as the
 * far land reaches at High, and more), and the stand-in's colour (sRGB).
 */
export const LANDMARK = Object.freeze({ read: 2600, stone: 0x8a8580 });

// A scene's stand-in: its walk's ground over each patch of what's under it (`under`'s grid), at the
// highest of its floors there, or the lowest of it where it has none; none over a patch nothing's
// over. In the scene's own metres.
function standIn(scene) {
    const { walk } = scene;
    const { square, origin, size, heights } = walk.under;
    const [width, depth] = size;
    const top = Float32Array.from(heights, (h) => (h === NONE ? NaN : h / 100));
    const level = walk.levels[0];
    const across = level.box[2] - level.box[0] + 1;

    // (The highest floor over each patch)
    for (let z = level.box[1]; z <= level.box[3]; z++) {
        for (let x = level.box[0]; x <= level.box[2]; x++) {
            const h = level.heights[(z - level.box[1]) * across + (x - level.box[0])];

            if (h !== NONE) {
                const [px, pz] = [Math.floor((walk.origin[0] + x + 0.5 - origin[0]) / square), Math.floor((walk.origin[1] + z + 0.5 - origin[1]) / square)];
                const k = pz * width + px;

                if (px >= 0 && pz >= 0 && px < width && pz < depth) {
                    top[k] = Number.isNaN(top[k]) ? h / 100 : Math.max(top[k], h / 100);
                }
            }
        }
    }

    const positions = [];
    const corner = (x, z) => [origin[0] + (x + 0.5) * square, top[z * width + x], origin[1] + (z + 0.5) * square];

    for (let z = 0; z < depth - 1; z++) {
        for (let x = 0; x < width - 1; x++) {
            const [a, b, c, d] = [corner(x, z), corner(x + 1, z), corner(x, z + 1), corner(x + 1, z + 1)];

            if ([a, b, c, d].some(([, y]) => Number.isNaN(y))) {
                continue;
            }

            positions.push(...a, ...c, ...b, ...b, ...c, ...d);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: LANDMARK.stone, name: "landmark stand-in" }));

    mesh.name = "landmark stand-in";

    return mesh;
}

/**
 * The scenes set into a world's land, drawn where it has them: `far` and `near`, for view.js
 * setHorizon; update(x, z) as the player moves (reading each one's art once they're near enough);
 * dispose().
 */
export class Landmarks {
    constructor(plan) {
        this.far = new THREE.Group();
        this.near = new THREE.Group();
        this.far.name = "landmarks";
        this.near.name = "landmarks (near)";
        this.scenes = scenesIn(plan).map((placed) => {
            // (Each turned and set where the land has it, its own 0 at its `base`; the art and the
            // stand-in in its own metres, from its middle)
            const [far, near] = [new THREE.Group(), new THREE.Group()];

            for (const group of [far, near]) {
                group.name = SCENERY[placed.scene.id].name;
                group.position.set(placed.at[0], placed.base, placed.at[1]);
                group.rotation.y = placed.facing;
                this[group === far ? "far" : "near"].add(group);
            }

            return { placed, far, near, asked: null, drawn: null };
        });
    }

    /** As the player moves (at x, z, metres): each scene's art read once they're near enough. */
    update(x, z) {
        for (const each of this.scenes) {
            const { placed } = each;
            const asset = SCENERY[placed.scene.id].far;

            if (each.drawn || Math.hypot(x - placed.at[0], z - placed.at[1]) > LANDMARK.read) {
                continue;
            }

            if (sceneryOf(asset)) {
                this.#draw(each, (gltf) => gltf.scene.clone(), sceneryOf(asset));
            } else if (each.asked === null) {
                // (Asked for once: drawn when it's read, or its stand-in if it can't be)
                each.asked = readyScenery(asset) ?? false;

                if (each.asked) {
                    each.asked.ready.then(() => {
                        if (!each.drawn && !this.disposed) {
                            const gltf = sceneryOf(asset);

                            this.#draw(each, gltf ? (art) => art.scene.clone() : () => standIn(placed.scene), gltf);
                        }
                    });
                } else {
                    this.#draw(each, () => standIn(placed.scene), null);
                }
            }
        }
    }

    // A scene drawn: a copy for each of the far land and the near world, from its middle
    #draw(each, make, gltf) {
        const { scene } = each.placed;

        for (const group of [each.far, each.near]) {
            const object = make(gltf);

            object.position.set(-scene.middle[0], 0, -scene.middle[1]);
            object.traverse((part) => {
                if (part.isMesh) {
                    part.castShadow = false;
                    part.receiveShadow = false;
                    part.frustumCulled = true;
                }
            });
            object.updateMatrixWorld(true);
            group.add(object);
        }

        each.drawn = gltf ? "art" : "stand-in";
    }

    dispose() {
        this.disposed = true;

        for (const { far, near } of this.scenes) {
            for (const group of [far, near]) {
                group.traverse((part) => {
                    // (The art's own geometry is the model's, kept by beasts/model.js; the stand-in's is ours)
                    if (part.isMesh && part.name === "landmark stand-in") {
                        part.geometry.dispose();
                        part.material.dispose();
                    }
                });
                group.clear();
            }
        }
    }
}
