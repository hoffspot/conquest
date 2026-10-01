// Tall grass (terrain plan M7b), thick in clumps and stretches over the open land round the player,
// knee to waist high, green or golden as the land and its patches are (grassmap.js says where, how
// tall and how dry), stirring in the breeze; and the crops in the fields, upright and all of a
// height: drawn on the GPU, so there can be tens of thousands of blades for a few draws and next to
// no work each frame.
// - Each band (near, and far) is one mesh: one clump of blades, drawn once for each cell of a
//   lattice round the player. A clump's cell is its own spot on the land, the lattice wrapping round
//   as the player goes (a clump that falls behind comes round in front, at a new spot), so nothing
//   moves or pops but at the bands' edges; where in its cell it grows, which way its blades lean,
//   how tall each is, all from a hash of its cell, the same every time.
// - The near band's blades are bent in two; the far band's a single triangle each, twice as wide,
//   its clumps a quarter as many; one fades into the other over the near band's last fifth, and
//   the far band sinks into the ground at its own edge. No alpha: Apple's GPUs draw what's behind
//   none of them.
// - The land's heights and the grass's map round the player (a chunk a block of a texture 4
//   chunks a side, wrapping as the player goes) are read in the vertex shader: the blades stand
//   on the ground as it's drawn, its squares split from north-west to south-east.
// - Each quality's (world/view.js QUALITY.grass): how far each band reaches, how far apart its
//   clumps are and how many blades each has; none on low (the undergrowth's tufts alone).

import * as THREE from "three";
import { CHUNK } from "../core/overworld.js";
import { TREE_WIND } from "./art/kits/trees.js";
import { GRASS_UNDER, TALL_GRASS_TEXELS } from "./ground.js";
import { grassMapping } from "./grassmap.js";

// The texture round the player: chunks a side (wrapping), so texels a side (ground.js reads it too)
const BLOCKS = 4;
const TEXELS = BLOCKS * CHUNK;

if (TEXELS !== TALL_GRASS_TEXELS) {
    throw new Error("The tall grass's texture isn't the size the ground reads it at");
}

// Rows of a chunk's grass map worked out in a step (each about a third of a millisecond)
const ROWS = 8;

// How far ahead of the player each band's lattice is centred, the way the camera looks (of its
// reach): what's behind the camera isn't drawn, and the far side of the player is
const AHEAD = 0.35;

/**
 * Each band's: how far it reaches (metres), how far apart its clumps are (metres), how many
 * blades a clump has and how many triangles each blade (1 or 3), and how wide each blade is at its
 * foot (metres).
 */
export const GRASS_BANDS = Object.freeze({
    near: { cell: 0.5, blades: 10, triangles: 3, width: 0.08 },
    far: { cell: 1, blades: 8, triangles: 1, width: 0.16 },
});

// One clump's blades, as the vertex shader builds them: for each corner, which side of its blade
// it's on (-1, 1; 0 at its tip), how far up it (0 to 1), and which blade; and the triangles
// between them (a blade bent in two: its foot's corners, its middle's and its tip; or one
// triangle), so each corner's worked out once
function clumpOf(blades, triangles) {
    const corners = [];
    const index = [];

    for (let b = 0; b < blades; b++) {
        const first = corners.length;

        if (triangles === 1) {
            corners.push([-1, 0, b], [1, 0, b], [0, 1, b]);
            index.push(first, first + 1, first + 2);
        } else {
            corners.push([-1, 0, b], [1, 0, b], [-1, 0.5, b], [1, 0.5, b], [0, 1, b]);
            index.push(first, first + 1, first + 2, first + 1, first + 3, first + 2, first + 2, first + 3, first + 4);
        }
    }

    return { corners: new Float32Array(corners.flat()), index };
}

