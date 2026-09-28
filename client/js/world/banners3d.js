// The peoples' banners (docs/WAR.md M2): a pole at each way out of a town the war's come to life
// in, flying the colours and emblem of whoever holds it. When the town changes hands, its
// banners come down, and the new holders' go up.
//
// Each people's cloth is painted once on a canvas (its colour, a trim, its emblem) and shared by
// all its banners: a crown for the humans, a leaf for the elves, a spider for the dark elves, a sun
// for the cat folk, a serpent for the lizard folk, a skull for the orcs.

import * as THREE from "three";
import { COLOURS } from "../core/war/peoples.js";

// A banner's size (metres): the pole's height, the cloth's width and drop, and how far the cloth
// hangs below the pole's top
const POLE = Object.freeze({ height: 4.2, radius: 0.05 });
const CLOTH = Object.freeze({ width: 0.9, drop: 1.6, below: 0.25 });

// The cloth's picture (pixels) and how its lower edge is cut: a swallowtail
const PICTURE = Object.freeze({ width: 128, height: 224 });

const shade = (hex, by) => {
    const colour = new THREE.Color(hex);

    return `#${colour.multiplyScalar(by).getHexString()}`;
};

// Each people's emblem, drawn in the middle of a cloth `size` pixels across
const EMBLEMS = {
    human(paint, size) {
        // A crown
        paint.beginPath();
        paint.moveTo(-0.34 * size, 0.18 * size);
        paint.lineTo(-0.34 * size, -0.16 * size);
        paint.lineTo(-0.17 * size, 0.02 * size);
        paint.lineTo(0, -0.24 * size);
        paint.lineTo(0.17 * size, 0.02 * size);
        paint.lineTo(0.34 * size, -0.16 * size);
        paint.lineTo(0.34 * size, 0.18 * size);
        paint.closePath();
        paint.fill();
    },
    elf(paint, size) {
        // A leaf, and its stem
        paint.beginPath();
        paint.moveTo(0, -0.34 * size);
        paint.quadraticCurveTo(0.32 * size, -0.05 * size, 0, 0.3 * size);
        paint.quadraticCurveTo(-0.32 * size, -0.05 * size, 0, -0.34 * size);
        paint.fill();
        paint.lineWidth = size * 0.04;
        paint.beginPath();
        paint.moveTo(0, -0.2 * size);
        paint.lineTo(0, 0.4 * size);
        paint.stroke();
    },
    darkElf(paint, size) {
        // A spider: a body, a head and eight legs
        paint.beginPath();
        paint.ellipse(0, 0.06 * size, 0.12 * size, 0.16 * size, 0, 0, Math.PI * 2);
        paint.fill();
        paint.beginPath();
        paint.arc(0, -0.16 * size, 0.08 * size, 0, Math.PI * 2);
        paint.fill();
        paint.lineWidth = size * 0.035;

        for (const side of [-1, 1]) {
            for (let k = 0; k < 4; k++) {
                const y = (-0.08 + k * 0.08) * size;

                paint.beginPath();
                paint.moveTo(0, y);
                paint.lineTo(side * 0.24 * size, y - 0.1 * size + k * 0.03 * size);
                paint.lineTo(side * 0.36 * size, y + 0.04 * size + k * 0.04 * size);
                paint.stroke();
            }
        }
    },
    cat(paint, size) {
        // A sun
        paint.beginPath();
        paint.arc(0, 0, 0.16 * size, 0, Math.PI * 2);
        paint.fill();
        paint.lineWidth = size * 0.045;

        for (let k = 0; k < 12; k++) {
            const angle = (k * Math.PI) / 6;

            paint.beginPath();
            paint.moveTo(Math.cos(angle) * 0.22 * size, Math.sin(angle) * 0.22 * size);
            paint.lineTo(Math.cos(angle) * (k % 2 ? 0.3 : 0.36) * size, Math.sin(angle) * (k % 2 ? 0.3 : 0.36) * size);
            paint.stroke();
        }
    },
    lizard(paint, size) {
        // A serpent, coiled in an S, and its head
        paint.lineWidth = size * 0.09;
        paint.lineCap = "round";
        paint.beginPath();
        paint.moveTo(0.2 * size, 0.32 * size);
        paint.bezierCurveTo(-0.4 * size, 0.2 * size, 0.4 * size, -0.1 * size, -0.12 * size, -0.22 * size);
        paint.stroke();
        paint.beginPath();
        paint.ellipse(-0.16 * size, -0.28 * size, 0.1 * size, 0.07 * size, -0.4, 0, Math.PI * 2);
        paint.fill();
    },
    orc(paint, size, background) {
        // A skull, its eyes and teeth cut from it
        paint.beginPath();
        paint.arc(0, -0.06 * size, 0.24 * size, Math.PI * 0.9, Math.PI * 2.1);
        paint.lineTo(0.16 * size, 0.2 * size);
        paint.lineTo(-0.16 * size, 0.2 * size);
        paint.closePath();
        paint.fill();
        paint.fillStyle = background;

        for (const side of [-1, 1]) {
            paint.beginPath();
            paint.ellipse(side * 0.1 * size, -0.02 * size, 0.06 * size, 0.07 * size, 0, 0, Math.PI * 2);
            paint.fill();
        }

        for (let k = -2; k <= 2; k++) {
            paint.fillRect(k * 0.05 * size - 0.012 * size, 0.12 * size, 0.024 * size, 0.08 * size);
        }
    },
};

