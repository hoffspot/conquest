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
import { buildGarment, GARMENTS, measureBody, paintGarment, texelMap } from "./garments.js";
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

export class Character {
    /**
     * @param {object} kit - What characters are made from (loadCharacterKit): { human, atlas }.
     * @param {object} [options]
     * @param {object} [options.shape] - Slider settings: { macro: {...}, details: {...} }.
     * @param {object} [options.look] - Skin, eyes and hair: { skin: {...}, eyes: {...}, hair: {...} }
     *   (see LOOK_DEFAULTS, skin.js and hair.js).
     * @param {string[]} [options.equipment] - What it wears and carries (EQUIPMENT ids).
     */
    constructor(kit, { shape = {}, look = {}, equipment = [], materials = {} } = {}) {
        const human = kit.human;

        this.kit = kit;
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
        };

        /** The hair and beard (null when bald and clean-shaven). */
        this.hairMesh = null;

        /** What it wears and carries: slot -> EQUIPMENT id. */
        this.equipment = new Map();
        this.garments = [];
        this.items = [];

        /** Per side ("Left", "Right"): the arm pose for what that hand carries, if anything. */
        this.holds = {};
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

    /** Put on or pick up a piece of equipment (an EQUIPMENT id), replacing what's in its slot. */
    equip(id) {
        this.equipment.set(EQUIPMENT[id].slot, id);
        this.#dress();
    }

    /** Take off or put down what's in a slot. */
    unequip(slot) {
        this.equipment.delete(slot);
        this.#dress();
    }

    /** Wear and carry exactly these (EQUIPMENT ids). */
    setEquipment(ids) {
        this.equipment.clear();

        for (const id of ids) {
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

        const garmentIds = [];
        const itemIds = [];

        for (const id of this.equipment.values()) {
            const entry = EQUIPMENT[id];

            if (entry.kind === "garment") {
                garmentIds.push(id);
            } else {
                itemIds.push(id);

                if (entry.garment) {
                    garmentIds.push(entry.garment);
                }
            }
        }

        // Garments, under ones first; each hides the skin (and garments) under it
        const measures = measureBody(this);
        const built = garmentIds.map((id) => buildGarment(this, id, measures)).filter(Boolean).sort((a, b) => a.garment.layer - b.garment.layer);
        const hidden = new Set();

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

            const id = Object.keys(GARMENTS).find((key) => GARMENTS[key] === garment);
            const mesh = new THREE.SkinnedMesh(geometry, this.#garmentMaterial(id));

            mesh.name = id;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.bind(this.rig.skeleton, new THREE.Matrix4());
            mesh.boundingSphere = this.mesh.boundingSphere;
            this.object.add(mesh);
            this.garments.push(mesh);
        });

        this.setHidden(hidden);

        // Items on their sockets
        let hairHidden = false;

        for (const id of itemIds) {
            const item = EQUIPMENT[id];
            const socket = socketOn(this, item.socket);
            const model = buildItem(item.model, socket.fit);

            model.name = id;
            model.position.copy(socket.position);
            model.quaternion.copy(socket.quaternion);

            if (item.turn) {
                model.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.turn)));
            }

            if (item.offset) {
                model.position.add(new THREE.Vector3(...item.offset));
            }

            this.rig.bone(socket.bone).add(model);
            this.items.push(model);
            hairHidden ||= item.hides?.includes("hair");

            if (item.hold) {
                this.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { ...item.hold, grips: item.grips };
            } else if (item.grips) {
                this.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { grips: true };
            }
        }

        // Under a hat or helmet, only the hair below its rim shows
        if (this.hairHidden !== hairHidden) {
            this.hairHidden = hairHidden;
            this.#buildHair();
        }
    }

    /** A garment's material, its texture painted once per kit. */
    #garmentMaterial(id) {
        const kit = this.kit;
        const garment = GARMENTS[id];

        kit.garmentMaterials ??= new Map();

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
            scalp: Math.max(skin.scalp, style.scalp ?? 1),
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

        const eye = paintEye(eyes);

        this.#setTexture(this.materials.eyes, "map", eye.data, eye.width, true);
        this.materials.lashes.color.set(skin.browColour ?? hair.colour).multiplyScalar(0.6);
        this.materials.hair.color.set(hair.colour);
        this.#buildHair();
    }

    #buildHair() {
        const { style, beard } = this.look.hair;
        const geometry = buildHair(this, style, beard, { below: this.hairHidden ? 0.0 : Infinity });

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

        texture.image.getContext("2d").putImageData(new ImageData(data, size, size), 0, 0);
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

        this.hairMesh?.geometry.dispose();

        for (const [name, material] of Object.entries(this.materials)) {
            if (name !== "hair") {
                material.map?.dispose();
            }

            material.bumpMap?.dispose();
            material.dispose();
        }
    }
}

/** One byte a pixel to RGBA grey. */
function greyscale(values) {
    const data = new Uint8ClampedArray(values.length * 4);

    for (let i = 0; i < values.length; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = values[i];
        data[i * 4 + 3] = 255;
    }

    return data;
}
