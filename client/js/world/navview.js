// Debug mode's view of the navigation meshes (core/navigation.js) round the player, laid just over
// the ground: each tile's polygons tinted by how they're walked (open ground green, roads gold,
// steep ground orange, fords blue, bridge decks brown), their edges lighter. Tiles are drawn as
// they're baked (navbaker.js) and let go of when they're out of reach.

import * as THREE from "three";
import { AREA, tileOf } from "../core/navigation.js";

/** How far round the player tiles are shown (metres). */
export const REACH = 80;

const LIFT = 0.12;

const TINTS = {
    [AREA.ground]: new THREE.Color(0.25, 0.85, 0.35),
    [AREA.road]: new THREE.Color(0.95, 0.8, 0.3),
    [AREA.steep]: new THREE.Color(0.95, 0.5, 0.2),
    [AREA.ford]: new THREE.Color(0.3, 0.6, 1),
    [AREA.deck]: new THREE.Color(0.65, 0.45, 0.3),
};
const OTHER = new THREE.Color(0.8, 0.8, 0.8);

export class NavView {
    /**
     * @param {object} navigation - The Navigation shown.
     * @param {object} baker - Its NavBaker (tiles baked as they're wanted).
     */
    constructor(navigation, baker) {
        this.navigation = navigation;
        this.baker = baker;
        this.object = new THREE.Group();
        this.object.name = "navigation";
        this.tiles = new Map();
        this.fill = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
        this.edges = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
        baker.onBaked = (tx, ty) => this.#draw(tx, ty);
    }

    /** Show the tiles round a point (bake those not in yet), and let go of those beyond. */
    around(x, y) {
        const [tx0, ty0] = tileOf(x - REACH, y - REACH);
        const [tx1, ty1] = tileOf(x + REACH, y + REACH);
        const wanted = new Set();

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                wanted.add(`${tx} ${ty}`);

                if (this.navigation.has(tx, ty)) {
                    this.#draw(tx, ty);
                } else {
                    this.baker.bake(tx, ty);
                }
            }
        }

        for (const [key, mesh] of this.tiles) {
            if (!wanted.has(key)) {
                this.#remove(key, mesh);
            }
        }
    }

    // Draw a tile, if it isn't (and has something to walk)
    #draw(tx, ty) {
        const key = `${tx} ${ty}`;

        if (this.tiles.has(key)) {
            return;
        }

        const polygons = this.navigation.polygons(tx, ty);

        if (!polygons) {
            this.tiles.set(key, null);

            return;
        }

        const { positions, areas } = polygons;
        const colours = new Float32Array(positions.length);
        const lines = new Float32Array(positions.length * 2);
        const lineColours = new Float32Array(positions.length * 2);

        for (let v = 1; v < positions.length; v += 3) {
            positions[v] += LIFT;
        }

        for (let t = 0; t < areas.length; t++) {
            const tint = TINTS[areas[t]] ?? OTHER;
            const light = [tint.r * 0.5 + 0.5, tint.g * 0.5 + 0.5, tint.b * 0.5 + 0.5];

            for (let v = 0; v < 3; v++) {
                const [i, j] = [t * 9 + v * 3, t * 9 + ((v + 1) % 3) * 3];

                colours.set([tint.r, tint.g, tint.b], i);
                lines.set(positions.subarray(i, i + 3), (t * 6 + v * 2) * 3);
                lines.set(positions.subarray(j, j + 3), (t * 6 + v * 2 + 1) * 3);
                lineColours.set(light, (t * 6 + v * 2) * 3);
                lineColours.set(light, (t * 6 + v * 2 + 1) * 3);
            }
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

        const outline = new THREE.BufferGeometry();

        outline.setAttribute("position", new THREE.BufferAttribute(lines, 3));
        outline.setAttribute("color", new THREE.BufferAttribute(lineColours, 3));

        const group = new THREE.Group();

        group.add(new THREE.Mesh(geometry, this.fill), new THREE.LineSegments(outline, this.edges));
        group.name = `navigation ${tx} ${ty}`;
        group.userData.tile = [tx, ty];
        this.tiles.set(key, group);
        this.object.add(group);
    }

    #remove(key, group) {
        this.tiles.delete(key);

        if (group) {
            group.removeFromParent();
            group.traverse((node) => node.geometry?.dispose());
        }
    }

    /** How many tiles are drawn, and how many triangles they have. */
    get stats() {
        let triangles = 0;

        for (const group of this.tiles.values()) {
            triangles += group ? group.children[0].geometry.attributes.position.count / 3 : 0;
        }

        return { tiles: [...this.tiles.values()].filter(Boolean).length, triangles };
    }

    dispose() {
        for (const [key, group] of this.tiles) {
            this.#remove(key, group);
        }

        this.fill.dispose();
        this.edges.dispose();
    }
}

