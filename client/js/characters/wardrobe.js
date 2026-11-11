// What a kit keeps of what its characters wear, made once and shared by them: each garment's
// picture, and each outfit's (the garments of one drawn all at once: character.js `merge`), held
// at the size its wearers are seen at (pictures.js).
//
// An outfit's pictures are painted at OUTFIT_SIZE and held at PICTURES.least while everyone
// wearing it is small on the screen, going by its tallest wearer. The game's own bodies
// (`release`) share one material whose two pictures are swapped for bigger or smaller ones in
// place, so whatever else draws with those pictures (a wounded body's own copy of the material:
// world/wounds.js) has the new ones too. Anyone else (a lab's figure, a crowd's figure being
// made, read on the page: world/crowd.js figureOf) has them as they're painted.

import * as THREE from "three";
import { Rig } from "./rig.js";
import { COMPOSITE_BUMP, compositingGarments, GARMENTS, measureBody, paintGarment, paintingGarment, texelMap } from "./garments.js";
import { PICTURES, reducing } from "./pictures.js";
import { allAtOnce } from "../core/steps.js";

/** The size (texels a side) garments' and outfits' pictures are painted at. */
export const OUTFIT_SIZE = 512;

// How many outfits' pictures no one is wearing just now are kept, for the next to wear one
const IDLE_OUTFITS = 8;

/**
 * What's being made for a kit a step at a time (`making`: its steps, a generator's, which keep
 * what they make in the kit's cache as they end) and isn't done yet, by `name`: whoever wants it
 * meanwhile takes steps of the same making, each in its turn, till it's done. So two bodies in
 * one outfit built turn and turn about (app/game.js #nextEnlistee puts one by for a nearer one)
 * make its picture once between them: each used to look for it, find none, and make its own
 * over many steps, and the kit kept the second's, counting one wearer of it for the two (the
 * first's never let go of). Anything a kit keeps that's made across a yield is made through this.
 */
export function* shared(kit, name, making) {
    kit.making ??= new Map();

    let work = kit.making.get(name);

    if (!work) {
        work = { steps: making(), done: false, failed: null };
        kit.making.set(name, work);
    }

    let told;

    while (!work.done) {
        // (Its making failed in another's turn: failed for everyone waiting on it)
        if (work.failed) {
            throw work.failed;
        }

        let step;

        try {
            step = work.steps.next(told);
        } catch (error) {
            // (Not left half made, for the next to want it to trip over: begun again, then)
            work.failed = error;
            kit.making.delete(name);

            throw error;
        }

        if (step.done) {
            work.done = true;
            kit.making.delete(name);
        } else {
            told = yield step.value;
        }
    }
}

/**
 * Something made once for a kit and shared by the characters with it, by key (a cache of them:
 * { value, users }): made by `make` the first time it's wanted, if it isn't there already.
 */
export function take(cache, key, make) {
    if (!cache.has(key)) {
        cache.set(key, { value: make(), users: 0 });
    }

    const entry = cache.get(key);

    entry.users++;

    return entry.value;
}

/**
 * A character no longer using one: once no one is, it's kept for a while, then let go (the
 * longest unused first, beyond `idle` of them unused).
 */
export function letGo(cache, key, idle, dispose) {
    const entry = key !== null && cache?.get(key);

    if (!entry || --entry.users > 0) {
        return;
    }

    cache.delete(key);
    cache.set(key, entry);

    const unused = [...cache].filter(([, other]) => other.users === 0);

    for (const [gone, { value }] of unused.slice(0, Math.max(0, unused.length - idle))) {
        dispose(value);
        cache.delete(gone);
    }
}

/**
 * A body of the usual shape's measurements (garments.js measureBody), made once per kit: what
 * garments are cut to, and painted on, so each fits the same picture on everyone.
 */
export function referenceMeasures(kit) {
    if (!kit.referenceMeasures) {
        const human = kit.human;
        const { positions, joints } = human.shape({});
        const rig = new Rig(human.bones, human.landmarks?.rest);
        let height = 0;

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0) {
                height = Math.max(height, positions[v * 3 + 1]);
            }
        }

        rig.fit(joints);
        kit.referenceMeasures = measureBody({ human, rig, positions, height });
    }

    return kit.referenceMeasures;
}

/**
 * A texture from a painted picture (rows from the top: RGBA, or a byte a texel for heights, which
 * a bump map reads from its red), mipmapped. Its picture stays in `image.data`.
 */
export function dataTexture(data, size, colour) {
    const texture = new THREE.DataTexture(bytesOf(data), size, size, data.length === size * size ? THREE.RedFormat : THREE.RGBAFormat);

    texture.flipY = true;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return texture;
}

/** A picture's bytes as a texture takes them. */
export function bytesOf(data) {
    return new Uint8Array(data.buffer, data.byteOffset, data.length);
}

