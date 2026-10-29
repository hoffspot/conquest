// Things dropped on the ground (core/host.js: a player's "drop"; a creature's spoils, a bundle for
// one player, and only that player sees theirs): each thing there (and its gold) its icon, turned
// to the camera, floating just off the ground and bobbing a few centimetres up and down over a
// ring glowing the colour of how rare it is (the pack's colours: styles.css .rarity-*), until it's
// picked up or it's lain there too long. Anyone near can tap one to pick up the lot (app/game.js).
// A place's chest (host.js #places: held by outlaws or the dead, by their leader) is an iron-bound
// wooden chest (the JMI 3D Toolkit's, client/models/jmi, read from the catalog once the game's
// started; drawn here till it's read, or if it can't be), shut while its guardians hold the place;
// once it's cleared, each player near has their share in it, its lid thrown open (the model's own
// "Open") on a heap of gold coins (gold3d.js).
//
// The icons are painted by whoever makes this (`picture`: an item id to a texture), so the world
// needn't know how they're drawn.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { loadGltf } from "./art/engine/models.js";
import { gradeOf } from "../core/progress.js";
import { drawGold, GOLD, goldParts } from "./gold3d.js";

// An icon over a chest: its size (metres), how far over the chest, how far it bobs
const ICON = Object.freeze({ size: 0.46, above: 0.62, bob: 0.06 });

/**
 * A thing lying on the ground: its icon's size (metres), how far its foot floats off the ground at
 * the middle of its bob, how far it bobs either way of that (a few centimetres, its foot never
 * touching the ground) and how fast (radians a second); how far apart the things in a bundle lie;
 * and the ring glowing under each (its radius, how far off the ground, how its glow breathes).
 */
export const FLOAT = Object.freeze({ size: 0.42, lift: 0.055, bob: 0.03, pace: 2.4, apart: 0.34 });
export const RING = Object.freeze({ radius: 0.27, above: 0.012, glow: [0.6, 0.95] });

/** The colour each rarity glows (progress.js QUALITIES, and a unique: the pack's own, styles.css .rarity-*). */
export const RARITY_GLOW = Object.freeze({ common: 0xe9e1d0, fine: 0x6aa6ff, masterwork: 0xe8c35a, rare: 0xb07cff, veryRare: 0xff6aa8, legendary: 0xf08a3a, unique: 0x3fe0c0 });

/**
 * What's shown of something dropped (not a chest): its gold, if any, and each thing in it, as { id
 * (its icon), grade }; one of the fallen not yet searched (a dungeon's: host.js `remains`), a coin
 * over the remains, as gold left there is.
 */
export function shownOf(dropped) {
    if (dropped.remains) {
        return [{ id: "gold", grade: "common" }];
    }

    // (A unique, given for a rare encounter, glows its own colour: core/rare.js UNIQUES)
    const grade = (item) => (item.unique ? "unique" : gradeOf(item));

    if (dropped.item) {
        return [{ id: dropped.item.id, grade: grade(dropped.item) }];
    }

    return [...(dropped.bundle.gold > 0 ? [{ id: "gold", grade: "common" }] : []), ...dropped.bundle.items.map((item) => ({ id: item.id, grade: grade(item) }))];
}

// (What's in it, in short: drawn again when it changes, part of it taken)
const contentsOf = (dropped) => JSON.stringify(dropped.bundle ?? dropped.item ?? null);

// A chest's size (metres: its body; its lid's rise over it, a half-round flattened), its iron
// bands' width, and how far back its lid's thrown once it's open (radians)
const CHEST = Object.freeze({ width: 0.8, depth: 0.46, height: 0.4, rise: 0.6, band: 0.05, open: 1.95 });

// The chest's model: its name in the catalog (client/models/assets.json), how big it's drawn (its
// units to metres: 0.85 m across), and the clip that opens it (the gold heaped in it in its units:
// gold3d.js GOLD)
const CHEST_MODEL = Object.freeze({ asset: "chest", scale: 1.3, clip: "Open", lid: "Chest_Lid" });