const VERTEX_FUNCTIONS = `
uniform sampler2D grassHeights;
uniform sampler2D grassMap;
uniform sampler2D grassTint;
uniform vec4 grassLattice;
uniform vec4 grassBand;
uniform vec3 grassShape;
uniform vec2 grassFocus;
uniform float grassTime;
varying vec3 vGrassColour;

// A hash of a cell (and which of its numbers), from 0 to 1
float grassHash(ivec2 cell, int which) {
    uint h = uint(cell.x) * 0x8da6b343u ^ uint(cell.y) * 0xd8163841u ^ uint(which) * 0xcb1ab31fu;
    h ^= h >> 13u;
    h *= 0x5bd1e995u;
    h ^= h >> 15u;
    return float(h >> 8u) / 16777216.0;
}

// The ground's height at a point (metres), between the corners round it as the ground's drawn
float grassGround(vec2 p) {
    ivec2 i = ivec2(floor(p));
    vec2 f = p - floor(p);
    float nw = texelFetch(grassHeights, i & ${TEXELS - 1}, 0).r;
    float ne = texelFetch(grassHeights, (i + ivec2(1, 0)) & ${TEXELS - 1}, 0).r;
    float sw = texelFetch(grassHeights, (i + ivec2(0, 1)) & ${TEXELS - 1}, 0).r;
    float se = texelFetch(grassHeights, (i + ivec2(1, 1)) & ${TEXELS - 1}, 0).r;
    return f.x >= f.y ? nw + (ne - nw) * f.x + (se - ne) * f.y : nw + (sw - nw) * f.y + (se - sw) * f.x;
}
`;

const VERTEX_BODY = `
// (This clump's cell: the lattice's own cell of the land its instance stands for now)
float cells = grassLattice.w;
vec2 local = vec2(float(gl_InstanceID % int(cells)), float(gl_InstanceID / int(cells)));
vec2 corner = grassLattice.xy - floor(cells * 0.5);
vec2 cellAt = corner + mod(local - corner, cells);
ivec2 cell = ivec2(cellAt);
vec2 centre = (cellAt + 0.5 + (vec2(grassHash(cell, 0), grassHash(cell, 1)) - 0.5) * 0.8) * grassLattice.z;
vec4 grass = texelFetch(grassMap, ivec2(floor(centre)) & ${TEXELS - 1}, 0);
float away = distance(centre, grassFocus);

// (Whether it grows here: as thick as the map says, and as its band has it there)
float fadeIn = grassBand.x < 0.0 ? 1.0 : smoothstep(grassBand.x, grassBand.y, away);
float fadeOut = 1.0 - smoothstep(grassBand.z, grassBand.w, away);
float present = grassShape.z > 0.5 ? fadeIn : fadeIn * fadeOut;
float shrink = grassShape.z > 0.5 ? fadeOut : 1.0;
bool grows = grassHash(cell, 2) < grass.r * 1.3 && grassHash(cell, 3) < present;

// (Each blade: somewhere in its clump, facing its own way, its own height, leaning out from the
// clump's middle and with the breeze; a crop's, sown, all much of a height and upright)
float sown = step(0.5, grass.a);
int blade = int(position.z);
float angle = grassHash(cell, 7 + blade * 4) * 6.2832;
vec2 foot = centre + vec2(cos(angle), sin(angle)) * sqrt(grassHash(cell, 8 + blade * 4)) * grassLattice.z * 0.6;
float tall = grass.g * 2.0 * shrink * mix(0.6 + 0.75 * grassHash(cell, 9 + blade * 4), 0.9 + 0.2 * grassHash(cell, 9 + blade * 4), sown);
float facing = grassHash(cell, 10 + blade * 4) * 6.2832;
vec2 across = vec2(cos(facing), sin(facing));
vec2 outward = foot - centre;
outward = dot(outward, outward) > 1e-6 ? normalize(outward) : across.yx;
float gust = 0.55 * sin(grassTime * 1.3 + dot(foot, vec2(0.071, 0.043))) + 0.45 * sin(grassTime * 2.9 + dot(foot, vec2(-0.21, 0.17)));
vec2 lean = (outward * mix(0.3, 0.06, sown) + vec2(0.8, 0.45) * (0.12 + 0.16 * gust)) * tall;
float up = position.y;
float width = grassShape.x * (1.0 - 0.8 * up) * (0.7 + 0.6 * grassHash(cell, 11));
vec2 at = foot + across * position.x * width * 0.5 + lean * up * up;
vec3 transformed = grows && tall > 0.02
    ? vec3(at.x, grassGround(foot) - 0.05 + tall * up * (1.0 - 0.18 * up * up), at.y)
    : vec3(centre.x, -1000.0, centre.y);

// (Its colour: its tips' as the map has them, darker down to its foot; each clump a little greener
// or drier than the next, each blade a little lighter or darker)
vec3 tip = texelFetch(grassTint, ivec2(floor(centre)) & ${TEXELS - 1}, 0).rgb;
tip = pow(tip, vec3(2.2));
float turn = grassHash(cell, 12) - 0.5;
tip = mix(tip, turn > 0.0 ? vec3(0.62, 0.45, 0.12) : tip * vec3(0.7, 0.95, 0.6), abs(turn) * mix(0.5, 0.12, sown));
vGrassColour = mix(tip * vec3(0.32, 0.36, 0.26), tip, smoothstep(0.0, 1.0, up)) * (0.8 + 0.4 * grassHash(cell, 13 + blade * 4));
`;

