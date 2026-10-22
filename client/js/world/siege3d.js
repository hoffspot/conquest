// A town's siege engines in the battle (core/invasions.js ENGINES: each a soldier of its own,
// battle.js `engine`), drawn from Kenney's Castle Kit (client/models/kenney, CC0): a catapult and
// a ballista, made as big as a town would build them (ENGINE_LOOKS `size`). Each is rolled along on
// its wheels, each wheel turned as far as it's gone, and swung round slowly to face the way it's
// turned (round in time, letting fly). The catapult's arm is flung up and over as it lets fly, its
// pot leaving from its bucket, and wound back down after. The ballista's bolt is gone as it's
// loosed, the whole engine jolted back, and another laid in after. Broken, its wreck lies in its
// place. Till its model's read, nothing's drawn of it (they're small, and read as soon as they're
// wanted: game.js).

import * as THREE from "three";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { loadGltf } from "./art/engine/models.js";

/**
 * How each engine's drawn: its model and its wreck (the catalog's), how many times bigger than
 * it's made (`size`), and how high it stands; its arm (the catapult's: its node, how far it's
 * flung, radians, and where its bucket is on it, as made) or its bolt (the ballista's: its node,
 * and where its point is on it); its wheels' radius (as made); how long a turn takes it (`turn`:
 * s for a half turn); and how far it's jolted back as it lets fly (metres).
 */
export const ENGINE_LOOKS = Object.freeze({
    catapult: Object.freeze({ model: "siege-catapult", wreck: "siege-catapult-wrecked", size: 2.6, height: 3.1, arm: Object.freeze({ node: "catapult", fling: 1.9, bucket: Object.freeze([-1.3, 0.06, 0]) }), wheel: 0.2, turn: 3, jolt: 0.12 }),
    ballista: Object.freeze({ model: "siege-ballista", wreck: "siege-ballista-wrecked", size: 2.8, height: 2.5, bolt: Object.freeze({ node: "arrow", point: Object.freeze([0.66, 0.08, 0]) }), wheel: 0.2, turn: 2.2, jolt: 0.25 }),
});

// How long the catapult's arm takes to be wound back down after it's flung (s), and the ballista's
// bolt to be laid in again
const WIND = 2.2;
const RELOAD = 1.6;

// How the models are made: their front along +x, turned to the game's (+z, its facing 0)
const MADE_FRONT = -Math.PI / 2;

// A model's file (the catalog's), read once and shared
const read = new Map();

function modelOf(name) {
    if (!read.has(name)) {
        const file = ASSETS.models[name]?.files[0];
        const page = globalThis.document?.baseURI ?? globalThis.location?.href;

        read.set(name, file && page ? loadGltf(new URL(hashed(file.path, file.hash), page).href).catch(() => null) : Promise.resolve(null));
    }

    return read.get(name);
}

