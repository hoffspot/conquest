// Debug mode's view of the navigation meshes (core/navigation.js) round the player, laid just over
// the ground: each tile's polygons tinted by how they're walked (open ground green, roads gold,
// steep ground orange, fords blue, bridge decks brown), their edges lighter. The polygons are where
// a walker's middle can be, kept its radius from walls and drops; round their outer edges a paler
// band as wide as that radius shows where its body reaches (Recast's demo, Unity's, Unreal's and
// Godot's views draw the same polygons), so on a plank walk or by a lamp post the two together
// should fill what's drawn to its edges, and anything they don't is ground the mesh has lost.
// Tiles are drawn as they're baked (navbaker.js) and let go of when they're out of reach.

import * as THREE from "three";
import { AREA, tileOf } from "../core/navigation.js";

/** How far round the player tiles are shown (metres). */
export const REACH = 80;

const LIFT = 0.12;

// How finely the band's rounded corners are drawn (radians a step)
const ROUND = Math.PI / 8;

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
        this.band = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
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

        if (polygons.edges?.length) {
            group.add(new THREE.Mesh(bandOf(polygons, this.navigation.measures.radius), this.band));
        }
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
        this.band.dispose();
    }
}

// The band round a tile's polygons (Navigation.polygons: their outer edges, and which way is out
// of each) where a walker's body reaches, `radius` wide: a strip out from each edge, and at each
// corner turning in, the round between its two edges' strips
function bandOf({ edges, sides }, radius) {
    const positions = [];
    const colours = [];
    const count = sides.length;
    const key = (x, z) => `${x.toFixed(2)} ${z.toFixed(2)}`;
    const starting = new Map();
    const lightOf = (area) => {
        const tint = TINTS[area] ?? OTHER;

        return [tint.r * 0.4 + 0.6, tint.g * 0.4 + 0.6, tint.b * 0.4 + 0.6];
    };
    const triangle = (points, light) => {
        for (const [x, y, z] of points) {
            positions.push(x, y + LIFT, z);
            colours.push(...light);
        }
    };

    for (let e = 0; e < count; e++) {
        starting.set(key(edges[e * 8], edges[e * 8 + 2]), e);
    }

    for (let e = 0; e < count; e++) {
        const [ax, ay, az, bx, by, bz, nx, nz] = edges.subarray(e * 8, e * 8 + 8);
        const light = lightOf(sides[e]);
        const [ox, oz] = [nx * radius, nz * radius];

        triangle([[ax, ay, az], [bx, by, bz], [bx + ox, by, bz + oz]], light);
        triangle([[ax, ay, az], [bx + ox, by, bz + oz], [ax + ox, ay, az + oz]], light);

        // (Its end, where the next edge starts: round the corner between their strips, if the
        // mesh turns in there)
        const next = starting.get(key(bx, bz));

        if (next === undefined) {
            continue;
        }

        const [mx, mz] = [edges[next * 8 + 6], edges[next * 8 + 7]];
        const [dx, dz] = [edges[next * 8 + 3] - bx, edges[next * 8 + 5] - bz];

        if (nx * dx + nz * dz >= 0) {
            continue;
        }

        const from = Math.atan2(nz, nx);
        const turn = Math.atan2(nx * mz - nz * mx, nx * mx + nz * mz);
        const steps = Math.max(1, Math.ceil(Math.abs(turn) / ROUND));

        for (let k = 0; k < steps; k++) {
            const [p, q] = [from + (turn * k) / steps, from + (turn * (k + 1)) / steps];

            triangle([[bx, by, bz], [bx + Math.cos(p) * radius, by, bz + Math.sin(p) * radius], [bx + Math.cos(q) * radius, by, bz + Math.sin(q) * radius]], light);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(positions), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(Float32Array.from(colours), 3));

    return geometry;
}

