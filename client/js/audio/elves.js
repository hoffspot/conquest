// The elves' music: what's heard in their old forests (sound.js LANDS), woodsy and calm. A
// flute's tune over a folk harp rippling in 6/8, a recorder answering it, a section of violins
// holding the chords softly, and hand chimes now and then, like light through leaves; no drums.
//
// F Lydian (F major with a bright B natural: the G major chord its own), in 6/8 at 56 dotted
// crotchets a minute (168 quavers, the beats here), two minutes:
//
//   intro (4 bars, the harp) · A (8, the flute) · A (8, the recorder, the flute under it) · B (8,
//   towards D minor) · A (8, the harp alone) · B (8) · A (8, everyone) · outro (4, ending on C,
//   which leads back into the intro's F, so it loops without a seam)
//
// The tunes are written out below, in quavers; the rest is made from each section's chords. Pure
// data, no Web Audio: sound.js plays it.

import { chords, tune, voicing } from "./score.js";
import { harmony, writing } from "./writing.js";

// F Lydian's notes (F G A B C D E)
const LYDIAN = [5, 7, 9, 11, 0, 2, 4];

// --- The tunes (in quavers: 1 a quaver, 2 a crotchet, 3 a dotted crotchet) ---

const A = tune(`
    C5:3 A4:2 G4:1 | B4:3 D5:2 B4:1 | A4:2 C5:1 F5:3 | E5:2 D5:1 C5:3 |
    A4:3 C5:2 D5:1 | D5:2 E5:1 D5:2 B4:1 | C5:2 B4:1 A4:2 G4:1 | F4:6`);
const A_CHORDS = chords("F G F C F G Am F");

const B = tune(`
    A4:3 D5:3 | C5:2 B4:1 A4:3 | B4:3 G4:2 A4:1 | C5:2 E5:1 G5:3 |
    F5:3 E5:2 D5:1 | E5:3 B4:3 | D5:2 C5:1 B4:2 A4:1 | G4:6`);
const B_CHORDS = chords("Dm Am G C Dm Em G C");

const INTRO_CHORDS = chords("F G F G");

const OUTRO = tune(`C5:3 A4:3 | B4:3 D5:3 | C5:3 A4:2 F4:1 | G4:6`);
const OUTRO_CHORDS = chords("F G F C");

/** Compose it, as score.js compose. */
export function composeElves() {
    const { play, melody, section, done } = writing({ tempo: 168, beatsPerBar: 6, seed: 1701 });

    // The harp rippling up and down the chord in quavers: root, fifth, octave, tenth, octave, fifth
    const harp = (names, velocity) => names.forEach((name, bar) => {
        const { root, third } = voicing(name, 45);

        [root, root + 7, root + 12, third + 12, root + 12, root + 7].forEach((pitch, k) => play("harp", bar, k, pitch, 1, velocity * (k === 0 ? 1 : 0.78)));
    });
    // The violins holding the chord's third and fifth through each bar, softly
    const strings = (names, velocity) => names.forEach((name, bar) => {
        const { third, fifth } = voicing(name, 62);

        play("violins", bar, 0, third, 5.9, velocity);
        play("violins", bar, 0, fifth, 5.9, velocity * 0.85);
    });
    // Hand chimes ringing the chord's root and fifth high up, every `every` bars
    const chimes = (names, velocity, every = 4) => names.forEach((name, bar) => {
        if (bar % every === 0) {
            const { root, fifth } = voicing(name, 77);

            play("chimes", bar, 0, root, 3, velocity);
            play("chimes", bar, 1.5, fifth, 3, velocity * 0.75);
        }
    });

    section("intro", INTRO_CHORDS, (names) => {
        harp(names, 0.5);
        strings(names, 0.2);
        chimes(names, 0.32, 2);
    });
    section("A", A_CHORDS, (names) => {
        melody("flute", A, 0.62);
        harp(names, 0.45);
        strings(names, 0.22);
    });
    section("A", A_CHORDS, (names) => {
        melody("recorder", A, 0.6);
        melody("flute", harmony(A, LYDIAN, { lowest: 60 }), 0.4);
        harp(names, 0.45);
        strings(names, 0.24);
        chimes(names, 0.28);
    });
    section("B", B_CHORDS, (names) => {
        melody("flute", B, 0.64);
        harp(names, 0.42);
        strings(names, 0.3);
        chimes(names, 0.3, 2);
    });
    section("A on the harp", A_CHORDS, (names) => {
        melody("harp", A, 0.6);
        strings(names, 0.2);
        chimes(names, 0.25);
    });
    section("B", B_CHORDS, (names) => {
        melody("recorder", B, 0.6);
        melody("flute", harmony(B, LYDIAN, { lowest: 60 }), 0.4);
        harp(names, 0.45);
        strings(names, 0.28);
    });
    section("A", A_CHORDS, (names) => {
        melody("flute", A, 0.68);
        melody("recorder", harmony(A, LYDIAN, { lowest: 65 }), 0.42);
        harp(names, 0.48);
        strings(names, 0.3);
        chimes(names, 0.32, 2);
    });
    section("outro", OUTRO_CHORDS, (names) => {
        melody("flute", OUTRO, 0.55);
        harp(names, 0.42);
        strings(names, 0.2);
    });

    return done();
}

/** The elves' music, composed once. */
export const ELVES = composeElves();
