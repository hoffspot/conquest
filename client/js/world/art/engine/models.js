// Ready-made 3D models (glTF), lit like the rest of the art: KayKit's trees, props and landmark
// buildings (client/models/kaykit, CC0).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
const loaded = new Map();

/**
 * Where to read models' files from: `resolve(url)` gives the URL to load instead (the game's
 * loader hands out its downloaded copies).
 */
export function readModelsFrom(resolve) {
    manager.setURLModifier(resolve);
}

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
            // Lambert shading, like the rest of the town (cheaper than the glTF's PBR materials)
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
 * the footprint (or on `at`, in world pixels), turned `turn` radians about the vertical, and
 * either `unit` world pixels per model unit or `size` world pixels at its longest (across or up).
 */
export function placeModel(object, { w, h }, { unit, size, turn = 0, at } = {}) {
    const holder = new THREE.Group();
    const turned = new THREE.Group();

    turned.add(object);
    turned.rotation.y = turn;

    if (size) {
        const extent = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

        unit = size / Math.max(extent.x, extent.y, extent.z);
    }

    turned.scale.setScalar(unit);
    turned.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(turned);
    const centre = box.getCenter(new THREE.Vector3());
    const [x, z] = at ?? [(w * 20) / 2, (h * 20) / 2];

    turned.position.set(x - centre.x, -box.min.y, z - centre.z);
    holder.add(turned);

    return holder;
}
