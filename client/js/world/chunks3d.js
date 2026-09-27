// The world outside in 3D, a chunk (64 metres square: core/overworld.js) at a time round the
// player, built as they come near and thrown away once they're far off, so that however far they
// walk there's only ever so much of it: no loading screens, only chunks appearing far off in the
// fog, one a frame, the nearest first.
//
// Each chunk has its ground (ground.js: the grass in its land's colours, with roads, fields and
// the town's streets blended in), its water (lakes, the sea and rivers, over their beds), bridges
// where roads cross rivers (straight decks of boards from bank to bank, railed), and its trees (trees.js Woodland: every
// variant kept once, drawn wherever it stands). The town itself is drawn on its own (town3d.js),
// over the chunks it's in.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CHUNK, CHUNKS, WET } from "../core/overworld.js";
import { material } from "./art/engine/materials.js";
import { TREE_WIND, Woodland } from "./art/kits/trees.js";
import { chunkGround, disposeChunkGround, disposeGrass, landColours } from "./ground.js";

/** How many chunks round the player's are drawn (each way), and how far off they're let go. */
export const REACH = Object.freeze({ drawn: 2, kept: 3 });

// Water: how high over the ground it lies (metres), its colour and how much it shows (the rest
// the bed under it), and its mask's texels per metre
const WATER = Object.freeze({ level: 0.03, colour: 0x2d5a6e, shallows: 0x5f8a86, opacity: 0.86, resolution: 1 });

/** Bridges' decks: how high their tops are over the ground (metres: those on them stand there), and how thick. */
export const DECK = Object.freeze({ top: 0.16, depth: 0.14 });

// Their rails: how high (over the deck), how thick, their posts' thickness, and about how far
// apart the posts are (metres)
const RAIL = Object.freeze({ height: 0.95, thick: 0.1, post: 0.14, every: 1.8 });

const key = (cx, cy) => cy * CHUNKS + cx;

export class Chunks {
    /**
     * @param {object} world - From buildWorld (core/overworld.js): its `maps.town` the world
     *     outside, and its plan.
     */
    constructor(world) {
        this.world = world;
        this.overworld = world.maps.town;
        this.land = landColours(world.plan);
        this.woodland = new Woodland();

        /** Everything drawn: add it to the scene. */
        this.object = new THREE.Group();
        this.object.name = "chunks";
        this.primer = primer();
        this.object.add(this.woodland.object, this.primer);

        // The chunks drawn, by key: { cx, cy, object, trees (their lot), heights }
        this.drawn = new Map();
        this.centre = null;
        this.wanted = [];

        /** Bumped whenever a chunk is drawn or thrown away (to know when what's drawn changes). */
        this.version = 0;
    }

    /** Draw every chunk within `reach` of a point (metres) at once (when the game starts). */
    fill(x, z, reach = REACH.drawn) {
        this.#aim(x, z);

        for (const [cx, cy] of this.wanted) {
            if (Math.max(Math.abs(cx - this.centre[0]), Math.abs(cy - this.centre[1])) <= reach) {
                this.#draw(cx, cy);
            }
        }
    }

    /**
     * Each frame, with the player at a point (metres): draw the nearest chunk they're near that
     * isn't drawn yet (at most one a frame), and throw away those they've left far behind.
     * Returns whether anything changed.
     */
    update(x, z) {
        let changed = this.#aim(x, z);
        const next = this.wanted.find(([cx, cy]) => !this.drawn.has(key(cx, cy)));

        if (next) {
            this.#draw(...next);
            changed = true;
        }

        return changed;
    }

    /** How high whatever stands on a square is (the trees: metres, 0 for nothing). */
    heightAt(x, z) {
        const drawn = this.drawn.get(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));

        if (!drawn) {
            return 0;
        }

