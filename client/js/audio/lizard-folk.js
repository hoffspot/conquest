// The lizard folk's music: what's heard in their jungles and marshes (sound.js LANDS), humid and
// hypnotic. A marimba's figure going round and round, the same each bar but for the chord under
// it (grouped three, three and two, so it sways), over a pipe organ's low drone on A; a slit drum (a
// hollowed log) and a shaker, softly; a flute's long, slow notes floating over it all, and the
// cellos taking up its tune low down.
//
// A Dorian (A minor with a bright F sharp), 4/4 at 88 beats a minute, written in quavers (176 a
// minute, eight to a bar), a little over two minutes:
//
//   intro (4 bars, the drone and the marimba) · A (8, the flute) · A (8, the cellos) · B (8,
//   the flute) · A (8, the flute and the cellos) · B (8, the marimba) · outro (4, the drone and
//   the marimba on A, as it began, so it loops without a seam)
//
// The tunes are written out below, in quavers; the rest is made from each section's chords. Pure
// data, no Web Audio: sound.js plays it.

import { chords, midi, tune, voicing } from "./score.js";
import { writing } from "./writing.js";

// --- The tunes (in quavers) ---

const A = tune(`
    E5:6 D5:2 | C5:4 B4:2 A4:2 | B4:6 D5:2 | G4:8 |
    F#4:4 A4:4 | D5:6 E5:2 | C5:4 B4:2 G4:2 | A4:8`);
const A_CHORDS = chords("Am Am G G D D Am Am");

const B = tune(`
    G5:4 E5:4 | C5:6 D5:2 | B4:4 D5:2 B4:2 | A4:8 |
    A4:4 D5:4 | F#5:6 E5:2 | G5:4 E5:2 D5:2 | B4:8`);
const B_CHORDS = chords("C C G G D D Em Em");

const STILL = chords("Am Am Am Am");

/** Compose it, as score.js compose. */
export function composeLizardFolk() {
    const { play, melody, section, done } = writing({ tempo: 176, beatsPerBar: 8, seed: 1519 });

    // The marimba's figure: root, fifth, octave, tenth, octave, fifth, ninth, fifth, leaning on
    // the first, fourth and seventh quavers; and its low root on those three
    const marimba = (names, velocity) => names.forEach((name, bar) => {
        const { root, third } = voicing(name, 55);
        const level = typeof velocity === "function" ? velocity(bar) : velocity;

        [root, root + 7, root + 12, third + 12, root + 12, root + 7, root + 14, root + 7].forEach((pitch, k) => play("marimba", bar, k, pitch, 1, level * ([0, 3, 6].includes(k) ? 1 : 0.68)));

        for (const quaver of [0, 3, 6]) {
            play("marimba", bar, quaver, voicing(name, 43).root, 1, level * 0.75);
        }
    });
    // The drone: the pipe organ's A and the E above it, held through each bar, whatever the chord
    const drone = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            play("pipeorgan", bar, 0, midi("A2"), 7.9, velocity, { exact: true });
            play("pipeorgan", bar, 0, midi("E3"), 7.9, velocity * 0.7, { exact: true });
        }
    };
    // The slit drum's two tones and the shaker, softly
    const drums = (bars, velocity, { shaker = true } = {}) => {
        for (let bar = 0; bar < bars; bar++) {
            const hit = (instrument, quaver, kind, level) => play(instrument, bar, quaver, kind, 1, velocity * level, { exact: true });

            hit("slitdrum", 0, "low", 1);
            hit("slitdrum", 3, "high", 0.6);
            hit("slitdrum", 5, "high", 0.5);
            hit("slitdrum", 6, "low", 0.7);

            if (shaker) {
                for (let quaver = 0; quaver < 8; quaver++) {
                    hit("shaker", quaver, quaver % 2 ? "up" : "down", quaver % 2 ? 0.32 : 0.22);
                }
            }
        }
    };

    section("intro", STILL, (names) => {
        drone(names.length, 0.32);
        marimba(names, (bar) => 0.3 + bar * 0.05);
        drums(names.length, 0.4, { shaker: false });
    });
    section("A", A_CHORDS, (names) => {
        melody("flute", A, 0.55);
        marimba(names, 0.46);
        drone(names.length, 0.32);
        drums(names.length, 0.45);
    });
    section("A", A_CHORDS, (names) => {
        melody("celli", A, 0.5, { shift: -12 });
        marimba(names, 0.46);
        drone(names.length, 0.3);
        drums(names.length, 0.45);
    });
    section("B", B_CHORDS, (names) => {
        melody("flute", B, 0.56);
        marimba(names, 0.44);
        drone(names.length, 0.32);
        drums(names.length, 0.48);
    });
    section("A", A_CHORDS, (names) => {
        melody("flute", A, 0.58);
        melody("celli", A, 0.4, { shift: -12 });
        marimba(names, 0.46);
        drone(names.length, 0.34);
        drums(names.length, 0.5);
    });
    section("B on the marimba", B_CHORDS, (names) => {
        melody("marimba", B, 0.6, { legato: 0.5 });
        marimba(names, 0.34);
        melody("celli", B, 0.32, { shift: -12 });
        drone(names.length, 0.3);
        drums(names.length, 0.45);
    });
    section("outro", STILL, (names) => {
        drone(names.length, 0.3);
        marimba(names, (bar) => 0.42 - bar * 0.04);
        drums(names.length, 0.36, { shaker: false });
    });

    return done();
}

/** The lizard folk's music, composed once. */
export const LIZARD_FOLK = composeLizardFolk();
