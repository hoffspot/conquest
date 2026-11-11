// A character: the shaped body as Three.js skinned meshes on a Rig, with a look (skin, eyes,
// hair) and equipment. Everything a character wears is skinned to the same skeleton, so one set of
// bone matrices a frame moves all of it.
//
//     const human = await loadHumanData();
//     const hero = new Character(human, { shape: { macro: { gender: 1 } } });
//     scene.add(hero.object);
//     hero.rig.setAngles("LeftArm", { abduct: 30 }); hero.rig.apply();

import * as THREE from "three";
import { Rig } from "./rig.js";
import { EQUIPMENT, heldRound, limbThickness, secondGrip, SLING, socketOn, TORCH_HOLD } from "./equipment.js";
import { buildDrape, drapeMaterial, drapeSkeleton, DRAPES, skirtUnder } from "./drapes.js";
import { fittingOutfit, measureBody, stackOrder } from "./garments.js";
import { BEARDS, growingHair, hairTexture, HAIRSTYLES } from "./hair.js";
import { buildItem, HAND_TORCH_FLAME, HAND_TORCH_GRIP } from "./items.js";
import { HairMaterial, SkinMaterial } from "./surfaces.js";
import { FAR, keyOf, LODS } from "./lod.js";
import { EYE_DEFAULTS, HAIR_COLOURS, paintEye, paintingSkin, SKIN_DEFAULTS } from "./skin.js";
import { expressionData, Expressions, expressive } from "./expressions.js";
import { Gaze, lookingEyes } from "./gaze.js";
import { lashTexture, lashUVs } from "./lashes.js";
import { fitMouth, isMouth, mouthMaterial } from "./mouth.js";
import { PICTURES, pictureSize, sizingSkin } from "./pictures.js";
import { dataTexture, drawingGarment, fitOutfit, IDLE, leaveGarments, leaveOutfit, letGo, OUTFIT_SIZE, outfitReady, outfitWhole, readyingOutfit, referenceMeasures, setPicture, take, tendKit, wearingOutfit, wholeOutfit } from "./wardrobe.js";
import { allAtOnce } from "../core/steps.js";
import { castCheaply } from "../world/shadowpasses.js";
import { releaseTexture } from "../world/release.js";

/** How a character looks unless told otherwise. */
export const LOOK_DEFAULTS = Object.freeze({
    skin: SKIN_DEFAULTS,
    eyes: EYE_DEFAULTS,
    hair: Object.freeze({ style: "short", beard: "none", colour: HAIR_COLOURS.brown }),
});

// The parts of the base mesh, in the order they're drawn (with a material each)
const DRAWN = ["body", "eyes", "lashes", "mouth"];

// A skirt or robe hanging this far down (drapes.js `length`: 1 to the ankles) or further all the
// way round has its wearer running with their heels kept low (Character.robed)
const ROBED = 0.9;

// What's the same at each drawn vertex of every body of a human's data, whatever its shape: where
// its picture is (its eyelashes' laid out for their strands: lashes.js), its bones and weights,
// and where its face's moves are kept (expressions.js: for a body with them). Worked out once,
// and one attribute of each for all of them, so the graphics card's given each once: 0.33 MB a
// body, sent for every body before. { uv, skinIndex, skinWeight, faceSlot }
const SHARED = ["uv", "skinIndex", "skinWeight", "faceSlot"];
const skinnings = new WeakMap();

function skinningOf(human) {
    if (!skinnings.has(human)) {
        const count = human.renderSource.length;
        const skinIndex = new Uint8Array(count * 4);
        const skinWeight = new Uint8Array(count * 4);
        const faces = expressionData(human);

        human.renderSource.forEach((v, r) => {
            skinIndex.set(human.skinIndices.subarray(v * 4, v * 4 + 4), r * 4);
            skinWeight.set(human.skinWeights.subarray(v * 4, v * 4 + 4), r * 4);
        });
        skinnings.set(human, {
            uv: new THREE.BufferAttribute(lashUVs(human), 2),
            skinIndex: new THREE.BufferAttribute(skinIndex, 4),
            skinWeight: new THREE.BufferAttribute(skinWeight, 4, true),
            faceSlot: faces ? new THREE.BufferAttribute(faces.slotOf, 1) : null,
        });
    }

    return skinnings.get(human);
}

/**
 * A body's geometry (Character's `geometry`) let go of: but what it shares with every other body
 * of its data (SHARED), taken off it first. three.js lets go of the graphics card's copy of every
 * attribute a geometry has as the geometry's let go of, whoever else has it, and the others'
 * would be sent again each time one went.
 */
function disposeBody(geometry) {
    for (const name of SHARED) {
        geometry.deleteAttribute(name);
    }

    geometry.dispose();
}

// How a carried torch's shaft lies across the palm (radians from straight across, towards the
// fingers at the thumb's side: grip.js), as a staff's does
const TORCH_TURN = 0.25;

// (Given to the constructor by Character.building: built a step at a time there, not at once)
const LATER = Symbol("later");

/**
 * Several skinned geometries as one (their vertices one after another); of each one's triangles,
 * only its first `counts[k]` indices (all of them, with none given: one drawn a while has its
 * lower levels' after its own, #lowerGarment).
 */
function mergeGeometries(geometries, counts = null) {
    const names = ["position", "normal", "uv", "skinIndex", "skinWeight"];
    const count = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
    const indices = [];
    let offset = 0;
    const merged = new THREE.BufferGeometry();

    for (const name of names) {
        const first = geometries[0].attributes[name];
        const array = new first.array.constructor(count * first.itemSize);
        let at = 0;

        for (const geometry of geometries) {
            array.set(geometry.attributes[name].array, at);
            at += geometry.attributes[name].array.length;
        }

        merged.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize, first.normalized));
    }

    geometries.forEach((geometry, k) => {
        const index = geometry.index.array;
        const length = counts?.[k] ?? index.length;

        for (let i = 0; i < length; i++) {
            indices.push(index[i] + offset);
        }

        offset += geometry.attributes.position.count;
    });

    merged.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));

    return merged;
}

// A look (Character setLook's) with everything it doesn't say as LOOK_DEFAULTS have it, and its
// skin's hair colour its hair's
function lookOf(look) {
    const hair = { ...LOOK_DEFAULTS.hair, ...look.hair };

    return { skin: { ...SKIN_DEFAULTS, ...look.skin, hairColour: hair.colour }, eyes: { ...EYE_DEFAULTS, ...look.eyes }, hair };
}

// The skin as it's painted for a look (lookOf's): with hair painted on the scalp and jaw under the
// strands (or as a buzz cut or stubble)
function paintedSkin({ skin, hair }) {
    const style = HAIRSTYLES[hair.style] ?? HAIRSTYLES.short;
    const beard = BEARDS[hair.beard] ?? BEARDS.none;

    return {
        ...skin,
        // (under hair strands, solid: none of the skin shows between them)
        scalp: Math.max(skin.scalp, style.scalp ?? (style.strands ? 1.4 : 1)),
        stubble: Math.max(skin.stubble, beard.stubble),
    };
}

/**
 * An item's place on a socket, from where its grip goes (`at`) and which ways its point and edge
 * face (equipment.js SHEATHS): { bone, position, quaternion } in the bone's frame.
 */
