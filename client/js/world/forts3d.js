// The fortifications standing near the player, drawn (core/war/forts.js: the war builds and razes
// them; art/kits/forts.js builds each people's): each guard tower or forward garrison set down on
// the ground at its point, its front (its door, its gate) turned towards home, away from the enemy
// it faces; kept while it's within FORTS_VIEW metres (a little past where the near world's drawn
// to: FAR.nearFar), let go further off. Each kind of each people's is built once and drawn as many
// times as it stands, sharing its shapes. And every one of them as it's seen from afar (as the
// settlements are: far/silhouettes.js), a few boxes and roofs in its people's colours, fading in
// where the near world fades out: with the far land, and its copy with the near world; set on the
// land as it's seen from afar (the world plan's own heights, as the settlements' are), not the
// ground's, which would lay out the land round every one of them, however far, to find it.
//
// A people whose fortifications have a licensed kit (art/kits/forts.js FORT_LOOKS `kit`: the humans',
// Wind Ways' timber forts) has them drawn from it once it's read (asked for the first time one's
// drawn), its own drawn in their place till then and without the licensed models; those standing
// then drawn again from it. Each its lower detail from TIMBER.far off, and a torch by its ladder or
// its gate.
//
// And a fortification stood up in the battle near a player (core/host.js FORT_NEAR), as an avatar
// as the game asks for one (FortAvatar): nothing of its own to draw (its stone's drawn here), but
// where its bar shows over it, where its arrows are loosed from (its loops), and the rest of what's
// asked of an avatar doing nothing.

import * as THREE from "three";
import { readyScenery, sceneryOf } from "../beasts/model.js";
import { Solid } from "./art/engine/solid.js";
import { FORT_LOOKS, fortObject, GARRISON, TOWER } from "./art/kits/forts.js";
import { torch } from "./art/kits/torches.js";
import { buildersOf, Shapes } from "./far/shapes.js";

/** How far off (metres) the fortifications are drawn whole (further, only from afar). */
export const FORTS_VIEW = 200;

// World pixels in a metre (the kits')
const M = 5;

// How far into the ground what's seen from afar is sunk (metres: far/shapes.js's)
const SUNK = 2;

/**
 * How tall each kind stands (metres: its bar shows over it), and how high its archers loose from
 * (`loops`); and a camp's stakes being hacked at (core/host.js #hack: as tall as stockades3d.js
 * draws them), loosing nothing.
 */
export const FORT_HEIGHTS = Object.freeze({ tower: { height: TOWER.high + 1.2, loops: TOWER.loops[1] }, garrison: { height: GARRISON.high + 1.8, loops: GARRISON.high }, stakes: { height: 3.1, loops: 2.4 } });

/**
 * The timber forts' measures (metres), as Wind Ways' pieces stand in the kit (its `tower` 2.89 by
 * 2.98 m and 13.5 m tall, its lookout's floor 8 m up; its `garrison` a palisade two wall runs a
 * side, 19.38 m square and 5.7 m tall, its walkway 4 m up and a watchtower inside each corner): how
 * tall each stands for its bar and how high its archers loose from (as FORT_HEIGHTS, for a people
 * with the kit, its stand-in as tall); where the torches by the tower's ladder and the garrison's
 * gate burn (its front +z); where the garrison's towers stand (their middles, inside its corners);
 * and how far off each is drawn in its lower detail.
 */
export const TIMBER = Object.freeze({
    heights: Object.freeze({ tower: Object.freeze({ height: 14.2, loops: 9.2 }), garrison: Object.freeze({ height: 7.5, loops: 5.2 }) }),
    torches: Object.freeze({ tower: [1.25, 2.2, 1.5], garrison: [2.7, 2.4, 9.71] }),
    towers: Object.freeze({ at: [8.04, 8.0], width: 2.9, high: 10, roof: 3.5 }),
    palisade: Object.freeze({ half: 9.69, high: 5.7 }),
    far: 40,
});

/** How tall a people's fortification of `kind` stands, and how high its archers loose from. */
export function heightsOf(kind, people = null) {
    return (FORT_LOOKS[people]?.kit && TIMBER.heights[kind]) || FORT_HEIGHTS[kind] || FORT_HEIGHTS.tower;
}

/** A people's fortifications' licensed kit, once it's read (its glTF: { scene }); else null. */
function fortKit(people) {
    const asset = FORT_LOOKS[people]?.kit;

    return asset ? sceneryOf(asset) : null;
}

/**
 * Ask for a people's fortifications' licensed kit to be read (beasts/model.js readyScenery):
 * { ready } (a promise, resolved once it's read or couldn't be); or null if it has none, or there's
 * no page to read it from.
 */
export function readyFortKit(people) {
    const asset = FORT_LOOKS[people]?.kit;

    if (!asset || sceneryOf(asset)) {
        return null;
    }

    // (Asked for once, however many ask)
    if (!asking.has(asset)) {
        asking.set(asset, readyScenery(asset));
    }

    return asking.get(asset);
}

// Each kit asked for (readyScenery's, by its catalog name)
const asking = new Map();

/**
 * A people's fortification of `kind` ("tower", "garrison") as it's drawn, in metres, its front (its
 * door, its gate) towards +z: from its licensed kit once that's read (its lower detail drawn from
 * TIMBER.far off, a torch by its ladder or its gate), else its own (art/kits/forts.js, scaled from
 * world pixels). Its torches' flames in `userData.lights`, where its own matrix has them.
 */
