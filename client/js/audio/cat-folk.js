// The cat folk's music: what's heard on their savannah (sound.js LANDS), warm and sunlit. A
// kalimba's (a thumb piano's) rippling figure, its low tines for a bass, under an ocarina and a
// balafon (a West African xylophone, played with soft mallets) trading tunes; hand drums, bongos
// and a conga, and a small shaker keeping it moving.
//
// G major, its tunes on its five-note scale (G A B D E: no half steps, so nothing jars), 4/4 at
// 104 beats a minute, written in quavers (208 a minute, eight to a bar), two minutes:
//
//   intro (4 bars, the drums and the kalimba) · A (8, the ocarina) · A (8, the balafon, the
//   ocarina over it) · B (8, the balafon) · the drums (4) · A (8, everyone) · B (8, the ocarina)
//   · outro (4, ending on D, which leads back into the intro's G, so it loops without a seam)
//
// The tunes are written out below, in quavers; the rest is made from each section's chords. Pure
// data, no Web Audio: sound.js plays it.

import { chords, tune, voicing } from "./score.js";
import { harmony, writing } from "./writing.js";

// The five notes, for harmonising a tune in them: two of them below each of its notes (a third
// or a fourth, open sounding, never a clash)
const FIVE = [7, 9, 11, 2, 4];

// --- The tunes (in quavers) ---

const A = tune(`
    B4:1 D5:1 E5:2 D5:1 B4:1 D5:2 | E5:1 G5:1 A5:2 G5:1 E5:1 D5:2 | B4:1 D5:1 E5:1 G5:1 E5:2 D5:2 | A4:2 B4:1 A4:1 D5:4 |
    B4:1 D5:1 E5:2 D5:1 B4:1 D5:2 | E5:1 G5:1 A5:2 B5:1 A5:1 G5:2 | E5:1 D5:1 E5:1 G5:1 E5:2 B4:2 | A4:1 B4:1 D5:2 G5:4`);
const A_CHORDS = chords("G C G D G C Em G");

const B = tune(`
    E5:2 G5:1 E5:1 D5:2 B4:2 | E5:1 D5:1 E5:1 G5:1 A5:4 | G5:2 E5:1 D5:1 B4:2 D5:2 | A4:1 B4:1 D5:2 E5:1 D5:1 A4:2 |
    E5:2 G5:1 E5:1 D5:2 B4:2 | E5:1 D5:1 E5:1 G5:1 A5:2 G5:2 | A5:2 G5:1 E5:1 D5:2 E5:2 | D5:4 r:4`);
const B_CHORDS = chords("Em C G D Em C D D");

const INTRO_CHORDS = chords("G C G D");
const DRUMS_CHORDS = chords("G G G D");
const OUTRO_CHORDS = chords("G C G D");

/** Compose it, as score.js compose. */
export function composeCatFolk() {
    const { play, melody, section, done } = writing({ tempo: 208, beatsPerBar: 8, seed: 3131 });

    // The kalimba: the chord's root on a low tine, then rippling over it in quavers (root, fifth,
    // octave, fifth, tenth, fifth, octave, fifth), leaning on the first, fourth and seventh
    const kalimba = (names, velocity) => names.forEach((name, bar) => {
        const { root, third } = voicing(name, 55);

        play("kalimba", bar, 0, voicing(name, 43).root, 2, velocity * 0.9);
        [root, root + 7, root + 12, root + 7, third + 12, root + 7, root + 12, root + 7].forEach((pitch, k) => play("kalimba", bar, k, pitch, 1, velocity * ([0, 3, 6].includes(k) ? 1 : 0.7)));
    });
    // The hand drums: the conga's low tone on the bar and its open tone answering; the bongos
    // ticking along on each quaver, the high one open on the beats, muted between, the low one
    // on the offbeats; the shaker down and up. Busier (`full`) in the fuller sections
    const drums = (bars, velocity, { full = false, shaker = true } = {}) => {
        for (let bar = 0; bar < bars; bar++) {
            const hit = (instrument, quaver, kind, level) => play(instrument, bar, quaver, kind, 1, velocity * level, { exact: true });

            hit("conga", 0, "low", 1);
            hit("conga", 3, "open", 0.75);
            hit("conga", 6, "open", 0.7);

            for (let quaver = 0; quaver < 8; quaver++) {
                hit("bongos", quaver, quaver % 2 ? "muted" : "high", quaver % 2 ? 0.35 : 0.5);

                if (shaker) {
                    hit("shaker", quaver, quaver % 2 ? "up" : "down", 0.3);
                }
            }

            hit("bongos", 3, "low", 0.55);
            hit("bongos", 7, "low", 0.5);

            if (full) {
                hit("conga", 7, "low", 0.6);
                hit("bongos", 5, "low", 0.4);
            }
        }
    };

    section("intro", INTRO_CHORDS, (names) => {
        kalimba(names, 0.62);
        drums(names.length, 0.62, { shaker: false });
    });
    section("A", A_CHORDS, (names) => {
        melody("ocarina", A, 0.78);
        kalimba(names, 0.56);
        drums(names.length, 0.65);
    });
    section("A", A_CHORDS, (names) => {
        melody("balafon", A, 0.78);
        melody("ocarina", harmony(A, FIVE, { lowest: 69 }), 0.47);
        kalimba(names, 0.56);
        drums(names.length, 0.69);
    });
    section("B", B_CHORDS, (names) => {
        melody("balafon", B, 0.8);
        kalimba(names, 0.53);
        drums(names.length, 0.7, { full: true });
    });
    section("the drums", DRUMS_CHORDS, (names) => {
        names.forEach((name, bar) => play("kalimba", bar, 0, voicing(name, 43).root, 4, 0.56));
        drums(names.length, 0.78, { full: true });
    });
    section("A", A_CHORDS, (names) => {
        melody("ocarina", A, 0.83);
        melody("balafon", harmony(A, FIVE, { lowest: 61 }), 0.56);
        kalimba(names, 0.58);
        drums(names.length, 0.72, { full: true });
    });
    section("B", B_CHORDS, (names) => {
        melody("ocarina", B, 0.8);
        melody("balafon", harmony(B, FIVE, { lowest: 61 }), 0.53);
        kalimba(names, 0.55);
        drums(names.length, 0.7);
    });
    section("outro", OUTRO_CHORDS, (names) => {
        kalimba(names, 0.53);
        drums(names.length, 0.56, { shaker: false });
    });

    return done();
}

/** The cat folk's music, composed once. */
export const CAT_FOLK = composeCatFolk();