export function placed(socket, { at = [0, 0, 0], point = [0, 1, 0], edge = [0, 0, 1] }) {
    const y = new THREE.Vector3(...point).normalize();
    const z = new THREE.Vector3(...edge).addScaledVector(y, -new THREE.Vector3(...edge).dot(y)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

    return {
        bone: socket.bone,
        position: new THREE.Vector3(...at).applyQuaternion(socket.quaternion).add(socket.position),
        quaternion: socket.quaternion.clone().multiply(turn),
        out: socket.out?.clone().applyQuaternion(socket.quaternion) ?? null,
    };
}

/**
 * Where a shield's slung on the back (equipment.js SLING), its `look` built, on the back's
 * `socket`: its back to the upper back, the middle of its top at the shoulders, leaning out at
 * the bottom; `over` further off the back (over a quiver or a pack). { bone, position, quaternion }.
 * As big as it is (`box`, in its own frame: one of the catalog's models once it's read), or as its
 * look is built.
 */
export function slung(socket, look, { over = false, box = new THREE.Box3().setFromObject(look) } = {}) {
    // (Its face, out along its x, turned to face back; its up leaning in at the top)
    const { quaternion } = placed(socket, { point: [0, Math.cos(SLING.lean), Math.sin(SLING.lean)], edge: [1, 0, 0] });
    const top = new THREE.Vector3(box.min.x, box.max.y, (box.min.z + box.max.z) / 2).applyQuaternion(quaternion);
    const position = new THREE.Vector3(0, SLING.top, -SLING.off - (over ? SLING.over : 0)).applyQuaternion(socket.quaternion).add(socket.position).sub(top);

    return { bone: socket.bone, position, quaternion };
}

// Hermite easing from 0 at `a` to 1 at `b`
const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

// Which ways a shield heads off from where it was and comes into where it's going, swinging round
// between the arm and the back (`slinging`: onto the back; equipment.js SLING `swing`, in the
// frame of the character's `object`), in the frame of the bone it's going to: { from, to }
function swingOf(bone, object, slinging) {
    const turn = bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(object.getWorldQuaternion(new THREE.Quaternion()));
    const [arm, back] = [SLING.swing.arm, SLING.swing.back].map((way) => new THREE.Vector3(...way).applyQuaternion(turn));

    return slinging ? { from: arm, to: back } : { from: back, to: arm };
}

/**
 * What a blade hung from the belt (`item`, its `look` built) needs to swing clear of the leg
 * (Character.hang): its side, how far it reaches down from its grip and up to the end of its hilt
 * (`pommel`), and how it's swung; or null.
 */
export function hanging(item, look) {
    if (!item.sheath?.hangs) {
        return null;
    }

    const box = new THREE.Box3().setFromObject(look);

    return { side: item.sheath.socket.startsWith("left") ? "Left" : "Right", length: box.max.y, pommel: box.min.y, seated: new THREE.Vector3(...(item.sheath.seated ?? [0, 0, 0])), angle: 0, out: 0, time: null, holder: null, radius: null, stand: 0, width: 0, clear: null, hilt: [], arm: null, at: null };
}

export class Character {
    /**
     * @param {object} kit - What characters are made from (loadCharacterKit): { human, atlas }, and
     *   where the skins of those built a step at a time are painted, if not here (skins.js Skins),
     *   `skins`.
     * @param {object} [options]
     * @param {object} [options.shape] - Slider settings: { macro: {...}, details: {...} }.
     * @param {object} [options.look] - Skin, eyes and hair: { skin: {...}, eyes: {...}, hair: {...} }
     *   (see LOOK_DEFAULTS, skin.js and hair.js).
     * @param {string[]} [options.equipment] - What it wears and carries (EQUIPMENT ids).
     * @param {number} [options.hairDetail] - How much of its hair to grow, 0 to 1 (less for
     *   characters seen from afar: hair.js).
     * @param {boolean} [options.merge] - Draw its garments all at once (one mesh, one picture of
     *   them all: for the many folk and soldiers about, and the other players; not the player's
     *   own, who changes what they wear, nor another's just as they change it: setEquipment,
     *   merging).
     * @param {boolean} [options.far] - Whether it'll be drawn with fewer triangles from afar or
     *   into shadows (lowerDetail): its hair's grown far thinner too (by default, if it's merged).
     * @param {boolean} [options.release] - Let go of the page's copy of its skin's pictures once
     *   they're on the graphics card (world/release.js): for the game's many, whose skins nothing
     *   on the page reads again (not the lab's, saved as a template: skinCanvas). Its pictures
     *   are then held at the size it's seen at (fitPictures).
     * @param {number} [options.tall] - How tall it'll be on the screen where it's first seen
     *   (drawing buffer pixels), if that's known: its pictures are made the size that's seen at
     *   (one that's `release`: pictures.js), as they're painted else, till it's told (fitPictures).
     */
    constructor(kit, options = {}, later = null) {
        const { materials = {}, hairDetail = 1, merge = false, far = merge, release = false, tall = null } = options;
        const human = kit.human;
        // (The biggest any of its pictures is painted: its skin's, or its outfit's)
        const full = Math.max(OUTFIT_SIZE, kit.atlas?.size ?? 0);

        this.kit = kit;
        this.hairDetail = hairDetail;
        this.merge = merge;
        this.far = far;
        this.release = release;

        /**
         * How big its pictures are held (pictures.js): `wanted` texels a side, for how tall it's
         * seen (null: as they're painted, not told yet), of `full` at most; `under` seconds seen
         * small enough for smaller ones; `held` seconds still to be kept whole (whole); its
         * skin's `skin` a side now (null: none painted), the smallest it's held at kept by
         * (`small`) while it's bigger, and what's asked for of another size (`job`).
         */
        this.pictures = { full, wanted: release && tall !== null ? pictureSize(tall, PICTURES.least, full) : null, under: 0, held: 0, skin: null, small: null, job: null };

        /** The outfit whose picture its garments are drawn with, when they're drawn at once. */
        this.composite = null;

        // (How many times it's been dressed: what's put together for it a step at a time is for
        // what it wore when that began, merging)
        this.dressed = 0;

        // (The look of eye whose picture its eyes are drawn with: shared)
        this.eyePicture = null;
        this.human = human;
        this.object = new THREE.Group();
        this.object.name = "character";
        this.rig = new Rig(human.bones, human.landmarks?.rest);
        this.object.add(this.rig.root);

        this.materials = {
            // (Skin's roughness is painted with it, and light wraps a little round it: surfaces.js)
            body: materials.body ?? new SkinMaterial(),
            eyes: materials.eyes ?? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
            // (Strands, drawn over the cards: lashes.js. Both sides in one pass: three.js draws a
            // transparent two-sided material's back and front apart unless told not to, and a lash
            // is too thin for its order to show)
            lashes: materials.lashes ?? new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9, alphaMap: lashTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }),
            // (Its highlights bands across the strands: surfaces.js)
            hair: materials.hair ?? new HairMaterial({ map: hairTexture(), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.65, envMapIntensity: 0.5, vertexColors: true }),
            // (Parts of their own in their skin's or fur's colour: a cat's ears and tail)
            tint: materials.tint ?? new THREE.MeshStandardMaterial({ color: 0xc8a080, roughness: 0.8 }),
            // (The mouth's inside, the kit's picture of it darkening into the throat: mouth.js)
            mouth: materials.mouth ?? mouthMaterial(human),
        };

        // Its face's expressions and blinks (a body with them, Vitruvian's: expressions.js), on its
        // own skin and lashes (not a beast's hide), or null
        const faces = materials.body || materials.lashes ? null : expressionData(human);

        /** Its face: blinking, and showing what it's doing (expressions.js), or null. */
        this.expressions = faces ? new Expressions() : null;

        if (faces) {
            expressive(this.materials.body, faces, this.expressions.weights);
            expressive(this.materials.lashes, faces, this.expressions.weights);
            expressive(this.materials.mouth, faces, this.expressions.weights);
        }

        /** Where it's looking: its eyes and head turned towards it (gaze.js), or null (eyes not its own). */
        this.gaze = materials.eyes ? null : new Gaze(this);

        if (this.gaze) {
            lookingEyes(this.materials.eyes, this.gaze.uniforms);
        }

        /** The hair and beard (null when bald and clean-shaven). */
        this.hairMesh = null;
        /** The same far thinner, drawn instead from afar and into shadows (FAR.hair: if it's to be, `far`), or null. */
        this.farHairMesh = null;

        /** What it wears and carries: slot -> EQUIPMENT id. */
        this.equipment = new Map();
        this.garments = [];
        this.items = [];

        /** A torch carried in the left hand (holdTorch), or null. */
        this.torch = null;

        /** Per side ("Left", "Right"): the arm pose for what that hand carries, if anything. */
        this.holds = {};

        /** Whether its weapons are put away (sheathe), and its shield slung on its back (sling). */
        this.sheathed = false;
        /** How far a hand on the pommel of what hangs at its hip holds it (0 to 1: Actions, Character.hang). */
        this.held = 0;
        this.slung = false;
        this.hairHidden = false;
        /** The rim its hair is cut along under what's on its head (headwear.js RIMS), or null. */
        this.hairRim = null;

        // (Drawn in full till it's asked to draw fewer triangles from afar: lowerDetail, fitDetail.
        // `level`: 0 in full, then each of LODS')
        this.level = 0;
        this.lowBodies = null;
        this.lowKey = null;
        this.lowEyes = null;
        // (Its whole body, under its clothes too, from afar: into the shadow maps, #updateIndex)
        this.lowShadow = null;
        this.lods = null;

        this.geometry = this.#createGeometry();
        this.mesh = new THREE.SkinnedMesh(this.geometry, DRAWN.map((part) => this.materials[part]));
        this.mesh.name = "body";
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.bind(this.rig.skeleton, new THREE.Matrix4());
        castCheaply(this.mesh, { groups: this.detail.shadow });
        this.object.add(this.mesh);

        /**
         * Body triangles hidden under clothing: a bit for each of the body part's triangles
         * (triangle `t`'s is bit `t & 7` of byte `t >> 3`), set where it's hidden (none, null). A
         * bit each, not a set of them nor a byte: tens of thousands of them, for everyone drawn.
         */
        this.hidden = null;

        if (later !== LATER) {
            allAtOnce(this.#building(options));
        }
    }

    /**
     * The same as `new Character(kit, options)`, built a step at a time (each a yield, so the work
     * can be spread over frames: its shape, its skin painted a few rows at a time, its eyes, each
     * garment, the pictures of what it wears, each thing it carries), returning it.
     */
    static *building(kit, options = {}) {
        const character = new Character(kit, options, LATER);

        yield;
        yield* character.#building(options, { elsewhere: true });

        return character;
    }

    // Built a step at a time; its skin painted elsewhere, if `elsewhere` and it can be (the kit's
    // `skins`: skins.js): asked for first, so it's painted while the rest of it's built, and put on
    // last
    *#building({ shape = {}, look = {}, equipment = [] }, { elsewhere = false } = {}) {
        const job = elsewhere && this.kit.atlas ? this.kit.skins?.ask(paintedSkin(lookOf(look)), this.#skinSizes()) ?? null : null;

        this.setShape(shape);
        yield;
        this.#wear(equipment);

        // (Its hair grown once: under a hat or helmet, when it's dressed, only below the rim)
        yield* this.#looking(look, { hair: !this.#hidesHair(), skin: !job });
        yield* this.#dressing();

        if (job) {
            yield* this.#skinning(job);
        }
    }

    /**
     * Put on or pick up a piece of equipment (an EQUIPMENT id), replacing what's in its slot. (An
     * id it doesn't know, from an older save or another version's player, is left out.)
     */
    equip(id) {
        if (!known(id)) {
            return;
        }

        this.equipment.set(EQUIPMENT[id].slot, id);
        this.#dress();
    }

    /**
     * Carry a burning torch in the left hand (`on`: a guard at night), what's there by day (a
     * shield) hidden while it's carried; or put it out and take that up again. Returns the torch
     * (a group in the left hand, its flame at `userData.flame` in its own frame) or null.
     */
    holdTorch(on) {
        if (Boolean(this.torch) === on) {
            return this.torch;
        }

        if (on) {
            // (Its shaft held round, as a pole is: grip.js)
            const socket = socketOn(this, "leftHand", { haft: { radius: HAND_TORCH_GRIP, turn: TORCH_TURN } });
            const torch = new THREE.Group();

            torch.name = "torch";
            torch.add(buildItem("handTorch", socket.fit));
            torch.position.copy(socket.position);
            torch.quaternion.copy(socket.quaternion);
            torch.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), TORCH_TURN));
            torch.userData.flame = new THREE.Vector3(...HAND_TORCH_FLAME);
            torch.userData.grip = socket.grip;
            this.rig.bone(socket.bone).add(torch);
            this.torch = torch;
        } else {
            this.torch.removeFromParent();
            this.torch.traverse((part) => part.geometry?.dispose());
            this.torch = null;
        }

        // (Held up as a torch is, or as what's on that arm is again: arrange)
        this.arrange();

        return this.torch;
    }

    /** What's carried in the left hand shown, unless a torch is carried instead (a shield slung on the back, shown there). */
    showOffHand() {
        for (const item of this.items) {
            if (EQUIPMENT[item.name]?.slot === "offHand") {
                item.visible = !this.torch || (this.slung && Boolean(item.userData.sling));
            }
        }
    }

    /** Take off or put down what's in a slot. */
    unequip(slot) {
        this.equipment.delete(slot);
        this.#dress();
    }

    /**
     * Wear and carry exactly these (EQUIPMENT ids: any it doesn't know left out), its garments
     * drawn all at once or one by one from now on (`merge`: as they were, if it isn't said). All
     * at once, their one picture's put together here and now, if no one else wears the outfit:
     * one by one is shown without that wait, and put together after, a step at a time (merging).
     */
    setEquipment(ids, { merge = this.merge } = {}) {
        this.merge = merge;
        this.#wear(ids);
        this.#dress();
    }

    /**
     * Its garments, drawn one by one, drawn all at once from now on (`merge`), as it's dressed: a
     * step at a time (each a yield), the outfit's one picture made first (wardrobe.js: or found
     * made, someone else wearing it), the garments drawn one by one meanwhile, as they were;
     * then, in one step, their meshes made one mesh drawn with it, and their own materials let
     * go of (the kit keeps a garment's picture a while after no one draws with it). Nothing's
     * fitted again: the meshes are the ones it wore, so it's the same garments in the same
     * places. Returns whether they're drawn all at once now: not if it was dressed again
     * meanwhile (what's begun here is for what it wore before, and stops, changing nothing), nor
     * with fewer than two garments to put together (lace and drapes are drawn as they are).
     * Given up on before it's done (the steps closed, a generator's `return`), the outfit's
     * picture half made is let go of too, unless someone else is making it as well (wardrobe.js
     * `shared`): only left off, it's kept by the kit for whoever next wants it.
     */
    *merging() {
        const dressed = this.dressed;
        const apart = this.garments.filter((mesh) => mesh.userData.joins);

        this.merge = true;

        if (apart.length < 2) {
            return this.garments.some((mesh) => mesh.userData.merged);
        }

        // (Outermost last, as they're worn)
        apart.sort((a, b) => stackOrder(a.name, b.name));

        const ids = apart.map(({ name }) => name);

        while (!outfitReady(this.kit, ids)) {
            yield* readyingOutfit(this.kit, ids);

            if (this.dressed !== dressed || this.disposed) {
                return false;
            }
        }

        // (Its picture's made: worn from here, in this one step)
        const material = allAtOnce(this.#compositing(ids));
        // (Each one's own triangles in full: one drawn a while has its lower levels' after them)
        const counts = apart.map(({ geometry, userData }) => userData.detail?.[0].count ?? geometry.index.count);
        const mesh = this.#joined(ids, mergeGeometries(apart.map(({ geometry }) => geometry), counts), material);

        for (const each of apart) {
            each.geometry.dispose();
            each.removeFromParent();
        }

        // (Before the lace and the drapes, as one dressed all at once has it)
        this.garments = [mesh, ...this.garments.filter((each) => !apart.includes(each))];
        leaveGarments(this, ids);

        if (this.lods) {
            this.#lowerGarment(mesh);
        }

        return true;
    }

    // Garments' meshes as one (`geometry`: mergeGeometries'), drawn with their outfit's picture
    // (`material`: #compositing's, for `ids`, outermost last), on its body
    #joined(ids, geometry, material) {
        const mesh = new THREE.SkinnedMesh(geometry, material);

        mesh.name = "garments";
        mesh.userData.merged = ids;
        // (Fitted over the body: its shadow the body's, #updateIndex)
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.bind(this.rig.skeleton, new THREE.Matrix4());
        mesh.boundingSphere = this.mesh.boundingSphere;
        this.object.add(mesh);

        return mesh;
    }

    // What it's to wear and carry (EQUIPMENT ids), not yet dressed in
    #wear(ids) {
        this.equipment.clear();

        for (const id of ids.filter(known)) {
            this.equipment.set(EQUIPMENT[id].slot, id);
        }
    }

    // Whether what it carries hides its hair (a hat or helmet)
    #hidesHair() {
        return this.#hairRim() !== null;
    }

    // The rim the hair's cut along under the hat or helmet that hides it (equipment.js ITEMS `rim`),
    // or null
    #hairRim() {
        for (const id of this.equipment.values()) {
            const { kind, hides, rim } = EQUIPMENT[id];

            if (kind !== "garment" && kind !== "drape" && hides?.includes("hair")) {
                return rim ?? "helm";
            }
        }

        return null;
    }

    /** Build everything worn and carried (after equipping, or when the body changes). */
    #dress() {
        allAtOnce(this.#dressing());
    }

    // The same, a step at a time (each a yield)
    *#dressing() {
        for (const mesh of this.garments) {
            mesh.geometry.dispose();
            mesh.removeFromParent();

            // (A drape's own skeleton's bone texture)
            if (mesh.skeleton !== this.rig.skeleton) {
                mesh.skeleton.dispose();
            }
        }

        for (const item of this.items) {
            item.removeFromParent();
            item.traverse((part) => part.geometry?.dispose());
        }

        this.garments = [];
        this.items = [];
        this.holds = {};
        this.dressed++;
        this.#release();

        const garmentIds = [];
        const drapeIds = [];
        const itemIds = [];

        for (const id of this.equipment.values()) {
            const entry = EQUIPMENT[id];

            if (entry.kind === "garment") {
                garmentIds.push(id);
            } else if (entry.kind === "drape") {
                drapeIds.push(id);
            } else {
                itemIds.push(id);

                // (And what it needs worn: gauntlets under spikes, a belt or strap to hang from)
                for (const garment of [entry.garment, entry.sheath?.garment, entry.sling ? SLING.garment : null]) {
                    if (garment && !garmentIds.includes(garment)) {
                        garmentIds.push(garment);
                    }
                }
            }
        }

        // Garments, under ones first (garments.js stackOrder), each fitted over those under it;
        // each hides the skin (and garments) under it. Each is cut where it would be on a body of
        // the usual shape, as its picture is painted, so its trims are along its edges
        yield;

        // (Its own measurements: only what hangs from it goes by them, a skirt, a gown or an
        // apron, so it's measured when the first of those is built: 13 to 34 ms and 5 MB of
        // short-lived objects, for every soldier that never wore one)
        let measures = null;
        const built = yield* fittingOutfit(this, garmentIds, referenceMeasures(this.kit));

        yield;
        const hidden = new Set();
        const parts = [];

        built.forEach(({ id, geometry, covers, sources, garment }, i) => {
            const over = new Set();

            for (const outer of built.slice(i + 1)) {
                for (const t of outer.covers) {
                    over.add(t);
                }
            }

            if (over.size) {
                const index = geometry.index.array;
                const kept = [];

                for (let t = 0; t < sources.length; t++) {
                    if (!over.has(sources[t])) {
                        kept.push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2]);
                    }
                }

                geometry.setIndex(kept);
            }

            for (const t of covers) {
                hidden.add(t);
            }

            parts.push({ id, geometry, garment });
        });

        // All at once (but lace, see-through), outermost last, as they're worn
        const merged = this.merge ? parts.filter(({ garment }) => !garment.design) : [];

        if (merged.length > 1) {
            merged.sort((a, b) => stackOrder(a.id, b.id));

            const material = yield* this.#compositing(merged.map(({ id }) => id));

            yield;

            const mesh = this.#joined(merged.map(({ id }) => id), mergeGeometries(merged.map(({ geometry }) => geometry)), material);

            for (const { geometry } of merged) {
                geometry.dispose();
            }

            this.garments.push(mesh);

            // (Dressed again: its new outfit's lower detail too)
            if (this.lods) {
                this.#lowerGarment(mesh);
            }
        }

        for (const { id, geometry, garment } of merged.length > 1 ? parts.filter((part) => !merged.includes(part)) : parts) {
            const mesh = new THREE.SkinnedMesh(geometry, this.#garmentMaterial(id));

            mesh.name = id;
            // (One that can be drawn with the rest all at once: not lace, see-through; merging)
            mesh.userData.joins = !garment.design;
            // (Fitted over the body: its shadow the body's, #updateIndex)
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.bind(this.rig.skeleton, new THREE.Matrix4());
            mesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(mesh);
            this.garments.push(mesh);

            if (this.lods) {
                this.#lowerGarment(mesh);
            }
        }

        this.setHidden(hidden);

        // (How far out the garments reach at each of the body's vertices: a cloak hangs over them)
        const worn = new Float32Array(this.human.vertexCount);

        for (const { reach } of built) {
            for (let v = 0; v < worn.length; v++) {
                worn[v] = Math.max(worn[v], reach[v]);
            }
        }

        // Skirts, gowns and aprons, hanging over what's under them. (In one to the ankles, it runs
        // with its heels kept low: Walker)
        this.robed = drapeIds.some((id) => !DRAPES[id].cape && (DRAPES[id].arc ?? 1) >= 1 && DRAPES[id].length >= ROBED);

        // (Skirts first: an apron over one hangs from its bones, so it never comes out through the
        // apron: skirtUnder)
        const swung = new Map();

        for (const id of [...drapeIds].sort((a, b) => Number(skirtUnder(a, drapeIds) !== null) - Number(skirtUnder(b, drapeIds) !== null))) {
            yield;

            const { geometry, profile, shown, levels } = buildDrape(this, id, (measures ??= measureBody(this)), drapeIds, worn);
            const mesh = new THREE.SkinnedMesh(geometry, this.#drapeMaterial(id));

            mesh.name = id;
            mesh.userData.drape = true;
            // (Drawn small on the screen: under an apron, without what it hides; an apron, with
            // triangles of its own: #lowerGarment)
            mesh.userData.shown = shown;
            mesh.userData.levels = levels;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // (A skirt's front and back swung by bones of its own, as the legs go, and an apron
            // over one by the skirt's: a cloak's hangs from the body's)
            const skeleton = swung.get(skirtUnder(id, drapeIds)) ?? (profile ? drapeSkeleton(this.rig, profile) : this.rig.skeleton);

            swung.set(id, skeleton);
            mesh.bind(skeleton, new THREE.Matrix4());
            mesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(mesh);
            this.garments.push(mesh);

            if (this.lods) {
                this.#lowerGarment(mesh);
            }
        }

        // Items on their sockets (where they're held or worn: `home`), and weapons' places put
        // away (`sheath`) with what they hang in there
        for (const id of itemIds) {
            const item = EQUIPMENT[id];

            yield;

            // (Some are in several parts, each on its own socket: spiked boots' iron)
            for (const part of item.parts ?? [item]) {
                const socket = socketOn(this, part.socket, { haft: heldRound(part) });
                const home = { bone: socket.bone, position: socket.position.clone(), quaternion: socket.quaternion.clone() };

                if (part.turn) {
                    home.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.turn)));
                }

                if (part.offset) {
                    home.position.add(new THREE.Vector3(...part.offset));
                }

                const model = new THREE.Group();
                // (A helm on a cat's head opens round its ears)
                const look = buildItem(part.model, { ...socket.fit, ears: this.equipment.get("ears") === "catEars" });

                // (What's of their skin or fur, in its colour)
                if (item.tinted) {
                    look.traverse((mesh) => {
                        if (mesh.isMesh && mesh.material.name === "skin") {
                            mesh.material = this.materials.tint;
                        }
                    });
                }

                model.name = id;
                model.add(look);

                model.userData.hangs = part === item ? hanging(item, look) : null;
                model.userData.home = home;
                model.userData.sway = item.sway ?? 0;
                model.userData.hand = /^(left|right)Hand$/.test(part.socket) ? (part.socket.startsWith("left") ? "Left" : "Right") : null;
                // (Held round its haft or hilt: how the hand closes round it, and a two-handed
                // haft's other hand, grip.js)
                model.userData.grip = socket.grip ?? null;
                model.userData.second = part === item ? secondGrip(this, item) : null;

                const sheath = part === item && item.sheath && !item.sheath.worn ? item.sheath : null;

                if (sheath) {
                    const at = socketOn(this, sheath.socket, sheath);
                    const place = placed(at, sheath);

                    model.userData.sheath = place;

                    // (Looking different put away: a closed book)
                    if (sheath.model) {
                        const away = buildItem(sheath.model, socket.fit);

                        away.visible = false;
                        model.add(away);
                        model.userData.looks = { held: look, away };
                    }

                    // (What it hangs in, there all the time: a scabbard)
                    if (sheath.holder) {
                        const holder = buildItem(sheath.holder, socket.fit);

                        holder.name = `${id}:${sheath.holder}`;
                        holder.userData.holder = true;
                        holder.position.copy(place.position);
                        holder.quaternion.copy(place.quaternion);
                        holder.userData.home = place;
                        this.rig.bone(place.bone).add(holder);

                        if (model.userData.hangs) {
                            model.userData.hangs.holder = holder;
                        }
                        this.items.push(holder);
                    }
                }

                // (One held as a model of the catalog's, read after it's made (items.js heldModel):
                // hung from the belt as long as its model is once it's read, fitted to the body
                // afresh (fitHanging) from where its frog was first put)
                const hangs = model.userData.hangs;
                const frog = model.userData.sheath;

                if (hangs && frog) {
                    const first = { position: frog.position.clone(), quaternion: frog.quaternion.clone() };

                    look.userData.resized = (box) => {
                        hangs.length = box.max.y;
                        hangs.pommel = box.min.y;
                        frog.position.copy(first.position);
                        frog.quaternion.copy(first.quaternion);
                        hangs.clear = null;
                    };
                }

                // (A shield that's slung on the back while the weapons are put away: over whatever
                // else is on the back)
                model.userData.sling = part === item && item.sling ? slung(socketOn(this, SLING.socket), look, { over: this.equipment.has("back") }) : null;

                // (One held as a model of the catalog's, read after it's made (items.js heldModel,
                // a design of Dragon Motion's): slung as it's shaped once it's read, and moved there
                // if it's slung now)
                if (model.userData.sling) {
                    const resized = look.userData.resized;

                    look.userData.resized = (box) => {
                        resized?.(box);
                        model.userData.sling = slung(socketOn(this, SLING.socket), look, { over: this.equipment.has("back"), box });

                        if (this.slung) {
                            this.arrange();
                        }
                    };
                }

                this.items.push(model);
            }
        }

        // (A torch carried still in place of what's in the left hand)
        this.showOffHand();

        // Each weapon in hand or put away, as it was
        this.sheathe(this.sheathed);

        // Under a hat or helmet, only the hair below its rim shows
        const hairRim = this.#hairRim();

        if (this.hairRim !== hairRim) {
            this.hairRim = hairRim;
            this.hairHidden = hairRim !== null;
            yield* this.#growingHair();
        }
    }

    /** Whether it has a shield that's slung on its back while its weapons are put away (equipment.js SLING). */
    get slings() {
        return this.items.some((model) => model.userData.sling);
    }

    /**
     * Put its weapons away (`on`: each in its sheath, equipment.js SHEATHS: a sword in its
     * scabbard, a staff on the back; worn gauntlets stay on, the hands opening) or in hand, and a
     * shield that's slung so slung on the back or taken off it with them (`shield`; else left as
     * it is: sling). The hands' holds follow.
     */
    sheathe(on = true, { settle = 0, shield = true } = {}) {
        this.sheathed = on;

        // (A shield that isn't slung, held as it is)
        if (shield) {
            this.slung = on && this.slings;
        }

        this.arrange(settle);
    }

    /** Sling a shield on the back (`on`, equipment.js SLING) or take it off onto the arm. */
    sling(on = true, { settle = 0 } = {}) {
        this.slung = on && this.slings;
        this.arrange(settle);
    }

    /**
     * Each item where it is now, weapons in hand or put away and a shield on the arm or slung
     * (settling there over `settle` seconds, from where it was), and the hands' holds as they
     * hold them (sheathe, sling).
     */
    arrange(settle = 0) {
        const on = this.sheathed;

        this.holds = {};

        for (const model of this.items) {
            const { home, sheath, sling, looks } = model.userData;

            if (home && !model.userData.holder && !model.userData.dropped) {
                const place = on && sheath ? sheath : this.slung && sling ? sling : home;
                const bone = this.rig.bone(place.bone);

                // (Taken by the hand or let go of into its sheath, it settles there from where it
                // was, over `settle` seconds, as fingers close round it; one settling there
                // already, left to)
                if (model.userData.settling?.place === place) {
                    continue;
                } else if (settle > 0 && (sheath || sling) && model.parent && model.parent !== bone) {
                    bone.attach(model);
                    model.userData.settling = { from: model.position.clone(), turn: model.quaternion.clone(), place, left: settle, length: settle, swing: sling ? swingOf(bone, this.object, place === sling) : null };
                } else {
                    bone.add(model);
                    model.position.copy(place.position);
                    model.quaternion.copy(place.quaternion);
                    model.userData.settling = null;
                }

                if (looks) {
                    looks.held.visible = !(on && sheath);
                    looks.away.visible = on && Boolean(sheath);
                }
            }
        }

        for (const id of this.equipment.values()) {
            const item = EQUIPMENT[id];

            if (item.kind !== "item" || (on && item.sheath) || (this.slung && item.sling) || this.items.some((model) => model.name === id && model.userData.dropped)) {
                continue;
            }

            if (item.hold) {
                this.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { ...item.hold, grips: item.grips, grip: this.items.find((model) => model.name === id)?.userData.grip ?? null };
            } else if (item.grips) {
                this.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { grips: true };
            }
        }

        // (A torch carried in the left hand held up before the body, its shaft upright, whatever's
        // on that arm or slung on the back: not resting on a pommel, its flame clear of the other
        // hand and the head)
        if (this.torch) {
            this.holds.Left = { ...TORCH_HOLD, grips: true, grip: this.torch.userData.grip };
        }

        // (An arm swinging free held a little out, clear of what hangs at that hip: a scabbard, a
        // wand in the belt; or with what's worn on its hand, spiked knuckles, clear of the thigh.
        // An arm carrying something, clear of what hangs at that hip only: `hung`)
        this.clearing = { Left: 0, Right: 0 };
        this.hung = { Left: 0, Right: 0 };

        for (const id of this.equipment.values()) {
            const item = EQUIPMENT[id]?.kind === "item" ? EQUIPMENT[id] : null;
            const socket = item?.sheath?.worn ? item.socket : item?.sheath?.socket;

            if (/^(left|right)(Hip|Frog|Hand)$/.test(socket ?? "")) {
                this.clearing[socket.startsWith("left") ? "Left" : "Right"] = item.sheath?.worn ? KNUCKLE_CLEARING : item.sheath?.hangs ? HILT_CLEARING : HIP_CLEARING;
            }

            if (/^(left|right)(Hip|Frog)$/.test(socket ?? "")) {
                this.hung[socket.startsWith("left") ? "Left" : "Right"] = HIP_CLEARING;
            }
        }

        // (A shield slung on the back shown there, torch or no)
        this.showOffHand();
    }

    /**
     * Let go of what's held in a hand or on its arm (`side`: "Left" or "Right"), falling down
     * dead: each falls from where it is to the ground (the character's feet's level), out to the
     * side clear of where the body lies (along the line from its pelvis to its head), turned over
     * onto its broadest side, and lies there; the hand opens. What's worn (gauntlets), put away
     * or slung on the back stays. pickUp takes it all back.
     */
    drop(side) {
        const hips = this.object.worldToLocal(this.rig.bone("Hips").getWorldPosition(new THREE.Vector3()));
        const head = this.object.worldToLocal(this.rig.bone("Head").getWorldPosition(new THREE.Vector3()));
        const along = head.sub(hips).setY(0);

        // (Lying more or less any way while it's still up: across its left and right, then)
        if (along.lengthSq() < 0.09) {
            along.set(0, 0, 1);
        }

        along.normalize();

        for (const model of this.items) {
            const item = EQUIPMENT[model.name];
            const bone = model.parent?.name ?? "";

            if (model.userData.dropped || model.userData.holder || !item?.grips || item.sheath?.worn || !bone.startsWith(side) || !/Hand|ForeArm/.test(bone)) {
                continue;
            }

            this.object.attach(model);
            model.userData.settling = null;
            model.userData.dropped = droppedFrom(model, hips, along);
        }

        delete this.holds[side];
    }

    /**
     * Take back what's been dropped (alive again), each where it goes now; and what hangs at the
     * hips hanging as it does standing again, not swung as lying left it.
     */
    pickUp() {
        for (const model of this.items) {
            const hangs = model.userData.hangs;

            if (hangs) {
                [hangs.angle, hangs.out, hangs.time] = [0, 0, null];
            }
        }

        if (this.items.some((model) => model.userData.dropped)) {
            this.items.forEach((model) => (model.userData.dropped = null));
            this.arrange();
        }
    }

    /** Move weapons settling into a hand or sheath on by `dt` seconds (Character.sheathe), and anything dropped falling. */
    settle(dt) {
        this.swayed = (this.swayed ?? 0) + dt;

        for (const model of this.items) {
            const settling = model.userData.settling;
            const dropped = model.userData.dropped;

            // (Dropped: falling faster and faster, turning over as it goes, till it lies there)
            if (dropped && dropped.time < dropped.fall) {
                dropped.time = Math.min(dropped.fall, dropped.time + dt);

                const u = dropped.time / dropped.fall;

                model.position.copy(dropped.from).addScaledVector(dropped.out, u).setY(dropped.from.y + (dropped.y - dropped.from.y) * u * u);
                model.quaternion.slerpQuaternions(dropped.turn, dropped.to, smoothstep(0, 1, u));
            }

            // (A tail swaying from side to side, and a little up and down)
            if (model.userData.sway) {
                const { sway, home } = model.userData;

                model.quaternion.copy(home.quaternion).multiply(_sway.setFromEuler(_swayAngles.set(Math.sin(this.swayed * 2.1) * sway * 0.25, Math.sin(this.swayed * 1.3) * sway, 0)));
            }

            if (settling) {
                settling.left = Math.max(0, settling.left - dt);

                const t = 1 - settling.left / settling.length;
                const eased = t * t * (3 - 2 * t);

                model.position.lerpVectors(settling.from, settling.place.position, eased);

                // (A shield swung round the left side on its way to or from the back, heading off
                // out of the body's way and coming in round it: a curve through its ends with
                // those ways out of them; turned round only once it's out there)
                if (settling.swing) {
                    const { from, to } = settling.swing;

                    model.position.addScaledVector(from, 3 * eased * (1 - eased) ** 2).addScaledVector(to, 3 * eased ** 2 * (1 - eased));
                }

                model.quaternion.slerpQuaternions(settling.turn, settling.place.quaternion, settling.swing ? smoothstep(0.3, 0.7, t) : eased);

                if (settling.left === 0) {
                    model.userData.settling = null;
                }
            }
        }
    }

    /**
     * Swing what hangs from the belt at a hip (a sheathed sword or cleaver, and its scabbard, drawn
     * or not) about its frog, back (or a little forward) and out as little as keeps it as clear of
     * that side's thigh and shin as it hangs standing (or HANG_CLEAR, if that's less), as a leg
     * pushes a scabbard; and let it fall back to hang as it was when the leg's gone by, not at
     * once; held by a hand on its pommel (`held`), tipped further back, clear of the legs; and,
     * `seated`, where the seat pushes it. With the legs posed for the frame (Actions.place), at
     * `time` (seconds, any clock).
     */
    hang(time, seated = false, options = null) {
        const arms = options?.arms ?? false;

        // (Nothing's made here, nor in what it calls (hangNearest, armPush): it's done twice a
        // frame for every body with a blade at its hip, and asks how clear the blade is of the
        // leg 86 times each: an arrow function made for each, and one inside it each time it was
        // asked, were an eighth of everything posing made)
        for (let m = 0; m < this.items.length; m++) {
            const model = this.items[m];
            const hangs = model.userData.hangs;

            if (!hangs || (arms && (hangs.clear === null || (hangs.side === "Left" && (this.held ?? 0) > 0.5)))) {
                continue;
            }

            // (Once the arms are where they go this frame, the hilt pushed aside by that side's
            // forearm and hand if they've come into it: armPush)
            if (arms) {
                armPush(this, model, hangs);
                continue;
            }

            const dt = hangs.time === null ? 0 : Math.min(0.1, Math.max(0, time - hangs.time));
            const place = model.userData.sheath;
            const hips = this.rig.bone(place.bone);
            const sheathed = this.sheathed && !model.userData.settling;

            hangs.time = time;
            // (The thigh thicker at the hip than the knee, the calf than the ankle)
            hangs.radius ??= [`${hangs.side}UpLeg`, `${hangs.side}Leg`].map((bone, k) => HANG_THICK.map((between) => limbThickness(this, bone, k ? `${hangs.side}Foot` : `${hangs.side}Leg`, between)));

            const names = HANG_LEG[hangs.side];
            // (Out from the body: the left hip's to the left)
            const outward = hangs.side === "Left" ? 1 : -1;

            // (Where its frog hangs it, as tight to the body as it can be, and how clear of the
            // leg that keeps it: fitHanging)
            if (hangs.clear === null) {
                fitHanging(this, model, hangs, place, names);
            }

            const leg = _legJoints;

            for (let i = 0; i < 3; i++) {
                this.rig.bone(names[i]).getWorldPosition(leg[i]);
            }

            const across = this.rig.bone("LeftUpLeg").getWorldPosition(_across).sub(this.rig.bone("RightUpLeg").getWorldPosition(_hangFrom)).normalize();
            const at = _hangAt.copy(place.position).addScaledVector(hangs.seated, seated ? 1 : 0);
            const down = _hangDown.set(0, 1, 0).applyQuaternion(hips.getWorldQuaternion(_hangTurn).multiply(place.quaternion));
            const edge = _hangEdge.set(0, 0, 1).applyQuaternion(_hangTurn);
            // (Where it hangs left alone: from its frog, or held by its pommel, tipped back and
            // drawn out from the body a little)
            const held = hangs.side === "Left" ? this.held ?? 0 : 0;
            // (And shoved out along the belt by the thigh as it comes up in front, past HANG_LIFT)
            const thigh = _hangLift.copy(leg[1]).sub(leg[0]);
            const turn = hips.getWorldQuaternion(_hangBack);
            const raised = Math.atan2(thigh.dot(_hangAxis.set(0, 0, 1).applyQuaternion(turn)), -thigh.dot(_hangAxis.set(0, 1, 0).applyQuaternion(turn)));
            const shoved = smoothstep(HANG_LIFT.from, HANG_LIFT.to, raised) * HANG_LIFT.off;
            const backHeld = held * HANG_HELD.back;
            const outHeld = held * HANG_HELD.out;
            const off = place.out ? Math.max(held * HANG_HELD.off, shoved) : 0;

            // (It swings about the frog, at the scabbard's mouth)
            // (Where it hangs from, as the seat and a hand on it have it: armPush too)
            hangs.at = (hangs.at ?? new THREE.Vector3()).copy(at).addScaledVector(place.out ?? _hangPoint.set(0, 0, 0), off);

            const pivot = hips.localToWorld(_hangFrom.copy(hangs.at)).addScaledVector(down, HANG_PIVOT);
            const forward = _hangForward.crossVectors(across, _up);
            const posed = _hangPosed;

            posed.pivot = pivot;
            posed.down = down;
            posed.edge = edge;
            posed.leg = leg;
            posed.across = across;
            posed.forward = forward;

            // The swing clear of the leg nearest how it hangs now (pushed no further than it must
            // be), and the one nearest hanging as it's left (where it falls back to); or, if none
            // is clear, the most clear
            let [pushed, pushedBack, pushedOut, pushedMoved] = [false, 0, 0, 0];
            let [resting, restingBack, restingOut, restingHanging] = [false, 0, 0, 0];
            let [bestBack, bestOut, most] = [0, 0, -Infinity];

            for (let o = 0; o < HANG_OUT.length; o++) {
                const out = HANG_OUT[o];

                for (let b = 0; b < HANG_ANGLES.length; b++) {
                    const back = HANG_ANGLES[b];
                    const clear = hangNearest(hangs, back, out, posed);
                    const moved = Math.abs(back - hangs.angle) + Math.abs(out - hangs.out);
                    const hanging = Math.abs(back - backHeld) + Math.abs(out - outHeld) * 1.5;

                    if (clear > most) {
                        bestBack = back;
                        bestOut = out;
                        most = clear;
                    }

                    if (clear >= HANG_PUSH && (!pushed || moved < pushedMoved)) {
                        pushed = true;
                        pushedBack = back;
                        pushedOut = out;
                        pushedMoved = moved;
                    }

                    if (clear >= 0 && (!resting || hanging < restingHanging)) {
                        resting = true;
                        restingBack = back;
                        restingOut = out;
                        restingHanging = hanging;
                    }
                }
            }

            // Pushed at once by the leg it's in; falling back slowly (or taken there by the hand
            // holding it), never into it
            if (hangNearest(hangs, hangs.angle, hangs.out, posed) < 0 || dt === 0) {
                hangs.angle = pushed ? pushedBack : bestBack;
                hangs.out = pushed ? pushedOut : bestOut;
            } else {
                const back = resting ? restingBack : backHeld;
                const out = resting ? restingOut : outHeld;
                const step = HANG_FALL * dt;
                const nextBack = hangs.angle + Math.sign(back - hangs.angle) * Math.min(Math.abs(back - hangs.angle), step);
                const nextOut = hangs.out + Math.sign(out - hangs.out) * Math.min(Math.abs(out - hangs.out), step);

                if (hangNearest(hangs, nextBack, nextOut, posed) >= 0) {
                    hangs.angle = nextBack;
                    hangs.out = nextOut;
                }
            }

            // (Turned about the hip's own across, then its forward, in the hip's frame, about the
            // frog)
            const local = _hangInverse.copy(hips.matrixWorld).invert();
            const swing = _hangTurn.setFromAxisAngle(forward.transformDirection(local), hangs.out * outward).multiply(_hangBack.setFromAxisAngle(across.transformDirection(local), hangs.angle));
            const frog = _hangDown.set(0, HANG_PIVOT, 0).applyQuaternion(place.quaternion);

            if (sheathed) {
                swingHung(model, at, frog, swing, place, off);
            }

            if (hangs.holder) {
                swingHung(hangs.holder, at, frog, swing, place, off);
            }
        }
    }

    /**
     * Where a hand resting on the pommel of the blade hung at that side's hip (`side`: "Left" or
     * "Right") holds it, as it hangs now, in the world: { position (the middle of the hand's grip,
     * round the end of the hilt), point (along the hilt, to its end), forward (the body's way) };
     * or null (none hangs there, sheathed).
     */
    pommelOf(side) {
        const model = this.sheathed ? this.items.find((item) => item.userData.hangs?.side === side && !item.userData.settling) : null;

        if (!model) {
            return null;
        }

        const hangs = model.userData.hangs;
        const hips = this.rig.bone(model.userData.sheath.bone);
        const turn = hips.getWorldQuaternion(new THREE.Quaternion()).multiply(model.quaternion);

        return {
            position: hips.localToWorld(new THREE.Vector3(0, hangs.pommel + POMMEL_GRIP, 0).applyQuaternion(model.quaternion).add(model.position)),
            point: new THREE.Vector3(0, -1, 0).applyQuaternion(turn),
            forward: new THREE.Vector3(0, 0, 1).applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion())),
        };
    }

    /**
     * Where the weapon a hand ("Left" or "Right") draws is when put away, in the world: { position
     * (its grip), point (along its grip, to the blade or head), edge }, or null (nothing to draw).
     */
    sheathPose(side) {
        const model = this.items.find((item) => item.userData.hand === side && item.userData.sheath);

        if (!model) {
            return null;
        }

        const { bone, position, quaternion } = model.userData.sheath;
        const parent = this.rig.bone(bone);
        const turn = parent.getWorldQuaternion(new THREE.Quaternion()).multiply(quaternion);

        return {
            position: parent.localToWorld(position.clone()),
            point: new THREE.Vector3(0, 1, 0).applyQuaternion(turn),
            edge: new THREE.Vector3(0, 0, 1).applyQuaternion(turn),
        };
    }

    /** A drape's material, made once per kit. */
    #drapeMaterial(id) {
        const kit = this.kit;

        kit.drapeMaterials ??= new Map();

        if (!kit.drapeMaterials.has(id)) {
            kit.drapeMaterials.set(id, drapeMaterial(DRAPES[id]));
        }

        return kit.drapeMaterials.get(id);
    }

    /**
     * A garment's material, its texture painted once per kit; a people's make of one that only
     * differs in colour (`base`: liveries.js), its picture tinted to its colour (wardrobe.js):
     * its own to draw with, kept by the kit while it does.
     */
    #garmentMaterial(id) {
        return drawingGarment(this, id);
    }

    /**
     * The material of an outfit's garments drawn all at once (ids, outermost last): one picture of
     * them all (garments.js compositeGarments), its heights, roughness and metalness in another.
     * Made once per kit for each outfit, and let go when no one's worn it for a while; its
     * pictures as big as its wearers are seen (wardrobe.js).
     */
    *#compositing(ids) {
        return yield* wearingOutfit(this, ids);
    }

    // No longer wearing the outfit whose picture it was drawn with (kept a while, for the next
    // to wear it), nor drawing with any garment's own
    #release() {
        leaveOutfit(this);
        leaveGarments(this);
    }

    /** Change how the character looks: { skin, eyes, hair } (see LOOK_DEFAULTS). */
    setLook(look = {}) {
        allAtOnce(this.#looking(look));
    }

    // The same, a step at a time (each a yield: its skin painted a few rows a step, unless `skin`
    // is false: put on later, then); its hair grown too, unless `hair` is false (grown when it's
    // dressed, then)
    *#looking(look, { hair: grow = true, skin: paint = true } = {}) {
        this.look = lookOf(look);

        const { skin, eyes, hair } = this.look;

        if (paint) {
            yield* this.#skinning();
        }

        this.materials.tint.color.set(skin.tone);
        yield;
        this.#setEyes(eyes);
        this.materials.lashes.color.set(skin.browColour ?? hair.colour).multiplyScalar(0.6);
        this.materials.hair.color.set(hair.colour);

        if (grow) {
            yield* this.#growingHair();
        }
    }

    // Its skin painted as it looks, a step at a time (or, if it was asked for elsewhere, `job`,
    // taken once it's painted there: skins.js), and put on
    *#skinning(job = null) {
        const settings = paintedSkin(this.look);

        if (!this.kit.atlas) {
            this.materials.body.color.set(settings.tone);

            return;
        }

        const sizes = this.#skinSizes();

        // (Asked for anew meanwhile, at another size: this one's the skin it has now)
        this.#forget();
        this.#wearSkin(job ? yield* this.kit.skins.painting(job) : yield* sizingSkin(yield* paintingSkin(this.kit.atlas, settings), sizes.size, sizes.small));
    }

    // The size its skin's wanted at now (texels a side: as it's painted, or smaller for one of
    // the game's seen small, fitPictures), and the size it's also kept at on the page while it's
    // bigger than that, to go back to (0: not kept): { size, small }
    #skinSizes() {
        const full = this.kit.atlas?.size ?? 0;
        const size = Math.min(full, this.pictures.wanted ?? full);
        const least = Math.min(full, PICTURES.least);

        return { size, small: this.release && least < size ? least : 0 };
    }

    // A painted skin put on (paintingSkin's, at whatever size: sizingSkin's): its colour and its
    // bumps, each in the picture it had if it had one
    #wearSkin({ data, bump, width, small = null }) {
        this.#setTexture(this.materials.body, "map", data, width, true);
        this.#setTexture(this.materials.body, "bumpMap", bump, width, false);
        this.materials.body.bumpScale = 1.2;
        this.pictures.skin = width;
        this.pictures.small = small;

        // (Its 4 MB of colour and 1 MB of bumps let go of once they're sent, if it's one of the
        // game's: painted again, they're sent and let go of again)
        for (const texture of this.release ? [this.materials.body.map, this.materials.body.bumpMap] : []) {
            if (!texture.userData.released) {
                texture.userData.released = true;
                releaseTexture(texture);
            }
        }
    }

    /**
     * Its pictures held at the size it's seen at: `tall` pixels tall on the screen (drawing buffer
     * pixels; where it stands, in view or not), `dt` seconds on. Seen bigger than its pictures are
     * for (pictures.js PICTURES), bigger ones are asked for at once: its skin painted again
     * elsewhere (skins.js: or here, a step each time this is called, where it can't be), its
     * outfit's by its tallest wearer (wardrobe.js), its wounds' (world/wounds.js). Seen smaller a
     * while, they're swapped back. Only one of the game's (`release`): anyone else's are as
     * they're painted. Called every frame it may be drawn (`now`: the frame's time, ms): the
     * kit's wardrobe is tended as it is (wardrobe.js tendKit: once a frame, whoever calls).
     */
    fitPictures(tall, dt = 0, now = performance.now()) {
        const pictures = this.pictures;

        if (!this.release) {
            return;
        }

        tendKit(this.kit, now);

        pictures.held = Math.max(0, pictures.held - dt);

        const has = pictures.wanted ?? pictures.full;
        let size = pictures.held > 0 ? pictures.full : pictureSize(tall, has, pictures.full);

        // (Smaller only once it's been seen that small a while)
        pictures.under = size < has ? pictures.under + dt : 0;

        if (size < has && pictures.under < PICTURES.after) {
            size = has;
        }

        if (size !== pictures.wanted) {
            pictures.wanted = size;
            pictures.under = 0;
            fitOutfit(this);
        }

        this.#fitSkin();
    }

    /**
     * Its pictures as big as they're painted, however small it's seen, for a while from now
     * (PICTURES.held seconds: drawn close for a likeness of it; asked again, a while longer):
     * whether they are yet. Anyone else's are as they're painted: but for an outfit's, if it
     * was given only the colour kept of them (wardrobe.js: let go of since the game's own bodies
     * were given theirs), which is made whole here, at once.
     */
    whole(now = performance.now()) {
        if (!this.release) {
            wholeOutfit(this);

            return true;
        }

        this.pictures.held = PICTURES.held;
        this.fitPictures(Infinity, 0, now);

        return outfitWhole(this) && (this.pictures.skin === null || this.pictures.skin >= this.kit.atlas.size);
    }

    // Its skin the size wanted now, if it isn't: the smaller one kept put back on, or one asked
    // for (painted elsewhere, or here a step a call), and put on when it's painted
    #fitSkin() {
        const pictures = this.pictures;

        // (No skin of its own painted, or not yet: its building puts it on at the size wanted)
        if (pictures.skin === null || !this.kit.atlas) {
            return;
        }

        // (As it is, most frames: nothing made to find that out)
        if (!pictures.job && pictures.skin === Math.min(this.kit.atlas.size, pictures.wanted ?? this.kit.atlas.size)) {
            return;
        }

        const { size, small } = this.#skinSizes();

        if (pictures.job && pictures.job.size !== size) {
            this.#forget();
        }

        if (size === pictures.skin) {
            return;
        }

        if (pictures.small?.width === size) {
            this.#wearSkin(pictures.small);

            return;
        }

        if (!pictures.job) {
            const settings = paintedSkin(this.look);
            const asked = this.kit.skins?.ask(settings, { size, small }) ?? null;

            pictures.job = { size, asked, steps: asked ? null : this.#resizing(settings, size, small) };
        }

        const { asked } = pictures.job;

        // (Painted elsewhere, and back; or the worker's gone, and it's painted here after all)
        if (asked?.skin) {
            pictures.job = null;
            this.#wearSkin(asked.skin);

            return;
        }

        if (asked && !this.kit.skins.worker) {
            pictures.job.asked = null;
            pictures.job.steps = this.#resizing(paintedSkin(this.look), size, small);
        }

        const step = pictures.job.steps?.next();

        if (step?.done) {
            pictures.job = null;
            this.#wearSkin(step.value);
        }
    }

    // Its skin painted here at another size, a step at a time, returning it
    *#resizing(settings, size, small) {
        return yield* sizingSkin(yield* paintingSkin(this.kit.atlas, settings), size, small);
    }

    // A skin of another size asked for and not yet come no longer wanted
    #forget() {
        const job = this.pictures.job;

        if (job?.asked) {
            this.kit.skins?.forget(job.asked);
        }

        this.pictures.job = null;
    }

    // Its eyes' picture: painted once for each look of eye, and shared by everyone with it
    #setEyes(eyes) {
        const kit = this.kit;
        const key = JSON.stringify(eyes);

        if (key === this.eyePicture) {
            return;
        }

        kit.eyes ??= new Map();
        this.#releaseEyes();
        this.materials.eyes.map = take(kit.eyes, key, () => {
            const { data, width } = paintEye(eyes);
            const canvas = document.createElement("canvas");
            const texture = new THREE.CanvasTexture(canvas);

            canvas.width = canvas.height = width;
            canvas.getContext("2d").putImageData(new ImageData(data, width, width), 0, 0);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;

            return texture;
        });
        this.materials.eyes.needsUpdate = true;
        this.eyePicture = key;
    }

    // No longer drawing its eyes with the picture it did: kept a while, for the next with them
    #releaseEyes() {
        letGo(this.kit.eyes, this.eyePicture, IDLE, (texture) => texture.dispose());
        this.materials.eyes.map = null;
        this.eyePicture = null;
    }

    #buildHair() {
        allAtOnce(this.#growingHair());
    }

    // The same, a step at a time (each a yield: hair.js growingHair's)
    *#growingHair() {
        const { style, beard } = this.look.hair;
        const under = this.hairRim;
        // (Where it grows worked out once for both)
        const shared = {};
        const geometry = yield* growingHair(this, style, beard, { under, detail: this.hairDetail, shared });
        // (And for those drawn with fewer triangles from afar, a far thinner one: setDetail)
        const far = this.far ? yield* growingHair(this, style, beard, { under, detail: FAR.hair, far: true, shared }) : null;

        for (const mesh of [this.hairMesh, this.farHairMesh]) {
            if (mesh) {
                mesh.geometry.dispose();
                this.object.remove(mesh);
            }
        }

        this.hairMesh = geometry && this.#hairMesh(geometry, "hair");
        this.farHairMesh = far && this.#hairMesh(far, "farHair");

        // (Into the shadow maps, near too: shadowpasses.js)
        if (this.hairMesh && far) {
            castCheaply(this.hairMesh, { geometry: far });
        }

        this.setDetail(this.level);
    }

    // Hair grown (growingHair's geometry) on its head, skinned to its rig
    #hairMesh(geometry, name) {
        const mesh = new THREE.SkinnedMesh(geometry, this.materials.hair);

        mesh.name = name;
        mesh.castShadow = true;
        mesh.bind(this.rig.skeleton, new THREE.Matrix4());
        mesh.boundingSphere = this.mesh.boundingSphere;
        this.object.add(mesh);

        return mesh;
    }

    /**
     * A part's triangles as source vertex indices (the vertices shape() positions), optionally
     * only those whose first vertex is mostly moved by one of `bones`.
     */
    sourceTriangles(part, bones = null) {
        const human = this.human;
        const indices = human.renderIndices(part);
        const triangles = [];

        for (let t = 0; t < indices.length; t += 3) {
            const a = human.renderSource[indices[t]];

            if (!bones || bones.has(human.skinIndices[a * 4])) {
                triangles.push(a, human.renderSource[indices[t + 1]], human.renderSource[indices[t + 2]]);
            }
        }

        return triangles;
    }

    /**
     * Put a painted picture (rows from the top: RGBA, or a byte a texel for heights) into a
     * material's texture, reusing it if it's the same kind (its pixels may have been let go of,
     * once sent), whatever its size.
     */
    #setTexture(material, slot, data, size, colour) {
        const texture = material[slot];

        // (Not one given it on a canvas: materials, the constructor's option. Another size, in
        // the same picture all the same: whatever it's been told to do once it's sent, it still does)
        if (texture?.isDataTexture && texture.format === (data.length === size * size ? THREE.RedFormat : THREE.RGBAFormat)) {
            setPicture(texture, data, size);

            return;
        }

        texture?.dispose();
        material[slot] = dataTexture(data, size, colour);
        material.needsUpdate = true;
    }

    /** Change the body's shape (slider settings: { macro, details }). */
    setShape(shape = {}) {
        this.shape = shape;

        const { positions, joints } = this.human.shape(shape);
        const normals = this.human.normals(positions);
        const source = this.human.renderSource;
        const position = this.geometry.attributes.position;
        const normal = this.geometry.attributes.normal;

        for (let r = 0; r < source.length; r++) {
            const v = source[r] * 3;

            position.array[r * 3] = positions[v];
            position.array[r * 3 + 1] = positions[v + 1];
            position.array[r * 3 + 2] = positions[v + 2];
            normal.array[r * 3] = normals[v];
            normal.array[r * 3 + 1] = normals[v + 1];
            normal.array[r * 3 + 2] = normals[v + 2];
        }

        position.needsUpdate = true;
        normal.needsUpdate = true;

        this.positions = positions;
        this.normals = normals;
        this.joints = joints;
        this.height = 0;

        // (Its mouth's inside darkening from where its own mouth is)
        if (isMouth(this.materials.mouth)) {
            fitMouth(this.materials.mouth, this.human, positions);
        }

        for (let v = 0; v < this.human.vertexCount; v++) {
            if (this.human.partOf[v] === 0) {
                this.height = Math.max(this.height, positions[v * 3 + 1]);
            }
        }

        this.rig.fit(joints);

        // Skinned meshes are culled by a sphere around the whole character, whatever its pose
        const reach = this.height * 0.75;

        this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, this.height / 2, 0), reach);
        this.geometry.boundingSphere = this.mesh.boundingSphere.clone();

        if (this.look) {
            this.#buildHair();
        }

        // (What it wears refitted: when it's wearing anything)
        if (this.equipment.size) {
            this.#dress();
        }
    }

    /** Hide body triangles (under clothing), replacing those hidden before. */
    setHidden(triangles) {
        const hidden = new Uint8Array(Math.ceil(this.human.renderIndices("body").length / 3 / 8));

        for (const t of triangles) {
            hidden[t >> 3] |= 1 << (t & 7);
        }

        this.hidden = hidden;
        this.#updateIndex();
    }

    #createGeometry() {
        const human = this.human;
        const count = human.renderSource.length;
        const geometry = new THREE.BufferGeometry();
        const shared = skinningOf(human);

        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));

        // (The same for every body of its data: theirs too, not its own. disposeBody)
        for (const name of SHARED) {
            if (shared[name]) {
                geometry.setAttribute(name, shared[name]);
            }
        }

        this.geometry = geometry;
        this.hidden = null;
        this.#updateIndex();

        return geometry;
    }

    #updateIndex() {
        const human = this.human;
        const kept = this.#shown();

        // (Its lower-detail bodies made from what it shows, asked for again when that's changed)
        if (this.lods) {
            this.#lowerBody(kept);
        }

        const lows = this.lowBodies ?? [];
        const eyes = human.renderIndices("eyes");
        const lashes = human.renderIndices("lashes");
        const mouth = human.renderIndices("mouth");
        const lowEyes = this.lowEyes ?? [];
        const mouthAt = kept.length + eyes.length + lashes.length;
        // (Each level's body one after another, after the mouth)
        const lowAt = [];
        let at = mouthAt + mouth.length;

        for (const low of lows) {
            lowAt.push(at);
            at += low.length;
        }

        const lowEyesAt = at;
        // (Its whole body for the shadow maps, under its clothes too: from afar, as far as it has
        // it; in full till it does)
        const shadow = this.lowShadow ?? human.renderIndices("body");
        const shadowAt = lowEyesAt + lowEyes.length;
        const index = new Uint16Array(shadowAt + shadow.length);

        index.set(kept, 0);
        index.set(eyes, kept.length);
        index.set(lashes, kept.length + eyes.length);
        index.set(mouth, mouthAt);
        lows.forEach((low, k) => index.set(low, lowAt[k]));
        index.set(lowEyes, lowEyesAt);
        index.set(shadow, shadowAt);

        this.geometry.setIndex(new THREE.BufferAttribute(index, 1));

        // Its groups drawn at each level: in full; then each level's body and the eyes from afar
        // (as far as it has them; not lashes, nor the mouth's inside)
        const full = [
            { start: 0, count: kept.length, materialIndex: 0 },
            { start: kept.length, count: eyes.length, materialIndex: 1 },
            { start: kept.length + eyes.length, count: lashes.length, materialIndex: 2 },
            ...(mouth.length ? [{ start: mouthAt, count: mouth.length, materialIndex: 3 }] : []),
        ];
        const farEyes = this.lowEyes ? { start: lowEyesAt, count: lowEyes.length, materialIndex: 1 } : full[1];
        const lowBodies = lows.map((low, k) => ({ start: lowAt[k], count: low.length, materialIndex: 0 }));

        // (And into the shadow maps, its whole body alone, from afar as far as it has it: what's
        // fitted over it (its garments, its armour) a few millimetres proud of it, under a
        // shadow map's texel, casts none of its own, so it's a draw into each, not one for each
        // garment: shadowpasses.js. What hangs from it (a skirt, a cloak) and its hair cast their own)
        this.detail = { levels: [full, ...LODS.map((lod, k) => (lowBodies[k] ? [lowBodies[k], farEyes] : full))], shadow: [{ start: shadowAt, count: shadow.length, materialIndex: 0 }] };
        this.geometry.groups = this.detail.levels[this.level];

        if (this.mesh) {
            castCheaply(this.mesh, { groups: this.detail.shadow });
        }
    }

    // The body's triangles it shows (not hidden under clothing)
    #shown() {
        const body = this.human.renderIndices("body");
        const kept = [];

        for (let t = 0; t < body.length / 3; t++) {
            if (!(this.hidden && (this.hidden[t >> 3] & (1 << (t & 7))))) {
                kept.push(body[t * 3], body[t * 3 + 1], body[t * 3 + 2]);
            }
        }

        return kept;
    }

    // Its body's triangles at each of LODS' levels, made from those it shows (`kept`), their edges
    // kept where they are: none reach in under its clothes, where a garment drawn with fewer
    // triangles of its own wouldn't hide them. Made once for everyone showing the same triangles
    // (dressed alike, whatever their shape), and put in when they come
    #lowerBody(kept) {
        const key = keyOf("body", kept);

        if (key === this.lowKey) {
            return;
        }

        this.lowKey = key;
        this.lowBodies = null;

        const levels = LODS.map(({ share, error }, k) => this.lods.of(`${key}@${k + 1}`, () => ({ indices: kept, positions: this.geometry.attributes.position.array, uvs: this.human.uvs, share, error })));

        Promise.all(levels).then(
            (lows) => {
                if (!this.disposed && this.lowKey === key) {
                    this.lowBodies = lows;
                    this.#updateIndex();
                }
            },
            () => {},
        );
    }

    /**
     * Get ready to be drawn with fewer triangles when it's small on the screen (`fitDetail`): its
     * body's and garments' triangles at each of LODS' levels asked for from `lods` (the kit's:
     * lod.js), each made once for everyone, elsewhere, and put in when they come. Its garments'
     * asked for again when it's dressed again.
     */
    lowerDetail(lods) {
        this.lods = lods;

        const human = this.human;

        this.#lowerBody(this.#shown());
        // (Its whole body from afar, for its shadow, made once for everyone: #updateIndex)
        const whole = human.renderIndices("body");
        const far = LODS.at(-1);

        lods.of(`${keyOf("shadow", whole)}@${LODS.length}`, () => ({ indices: whole, positions: this.geometry.attributes.position.array, uvs: human.uvs, share: far.share, error: far.error })).then(
            (low) => {
                if (!this.disposed && !this.lowShadow) {
                    this.lowShadow = low;
                    this.#updateIndex();
                }
            },
            () => {},
        );

        // (And its eyes: a few pixels from afar, a tenth of their triangles is plenty)
        lods.of("eyes", () => ({ indices: human.renderIndices("eyes"), positions: this.geometry.attributes.position.array, uvs: human.uvs, ...FAR.eyes })).then(
            (low) => {
                if (!this.disposed && !this.lowEyes) {
                    this.lowEyes = low;
                    this.#updateIndex();
                }
            },
            () => {},
        );

        for (const mesh of this.garments) {
            this.#lowerGarment(mesh);
        }
    }

    // A garment's triangles at each level put after its own, drawn instead of them as it's smaller
    // on the screen, and the farthest's into the shadow maps: an outfit's (its garments drawn all
    // at once) the same for all who wear it, a garment's or skirt's for all with the same
    // triangles of it
    #lowerGarment(mesh) {
        const { index, attributes } = mesh.geometry;
        // (A skirt under an apron's from those of its triangles that show: buildDrape's `shown`)
        const indices = mesh.userData.shown ? Uint32Array.from(mesh.userData.shown) : index.array;
        const key = mesh.userData.merged ? `outfit:${mesh.userData.merged.join("+")}` : keyOf(mesh.name, indices);
        // (A skirt's has no picture's layout to keep)
        const uvs = attributes.uv?.array ?? new Float32Array(attributes.position.count * 2);
        // (An apron's its own: buildDrape's `levels`)
        const own = mesh.userData.levels;
        const levels = LODS.map(({ share, error }, k) => (own ? Promise.resolve(own[Math.min(k, own.length - 1)]) : this.lods.of(`${key}@${k + 1}`, () => ({ indices, positions: attributes.position.array, uvs, share, error }))));

        Promise.all(levels).then(
            (lows) => {
                if (this.disposed || !this.garments.includes(mesh) || mesh.userData.detail) {
                    return;
                }

                const full = mesh.geometry.index.array;
                const all = new (full instanceof Uint16Array ? Uint16Array : Uint32Array)(lows.reduce((length, low) => length + low.length, full.length));
                // (Where each level's triangles are in it: in full first)
                const ranges = [{ start: 0, count: full.length }];

                all.set(full);

                for (const low of lows) {
                    const start = ranges.at(-1).start + ranges.at(-1).count;

                    all.set(low, start);
                    ranges.push({ start, count: low.length });
                }

                mesh.geometry.setIndex(new THREE.BufferAttribute(all, 1));
                mesh.userData.detail = ranges;
                castCheaply(mesh, { range: ranges.at(-1) });
                this.setDetail(this.level);
            },
            () => {},
        );
    }

    /** Drawn at a level of detail (`level`: 0 in full, then each of LODS'), as far as it has it (lowerDetail), else in full. */
    setDetail(level) {
        this.level = level;

        if (this.detail) {
            this.geometry.groups = this.detail.levels[level];
        }

        // (Its far thinner hair at the farthest level, only: nearer, it shows, thin and patchy. The
        // lods aren't asked for it, it's grown with the other)
        if (this.farHairMesh) {
            this.farHairMesh.visible = level === LODS.length;

            if (this.hairMesh) {
                this.hairMesh.visible = level < LODS.length;
            }
        }

        for (const { geometry, userData } of this.garments) {
            const range = userData.detail?.[level];

            if (range) {
                geometry.setDrawRange(range.start, range.count);
            }
        }
    }

    /**
     * Drawn with fewer triangles the smaller it is on the screen (`tall`, drawing buffer pixels):
     * at each of LODS' levels under its `below`, and at the level above again over its `above`;
     * never in more detail than the level `least` (Game's crowd: only so many of those in view
     * drawn in full); out of view (0), left as it is.
     */
    fitDetail(tall, least = 0) {
        if (tall <= 0) {
            return;
        }

        let level = this.level;

        while (level < LODS.length && tall < LODS[level].below) {
            level++;
        }

        while (level > 0 && tall > LODS[level - 1].above) {
            level--;
        }

        level = Math.max(level, least);

        if (level !== this.level) {
            this.setDetail(level);
        }
    }

    /** Pose the skeleton from its joint rotations (after changing them). */
    pose() {
        this.rig.apply();
    }

    /**
     * The skin's picture as it is now, on a canvas, say to save as a template for painting skins
     * (null if it's been let go of: the constructor's `release`).
     */
    get skinCanvas() {
        const image = this.materials.body.map?.image;

        if (!image?.data) {
            return null;
        }

        const canvas = document.createElement("canvas");

        // (Its colours: the alpha is how rough it is, skin.js, not how see-through)
        const colours = new Uint8ClampedArray(image.data);

        for (let i = 3; i < colours.length; i += 4) {
            colours[i] = 255;
        }

        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").putImageData(new ImageData(colours, image.width, image.height), 0, 0);

        return canvas;
    }

    dispose() {
        this.disposed = true;
        this.#forget();
        this.pictures.small = null;
        disposeBody(this.geometry);

        // (The skeleton's bone texture, made when it was first drawn)
        this.rig.skeleton.dispose();
        this.hairMesh?.geometry.dispose();
        this.farHairMesh?.geometry.dispose();

        for (const mesh of this.garments) {
            mesh.geometry.dispose();

            if (mesh.skeleton !== this.rig.skeleton) {
                mesh.skeleton.dispose();
            }
        }

        for (const item of this.items) {
            item.traverse((part) => part.geometry?.dispose());
        }

        this.#release();
        this.#releaseEyes();

        for (const [name, material] of Object.entries(this.materials)) {
            // (The hair's and the mouth's pictures are shared)
            if (name !== "hair" && !isMouth(material)) {
                material.map?.dispose();
            }

            material.bumpMap?.dispose();
            material.dispose();
        }
    }
}

