// Things dropped on the ground (core/host.js: a player's "drop"): a little cloth bundle where each
// lies, its icon floating over it, bobbing and turning to the camera, until it's picked up or
// it's lain there too long. Anyone near can tap it to pick it up (app/game.js). A creature's
// spoils (host.js: a bundle for one player) are a leather sack, and only that player sees theirs.
// A place's chest (host.js #places: held by outlaws or the dead, by their leader) is an iron-bound
// wooden chest (the JMI 3D Toolkit's, client/models/jmi; drawn here till it's read, or if it
// can't be), shut while its guardians hold the place; once it's cleared, each player near has
// their share in it, its lid thrown open (the model's own "Open") on a heap of gold coins
// (gold3d.js).
//
// The icons are painted by whoever makes this (`picture`: an item id to a texture), so the world
// needn't know how they're drawn.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loadGltf } from "./art/engine/models.js";
import { drawGold, GOLD, goldParts } from "./gold3d.js";

// A bundle's size (metres), and where its icon floats over it
const BUNDLE = Object.freeze({ radius: 0.2, squash: 0.55 });
const ICON = Object.freeze({ size: 0.46, above: 0.62, bob: 0.06 });

// A chest's size (metres: its body; its lid's rise over it, a half-round flattened), its iron
// bands' width, and how far back its lid's thrown once it's open (radians)
const CHEST = Object.freeze({ width: 0.8, depth: 0.46, height: 0.4, rise: 0.6, band: 0.05, open: 1.95 });

// The chest's model: where it's read from, how big it's drawn (its units to metres: 0.85 m
// across), and the clip that opens it (the gold heaped in it in its units: gold3d.js GOLD)
const CHEST_MODEL = Object.freeze({ url: "models/jmi/chest.glb", scale: 1.3, clip: "Open", lid: "Chest_Lid" });

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

        /** What's drawn, by the id of the thing dropped: { object, icon, x, z, seed }. */
        this.drawn = new Map();

        this.bundle = new THREE.SphereGeometry(BUNDLE.radius, 12, 8);
        this.bundle.scale(1, BUNDLE.squash, 1);
        this.bundle.translate(0, BUNDLE.radius * BUNDLE.squash, 0);
        this.knot = new THREE.ConeGeometry(BUNDLE.radius * 0.35, BUNDLE.radius * 0.6, 8);
        this.knot.translate(0, BUNDLE.radius * (2 * BUNDLE.squash + 0.2), 0);
        this.cloth = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.95 });
        this.leather = new THREE.MeshStandardMaterial({ color: 0x5e3a1e, roughness: 0.8 });
        this.tie = new THREE.MeshStandardMaterial({ color: 0x5a3f22, roughness: 0.9 });
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
        loadGltf(CHEST_MODEL.url).then(
            (gltf) => this.#modelRead(gltf),
            () => {
                // (Not to be had: the chest as made here)
            },
        );
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

            if (!this.drawn.has(dropped.id)) {
                this.#draw(dropped, x, z);
            }
        }

        for (const [id, drawn] of this.drawn) {
            if (!seen.has(id)) {
                this.group.remove(drawn.object);
                drawn.icon?.material.dispose();
                this.drawn.delete(id);
            }
        }
    }

    /** Bob and turn the icons, and open the chests opening (time: seconds). */
    update(time) {
        const step = this.time === null ? 0 : Math.max(0, time - this.time);

        this.time = time;

        for (const { icon, seed, above, mixer } of this.drawn.values()) {
            if (icon) {
                icon.position.y = above + Math.sin(time * 2.2 + seed) * ICON.bob;
            }

            mixer?.update(step);
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

        for (const [id, { object }] of this.drawn) {
            const middle = _box.setFromObject(object).getCenter(_middle);
            const foot = toScreen(_point.set(middle.x, _box.min.y, middle.z));
            const top = toScreen(_point.set(middle.x, _box.max.y, middle.z));
            const distance = foot && top ? fromLine(clientX, clientY, foot, top) : Infinity;

            if (distance < bestDistance) {
                best = id;
                bestDistance = distance;
            }
        }

        return best;
    }

    dispose() {
        this.scene.remove(this.group);
        this.bundle.dispose();
        this.knot.dispose();
        this.cloth.dispose();
        this.leather.dispose();
        this.tie.dispose();
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

        for (const { icon } of this.drawn.values()) {
            icon?.material.dispose();
        }

        this.drawn.clear();
    }

    #draw(dropped, x, z) {
        const object = new THREE.Group();
        const chest = dropped.chest || dropped.from === "chest";
        const shown = dropped.chest ? null : dropped.bundle ? (dropped.bundle.items[0]?.id ?? "gold") : dropped.item.id;
        const icon = shown ? new THREE.Sprite(new THREE.SpriteMaterial({ map: this.picture(shown), transparent: true, depthWrite: false })) : null;
        const seed = [...dropped.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
        const above = (chest ? CHEST.height + CHEST.depth * 0.5 * CHEST.rise : BUNDLE.radius) + ICON.above;

        let mixer = null;

        if (chest) {
            const made = this.#chest(!dropped.chest);

            object.add(made.chest);
            mixer = made.mixer;
        } else {
            const bundle = new THREE.Mesh(this.bundle, dropped.bundle ? this.leather : this.cloth);

            bundle.castShadow = true;
            object.add(bundle, new THREE.Mesh(this.knot, this.tie));
        }

        if (icon) {
            icon.scale.set(ICON.size, ICON.size, 1);
            icon.position.y = above;
            object.add(icon);
        }

        object.position.set(x, this.groundAt(x, z), z);
        // (A chest square to the square; a bundle any way)
        object.rotation.y = chest ? 0 : seed;
        object.name = dropped.id;
        this.group.add(object);
        this.drawn.set(dropped.id, { object, icon, x, z, seed, above, chest, mixer });
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

        for (const [id, drawn] of this.drawn) {
            if (drawn.chest) {
                this.group.remove(drawn.object);
                drawn.icon?.material.dispose();
                this.drawn.delete(id);
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
