// Made by scripts/build-sounds.js (npm run build:sounds): don't edit it by hand.
//
// The sounds recorded rather than made, in client/sounds, played instead of synth.js's of the same
// names once they're downloaded: footsteps on each footing, cut from recordings by Nox_Sound on
// Freesound (CC0: public domain), https://freesound.org/people/Nox_Sound/.

/** How loud each recording's made (its loudest 30 ms, as RMS: dsp.js loudness). */
export const RECORDED_LEVEL = 0.1;

/** Each recorded sound's variants (a synth.js SOUNDS name → files in client/sounds). */
export const RECORDED = Object.freeze({
    stepGrass: [
        "step-grass-1.1b3723da.mp3",
        "step-grass-2.53007b05.mp3",
        "step-grass-3.6bc8b51c.mp3",
        "step-grass-4.506cce84.mp3",
        "step-grass-5.823510f4.mp3",
        "step-grass-6.09331791.mp3",
    ],
    stepDirt: [
        "step-dirt-1.779e8719.mp3",
        "step-dirt-2.40bbc218.mp3",
        "step-dirt-3.528d6f9f.mp3",
        "step-dirt-4.057e2e32.mp3",
        "step-dirt-5.5db9c248.mp3",
        "step-dirt-6.79e860fc.mp3",
    ],
    stepStone: [
        "step-stone-1.be3548ca.mp3",
        "step-stone-2.2813f3a5.mp3",
        "step-stone-3.6bd244ad.mp3",
        "step-stone-4.fdf8dc64.mp3",
        "step-stone-5.bb46d86a.mp3",
        "step-stone-6.f5de1e50.mp3",
    ],
    stepWood: [
        "step-wood-1.48da0d0c.mp3",
        "step-wood-2.48060753.mp3",
        "step-wood-3.9dddc5d0.mp3",
        "step-wood-4.0758080e.mp3",
        "step-wood-5.4087fb2f.mp3",
        "step-wood-6.51a50469.mp3",
    ],
    stepSand: [
        "step-sand-1.2ca22ae1.mp3",
        "step-sand-2.b5adcbc1.mp3",
        "step-sand-3.a580ffcf.mp3",
        "step-sand-4.5bd2035e.mp3",
        "step-sand-5.e2b30149.mp3",
        "step-sand-6.3851a202.mp3",
    ],
    stepSnow: [
        "step-snow-1.43634bd9.mp3",
        "step-snow-2.c95cbb2d.mp3",
        "step-snow-3.da2cf652.mp3",
        "step-snow-4.98186820.mp3",
    ],
    stepGravel: [
        "step-gravel-1.9302eeab.mp3",
        "step-gravel-2.f05a1f79.mp3",
        "step-gravel-3.bca1e20a.mp3",
        "step-gravel-4.00aa0d2d.mp3",
        "step-gravel-5.92f9b6ab.mp3",
        "step-gravel-6.e060d839.mp3",
    ],
    stepMud: [
        "step-mud-1.93a262a2.mp3",
        "step-mud-2.aa8cd86b.mp3",
        "step-mud-3.a6eaa924.mp3",
        "step-mud-4.4f4fab9a.mp3",
        "step-mud-5.b315a51a.mp3",
        "step-mud-6.341a3415.mp3",
    ],
    stepLeaves: [
        "step-leaves-1.e19aee2a.mp3",
        "step-leaves-2.f9628681.mp3",
        "step-leaves-3.748b3408.mp3",
        "step-leaves-4.954f665b.mp3",
        "step-leaves-5.3f6015c3.mp3",
        "step-leaves-6.3da5350c.mp3",
    ],
    stepWater: [
        "step-water-1.53f8873f.mp3",
        "step-water-2.254af61d.mp3",
        "step-water-3.e702c6dd.mp3",
        "step-water-4.26642221.mp3",
        "step-water-5.88b85f10.mp3",
    ],
});
