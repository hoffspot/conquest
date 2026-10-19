// The dark elves' music: what's heard in their dark woods (sound.js LANDS), shadowy and
// unsettling. Slow, in a minor mode, over a pipe organ's low drone that never moves; tubular
// bells tolling now and then, far off; a flute low in its breathy register, a section of cellos,
// a bowed vibraphone's glassy held notes high above, and a folk harp's slow broken chords.
//
// E Phrygian (E minor with a flattened second, F natural: the F major chord over the drone's E
// is what unsettles), 4/4 at 60 beats a minute, a little over two minutes:
//
//   intro (4 bars, the drone and a bell) · A (8, the flute) · B (8, the cellos, the vibraphone
//   over them) · A (8, the flute, the cellos under it) · outro (4, back to the drone, ending on
//   E as it began, so it loops without a seam)
//
// The tunes are written out below; the rest is made from each section's chords. Pure data, no
// Web Audio: sound.js plays it.

import { chords, midi, tune, voicing } from "./score.js";
import { harmony, writing } from "./writing.js";

// E Phrygian's notes (E F G A B C D)
const PHRYGIAN = [4, 5, 7, 9, 11, 0, 2];

// --- The tunes ---

const A = tune(`
    B4:3 C5:1 | A4:2 G4:1 F4:1 | E4:3 r:1 | F4:2 A4:2 |
    G4:3 F4:1 | E4:2 F4:1 A4:1 | A4:2 G4:1 F4:1 | E4:3 r:1`);
const A_CHORDS = chords("Em F Em Dm Em F Dm Em");

const B = tune(`
    A3:2 C4:2 | B3:3 G3:1 | A3:2 F3:1 G3:1 | E3:3 r:1 |
    E4:2 D4:1 C4:1 | D4:2 F4:2 | E4:2 C4:1 A3:1 | B3:3 r:1`);
const B_CHORDS = chords("Am Em F Em Am Dm F Em");

// The vibraphone's held notes over B, a bar each
const GLASS = tune(`E5:3 r:1 | B4:3 r:1 | C5:3 r:1 | B4:3 r:1 | E5:3 r:1 | F5:3 r:1 | C5:3 r:1 | B4:3 r:1`);

const STILL = chords("Em Em F Em");

const OUTRO = tune(`B4:3 C5:1 | A4:2 G4:1 F4:1 | E4:3 r:1 | r:4`);

/** Compose it, as score.js compose. */
export function composeDarkElves() {
    const { play, melody, section, done } = writing({ tempo: 60, beatsPerBar: 4, seed: 666 });

    // The drone: the pipe organ's low E and the B above it, whatever the chord over it, sounded
    // again every two beats, each held on over the next's start, so it never stops
    const drone = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            for (const beat of [0, 2]) {
                play("pipeorgan", bar, beat, midi("E2"), 2.4, velocity, { exact: true });
                play("pipeorgan", bar, beat, midi("B2"), 2.4, velocity * 0.7, { exact: true });
            }
        }
    };
    // Two bells tolling far off, every `every` bars: E (or F over an F chord: a half step's rub)
    // on the bar's first beat, and softer, the B over it on its third
    const bells = (names, velocity, every = 4) => names.forEach((name, bar) => {
        if (bar % every === 0) {
            play("bells", bar, 0, name === "F" ? midi("F4") : midi("E4"), 3, velocity);
            play("bells", bar, 2, midi("B4"), 2, velocity * 0.7);
        }
    });
    // The harp's slow broken chord, low: root, fifth, octave, tenth, a crotchet each
    const harp = (names, velocity) => names.forEach((name, bar) => {
        const { root, third } = voicing(name, 40);

        [root, root + 7, root + 12, third + 12].forEach((pitch, k) => play("harp", bar, k, pitch, 1, velocity * (k === 0 ? 1 : 0.75)));
    });

    section("intro", STILL, (names) => {
        drone(names.length, 0.4);
        bells(names, 0.3, 2);
    });
    section("A", A_CHORDS, (names) => {
        melody("flute", A, 0.55);
        harp(names, 0.38);
        drone(names.length, 0.36);
        bells(names, 0.26);
    });
    section("B", B_CHORDS, (names) => {
        melody("celli", B, 0.55);
        melody("vibes", GLASS, 0.3);
        harp(names, 0.32);
        drone(names.length, 0.36);
        bells(names, 0.26);
    });
    section("A", A_CHORDS, (names) => {
        melody("flute", A, 0.58);
        melody("celli", harmony(A, PHRYGIAN, { steps: 5 }), 0.4, { shift: -12 });
        melody("vibes", GLASS, 0.22);
        harp(names, 0.36);
        drone(names.length, 0.38);
        bells(names, 0.28, 2);
    });
    section("outro", STILL, (names) => {
        melody("flute", OUTRO, 0.45);
        drone(names.length, 0.36);
        bells(names, 0.3, 2);
    });

    return done();
}

/** The dark elves' music, composed once. */
export const DARK_ELVES = composeDarkElves();
