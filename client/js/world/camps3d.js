// The war's camps (docs/WAR.md M6), drawn where they're pitched near a player: each people's
// tents round a fire in a ring of stones, with logs crossed in it and its flames licking up out of
// them, embers rising and smoke over it (world/fire.js, lights.js), lighting the camp round it
// (the humans' ridge tents of canvas in their colour; the other peoples' their own: art/peoples/
// camp.js). Their banner is the banners' (banners3d.js), and their sentries are soldiers like any
// others. A supply depot (docs/WAR.md *Supply*) is pitched as a camp is, with its stores stacked
// by its fire: crates, barrels and sacks of grain (art/kits/props.js).
//
// The tents' shapes, the stones', the logs' and the stores' are made once and shared by every
// camp; each people's canvas is one material.

import * as THREE from "three";
import { COLOURS } from "../core/war/peoples.js";
import { Solid } from "./art/engine/solid.js";
import { barrel, crate, sack } from "./art/kits/props.js";
import { campTent } from "./art/peoples/camp.js";
import { M } from "./art/peoples/kit.js";
import { lightsMesh } from "./lights.js";

// A tent's size (metres): its width across, its length front to back, its ridge's height
const TENT = Object.freeze({ width: 2.2, length: 2.8, height: 1.7 });

// The fire: its ring of stones (how many, how far out), its logs, and how high its flames stand
// from (metres: on the logs)
const FIRE = Object.freeze({ stones: 9, ring: 0.55, logs: 3, foot: 0.14 });

// Canvas: undyed, with a little of the people's colour in it
const CANVAS = new THREE.Color(0xd8ccae);

/** A tent's shape: a prism of canvas along z (its door at +z), its ridge along the top. */
function tentGeometry() {
    const { width, length, height } = TENT;
    const shape = new THREE.Shape();

    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }).translate(0, 0, -length / 2);
}

/** Its door: a darker triangle, a little in front of the canvas at its front end. */
function doorGeometry() {
    const { width, length, height } = TENT;
    const door = new THREE.BufferGeometry();

    door.setAttribute("position", new THREE.Float32BufferAttribute([-width * 0.22, 0, 0, width * 0.22, 0, 0, 0, height * 0.62, 0], 3));
    door.computeVertexNormals();

    return door.translate(0, 0, length / 2 + 0.01);
}

