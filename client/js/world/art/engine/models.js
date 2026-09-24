// Ready-made 3D models (glTF), lit like the rest of the art: KayKit's trees, props and landmark
// buildings (tools/artgen/models/kaykit, CC0), and the game's own units for size comparisons.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const loaded = new Map();

/** A copy of the model in a glTF file, with materials the art's lights work with. */
export async function loadModel(url) {
    if (!loaded.has(url)) {
        loaded.set(url, loader.loadAsync(url).then(({ scene }) => scene));
    }

    const object = (await loaded.get(url)).clone(true);

    object.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        const convert = (source) => {
            // The glTF materials are PBR, which look black without an environment; Lambert shading
            // matches the rest of the art (and units3d.js)
            const result = new THREE.MeshLambertMaterial({
                name: source.name,
                color: source.color?.clone() ?? new THREE.Color(0xffffff),
                map: source.map ?? null,
                vertexColors: source.vertexColors ?? false,
                side: source.side ?? THREE.FrontSide,
            });

            result.shadowSide = THREE.DoubleSide;

            return result;
        };

        node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
        node.castShadow = true;
        node.receiveShadow = true;
    });

    return object;
}

/**
 * Place a model on a piece's footprint (w x h grid squares): standing on the ground, centred on
 * the footprint (or on `at`, in world pixels), `unit` world pixels per model unit, turned `turn`
 * radians about the vertical.
 */
export function placeModel(object, { w, h }, { unit, turn = 0, at } = {}) {
    const holder = new THREE.Group();
    const turned = new THREE.Group();

    turned.add(object);
    turned.rotation.y = turn;
    turned.scale.setScalar(unit);
    turned.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(turned);
    const centre = box.getCenter(new THREE.Vector3());
    const [x, z] = at ?? [(w * 20) / 2, (h * 20) / 2];

    turned.position.set(x - centre.x, -box.min.y, z - centre.z);
    holder.add(turned);

    return holder;
}
