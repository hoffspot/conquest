// Things dropped on the ground (core/host.js: a player's "drop"): a little cloth bundle where each
// lies, its icon floating over it, bobbing and turning to the camera, until it's picked up or
// it's lain there too long. Anyone near can tap it to pick it up (app/game.js). A creature's
// spoils (host.js: a bundle for one player) are a leather sack, and only that player sees theirs.
// A place's chest (host.js #places: held by outlaws or the dead, by their leader) is an iron-bound
// wooden chest, shut while its guardians hold the place; once it's cleared, each player near has
// their share in it, the chest open.
//
// The icons are painted by whoever makes this (`picture`: an item id to a texture), so the world
// needn't know how they're drawn.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// A bundle's size (metres), and where its icon floats over it
const BUNDLE = Object.freeze({ radius: 0.2, squash: 0.55 });
const ICON = Object.freeze({ size: 0.46, above: 0.62, bob: 0.06 });

// A chest's size (metres: its body; its lid's rise over it, a half-round flattened), its iron
// bands' width, and how far back its lid's thrown once it's open (radians)
const CHEST = Object.freeze({ width: 0.8, depth: 0.46, height: 0.4, rise: 0.6, band: 0.05, open: 1.95 });

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
        // (Its inside dark, seen once its lid's thrown back; and the gold in it)
        this.inside = new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 1 });
        this.gold = new THREE.MeshStandardMaterial({ color: 0xd9a632, roughness: 0.35, metalness: 0.9, emissive: 0x3a2400 });
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

    /** Bob and turn the icons (time: seconds). */
    update(time) {
        for (const { icon, seed, above } of this.drawn.values()) {
            if (icon) {
                icon.position.y = above + Math.sin(time * 2.2 + seed) * ICON.bob;
            }
        }
    }

    /**
     * The thing dropped nearest a point on the screen (client pixels), within `radius` pixels of
     * its bundle or its icon: its id, or null. (`toScreen`: a point in the world to the screen.)
     */
    at(clientX, clientY, toScreen, radius = 40) {
        let best = null;
        let bestDistance = radius;

        for (const [id, { object, icon }] of this.drawn) {
            for (const point of [object.position.clone(), ...(icon ? [icon.getWorldPosition(new THREE.Vector3())] : [])]) {
                const screen = toScreen(point);
                const distance = screen ? Math.hypot(screen.x - clientX, screen.y - clientY) : Infinity;

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
        this.bundle.dispose();
        this.knot.dispose();
        this.cloth.dispose();
        this.leather.dispose();
        this.tie.dispose();
        Object.values(this.chest).forEach((geometry) => geometry.dispose());
        this.wood.dispose();
        this.iron.dispose();
        this.inside.dispose();
        this.gold.dispose();

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

        if (chest) {
            object.add(this.#chest(!dropped.chest));
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
        this.drawn.set(dropped.id, { object, icon, x, z, seed, above });
    }

    // A chest: its body and its lid (thrown back if it's `open`), iron-bound
    #chest(open) {
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
            chest.add(new THREE.Mesh(this.chest.gold, this.gold));
        }

        return chest;
    }
}

// A chest's parts, made once: its body (standing on the ground), its lid (a flattened half-round
// on a board, hinged at the origin along its back edge, reaching forward), the iron on each (two
// bands round it, a rim, a lock plate), and the gold heaped in it
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
    // (Heaped in it, just showing over its rim)
    const gold = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(width * 0.4, 0.07, depth * 0.38).translate(0, height - 0.035, 0);

    return { body, lid, bodyIron, lidIron, gold };
}