const _box = new THREE.Box3();
const _middle = new THREE.Vector3();
const _point = new THREE.Vector3();

// How far a point on the screen (x, y) is from a line on it, from `a` to `b` ({ x, y } each)
function fromLine(x, y, a, b) {
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const along = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));

    return Math.hypot(x - a.x - dx * along, y - a.y - dy * along);
}

// Two things dropped on one square sit a little apart, round its middle
const SPREAD = 0.28;

export class Drops {
    /**
     * @param {THREE.Scene} scene
     * @param {object} options
     * @param {(id: string) => THREE.Texture} options.picture - A thing's icon (by its item id).
     */
    constructor(scene, { picture }) {
        this.scene = scene;
        this.picture = picture;
        this.group = new THREE.Group();
        this.group.name = "drops";
        scene.add(this.group);

        /** The ground's height at a point ((x, z) => metres: set with setGround). */
        this.groundAt = () => 0;

        /**
         * What's drawn, by the id of the thing dropped: { object, icon (over a chest), things
         * (floating: [{ icon, ring, seed }]), x, z, seed, contents }.
         */
        this.drawn = new Map();

        // The glowing ring under a thing (lying flat), and its glow in each rarity's colour
        this.ring = new THREE.PlaneGeometry(RING.radius * 2, RING.radius * 2).rotateX(-Math.PI / 2);
        this.ringPicture = ringPicture();
        this.glows = Object.fromEntries(Object.entries(RARITY_GLOW).map(([grade, color]) => [grade, new THREE.MeshBasicMaterial({ color, map: this.ringPicture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: RING.glow[1] })]));
        this.chest = chestParts();
        this.wood = new THREE.MeshStandardMaterial({ color: 0x6a4527, roughness: 0.85 });
        this.iron = new THREE.MeshStandardMaterial({ color: 0x3b3936, roughness: 0.45, metalness: 0.7 });
        // (Its inside dark, seen once its lid's thrown back; and the gold in it, made now, not as
        // the first chest's opened)
        this.inside = new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 1 });
        this.gold = goldParts();

        /** The chest's model once it's read ({ scene, clip }), or null (drawn as made here). */
        this.model = null;
        this.time = null;

        // (Not in the catalog, or no page to read it from, or not to be had: the chest as made here)
        const file = ASSETS.models[CHEST_MODEL.asset]?.files[0];
        const page = globalThis.document?.baseURI ?? globalThis.location?.href;

        if (file && page) {
            loadGltf(new URL(hashed(file.path, file.hash), page).href).then(
                (gltf) => this.#modelRead(gltf),
                () => {},
            );
        }
    }

    /** Lay what's dropped on this ground (its height at a point, (x, z) => metres; null: flat at 0). */
    setGround(at) {
        this.groundAt = at ?? (() => 0);
    }

    /**
     * Draw what's on the ground now (host.js ground: { id, item or bundle, for, map, square }),
     * those on `map` and within `reach` metres of `near` ({ x, z }), where `originOf(map)` puts
     * the map ([x, z]); of the spoils, only those for `mine` (a player's id).
     */
    sync(ground, { map, near, reach, originOf, mine = null }) {
        const seen = new Set();
        const [ox, oz] = originOf(map);
        const onSquare = new Map();

        for (const dropped of ground.values()) {
            if (dropped.map !== map || (dropped.for && dropped.for !== mine)) {
                continue;
            }

            // (Spread round the square's middle, those dropped on it)
            const key = `${dropped.square[0]},${dropped.square[1]}`;
            const k = onSquare.get(key) ?? 0;
            const angle = k * 2.4;
            const [x, z] = [ox + dropped.square[0] + 0.5 + (k ? Math.cos(angle) * SPREAD : 0), oz + dropped.square[1] + 0.5 + (k ? Math.sin(angle) * SPREAD : 0)];

            onSquare.set(key, k + 1);

            if (Math.hypot(x - near.x, z - near.z) > reach) {
                continue;
            }

            seen.add(dropped.id);

            // (Drawn again when what's in it changes: some of it taken)
            const drawn = this.drawn.get(dropped.id);

            if (drawn && !drawn.chest && drawn.contents !== contentsOf(dropped)) {
                this.#undraw(dropped.id);
            }

            if (!this.drawn.has(dropped.id)) {
                this.#draw(dropped, x, z);
            }
        }

        for (const id of [...this.drawn.keys()]) {
            if (!seen.has(id)) {
                this.#undraw(id);
            }
        }
    }

    /** Bob the icons, the rings' glow breathing, and open the chests opening (time: seconds). */
    update(time) {
        const step = this.time === null ? 0 : Math.max(0, time - this.time);

        this.time = time;

        for (const { icon, things, seed, above, mixer } of this.drawn.values()) {
            if (icon) {
                icon.position.y = above + Math.sin(time * 2.2 + seed) * ICON.bob;
            }

            for (const thing of things) {
                thing.icon.position.y = thing.icon.userData.ground + FLOAT.size / 2 + FLOAT.lift + Math.sin(time * FLOAT.pace + thing.seed) * FLOAT.bob;
            }

            mixer?.update(step);
        }

        const breath = (Math.sin(time * FLOAT.pace * 0.5) + 1) / 2;

        for (const glow of Object.values(this.glows)) {
            glow.opacity = RING.glow[0] + (RING.glow[1] - RING.glow[0]) * breath;
        }
    }

    /**
     * The thing dropped nearest a point on the screen (client pixels), within `radius` pixels of
     * it, from where it lies up to its top, its icon over it (a chest stands up off the ground,
     * and seen close, as indoors, its lid is well over where it lies): its id, or null.
     * (`toScreen`: a point in the world to the screen.)
     */
    at(clientX, clientY, toScreen, radius = 40) {
        let best = null;
        let bestDistance = radius;

        for (const [id, { object, things = [] }] of this.drawn) {
            for (const [foot, top] of spansOf(object, things, toScreen)) {
                const distance = foot && top ? fromLine(clientX, clientY, foot, top) : Infinity;

                if (distance < bestDistance) {
                    best = id;
                    bestDistance = distance;
                }
            }
        }

        return best;
    }

    dispose() {
        this.scene.remove(this.group);
        this.ring.dispose();
        this.ringPicture.dispose();
        Object.values(this.glows).forEach((glow) => glow.dispose());
        Object.values(this.chest).forEach((geometry) => geometry.dispose());
        this.model?.scene.traverse((node) => {
            if (node.isMesh) {
                node.geometry.dispose();
                [node.material].flat().forEach((material) => material.dispose());
            }
        });
        this.wood.dispose();
        this.iron.dispose();
        this.inside.dispose();

        for (const part of [this.gold.heap, this.gold.coin, this.gold.fewer, this.gold.gem, this.gold.cup, this.gold.glint, this.gold.gold, this.gold.bed, this.gold.jewel, this.gold.glints, ...this.gold.textures]) {
            part.dispose();
        }

        for (const id of [...this.drawn.keys()]) {
            this.#undraw(id);
        }
    }

    #draw(dropped, x, z) {
        const object = new THREE.Group();
        // (One of the fallen to search is no chest: its remains are drawn where they lie)
        const chest = (dropped.chest && !dropped.remains) || dropped.from === "chest";
        const seed = [...dropped.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
        const sprite = (id) => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.picture(id), transparent: true, depthWrite: false }));
        const things = [];
        let icon = null;
        let mixer = null;
        let above = 0;

        if (chest) {
            const made = this.#chest(!dropped.chest);

            object.add(made.chest);
            mixer = made.mixer;

            // (A chest's share: its first thing's icon over it)
            if (!dropped.chest) {
                above = CHEST.height + CHEST.depth * 0.5 * CHEST.rise + ICON.above;
                icon = sprite(dropped.bundle.items[0]?.id ?? "gold");
                icon.scale.set(ICON.size, ICON.size, 1);
                icon.position.y = above;
                object.add(icon);
            }
        } else {
            // Each thing floating over its ring, round where it lies (one alone, just there), each
            // on the ground where it is
            const shown = shownOf(dropped);

            shown.forEach(({ id, grade }, k) => {
                const angle = seed + (k * Math.PI * 2) / shown.length;
                const out = shown.length > 1 ? FLOAT.apart * (shown.length > 4 ? 1.4 : 1) : 0;
                const [dx, dz] = [Math.cos(angle) * out, Math.sin(angle) * out];
                const lift = this.groundAt(x + dx, z + dz) - this.groundAt(x, z);
                const thing = { icon: sprite(id), ring: new THREE.Mesh(this.ring, this.glows[grade] ?? this.glows.common), seed: seed + k * 1.7 };

                thing.icon.scale.set(FLOAT.size, FLOAT.size, 1);
                thing.icon.position.set(dx, FLOAT.size / 2 + FLOAT.lift, dz);
                thing.icon.renderOrder = 1;
                thing.ring.position.set(dx, lift + RING.above, dz);
                thing.icon.position.y += lift;
                thing.icon.name = `${id}:${grade}`;
                // (The bob from where it stands, the ground under it)
                thing.icon.userData.ground = lift;
                object.add(thing.ring, thing.icon);
                things.push(thing);
            });
        }

        object.position.set(x, this.groundAt(x, z), z);
        object.name = dropped.id;
        this.group.add(object);
        this.drawn.set(dropped.id, { object, icon, things, x, z, seed, above, chest, mixer, contents: contentsOf(dropped) });
    }

    // Something no longer drawn: its icons let go (their pictures kept, shared)
    #undraw(id) {
        const drawn = this.drawn.get(id);

        this.group.remove(drawn.object);
        drawn.icon?.material.dispose();

        for (const { icon } of drawn.things) {
            icon.material.dispose();
        }

        this.drawn.delete(id);
    }

    // The chest's model read: its meshes casting shadows, and the chests drawn till now drawn again
    // with it
    #modelRead({ scene, animations }) {
        scene.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        this.model = { scene, clip: THREE.AnimationClip.findByName(animations, CHEST_MODEL.clip) };

        for (const [id, drawn] of [...this.drawn]) {
            if (drawn.chest) {
                this.#undraw(id);
            }
        }
    }

    // A chest (its lid thrown back if it's `open`, opening as it's first drawn): { chest, mixer
    // (what opens it, or null) }
    #chest(open) {
        if (this.model) {
            return this.#modelChest(open);
        }

        return { chest: this.#madeChest(open), mixer: null };
    }

    // The chest's model: a copy of it, and opening, its gold in it
    #modelChest(open) {
        const chest = new THREE.Group();
        const object = this.model.scene.clone(true);
        let mixer = null;

        object.scale.setScalar(CHEST_MODEL.scale);
        chest.add(object);
        chest.name = open ? "chest-open" : "chest";

        if (open) {
            object.add(drawGold(this.gold));

            if (this.model.clip) {
                mixer = new THREE.AnimationMixer(object);

                const opening = mixer.clipAction(this.model.clip);

                opening.setLoop(THREE.LoopOnce, 1);
                opening.clampWhenFinished = true;
                opening.play();
            } else {
                object.getObjectByName(CHEST_MODEL.lid)?.rotateX(-1.83);
            }
        }

        return { chest, mixer };
    }

    // A chest made here: its body and its lid (thrown back if it's `open`), iron-bound
    #madeChest(open) {
        const chest = new THREE.Group();
        const lid = new THREE.Group();
        // (Its top, under the lid, its dark inside)
        const body = new THREE.Mesh(this.chest.body, [this.wood, this.wood, this.inside, this.wood, this.wood, this.wood]);
        const top = new THREE.Mesh(this.chest.lid, this.wood);

        body.castShadow = true;
        top.castShadow = true;
        lid.add(top, new THREE.Mesh(this.chest.lidIron, this.iron));
        // (Hinged along the body's back edge)
        lid.position.set(0, CHEST.height, -CHEST.depth / 2);
        lid.rotation.x = open ? -CHEST.open : 0;
        chest.add(body, new THREE.Mesh(this.chest.bodyIron, this.iron), lid);
        chest.name = open ? "chest-open" : "chest";

        if (open) {
            // (The model's heap, as big as it's drawn in the model, its sides at the top's height)
            const gold = drawGold(this.gold);

            gold.scale.setScalar(CHEST_MODEL.scale);
            gold.position.y = CHEST.height - GOLD.wall * CHEST_MODEL.scale;
            chest.add(gold);
        }

        return chest;
    }
}