        return drawn.heights[(Math.floor(z) - drawn.cy * CHUNK) * CHUNK + (Math.floor(x) - drawn.cx * CHUNK)] ?? 0;
    }

    /** The trees of the chunks drawn: [{ x, z }] (their trunks, metres). */
    trees() {
        return [...this.drawn.values()].flatMap(({ cx, cy }) => this.overworld.chunk(cx, cy).trees.map(({ x, y }) => ({ x, z: y })));
    }

    /** Throw everything away. */
    dispose() {
        for (const drawn of [...this.drawn.values()]) {
            this.#forget(drawn);
        }

        this.primer.traverse((node) => {
            node.geometry?.dispose();
            node.material?.userData.mask?.dispose();

            if (node.material?.userData.own) {
                node.material.dispose();
            }
        });
        this.woodland.dispose();
        disposeGrass(this.land);
        this.land.dispose();
        this.object.removeFromParent();
    }

    // Where the player is: the chunks to draw round them, nearest first, and those to throw away
    // (whether any were)
    #aim(x, z) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

        if (this.centre && this.centre[0] === cx && this.centre[1] === cy) {
            return false;
        }

        this.centre = [cx, cy];
        this.wanted = [];

        for (let dy = -REACH.drawn; dy <= REACH.drawn; dy++) {
            for (let dx = -REACH.drawn; dx <= REACH.drawn; dx++) {
                if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < CHUNKS && cy + dy < CHUNKS) {
                    this.wanted.push([cx + dx, cy + dy]);
                }
            }
        }

        // (From the middle of the player's chunk)
        this.wanted.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));

        let changed = false;

        for (const drawn of [...this.drawn.values()]) {
            if (Math.max(Math.abs(drawn.cx - cx), Math.abs(drawn.cy - cy)) > REACH.kept) {
                this.#forget(drawn);
                changed = true;
            }
        }

        return changed;
    }

    // Draw a chunk
    #draw(cx, cy) {
        if (this.drawn.has(key(cx, cy))) {
            return;
        }

        const chunk = this.overworld.chunk(cx, cy);
        const object = new THREE.Group();

        object.name = `chunk ${cx}, ${cy}`;
        object.add(chunkGround(this.overworld, chunk, this.land));

        const water = waterOf(this.overworld, chunk);
        const bridges = bridgesOf(chunk);

        for (const part of [water, bridges]) {
            if (part) {
                object.add(part);
            }
        }

        // The trees, and how high they stand on each square
        const lot = this.woodland.plant(chunk.trees.map(({ x, y, variant, size, turn }) => ({ x, z: y, variant, size, turn })));
        const heights = new Float32Array(CHUNK * CHUNK);

        for (const box of lot.boxes) {
            for (let y = Math.max(chunk.y0, Math.floor(box.min.z)); y < Math.min(chunk.y0 + CHUNK, Math.ceil(box.max.z)); y++) {
                for (let x = Math.max(chunk.x0, Math.floor(box.min.x)); x < Math.min(chunk.x0 + CHUNK, Math.ceil(box.max.x)); x++) {
                    const at = (y - chunk.y0) * CHUNK + (x - chunk.x0);

                    heights[at] = Math.max(heights[at], box.max.y);
                }
            }
        }

        object.add(lot.object);
        this.object.add(object);
        this.drawn.set(key(cx, cy), { cx, cy, object, lot, heights });
        this.version++;
    }

    // Throw a chunk away
    #forget(drawn) {
        this.woodland.fell(drawn.lot);

        for (const part of [...drawn.object.children]) {
            if (part.name === "ground") {
                disposeChunkGround(part);
            } else {
                part.traverse((node) => {
                    node.geometry?.dispose();

                    // (The water's mask is the chunk's own)
                    node.material?.userData.mask?.dispose();

                    if (node.material?.userData.own) {
                        node.material.dispose();
                    }
                });
            }
        }

        drawn.object.removeFromParent();
        this.drawn.delete(key(drawn.cx, drawn.cy));
        this.version++;
    }
}

