// Battle damage on a character's body and clothes: every blow leaves a mark of its kind where it
// lands (a nick, a bruise, a scorch), and falling below 75%, 50% and 25% of its hit points, the
// blow that did it leaves a wound: a sword's long bleeding cut, a cleaver's deep gash, an arrow
// left in the flesh, a hammer's or staff's swollen bruise, a spiked fist's punctured bruise, fire's
// charred, smouldering skin and burnt-through cloth, arcane light's glowing violet veins. Clothes
// over a wound are cut, torn or burnt through, showing bloodied skin. Healed back above a
// threshold, that stage's wounds and marks are gone (all of them at full health); coming back to
// life, all of them.
//
// A character's damage is one texture over its body's UV map (which its clothes share): red for
// blood, green for bruising, blue for charring, alpha for cuts (in skin) and tears (in cloth).
// Each wound is painted in 3D, round a point on the body the way the blow came from, onto the
// texels near it (each texel knows where on the body it is: garments.js texelMap), so a slash
// runs straight across the chest wherever the UV map's seams fall, and blood runs down. The
// body's and each garment's material mix it in (a few lines added to their shaders), with fire's
// embers and arcane veins glowing a while after.

import * as THREE from "three";
import { texelMap } from "../characters/garments.js";

/** Shares of its hit points below which a character's wounds get worse: stages 1, 2 and 3. */
export const THRESHOLDS = Object.freeze([0.75, 0.5, 0.25]);

/** How badly wounded a character is: how many thresholds its hit points are below (0 to 3). */
export const stageOf = (hp, maxHp) => THRESHOLDS.filter((share) => hp < share * maxHp).length;

// The damage texture's size (texels a side): the same map the clothes are painted from
const SIZE = 512;

// Texels are looked up round a point in cells this big (metres)
const CELL = 0.02;

/**
 * Each kind of blow (weapons.js: an attack's `reaction`): where on the body it lands (from and
 * to, as shares of the character's height), how far round from the way it came (radians either
 * side), and how it's painted (`paint` below).
 */
export const KINDS = Object.freeze({
    slash: { heights: [0.45, 0.85], spread: 0.8, paint: "cut", length: 0.2, width: 0.011, blood: 1, drips: 3 },
    hack: { heights: [0.45, 0.85], spread: 0.8, paint: "cut", length: 0.25, width: 0.02, blood: 1.4, drips: 4 },
    pierce: { heights: [0.45, 0.82], spread: 0.7, paint: "puncture", radius: 0.007, blood: 1.1, drips: 2 },
    crush: { heights: [0.5, 0.86], spread: 0.9, paint: "bruise", radius: 0.08, blood: 0.8, drips: 2 },
    strike: { heights: [0.45, 0.86], spread: 0.9, paint: "welt", length: 0.18, radius: 0.028, blood: 0.6, drips: 1 },
    punch: { heights: [0.55, 0.86], spread: 0.8, paint: "spiked", radius: 0.045, blood: 0.8, drips: 2 },
    fire: { heights: [0.4, 0.86], spread: 1, paint: "char", radius: 0.075, blood: 0, drips: 0, glow: "fire" },
    arcane: { heights: [0.45, 0.86], spread: 0.9, paint: "veins", radius: 0.11, blood: 0.15, drips: 0, glow: "arcane" },
});

// How much smaller a mark (every blow) is than a wound (crossing a threshold)
const MARK = 0.45;

// How long fire's embers and arcane veins glow after a blow (seconds)
const GLOW_TIME = { fire: 4, arcane: 5 };

// The most arrows left in anyone (the oldest go)
const ARROWS = 8;