// Where something lying on the ground is on the screen, to be tapped: each thing floating, from
// the ground under it to its icon's top; else (a chest) the whole of it, from its foot to its top.
// [[foot, top]] (screen points, or null behind the camera)
function spansOf(object, things, toScreen) {
    if (things.length) {
        return things.map(({ icon }) => {
            const at = icon.getWorldPosition(_middle);
            const ground = at.y - icon.position.y + icon.userData.ground;

            return [toScreen(_point.set(at.x, ground, at.z)), toScreen(_point.set(at.x, at.y + FLOAT.size / 2, at.z))];
        });
    }

    const middle = _box.setFromObject(object).getCenter(_middle);

    return [[toScreen(_point.set(middle.x, _box.min.y, middle.z)), toScreen(_point.set(middle.x, _box.max.y, middle.z))]];
}

// The ring's glow (white, coloured by its material): a bright band fading softly either side, and
// a faint pool inside it; made here, no page needed
function ringPicture(size = 64) {
    const data = new Uint8Array(size * size * 4);

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const r = Math.hypot(i + 0.5 - size / 2, j + 0.5 - size / 2) / (size / 2);
            const band = Math.exp(-(((r - 0.72) / 0.13) ** 2));
            const pool = r < 0.72 ? 0.18 * (1 - r / 0.72) + 0.06 : 0;
            const alpha = r >= 1 ? 0 : Math.min(1, band + pool);

            data.set([255, 255, 255, Math.round(alpha * 255)], (j * size + i) * 4);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return texture;
}

