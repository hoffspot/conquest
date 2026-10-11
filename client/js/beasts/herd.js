// Beasts drawn in a crowd (world/crowd.js), as soldiers and the wild's people-shaped creatures are
// when a crowded fight comes too slowly (app/game.js #thronging): one of a kind's figure, made once
// from one of them built at its kind's size, its pieces merged as they're bound to its bones; and
// its moves (standing, walking, running, its first way of attacking, a flinch, its fall) each
// played on it once and recorded. Its walk and run are recorded a stride at a time (its body's
// `phase`), and every move played over and over has its end eased into its start (its breathing
// and its looking about aren't in step with its stride).
//
// Only those whose bodies move by their bones alone, and aren't seen through, are drawn so
// (herds): not a slime (its body squashed as a whole), a swarm, a wisp, a spectre or a spectral
// hound (seen through, fading), one with wings, nor one with a cape (cloth.js).

import * as THREE from "three";
import { CROWD, figureOf, recordPose, templateFrom } from "../world/crowd.js";
import { BeastAvatar } from "./beast.js";
import { LOOKS } from "./looks.js";
import { sculpting } from "./sculpt.js";

/** The bodies (LOOKS' `body`) a beast can be drawn in a crowd with. */
export const HERDS = Object.freeze(["quadruped", "biped", "arachnid", "serpent", "frog"]);

/**
 * How a beast's moves are recorded: its blow `attack` seconds long, struck `hitAt` in; the end of
 * one played over and over eased into its start over `ease` seconds; a stride in `stride` moments
 * at least, however quick (a rat's, a porcupine's: recorded the oftener); its pictures `picture`
 * pixels square (it has none: it's coloured by its corners).
 */
export const HERD = Object.freeze({ attack: 0.8, hitAt: 0.4, ease: 0.25, stride: 16, picture: 32 });

/** Can one of the wild's creatures (a LOOKS id) be drawn in a crowd? */
export function herds(id) {
    const look = LOOKS[id];

    return Boolean(look) && HERDS.includes(look.body) && !look.wings && !look.spectral && !look.cloak;
}

/**
 * A beast's moves (guard: standing; walk, run, attack, hit, die), each played on it once and
 * recorded CROWD.fps times a second, a step at a time (each a yield), as recordingMoves records a
 * character's (world/crowd.js): { data, rows, width, moves }.
 */
export function* recordingHerdMoves(beast) {
    const step = 1 / CROWD.fps;
    const character = { object: beast.plan.object, rig: { skeleton: skeletonOf(beast) } };
    const width = character.rig.skeleton.bones.length * 3;
    const frames = [];
    const moves = {};
    const doing = beast.doing;

    // (Nothing it does of its own while it's recorded: no resting, its first way of attacking)
    beast.rests = [];
    beast.attacks = beast.attacks.slice(0, 1);
    beast.specials = [];
    beast.every = 1;

    const pose = () => {
        const row = new Float32Array(width * 4);

        recordPose(character, row, 0);

        return row;
    };

    // One move: `start` it, then each moment till `until` says it's done; walking or running
    // (`speed`), got going first and recorded from the start of a stride to the next, the oftener
    // if it's quick (HERD.stride); one played over and over (`loop`), its end eased into its start
    const play = (name, { loop = false, speed = 0, start = () => {}, until }) => {
        let z = 0;
        let t = 0;
        let every = step;
        const moving = () => {
            z += speed * every;
            t += every;
            beast.update(every, 0, z, 0, true);
        };

        // (Moved on to the start of its next stride: how many moments that took)
        const stride = () => {
            let last = beast.plan.phase;

            for (let k = 1; k <= 4 * CROWD.fps; k++) {
                moving();

                if (beast.plan.phase < last) {
                    return k;
                }

                last = beast.plan.phase;
            }

            return Infinity;
        };

        beast.place(0, 0, 0);
        Object.assign(doing, { attack: null, react: null, dead: null, tossed: null });
        Object.assign(beast, { resting: null, restWeight: 0, still: 0, speed: 0 });
        start();

        if (speed > 0) {
            for (let k = 0; k < 3 * CROWD.fps; k++) {
                moving();
            }

            if (beast.plan.phase !== undefined) {
                stride();
                every = Math.min(step, (Math.max(0.5, stride() - 1) * step) / HERD.stride);
            }
        }

        const move = { start: frames.length, frames: 0, length: 0, loop };

        t = 0;

        do {
            frames.push(pose());
            move.frames++;
            moving();
        } while (!until(t) && move.frames < 6 * CROWD.fps);

        // (Played on a moment past its end, eased into its start: none of it jumps going round)
        if (loop) {
            const count = Math.min(Math.max(1, Math.round(HERD.ease / every)), Math.floor(move.frames / 2));

            for (let k = 0; k < count; k++) {
                const past = pose();
                const into = frames[move.start + k];
                const share = k / count;

                for (let n = 0; n < into.length; n++) {
                    into[n] = past[n] + (into[n] - past[n]) * share;
                }

                moving();
            }
        }

        move.length = move.frames * every;
        moves[name] = move;
    };

    play("guard", { loop: true, until: (t) => t >= CROWD.guard });
    yield;

    for (const [name, speed] of [
        ["walk", CROWD.walk],
        ["run", CROWD.run],
    ]) {
        let last = Infinity;
        const phased = beast.plan.phase !== undefined;

        play(name, {
            loop: true,
            speed,
            until: (t) => {
                if (!phased) {
                    return t >= 1;
                }

                const wrapped = beast.plan.phase < last && last !== Infinity;

                last = beast.plan.phase;

                return wrapped;
            },
        });
        moves[name].stride = speed * moves[name].length;
        yield;
    }

    play("attack", {
        start: () => beast.actions.startAttack(beast.attacks[0] ?? beast.plan.attacks?.[0] ?? "bite", { hitAt: HERD.hitAt, duration: HERD.attack }),
        until: () => !doing.attack,
    });
    moves.attack.hitAt = HERD.hitAt;
    yield;

    play("hit", { start: () => beast.actions.react(), until: () => !doing.react });
    yield;

    // (Fallen, and lying a while)
    let fell = null;

    play("die", {
        start: () => beast.actions.die({ from: 0 }),
        until: (t) => {
            fell ??= doing.dead.u >= 1 ? t : null;

            return fell !== null && t >= fell + CROWD.lie;
        },
    });
    moves.die.lands = fell ?? moves.die.length;

    const data = new Float32Array(width * 4 * frames.length);

    frames.forEach((row, k) => data.set(row, k * width * 4));

    return { data, rows: frames.length, width, moves };
}

