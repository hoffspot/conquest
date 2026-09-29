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
import { EQUIPMENT, socketOn } from "./equipment.js";
import { buildDrape, drapeMaterial, DRAPES } from "./drapes.js";
import { buildGarment, COMPOSITE_BUMP, compositeGarments, GARMENTS, insideOf, measureBody, paintGarment, texelMap } from "./garments.js";
import { BEARDS, buildHair, hairTexture, HAIRSTYLES } from "./hair.js";
import { buildItem } from "./items.js";
import { EYE_DEFAULTS, HAIR_COLOURS, paintEye, paintSkin, SKIN_DEFAULTS } from "./skin.js";

/** How a character looks unless told otherwise. */
export const LOOK_DEFAULTS = Object.freeze({
    skin: SKIN_DEFAULTS,
    eyes: EYE_DEFAULTS,
    hair: Object.freeze({ style: "short", beard: "none", colour: HAIR_COLOURS.brown }),
});

// The parts of the base mesh, in the order they're drawn (with a material each)
const DRAWN = ["body", "eyes", "lashes"];

// How many pictures of outfits no one is wearing just now are kept, for the next to wear one
const IDLE_COMPOSITES = 8;

/**
 * A body of the usual shape's measurements (garments.js measureBody), made once per kit: what
 * garments drawn all at once are fitted to (Character `merge`), so each fits the same picture.
 */
function referenceMeasures(kit) {
    if (!kit.referenceMeasures) {
        const human = kit.human;
        const { positions, joints } = human.shape({});
        const rig = new Rig(human.bones);
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

/** Several skinned geometries as one (their vertices one after another). */
function mergeGeometries(geometries) {
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

    for (const geometry of geometries) {
        for (const index of geometry.index.array) {
            indices.push(index + offset);
        }

        offset += geometry.attributes.position.count;
    }

    merged.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));

    return merged;
}

/** A texture's picture (RGBA), from the canvas it was painted on. */
function pixelsOf(texture) {
    const { width, height } = texture.image;

    return texture.image.getContext("2d").getImageData(0, 0, width, height).data;
}

/** A picture's red, a byte a texel. */
function redOf(data) {
    const red = new Uint8ClampedArray(data.length / 4);

    for (let i = 0; i < red.length; i++) {
        red[i] = data[i * 4];
    }

    return red;
}

/** A texture from a painted picture (RGBA, rows from the top), mipmapped. */
function dataTexture(data, size, colour) {
    const texture = new THREE.DataTexture(new Uint8Array(data.buffer), size, size);

    texture.flipY = true;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return texture;
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
    };
}