// Whether a piece of equipment is one there is (told once in the console if not)
const unknown = new Set();

function known(id) {
    if (EQUIPMENT[id]) {
        return true;
    }

    if (!unknown.has(id)) {
        unknown.add(id);
        console.warn(`Left out ${id}: there's no such equipment.`);
    }

    return false;
}

const _sway = new THREE.Quaternion();
const _swayAngles = new THREE.Euler();

// How fast what's dropped falls (m/s²)
const GRAVITY = 9.8;
const _corner = new THREE.Vector3();
const _thin = new THREE.Vector3();
const _over = new THREE.Quaternion();

// (What's dropped lands at least this far out to the side of the line the body lies along, m)
const DROP_CLEAR = 0.4;

/**
 * Where something let go of (on the character's object, as it is now) falls to and how: from
 * where it is, out to the side of the line the body lies along (from `hips`, `along`, in the
 * object's frame) at least DROP_CLEAR beyond its own breadth, turned over onto its broadest side
 * (its thinnest way up or down, as is nearer), its lowest corner on the ground; and how long it
 * takes falling ({ from, out, turn, to, y, fall, time }).
 */
function droppedFrom(model, hips, along) {
    if (!model.userData.box) {
        model.updateWorldMatrix(true, true);

        const inverse = model.matrixWorld.clone().invert();
        const box = new THREE.Box3();

        model.traverse((mesh) => {
            if (mesh.isMesh && mesh.visible) {
                mesh.geometry.computeBoundingBox();
                box.union(mesh.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)));
            }
        });
        model.userData.box = box;
    }

    const box = model.userData.box;
    const size = box.getSize(_corner);
    const thinnest = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;

    _thin.set(0, 0, 0).setComponent(thinnest, 1).applyQuaternion(model.quaternion);

    const to = _over.setFromUnitVectors(_thin, new THREE.Vector3(0, Math.sign(_thin.y) || 1, 0)).multiply(model.quaternion).clone();
    let lowest = Infinity;

    for (let k = 0; k < 8; k++) {
        _corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyQuaternion(to);
        lowest = Math.min(lowest, _corner.y);
    }

    const y = 0.004 - lowest;

    // (Out to the side it's on, as far as clears the body, by its middle and half its breadth)
    const middle = box.getCenter(new THREE.Vector3()).applyQuaternion(to).add(model.position).sub(hips).setY(0);
    const across = new THREE.Vector3(along.z, 0, -along.x);
    const aside = middle.dot(across);
    const breadth = Math.max(size.x, size.y, size.z) * 0.5;
    const out = across.multiplyScalar(Math.sign(aside) * Math.max(0, DROP_CLEAR + breadth * 0.5 - Math.abs(aside)) || 0);

    return { from: model.position.clone(), out, turn: model.quaternion.clone(), to, y, fall: Math.max(0.12, Math.sqrt((2 * Math.max(0, model.position.y - y)) / GRAVITY)), time: 0 };
}