// Water and a bridge, far under the ground where they're never seen, so that their shaders are
// made while the game loads (with the rest: Game.build) rather than the first time a river or a
// bridge comes into view
function primer() {
    const group = new THREE.Group();
    const mask = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);

    mask.needsUpdate = true;
    group.name = "primer";
    group.position.y = -1000;
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), waterMaterial(mask, 0, 0)));

    for (const look of ["planks", "planks-dark", "timber"]) {
        group.add(new THREE.Mesh(box(0, 0, 0, 1, 0.1, 1), bridgeMaterial(look)));
    }

    return group;
}

// --- Water ---

// The water's material, shared by every chunk but for its mask: the water drawn where the mask
// says (softly at its edges, paler in the shallows), stirred by the wind
function waterMaterial(mask, x0, y0) {
    const water = new THREE.MeshStandardMaterial({ color: WATER.colour, roughness: 0.12, metalness: 0, transparent: true, depthWrite: false });

    water.name = "water";
    water.userData.mask = mask;
    water.userData.own = true;
    water.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            waterMask: { value: mask },
            waterArea: { value: new THREE.Vector4(x0 - 1, y0 - 1, CHUNK + 2, CHUNK + 2) },
            waterTime: TREE_WIND.time,
            shallows: { value: new THREE.Color(WATER.shallows) },
        });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec2 vWater;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWater = (modelMatrix * vec4(transformed, 1.0)).xz;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
varying vec2 vWater;
uniform sampler2D waterMask;
uniform vec4 waterArea;
uniform float waterTime;
uniform vec3 shallows;`)
            .replace("#include <map_fragment>", `
float wet = texture2D(waterMask, (vWater - waterArea.xy) / waterArea.zw).r;
float deep = smoothstep(0.5, 0.95, wet);

if (wet < 0.45) discard;

diffuseColor.rgb = mix(shallows, diffuseColor.rgb, deep);
diffuseColor.a = ${WATER.opacity.toFixed(2)} * mix(0.55, 1.0, deep) * smoothstep(0.45, 0.55, wet);`)
            .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
    vec2 ripple = vec2(
        sin(vWater.x * 1.7 + waterTime * 1.3) + 0.6 * sin(vWater.y * 2.9 - waterTime * 1.9 + vWater.x * 0.7),
        cos(vWater.y * 1.9 + waterTime * 1.1) + 0.6 * cos(vWater.x * 3.1 + waterTime * 1.7 - vWater.y * 0.5)
    ) * 0.035;

    normal = normalize(normal + (viewMatrix * vec4(ripple.x, 0.0, ripple.y, 0.0)).xyz);
}`);
    };
    water.customProgramCacheKey = () => "water";

    return water;
}

// A chunk's water: a sheet over it, drawn where there's water (under bridges too), or null
function waterOf(overworld, chunk) {
    const { x0, y0 } = chunk;
    const size = CHUNK + 2;
    const data = new Uint8Array(size * size);
    let any = false;

    // (One square further round, so the edges match the chunks beside it)
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [x, y] = [x0 + i - 1, y0 + j - 1];
            const inside = i > 0 && j > 0 && i <= CHUNK && j <= CHUNK;

            if (x < 0 || y < 0 || x >= CHUNKS * CHUNK || y >= CHUNKS * CHUNK) {
                continue;
            }

            const there = inside ? chunk : overworld.chunkAt(x, y);
            const k = (y - there.y0) * CHUNK + (x - there.x0);

            if (there.water[k] !== WET.none) {
                data[j * size + i] = 255;
                any ||= inside;
            }
        }
    }

    if (!any) {
        return null;
    }

    const mask = new THREE.DataTexture(data, size, size, THREE.RedFormat);

    mask.magFilter = THREE.LinearFilter;
    mask.minFilter = THREE.LinearFilter;
    mask.flipY = false;
    mask.needsUpdate = true;

    const plane = new THREE.PlaneGeometry(CHUNK, CHUNK).rotateX(-Math.PI / 2).translate(CHUNK / 2, WATER.level, CHUNK / 2);
    const mesh = new THREE.Mesh(plane, waterMaterial(mask, x0, y0));

    mesh.name = "water";
    mesh.position.set(x0, 0, y0);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}

