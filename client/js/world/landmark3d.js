// Bellhaven's castle on its crag seen in the world (core/terrain/scenes.js: a fixed scene set into
// the land, gone into at its road's end: core/scenery.js): its art's far detail (its catalog's
// `far` model, client/models/assets.json: one low detail of the whole scene, a few draw calls),
// where the land has it, turned to face its road, standing on its own ground. Read once the player's
// within `read` of it, and kept; seen from as far as the far land reaches. Drawn twice, as the
// volcano is (view.js setHorizon): with the far land (its camera reaching to the horizon, cut where
// the near world's ends) and with the near world. Not faded out with the near world (world/fog.js):
// it goes on into the far land, as the ground does. Its own terrain (scenes.js `ground`) is drawn as
// the world's ground is (ground.js groundMaterial: its grass, its rock, the land's colours there),
// all of it, so all that stands on it (its crag's rocks, its castle) stands on the ground it was
// made on; on the open ground leading up to it and round it (scenes.js `open`), it's sunk under
// the world's land, which is drawn there with its trees, and its grass. Without the art (a build
// without the licensed models), a stand-in: the top of its ground over each patch but the open
// (scenes.js), stone grey. Only for the eye: the rules have its walk and the land.

import * as THREE from "three";
import { readyScenery, sceneryOf } from "../beasts/model.js";
import { SCENERY } from "../core/scenery.js";
import { scenesIn } from "../core/terrain/height.js";
import { groundMaterial } from "./ground.js";
import { contactFor, DRESS, dressUniforms, footed, heightsOf, landOf, mistOf, screeOf } from "./landmarkdress.js";

/**
 * How near the player comes before the art's read (metres from the scene's middle: as far as the
 * far land reaches at High, and more), the stand-in's colour (sRGB), and how far under the world's
 * land a scene's own terrain's sunk on the open ground (metres: under it wherever the land's laid
 * along it there, scenes.js, as its far model has it, within a metre or two).
 */
export const LANDMARK = Object.freeze({ read: 2600, stone: 0x8a8580, sunk: 4 });