// How far round from one angle to another, the short way (radians, -π to π)
const turnBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * A siege engine in the battle, as an avatar (game.js #dressing): standing where it is on the
 * ground, rolled and turned as it goes, letting fly as it attacks, wrecked as it's broken.
 */
export class EngineAvatar {
    constructor(kind) {
        const look = ENGINE_LOOKS[kind] ?? ENGINE_LOOKS.catapult;
        const noop = () => {};

        this.kind = kind;
        this.look = look;
        this.object = new THREE.Group();
        this.inner = new THREE.Group();
        this.inner.rotation.y = MADE_FRONT;
        this.inner.scale.setScalar(look.size);
        this.object.add(this.inner);
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

        // Its parts once read (the model's, and its wreck's), how far it's rolled, and what it's
        // doing: letting fly ({ t, hitAt, duration }: s), or wrecked
        this.body = null;
        this.wreck = null;
        this.wheels = [];
        this.arm = null;
        this.bolt = null;
        this.rolled = 0;
        this.firing = null;
        this.since = Infinity;
        this.wrecked = false;
        this.at = null;

        this.character = {
            object: this.object,
            height: look.height,
            materials: { body: { emissive: new THREE.Color(0, 0, 0) } },
            rig: { bone: () => this.object },
            sheathed: false,
            sheathe: noop,
            setEquipment: noop,
            lowerDetail: noop,
            fitDetail: noop,
            dispose: () => this.dispose(),
        };
        this.actions = {
            emoting: false,
            startAttack: (_animation, { hitAt = 0.6, duration = 1.2 } = {}) => {
                this.firing = { t: 0, hitAt, duration };
            },
            react: noop,
            knockdown: noop,
            // (Broken: its wreck in its place, lying where it was; how long its fall takes, s)
            die: () => {
                this.wrecked = true;
                this.#show();

                return 0.2;
            },
            revive: () => {
                this.wrecked = false;
                this.#show();
            },
            draw: noop,
            dodge: noop,
            setGuard: noop,
            setWeapon: noop,
            setSeated: noop,
            stopResting: noop,
            stopEmote: noop,
            rest: noop,
        };

        modelOf(look.model).then((gltf) => gltf && this.#made(gltf));
        modelOf(look.wreck).then((gltf) => gltf && this.#wrecked(gltf));
    }

    get arriving() {
        return false;
    }

    arrive() {}

    // Its model read: its parts found, drawn at once
    #made(gltf) {
        if (this.disposed) {
            return;
        }

        this.body = gltf.scene.clone(true);
        this.body.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }

            if (node.name.startsWith("wheel")) {
                this.wheels.push(node);
            }
        });
        this.arm = this.look.arm ? this.body.getObjectByName(this.look.arm.node) : null;
        this.bolt = this.look.bolt ? this.body.getObjectByName(this.look.bolt.node) : null;
        this.inner.add(this.body);
        this.#show();
    }

    // Its wreck read: in its place once it's broken
    #wrecked(gltf) {
        if (this.disposed) {
            return;
        }

        this.wreck = gltf.scene.clone(true);
        this.wreck.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        this.inner.add(this.wreck);
        this.#show();
    }

    // Whole, or its wreck in its place (or, its wreck not read, nothing)
    #show() {
        if (this.body) {
            this.body.visible = !this.wrecked;
        }

        if (this.wreck) {
            this.wreck.visible = this.wrecked;
        }
    }

    /** Where it stands (world metres), facing `facing`. */
    place(x, z, facing = 0) {
        this.object.position.set(x, this.object.position.y, z);
        this.facing = facing;
        this.object.rotation.y = facing;
        this.at = [x, z];
    }

    /**
     * On `dt` seconds, to where it is now (world metres) and the way it faces: rolled there, its
     * wheels turned as far, swung slowly round; letting fly, its arm flung or its bolt loosed.
     */
    update(dt, x, z, facing) {
        if (!this.at) {
            this.place(x, z, facing);
        }

        const [px, pz] = this.at;
        const moved = Math.hypot(x - px, z - pz);
        const ahead = Math.sin(this.facing) * (x - px) + Math.cos(this.facing) * (z - pz) >= 0 ? 1 : -1;

        this.rolled += ahead * moved;
        this.at = [x, z];
        this.object.position.x = x;
        this.object.position.z = z;
        this.speed = dt > 0 ? moved / dt : 0;

        // (Swung round to the way it faces, no faster than it can be: a half turn in `turn` s; but,
        // letting fly, round by the time it does)
        const turning = turnBetween(this.facing, facing);
        const left = this.firing && !this.firing.loosed ? Math.max(dt, this.firing.hitAt - this.firing.t) : Infinity;
        const most = Math.max((Math.PI / this.look.turn) * dt, Math.abs(turning) * (dt / left));

        this.facing += Math.max(-most, Math.min(most, turning));
        this.object.rotation.y = this.facing;

        // (Each wheel turned as far as it's rolled, about its axle)
        for (const wheel of this.wheels) {
            wheel.rotation.z = -this.rolled / (this.look.wheel * this.look.size);
        }

        this.#letFly(dt);
    }

    // Letting fly: the catapult's arm flung up and over by the moment it lets go and wound back
    // down after; the ballista's bolt gone the moment it's loosed and laid in again after; either
    // jolted back as it does
    #letFly(dt) {
        const firing = this.firing;

        if (firing) {
            firing.t += dt;

            if (firing.t >= firing.hitAt && !firing.loosed) {
                firing.loosed = true;
                this.since = 0;
            }

            if (firing.t >= firing.duration) {
                this.firing = null;
            }
        }

        this.since += dt;

        const up = firing && !firing.loosed ? Math.min(1, firing.t / Math.max(0.05, firing.hitAt)) : 0;
        const flung = firing && !firing.loosed ? up * up * up : Math.max(0, 1 - this.since / WIND);

        if (this.arm) {
            this.arm.rotation.z = -this.look.arm.fling * flung;
        }

        if (this.bolt) {
            this.bolt.visible = this.since >= RELOAD;
        }

        // (Jolted back as it lets fly, and settling)
        const jolt = this.since < 0.4 ? this.look.jolt * Math.sin((this.since / 0.4) * Math.PI) : 0;

        this.inner.position.set(0, 0, -jolt);
    }

    angleTo(x, z) {
        return Math.atan2(x - this.object.position.x, z - this.object.position.z);
    }

    /** A point `share` of its height up its middle. */
    point(share = 0.72, target = new THREE.Vector3()) {
        return target.copy(this.object.position).setY(this.object.position.y + this.character.height * share);
    }

    /**
     * Where it lets fly from (whichever hand's asked for): the catapult's bucket, where its arm is
     * now; the ballista's bolt's point; or, its model not read, high in its middle.
     */
    hand(_side = "Right", target = new THREE.Vector3()) {
        const part = this.arm ?? this.bolt;
        const at = this.look.arm?.bucket ?? this.look.bolt?.point;

        if (!part || !at) {
            return this.point(0.8, target);
        }

        this.object.updateMatrixWorld(true);

        return part.localToWorld(target.set(...at));
    }

    dispose() {
        this.disposed = true;
        this.object.removeFromParent();
    }
}