/** Paint a people's cloth on a canvas (their colour, a trim, their emblem): the canvas. */
export function paintCloth(people, canvas = document.createElement("canvas")) {
    const { width, height } = PICTURE;
    const colour = COLOURS[people] ?? "#888888";
    const background = shade(colour, 0.55);
    const paint = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    // The cloth, its lower edge cut in a swallowtail, trimmed in the people's colour
    const tail = height * 0.84;

    paint.beginPath();
    paint.moveTo(0, 0);
    paint.lineTo(width, 0);
    paint.lineTo(width, height);
    paint.lineTo(width / 2, tail);
    paint.lineTo(0, height);
    paint.closePath();
    paint.fillStyle = background;
    paint.fill();
    paint.lineWidth = width * 0.08;
    paint.strokeStyle = colour;
    paint.stroke();

    // The emblem
    paint.save();
    paint.translate(width / 2, height * 0.4);
    paint.fillStyle = paint.strokeStyle = shade(colour, 1.25);
    EMBLEMS[people]?.(paint, width, background);
    paint.restore();

    return canvas;
}

// The cloth's shape: a plane hanging from the crossbar, waving a little along its drop
function clothGeometry() {
    const geometry = new THREE.PlaneGeometry(CLOTH.width, CLOTH.drop, 6, 10);
    const position = geometry.attributes.position;

    for (let k = 0; k < position.count; k++) {
        const [x, y] = [position.getX(k), position.getY(k)];
        const down = (CLOTH.drop / 2 - y) / CLOTH.drop;

        position.setZ(k, Math.sin(x * 5 + down * 3) * 0.04 * (0.3 + down));
    }

    geometry.computeVertexNormals();

    return geometry;
}

export class Banners {
    /** @param {THREE.Object3D} parent - What the banners go in (the scene). */
    constructor(parent) {
        this.group = new THREE.Group();
        this.group.name = "banners";
        parent.add(this.group);

        // The pole's and cloth's shapes, and each people's cloth, shared by every banner
        this.pole = new THREE.CylinderGeometry(POLE.radius, POLE.radius * 1.3, POLE.height, 6);
        this.bar = new THREE.CylinderGeometry(POLE.radius * 0.7, POLE.radius * 0.7, CLOTH.width + 0.2, 5);
        this.cloth = clothGeometry();
        this.wood = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.9 });
        this.cloths = new Map();

        /** Each town's banners, by its id: { people, objects }. */
        this.towns = new Map();
    }

    // A people's cloth, painted the first time it's wanted
    #clothOf(people) {
        if (!this.cloths.has(people)) {
            const texture = new THREE.CanvasTexture(paintCloth(people));

            texture.colorSpace = THREE.SRGBColorSpace;
            this.cloths.set(people, new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.85, alphaTest: 0.5, transparent: false }));
        }

        return this.cloths.get(people);
    }

    /**
     * Put up a town's banners: `people` (whose they are: its holders), at each spot ({ x, z (world
     * metres), y (the ground), facing (radians, as the battle has it) }). Any it had come down.
     */
    raise(townId, people, spots) {
        this.lower(townId);

        const objects = spots.map(({ x, y = 0, z, facing }) => {
            const banner = new THREE.Group();
            const pole = new THREE.Mesh(this.pole, this.wood);
            const bar = new THREE.Mesh(this.bar, this.wood);
            const cloth = new THREE.Mesh(this.cloth, this.#clothOf(people));

            pole.position.y = POLE.height / 2;
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, POLE.height - CLOTH.below, 0.02);
            cloth.position.set(0, POLE.height - CLOTH.below - CLOTH.drop / 2, 0.05);

            for (const mesh of [pole, bar, cloth]) {
                mesh.castShadow = true;
            }

            banner.add(pole, bar, cloth);
            banner.position.set(x, y, z);

            // (Its cloth faces the way the guards do: out along the road)
            banner.rotation.y = facing;
            banner.name = `banner:${townId}`;
            this.group.add(banner);

            return banner;
        });

        this.towns.set(townId, { people, objects });
    }

    /** Take a town's banners down. */
    lower(townId) {
        for (const banner of this.towns.get(townId)?.objects ?? []) {
            banner.removeFromParent();
        }

        this.towns.delete(townId);
    }

    /** Take everything away. */
    dispose() {
        for (const id of [...this.towns.keys()]) {
            this.lower(id);
        }

        this.group.removeFromParent();

        for (const geometry of [this.pole, this.bar, this.cloth]) {
            geometry.dispose();
        }

        this.wood.dispose();

        for (const material of this.cloths.values()) {
            material.map.dispose();
            material.dispose();
        }
    }
}