// Swing a blade hung at the hip (`model`, its `hangs`: Character.hang, on `character`) about
// its frog as little as keeps its hilt (its pommel, grip and crossguard's arms) HANG_ARM_CLEAR
// off that side's forearm and hand, posed as they are now, and its blade as clear of the leg as
// hang keeps it
function armPush(character, model, hangs) {
    const place = model.userData.sheath;
    const hips = character.rig.bone(place.bone);
    const Side = hangs.side;
    const outward = Side === "Left" ? 1 : -1;
    const turn = hips.getWorldQuaternion(_hangTurn).multiply(place.quaternion);
    const down = _hangDown.set(0, 1, 0).applyQuaternion(turn);
    const edge = _hangEdge.set(0, 0, 1).applyQuaternion(turn);
    const pivot = hips.localToWorld(_hangFrom.copy(hangs.at)).addScaledVector(down, HANG_PIVOT);
    const start = _armStart.copy(pivot);
    // (Out from the hip, in the world: the frog shoved that way along the belt, if need be)
    const away = _armAway.copy(place.out ?? _armOut.set(outward, 0, 0)).transformDirection(hips.matrixWorld);
    const across = character.rig.bone("LeftUpLeg").getWorldPosition(_across).sub(character.rig.bone("RightUpLeg").getWorldPosition(_hangAt)).normalize();
    const forward = _hangForward.crossVectors(across, _up);
    const arm = _armJoints;

    for (let i = 0; i < 3; i++) {
        character.rig.bone(HANG_ARM[Side][i]).getWorldPosition(arm[i]);
    }

    hangs.arm ??= limbThickness(character, `${Side}ForeArm`, `${Side}Hand`);

    const now = hiltOff(hangs, hangs.angle, hangs.out, pivot, down, edge, across, forward, arm);

    if (now >= HANG_ARM_CLEAR) {
        return;
    }

    // (The swing that clears it nearest how it hangs, not into the leg, as hang measures it; the
    // frog shoved out along the belt as little as lets one. If none clears it so far and the arm's
    // in it, the nearest that takes it out of the arm, or failing that the furthest out of it.
    // Each of them [back, out, how far it's moved, the shove, how clear])
    const posed = _hangPosed;
    let [best, freed, most] = [null, null, null];

    for (let i = 0; i < 3; i++) {
        character.rig.bone(HANG_LEG[Side][i]).getWorldPosition(_legJoints[i]);
    }

    posed.pivot = pivot;
    posed.down = down;
    posed.edge = edge;
    posed.leg = _legJoints;
    posed.across = across;
    posed.forward = forward;

    for (let n = 0; n < HANG_ARM_SHOVE.length; n++) {
        const shove = HANG_ARM_SHOVE[n];

        pivot.copy(start).addScaledVector(away, shove);

        for (let o = 0; o < HANG_OUT.length; o++) {
            const out = HANG_OUT[o];

            for (let b = 0; b < HANG_ANGLES.length; b++) {
                const back = HANG_ANGLES[b];
                const moved = Math.abs(back - hangs.angle) + Math.abs(out - hangs.out);
                const clear = hiltOff(hangs, back, out, pivot, down, edge, across, forward, arm);
                const kept = clear >= HANG_ARM_CLEAR ? best : clear >= 0 ? freed : null;

                if ((kept ? moved >= kept[2] : clear < 0 && most && clear <= most[4]) || hangNearest(hangs, back, out, posed) < 0) {
                    continue;
                }

                const found = clear >= HANG_ARM_CLEAR ? (best = _armBest) : clear >= 0 ? (freed = _armFreed) : (most = _armMost);

                found[0] = back;
                found[1] = out;
                found[2] = moved;
                found[3] = shove;
                found[4] = clear;
            }
        }

        if (best) {
            break;
        }
    }

    best ??= now >= 0 ? null : (freed ?? (most && most[4] > now + HANG_ARM_GAIN ? most : null));

    if (!best) {
        return;
    }

    hangs.angle = best[0];
    hangs.out = best[1];
    hangs.at.addScaledVector(place.out ?? _armOut.set(outward, 0, 0), best[3]);

    const local = _hangInverse.copy(hips.matrixWorld).invert();
    const swing = _hangTurn.setFromAxisAngle(forward.transformDirection(local), hangs.out * outward).multiply(_hangBack.setFromAxisAngle(across.transformDirection(local), hangs.angle));
    const frog = _hangDown.set(0, HANG_PIVOT, 0).applyQuaternion(place.quaternion);

    if (character.sheathed && !model.userData.settling) {
        swingHung(model, hangs.at, frog, swing, place, 0);
        model.updateMatrixWorld(true);
    }

    if (hangs.holder) {
        swingHung(hangs.holder, hangs.at, frog, swing, place, 0);
        hangs.holder.updateMatrixWorld(true);
    }
}