// What the shaders mix in (linear colours): fresh and thick blood, bruising, char, the raw edges
// and dark inside of a cut, torn cloth; and the glows
const SHADER = /* glsl */ `
#ifdef USE_MAP
    vec4 wound = texture2D( damageMap, vMapUv );
#else
    vec4 wound = vec4( 0.0 );
#endif
    vec3 blood = mix( vec3( 0.14, 0.004, 0.003 ), vec3( 0.06, 0.002, 0.001 ), smoothstep( 0.5, 1.0, wound.r ) );
    float bloodied = smoothstep( 0.05, 0.45, wound.r );
    float charred = smoothstep( 0.1, 0.8, wound.b );
#if defined( WOUNDED_METAL )
    // Metal: scratched bright where cut, dented dark where struck, bloodied and blackened
    diffuseColor.rgb = mix( diffuseColor.rgb, min( vec3( 1.0 ), diffuseColor.rgb * 1.8 + 0.06 ), smoothstep( 0.2, 0.6, wound.a ) );
    diffuseColor.rgb *= 1.0 - 0.3 * wound.g;
    diffuseColor.rgb = mix( mix( diffuseColor.rgb, blood, bloodied ), vec3( 0.025, 0.018, 0.014 ), charred );
#elif defined( WOUNDED_CLOTH )
    // Cloth: scuffed where struck, soaked with blood, scorched; torn (or burnt) through, its
    // edges frayed pale (singed brown round a burn), showing the wound in the skin beneath
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.6 + vec3( 0.07, 0.06, 0.05 ), wound.g * 0.6 );
    vec3 threads = mix( diffuseColor.rgb * 1.7 + 0.06, vec3( 0.16, 0.07, 0.025 ), smoothstep( 0.0, 0.05, wound.b ) );
    diffuseColor.rgb = mix( mix( diffuseColor.rgb, blood, bloodied ), vec3( 0.025, 0.018, 0.014 ), charred );
    vec3 beneath = mix( mix( skinTone, vec3( 0.36, 0.045, 0.04 ), smoothstep( 0.45, 0.6, wound.a ) ), vec3( 0.035, 0.0, 0.0 ), smoothstep( 0.62, 0.9, wound.a ) );
    beneath = mix( mix( beneath, blood, bloodied * 0.6 ), vec3( 0.025, 0.018, 0.014 ), charred );
    float frayed = smoothstep( 0.18, 0.3, wound.a ) * ( 1.0 - smoothstep( 0.4, 0.46, wound.a ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( threads, blood, wound.r * 0.5 ), frayed );
    diffuseColor.rgb = mix( diffuseColor.rgb, beneath, smoothstep( 0.4, 0.46, wound.a ) );
#else
    // Skin: bruised, cut open (raw at the edges, dark inside), bloodied, charred
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.07, 0.02, 0.09 ), wound.g * 0.85 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.36, 0.045, 0.04 ), smoothstep( 0.15, 0.45, wound.a ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, blood, bloodied * ( 1.0 - 0.5 * smoothstep( 0.5, 0.9, wound.a ) ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.035, 0.0, 0.0 ), smoothstep( 0.55, 0.95, wound.a ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.025, 0.018, 0.014 ), charred );
#endif
`;

const GLOW_SHADER = /* glsl */ `
    totalEmissiveRadiance += vec3( 1.0, 0.18, 0.02 ) * fireGlow * smoothstep( 0.12, 0.3, wound.b ) * ( 1.0 - smoothstep( 0.35, 0.6, wound.b ) ) * 1.3;
    totalEmissiveRadiance += vec3( 0.55, 0.16, 1.0 ) * arcaneGlow * wound.g * 2.0;
`;

const ROUGH_SHADER = /* glsl */ `
    roughnessFactor = mix( roughnessFactor, 0.3, smoothstep( 0.05, 0.6, wound.r ) * 0.85 );
`;

// Everything about a body's wounds that's the same for every character (made once per kit): the
// texels (where each is on the body, in cells), the body's vertices and their normals
function woundMap(kit) {
    if (kit.woundMap) {
        return kit.woundMap;
    }

    const human = kit.human;

    kit.texelMap ??= texelMap(human, SIZE);

    const { covered, positions } = kit.texelMap;
    const cells = new Map();

    for (let i = 0; i < SIZE * SIZE; i++) {
        if (covered[i]) {
            const key = cellKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            const list = cells.get(key);

            if (list) {
                list.push(i);
            } else {
                cells.set(key, [i]);
            }
        }
    }

    // The base body's normals, and a render vertex for each of its vertices (to find where it is,
    // posed)
    const normals = new Float32Array(human.vertexCount * 3);
    const renderOf = new Int32Array(human.vertexCount).fill(-1);
    const indices = human.renderIndices("body");
    const base = human.basePositions;

    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => human.renderSource[indices[t + k]]);
        const e1 = [0, 1, 2].map((k) => base[b * 3 + k] - base[a * 3 + k]);
        const e2 = [0, 1, 2].map((k) => base[c * 3 + k] - base[a * 3 + k]);
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];

        for (const v of [a, b, c]) {
            for (let k = 0; k < 3; k++) {
                normals[v * 3 + k] += n[k];
            }
        }

        [0, 1, 2].forEach((k) => {
            const v = human.renderSource[indices[t + k]];

            if (renderOf[v] < 0) {
                renderOf[v] = indices[t + k];
            }
        });
    }

    for (let v = 0; v < human.vertexCount; v++) {
        const length = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]) || 1;

        for (let k = 0; k < 3; k++) {
            normals[v * 3 + k] /= length;
        }
    }

    // Where blows land: the body, but not the hands or head
    const vertices = [];

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && renderOf[v] >= 0 && !/Hand|Head/.test(human.bones[human.skinIndices[v * 4]].name)) {
            vertices.push(v);
        }
    }

    kit.woundMap = { positions, cells, normals, renderOf, vertices };

    return kit.woundMap;
}

