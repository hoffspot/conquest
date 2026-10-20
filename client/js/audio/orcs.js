// The orcs' music: what's heard in their lands (sound.js LANDS), forward and assertive. War
// drums stamping (a big bass drum on the strong beats, a pair of toms answering it, the timpani
// on each bar's root), a section of cellos driving under them in quick, short notes, and the
// tune on French horns with tenor trombones an octave under them, low and heavy but held soft
// enough never to blare; in the middle, the brass calling and the drums answering.
//
// G minor (G Aeolian, its D chords major, so they lead home), 4/4 at 100 beats a minute, about a
// minute and a half:
//
//   the drums (4 bars, the brass holding G under them) · A (8, the horns and trombones) · A (8, in two parts) · the calls (8)
//   · A (8, everyone) · the turn (4, ending on D, which leads back into G minor at the start, so
//   it loops without a seam)
//
// The tunes are written out below; the rest is made from each section's chords. Pure data, no
// Web Audio: sound.js plays it.

import { chords, tune, voicing } from "./score.js";
import { harmony, writing } from "./writing.js";

// G minor's notes (G A Bb C D Eb F)
const MINOR = [7, 9, 10, 0, 2, 3, 5];

// --- The tunes ---

const A = tune(`
    G3:1.5 G3:0.5 D4:1 Bb3:1 | C4:1 Bb3:0.5 A3:0.5 G3:2 | G3:1.5 Bb3:0.5 C4:1 Bb3:1 | A3:1 C4:1 F3:2 |
    G3:1.5 G3:0.5 D4:1 D4:1 | C4:1 Bb3:0.5 A3:0.5 Bb3:1 G3:1 | Bb3:1 G3:1 Eb3:1 G3:1 | A3:1.5 G3:0.5 F#3:2`);
const A_CHORDS = chords("Gm Gm Eb F Gm Cm Eb D");

// The brass calling, a bar's rest after each for the drums to answer
const CALLS = tune(`G3:1 G3:1 Bb3:2 | r:4 | F3:1 F3:1 A3:2 | r:4 | Eb3:1 Eb3:1 G3:2 | r:4 | D3:1 F#3:1 A3:2 | r:4`);
const CALLS_CHORDS = chords("Gm Gm F F Eb Eb D D");

const DRUMS_CHORDS = chords("Gm Gm Gm D");

const TURN = tune(`G3:2 Bb3:2 | G3:2 Eb3:2 | D3:2 F#3:2 | A3:4`);
const TURN_CHORDS = chords("Gm Eb D D");

/** Compose it, as score.js compose. */
export function composeOrcs() {
    const { play, melody, section, done } = writing({ tempo: 100, beatsPerBar: 4, seed: 4040 });

    // The brass: the horns on the tune, the trombones an octave under them
    const brass = (notesOfTune, velocity) => {
        melody("horn", notesOfTune, velocity);
        melody("trombone", notesOfTune, velocity * 0.8, { shift: -12 });
    };
    // The cellos driving in quavers: root, root, a rest, root, fifth, a rest, octave, fifth (not
    // in a bar without a chord)
    const cellos = (names, velocity) => names.forEach((name, bar) => {
        if (!name) {
            return;
        }

        const { root } = voicing(name, 38);

        [root, root, null, root, root + 7, null, root + 12, root + 7].forEach((pitch, k) => pitch !== null && play("cello", bar, k * 0.5, pitch, 0.45, velocity * (k % 3 === 0 ? 1 : 0.8), { exact: true }));
    });
    // The war drums: the bass drum on one and three, the low tom on two and four, the high tom
    // answering on the offbeat; the timpani on the chord's root each bar; every fourth bar
    // the toms rolling into the next
    const stamp = (names, velocity, { full = false } = {}) => names.forEach((name, bar) => {
        const hit = (instrument, beat, kind, level) => play(instrument, bar, beat, kind, 0.5, velocity * level, { exact: true });

        hit("bassdrum", 0, "hit", 1);
        hit("bassdrum", 2, "hit", 0.9);
        hit("toms", 1, "low", 0.75);
        hit("toms", 3, "low", 0.75);
        hit("toms", 2.5, "high", 0.5);
        play("timpani", bar, 0, voicing(name, 38).root, 1, velocity * 0.85, { exact: true });

        if (full) {
            hit("bassdrum", 2.5, "hit", 0.6);
            hit("toms", 1.5, "high", 0.45);
        }

        if (bar % 4 === 3) {
            for (const [beat, kind] of [[3, "high"], [3.25, "high"], [3.5, "low"], [3.75, "low"]]) {
                hit("toms", beat, kind, 0.6);
            }
        }
    });
    // The drums answering the brass's calls: the toms and the bass drum through the bar's rest
    const answers = (names, velocity) => names.forEach((_, bar) => {
        if (bar % 2 === 1) {
            for (const [beat, instrument, kind] of [[0, "bassdrum", "hit"], [0.5, "toms", "low"], [1, "toms", "high"], [1.5, "toms", "low"], [2, "bassdrum", "hit"], [3, "toms", "high"], [3.5, "toms", "low"]]) {
                play(instrument, bar, beat, kind, 0.5, velocity * (instrument === "bassdrum" ? 1 : 0.7), { exact: true });
            }
        }
    });
    const bass = (names, velocity) => names.forEach((name, bar) => play("organ", bar, 0, voicing(name, 36).root, 3.9, velocity));
    // The brass holding the chord low, a bar each: the trombones its root, the horns its fifth
    const held = (names, velocity) => names.forEach((name, bar) => {
        const { root, fifth } = voicing(name, 43);

        play("trombone", bar, 0, root, 3.6, velocity);
        play("horn", bar, 0, fifth, 3.6, velocity * 0.8);
    });

    section("the drums", DRUMS_CHORDS, (names) => {
        stamp(names, 0.58);
        cellos(names, 0.5);
        held(names, 0.42);
    });
    section("A", A_CHORDS, (names) => {
        brass(A, 0.68);
        cellos(names, 0.55);
        stamp(names, 0.58);
    });
    section("A", A_CHORDS, (names) => {
        melody("horn", A, 0.66);
        melody("horn", harmony(A, MINOR, { lowest: 36 }), 0.5);
        melody("trombone", A, 0.5, { shift: -12 });
        cellos(names, 0.58);
        stamp(names, 0.6);
        bass(names, 0.35);
    });
    section("the calls", CALLS_CHORDS, (names) => {
        brass(CALLS, 0.72);
        answers(names, 0.6);
        cellos(names.map((name, bar) => (bar % 2 === 0 ? name : null)), 0.5);
        bass(names, 0.35);
    });
    section("A", A_CHORDS, (names) => {
        brass(A, 0.75);
        melody("horn", harmony(A, MINOR, { lowest: 36 }), 0.52);
        cellos(names, 0.62);
        stamp(names, 0.64, { full: true });
        bass(names, 0.4);
    });
    section("the turn", TURN_CHORDS, (names) => {
        brass(TURN, 0.68);
        cellos(names, 0.55);
        stamp(names, 0.58);
    });

    return done();
}

/** The orcs' music, composed once. */
export const ORCS = composeOrcs();