// How far (metres, less the arm's thickness) the hilt of a blade hung at the hip (its `hangs`),
// swung `back` and `out` about `pivot` (hung along `down`, its edge `edge`), keeps off the arm
// (its joints, `arm`: armPush)
function hiltOff(hangs, back, out, pivot, down, edge, across, forward, arm) {
    const outward = hangs.side === "Left" ? 1 : -1;
    const along = _hangAlong.copy(down).applyAxisAngle(across, back).applyAxisAngle(forward, out * outward);
    const sideways = _hangSide.copy(edge).applyAxisAngle(across, back).applyAxisAngle(forward, out * outward);
    let least = Infinity;

    for (let h = 0; h < hangs.hilt.length; h++) {
        const point = _hangPoint.copy(pivot).addScaledVector(along, hangs.hilt[h][0] - HANG_PIVOT).addScaledVector(sideways, hangs.hilt[h][1]);

        for (let k = 0; k < 2; k++) {
            least = Math.min(least, offSegment(point, arm[k], arm[k + 1], 0, 0) - hangs.arm);
        }
    }

    return least;
}

// How far a point is from a limb between two of its joints (`start`, `end`), less how thick the
// limb is where the point's nearest it (`top` at `start`, `bottom` at `end`). (In the numbers
// themselves, as three.js's Line3 works its nearest point out and how far off that is, to the
// last bit: asked of a line, each number it hands back is made anew, and this is asked forty
// times each time a blade's asked how clear it is, 86 times a frame)
function offSegment(point, start, end, top, bottom) {
    const ex = end.x - start.x;
    const ey = end.y - start.y;
    const ez = end.z - start.z;
    const length = ex * ex + ey * ey + ez * ez;
    const on = length === 0 ? 0 : Math.max(0, Math.min(1, (ex * (point.x - start.x) + ey * (point.y - start.y) + ez * (point.z - start.z)) / length));
    const dx = ex * on + start.x - point.x;
    const dy = ey * on + start.y - point.y;
    const dz = ez * on + start.z - point.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (top + (bottom - top) * on);
}