const cellKey = (x, y, z) => ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);

// A little seeded noise (0 to 1) for ragged edges
const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;

    return s - Math.floor(s);
};

// Smooth noise (0 to 1) along a line, repeating every `period` if given (round a circle)
const noise = (seed, x, period = 0) => {
    const i = Math.floor(x);
    const f = x - i;
    const t = f * f * (3 - 2 * f);
    const at = (k) => hash(seed + (period ? ((k % period) + period) % period : k));

    return at(i) * (1 - t) + at(i + 1) * t;
};

const smooth = (edge0, edge1, x) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);
};

export class Wounds {
    /**
     * @param {import("../characters/character.js").Character} character
     * @param {object} [options]
     * @param {number} [options.seed] - For where wounds land and how they look.
     */
    constructor(character, { seed = 1 } = {}) {
        this.character = character;
        this.map = woundMap(character.kit);
        this.data = new Uint8Array(SIZE * SIZE * 4);
        this.texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RGBAFormat);
        this.texture.colorSpace = THREE.NoColorSpace;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.texture.generateMipmaps = true;
        this.texture.needsUpdate = true;

        /** The wounds and marks it has: [{ kind, stage, mark, vertex, centre, normal, turn, seed, arrow }]. */
        this.list = [];
        this.seed = seed;
        this.count = 0;
        this.uniforms = {
            damageMap: { value: this.texture },
            skinTone: { value: new THREE.Color(character.look?.skin?.tone ?? "#c89a7a") },
            fireGlow: { value: 0 },
            arcaneGlow: { value: 0 },
        };
        this.glow = { fire: 0, arcane: 0 };