/**
 * The tall grass: `object` to add to the scene; `update(x, z)` each frame (where the player is,
 * metres: the texture filled round them, the bands following them), `setQuality(bands)` as the
 * quality changes (QUALITY's `grass`, or null for none).
 */
export class TallGrass {
    /**
     * @param {object} overworld - The overworld (core/overworld.js), its chunks read for the map.
     * @param {object} [options]
     * @param {Function} [options.ready] - Whether a chunk (cx, cy) is drawn yet (its grass worked
     *     out once it and the eight round it are; until then, none there).
     */
    constructor(overworld, { ready = () => true } = {}) {
        this.overworld = overworld;
        this.ready = ready;
        this.object = new THREE.Group();
        this.object.name = "tall grass";
        this.heights = new THREE.DataTexture(new Float32Array(TEXELS * TEXELS), TEXELS, TEXELS, THREE.RedFormat, THREE.FloatType);
        this.map = new THREE.DataTexture(new Uint8Array(TEXELS * TEXELS * 4), TEXELS, TEXELS, THREE.RGBAFormat);
        this.tint = new THREE.DataTexture(new Uint8Array(TEXELS * TEXELS * 4), TEXELS, TEXELS, THREE.RGBAFormat);

        // (Read texel by texel by the grass; the map and colours read smoothly, wrapping, by the
        // ground under it)
        for (const texture of [this.heights, this.map, this.tint]) {
            const smooth = texture !== this.heights;

            texture.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
            texture.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.generateMipmaps = false;
            texture.flipY = false;
        }

        GRASS_UNDER.map.value = this.map;
        GRASS_UNDER.tint.value = this.tint;

        // Which chunk each block holds (its key, or null), and the one being worked out (a step at a
        // time: its generator)
        this.blocks = new Array(BLOCKS * BLOCKS).fill(null);
        this.working = null;
        this.focus = new THREE.Vector2();
        this.bands = [];
        this.quality = undefined;
    }

    /** How the bands are drawn (QUALITY's `grass`: { near, far } metres, or null for none). */
    setQuality(reach) {
        const key = reach ? `${reach.near} ${reach.far}` : "none";

        if (key === this.quality) {
            return;
        }

        this.quality = key;

        for (const band of this.bands) {
            this.object.remove(band.mesh);
            band.mesh.geometry.dispose();
            band.mesh.material.dispose();
        }

        GRASS_UNDER.reach.value = reach ? reach.far : 0;
        this.bands = reach
            ? [
                  this.#band(GRASS_BANDS.near, reach.near, [-1, 0, reach.near * 0.8, reach.near], false),
                  this.#band(GRASS_BANDS.far, reach.far, [reach.near * 0.8, reach.near, reach.far * 0.78, reach.far], true),
              ]
            : [];

        for (const band of this.bands) {
            this.object.add(band.mesh);
        }
    }

    // A band: its clump drawn once for each cell of its lattice, as far out as `reach`
    #band(shape, reach, fades, shrinks) {
        const cells = Math.ceil((2 * reach) / shape.cell) + 1;
        const geometry = new THREE.InstancedBufferGeometry();

        const clump = clumpOf(shape.blades, shape.triangles);

        geometry.setAttribute("position", new THREE.BufferAttribute(clump.corners, 3));
        geometry.setIndex(clump.index);
        geometry.instanceCount = cells * cells;

