// The war's camps (docs/WAR.md M6), drawn where they're pitched near a player: ridge tents of
// canvas in their people's colour round a fire in a ring of stones, with logs crossed in it and
// flames flickering over them. Their banner is the banners' (banners3d.js), and their sentries are
// soldiers like any others.
//
// The tents' shapes, the stones' and the logs' are made once and shared by every camp; each
// people's canvas is one material.

import * as THREE from "three";
import { COLOURS } from "../core/war/peoples.js";
import { flame } from "./interiors3d.js";

// A tent's size (metres): its width across, its length front to back, its ridge's height
const TENT = Object.freeze({ width: 2.2, length: 2.8, height: 1.7 });

// The fire: its ring of stones (how many, how far out), its logs, and its flames
const FIRE = Object.freeze({ stones: 9, ring: 0.55, logs: 3, flame: [0.9, 1.1] });

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

        /** Each camp drawn, by its id: { object, flames }. */
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

    /**
     * Pitch a camp: `people` (whose it is), its fire ([x, z] world metres) and tents ([{ at: [x,
     * z], facing }]: each facing the fire, as the battle has facings). Any it had come down first.
     */
    pitch(id, people, { fire, tents }) {
        this.strike(id);

        const object = new THREE.Group();
        const canvas = this.#canvasOf(people);

        object.name = `camp:${id}`;

        for (const { at: [x, z], facing } of tents) {
            const tent = new THREE.Group();
            const cloth = new THREE.Mesh(this.tent, canvas);
            const door = new THREE.Mesh(this.door, this.materials.dark);

            tent.add(cloth, door);

            for (const end of [-1, 1]) {
                const pole = new THREE.Mesh(this.pole, this.materials.wood);

                pole.position.z = (end * TENT.length) / 2;
                tent.add(pole);
            }

            tent.position.set(x, 0, z);
            tent.rotation.y = facing;
            object.add(tent);
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

        const flames = flame(FIRE.flame[0], FIRE.flame[1], id.length * 1.7);

        flames.position.y = 0.05;
        hearth.add(flames);
        hearth.position.set(fx, 0, fz);
        object.add(hearth);

        object.traverse((node) => {
            if (node.isMesh && node.material.type !== "ShaderMaterial") {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        this.group.add(object);
        this.camps.set(id, { object, flames });
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
            this.camps.delete(id);
        }
    }

    /** The flames flickering (`time`: seconds). */
    update(time) {
        for (const { flames } of this.camps.values()) {
            flames.userData.flame.uniforms.time.value = time;
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

        for (const material of [...Object.values(this.materials), ...this.canvases.values()]) {
            material.dispose();
        }
    }
}
