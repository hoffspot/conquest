// The face's expressions: a body's own shapes for blinking, frowning, smiling (Vitruvian's FACS
// shapes, its left and right halves as one: build-vitruvian.js EXPRESSIONS), played on the GPU.
//
// three.js's own morph targets keep a texture of every target's moves at every vertex for each
// geometry, and each character has its own geometry: a quarter of a megabyte a shape for each
// of the tavern's folk. Here the moves are kept once for the kit, only at the vertices an
// expression moves (the face's), in one texture, with how each turns their facing (worked out
// from the base body's, so a lid that's closed is lit as one, not as the fold it was): each
// vertex of the body says where its moves are in it (`faceSlot`, -1 for none: the same for
// everyone), and each character's skin and lashes add up its expressions' moves and turns before
// skinning, by its own weights (a uniform). A shadow isn't moved by them (three.js's depth
// material is its own): a blink's isn't missed.
//
//     character.expressions.update(dt, actions)   // each frame: blinking, and as it's doing
//     character.expressions.talking = true        // while it's talked to
//     character.expressions.mood = "smiling"      // its face at rest (null: none)

import * as THREE from "three";

/** The expressions a face can make, in the order their weights are kept. */
export const EXPRESSIONS = Object.freeze(["blink", "squint", "smile", "angry", "sad", "frown", "browsUp", "browsKnit"]);

// How wide the texture of moves is (texels): a slot's moves for each expression, one after another
const WIDTH = 2048;

// A vertex's facing turned by less than this (the length of the change in its normal) by every
// expression isn't kept
const TURN_CUTOFF = 0.002;

// How quickly the face moves to what it's showing (a weight goes this much of the way there a
// second), and a blink: closing, shut and opening (seconds), the time between blinks, and how
// far it shuts (a little past the shape: shut by it alone, the upper lid stops just in front of
// the lower, and from above, as the game's camera is, the eye shows between them)
const EASE = 9;
const BLINK = Object.freeze({ close: 0.06, shut: 0.04, open: 0.11, every: [1.8, 6], twice: 0.15, depth: 1.15 });

/**
 * What a face shows (weights), doing each thing: attacking, hurt (a flinch or knocked down),
 * talked to (with a lift of the brows now and then), smiling (a mood), and dead (its eyes left a
 * little open).
 */
export const FACES = Object.freeze({
    attacking: Object.freeze({ angry: 0.8, browsKnit: 0.45, squint: 0.3 }),
    hurt: Object.freeze({ squint: 0.75, browsUp: 0.6, frown: 0.5, sad: 0.3 }),
    talking: Object.freeze({ smile: 0.15 }),
    smiling: Object.freeze({ smile: 0.55 }),
    dead: Object.freeze({ blink: 0.85 }),
});
const TALK_BROWS = Object.freeze({ every: [1.4, 3.2], lift: 0.45, hold: 0.5 });

const shared = new WeakMap();

/**
 * A kit's expressions laid out for the GPU (made once): { names, slotOf (each render vertex's slot,
 * or -1: a character's geometry's `faceSlot`, its own attribute, as a geometry's attributes are let
 * go of with it), texture (each slot's moves for each expression, then each's turns of its
 * normal), slots }, or null for a body with none (MakeHuman's).
 */
export function expressionData(human) {
    if (!shared.has(human)) {
        shared.set(human, layOut(human));
    }

    return shared.get(human);
}

function layOut(human) {
    if (!human.expressions?.size || EXPRESSIONS.some((name) => !human.expressions.has(name))) {
        return null;
    }

    // Each expression's moves at every vertex, and how it turns each one's facing (on the base
    // body: near enough on any). (Plain loops: a typed array's from and map with a function are
    // slow, and this is made as the first character is)
    const count = human.vertexCount;
    const base = human.basePositions;
    const before = human.normals(base);
    const moved = new Float32Array(count * 3);
    const kept = new Uint8Array(count);
    const shapes = EXPRESSIONS.map((name) => {
        const { vertices, deltas } = human.expressions.get(name);
        const moves = new Float32Array(count * 3);

        for (let i = 0; i < vertices.length; i++) {
            kept[vertices[i]] = 1;

            for (let a = 0; a < 3; a++) {
                moves[vertices[i] * 3 + a] = deltas[i * 3 + a] * human.deltaUnit;
            }
        }

        for (let j = 0; j < moved.length; j++) {
            moved[j] = base[j] + moves[j];
        }

        const turns = human.normals(moved);

        for (let v = 0; v < count; v++) {
            const x = (turns[v * 3] -= before[v * 3]);
            const y = (turns[v * 3 + 1] -= before[v * 3 + 1]);
            const z = (turns[v * 3 + 2] -= before[v * 3 + 2]);

            if (x * x + y * y + z * z > TURN_CUTOFF * TURN_CUTOFF) {
                kept[v] = 1;
            }
        }

        return { moves, turns };
    });

    // The vertices any expression moves or turns, each a slot
    const slotOf = new Int32Array(count).fill(-1);
    let slots = 0;

    for (let v = 0; v < count; v++) {
        if (kept[v]) {
            slotOf[v] = slots++;
        }
    }

    // Each expression's moves, then each's turns
    const parts = EXPRESSIONS.length * 2;
    const height = Math.ceil((slots * parts) / WIDTH);
    const data = new Float32Array(WIDTH * height * 4);

    shapes.forEach(({ moves, turns }, k) => {
        for (let v = 0; v < count; v++) {
            if (slotOf[v] >= 0) {
                for (const [part, values] of [[k, moves], [EXPRESSIONS.length + k, turns]]) {
                    const at = (part * slots + slotOf[v]) * 4;

                    data[at] = values[v * 3];
                    data[at + 1] = values[v * 3 + 1];
                    data[at + 2] = values[v * 3 + 2];
                }
            }
        }
    });

    const texture = new THREE.DataTexture(data, WIDTH, height, THREE.RGBAFormat, THREE.FloatType);

    texture.needsUpdate = true;

    // (Read as a float in the shader: whole numbers, exactly)
    const Slots = slots <= 0x7fff ? Int16Array : Float32Array;

    return { names: EXPRESSIONS, slotOf: Slots.from(human.renderSource, (v) => slotOf[v]), texture, slots };
}

