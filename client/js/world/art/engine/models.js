// Ready-made 3D models (glTF), lit like the rest of the art: KayKit's trees, props and landmark
// buildings (client/models/kaykit, CC0); and, as it is, with its animations, the treasure chest
// (client/models/jmi, MIT: world/drops3d.js). Models compressed with meshoptimizer
// (EXT_meshopt_compression) are read too, and, once the game's said which renderer it draws with
// (readKtx2With), those with KTX2 textures (KHR_texture_basisu), both as utilities/blenderpipeline
// makes them; and the licensed models, served scrambled, unscrambled as they're read
// (app/scramble.js).

import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { readable } from "../../../app/scramble.js";

// How many workers turn KTX2 textures into what the GPU takes, at most (each holds the
// transcoder's WebAssembly; a texture takes a few hundredths of a second)
const KTX2_WORKERS = 2;

const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const fetcher = new THREE.FileLoader(manager).setResponseType("arraybuffer");
const loaded = new Map();
const files = new Map();
let ktx2 = null;

// A glTF file read: fetched (through the manager, so from the game's downloaded copy where it has
// one), unscrambled if it's a licensed model's, and parsed
async function read(url) {
    const data = await fetcher.loadAsync(url);

    return loader.parseAsync(await readable(data), THREE.LoaderUtils.extractUrlBase(url));
}

/**
 * A glTF file as it is ({ scene, animations }: its materials and animations its own), read once
 * and shared (copy its scene to use it: scene.clone(true)). One that couldn't be read is read
 * again the next time it's asked for.
 */
export function loadGltf(url) {
    if (!files.has(url)) {
        files.set(
            url,
            read(url).catch((error) => {
                files.delete(url);
                throw error;
            }),
        );
    }

    return files.get(url);
}

/**
 * Where to read models' files from: `resolve(url)` gives the URL to load instead (the game's
 * loader hands out its downloaded copies).
 */
export function readModelsFrom(resolve) {
    manager.setURLModifier(resolve);
}

/**
 * Lets the models read from now on have KTX2 textures, which the GPU keeps compressed (a quarter
 * of the memory a decoded picture takes, or less), each turned in a worker into the compressed
 * format `renderer`'s GPU takes (ASTC on most phones, BC7 on desktops, ETC2...). `transcoder`:
 * where the Basis Universal transcoder's two files are ({ "basis_transcoder.js": url,
 * "basis_transcoder.wasm": url }), fetched only once a model has a KTX2 texture.
 */
export function readKtx2With(renderer, transcoder) {
    const fetched = new THREE.LoadingManager();

    // (KTX2Loader asks for them where they're copied beside it, vendor/three-r186/addons/libs/basis:
    // known by their names, they're fetched from where `transcoder` says instead)
    fetched.setURLModifier((url) => transcoder[url.slice(url.lastIndexOf("/") + 1)] ?? url);
    ktx2?.dispose();
    ktx2 = new KTX2Loader(fetched).setWorkerLimit(KTX2_WORKERS).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
}

/** A copy of the model in a glTF file, with materials the art's lights work with. */
export async function loadModel(url) {
    if (!loaded.has(url)) {
        loaded.set(url, read(url).then(({ scene }) => scene));
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
