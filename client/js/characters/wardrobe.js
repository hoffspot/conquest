// What a kit keeps of what its characters wear, made once and shared by them: each garment's
// picture, and each outfit's (the garments of one drawn all at once: character.js `merge`), held
// at the size its wearers are seen at (pictures.js), and let go of once it isn't wanted.
//
// An outfit's pictures are painted at OUTFIT_SIZE and held at PICTURES.least while everyone
// wearing it is small on the screen, going by its tallest wearer. The game's own bodies
// (`release`) share one material whose two pictures are swapped for bigger or smaller ones in
// place, so whatever else draws with those pictures (a wounded body's own copy of the material:
// world/wounds.js) has the new ones too. Each is let go of from the page once it's on the
// graphics card; what's kept there is the colour at the least size (a crowd's figure is made
// from it: world/crowd.js figureOf) and, while the bigger ones are drawn, the heights at the
// least size, to go back to. Seen bigger again, they're made again from their garments'
// pictures, a little each frame (tendKit), those painted again that have been let go of
// meanwhile: a garment's own picture is kept PICTURES.garments seconds after it was last used.
// Anyone else (a lab's figure, a crowd's figure being made) has a material of its own for the
// outfit, its pictures as they're painted and kept on the page, if they're there: else the
// colour that's kept, till it's asked for whole (wholeOutfit: a bestiary's portrait).

import * as THREE from "three";
import { Rig } from "./rig.js";
import { COMPOSITE_BUMP, compositingGarments, forgetPoints, GARMENTS, measureBody, paintGarment, paintingGarment, pointsHeld, texelMap } from "./garments.js";
import { PICTURES, reduced, reducing } from "./pictures.js";
import { allAtOnce } from "../core/steps.js";
import { releaseTexture } from "../world/release.js";

/** The size (texels a side) garments' and outfits' pictures are painted at. */
export const OUTFIT_SIZE = 512;

// The least size an outfit's pictures are held at
const LEAST = Math.min(PICTURES.least, OUTFIT_SIZE);

/**
 * How many outfits' pictures no one is wearing just now are kept, for the next to wear one (and
 * looks of eye's: character.js); none once the kit's asked to let go of what's idle (letGoOfIdle).
 */
export const IDLE = 2;

// What a kit's wardrobe keeps beside its pictures: who's using each garment's own picture and
// when it was last used (`garments`: id -> { users, used }), the outfits being made whole again
// (`again`), when it was last tended (`tended`: tendKit's `now`), and its own clock (`clock`, ms:
// going on only while it's tended, a second a time at most, so a page put by a while and come
// back to hasn't left every garment unused meanwhile), by which its garments were last looked
// through (`swept`)
function stateOf(kit) {
    return (kit.wardrobe ??= { garments: new Map(), again: [], clock: 0, tended: -Infinity, swept: 0 });
}

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
    letGoOfUnused(cache, idle, dispose);
}