// A scene's stand-in: the top of its ground over each patch of what's under it (scenes.js sceneOf
// `top`: its highest floor there, or round it); or, where it has its own terrain, the top of what
// stands on it (`ground.over`), or of its terrain, but on the open ground, where the world's land
// is (in the scene's own metres)
function standIn(scene) {
    const { square, origin, size } = scene.ground ?? scene.walk.under;
    const [width, depth] = size;
    const { ground } = scene;
    const top = ground ? Float32Array.from(ground.over, (over, k) => (ground.open[k] ? NaN : Number.isNaN(over) ? (ground.has[k] ? ground.top[k] : NaN) : over)) : scene.top;
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
    /**
     * @param {object} plan - The world plan.
     * @param {object} [options]
     * @param {THREE.Texture} [options.land] - The lands' colours (ground.js landColours), as the
     *     world's ground has them: its own terrain's drawn with them.
     */
    constructor(plan, { land = null } = {}) {
        this.plan = plan;
        this.land = land;
        this.grounds = [];
        this.dressed = [];
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

    // A scene's own terrain's material: the world's ground's (its grass, its rock, the land's colours
    // where it is, darkened round what stands on it: `contact`, landmarkdress.js contactFor), sunk
    // LANDMARK.sunk metres under the world's land on the open ground (scenes.js `open`, read between
    // its patches, where its points are in the scene: `sceneFromWorld`)
    #groundOf(placed, sceneFromWorld, contact) {
        const { origin, square, size, open } = placed.scene.ground;
        const mask = new THREE.DataTexture(Uint8Array.from(open, (on) => on * 255), size[0], size[1], THREE.RedFormat, THREE.UnsignedByteType);
        const material = groundMaterial({ land: this.land, contact });
        const own = material.onBeforeCompile;
        const key = material.customProgramCacheKey;

        mask.magFilter = THREE.LinearFilter;
        mask.minFilter = THREE.LinearFilter;
        mask.needsUpdate = true;
        material.name = "landmark ground";
        material.onBeforeCompile = (shader, renderer) => {
            own.call(material, shader, renderer);
            Object.assign(shader.uniforms, {
                sceneOpen: { value: mask },
                sceneOpenArea: { value: new THREE.Vector4(origin[0], origin[1], size[0] * square, size[1] * square) },
                sceneFromWorld: { value: sceneFromWorld },
                sceneSunk: { value: LANDMARK.sunk },
            });
            shader.vertexShader = shader.vertexShader
                .replace(
                    "#include <common>",
                    `#include <common>
uniform sampler2D sceneOpen;
uniform vec4 sceneOpenArea;
uniform mat4 sceneFromWorld;
uniform float sceneSunk;`,
                )
                .replace(
                    "#include <begin_vertex>",
                    `#include <begin_vertex>
{
    vec2 sceneAt = (sceneFromWorld * modelMatrix * vec4(transformed, 1.0)).xz;
    float sunk = textureLod(sceneOpen, (sceneAt - sceneOpenArea.xy) / sceneOpenArea.zw, 0.0).r * sceneSunk;

    transformed += inverse(mat3(modelMatrix)) * vec3(0.0, -sunk, 0.0);
}`,
                );
        };
        material.customProgramCacheKey = () => `${key.call(material)}+landmark`;
        this.grounds.push({ material, mask });

        return material;
    }

    // A scene drawn: a copy for each of the far land and the near world, from its middle; its own
    // terrain drawn as the world's ground is (scenes.js `ground`). With its art, its dressing
    // (landmarkdress.js): the heights of what's drawn, its ground darkened round what stands on
    // it, its rocks and walls at their feet, boulders and scree along its crag's foot, mist in its
    // chasm
    #draw(each, make, gltf) {
        const { placed } = each;
        const { scene, at, base, facing } = placed;
        const terrain = new Set(scene.ground?.materials ?? []);
        const objects = [make(gltf), make(gltf)];

        for (const object of objects) {
            object.position.set(-scene.middle[0], 0, -scene.middle[1]);
        }

        // (From the world to the scene's own metres: its middle at its spot, turned to face its road)
        const sceneFromWorld = new THREE.Matrix4()
            .makeRotationY(facing)
            .setPosition(at[0], base, at[1])
            .multiply(new THREE.Matrix4().makeTranslation(-scene.middle[0], 0, -scene.middle[1]))
            .invert();
        const heights = gltf ? heightsOf(objects[0], scene.box, terrain) : null;
        const uniforms = heights && dressUniforms(heights, sceneFromWorld);
        const contact = heights && contactFor(placed, heights);
        // (A ground material of its own for each copy: one material drawn in both passes, its
        // lights and its haze changed between them, drew its terrain past the near world as a pale
        // sheet the land and its rocks showed through)
        const grounds = objects.map(() => (gltf && terrain.size ? this.#groundOf(placed, sceneFromWorld, contact) : null));
        // (Each of its art's materials once, darkened at its feet, not faded with the near world)
        const footedOf = new Map();
        const own = (material) => {
            if (!footedOf.has(material)) {
                footedOf.set(material, footed(material, DRESS.rocks.test(material.name) ? "rock" : "wall", uniforms));
            }

            return footedOf.get(material);
        };

        objects.forEach((object, k) => {
            object.traverse((part) => {
                if (part.isMesh && [part.material].flat().some((material) => terrain.has(material?.name))) {
                    part.material = grounds[k];
                    part.castShadow = false;
                    part.receiveShadow = false;

                    return;
                }

                if (part.isMesh) {
                    part.castShadow = false;
                    part.receiveShadow = false;
                    part.frustumCulled = true;

                    if (uniforms) {
                        part.material = Array.isArray(part.material) ? part.material.map(own) : own(part.material);
                    } else {
                        // (Not faded out where the near world is, before its camera stops: it goes on
                        // into the far land, as the ground does, world/fog.js)
                        for (const material of [part.material].flat()) {
                            if (!("NO_NEAR_FADE" in (material.defines ?? {}))) {
                                material.defines = { ...material.defines, NO_NEAR_FADE: "" };
                                material.needsUpdate = true;
                            }
                        }
                    }
                }
            });
            object.updateMatrixWorld(true);
            [each.far, each.near][k].add(object);
        });

        if (heights) {
            this.#dress(each, heights, uniforms, [...footedOf.values()]);
        }

        each.drawn = gltf ? "art" : "stand-in";
    }

    // A scene's dressing (landmarkdress.js) put with its art, in its own metres: its mist, drawn by
    // how far off each puff is, with the one or the other; its boulders with both; its scree with
    // the near world
    #dress(each, heights, uniforms, materials) {
        const { placed } = each;
        const { scene } = placed;
        const seed = (Math.imul(Math.round(placed.at[0]), 73856093) ^ Math.imul(Math.round(placed.at[1]), 19349663)) >>> 0;
        const mist = mistOf(scene.id, heights, uniforms, seed);
        const scree = screeOf(placed, heights, landOf(this.plan), seed);
        const [far, near] = [new THREE.Group(), new THREE.Group()];

        for (const group of [far, near]) {
            group.name = "landmark dressing";
            group.position.set(-scene.middle[0], 0, -scene.middle[1]);
        }

        if (mist) {
            far.add(mist.far);
            near.add(mist.near);
        }

        if (scree) {
            far.add(scree.far);
            near.add(scree.near);
        }

        each.far.add(far);
        each.near.add(near);
        each.dressing = { mist: mist?.puffs ?? 0, boulders: scree?.boulders ?? 0 };
        this.dressed.push({ uniforms, materials, mist, scree });
    }

    dispose() {
        this.disposed = true;

        for (const { material, mask } of this.grounds) {
            material.userData.contact?.dispose();
            material.dispose();
            mask.dispose();
        }

        for (const { uniforms, materials, mist, scree } of this.dressed) {
            uniforms.landmarkHeights.value.dispose();
            materials.forEach((material) => material.dispose());
            mist?.geometry.dispose();
            mist?.far.material.dispose();
            mist?.near.material.dispose();
            scree?.geometries.forEach((geometry) => geometry.dispose());
        }

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