        const uniforms = {
            grassHeights: { value: this.heights },
            grassMap: { value: this.map },
            grassTint: { value: this.tint },
            grassLattice: { value: new THREE.Vector4(0, 0, shape.cell, cells) },
            grassBand: { value: new THREE.Vector4(...fades) },
            grassShape: { value: new THREE.Vector3(shape.width, 0, shrinks ? 1 : 0) },
            grassFocus: { value: this.focus },
            grassTime: TREE_WIND.time,
        };
        const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });

        material.name = "tall grass";
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\n${VERTEX_FUNCTIONS}`)
                .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
                .replace("#include <begin_vertex>", VERTEX_BODY);
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", "#include <common>\nvarying vec3 vGrassColour;")
                .replace("#include <color_fragment>", "diffuseColor.rgb *= vGrassColour;")
                // (Both sides lit alike, as if facing up)
                .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal *= faceDirection;");
        };
        material.customProgramCacheKey = () => "tall grass";

        const mesh = new THREE.Mesh(geometry, material);

        mesh.name = "tall grass";
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = true;

        return { mesh, uniforms, cell: shape.cell, ahead: reach * AHEAD };
    }

    /**
     * Each frame: follow the player (x, z metres), each band's lattice a little ahead of them the
     * way the camera looks (`look`: [x, z], a unit, or none), so few of its clumps are behind it;
     * and work out the grass's map round them for no longer than `budget` milliseconds.
     */
    update(x, z, budget = 2, look = [0, 0]) {
        this.focus.set(x, z);
        GRASS_UNDER.focus.value.set(x, z);

        for (const { uniforms, cell, ahead } of this.bands) {
            uniforms.grassLattice.value.x = Math.floor((x + look[0] * ahead) / cell);
            uniforms.grassLattice.value.y = Math.floor((z + look[1] * ahead) / cell);
        }

        if (this.bands.length) {
            this.#fill(x, z, performance.now() + budget);
        }
    }

    // The chunks round the player (the nine nearest) put in their blocks, a step at a time
    #fill(x, z, until) {
        const [pcx, pcy] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

        while (performance.now() < until) {
            if (!this.working) {
                const next = this.#wanted(pcx, pcy);

                if (!next) {
                    return;
                }

                this.working = { ...next, steps: this.#work(next.cx, next.cy, next.slot) };
            }

            if (this.working.steps.next().done) {
                this.working = null;
            }
        }
    }

    // The nearest of the nine chunks round (pcx, pcy) that's drawn, with the eight round it (the
    // grass at its edges gathers round what stands across them, and along the ways), but not in its
    // block yet
    #wanted(pcx, pcy) {
        let best = null;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const [cx, cy] = [pcx + dx, pcy + dy];
                const slot = (((cy % BLOCKS) + BLOCKS) % BLOCKS) * BLOCKS + (((cx % BLOCKS) + BLOCKS) % BLOCKS);

                if (this.blocks[slot] !== `${cx},${cy}` && this.#readyRound(cx, cy) && (!best || dx * dx + dy * dy < best.far)) {
                    best = { cx, cy, slot, far: dx * dx + dy * dy };
                }
            }
        }

        return best;
    }

    // Whether a chunk and the eight round it are drawn
    #readyRound(cx, cy) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!this.ready(cx + dx, cy + dy)) {
                    return false;
                }
            }
        }

        return true;
    }

    // Put a chunk's map in its block: none there while it's worked out, then it all at once
    *#work(cx, cy, slot) {
        const [bx, by] = [(slot % BLOCKS) * CHUNK, Math.floor(slot / BLOCKS) * CHUNK];

        this.blocks[slot] = null;

        for (let j = 0; j < CHUNK; j++) {
            this.map.image.data.fill(0, ((by + j) * TEXELS + bx) * 4, ((by + j) * TEXELS + bx + CHUNK) * 4);
        }

        this.map.needsUpdate = true;
        yield;

        const chunk = this.overworld.chunk(cx, cy);
        const made = yield* grassMapping(this.overworld, chunk, ROWS);

        for (let j = 0; j < CHUNK; j++) {
            const row = (by + j) * TEXELS + bx;

            this.heights.image.data.set(made.heights.subarray(j * CHUNK, (j + 1) * CHUNK), row);
            this.map.image.data.set(made.map.subarray(j * CHUNK * 4, (j + 1) * CHUNK * 4), row * 4);
            this.tint.image.data.set(made.tint.subarray(j * CHUNK * 4, (j + 1) * CHUNK * 4), row * 4);
        }

        this.heights.needsUpdate = true;
        this.map.needsUpdate = true;
        this.tint.needsUpdate = true;
        this.blocks[slot] = `${cx},${cy}`;
    }

    dispose() {
        this.setQuality(null);
        GRASS_UNDER.map.value = null;
        GRASS_UNDER.tint.value = null;
        this.heights.dispose();
        this.map.dispose();
        this.tint.dispose();
    }
}