// Its corners that are alike (where they are, which way they face, their colour, their place in
// the picture, their bones) made one: its folded pieces are a triangle apart each (sculpt.js fold),
// which leaves nothing to take away for fewer triangles (lod.js)
function welded(geometry) {
    const attributes = Object.values(geometry.attributes);
    const count = geometry.attributes.position.count;
    const ones = new Map();
    const kept = [];
    const into = new Uint32Array(count);

    for (let v = 0; v < count; v++) {
        let key = "";

        for (const { array, itemSize } of attributes) {
            for (let c = 0; c < itemSize; c++) {
                key += `${Math.round(array[v * itemSize + c] * 1e4)},`;
            }
        }

        let one = ones.get(key);

        if (one === undefined) {
            one = kept.length;
            ones.set(key, one);
            kept.push(v);
        }

        into[v] = one;
    }

    const made = new THREE.BufferGeometry();

    for (const [name, { array, itemSize }] of Object.entries(geometry.attributes)) {
        const values = new Float32Array(kept.length * itemSize);

        kept.forEach((v, k) => values.set(array.subarray(v * itemSize, (v + 1) * itemSize), k * itemSize));
        made.setAttribute(name, new THREE.Float32BufferAttribute(values, itemSize));
    }

    const indices = Array.from(geometry.index.array, (v) => into[v]);

    made.setIndex(kept.length > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    made.computeBoundingBox();
    made.computeBoundingSphere();
    geometry.dispose();

    return made;
}

// The skeleton its body's bound to (its sculpted skin's, which its folded pieces share)
function skeletonOf(beast) {
    let skeleton = null;

    beast.plan.object.traverse((node) => {
        skeleton ??= node.isSkinnedMesh ? node.skeleton : null;
    });

    return skeleton;
}

/**
 * A beast's kind's figure and its moves (world/crowd.js makingTemplate's), made a step at a time
 * (each a yield) from one of it built (`id`, a LOOKS id, one of its kind as `seed` has it: the
 * three it's built as, beast.js) at its kind's size (each drawn at its own: CrowdAvatar's `size`).
 */
export function* makingHerdTemplate(kit, key, { id, seed = 0 }) {
    const beast = yield* sculpting(() => new BeastAvatar(id, { seed }));

    try {
        beast.scale = 1;
        beast.plan.object.scale.setScalar(1);
        beast.place(0, 0, 0);
        beast.update(0, 0, 0, 0);

        const skeleton = skeletonOf(beast);
        const { geometry: merged, picture } = figureOf(
            {
                object: beast.plan.object,
                rig: { skeleton, bone: (name) => beast.character.rig.bone(name) },
                materials: { body: beast.plan.materials.body },
                garments: [],
                height: beast.plan.height,
            },
            HERD.picture,
        );

        yield;

        const geometry = welded(merged);

        yield;

        const recorded = yield* recordingHerdMoves(beast);

        return yield* templateFrom(kit, key, { geometry, picture, height: beast.plan.height, recorded });
    } finally {
        beast.dispose();
    }
}
