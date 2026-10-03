// The far land: the ground past the chunks round the player (world/chunks3d.js), out to the
// horizon, drawn coarse and hazy behind them (view.js draws it first, with its own camera, and the
// near world over it). Levels of ground, each twice as coarse and twice as wide as the one inside
// it (levels.js), each a square of 64 by 64 cells round the player, moved on as they walk, its
// ground worked out afresh off the page's thread (far-worker.js; on the page where there are no
// workers). Each is lifted out of sight where the one inside it is drawn, and all of them round the
// player, where the chunks' ground is (ground.js).

import * as THREE from "three";
import { groundMaterial } from "../ground.js";
import { FAR, middleOf, reachOf, sampleLevel, spacingOf } from "./levels.js";

// A level's square (its corners moved and its triangles split as its ground is worked out: #take)
function levelGeometry() {
    const count = FAR.cells + 1;
    const geometry = new THREE.BufferGeometry();

    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(FAR.cells * FAR.cells * 6), 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * count * 3), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * count * 3), 3));
    geometry.setAttribute("farWater", new THREE.BufferAttribute(new Float32Array(count * count), 1));

    return geometry;
}

export class FarLand {
    /**
     * @param {object} plan - The world plan.
     * @param {object} options
     * @param {THREE.Texture} options.land - The lands' colours (ground.js landColours), as the
     *     chunks' ground has them.
     * @param {number} options.levels - How many levels (levels.js FAR_LEVELS).
     */
    constructor(plan, { land, levels }) {
        this.plan = plan;
        this.object = new THREE.Group();
        this.object.name = "far land";

        /** Round the player (x, z, radius): where it's not drawn, the chunks' ground being. */
        this.hole = { value: new THREE.Vector3(0, 0, FAR.hole) };

        this.levels = Array.from({ length: levels }, (_, level) => {
            const inner = { value: new THREE.Vector4(1, 1, -1, -1) };
            const mesh = new THREE.Mesh(levelGeometry(), groundMaterial({ land, far: { hole: this.hole, inner } }));

            mesh.name = `far land ${level}`;
            mesh.visible = false;
            mesh.frustumCulled = false;
            mesh.matrixAutoUpdate = false;
            // (Finest first: what's under it is hidden by it, not drawn over)
            mesh.renderOrder = level;
            this.object.add(mesh);

            return { level, mesh, inner, asked: null, middle: null };
        });

        this.worker = null;

        if (typeof Worker !== "undefined") {
            try {
                this.worker = new Worker(new URL("./far-worker.js", import.meta.url), { type: "module" });
                this.worker.onmessage = ({ data }) => this.#take(data);
                this.worker.onerror = () => {
                    this.worker?.terminate();
                    this.worker = null;
                };
                this.worker.postMessage({ plan: { ...plan } });
            } catch {
                this.worker = null;
            }
        }
    }

    /** How many triangles it draws (at most). */
    get triangles() {
        return this.levels.length * FAR.cells * FAR.cells * 2;
    }

    /**
     * The player's at (x, z) (metres): the levels moved on round them where they've moved far
     * enough, and the hole round them with them.
     */
    update(x, z) {
        this.hole.value.x = x;
        this.hole.value.y = z;

        for (const each of this.levels) {
            const middle = middleOf(each.level, x, z);

            if (each.asked?.[0] === middle[0] && each.asked?.[1] === middle[1]) {
                continue;
            }

            each.asked = middle;

            if (this.worker) {
                this.worker.postMessage({ level: each.level, middle });
            } else {
                this.#take(sampleLevel(this.plan, each.level, middle));
            }
        }
    }

    // A level's ground worked out: into its mesh, and the next level out lifted out of sight inside it
    #take({ level, middle, heights, depth, normals, indices }) {
        const each = this.levels[level];

        if (!each || each.asked?.[0] !== middle[0] || each.asked?.[1] !== middle[1]) {
            return;
        }

        const { geometry } = each.mesh;
        const position = geometry.getAttribute("position");
        const count = FAR.cells + 1;
        const [step, reach] = [spacingOf(level), reachOf(level)];

        for (let j = 0; j < count; j++) {
            for (let i = 0; i < count; i++) {
                const k = j * count + i;

                position.setXYZ(k, i * step - reach, heights[k], j * step - reach);
            }
        }

        geometry.getAttribute("normal").array.set(normals);
        geometry.getAttribute("farWater").array.set(depth);
        geometry.index.array.set(indices);
        geometry.index.needsUpdate = true;

        for (const name of ["position", "normal", "farWater"]) {
            geometry.getAttribute(name).needsUpdate = true;
        }

        each.middle = middle;
        each.mesh.position.set(middle[0], 0, middle[1]);
        each.mesh.updateMatrix();
        each.mesh.updateMatrixWorld();
        each.mesh.visible = true;

        // (The next level out: lifted out of sight inside this one, all but its edge, where they meet)
        const outer = this.levels[level + 1];

        if (outer) {
            const margin = spacingOf(level + 1) / 2;

            outer.inner.value.set(middle[0] - reach + margin, middle[1] - reach + margin, middle[0] + reach - margin, middle[1] + reach - margin);
        }
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;

        for (const { mesh } of this.levels) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }
}