// How much clearer of the leg (its joints `leg`; metres, less the limb's thickness) than it's
// kept (`hangs.clear`) a blade hung at the hip (its `hangs`: Character.hang) from `pivot` along
// `down`, its edge `edge`, swung `back` and `out`, is all the way down, its back and its edge
// (below 0, the leg's pushing it); and, given `each`, how near it comes to the leg at each place.
// As it's posed: `posed`, { pivot, down, edge, leg, across, forward }
function hangNearest(hangs, back, out, posed, each = null) {
    const { pivot, down, edge, leg, across, forward } = posed;
    // (Out from the body: the left hip's to the left)
    const outward = hangs.side === "Left" ? 1 : -1;
    const along = _hangAlong.copy(down).applyAxisAngle(across, back).applyAxisAngle(forward, out * outward);
    const sideways = _hangSide.copy(edge).applyAxisAngle(across, back).applyAxisAngle(forward, out * outward);
    let least = Infinity;

    for (let i = 0; i < HANG_SAMPLES.length; i++) {
        for (let j = 0; j < 2; j++) {
            const point = _hangPoint.copy(pivot).addScaledVector(along, hangs.length * HANG_SAMPLES[i] - HANG_PIVOT).addScaledVector(sideways, j * hangs.width);
            let near = Infinity;

            for (let k = 0; k < 2; k++) {
                near = Math.min(near, offSegment(point, leg[k], leg[k + 1], hangs.radius[k][0], hangs.radius[k][1]));
            }

            least = Math.min(least, near - (hangs.clear?.[2 * i + j] ?? 0));

            if (each) {
                each[2 * i + j] = near;
            }
        }
    }

    return least;
}

