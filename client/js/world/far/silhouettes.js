// What's built round the player out to the far land's edge, seen from afar (the terrain plan's §9
// row 2): settlements and the peoples' great places as boxes, roofs, columns and cones in their
// colours (shapes.js), worked out off the page's thread (silhouette-worker.js) as the player goes,
// in one mesh. Drawn twice (view.js setHorizon): with the far land, and with the near world, so
// where the near world's own buildings fade out (fog.js FADE) these fade in, a few pixels at a
// time the other way round, and the one turns into the other.

import * as THREE from "three";
import { gatherSilhouettes } from "./gather.js";

/** How far the player walks (metres) before what's round them is worked out again. */
export const RESHAPE = 160;

export class Silhouettes {
    /**
     * @param {object} plan - The world plan.
     * @param {object} options
     * @param {number} options.reach - How far round the player (metres): the far land's reach.
     * @param {object} [options.start] - The start town as the game laid it out: { id (its place's),
     *     pieces (its layout's), origin ([x, z]: where its layout starts in the world) }.
     */
    constructor(plan, { reach, start = null }) {
        this.plan = plan;
        this.reach = reach;
        this.start = start;
        this.asked = null;
        this.id = 0;
        this.layouts = new Map();

        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.MeshLambertMaterial({ vertexColors: true, name: "silhouettes" });
        this.material.defines = { FAR_FADE_IN: "" };
        this.far = this.#mesh("silhouettes");
        this.near = this.#mesh("silhouettes (near)");

        this.worker = null;

        if (typeof Worker !== "undefined") {
            try {
                this.worker = new Worker(new URL("./silhouette-worker.js", import.meta.url), { type: "module" });
                this.worker.onmessage = ({ data }) => this.#take(data);
                this.worker.onerror = () => {
                    this.worker?.terminate();
                    this.worker = null;
                };
                this.worker.postMessage({ plan: { ...plan }, start });
            } catch {
                this.worker = null;
            }
        }
    }

    /** How many triangles it draws (each copy). */
    get triangles() {
        return (this.geometry.getAttribute("position")?.count ?? 0) / 3;
    }

    /**
     * The player's at (x, z) (metres): what's round them worked out again once they've walked far
     * enough, or once more sites have been set down (`settled`: the overworld's sites, their spots
     * { x, y, facing } by id).
     */
    update(x, z, settled = new Map()) {
        if (this.asked && Math.hypot(x - this.asked.x, z - this.asked.z) < RESHAPE && settled.size === this.asked.settled.length) {
            return;
        }

        const ask = { id: ++this.id, x, z, reach: this.reach, settled: [...settled].map(([id, { x: sx, y, facing }]) => [id, { x: sx, y, facing }]) };

        this.asked = ask;

        if (this.worker) {
            this.worker.postMessage(ask);
        } else {
            const { shapes, done } = gatherSilhouettes(this.plan, { ...ask, settled: new Map(ask.settled), layouts: this.layouts, start: this.start });

            this.#take({ id: ask.id, positions: Float32Array.from(shapes.positions), normals: Float32Array.from(shapes.normals), colours: Float32Array.from(shapes.colours), done });
        }
    }

    // The shapes worked out: into the mesh (but for an older ask's)
    #take({ id, positions, normals, colours }) {
        if (id !== this.id) {
            return;
        }

        this.geometry.dispose();
        this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
        this.geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
        this.geometry.setDrawRange(0, positions.length / 3);
        this.far.visible = this.near.visible = positions.length > 0;
    }

    #mesh(name) {
        const mesh = new THREE.Mesh(this.geometry, this.material);

        mesh.name = name;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;

        return mesh;
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.geometry.dispose();
        this.material.dispose();
    }
}
