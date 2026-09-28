// Things dropped on the ground (core/host.js: a player's "drop"): a little cloth bundle where each
// lies, its icon floating over it, bobbing and turning to the camera, until it's picked up or
// it's lain there too long. Anyone near can tap it to pick it up (app/game.js). A creature's
// spoils (host.js: a bundle for one player) are a leather sack, and only that player sees theirs.
//
// The icons are painted by whoever makes this (`picture`: an item id to a texture), so the world
// needn't know how they're drawn.

import * as THREE from "three";

// A bundle's size (metres), and where its icon floats over it
const BUNDLE = Object.freeze({ radius: 0.2, squash: 0.55 });
const ICON = Object.freeze({ size: 0.46, above: 0.62, bob: 0.06 });

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
                drawn.icon.material.dispose();
                this.drawn.delete(id);
            }
        }
    }

    /** Bob and turn the icons (time: seconds). */
    update(time) {
        for (const { icon, seed } of this.drawn.values()) {
            icon.position.y = BUNDLE.radius + ICON.above + Math.sin(time * 2.2 + seed) * ICON.bob;
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
            for (const point of [object.position.clone(), icon.getWorldPosition(new THREE.Vector3())]) {
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

        for (const { icon } of this.drawn.values()) {
            icon.material.dispose();
        }

        this.drawn.clear();
    }

    #draw(dropped, x, z) {
        const object = new THREE.Group();
        const bundle = new THREE.Mesh(this.bundle, dropped.bundle ? this.leather : this.cloth);
        const knot = new THREE.Mesh(this.knot, this.tie);
        const shown = dropped.bundle ? (dropped.bundle.items[0]?.id ?? "gold") : dropped.item.id;
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.picture(shown), transparent: true, depthWrite: false }));
        const seed = [...dropped.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);

        bundle.castShadow = true;
        icon.scale.set(ICON.size, ICON.size, 1);
        icon.position.y = BUNDLE.radius + ICON.above;
        object.add(bundle, knot, icon);
        object.position.set(x, 0, z);
        object.rotation.y = seed;
        object.name = dropped.id;
        this.group.add(object);
        this.drawn.set(dropped.id, { object, icon, x, z, seed });
    }
}
