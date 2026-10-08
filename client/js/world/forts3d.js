// The fortifications standing near the player, drawn (core/war/forts.js: the war builds and razes
// them; art/kits/forts.js builds each people's): each guard tower or forward garrison set down on
// the ground at its point, its front (its door, its gate) turned towards home, away from the enemy
// it faces; kept while it's within FORTS_VIEW metres (a little past where the near world's drawn
// to: FAR.nearFar), let go further off. Each kind of each people's is built once and drawn as many
// times as it stands, sharing its shapes. And every one of them as it's seen from afar (as the
// settlements are: far/silhouettes.js), a few boxes and roofs in its people's colours, fading in
// where the near world fades out: with the far land, and its copy with the near world.
//
// And a fortification stood up in the battle near a player (core/host.js FORT_NEAR), as an avatar
// as the game asks for one (FortAvatar): nothing of its own to draw (its stone's drawn here), but
// where its bar shows over it, where its arrows are loosed from (its loops), and the rest of what's
// asked of an avatar doing nothing.

import * as THREE from "three";
import { FORT_LOOKS, fortObject, GARRISON, TOWER } from "./art/kits/forts.js";
import { buildersOf, Shapes } from "./far/shapes.js";

/** How far off (metres) the fortifications are drawn whole (further, only from afar). */
export const FORTS_VIEW = 200;

// World pixels in a metre (the kits')
const M = 5;

// How far into the ground what's seen from afar is sunk (metres: far/shapes.js's)
const SUNK = 2;

/**
 * How tall each kind stands (metres: its bar shows over it), and how high its archers loose from
 * (`loops`).
 */
export const FORT_HEIGHTS = Object.freeze({ tower: { height: TOWER.high + 1.2, loops: TOWER.loops[1] }, garrison: { height: GARRISON.high + 1.8, loops: GARRISON.high } });

export class Forts {
    /**
     * @param {THREE.Scene} scene - The near world's.
     * @param {THREE.Scene} [farScene] - The far land's (view.js far.scene): where they're seen
     *     from afar.
     */
    constructor(scene, farScene = null) {
        this.scene = scene;
        this.groundAt = () => 0;

        /** Those drawn, by id: their group. */
        this.drawn = new Map();

        // Each kind of each people's, built once (by `${kind}:${people}`)
        this.models = new Map();

        // Every one as seen from afar: one mesh with the far land, its copy with the near world
        // (fading in where the near world fades out: fog.js FAR_FADE_IN), made again as they change
        this.farGeometry = new THREE.BufferGeometry();
        this.farMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, name: "fortifications from afar" });
        this.farMaterial.defines = { FAR_FADE_IN: "" };
        this.farKey = "";
        this.afar = [farScene, scene].filter(Boolean).map((into) => {
            const mesh = new THREE.Mesh(this.farGeometry, this.farMaterial);

            mesh.name = "fortifications from afar";
            mesh.visible = false;
            mesh.frustumCulled = false;
            mesh.matrixAutoUpdate = false;
            into.add(mesh);

            return mesh;
        });
    }

    /** Set them down on this ground (its height at a point, (x, z) => metres). */
    setGround(at) {
        this.groundAt = at ?? (() => 0);
    }

    /**
     * Draw those of `forts` ([{ id, kind, realm, at: [x, z] (world metres), facing (radians, as the
     * battle has them: the way its front faces) }]) within FORTS_VIEW of `[x, z]`, and none of the
     * rest; and all of them from afar. Returns those drawn now that weren't, and the ids of those
     * let go: { added, gone }.
     */
    sync(forts, [px, pz]) {
        this.#afar(forts);

        const near = forts.filter(({ at: [x, z] }) => Math.hypot(x - px, z - pz) <= FORTS_VIEW);
        const keep = new Set(near.map(({ id }) => id));
        const gone = [];
        const added = [];

        for (const [id, object] of this.drawn) {
            if (!keep.has(id)) {
                object.removeFromParent();
                this.drawn.delete(id);
                gone.push(id);
            }
        }

        for (const fort of near) {
            if (this.drawn.has(fort.id)) {
                continue;
            }

            const object = new THREE.Group();
            const [x, z] = fort.at;

            object.name = `fort:${fort.id}`;
            object.add(this.#model(fort.kind, fort.realm).clone());
            object.position.set(x, this.groundAt(x, z), z);
            object.rotation.y = fort.facing;
            this.scene.add(object);
            this.drawn.set(fort.id, object);
            added.push(fort);
        }

        return { added, gone };
    }

    /** The torches burning by their doors and gates: [{ x, y, z, kind }] (world metres), for the night's lights. */
    lights() {
        const lit = [];
        const point = new THREE.Vector3();

        for (const object of this.drawn.values()) {
            const model = object.children[0];

            object.updateMatrixWorld();

            for (const [x, y, z, kind] of model?.userData.lights ?? []) {
                point.set(x, y, z).applyMatrix4(model.matrixWorld);
                lit.push({ x: point.x, y: point.y, z: point.z, kind });
            }
        }

        return lit;
    }

    /** Let them all go, and what they're built of. */
    dispose() {
        for (const object of this.drawn.values()) {
            object.removeFromParent();
        }

        this.drawn.clear();

        for (const mesh of this.afar) {
            mesh.removeFromParent();
        }

        this.farGeometry.dispose();
        this.farMaterial.dispose();

        for (const model of this.models.values()) {
            model.traverse((node) => node.geometry?.dispose());
        }

        this.models.clear();
    }

    // Every one of them as seen from afar, made again when they've changed: a tower a box of its
    // people's stone, battlemented, roofed or with its gallery as they build it; a forward garrison
    // its walls (or its stakes) round, a turret at each corner
    #afar(forts) {
        const key = forts.map(({ id, kind, realm, at: [x, z] }) => `${id}:${kind}:${realm}:${x}:${z}`).join(",");

        if (key === this.farKey) {
            return;
        }

        const shapes = new Shapes();

        for (const { kind, realm, at: [x, z], facing } of forts) {
            const builders = buildersOf(realm);
            const look = FORT_LOOKS[realm] ?? FORT_LOOKS.human;
            const y = this.groundAt(x, z) - SUNK;

            if (kind === "garrison") {
                const high = GARRISON.high + SUNK;
                const walls = look.wall === "stakes" ? builders.wood : builders.stone;
                const reach = GARRISON.half - GARRISON.turret / 2;
                const [sin, cos] = [Math.sin(facing), Math.cos(facing)];

                shapes.box(x, z, y, GARRISON.half * 2, GARRISON.half * 2, high, facing, walls);

                for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    shapes.column(x + (u * cos + v * sin) * reach, z + (v * cos - u * sin) * reach, y, GARRISON.turret * 1.2, high + 1.2, walls, 6);
                }

                continue;
            }

            const top = y + TOWER.high + SUNK;
            const width = TOWER.half * 2;

            shapes.box(x, z, y, width, width, TOWER.high + SUNK, facing, builders.stone, look.tower === "battlements");

            if (look.tower === "roof") {
                shapes.roof(x, z, top, width + 1, width + 1, 4.2, facing, builders.roof, true);
            } else if (look.tower === "hoarding") {
                shapes.box(x, z, top, width + 1, width + 1, 2, facing, builders.wood, false);
                shapes.roof(x, z, top + 2, width + 1.8, width + 1.8, 1.8, facing, builders.roof, true);
            } else {
                shapes.box(x, z, top, width + 0.4, width + 0.4, 0.8, facing, builders.stone);
            }
        }

        this.farKey = key;
        this.farGeometry.dispose();
        this.farGeometry.setAttribute("position", new THREE.Float32BufferAttribute(shapes.positions, 3));
        this.farGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(shapes.normals, 3));
        this.farGeometry.setAttribute("color", new THREE.Float32BufferAttribute(shapes.colours, 3));

        for (const mesh of this.afar) {
            mesh.visible = shapes.positions.length > 0;
        }
    }

    // A kind of a people's, built the first time it's wanted (in metres, its shapes shared by each)
    #model(kind, people) {
        const key = `${kind}:${people}`;

        if (!this.models.has(key)) {
            const model = fortObject(kind, people);

            model.scale.setScalar(1 / M);
            this.models.set(key, model);
        }

        return this.models.get(key);
    }
}