export function fortModel(kind, people) {
    const kit = fortKit(people);
    const near = kit?.scene.getObjectByName(kind);

    if (!near) {
        const own = fortObject(kind, people);

        own.scale.setScalar(1 / M);

        return own;
    }

    // (The lower detail's node is "<kind>.lod1", which the glTF loader names "<kind>lod1")
    const far = kit.scene.getObjectByName(`${kind}lod1`) ?? kit.scene.getObjectByName(`${kind}.lod1`);
    const lod = new THREE.LOD();
    const model = new THREE.Group();
    const lit = new Solid();
    const [x, y, z] = TIMBER.torches[kind];

    // (Each node keeps its own position and scale: what its quantized corners are read back by)
    for (const [node, distance] of [[near, 0], [far, TIMBER.far]]) {
        if (!node) {
            continue;
        }

        const mesh = node.clone();

        mesh.traverse((part) => {
            part.castShadow = part.isMesh;
            part.receiveShadow = part.isMesh;
        });
        lod.addLevel(mesh, distance);
    }

    torch(lit, [x * M, y * M, z * M], [0, 1]);

    const torches = lit.toObject();

    torches.scale.setScalar(1 / M);
    model.name = `${kind} (${FORT_LOOKS[people].kit})`;
    model.add(lod, torches);
    model.userData.kit = true;
    model.userData.lights = (torches.userData.lights ?? []).map(([lx, ly, lz, ...rest]) => [lx / M, ly / M, lz / M, ...rest]);

    return model;
}

export class Forts {
    /**
     * @param {THREE.Scene} scene - The near world's.
     * @param {THREE.Scene} [farScene] - The far land's (view.js far.scene): where they're seen
     *     from afar.
     */
    constructor(scene, farScene = null) {
        this.scene = scene;
        this.groundAt = () => 0;
        this.landAt = this.groundAt;

        /** Those drawn, by id: their group. */
        this.drawn = new Map();

        // Each kind of each people's, built once (by `${kind}:${people}`): its own, and from its
        // kit once that's read; and each kit asked for (by people: its readyScenery, or null)
        this.models = new Map();
        this.kits = new Map();
        this.asked = new Map();
        this.disposed = false;

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

    /**
     * Set them down on this ground (its height at a point, (x, z) => metres): those near on `at`
     * (the ground's, as it's walked), those from afar on `land` (the land's, as it's seen from afar:
     * core/terrain/height.js heightAt), or on `at` too without.
     */
    setGround(at, land = null) {
        this.groundAt = at ?? (() => 0);
        this.landAt = land ?? this.groundAt;
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
            object.userData = { kind: fort.kind, realm: fort.realm };
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
        this.disposed = true;

        for (const object of this.drawn.values()) {
            object.removeFromParent();
        }

        this.drawn.clear();

        for (const mesh of this.afar) {
            mesh.removeFromParent();
        }

        this.farGeometry.dispose();
        this.farMaterial.dispose();

        // (Not the kit's: its glTF's shared, kept by beasts/model.js)
        for (const model of this.models.values()) {
            model.traverse((node) => node.geometry?.dispose());
        }

        for (const model of this.kits.values()) {
            model.children[1]?.traverse((node) => node.geometry?.dispose());
        }

        this.models.clear();
        this.kits.clear();
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
            const y = this.landAt(x, z) - SUNK;

            if (look.kit) {
                timberAfar(shapes, kind, [x, y, z], facing, builders);

                continue;
            }

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

    // A kind of a people's, built the first time it's wanted (in metres, its shapes shared by each):
    // from its kit once that's read, asked for the first time it's wanted; its own till then
    #model(kind, people) {
        const key = `${kind}:${people}`;

        if (FORT_LOOKS[people]?.kit && !this.asked.has(people)) {
            const asked = readyFortKit(people);

            this.asked.set(people, asked);
            asked?.ready.then(() => !this.disposed && fortKit(people) && this.#redraw(people));
        }

        if (fortKit(people)) {
            if (!this.kits.has(key)) {
                this.kits.set(key, fortModel(kind, people));
            }

            return this.kits.get(key);
        }

        if (!this.models.has(key)) {
            this.models.set(key, fortModel(kind, people));
        }

        return this.models.get(key);
    }

    // A people's kit read: those of theirs standing drawn again from it
    #redraw(people) {
        for (const object of this.drawn.values()) {
            const { kind, realm } = object.userData;

            if (realm === people) {
                object.clear();
                object.add(this.#model(kind, realm).clone());
            }
        }
    }
}

// A timber fort as it's seen from afar (TIMBER): the watchtower a box of its timber, roofed; the
// garrison its palisade round, the watchtowers in its corners over it
function timberAfar(shapes, kind, [x, y, z], facing, builders) {
    const { towers, palisade } = TIMBER;
    const [sin, cos] = [Math.sin(facing), Math.cos(facing)];
    const tower = (u, v) => {
        const [tx, tz] = [x + u * cos + v * sin, z + v * cos - u * sin];

        shapes.box(tx, tz, y, towers.width, towers.width, towers.high + SUNK, facing, builders.wood);
        shapes.roof(tx, tz, y + towers.high + SUNK, towers.width + 0.5, towers.width + 0.5, towers.roof, facing, builders.roof, true);
    };

    if (kind !== "garrison") {
        tower(0, 0);

        return;
    }

    shapes.box(x, z, y, palisade.half * 2, palisade.half * 2, palisade.high + SUNK, facing, builders.wood);

    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        tower(u * towers.at[0], v * towers.at[1]);
    }
}

/**
 * A fortification in the battle, as an avatar (game.js #register): standing at its point, as tall as
 * its kind (FORT_HEIGHTS), loosing from its loops; drawn by Forts, so nothing of its own. (A camp's
 * stakes hacked at stand in the same way, drawn by world/stockades3d.js)
 */
export class FortAvatar {
    /** A fortification of `kind` ("tower", "garrison", "stakes") of `people`'s, as tall as it's drawn. */
    constructor(kind, people = null) {
        const { height, loops } = heightsOf(kind, people);
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