/**
 * Let a material (a character's skin or lashes) be moved by its expressions: their moves added
 * before skinning, by `weights` (a uniform's value: one a expression).
 */
export function expressive(material, data, weights) {
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    const count = EXPRESSIONS.length;

    material.onBeforeCompile = function (shader, renderer) {
        before.call(this, shader, renderer);
        shader.uniforms.faceShapes = { value: data.texture };
        shader.uniforms.faceWeights = weights;
        // (Its moves, part 0, and turns of its normal, part 1, by its weights)
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>
attribute float faceSlot;
uniform sampler2D faceShapes;
uniform float faceWeights[ ${count} ];
vec3 faceShape( int part ) {
	vec3 sum = vec3( 0.0 );
	if ( faceSlot >= 0.0 ) {
		int slot = int( faceSlot );
		for ( int k = 0; k < ${count}; k ++ ) {
			if ( faceWeights[ k ] != 0.0 ) {
				int at = ( part * ${count} + k ) * ${data.slots} + slot;
				sum += faceWeights[ k ] * texelFetch( faceShapes, ivec2( at % ${WIDTH}, at / ${WIDTH} ), 0 ).xyz;
			}
		}
	}
	return sum;
}`)
            .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal += faceShape( 1 );")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += faceShape( 0 );");
    };
    material.customProgramCacheKey = function () {
        return `${key.call(this)}|face${data.slots}`;
    };
}

/**
 * A character's face: how far it shows each expression, eased towards what it's doing, with its
 * blinks. `weights` is the uniform its materials read.
 */
export class Expressions {
    constructor(random = Math.random) {
        this.random = random;
        this.weights = { value: new Float32Array(EXPRESSIONS.length) };
        this.target = new Float32Array(EXPRESSIONS.length);
        /** Whether someone's talking to it (its brows lift now and then). */
        this.talking = false;
        /** Its face at rest: a key of FACES ("smiling"), weights of its own by name (the lab's), or null. */
        this.mood = null;
        /** Whether it blinks. */
        this.blinks = true;
        this.blinkIn = this.#between(BLINK.every);
        this.blinking = -1;
        this.browsIn = 0;
        this.brows = 0;
    }

    #between([low, high]) {
        return low + (high - low) * this.random();
    }

    /** What it's showing now, from what it's doing (Actions: attacking, hurt, fallen dead). */
    state(actions) {
        if (actions?.fall?.end === Infinity) {
            return "dead";
        }

        if (actions?.fall || actions?.reactions?.length) {
            return "hurt";
        }

        const attack = actions?.attack;

        if (attack && !attack.rest && !attack.swap) {
            return "attacking";
        }

        return this.talking ? "talking" : this.mood;
    }

    /** Ease the face towards what it's doing, and blink (seconds since the last). */
    update(dt, actions) {
        const state = this.state(actions);
        const face = (typeof state === "string" ? FACES[state] : state) ?? {};

        EXPRESSIONS.forEach((name, k) => {
            this.target[k] = face[name] ?? 0;
        });

        // Talked to: the brows lift now and then, as when speaking
        if (state === "talking") {
            this.browsIn -= dt;
            this.brows = Math.max(0, this.brows - dt);

            if (this.browsIn <= 0) {
                this.brows = TALK_BROWS.hold;
                this.browsIn = this.#between(TALK_BROWS.every);
            }

            this.target[EXPRESSIONS.indexOf("browsUp")] += this.brows > 0 ? TALK_BROWS.lift : 0;
        }

        const values = this.weights.value;
        const ease = 1 - Math.exp(-EASE * dt);

        for (let k = 0; k < values.length; k++) {
            values[k] += (this.target[k] - values[k]) * ease;
        }

        // Blinking (not dead): shut fast, then open a little slower; now and then twice
        const blink = EXPRESSIONS.indexOf("blink");

        if (state === "dead" || !this.blinks) {
            this.blinking = -1;

            return;
        }

        this.blinkIn -= dt;

        if (this.blinking < 0 && this.blinkIn <= 0) {
            this.blinking = 0;
            this.blinkIn = this.random() < BLINK.twice ? BLINK.close + BLINK.shut + BLINK.open + 0.08 : this.#between(BLINK.every);
        }

        if (this.blinking >= 0) {
            this.blinking += dt;

            const { close, shut, open } = BLINK;
            const t = this.blinking;
            const closed = t < close ? t / close : t < close + shut ? 1 : Math.max(0, 1 - (t - close - shut) / open);

            values[blink] = Math.max(values[blink], closed * BLINK.depth);

            if (t >= close + shut + open) {
                this.blinking = -1;
            }
        }
    }
}