/**
 * A fortification in the battle, as an avatar (game.js #register): standing at its point, as tall as
 * its kind (FORT_HEIGHTS), loosing from its loops; drawn by Forts, so nothing of its own.
 */
export class FortAvatar {
    constructor(kind) {
        const { height, loops } = FORT_HEIGHTS[kind] ?? FORT_HEIGHTS.tower;
        const noop = () => {};

        this.kind = kind;
        this.loops = loops;
        this.object = new THREE.Group();
        this.facing = 0;
        this.seen = true;
        this.every = 1;
        this.motion = 0;
        this.speed = 0;
        this.flight = null;
        this.arrival = null;
        this.winged = false;
        this.follow = { x: 0, z: 0, vx: 0, vz: 0 };
        this.walker = { onStep: null };
        this.gait = { size: 0, feet: null };
        this.character = {
            object: this.object,
            height,
            materials: { body: { emissive: new THREE.Color(0, 0, 0) } },
            rig: { bone: () => this.object },
            sheathed: false,
            sheathe: noop,
            setEquipment: noop,
            lowerDetail: noop,
            fitDetail: noop,
            dispose: () => this.object.removeFromParent(),
        };
        this.actions = {
            emoting: false,
            startAttack: noop,
            react: noop,
            knockdown: noop,
            // (It doesn't fall: razed, it's gone, its stone taken down: Forts)
            die: () => 0,
            revive: noop,
            draw: noop,
            dodge: noop,
            setGuard: noop,
            setWeapon: noop,
            setSeated: noop,
            stopResting: noop,
            stopEmote: noop,
            rest: noop,
        };
    }

    get arriving() {
        return false;
    }

    arrive() {}

    /** Where it stands (world metres), facing `facing`. */
    place(x, z, facing = 0) {
        this.object.position.set(x, this.object.position.y, z);
        this.facing = facing;
    }

    update(dt, x, z, facing) {
        this.place(x, z, facing);
    }

    angleTo(x, z) {
        return Math.atan2(x - this.object.position.x, z - this.object.position.z);
    }

    /** A point `share` of its height up its middle. */
    point(share = 0.72, target = new THREE.Vector3()) {
        return target.copy(this.object.position).setY(this.object.position.y + this.character.height * share);
    }

    /** Where its arrows are loosed from (whichever hand's asked for): a loop, high in it. */
    hand(_side = "Right", target = new THREE.Vector3()) {
        return target.copy(this.object.position).setY(this.object.position.y + this.loops);
    }

    dispose() {
        this.object.removeFromParent();
    }
}