// --- Bridges ---

// A box (metres) from (x0, y0, z0) to (x1, y1, z1), its texture laid flat on each face at its real
// size (`metres` to a repeat): on top, running along x (so a deck's boards lie across it)
function box(x0, y0, z0, x1, y1, z1, metres = 2.8) {
    const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const { position, normal, uv } = geometry.attributes;

    for (let k = 0; k < uv.count; k++) {
        const [x, y, z] = [position.getX(k), position.getY(k), position.getZ(k)];

        if (Math.abs(normal.getY(k)) > 0.5) {
            uv.setXY(k, x / metres, z / metres);
        } else if (Math.abs(normal.getX(k)) > 0.5) {
            uv.setXY(k, z / metres, y / metres);
        } else {
            uv.setXY(k, x / metres, y / metres);
        }
    }

    return geometry;
}

// A chunk's bridges (those whose middles are in it): each a straight deck of boards laid across
// it, from bank to bank along the road, a dark beam along each edge, and a rail on posts along
// each side; or null
function bridgesOf(chunk) {
    const parts = { planks: [], "planks-dark": [], timber: [] };
    const { top, depth } = DECK;
    const { height, thick, post, every } = RAIL;
    const matrix = new THREE.Matrix4();

    for (const { a, b, half } of chunk.bridges) {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const posts = Math.max(2, Math.round(length / every) + 1);
        const own = { planks: [], "planks-dark": [], timber: [] };

        // (Built along x from 0, across z, then turned to lie along the road)
        own.planks.push(box(0, top - depth, -half, length, top, half));

        for (const side of [-1, 1]) {
            const [inner, outer] = side > 0 ? [half - thick, half + 0.02] : [-half - 0.02, -half + thick];

            own["planks-dark"].push(box(0, top - 0.4, inner, length, top + 0.03, outer, 1.4));
            own.timber.push(box(0, top + height - thick, inner, length, top + height, outer, 1));
            own.timber.push(box(0, top + height * 0.5 - thick * 0.6, inner, length, top + height * 0.5, outer, 1));

            for (let k = 0; k < posts; k++) {
                const x = 0.1 + ((length - 0.2 - post) * k) / (posts - 1);

                own.timber.push(box(x, top - 0.4, side > 0 ? half - post : -half, x + post, top + height + 0.06, side > 0 ? half : -half + post, 1));
            }
        }

        matrix.makeRotationY(-Math.atan2(b[1] - a[1], b[0] - a[0])).setPosition(a[0], 0, a[1]);

        for (const [look, geometries] of Object.entries(own)) {
            parts[look].push(...geometries.map((geometry) => geometry.applyMatrix4(matrix)));
        }
    }

    if (!parts.planks.length) {
        return null;
    }

    const group = new THREE.Group();

    group.name = "bridges";

    for (const [look, geometries] of Object.entries(parts)) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), bridgeMaterial(look));

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
    }

    return group;
}

// The bridges' materials: the art kits' planks and timber, but with textures repeating each
// metre (the kits work in art pixels)
const bridgeMaterials = new Map();

function bridgeMaterial(look) {
    if (!bridgeMaterials.has(look)) {
        const kit = material(look);
        const own = kit.clone();

        if (kit.map) {
            own.map = kit.map.clone();
            own.map.repeat.set(1, 1);
            own.map.needsUpdate = true;
        }

        own.name = `bridge ${look}`;
        bridgeMaterials.set(look, own);
    }

    return bridgeMaterials.get(look);
}