/**
 * Another picture of the same kind (`data`, `size` a side) put into a texture (dataTexture's) in
 * place of the one it has: the texture's still the one everything drawn with it has, so nothing
 * that shares it need be told. A different size is a new picture on the graphics card (the one
 * it had there let go of).
 */
export function setPicture(texture, data, size) {
    if (texture.image.width !== size) {
        texture.dispose();
        texture.image = { data: bytesOf(data), width: size, height: size };
    } else {
        texture.image.data = bytesOf(data);
    }

    texture.needsUpdate = true;
}

/**
 * A garment's material, its texture painted once per kit; a people's make of one that only
 * differs in colour (`base`: liveries.js), its picture tinted to its colour.
 */
export function garmentMaterial(kit, id) {
    return allAtOnce(readyingGarment(kit, id));
}

/**
 * The same, a step at a time (each a yield: its picture painted a few rows at a time, the first
 * time), returning it. Painted once, whoever else wants it meanwhile (shared).
 */
export function* readyingGarment(kit, id) {
    kit.garmentMaterials ??= new Map();

    while (!kit.garmentMaterials.has(id)) {
        yield* shared(kit, `garment ${id}`, () => makingGarment(kit, id));
    }

    return kit.garmentMaterials.get(id);
}

// A garment's material made, a step at a time, and kept by the kit (readyingGarment)
function* makingGarment(kit, id) {
    const garment = GARMENTS[id];

    if (garment.base) {
        const material = (yield* readyingGarment(kit, garment.base)).clone();
        const [from, to] = [new THREE.Color(GARMENTS[garment.base].colour), new THREE.Color(garment.colour)];

        material.color.setRGB(to.r / Math.max(0.03, from.r), to.g / Math.max(0.03, from.g), to.b / Math.max(0.03, from.b));
        kit.garmentMaterials.set(id, material);

        return;
    }

    if (garment.design) {
        kit.garmentMaterials.set(id, designMaterial(kit, garment));

        return;
    }

    if (!kit.texelMap) {
        kit.texelMap = texelMap(kit.human, OUTFIT_SIZE);
        yield;
    }

    // (Painted on the body of the usual shape, as it's cut)
    const painted = yield* paintingGarment(kit.texelMap, garment, referenceMeasures(kit));
    const material = new THREE.MeshStandardMaterial({
        map: dataTexture(painted.data, painted.size, true),
        bumpMap: dataTexture(painted.bump, painted.size, false),
        bumpScale: garment.metalness ? 0.6 : 1.5,
        roughness: garment.roughness ?? 0.8,
        metalness: garment.metalness ?? 0,
        side: THREE.DoubleSide,
    });

    kit.garmentMaterials.set(id, material);
}

/**
 * Lingerie's material: its design's texture (painted once per kit, white, shared by every
 * colour) tinted, and see-through where the texture is. The texture keeps its colour where
 * it's clear, so the edges of what's there don't darken as it's minified.
 */
function designMaterial(kit, garment) {
    kit.designTextures ??= new Map();

    if (!kit.designTextures.has(garment.design)) {
        kit.texelMap ??= texelMap(kit.human, OUTFIT_SIZE);

        const { data, size } = paintGarment(kit.texelMap, garment);
        const texture = new THREE.DataTexture(new Uint8Array(data.buffer), size, size);

        // (painted rows from the top, as a canvas would be)
        texture.flipY = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        kit.designTextures.set(garment.design, texture);
    }

    return new THREE.MeshStandardMaterial({
        color: garment.colour,
        map: kit.designTextures.get(garment.design),
        roughness: garment.roughness ?? 0.6,
        transparent: true,
        alphaTest: 0.03,
        side: THREE.DoubleSide,
    });
}

// --- Outfits ---

/**
 * The material a character draws an outfit's garments with all at once (ids, outermost last):
 * one picture of them all (garments.js compositeGarments), its heights, roughness and metalness
 * in another; a step at a time (each a yield), returning it. Made once per kit for each outfit,
 * whoever else comes to wear it while it's made (shared), and let go when no one's worn it for a
 * while. The character's counted wearing it (leaveOutfit, when it no longer does). One of the
 * game's (`release`) has its pictures at the size its wearers are seen at (fitOutfit); anyone
 * else, as they're painted, kept on the page.
 */
export function* wearingOutfit(character, ids) {
    const kit = character.kit;
    const key = ids.join(" ");

    kit.composites ??= new Map();

    while (!kit.composites.has(key)) {
        yield* shared(kit, `outfit ${key}`, () => picturing(kit, key, ids));
    }

    const outfit = kit.composites.get(key);

    outfit.users++;
    character.composite = key;

    if (!character.release) {
        outfit.painted ??= outfitMaterial(outfit.full.data, outfit.full.surface, OUTFIT_SIZE);

        return outfit.painted;
    }

    outfit.wearers.add(character);

    if (outfit.sized) {
        fit(outfit);
    } else {
        const size = wantedOf(outfit);
        const { data, surface } = size === OUTFIT_SIZE ? outfit.full : outfit.small;

        outfit.sized = outfitMaterial(data, surface, size);
        outfit.size = size;
    }

    return outfit.sized;
}

