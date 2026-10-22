// What a coming model's clips sound like (lab/model-viewer.js plays them as its clips play): one
// that isn't in the game yet, where a creature's voice is heard as it fights (audio/sound.js), has
// its clips' sounds here, at moments of them, measured from its model.

// When a footfall's thud starts, after the foot comes down (s): the Kaiju's, its first 35 ms quiet
const THUD = 0.035;

// Each foot's footfall through a clip (`length` s long): the first of each foot's, and how often
const footfalls = (first, every, length) => first.flatMap((at) => Array.from({ length: Math.ceil((length - at) / every) }, (_, k) => [at + k * every - THUD, "kaijuStep"]));

// The Kaiju's four feet coming down as it walks, one way or another, and as it runs (measured from
// its clips: each foot at its lowest)
const KAIJU_WALK = footfalls([0.27, 1.63, 1.93, 3.27], 10 / 3, 10);

/**
 * Each coming model's clips' sounds, by its catalog id: each clip's, at moments of it (s), [when,
 * which, and whether that's when it's to be loudest ("peak") rather than when it starts]. The
 * Kaiju roars as its jaws open wide; cries out struck, and roars back; dies as it sinks, crashing
 * down as it hits the ground; growls now and then standing; draws breath as its glow charges,
 * loudest as it fires, and breathes its beam (beasts/beam.js); and each foot comes down heavily.
 */
export const CLIP_SOUNDS = Object.freeze({
    "beast-kaiju": {
        Idle: [
            [0.5, "kaijuGrowl"],
            [8.2, "kaijuGrowl"],
        ],
        Roar: [
            [1.5, "kaijuAttack"],
            [3.25, "kaijuCall"],
        ],
        "Hit React": [
            [1.6, "kaijuHurt"],
            [3.25, "kaijuCall"],
        ],
        Faint: [
            [0.4, "kaijuDeath"],
            [4.3, "deathThudBig", "peak"],
            [4.27, "kaijuStep"],
        ],
        "Energy Breath": [
            [1.3, "kaijuCharge", "peak"],
            [1.25, "kaijuBreath"],
        ],
        Walk: KAIJU_WALK,
        "Walk Left": KAIJU_WALK,
        "Walk Right": KAIJU_WALK,
        Run: footfalls([0.03, 0.17, 0.67, 0.83], 1, 10),
    },
});
