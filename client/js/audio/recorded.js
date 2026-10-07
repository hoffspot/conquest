// Made by scripts/build-sounds.js (npm run build:sounds): don't edit it by hand.
//
// The sounds recorded rather than made, in client/sounds, played instead of synth.js's of the same
// names once they're downloaded: footsteps on each footing, cut from recordings by Nox_Sound on
// Freesound (CC0: public domain), https://freesound.org/people/Nox_Sound/.

/** How loud each recording's made (its loudest 30 ms, as RMS: dsp.js loudness). */
export const RECORDED_LEVEL = 0.1;

/** Each recorded sound's variants (a synth.js SOUNDS name → [{ file in client/sounds, from: a SOURCES id }]). */
export const RECORDED = Object.freeze({
    stepGrass: [
        { file: "step-grass-1.1b3723da.mp3", from: 556042 },
        { file: "step-grass-2.53007b05.mp3", from: 556042 },
        { file: "step-grass-3.6bc8b51c.mp3", from: 556042 },
        { file: "step-grass-4.506cce84.mp3", from: 556042 },
        { file: "step-grass-5.823510f4.mp3", from: 556042 },
        { file: "step-grass-6.09331791.mp3", from: 556042 },
    ],
    stepDirt: [
        { file: "step-dirt-1.779e8719.mp3", from: 490951 },
        { file: "step-dirt-2.40bbc218.mp3", from: 490951 },
        { file: "step-dirt-3.528d6f9f.mp3", from: 490951 },
        { file: "step-dirt-4.057e2e32.mp3", from: 490951 },
        { file: "step-dirt-5.5db9c248.mp3", from: 490951 },
        { file: "step-dirt-6.79e860fc.mp3", from: 530384 },
    ],
    stepStone: [
        { file: "step-stone-1.be3548ca.mp3", from: 558472 },
        { file: "step-stone-2.2813f3a5.mp3", from: 558472 },
        { file: "step-stone-3.6bd244ad.mp3", from: 558472 },
        { file: "step-stone-4.fdf8dc64.mp3", from: 558472 },
        { file: "step-stone-5.bb46d86a.mp3", from: 558472 },
        { file: "step-stone-6.f5de1e50.mp3", from: 558472 },
    ],
    stepWood: [
        { file: "step-wood-1.48da0d0c.mp3", from: 543685 },
        { file: "step-wood-2.48060753.mp3", from: 543685 },
        { file: "step-wood-3.9dddc5d0.mp3", from: 543685 },
        { file: "step-wood-4.0758080e.mp3", from: 543685 },
        { file: "step-wood-5.4087fb2f.mp3", from: 543685 },
        { file: "step-wood-6.51a50469.mp3", from: 543685 },
    ],
    stepSand: [
        { file: "step-sand-1.2ca22ae1.mp3", from: 564893 },
        { file: "step-sand-2.b5adcbc1.mp3", from: 564893 },
        { file: "step-sand-3.a580ffcf.mp3", from: 564893 },
        { file: "step-sand-4.5bd2035e.mp3", from: 564893 },
        { file: "step-sand-5.e2b30149.mp3", from: 564893 },
        { file: "step-sand-6.3851a202.mp3", from: 564893 },
    ],
    stepSnow: [
        { file: "step-snow-1.43634bd9.mp3", from: 613849 },
        { file: "step-snow-2.c95cbb2d.mp3", from: 613849 },
        { file: "step-snow-3.da2cf652.mp3", from: 613849 },
        { file: "step-snow-4.98186820.mp3", from: 613849 },
    ],
    stepGravel: [
        { file: "step-gravel-1.9302eeab.mp3", from: 556002 },
        { file: "step-gravel-2.f05a1f79.mp3", from: 556002 },
        { file: "step-gravel-3.bca1e20a.mp3", from: 556002 },
        { file: "step-gravel-4.00aa0d2d.mp3", from: 556002 },
        { file: "step-gravel-5.92f9b6ab.mp3", from: 556002 },
        { file: "step-gravel-6.e060d839.mp3", from: 556002 },
    ],
    stepMud: [
        { file: "step-mud-1.93a262a2.mp3", from: 548384 },
        { file: "step-mud-2.aa8cd86b.mp3", from: 548384 },
        { file: "step-mud-3.a6eaa924.mp3", from: 548384 },
        { file: "step-mud-4.4f4fab9a.mp3", from: 548384 },
        { file: "step-mud-5.b315a51a.mp3", from: 548384 },
        { file: "step-mud-6.341a3415.mp3", from: 548384 },
    ],
    stepLeaves: [
        { file: "step-leaves-1.e19aee2a.mp3", from: 496420 },
        { file: "step-leaves-2.f9628681.mp3", from: 496420 },
        { file: "step-leaves-3.748b3408.mp3", from: 496420 },
        { file: "step-leaves-4.954f665b.mp3", from: 496420 },
        { file: "step-leaves-5.3f6015c3.mp3", from: 496420 },
        { file: "step-leaves-6.3da5350c.mp3", from: 496420 },
    ],
    stepWater: [
        { file: "step-water-1.53f8873f.mp3", from: 490951 },
        { file: "step-water-2.254af61d.mp3", from: 490951 },
        { file: "step-water-3.e702c6dd.mp3", from: 490951 },
        { file: "step-water-4.26642221.mp3", from: 490951 },
        { file: "step-water-5.88b85f10.mp3", from: 490951 },
    ],
});

/** The recordings they're cut from, by Freesound id: what each is, who recorded it, where it is, its licence. */
export const SOURCES = Object.freeze({
    490951: { title: "Footsteps_Walk.wav", by: "Nox_Sound", page: "https://freesound.org/s/490951/", licence: "CC0" },
    496420: { title: "Footsteps_Leaves_Stereo.wav", by: "Nox_Sound", page: "https://freesound.org/s/496420/", licence: "CC0" },
    530384: { title: "Footsteps_Boots_Gritty_Ground_Stones_Leaves_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/530384/", licence: "CC0" },
    543685: { title: "Footsteps_Wood_Walk_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/543685/", licence: "CC0" },
    548384: { title: "Footsteps_Mountain_Boots_Mud_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/548384/", licence: "CC0" },
    556002: { title: "Footsteps_Mountain_Boots_Gravel_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/556002/", licence: "CC0" },
    556042: { title: "Footsteps_Mountain_Boots_Grass_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/556042/", licence: "CC0" },
    558472: { title: "Footsteps_Mountain_Boots_Rock_Walk_Sequence_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/558472/", licence: "CC0" },
    564893: { title: "Footsteps_Mountain_Boots_Wet_Sand_Sequence_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/564893/", licence: "CC0" },
    613849: { title: "Footsteps_Mountain_Boots_Snow_Walk_Mono.wav", by: "Nox_Sound", page: "https://freesound.org/s/613849/", licence: "CC0" },
});