// What hangs at the hip (the blade, or what it hangs in) put where it hangs from (`at`), swung
// (`swing`) about its frog, and shoved `off` out along the belt
function swingHung(hung, at, frog, swing, place, off) {
    hung.position.copy(at).add(frog).sub(_hangPoint.copy(frog).applyQuaternion(swing));

    if (off > 0) {
        hung.position.addScaledVector(place.out, off);
    }

    hung.quaternion.copy(swing).multiply(place.quaternion);
}

/**
 * Where a blade hung from the belt (`model`, its `hangs`: Character.hang, on `character`) hangs
 * from its frog (`place`, moved there): stood off the belt (the way off the body there,
 * `place.out`) as little as keeps the blade and its scabbard HANG_SKIN off the skin of the body
 * standing as it's made (facing +z, its joints `rig.heads`), pommel to tip, the hilt HANG_HILT_SKIN;
 * the frog where its sheath says round the front of the hip, or, if that's further off the belt
 * than HANG_SNUG (a belly in the way of the hilt), back towards the side until it isn't (or as
 * near as any); and how clear of the leg (`names`: its joints; as hang measures it, hangNearest)
 * that keeps it at each place down it, which the leg's pushing it further than is kept there (or
 * HANG_CLEAR, if that's less).
 */
function fitHanging(character, model, hangs, place, names) {
    const { human, positions, rig } = character;
    const rest = (name) => rig.heads[rig.index.get(name)];
    const hips = rest("Hips");
    const sheath = EQUIPMENT[model.name]?.sheath;
    // (The blade's and scabbard's points, in its own frame: along every edge of them, every few
    // centimetres, a long scabbard's too; the hilt's, above the scabbard's mouth, apart; and how
    // far its edge is from its back, down the blade: Character.hang)
    const [marks, hilt] = [[], []];
    let width = 0;

    for (const hung of [model, hangs.holder]) {
        const inverse = hung?.matrixWorld.clone().invert();

        hung?.traverse((part) => {
            const position = part.isMesh ? part.geometry.attributes.position : null;
            const index = position ? part.geometry.index : null;
            const to = position ? inverse.clone().multiply(part.matrixWorld) : null;
            const corner = (i) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(to);

            for (let t = 0; position && t + 2 < (index?.count ?? position.count); t += 3) {
                for (let k = 0; k < 3; k++) {
                    const [from, end] = [corner(t + k), corner(t + ((k + 1) % 3))];
                    const steps = Math.max(1, Math.ceil(from.distanceTo(end) / HANG_EVERY));

                    for (let n = 0; n < steps; n++) {
                        const mark = from.clone().lerp(end, n / steps);

                        width = mark.y > HANG_PIVOT + HANG_HILT ? Math.max(width, mark.z) : width;
                        (mark.y < HANG_PIVOT ? hilt : marks).push(mark);
                    }
                }
            }
        });
    }

    const vertex = new THREE.Vector3();
    // (Stood off the hip straight out from its side)
    const out = new THREE.Vector3(hangs.side === "Left" ? 1 : -1, 0, 0);
    // How far off the belt, out from the hip, a frog `at` (a place) must stand
    const standing = (at) => {
        const [blade, top] = [marks, hilt].map((points) => points.map((mark) => mark.clone().applyQuaternion(at.quaternion).add(at.position).add(hips)));
        // (The skin they could come near, in cells of HANG_CELL)
        const box = new THREE.Box3().setFromPoints([...blade, ...top]).expandByScalar(HANG_HILT_SKIN);

        box.max.x += out.x > 0 ? HANG_STAND : 0;
        box.min.x -= out.x < 0 ? HANG_STAND : 0;

        // (Each cell by a number, its place each way within 512 cells of the middle: a body's
        // within 70. By a name written out for it, the 27 cells round every mark each step were
        // megabytes of names for each blade fitted)
        const cells = new Map();
        const cellOf = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0 && box.containsPoint(vertex.fromArray(positions, v * 3))) {
                const key = cellOf(Math.floor(vertex.x / HANG_CELL), Math.floor(vertex.y / HANG_CELL), Math.floor(vertex.z / HANG_CELL));

                // (Added to its cell's own list: a new list of them all for each, a blade's
                // fitting made megabytes of them)
                if (!cells.has(key)) {
                    cells.set(key, []);
                }

                cells.get(key).push(vertex.clone());
            }
        }

        const clearOf = (points, near, off) =>
            points.every((mark) => {
                const point = vertex.copy(mark).addScaledVector(out, off);
                const i = Math.floor(point.x / HANG_CELL);
                const j = Math.floor(point.y / HANG_CELL);
                const k = Math.floor(point.z / HANG_CELL);

                for (let di = -1; di <= 1; di++) {
                    for (let dj = -1; dj <= 1; dj++) {
                        for (let dk = -1; dk <= 1; dk++) {
                            const there = cells.get(cellOf(i + di, j + dj, k + dk));

                            for (let n = 0; there && n < there.length; n++) {
                                if (there[n].distanceToSquared(point) < near * near) {
                                    return false;
                                }
                            }
                        }
                    }
                }

                return true;
            });
        let stand = 0;

        // (The hilt first: it's what a belly's in the way of)
        while (stand < HANG_STAND && !(clearOf(top, HANG_HILT_SKIN, stand) && clearOf(blade, HANG_SKIN, stand))) {
            stand += HANG_STAND_STEP;
        }

        return { at, out, stand };
    };
    let best = standing(place);

    for (let round = (sheath?.round ?? 0) - HANG_ROUND; sheath?.round && best.stand > HANG_SNUG && round >= HANG_ROUND_LEAST; round -= HANG_ROUND) {
        const tried = standing(placed(socketOn(character, sheath.socket, { round }), sheath));

        best = tried.stand < best.stand ? tried : best;
    }

    place.position.copy(best.at.position).addScaledVector(best.out, best.stand);
    place.quaternion.copy(best.at.quaternion);
    place.out = best.out;

    const across = rest("LeftUpLeg").clone().sub(rest("RightUpLeg")).normalize();
    const down = new THREE.Vector3(0, 1, 0).applyQuaternion(place.quaternion);
    const pivot = hips.clone().add(place.position).addScaledVector(down, HANG_PIVOT);
    const each = [];

    // (The hilt's: its pommel, the middle of its grip, and its crossguard's arms, as [y, z]: armPush)
    const pommel = hilt.reduce((low, mark) => (mark.y < low.y ? mark : low), hilt[0] ?? new THREE.Vector3(0, hangs.pommel, 0));
    const guard = hilt.reduce((wide, mark) => (Math.abs(mark.z) > Math.abs(wide.z) ? mark : wide), pommel);

    hangs.hilt = [
        [pommel.y, 0],
        [(pommel.y + guard.y) / 2, 0],
        [guard.y, Math.abs(guard.z)],
        [guard.y, -Math.abs(guard.z)],
        // (and the blade or scabbard below the frog, where a hand comes up past it, or a forearm
        // reaching behind the back crosses it swung back)
        ...[1.6, 2.4, 3.2, 4].flatMap((below) => [[HANG_PIVOT * below, width], [HANG_PIVOT * below, -width]]),
    ];
    hangs.width = width;
    hangNearest(hangs, 0, 0, { pivot, down, edge: new THREE.Vector3(0, 0, 1).applyQuaternion(place.quaternion), leg: names.map(rest), across, forward: new THREE.Vector3().crossVectors(across, _up) }, each);
    hangs.stand = best.stand;
    hangs.clear = each.map((near) => Math.min(HANG_CLEAR, near - HANG_GIVE));
}