// A chest's parts, made once: its body (standing on the ground), its lid (a flattened half-round
// on a board, hinged at the origin along its back edge, reaching forward), and the iron on each
// (two bands round it, a rim, a lock plate)
function chestParts() {
    const { width, depth, height, rise, band } = CHEST;
    const half = depth / 2;
    const body = new THREE.BoxGeometry(width, height, depth).translate(0, height / 2, 0);
    const curved = (radius, length) => new THREE.CylinderGeometry(radius, radius, length, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, rise, 1).translate(0, 0, half);
    // (Its underside a board, seen once it's thrown back)
    const lid = mergeGeometries([curved(half, width), new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2).translate(0, 0.002, half)]);
    const bands = [-1, 1].map((side) => side * width * 0.32);
    const bodyIron = mergeGeometries([
        ...bands.map((x) => new THREE.BoxGeometry(band, height + 0.01, depth + 0.012).translate(x, height / 2, 0)),
        new THREE.BoxGeometry(width + 0.012, band * 0.8, depth + 0.012).translate(0, height - band * 0.4, 0),
        new THREE.BoxGeometry(0.1, 0.12, 0.02).translate(0, height - 0.08, half + 0.008),
    ]);
    const lidIron = mergeGeometries(bands.map((x) => curved(half + 0.006, band).translate(x, 0, 0)));
    return { body, lid, bodyIron, lidIron };
}