// An outfit's pictures made, a step at a time, and kept by the kit (wearingOutfit): as they're
// painted (`full`) and at the least size they're held at (`small`), { data, surface } each
function* picturing(kit, key, ids) {
    kit.texelMap ??= texelMap(kit.human, OUTFIT_SIZE);

    // (Each garment's own picture painted, in steps the first time: then them all)
    for (const id of ids) {
        yield* readyingGarment(kit, id);
        yield;
    }

    const layers = ids.map((id) => {
        const garment = GARMENTS[id];
        const material = garmentMaterial(kit, id);

        return {
            data: material.map.image.data,
            bump: material.bumpMap.image.data,
            tint: garment.base ? material.color.toArray() : null,
            bumpScale: material.bumpScale,
            roughness: material.roughness,
            metalness: material.metalness,
            garment,
        };
    });
    const { data, surface } = yield* compositingGarments(kit.texelMap, layers, referenceMeasures(kit));

    yield;

    const least = Math.min(PICTURES.least, OUTFIT_SIZE);
    const small = { data: yield* reducing(bytesOf(data), OUTFIT_SIZE, least, true), surface: yield* reducing(bytesOf(surface), OUTFIT_SIZE, least, false) };

    kit.composites.set(key, { key, ids, users: 0, wearers: new Set(), full: { data, surface }, small, sized: null, size: 0, painted: null });
    yield;
}

// An outfit's material, from its two pictures (`size` a side)
function outfitMaterial(data, surface, size) {
    const surfaceMap = dataTexture(surface, size, false);
    const material = new THREE.MeshStandardMaterial({
        map: dataTexture(data, size, true),
        bumpMap: surfaceMap,
        bumpScale: COMPOSITE_BUMP,
        roughnessMap: surfaceMap,
        roughness: 1,
        metalnessMap: surfaceMap,
        metalness: 1,
        side: THREE.DoubleSide,
    });

    // (Metal and cloth both: wounds.js tells which is where)
    material.userData.mixed = true;

    return material;
}

// The size an outfit's pictures are wanted at: the biggest any of its wearers (the game's own)
// is seen at, as they're painted for one not yet told how it's seen; the least, worn by none
function wantedOf(outfit) {
    let size = Math.min(PICTURES.least, OUTFIT_SIZE);

    for (const { pictures } of outfit.wearers) {
        size = Math.max(size, Math.min(OUTFIT_SIZE, pictures.wanted ?? OUTFIT_SIZE));
    }

    return size;
}

// An outfit's pictures (the game's own bodies') swapped, in place, for ones the size wanted now
function fit(outfit) {
    const size = wantedOf(outfit);

    if (!outfit.sized || size === outfit.size) {
        return;
    }

    const { data, surface } = size === OUTFIT_SIZE ? outfit.full : outfit.small;

    setPicture(outfit.sized.map, data, size);
    setPicture(outfit.sized.bumpMap, surface, size);
    outfit.size = size;
}

/**
 * A character's outfit's pictures held at the size wanted now, the character seen bigger or
 * smaller than it was (its `pictures.wanted`): the biggest any of its wearers is seen at.
 */
export function fitOutfit(character) {
    const outfit = character.kit.composites?.get(character.composite);

    if (outfit) {
        fit(outfit);
    }
}

/** Whether a character's outfit's pictures are as big as they're painted (true with no outfit). */
export function outfitWhole(character) {
    const outfit = character.kit.composites?.get(character.composite);

    return !outfit?.wearers.has(character) || outfit.size >= OUTFIT_SIZE;
}

/**
 * A character no longer wearing the outfit whose picture it was drawn with: once no one is, it's
 * kept a while (at its least size) for the next to wear it, then let go (the longest unworn
 * first, beyond IDLE_OUTFITS of them unworn).
 */
export function leaveOutfit(character) {
    const composites = character.kit.composites;
    const outfit = character.composite === null ? null : composites?.get(character.composite);

    character.composite = null;

    if (!outfit) {
        return;
    }

    outfit.wearers.delete(character);
    outfit.users--;
    fit(outfit);

    if (outfit.users > 0) {
        return;
    }

    composites.delete(outfit.key);
    composites.set(outfit.key, outfit);

    const unworn = [...composites.values()].filter((other) => other.users === 0);

    for (const gone of unworn.slice(0, Math.max(0, unworn.length - IDLE_OUTFITS))) {
        for (const material of [gone.sized, gone.painted]) {
            material?.map.dispose();
            material?.bumpMap.dispose();
            material?.dispose();
        }

        composites.delete(gone.key);
    }
}