// A blade hung from the belt (Character.hang): where it swings about (its frog, at the scabbard's
// mouth: metres down the blade from the middle of its grip); how far its frog may stand off the
// belt, to keep it off the hips and thigh (metres, fitHanging), in steps of so much, by how much
// (metres from the blade's and scabbard's points to the skin's: what's worn over the skin, and a
// little), looking at every so many of their points; how much further back and out a hand on its
// pommel holds it (radians), and how far out from the body (metres: off the front of the thigh as
// it comes up running, the crossguard's forward arm); the swings about the frog tried (radians: forward, below 0, a
// little, to back, the most; and out, as a leg kicks a scabbard aside), where along it it's kept
// clear of the leg, by how much at most (metres: as much as it's clear standing, a little less,
// `HANG_GIVE`, if that's less), and how fast it falls back to hang as it was (radians a second)
const HANG_PIVOT = 0.1;
const HANG_HILT = 0.05;
const HANG_STAND = 0.1;
const HANG_STAND_STEP = 0.005;
// (And, the frog stood off further than HANG_SNUG where its sheath says, how far back round the
// hip towards its side it's tried instead, in steps of so many degrees, and no further than so
// far round from the side)
const HANG_SNUG = 0.05;
const HANG_ROUND = 10;
const HANG_ROUND_LEAST = 20;
const HANG_SKIN = 0.012;
const HANG_HILT_SKIN = 0.045;
const HANG_EVERY = 0.03;
const HANG_CELL = 0.03;
const HANG_HELD = { back: (5 * Math.PI) / 180, out: (5 * Math.PI) / 180, off: 0.05 };
const HANG_ANGLES = Array.from({ length: 14 }, (_, k) => ((k * 5 - 5) * Math.PI) / 180);
const HANG_OUT = [0, 5, 10, 20, 30, 40].map((degrees) => (degrees * Math.PI) / 180);
const HANG_SAMPLES = [0.3, 0.5, 0.7, 0.85, 1];
const HANG_CLEAR = 0.06;
const HANG_GIVE = 0.005;
// (And its hilt kept so far off that side's forearm and hand, metres, the frog shoved out along
// the belt by so much at most if that's what it takes: armPush)
const HANG_ARM_CLEAR = 0.045;
const HANG_ARM_SHOVE = [0, 0.02, 0.04, 0.06];
// (And, no swing keeping it so far off and the arm in it, taken as far out of the arm as it'll
// go if that's so much further)
const HANG_ARM_GAIN = 0.005;
const HANG_PUSH = 0.015;
const HANG_LIFT = { from: (25 * Math.PI) / 180, to: (60 * Math.PI) / 180, off: 0.08 };
// How far in from the end of a hilt (metres) the middle of a hand resting on it grips it
const POMMEL_GRIP = 0.025;
const HANG_THICK = [
    [0, 0.3],
    [0.6, 0.9],
];
const HANG_FALL = 1;
const _legJoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _across = new THREE.Vector3();
const _hangFrom = new THREE.Vector3();
const _hangAt = new THREE.Vector3();
const _hangDown = new THREE.Vector3();
const _hangAlong = new THREE.Vector3();
const _hangPoint = new THREE.Vector3();
const _hangTurn = new THREE.Quaternion();
const _hangBack = new THREE.Quaternion();
const _hangForward = new THREE.Vector3();
const _hangLift = new THREE.Vector3();
const _hangAxis = new THREE.Vector3();
const _hangEdge = new THREE.Vector3();
const _hangSide = new THREE.Vector3();
const _armJoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _armOut = new THREE.Vector3();
const _armStart = new THREE.Vector3();
const _armAway = new THREE.Vector3();
// (The swings armPush has found so far: [back, out, how far it's moved, the shove, how clear])
const _armBest = [0, 0, 0, 0, 0];
const _armFreed = [0, 0, 0, 0, 0];
const _armMost = [0, 0, 0, 0, 0];
// (How a blade hung at the hip is posed, as hangNearest takes it)
const _hangPosed = { pivot: null, down: null, edge: null, leg: null, across: null, forward: null };
// (The joints of the leg a blade hangs by, and of the arm its hilt's kept off, by side)
const HANG_LEG = { Left: ["LeftUpLeg", "LeftLeg", "LeftFoot"], Right: ["RightUpLeg", "RightLeg", "RightFoot"] };
const HANG_ARM = { Left: ["LeftForeArm", "LeftHand", "LeftHandMiddle1"], Right: ["RightForeArm", "RightHand", "RightHandMiddle1"] };
const _up = new THREE.Vector3(0, 1, 0);
const _hangInverse = new THREE.Matrix4();

// How far out (degrees) an arm swinging free is held to clear what hangs at its hip (and further
// past a blade's hilt, hung from the belt, forward of the hip: a sword's, a cleaver's)
const HIP_CLEARING = 10;
const HILT_CLEARING = 10;
// (and further with spiked knuckles worn on the hand, swung past a full thigh running)
const KNUCKLE_CLEARING = 16;