        // The materials mixing the damage in, and each garment material's own copy
        this.patched = new WeakSet();
        this.copies = new Map();
        this.#patch();
    }

    /** How badly wounded it is (THRESHOLDS: 0 to 3). */
    get stage() {
        return this.list.reduce((most, wound) => Math.max(most, wound.stage), 0);
    }

    /**
     * A blow has landed: a `reaction` (KINDS key) from the way `from` (radians in its own frame:
     * 0 ahead, positive to its left; null for anywhere), leaving it `hp` of `maxHp`. Paints a
     * mark, and a wound for each threshold it fell below. Returns the wound it left (or the mark):
     * { vertex, stage, wound: true if a wound }, for placing effects (`pointOf`) and arrows.
     */
    hit({ reaction, from = null, hp, maxHp, before = hp }) {
        const kind = KINDS[reaction] ?? KINDS.strike;
        const stage = stageOf(hp, maxHp);
        const crossed = stage - stageOf(before, maxHp);
        const random = () => hash(this.seed * 1000 + this.count++ * 7.31);
        const vertex = this.#landing(kind, from, random);
        let landed = null;

        this.#patch();

        // A mark, or a wound for every threshold it crossed (the first where it landed)
        const mark = crossed <= 0;

        for (let k = 0; k < Math.max(1, crossed); k++) {
            const at = k === 0 ? vertex : this.#landing(kind, from, random);
            const wound = {
                kind: reaction in KINDS ? reaction : "strike",
                stage: mark ? stage : stage - crossed + 1 + k,
                mark,
                vertex: at,
                turn: random() * Math.PI,
                seed: random() * 1000,
                arrow: null,
            };

            this.list.push(wound);
            this.#paint(wound);
            landed ??= wound;
        }

        if (kind.glow) {
            this.glow[kind.glow] = GLOW_TIME[kind.glow];
        }

        this.texture.needsUpdate = true;

        return landed;
    }

    /** Healed to `hp` of `maxHp`: the wounds and marks of worse stages are gone (all of them, fully healed). */
    heal(hp, maxHp) {
        const stage = stageOf(hp, maxHp);
        const kept = hp >= maxHp ? [] : this.list.filter((wound) => wound.stage <= stage);

        if (kept.length === this.list.length) {
            return;
        }

        for (const wound of this.list) {
            if (!kept.includes(wound)) {
                wound.arrow?.removeFromParent();
            }
        }

        this.list = kept;
        this.#repaint();
    }

    /** Come back to life: no wounds at all. */
    clear() {
        for (const wound of this.list) {
            wound.arrow?.removeFromParent();
        }

        this.list = [];
        this.glow.fire = this.glow.arcane = 0;
        this.#repaint();
    }

    /** Keep an object (an arrow stuck in it) with a wound: gone when it heals (or when too many are). */
    keep(wound, object) {
        wound.arrow = object;

        const arrows = this.list.filter((other) => other.arrow);

        for (const old of arrows.slice(0, Math.max(0, arrows.length - ARROWS))) {
            old.arrow.removeFromParent();
            old.arrow = null;
        }
    }

    /** Wounds bleeding enough to drip (the latest few): [wound]. */
    get bleeding() {
        return this.list.filter((wound) => KINDS[wound.kind].blood >= 0.5 && (!wound.mark || wound.stage >= 2)).slice(-4);
    }

    /** Where a wound is now, in the world (on the body as it's posed). */
    pointOf(wound, target = new THREE.Vector3()) {
        const character = this.character;
        const mesh = character.mesh;
        const render = this.map.renderOf[wound.vertex];

        character.object.updateMatrixWorld();
        mesh.getVertexPosition(render, target);
        mesh.localToWorld(target);

        return target;
    }

    /** The bone that moves a wound most (to stick things in it). */
    boneOf(wound) {
        const human = this.character.human;
        const v = wound.vertex;
        let strongest = 0;

        for (let k = 1; k < 4; k++) {
            if (human.skinWeights[v * 4 + k] > human.skinWeights[v * 4 + strongest]) {
                strongest = k;
            }
        }

        return this.character.rig.skeleton.bones[human.skinIndices[v * 4 + strongest]];
    }

    /** Burning wounds (fire's, while they smoulder): [wound]. */
    get smouldering() {
        return this.glow.fire > 0 ? this.list.filter((wound) => wound.kind === "fire").slice(-2) : [];
    }

    /** Advance by `dt` seconds: glows fade. */
    update(dt) {
        for (const glow of ["fire", "arcane"]) {
            this.glow[glow] = Math.max(0, this.glow[glow] - dt);

            // (Flickering as it dies down)
            const left = this.glow[glow] / GLOW_TIME[glow];

            this.uniforms[`${glow}Glow`].value = left > 0 ? left * (glow === "fire" ? 0.75 + 0.25 * Math.sin(performance.now() / 70) : 1) : 0;
        }

        // Clothes put on since (a new outfit) get the wounds too, and a new skin shows under them
        this.#patch();

        const tone = this.character.look?.skin?.tone;

        if (tone && tone !== this.tone) {
            this.tone = tone;
            this.uniforms.skinTone.value.set(tone);
        }
    }

    dispose() {
        this.texture.dispose();

        for (const copy of this.copies.values()) {
            copy.dispose();
        }
    }

    // Where a blow lands: a vertex on the body facing the way it came from, at a height its kind
    // strikes at
    #landing(kind, from, random) {
        const character = this.character;
        const { vertices } = this.map;
        const positions = character.positions;
        const normals = character.normals;
        const height = character.height;
        const [low, high] = kind.heights;
        const way = from ?? (random() - 0.5) * Math.PI;
        const facing = [Math.sin(way), Math.cos(way)];
        let best = vertices[0];
        let bestScore = -Infinity;

        // A handful of tries, keeping the one that best faces the blow
        for (let k = 0; k < 40; k++) {
            const v = vertices[Math.floor(random() * vertices.length)];
            const y = positions[v * 3 + 1] / height;

            if (y < low || y > high) {
                continue;
            }

            // (Facing it: not the top of a shoulder, which faces up)
            const angle = Math.acos(Math.max(-1, Math.min(1, normals[v * 3] * facing[0] + normals[v * 3 + 2] * facing[1])));
            const score = -Math.max(0, angle - kind.spread) + random() * 0.3;

            if (score > bestScore) {
                bestScore = score;
                best = v;
            }
        }

        return best;
    }

    // Mix the damage into the body's material and each garment's (its own copy, as they're shared)
    #patch() {
        const character = this.character;
        const patch = (material, cloth) => {
            if (this.patched.has(material)) {
                return material;
            }

            if (this.copies.has(material)) {
                return this.copies.get(material);
            }

            const own = cloth ? material.clone() : material;
            const metal = cloth && material.metalness > 0.3;

            own.onBeforeCompile = (shader) => {
                Object.assign(shader.uniforms, this.uniforms);
                shader.fragmentShader = shader.fragmentShader
                    .replace("void main() {", "uniform sampler2D damageMap;\nuniform vec3 skinTone;\nuniform float fireGlow;\nuniform float arcaneGlow;\nvoid main() {")
                    .replace("#include <map_fragment>", `#include <map_fragment>\n${SHADER}`)
                    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${ROUGH_SHADER}`)
                    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${GLOW_SHADER}`);

                if (cloth) {
                    shader.fragmentShader = `#define ${metal ? "WOUNDED_METAL" : "WOUNDED_CLOTH"}\n${shader.fragmentShader}`;
                }
            };
            own.customProgramCacheKey = () => (metal ? "wounded-metal" : cloth ? "wounded-cloth" : "wounded-skin");
            own.needsUpdate = true;
            this.patched.add(own);

            if (cloth) {
                this.copies.set(material, own);
            }

            return own;
        };

        character.materials.body = patch(character.materials.body, false);

        if (character.mesh.material[0] !== character.materials.body) {
            character.mesh.material = character.mesh.material.map((material, k) => (k === 0 ? character.materials.body : material));
        }

        for (const garment of character.garments) {
            garment.material = patch(garment.material, true);
        }
    }

    #repaint() {
        this.data.fill(0);

        for (const wound of this.list) {
            this.#paint(wound);
        }

        this.texture.needsUpdate = true;
    }

    // Paint a wound onto the texels round it, in 3D on the base body
    #paint(wound) {
        const kind = KINDS[wound.kind];
        const { positions, cells, normals } = this.map;
        const base = this.character.human.basePositions;
        const v = wound.vertex;
        const c = [base[v * 3], base[v * 3 + 1], base[v * 3 + 2]];
        const n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
        const scale = wound.mark ? MARK : 0.85 + hash(wound.seed) * 0.4;

        // Across the surface: sideways (level) and up it
        let side = [n[2], 0, -n[0]];
        const sideLength = Math.hypot(side[0], side[2]);

        side = sideLength > 0.2 ? side.map((value) => value / sideLength) : [1, 0, 0];

        const up = [n[1] * side[2] - n[2] * side[1], n[2] * side[0] - n[0] * side[2], n[0] * side[1] - n[1] * side[0]];
        const along = [0, 1, 2].map((k) => Math.cos(wound.turn) * side[k] + Math.sin(wound.turn) * up[k]);
        const reach = Math.max(kind.length ?? 0, kind.radius ?? 0) * scale * 0.5 + 0.03 + (kind.drips && !wound.mark ? 0.14 : 0.02);

        // The texels within reach
        const [cx, cy, cz] = c.map((value) => Math.floor(value / CELL));
        const span = Math.ceil(reach / CELL);
        const data = this.data;

        for (let ix = cx - span; ix <= cx + span; ix++) {
            for (let iy = cy - span - (kind.drips ? Math.ceil(0.14 / CELL) : 0); iy <= cy + span; iy++) {
                for (let iz = cz - span; iz <= cz + span; iz++) {
                    const list = cells.get(((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512));

                    if (!list) {
                        continue;
                    }

                    for (const i of list) {
                        const d = [positions[i * 3] - c[0], positions[i * 3 + 1] - c[1], positions[i * 3 + 2] - c[2]];
                        const depth = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];

                        // (Not the far side of an arm or the body)
                        if (Math.abs(depth) > 0.035) {
                            continue;
                        }

                        const u = d[0] * along[0] + d[1] * along[1] + d[2] * along[2];
                        const w = d[0] * across(along, n, 0) + d[1] * across(along, n, 1) + d[2] * across(along, n, 2);
                        const drop = -d[1];
                        const level = d[0] * side[0] + d[2] * side[2];
                        const [r, g, b, a] = this.#shape(kind, wound, scale, { u, w, drop, level, r: Math.hypot(u, w) });
                        const row = SIZE - 1 - Math.floor(i / SIZE);
                        const o = (row * SIZE + (i % SIZE)) * 4;

                        data[o] = Math.min(255, Math.max(data[o], r * 255));
                        data[o + 1] = Math.min(255, Math.max(data[o + 1], g * 255));
                        data[o + 2] = Math.min(255, Math.max(data[o + 2], b * 255));
                        data[o + 3] = Math.min(255, Math.max(data[o + 3], a * 255));
                    }
                }
            }
        }
    }

    // A wound's blood, bruising, char and cut (0 to 1) at a texel `u` along it, `w` across it,
    // `drop` below its middle and `level` sideways (metres), `r` from its middle
    #shape(kind, wound, scale, { u, w, drop, level, r }) {
        const seed = wound.seed;
        const mark = wound.mark;
        const angle = Math.atan2(w, u);
        // Ragged edges: smoothly more or less, along a cut or round a mark
        const along = (x, detail, k = 0) => 0.7 + 0.6 * noise(seed + k * 31, x * detail);
        const round = (detail, k = 0) => 0.75 + 0.5 * noise(seed + k * 31, (angle + Math.PI) * detail, Math.round(Math.PI * 2 * detail));
        let blood = 0;
        let bruise = 0;
        let char = 0;
        let cut = 0;

        // Blood running down from it, in streaks
        const drips = (from, strength) => {
            const count = mark ? Math.min(1, kind.drips) : kind.drips;

            for (let k = 0; k < count; k++) {
                const x = from * (hash(seed + k * 3.1) - 0.5);
                const length = (mark ? 0.035 : 0.08 + 0.1 * hash(seed + k * 5.7)) * Math.max(0.6, kind.blood);
                const width = (0.0035 + 0.003 * hash(seed + k)) * (1 - 0.5 * Math.min(1, drop / length));

                if (drop > 0 && drop < length) {
                    blood = Math.max(blood, strength * (1 - (drop / length) ** 2) * smooth(width, width * 0.35, Math.abs(level - x - 0.01 * Math.sin(drop * 60 + k))));
                }
            }
        };

        // A split in the skin: a short cut, bleeding
        const split = (length, width, strength) => {
            const t = Math.abs(u) / (length / 2);

            if (t < 1) {
                const wide = width * Math.sqrt(1 - t * t) * along(u, 80, 2);

                cut = Math.max(cut, smooth(wide * 1.5, wide * 0.35, Math.abs(w)) * strength);
                blood = Math.max(blood, smooth(wide * 2.4 + 0.004, wide * 0.8, Math.abs(w)) * 0.9);
            }
        };

        switch (kind.paint) {
            case "cut": {
                // A long gash, deepest in the middle, dark inside, raw at its edges, a rim of blood
                const length = kind.length * scale;
                const t = Math.abs(u) / (length / 2);

                if (t < 1) {
                    const width = kind.width * (mark ? 0.55 : 1) * Math.sqrt(1 - t * t) * along(u, 60);

                    cut = smooth(width * 1.5, width * 0.35, Math.abs(w)) * (mark ? 0.7 : 1);
                    blood = smooth(width * 2.2 + 0.004, width * 0.8, Math.abs(w)) * along(u, 90, 1) * (mark ? 0.7 : 0.95);
                }

                drips(length * 0.8, mark ? 0.55 : 0.9);
                break;
            }
            case "puncture": {
                // A small hole (an arrow in it), blood welling round it and running down
                const radius = kind.radius * (mark ? 0.75 : 1);

                cut = smooth(radius * 1.5, radius * 0.4, r);
                blood = smooth((0.016 + 0.014 * scale) * kind.blood, radius, r / round(2));
                drips(0.012, 0.95);
                break;
            }
            case "bruise": {
                // A dark swelling, the skin split in the middle of a bad one
                const radius = kind.radius * scale;
                const edge = r / round(1.5);

                bruise = smooth(radius, radius * 0.25, edge) * (0.55 + 0.35 * smooth(radius * 0.7, 0, edge));
                blood = smooth(radius * 0.35, radius * 0.1, edge) * 0.35 * kind.blood;

                if (!mark) {
                    split(radius * 0.9, 0.008, 0.9);
                    drips(radius * 0.5, 0.75);
                }

                break;
            }
            case "welt": {
                // A long, raised stripe, raw along the middle where the skin broke
                const length = kind.length * scale;
                const t = Math.abs(u) / (length / 2);

                if (t < 1) {
                    const width = kind.radius * scale * along(u, 40);

                    const band = smooth(width, width * 0.3, Math.abs(w)) * (1 - t * t);
                    const middle = smooth(width * 0.4, width * 0.1, Math.abs(w)) * (1 - t * t);

                    bruise = band * 0.95;
                    cut = mark ? 0 : middle * 0.42;
                    blood = middle * (mark ? 0.3 : noise(seed + 9, u * 120) > 0.5 ? 0.85 : 0.4);
                }

                if (!mark) {
                    drips(length * 0.5, 0.6);
                }

                break;
            }
            case "spiked": {
                // A spiked fist: a bruise, torn through by a row of spikes, each hole bleeding
                const radius = kind.radius * scale;

                bruise = smooth(radius, radius * 0.25, r / round(1.5)) * 0.8;

                for (let k = 0; k < 4; k++) {
                    const hole = Math.hypot(u - (k - 1.5) * radius * 0.45, w + 0.004 * Math.sin(k * 2.1));
                    const size = (mark ? 0.0035 : 0.0055) * (0.8 + 0.4 * hash(seed + k));

                    cut = Math.max(cut, smooth(size * 1.3, size * 0.4, hole));
                    blood = Math.max(blood, smooth(size * 2.6 + 0.004, size, hole) * 0.95);
                }

                drips(radius * 0.9, 0.8);
                break;
            }
            case "char": {
                // Burnt black, raw and blistered round it, burnt through the middle (of cloth)
                const radius = kind.radius * scale;
                const edge = r / round(2.5) / (0.85 + 0.3 * noise(seed + 3, u * 40 + w * 25));

                char = smooth(radius, radius * 0.45, edge);
                cut = Math.max(smooth(radius * 1.05, radius * 0.8, edge) * 0.32, mark ? 0 : smooth(radius * 0.5, radius * 0.25, edge) * 0.95);
                break;
            }
            case "veins": {
                // Crooked veins spreading out from where it struck, glowing, then darkened
                const radius = kind.radius * scale;
                let vein = 0;

                for (let k = 0; k < 8; k++) {
                    const turn = hash(seed + k * 1.7) * Math.PI * 2;
                    const length = radius * (0.6 + 0.8 * hash(seed + k * 2.3));
                    const bend = (hash(seed + k * 9.1) - 0.5) * 1.4;
                    const out = u * Math.cos(turn) + w * Math.sin(turn);
                    const off = -u * Math.sin(turn) + w * Math.cos(turn);

                    if (out > 0 && out < length) {
                        const path = (bend * out * out) / length + 0.005 * (noise(seed + k * 7, out * 150) - 0.5);
                        const thick = (mark ? 0.0025 : 0.004) * (1 - out / length) + 0.001;

                        vein = Math.max(vein, smooth(thick, thick * 0.25, Math.abs(off - path)));
                    }
                }

                bruise = Math.max(vein, smooth(radius * 0.3, 0, r) * 0.8);
                char = smooth(radius * 0.16, radius * 0.05, r) * 0.7;
                blood = vein * kind.blood;
                break;
            }
            default:
                break;
        }

        return [blood, bruise, char, cut];
    }
}

// The direction across a wound, on the surface (at right angles to `along` and the normal `n`)
function across(along, n, k) {
    const x = [n[1] * along[2] - n[2] * along[1], n[2] * along[0] - n[0] * along[2], n[0] * along[1] - n[1] * along[0]];

    return x[k];
}