export class Camps {
    /** @param {THREE.Object3D} parent - What the camps go in (the scene). */
    constructor(parent) {
        this.group = new THREE.Group();
        this.group.name = "camps";
        parent.add(this.group);

        /** The ground's height at a point ((x, z) => metres: set with setGround). */
        this.groundAt = () => 0;

        this.tent = tentGeometry();
        this.door = doorGeometry();
        this.pole = new THREE.CylinderGeometry(0.03, 0.03, TENT.height + 0.25, 5).translate(0, (TENT.height + 0.25) / 2, 0);
        this.stone = new THREE.DodecahedronGeometry(0.13, 0);
        this.log = new THREE.CylinderGeometry(0.07, 0.08, 1, 6).rotateZ(Math.PI / 2);
        this.materials = {
            wood: new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.9 }),
            stone: new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.95, flatShading: true }),
            ash: new THREE.MeshStandardMaterial({ color: 0x2a2522, roughness: 1 }),
            dark: new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 1, side: THREE.DoubleSide }),
        };
        this.canvases = new Map();

        // Each people's own tent, built once (null for the humans, whose are drawn here)
        this.tents = new Map();

        /** Each camp drawn, by its id: { object, light }. */
        this.camps = new Map();
    }

    // A people's canvas: undyed, with a little of their colour
    #canvasOf(people) {
        if (!this.canvases.has(people)) {
            const colour = CANVAS.clone().lerp(new THREE.Color(COLOURS[people] ?? "#c8b890"), 0.35);

            this.canvases.set(people, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, flatShading: true, side: THREE.DoubleSide }));
        }

        return this.canvases.get(people);
    }

    // A people's own tent (in metres), or null if theirs are drawn here
    #tentOf(people) {
        if (!this.tents.has(people)) {
            const built = campTent(people);

            built?.scale.setScalar(1 / M);
            this.tents.set(people, built);
        }

        return this.tents.get(people);
    }

    /** Pitch camps on this ground (its height at a point, (x, z) => metres; null: flat at 0). */
    setGround(at) {
        this.groundAt = at ?? (() => 0);
    }

    /**
     * Pitch a camp: `people` (whose it is), its fire ([x, z] world metres) and tents ([{ at: [x,
     * z], facing }]: each facing the fire, as the battle has facings); a supply depot's `stores`
     * too ([{ at: [x, z], facing }]: a stack of them at each). Any it had come down first.
     */
    pitch(id, people, { fire, tents, stores = [] }) {
        this.strike(id);

        const object = new THREE.Group();
        const canvas = this.#canvasOf(people);
        const own = this.#tentOf(people);

        object.name = `camp:${id}`;

        for (const { at: [x, z], facing } of tents) {
            if (own) {
                const tent = new THREE.Group();

                tent.add(own.clone());
                tent.position.set(x, this.groundAt(x, z) - 0.03, z);
                tent.rotation.y = facing;
                object.add(tent);
                continue;
            }

            const tent = new THREE.Group();
            const cloth = new THREE.Mesh(this.tent, canvas);
            const door = new THREE.Mesh(this.door, this.materials.dark);

            tent.add(cloth, door);

            for (const end of [-1, 1]) {
                const pole = new THREE.Mesh(this.pole, this.materials.wood);

                pole.position.z = (end * TENT.length) / 2;
                tent.add(pole);
            }

            tent.position.set(x, this.groundAt(x, z) - 0.03, z);
            tent.rotation.y = facing;
            object.add(tent);
        }

        // A depot's stores, stacked
        for (const { at: [x, z], facing } of stores) {
            const stack = this.#stores().clone();

            stack.name = "stores";
            stack.position.set(x, this.groundAt(x, z), z);
            stack.rotation.y = facing;
            object.add(stack);
        }

        // The fire: a ring of stones, ashes, logs crossed, and flames
        const [fx, fz] = fire;
        const hearth = new THREE.Group();

        for (let k = 0; k < FIRE.stones; k++) {
            const angle = (k / FIRE.stones) * Math.PI * 2;
            const stone = new THREE.Mesh(this.stone, this.materials.stone);

            stone.position.set(Math.cos(angle) * FIRE.ring, 0.06, Math.sin(angle) * FIRE.ring);
            stone.rotation.set(angle, angle * 2, 0);
            hearth.add(stone);
        }

        const ashes = new THREE.Mesh(new THREE.CircleGeometry(FIRE.ring * 0.9, 12).rotateX(-Math.PI / 2), this.materials.ash);

        ashes.position.y = 0.02;
        hearth.add(ashes);

        for (let k = 0; k < FIRE.logs; k++) {
            const log = new THREE.Mesh(this.log, this.materials.wood);

            log.scale.x = 0.85;
            log.rotation.y = (k / FIRE.logs) * Math.PI;
            log.position.y = 0.09 + k * 0.05;
            hearth.add(log);
        }

        // (Its flames, embers, smoke and glow, in the hearth's own metres)
        hearth.add(lightsMesh([{ x: 0, y: FIRE.foot, z: 0, kind: "fire" }]));
        hearth.position.set(fx, this.groundAt(fx, fz), fz);
        object.add(hearth);

        object.traverse((node) => {
            if (node.isMesh && node.material.type !== "ShaderMaterial") {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        this.group.add(object);
        this.camps.set(id, { object, light: { x: fx, y: hearth.position.y + FIRE.foot, z: fz, kind: "fire" } });
    }

    // A stack of a depot's stores (shared by every depot; metres): two crates, one on the other,
    // two barrels beside them, and sacks of grain slumped in front
    #stores() {
        if (!this.storesObject) {
            const solid = new Solid();
            const top = new Solid();
            const px = (metres) => metres * 5;

            crate(solid, 0, 0, px(0.8), 0.08);
            crate(top, 0, 0, px(0.6), -0.2);
            solid.add(top, px(0.05), px(0.8), px(-0.02));
            barrel(solid, px(0.85), px(-0.1), px(0.9), px(0.28));
            barrel(solid, px(0.8), px(0.55), px(0.9), px(0.28));

            for (const [x, z, h] of [[-0.25, 0.75, 0.55], [0.2, 0.85, 0.5], [-0.75, 0.3, 0.52]]) {
                sack(solid, px(x), px(z), px(h), px(0.03));
            }

            this.storesObject = solid.toObject();
            this.storesObject.scale.setScalar(1 / 5);
        }

        return this.storesObject;
    }

    /** The camps' fires as lights (lights.js: world metres), lighting what's round them at night. */
    lights() {
        return [...this.camps.values()].map(({ light }) => light);
    }

    /** Strike a camp: its tents and fire gone. */
    strike(id) {
        const camp = this.camps.get(id);

        if (camp) {
            camp.object.removeFromParent();
            camp.object.traverse((node) => {
                // (Only what's the camp's own: the ashes; the shared shapes stay)
                if (node.isMesh && node.geometry.type === "CircleGeometry") {
                    node.geometry.dispose();
                }
            });
            // (And its fire's: its flames, embers, smoke and glow)
            camp.object.getObjectByName("lights")?.traverse((node) => node.geometry?.dispose());
            this.camps.delete(id);
        }
    }

    /** How many camps are drawn. */
    get size() {
        return this.camps.size;
    }

    dispose() {
        for (const id of [...this.camps.keys()]) {
            this.strike(id);
        }

        this.group.removeFromParent();

        for (const geometry of [this.tent, this.door, this.pole, this.stone, this.log]) {
            geometry.dispose();
        }

        // (The peoples' own tents' shapes; their materials are the art's, shared)
        for (const tent of this.tents.values()) {
            tent?.traverse((node) => node.isMesh && node.geometry.dispose());
        }

        for (const material of [...Object.values(this.materials), ...this.canvases.values()]) {
            material.dispose();
        }
    }
}
