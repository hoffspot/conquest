// What's seen from afar round the player, out to the far land's edge (the terrain plan's §9 rows 2
// and 8): settlements and the peoples' great places as boxes, roofs, columns and cones in their
// colours (shapes.js), the trees as cards turned to the camera (trees.js), and the rivers as
// ribbons of water (rivers.js); worked out off the page's thread (silhouette-worker.js) as the
// player goes. Each drawn twice (view.js setHorizon): with the far land, and with the near world,
// so where the near world's own buildings and trees fade out (fog.js FADE) these fade in, a few
// pixels at a time the other way round, and the one turns into the other. The rivers only with the
// far land: the water nearer goes on to where it starts, looking as they do (water.js STILL_WATER).

import * as THREE from "three";
import { SKY_GLOW } from "../daytime.js";
import { GRADE } from "../fog.js";
import { STILL_WATER, WATER } from "../water.js";
import { gatherSilhouettes } from "./gather.js";
import { FAR_RIVERS, gatherRivers } from "./rivers.js";
import { CARD_FLOATS, gatherTrees, treeCards } from "./trees.js";

/** How far the player walks (metres) before what's round them is worked out again. */
export const RESHAPE = 160;

/**
 * From how near the trees and rivers are drawn (metres: a little short of where the near world's
 * fade out, since these fade in there).
 */
export const FAR_NATURE = Object.freeze({ from: 100 });

// (Drawn a little towards the eye, the more the further off: the far land's coarser than the
// ground these lie on, and would hide them)
const TOWARDS = "mvPosition.xyz *= 1.0 - min(0.03, 0.006 + 0.6 / max(1.0, - mvPosition.z));";

const TREE_VERTEX = `
#include <fog_pars_vertex>
attribute vec2 corner;
attribute vec3 look;
attribute vec3 tint;
uniform vec3 sunDirection;
varying vec2 vAt;
varying float vForm;
varying vec3 vTint;
varying float vSun;
void main() {
    // (The card turned about its upright to face the camera: across, the camera's right, level;
    // its tree's foot its position)
    vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
    vec3 world = position + right * corner.x * look.y * look.x + vec3(0.0, corner.y * look.x - 0.3, 0.0);
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    ${TOWARDS}
    gl_Position = projectionMatrix * mvPosition;
    vAt = corner;
    vForm = look.z;
    vTint = tint;
    vSun = dot(right, normalize(sunDirection));
    #include <fog_vertex>
}`;

// Each crown's outline: round (an ellipse high on its trunk), oval (taller), a cone (from the
// ground), a pine's (an ellipse at the top of a bare trunk), flat (a wide, thin ellipse on top);
// its edge ragged; lit from above and from the sun's side; the trunk under it
const TREE_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
varying vec2 vAt;
varying float vForm;
varying vec3 vTint;
varying float vSun;
uniform vec3 skyGlow;
float ragged(vec2 p) {
    return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
    vec2 p = vec2(vAt.x * 2.0, vAt.y);
    vec2 middle = vec2(0.0, 0.62);
    vec2 radii = vec2(1.0, 0.4);
    if (vForm > 0.5 && vForm < 1.5) { middle = vec2(0.0, 0.56); radii = vec2(1.0, 0.46); }
    if (vForm > 2.5 && vForm < 3.5) { middle = vec2(0.0, 0.76); radii = vec2(0.95, 0.24); }
    if (vForm > 3.5) { middle = vec2(0.0, 0.84); radii = vec2(1.0, 0.15); }
    float edge = 0.16 * (ragged(p * vec2(7.0, 11.0) + vForm * 3.1) - 0.5);
    vec2 q = (p - middle) / radii;
    float inside = length(q) - edge;
    if (vForm > 1.5 && vForm < 2.5) {
        float across = 1.0 - (p.y - 0.06) / 0.94;
        q = vec2(p.x / max(across, 0.05), (p.y - 0.45) * 2.2);
        inside = p.y > 0.06 ? abs(p.x) / max(across, 0.001) - edge : 2.0;
    }
    bool trunk = abs(p.x) < 0.08 && p.y < middle.y;
    if (inside > 1.0 && !trunk) discard;
    vec3 colour = vec3(0.1, 0.075, 0.05);
    if (inside <= 1.0) {
        float lit = 0.72 + 0.18 * clamp(q.y, -1.0, 1.0) + 0.16 * vSun * clamp(q.x, -1.0, 1.0);
        colour = vTint * lit * 1.15;
    }
    // (As the sky's light is: dark at night)
    gl_FragColor = vec4(colour * skyGlow, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`;

// The rivers' material: still water as it's seen from afar (water.js STILL_WATER), as deep as a
// river (FAR_RIVERS), over a river's bed (wet), drawn a little towards the eye
function riverMaterial() {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, name: "far rivers" });
    const bed = new THREE.Color(WATER.bed).multiplyScalar(FAR_RIVERS.wet);

    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
${TOWARDS}
gl_Position = projectionMatrix * mvPosition;`);
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
${STILL_WATER.pars}`)
            .replace("#include <map_fragment>", `stillWet = 1.0;
diffuseColor.rgb = stillWater(vec3(${bed.toArray().map((v) => v.toFixed(4)).join(", ")}), ${FAR_RIVERS.depth.toFixed(1)}, ${STILL_WATER.up});`)
            .replace("#include <opaque_fragment>", `${STILL_WATER.reflected}
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => "far rivers";

    return material;
}

