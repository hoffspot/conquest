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
import { releaseCompressed } from "../../release.js";

// How many workers turn KTX2 textures into what the GPU takes, at most (each holds the
// transcoder's WebAssembly; a texture takes a few hundredths of a second)
const KTX2_WORKERS = 2;

// How long those workers are kept with nothing being read (ms): then let go of, and made again
// when the next picture's read (resting, below)
const KTX2_REST = 60000;

// A timer that keeps nothing running just to wait for it (Node's, in the tests)
const waiting = (call, ms) => {
    const timer = setTimeout(call, ms);

    timer?.unref?.();

    return timer;
};

/**
 * Work told of as it begins and ends (`began()`, `ended()`: any number of them going at once), and
 * `rest()` called once none's been going for `after` ms (the returned `after`: it can be changed);
 * never while any is, and once for each quiet spell. `set` and `clear`: setTimeout and
 * clearTimeout.
 */
export function restingAfter(after, rest, { set = waiting, clear = clearTimeout } = {}) {
    let going = 0;
    let timer = null;
    const resting = {
        after,
        began() {
            going++;

            if (timer !== null) {
                clear(timer);
                timer = null;
            }
        },
        ended() {
            going = Math.max(0, going - 1);

            if (going === 0 && timer === null) {
                timer = set(() => {
                    timer = null;
                    rest();
                }, resting.after);
            }
        },
    };

    return resting;
}

const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const fetcher = new THREE.FileLoader(manager).setResponseType("arraybuffer");

// What's read here and kept for good, by its address: each model given out as a copy (loadModel:
// its scene), and each file as it is (loadGltf: its scene, with its meshes' shapes, its materials
// and their pictures, and its clips). Neither forgets, so what's read through them (the props,
// what's carried, the chest, a dungeon's and a siege's pieces, the labs') stays for the session;
// nothing of the file itself does (its bytes, its map: read, below)
const loaded = new Map();
const files = new Map();
let ktx2 = null;

// The transcoder's workers let go of once nothing's been read for a while (KTX2_REST): each holds
// the transcoder's WebAssembly, whose memory grows to the biggest picture it's turned (a scene's
// kit's are 2048 across) and never shrinks, counted by nothing, and three.js keeps them for as
// long as its loader. The loader itself is kept, with the transcoder's files as fetched: the next
// picture read has them made again (a few hundredths of a second, the WebAssembly put together
// anew)
const resting = restingAfter(KTX2_REST, () => ktx2?.workerPool?.dispose());

// Whether the pictures of what's read are let go of off the page once they're on the graphics
// card (readKtx2With's `release`: the game's are)
let releasing = false;

// Every compressed picture of a file as read (its scene's materials', and `materials`: a skin's)
// let go of off the page once it's on the graphics card (world/release.js releaseCompressed): each
// held twice till then, the page's copy as big as the card's (2 to 10 MB a creature's kind on a
// phone, 22 for Bellhaven), and read by nothing. One nothing's drawn with yet keeps its bytes till
// it is: they're its only copy
function releasePictures(gltf) {
    const materials = new Set(gltf.materials ?? []);
    const pictures = new Set();

    gltf.scene?.traverse((node) => {
        for (const material of [node.material ?? []].flat()) {
            materials.add(material);
        }
    });

    for (const material of materials) {
        for (const value of Object.values(material)) {
            if (value?.isCompressedTexture && !value.isCompressedArrayTexture && !value.isCompressedCubeTexture && !pictures.has(value)) {
                pictures.add(value);
                releaseCompressed(value);
            }
        }
    }
}

// A glTF file read: fetched (through the manager, so from the game's downloaded copy where it has
// one), unscrambled if it's a licensed model's, and parsed. What three.js's loader read it with
// (its `parser`) is let go of at once: it holds the file's bytes again, each of its pictures'
// bytes once more, its map as text and as objects and all it made on the way, 4 to 19 MB for a
// creature's model and 24 for a scene's, and nothing reads it once the file's read. `materials`:
// every material in the file, made first (gltf.materials, in the file's order), those no mesh of
// its own wears too (a skin's file is only its materials: beasts/model.js readSkins)
async function read(url, { materials = false } = {}) {
    resting.began();

    try {
        const data = await fetcher.loadAsync(url);
        const gltf = await loader.parseAsync(await readable(data), THREE.LoaderUtils.extractUrlBase(url));

        if (materials) {
            gltf.materials = await gltf.parser.getDependencies("material");
        }

        gltf.parser = null;

        if (releasing) {
            releasePictures(gltf);
        }

        return gltf;
    } finally {
        resting.ended();
    }
}

/**
 * A glTF file as it is ({ scene, animations }: its materials and animations its own), read once
 * and shared (copy its scene to use it: scene.clone(true)); with `materials`, every material in
 * it too ({ materials }: read's). One that couldn't be read is read again the next time it's
 * asked for.
 */
export function loadGltf(url, { materials = false } = {}) {
    const key = materials ? `${url}#materials` : url;

    if (!files.has(key)) {
        files.set(
            key,
            read(url, { materials }).catch((error) => {
                files.delete(key);
                throw error;
            }),
        );
    }

    return files.get(key);
}

/**
 * A glTF file read afresh, not kept here ({ scene, animations }; with `materials`, every material
 * in it too: read's): one read from a downloaded copy (a blob: URL, made for the one read), its
 * owner keeping it while it's wanted and letting it go when it isn't (beasts/model.js
 * forgetModels). Kept by its URL, as loadGltf keeps them, such a read would be held for good,
 * every read of it again another copy.
 */
export function readGltf(url, { materials = false } = {}) {
    return read(url, { materials });
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
 * "basis_transcoder.wasm": url }), fetched only once a model has a KTX2 texture. `release`: each
 * file's pictures let go of off the page once they're on the graphics card (releasePictures), as
 * the game's are; not a lab's that sends them again at other sizes or counts them (the castle
 * lab), nor anywhere they're drawn by a second renderer. `rest`: how long the transcoder's
 * workers are kept with nothing being read (ms: KTX2_REST).
 */
export function readKtx2With(renderer, transcoder, { release = false, rest = KTX2_REST } = {}) {
    const fetched = new THREE.LoadingManager();

    releasing = release;
    resting.after = rest;

    // (KTX2Loader asks for them where they're copied beside it, vendor/three-r186/addons/libs/basis:
    // known by their names, they're fetched from where `transcoder` says instead)
    fetched.setURLModifier((url) => transcoder[url.slice(url.lastIndexOf("/") + 1)] ?? url);
    ktx2?.dispose();
    ktx2 = new KTX2Loader(fetched).setWorkerLimit(KTX2_WORKERS).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
}

/** Whether KTX2 pictures can be read (readKtx2With's been said). */
export function readsKtx2() {
    return ktx2 !== null;
}

/**
 * A KTX2 picture's texture, read from its file's bytes (an ArrayBuffer, handed on to the
 * transcoder's worker: it's emptied): a CompressedTexture, its mipmaps in it, as the graphics
 * card takes it. Rejected if KTX2 pictures can't be read yet (readKtx2With).
 */
export function readKtx2(bytes) {
    if (!ktx2) {
        return Promise.reject(new Error("KTX2 pictures can't be read before readKtx2With"));
    }

    resting.began();

    return new Promise((resolve, reject) => ktx2.parse(bytes, resolve, reject)).finally(() => resting.ended());
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