/** The same cache's unused let go, the longest unused first, beyond `idle` of them. */
export function letGoOfUnused(cache, idle, dispose) {
    const unused = [...(cache ?? [])].filter(([, other]) => other.users === 0);

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

// --- Garments' own pictures ---

// A garment's picture's been used now (and the one a people's make of it is tinted from, whose
// pictures it draws with): its use, { users, used }
function used(kit, id) {
    const state = stateOf(kit);
    const use = state.garments.get(id) ?? { users: 0, used: 0 };

    use.used = state.clock;
    state.garments.set(id, use);

    if (GARMENTS[id].base) {
        used(kit, GARMENTS[id].base);
    }

    return use;
}

/**
 * A garment's material, its texture painted once per kit; a people's make of one that only
 * differs in colour (`base`: liveries.js), its picture tinted to its colour. Painted again, if
 * it's been let go of since (no one drawing with it, nor an outfit's picture made from it, for
 * PICTURES.garments seconds: tendKit).
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

    used(kit, id);

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

/**
 * A garment's material for a character that draws its garments one by one (a player, who
 * changes what they wear): kept while it's drawn with (leaveGarments, when it no longer is).
 */
export function drawingGarment(character, id) {
    const material = garmentMaterial(character.kit, id);

    used(character.kit, id).users++;
    (character.drawn ??= []).push(id);

    return material;
}

/** A character no longer drawing with the garments' materials it drew with (drawingGarment). */
export function leaveGarments(character) {
    for (const id of character.drawn ?? []) {
        used(character.kit, id).users--;
    }

    character.drawn = [];
}

// The garments' own pictures no one's drawing with and no one's used since `before` (ms, by the
// wardrobe's clock) let go of: painted again when they're next wanted (readyingGarment). A
// people's make of one, tinted, draws with the pictures of the one it's tinted from: those are
// kept while it is
function sweep(kit, before) {
    const state = stateOf(kit);
    const materials = kit.garmentMaterials;

    if (!materials) {
        return;
    }

    const idle = (id) => !(state.garments.get(id)?.users > 0) && (state.garments.get(id)?.used ?? 0) <= before;
    const bases = new Set();

    for (const id of materials.keys()) {
        if (GARMENTS[id].base && !idle(id)) {
            bases.add(GARMENTS[id].base);
        }
    }

    for (const [id, material] of [...materials]) {
        if (!idle(id) || bases.has(id)) {
            continue;
        }

        // (Its own pictures: not one tinted from another's, nor a design's, shared by its colours)
        if (!GARMENTS[id].base && !GARMENTS[id].design) {
            material.map.dispose();
            material.bumpMap.dispose();
        }

        material.dispose();
        materials.delete(id);
        state.garments.delete(id);
    }
}

// --- Outfits ---

/**
 * The material a character draws an outfit's garments with all at once (ids, outermost last):
 * one picture of them all (garments.js compositeGarments), its heights, roughness and metalness
 * in another; a step at a time (each a yield), returning it. Made once per kit for each outfit,
 * whoever else comes to wear it while it's made (shared), and let go when no one's worn it for a
 * while. The character's counted wearing it (leaveOutfit, when it no longer does). One of the
 * game's (`release`) has its pictures at the size its wearers are seen at (fitOutfit); anyone
 * else, as they're painted, kept on the page (or, those let go of, the colour kept: wholeOutfit).
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
        outfit.readers++;
        outfit.painted ??= outfit.full?.surface ? outfitMaterial(dataTexture(outfit.full.data, OUTFIT_SIZE, true), dataTexture(outfit.full.surface, OUTFIT_SIZE, false)) : keptMaterial(kit, outfit);

        return outfit.painted;
    }

    outfit.wearers.add(character);

    if (outfit.sized) {
        fit(kit, outfit);
    } else {
        // (Made with its pictures as they're painted on the page still: none let go of till
        // there's a material of the game's own for it)
        const size = wantedOf(outfit);
        const { data, surface } = size === OUTFIT_SIZE ? outfit.full : outfit.small;

        outfit.sized = outfitMaterial(dataTexture(data, size, true), dataTexture(surface, size, false));
        outfit.size = size;

        // (Each let go of from the page once it's on the graphics card: world/release.js)
        releaseTexture(outfit.sized.map);
        releaseTexture(outfit.sized.bumpMap);
        settle(kit, outfit);
    }

    return outfit.sized;
}

// An outfit's two pictures put together from its garments' own (ids, outermost last), a step at
// a time, returning them as they're painted: { data, surface }, OUTFIT_SIZE a side
function* composing(kit, ids) {
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

    // (Used till now: kept a while from here, for the next outfit made of them)
    for (const id of ids) {
        used(kit, id);
    }

    return { data: bytesOf(data), surface: bytesOf(surface) };
}

// An outfit's pictures made, a step at a time, and kept by the kit (wearingOutfit): as they're
// painted (`full`) and at the least size they're held at (`small`), { data, surface } each
function* picturing(kit, key, ids) {
    const full = yield* composing(kit, ids);

    yield;

    const small = { data: yield* reducing(full.data, OUTFIT_SIZE, LEAST, true), surface: yield* reducing(full.surface, OUTFIT_SIZE, LEAST, false) };

    // (`wearers`: the game's own bodies in it, by whom its pictures' size goes, `size`, in the
    // material they share, `sized`; `readers`: how many others, who share `painted`; `again`:
    // its pictures being made whole again, a step at a time)
    kit.composites.set(key, { key, ids, users: 0, wearers: new Set(), readers: 0, full, small, sized: null, size: 0, painted: null, again: null });
    yield;
}

// An outfit's material, from its two pictures' textures
function outfitMaterial(map, surfaceMap) {
    const material = new THREE.MeshStandardMaterial({
        map,
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

// The material of an outfit for one whose pictures are read on the page, when they're no longer
// there as they're painted: its colour as it's kept (as big as a crowd's figure is made from),
// its heights the game's own picture of them (on the graphics card, whatever size that is now).
// `userData.kept` says so (wholeOutfit makes it whole)
function keptMaterial(kit, outfit) {
    const colour = keeps(kit) > LEAST ? { data: outfit.full.data, size: OUTFIT_SIZE } : { data: outfit.small.data, size: LEAST };
    const material = outfitMaterial(dataTexture(colour.data, colour.size, true), outfit.sized.bumpMap);

    material.userData.kept = true;

    return material;
}

// The size (texels a side) an outfit's colour is kept at on the page for a crowd's figure to be
// made from: the least its pictures are held at, where a crowd's figures' pictures are no bigger
// (world/view.js QUALITY `soldiers.picture`: half its level's skins' size, 256 for skins of 512);
// as it's painted for bigger ones (512 for skins of 1024)
function keeps(kit) {
    return Math.min(OUTFIT_SIZE, Math.max(LEAST, (kit.atlas?.size ?? 0) / 2));
}

// The size an outfit's pictures are wanted at: the biggest any of its wearers (the game's own)
// is seen at, as they're painted for one not yet told how it's seen; the least, worn by none
function wantedOf(outfit) {
    let size = LEAST;

    for (const { pictures } of outfit.wearers) {
        size = Math.max(size, Math.min(OUTFIT_SIZE, pictures.wanted ?? OUTFIT_SIZE));
    }

    return size;
}

// What an outfit keeps on the page that nothing wants any more let go of, once the game's own
// bodies have a material for it (till then it's kept as it's made, for whoever wears it next, as
// a lab's is): its pictures as they're painted (bigger ones go to the game's material as they're
// made, and from it once they're on the graphics card), and the material of those who read them,
// unless someone's reading them still (its colour's kept all the same where a crowd's figure is
// made from one that big); its heights at the least size, unless bigger ones are drawn (kept to
// go back to)
function settle(kit, outfit) {
    if (!outfit.sized) {
        return;
    }

    // (The material of those who read them, its last reader gone: it holds them as they're painted)
    if (outfit.painted && outfit.readers === 0) {
        disposeMaterial(outfit.painted, !outfit.painted.userData.kept);
        outfit.painted = null;
    }

    if (outfit.full && outfit.readers === 0) {
        outfit.full = keeps(kit) > LEAST ? { data: outfit.full.data, surface: null } : null;
    }

    if (outfit.size === LEAST) {
        outfit.small.surface = null;
    }
}

// An outfit's two pictures (the game's own bodies') swapped, in place, for others (`size` a side)
function swap(kit, outfit, { data, surface }, size) {
    setPicture(outfit.sized.map, data, size);
    setPicture(outfit.sized.bumpMap, surface, size);
    outfit.size = size;
    settle(kit, outfit);
}

// An outfit's pictures (the game's own bodies') held at the size wanted now: smaller ones put
// back at once (those kept); bigger ones as they're painted, if they're on the page still, else
// made again, a little each frame (tendKit), and swapped in when they're made
function fit(kit, outfit) {
    const size = outfit.sized ? wantedOf(outfit) : 0;

    if (!outfit.sized || size === outfit.size) {
        outfit.again = null;

        return;
    }

    if (size < outfit.size) {
        outfit.again = null;
        swap(kit, outfit, outfit.small, size);
    } else if (outfit.full?.surface) {
        // (Its heights at the least size made again, if they've been let go of: to go back to)
        outfit.small.surface ??= reduced(outfit.full.surface, OUTFIT_SIZE, LEAST, false);
        swap(kit, outfit, outfit.full, size);
    } else if (!outfit.again) {
        outfit.again = again(kit, outfit);
        stateOf(kit).again.push(outfit);
    }
}

// An outfit's pictures made again as they're painted, a step at a time: { full, surface (its
// heights at the least size, to go back to) }
function* again(kit, outfit) {
    const full = yield* composing(kit, outfit.ids);

    yield;

    return { full, surface: yield* reducing(full.surface, OUTFIT_SIZE, LEAST, false) };
}

// An outfit's pictures, made again (again's), put on
function whole(kit, outfit, { full, surface }) {
    outfit.again = null;
    outfit.full = full;
    outfit.small.surface = surface;

    // (Whoever else has it has it whole, in place: wholeOutfit)
    if (outfit.painted?.userData.kept) {
        const surfaceMap = dataTexture(full.surface, OUTFIT_SIZE, false);

        setPicture(outfit.painted.map, full.data, OUTFIT_SIZE);
        outfit.painted.bumpMap = outfit.painted.roughnessMap = outfit.painted.metalnessMap = surfaceMap;
        outfit.painted.userData.kept = false;
    }

    if (outfit.sized && wantedOf(outfit) > outfit.size) {
        swap(kit, outfit, full, OUTFIT_SIZE);
    } else {
        settle(kit, outfit);
    }
}

/**
 * A character's outfit's pictures held at the size wanted now, the character seen bigger or
 * smaller than it was (its `pictures.wanted`): the biggest any of its wearers is seen at.
 */
export function fitOutfit(character) {
    const outfit = character.kit.composites?.get(character.composite);

    if (outfit) {
        fit(character.kit, outfit);
    }
}

/** Whether a character's outfit's pictures are as big as they're painted (true with no outfit). */
export function outfitWhole(character) {
    const outfit = character.kit.composites?.get(character.composite);

    return !outfit || (outfit.wearers.has(character) ? outfit.size >= OUTFIT_SIZE : !outfit.painted?.userData.kept);
}

/**
 * The outfit of one whose pictures are as they're painted (not `release`) made whole now, at
 * once, if it's only the colour that was kept (its pictures let go of since the game's own
 * bodies were given theirs): for one drawn close, a bestiary's portrait.
 */
export function wholeOutfit(character) {
    const kit = character.kit;
    const outfit = kit.composites?.get(character.composite);

    if (outfit?.painted?.userData.kept && !outfit.wearers.has(character)) {
        whole(kit, outfit, outfit.again ? allAtOnce(outfit.again) : allAtOnce(again(kit, outfit)));
    }
}

/**
 * A character no longer wearing the outfit whose picture it was drawn with: once no one is, it's
 * kept a while (at its least size) for the next to wear it, then let go (the longest unworn
 * first, beyond IDLE of them unworn).
 */
export function leaveOutfit(character) {
    const kit = character.kit;
    const outfit = character.composite === null ? null : kit.composites?.get(character.composite);

    character.composite = null;

    if (!outfit) {
        return;
    }

    outfit.users--;
    outfit.readers -= outfit.wearers.delete(character) ? 0 : 1;
    fit(kit, outfit);
    settle(kit, outfit);

    if (outfit.users === 0) {
        kit.composites.delete(outfit.key);
        kit.composites.set(outfit.key, outfit);
        letGoOfOutfits(kit, IDLE);
    }
}

// An outfit's material let go of, and its pictures (its heights too, if they're its own)
function disposeMaterial(material, surface = true) {
    material?.map.dispose();

    if (surface) {
        material?.bumpMap.dispose();
    }

    material?.dispose();
}

// The outfits no one's wearing let go of, the longest unworn first, beyond `idle` of them
function letGoOfOutfits(kit, idle) {
    const unworn = [...(kit.composites?.values() ?? [])].filter((outfit) => outfit.users === 0);

    for (const gone of unworn.slice(0, Math.max(0, unworn.length - idle))) {
        disposeMaterial(gone.sized);
        disposeMaterial(gone.painted, !gone.painted?.userData.kept);
        gone.again = null;
        kit.composites.delete(gone.key);
    }
}

// --- Tending it ---

/**
 * A kit's wardrobe tended, a frame on (`now`, ms: any clock that only goes forward; the game's
 * characters call this as they're told how they're seen, Character.fitPictures: done once a
 * frame, however many do): a little more (`budget` ms of this frame) of the outfits' pictures
 * being made whole again for wearers seen bigger, each swapped in as it's made; and the
 * garments' own pictures no one's used for PICTURES.garments seconds let go of.
 */
export function tendKit(kit, now = performance.now(), budget = PICTURES.budget) {
    const state = stateOf(kit);
    const since = now - state.tended;

    if (since < PICTURES.every) {
        return;
    }

    state.tended = now;
    state.clock += Math.min(since, 1000);

    const until = performance.now() + budget;

    while (state.again.length) {
        const outfit = state.again[0];

        // (No longer wanted: its wearer gone, or seen small again)
        if (!outfit.again) {
            state.again.shift();

            continue;
        }

        let step;

        try {
            step = outfit.again.next();
        } catch (error) {
            // (Not made: drawn as it is, and asked for again when it's next seen bigger)
            outfit.again = null;
            console.warn(`An outfit's pictures couldn't be made again: ${error}`);

            continue;
        }

        if (step.done) {
            state.again.shift();
            whole(kit, outfit, step.value);
        }

        if (performance.now() >= until) {
            break;
        }
    }

    if (state.clock - state.swept >= 1000) {
        state.swept = state.clock;
        sweep(kit, state.clock - PICTURES.garments * 1000);
    }
}

/**
 * Everything of the wardrobe's that's idle let go of now: the outfits no one's wearing, the
 * garments' own pictures no one's drawing with, and what's kept for painting them faster
 * (garments.js: where each texel is on the body garments are painted for). All of it's made
 * again when it's next wanted. (kit.js letGoOfIdle: with the rest of the kit's.)
 */
export function letGoOfWardrobe(kit) {
    letGoOfOutfits(kit, 0);
    sweep(kit, Infinity);

    if (kit.texelMap) {
        forgetPoints(kit.texelMap);
    }
}

/**
 * How many bytes of pictures the wardrobe holds on the page: each garment's own, the designs',
 * each outfit's (as they're painted, and at their least size), and the painters' own (each
 * buffer counted once: `seen`, a Set of those counted already). (kit.js heldByKit.)
 */
export function heldInWardrobe(kit, seen = new Set()) {
    let bytes = 0;
    const count = (data) => {
        if (data?.buffer && !seen.has(data.buffer)) {
            seen.add(data.buffer);
            bytes += data.buffer.byteLength;
        }
    };

    for (const material of kit.garmentMaterials?.values() ?? []) {
        count(material.map?.image?.data);
        count(material.bumpMap?.image?.data);
    }

    for (const texture of kit.designTextures?.values() ?? []) {
        count(texture.image?.data);
    }

    for (const outfit of kit.composites?.values() ?? []) {
        for (const data of [outfit.full?.data, outfit.full?.surface, outfit.small.data, outfit.small.surface]) {
            count(data);
        }

        for (const material of [outfit.sized, outfit.painted]) {
            count(material?.map.image?.data);
            count(material?.bumpMap.image?.data);
        }
    }

    for (const data of Object.values(kit.texelMap ?? {})) {
        count(ArrayBuffer.isView(data) ? data : null);
    }

    return bytes + (kit.texelMap ? pointsHeld(kit.texelMap) : 0);
}