// A material of the trees', in the haze, fading in where the near world fades out
function natureMaterial(name, vertexShader, fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
        name,
        vertexShader,
        fragmentShader,
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms, skyGlow: SKY_GLOW, toneGrade: GRADE },
        defines: { FAR_FADE_IN: "" },
        fog: true,
    });
}

export class Silhouettes {
    /**
     * @param {object} plan - The world plan.
     * @param {object} options
     * @param {number} options.reach - How far round the player (metres): the far land's reach.
     * @param {number} [options.trees] - How far round the player trees are seen (metres; none: 0).
     * @param {object} [options.start] - The start town as the game laid it out: { id (its place's),
     *     pieces (its layout's), origin ([x, z]: where its layout starts in the world), width,
     *     height (metres: where no trees grow) }.
     * @param {THREE.Vector3} [options.sun] - Which way the sun shines from (the view's).
     */
    constructor(plan, { reach, trees = 0, start = null, sun = new THREE.Vector3(-0.55, 1, 0.65) }) {
        this.plan = plan;
        this.reach = reach;
        this.treeReach = trees;
        this.start = start;
        this.town = start?.width ? [start.origin[0] - 3, start.origin[1] - 3, start.origin[0] + start.width + 3, start.origin[1] + start.height + 3] : null;
        this.asked = null;
        this.id = 0;
        this.layouts = new Map();

        // What's built
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.MeshLambertMaterial({ vertexColors: true, name: "silhouettes" });
        this.material.defines = { FAR_FADE_IN: "" };

        // The trees: a card each, all in one mesh (trees.js treeCards)
        this.trees = new THREE.BufferGeometry();
        this.treeCount = 0;
        this.treeMaterial = natureMaterial("far trees", TREE_VERTEX, TREE_FRAGMENT, { sunDirection: { value: sun } });

        // The rivers
        this.rivers = new THREE.BufferGeometry();
        this.riverMaterial = riverMaterial();

        this.far = new THREE.Group();
        this.near = new THREE.Group();
        this.far.name = "seen from afar";
        this.near.name = "seen from afar (near)";

        for (const group of [this.far, this.near]) {
            group.add(this.#mesh("silhouettes", this.geometry, this.material), this.#mesh("far trees", this.trees, this.treeMaterial));
        }

        this.far.add(this.#mesh("far rivers", this.rivers, this.riverMaterial));

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

    /** How many triangles it draws (the far copy): what's built, the trees, the rivers. */
    get triangles() {
        return (this.geometry.getAttribute("position")?.count ?? 0) / 3 + this.treeCount * 2 + (this.rivers.getAttribute("position")?.count ?? 0) / 3;
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

        const ask = { id: ++this.id, x, z, reach: this.reach, trees: this.treeReach, from: FAR_NATURE.from, town: this.town, settled: [...settled].map(([id, { x: sx, y, facing }]) => [id, { x: sx, y, facing }]) };

        this.asked = ask;

        if (this.worker) {
            this.worker.postMessage(ask);
        } else {
            const { shapes, done } = gatherSilhouettes(this.plan, { ...ask, settled: new Map(ask.settled), layouts: this.layouts, start: this.start });
            const trees = treeCards(ask.trees > 0 ? gatherTrees(this.plan, { x, z, reach: ask.trees, from: ask.from, town: ask.town }) : new Float32Array(0));
            const rivers = gatherRivers(this.plan, { x, z, reach: ask.reach, from: ask.from });

            this.#take({ id: ask.id, positions: Float32Array.from(shapes.positions), normals: Float32Array.from(shapes.normals), colours: Float32Array.from(shapes.colours), trees, rivers, done });
        }
    }

    // What's been worked out: into the meshes (but for an older ask's)
    #take({ id, positions, normals, colours, trees, rivers }) {
        if (id !== this.id) {
            return;
        }

        this.geometry.dispose();
        this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
        this.geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

        if (trees) {
            const corners = new THREE.InterleavedBuffer(trees.vertices, CARD_FLOATS);

            this.trees.dispose();
            this.trees.setAttribute("position", new THREE.InterleavedBufferAttribute(corners, 3, 0));
            this.trees.setAttribute("corner", new THREE.InterleavedBufferAttribute(corners, 2, 3));
            this.trees.setAttribute("look", new THREE.InterleavedBufferAttribute(corners, 3, 5));
            this.trees.setAttribute("tint", new THREE.InterleavedBufferAttribute(corners, 3, 8));
            this.trees.setIndex(new THREE.BufferAttribute(trees.index, 1));
            this.treeCount = trees.index.length / 6;
        }

        if (rivers) {
            this.rivers.dispose();
            this.rivers.setAttribute("position", new THREE.BufferAttribute(rivers, 3));
        }

        for (const group of [this.far, this.near]) {
            const [built, wood, water = null] = group.children;

            built.visible = positions.length > 0;
            wood.visible = this.treeCount > 0;

            if (water) {
                water.visible = (this.rivers.getAttribute("position")?.count ?? 0) > 0;
            }
        }
    }

    #mesh(name, geometry, material) {
        const mesh = new THREE.Mesh(geometry, material);

        mesh.name = name;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;

        return mesh;
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;

        for (const thing of [this.geometry, this.material, this.trees, this.treeMaterial, this.rivers, this.riverMaterial]) {
            thing.dispose();
        }
    }
}