export class Character {
    /**
     * @param {object} kit - What characters are made from (loadCharacterKit): { human, atlas }.
     * @param {object} [options]
     * @param {object} [options.shape] - Slider settings: { macro: {...}, details: {...} }.
     * @param {object} [options.look] - Skin, eyes and hair: { skin: {...}, eyes: {...}, hair: {...} }
     *   (see LOOK_DEFAULTS, skin.js and hair.js).
     * @param {string[]} [options.equipment] - What it wears and carries (EQUIPMENT ids).
     * @param {number} [options.hairDetail] - How much of its hair to grow, 0 to 1 (less for
     *   characters seen from afar: hair.js).
     * @param {boolean} [options.merge] - Draw its garments all at once (one mesh, one picture of
     *   them all: for the many folk and soldiers about, not a player, who changes what they wear).
     */
    constructor(kit, { shape = {}, look = {}, equipment = [], materials = {}, hairDetail = 1, merge = false } = {}) {
        const human = kit.human;

        this.kit = kit;
        this.hairDetail = hairDetail;
        this.merge = merge;

        /** The outfit whose picture its garments are drawn with, when they're drawn at once. */
        this.composite = null;
        this.human = human;
        this.object = new THREE.Group();
        this.object.name = "character";
        this.rig = new Rig(human.bones);
        this.object.add(this.rig.root);

        this.materials = {
            body: materials.body ?? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }),
            eyes: materials.eyes ?? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
            lashes: materials.lashes ?? new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
            hair: materials.hair ?? new THREE.MeshStandardMaterial({ map: hairTexture(), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.65, envMapIntensity: 0.5, vertexColors: true }),
            // (Parts of their own in their skin's or fur's colour: a cat's ears and tail)
            tint: materials.tint ?? new THREE.MeshStandardMaterial({ color: 0xc8a080, roughness: 0.8 }),
        };

        /** The hair and beard (null when bald and clean-shaven). */
        this.hairMesh = null;

        /** What it wears and carries: slot -> EQUIPMENT id. */
        this.equipment = new Map();
        this.garments = [];
        this.items = [];

        /** Per side ("Left", "Right"): the arm pose for what that hand carries, if anything. */
        this.holds = {};

        /** Whether its weapons are put away (sheathe). */
        this.sheathed = false;
        this.hairHidden = false;

        this.geometry = this.#createGeometry();
        this.mesh = new THREE.SkinnedMesh(this.geometry, DRAWN.map((part) => this.materials[part]));
        this.mesh.name = "body";
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.bind(this.rig.skeleton, new THREE.Matrix4());
        this.object.add(this.mesh);

        /** Body triangles hidden under clothing (indices of the body part's triangles). */
        this.hidden = new Set();

        this.setShape(shape);
        this.setLook(look);
        this.setEquipment(equipment);
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

    /** Take off or put down what's in a slot. */
    unequip(slot) {
        this.equipment.delete(slot);
        this.#dress();
    }

    /** Wear and carry exactly these (EQUIPMENT ids: any it doesn't know left out). */
    setEquipment(ids) {
        this.equipment.clear();

        for (const id of ids.filter(known)) {
            this.equipment.set(EQUIPMENT[id].slot, id);
        }

        this.#dress();
    }

    /** Build everything worn and carried (after equipping, or when the body changes). */
    #dress() {
        for (const mesh of this.garments) {
            mesh.geometry.dispose();
            mesh.removeFromParent();
        }

        for (const item of this.items) {
            item.removeFromParent();
            item.traverse((part) => part.geometry?.dispose());
        }

        this.garments = [];
        this.items = [];
        this.holds = {};
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
                for (const garment of [entry.garment, entry.sheath?.garment]) {
                    if (garment && !garmentIds.includes(garment)) {
                        garmentIds.push(garment);
                    }
                }
            }
        }

        // Garments, under ones first; each hides the skin (and garments) under it. (Drawn all at
        // once, they're fitted as they'd fit a body of the usual shape: each outfit's picture is
        // then the same for everyone, however they're built)
        const measures = measureBody(this);
        const fitted = this.merge ? referenceMeasures(this.kit) : measures;
        const built = garmentIds.map((id) => buildGarment(this, id, fitted)).filter(Boolean).sort((a, b) => a.garment.layer - b.garment.layer);
        const hidden = new Set();
        const parts = [];

        built.forEach(({ geometry, covers, sources, garment }, i) => {
            const over = new Set();

            for (const outer of built.slice(i + 1)) {
                if (outer.garment.layer > garment.layer) {
                    for (const t of outer.covers) {
                        over.add(t);
                    }
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

            parts.push({ id: Object.keys(GARMENTS).find((key) => GARMENTS[key] === garment), geometry, garment });
        });

        // All at once (but lace, see-through), outermost last: by layer, then how far out
        const merged = this.merge ? parts.filter(({ garment }) => !garment.design) : [];
        const reach = ({ garment }) => garment.thickness + (garment.loose ?? 0);

        if (merged.length > 1) {
            merged.sort((a, b) => a.garment.layer - b.garment.layer || reach(a) - reach(b) || (a.id < b.id ? -1 : 1));

            const mesh = new THREE.SkinnedMesh(mergeGeometries(merged.map(({ geometry }) => geometry)), this.#composite(merged.map(({ id }) => id)));

            for (const { geometry } of merged) {
                geometry.dispose();
            }

            mesh.name = "garments";
            mesh.userData.merged = merged.map(({ id }) => id);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.bind(this.rig.skeleton, new THREE.Matrix4());
            mesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(mesh);
            this.garments.push(mesh);
        }

        for (const { id, geometry, garment } of merged.length > 1 ? parts.filter((part) => !merged.includes(part)) : parts) {
            const mesh = new THREE.SkinnedMesh(geometry, this.#garmentMaterial(id));

            mesh.name = id;
            // (lace would cast a shadow as if it were solid)
            mesh.castShadow = !garment.design;
            mesh.receiveShadow = true;
            mesh.bind(this.rig.skeleton, new THREE.Matrix4());
            mesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(mesh);
            this.garments.push(mesh);
        }

        this.setHidden(hidden);

        // Skirts, gowns and aprons, hanging over what's under them
        for (const id of drapeIds) {
            const { geometry } = buildDrape(this, id, measures);
            const mesh = new THREE.SkinnedMesh(geometry, this.#drapeMaterial(id));

            mesh.name = id;
            mesh.userData.drape = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.bind(this.rig.skeleton, new THREE.Matrix4());
            mesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(mesh);
            this.garments.push(mesh);
        }

        // Items on their sockets (where they're held or worn: `home`), and weapons' places put
        // away (`sheath`) with what they hang in there
        let hairHidden = false;

        for (const id of itemIds) {
            const item = EQUIPMENT[id];

            // (Some are in several parts, each on its own socket: spiked boots' iron)
            for (const part of item.parts ?? [item]) {
                const socket = socketOn(this, part.socket);
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
                model.userData.home = home;
                model.userData.sway = item.sway ?? 0;
                model.userData.hand = /^(left|right)Hand$/.test(part.socket) ? (part.socket.startsWith("left") ? "Left" : "Right") : null;

                const sheath = part === item && item.sheath && !item.sheath.worn ? item.sheath : null;

                if (sheath) {
                    const at = socketOn(this, sheath.socket);
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
                        this.items.push(holder);
                    }
                }

                this.items.push(model);
            }

            hairHidden ||= item.hides?.includes("hair");
        }

        // Each weapon in hand or put away, as it was
        this.sheathe(this.sheathed);

        // Under a hat or helmet, only the hair below its rim shows
        if (this.hairHidden !== hairHidden) {
            this.hairHidden = hairHidden;
            this.#buildHair();
        }
    }

    /**
     * Put its weapons away (`on`: each in its sheath, equipment.js SHEATHS: a sword in its
     * scabbard, a staff on the back; worn gauntlets stay on, the hands opening) or in hand. The
     * hands' holds follow.
     */
    sheathe(on = true, { settle = 0 } = {}) {
        this.sheathed = on;
        this.holds = {};

        for (const model of this.items) {
            const { home, sheath, looks } = model.userData;

            if (home && !model.userData.holder) {
                const place = on && sheath ? sheath : home;
                const bone = this.rig.bone(place.bone);

                // (Taken by the hand or let go of into its sheath, it settles there from where it
                // was, over `settle` seconds, as fingers close round it)
                if (settle > 0 && sheath && model.parent && model.parent !== bone) {
                    bone.attach(model);
                    model.userData.settling = { from: model.position.clone(), turn: model.quaternion.clone(), place, left: settle, length: settle };
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

            if (item.kind !== "item" || (on && item.sheath)) {
                continue;
            }

            if (item.hold) {
                this.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { ...item.hold, grips: item.grips };
            } else if (item.grips) {
                this.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { grips: true };
            }
        }
    }

    /** Move weapons settling into a hand or sheath on by `dt` seconds (Character.sheathe). */
    settle(dt) {
        this.swayed = (this.swayed ?? 0) + dt;

        for (const model of this.items) {
            const settling = model.userData.settling;

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
                model.quaternion.slerpQuaternions(settling.turn, settling.place.quaternion, eased);

                if (settling.left === 0) {
                    model.userData.settling = null;
                }
            }
        }
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
     * differs in colour (`base`: liveries.js), its picture tinted to its colour.
     */
    #garmentMaterial(id) {
        const kit = this.kit;
        const garment = GARMENTS[id];

        kit.garmentMaterials ??= new Map();

        if (garment.base && !kit.garmentMaterials.has(id)) {
            const material = this.#garmentMaterial(garment.base).clone();
            const [from, to] = [new THREE.Color(GARMENTS[garment.base].colour), new THREE.Color(garment.colour)];

            material.color.setRGB(to.r / Math.max(0.03, from.r), to.g / Math.max(0.03, from.g), to.b / Math.max(0.03, from.b));
            kit.garmentMaterials.set(id, material);
        }

        if (garment.design && !kit.garmentMaterials.has(id)) {
            kit.garmentMaterials.set(id, this.#designMaterial(garment));
        }

        if (!kit.garmentMaterials.has(id)) {
            kit.texelMap ??= texelMap(this.human, 512);

            const painted = paintGarment(kit.texelMap, garment);
            const material = new THREE.MeshStandardMaterial({
                roughness: garment.roughness ?? 0.8,
                metalness: garment.metalness ?? 0,
                side: THREE.DoubleSide,
            });

            this.#setTexture(material, "map", painted.data, painted.size, true);
            this.#setTexture(material, "bumpMap", greyscale(painted.bump), painted.size, false);
            material.bumpScale = garment.metalness ? 0.6 : 1.5;
            kit.garmentMaterials.set(id, material);
        }

        return kit.garmentMaterials.get(id);
    }

    /**
     * The material of an outfit's garments drawn all at once (ids, outermost last): one picture of
     * them all (garments.js compositeGarments), its heights, roughness and metalness in another.
     * Made once per kit for each outfit, and let go when no one's worn it for a while.
     */
    #composite(ids) {
        const kit = this.kit;
        const key = ids.join(" ");

        kit.composites ??= new Map();

        if (!kit.composites.has(key)) {
            kit.texelMap ??= texelMap(this.human, 512);
            kit.garmentInsides ??= new Map();

            const layers = ids.map((id) => {
                const garment = GARMENTS[id];
                const material = this.#garmentMaterial(id);

                if (!kit.garmentInsides.has(id)) {
                    // (A boot's toes are the toe box's, drawn with the boot's picture)
                    kit.garmentInsides.set(id, insideOf(this.human, garment, referenceMeasures(kit), { toes: true }));
                }

                return {
                    data: pixelsOf(material.map),
                    bump: redOf(pixelsOf(material.bumpMap)),
                    tint: garment.base ? material.color.toArray() : null,
                    bumpScale: material.bumpScale,
                    roughness: material.roughness,
                    metalness: material.metalness,
                    inside: kit.garmentInsides.get(id),
                };
            });
            const { size, data, surface } = compositeGarments(kit.texelMap, layers);
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
            kit.composites.set(key, { material, users: 0 });
        }

        const entry = kit.composites.get(key);

        entry.users++;
        this.composite = key;

        return entry.material;
    }

    // No longer wearing the outfit whose picture it was drawn with: once no one is, it's kept
    // for a while, then let go (the longest unworn first)
    #release() {
        const composites = this.kit.composites;
        const key = this.composite;
        const entry = key && composites?.get(key);

        this.composite = null;

        if (!entry || --entry.users > 0) {
            return;
        }

        composites.delete(key);
        composites.set(key, entry);

        const idle = [...composites].filter(([, other]) => other.users === 0);

        for (const [unworn, { material }] of idle.slice(0, Math.max(0, idle.length - IDLE_COMPOSITES))) {
            material.map.dispose();
            material.bumpMap.dispose();
            material.dispose();
            composites.delete(unworn);
        }
    }

    /**
     * Lingerie's material: its design's texture (painted once per kit, white, shared by every
     * colour) tinted, and see-through where the texture is. The texture keeps its colour where
     * it's clear, so the edges of what's there don't darken as it's minified.
     */
    #designMaterial(garment) {
        const kit = this.kit;

        kit.designTextures ??= new Map();

        if (!kit.designTextures.has(garment.design)) {
            kit.texelMap ??= texelMap(this.human, 512);

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

    /** Change how the character looks: { skin, eyes, hair } (see LOOK_DEFAULTS). */
    setLook(look = {}) {
        const hair = { ...LOOK_DEFAULTS.hair, ...look.hair };
        const style = HAIRSTYLES[hair.style] ?? HAIRSTYLES.short;
        const beard = BEARDS[hair.beard] ?? BEARDS.none;
        const skin = { ...SKIN_DEFAULTS, ...look.skin, hairColour: hair.colour };
        const eyes = { ...EYE_DEFAULTS, ...look.eyes };

        this.look = { skin, eyes, hair };

        // Paint hair on the scalp and jaw under the strands (or as a buzz cut or stubble)
        const painted = {
            ...skin,
            // (under hair strands, solid: none of the skin shows between them)
            scalp: Math.max(skin.scalp, style.scalp ?? (style.strands ? 1.4 : 1)),
            stubble: Math.max(skin.stubble, beard.stubble),
        };

        if (this.kit.atlas) {
            const texture = paintSkin(this.kit.atlas, painted);

            this.#setTexture(this.materials.body, "map", texture.data, texture.width, true);
            this.#setTexture(this.materials.body, "bumpMap", greyscale(texture.bump), texture.width, false);
            this.materials.body.bumpScale = 1.2;
        } else {
            this.materials.body.color.set(skin.tone);
        }

        this.materials.tint.color.set(skin.tone);

        const eye = paintEye(eyes);

        this.#setTexture(this.materials.eyes, "map", eye.data, eye.width, true);
        this.materials.lashes.color.set(skin.browColour ?? hair.colour).multiplyScalar(0.6);
        this.materials.hair.color.set(hair.colour);
        this.#buildHair();
    }

    #buildHair() {
        const { style, beard } = this.look.hair;
        const geometry = buildHair(this, style, beard, { below: this.hairHidden ? 0.0 : Infinity, detail: this.hairDetail });

        if (this.hairMesh) {
            this.hairMesh.geometry.dispose();
            this.object.remove(this.hairMesh);
            this.hairMesh = null;
        }

        if (geometry) {
            this.hairMesh = new THREE.SkinnedMesh(geometry, this.materials.hair);
            this.hairMesh.name = "hair";
            this.hairMesh.castShadow = true;
            this.hairMesh.bind(this.rig.skeleton, new THREE.Matrix4());
            this.hairMesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(this.hairMesh);
        }
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

    /** Put RGBA pixels (rows from the top) into a material's texture, reusing its canvas. */
    #setTexture(material, slot, data, size, colour) {
        let texture = material[slot];

        if (!texture || texture.image.width !== size) {
            texture?.dispose();

            const canvas = document.createElement("canvas");

            canvas.width = canvas.height = size;
            texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            texture.anisotropy = 4;
            material[slot] = texture;
            material.needsUpdate = true;
        }

        // (Read back to draw garments all at once: #composite)
        texture.image.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(data, size, size), 0, 0);
        texture.needsUpdate = true;
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

        if (this.equipment) {
            this.#dress();
        }
    }

    /** Hide body triangles (under clothing), replacing those hidden before. */
    setHidden(triangles) {
        this.hidden = new Set(triangles);
        this.#updateIndex();
    }

    #createGeometry() {
        const human = this.human;
        const count = human.renderSource.length;
        const geometry = new THREE.BufferGeometry();
        const skinIndex = new Uint8Array(count * 4);
        const skinWeight = new Uint8Array(count * 4);

        human.renderSource.forEach((v, r) => {
            skinIndex.set(human.skinIndices.subarray(v * 4, v * 4 + 4), r * 4);
            skinWeight.set(human.skinWeights.subarray(v * 4, v * 4 + 4), r * 4);
        });

        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(human.uvs, 2));
        geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
        geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4, true));
        this.geometry = geometry;
        this.hidden = new Set();
        this.#updateIndex();

        return geometry;
    }

    #updateIndex() {
        const human = this.human;
        const body = human.renderIndices("body");
        const kept = [];

        for (let t = 0; t < body.length / 3; t++) {
            if (!this.hidden.has(t)) {
                kept.push(body[t * 3], body[t * 3 + 1], body[t * 3 + 2]);
            }
        }

        const eyes = human.renderIndices("eyes");
        const lashes = human.renderIndices("lashes");
        const index = new Uint16Array(kept.length + eyes.length + lashes.length);

        index.set(kept, 0);
        index.set(eyes, kept.length);
        index.set(lashes, kept.length + eyes.length);

        this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
        this.geometry.clearGroups();
        this.geometry.addGroup(0, kept.length, 0);
        this.geometry.addGroup(kept.length, eyes.length, 1);
        this.geometry.addGroup(kept.length + eyes.length, lashes.length, 2);
    }

    /** Pose the skeleton from its joint rotations (after changing them). */
    pose() {
        this.rig.apply();
    }

    /** The skin texture as it is now (a canvas), say to save as a template for painting skins. */
    get skinCanvas() {
        return this.materials.body.map?.image ?? null;
    }

    dispose() {
        this.geometry.dispose();

        // (The skeleton's bone texture, made when it was first drawn)
        this.rig.skeleton.dispose();
        this.hairMesh?.geometry.dispose();

        for (const mesh of this.garments) {
            mesh.geometry.dispose();
        }

        for (const item of this.items) {
            item.traverse((part) => part.geometry?.dispose());
        }

        this.#release();

        for (const [name, material] of Object.entries(this.materials)) {
            if (name !== "hair") {
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

/** One byte a pixel to RGBA grey. */
function greyscale(values) {
    const data = new Uint8ClampedArray(values.length * 4);

    for (let i = 0; i < values.length; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = values[i];
        data[i * 4 + 3] = 255;
    }

    return data;
}
