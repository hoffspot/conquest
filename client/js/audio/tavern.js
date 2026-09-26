// The tavern's music: a jig for Wenches and Ale's taproom, lively and led by a lute (played on a
// classical guitar's nylon strings, the nearest to a lute's gut: instruments.js), with an alto
// recorder, a frame drum and a tambourine. Upstairs it's the same tune, heard through the floor
// (sound.js muffles it).
//
// In 6/8 (two beats to a bar, each of three quavers), at 108 beats a minute; D Mixolydian (D
// major with a flattened seventh, C natural, as old dance tunes often are), with a third strain
// in B minor. Like a dance tune, each strain is eight bars, played twice:
//
//   intro (4 bars, strummed) · A (8) · A (8) · B (8) · B (8) · C (8, B minor) · C (8) · A on the
//   lute alone (8) · break (4, strummed, with the drums) · A (8) · B (8) · outro (4, ending on A,
//   which leads back into the intro's D, so it loops without a seam)
//
// The tunes are written out below, in quavers; the lute's accompaniment (a bass note on each beat
// and the chord between), its strumming and the drums are made from each strain's chords. Pure
// data, no Web Audio: sound.js plays it.

import { createRandom } from "../core/random.js";
import { chords, tune, voicing } from "./score.js";

/** Beats (dotted crotchets) a minute, and beats to a bar; each beat is three quavers. */
export const TAVERN_TEMPO = 108;
export const TAVERN_BEATS_PER_BAR = 2;

const QUAVER = 60 / TAVERN_TEMPO / 3;
const BAR = 6 * QUAVER;

// --- The tunes (in quavers: 1 a quaver, 2 a crotchet, 3 a dotted crotchet) ---

const A = tune(`
    D5:1 E5:1 F#5:1 A5:2 F#5:1 | G5:1 F#5:1 E5:1 C5:2 E5:1 | D5:1 E5:1 F#5:1 A5:1 B5:1 A5:1 | G5:1 E5:1 C5:1 D5:3 |
    D5:1 E5:1 F#5:1 A5:2 F#5:1 | G5:1 F#5:1 E5:1 C5:1 D5:1 E5:1 | E5:1 C5:1 A4:1 G4:2 A4:1 | F#4:1 A4:1 C5:1 D5:3`);
const A_CHORDS = chords("D C D G D C Am D");

const B = tune(`
    A5:2 A5:1 B5:1 A5:1 F#5:1 | G5:1 E5:1 C5:1 G5:2 E5:1 | F#5:1 A5:1 F#5:1 D5:1 F#5:1 A5:1 | B5:2 G5:1 E5:3 |
    A5:2 A5:1 B5:1 A5:1 F#5:1 | G5:1 A5:1 G5:1 E5:1 D5:1 C5:1 | B4:1 D5:1 G5:1 E5:1 C5:1 A4:1 | F#4:1 A4:1 C5:1 D5:3`);
const B_CHORDS = chords("D C D Em D C G D");

const C = tune(`
    B4:1 D5:1 F#5:1 B5:2 A5:1 | A5:1 G5:1 F#5:1 E5:2 C#5:1 | D5:1 E5:1 G5:1 B5:2 G5:1 | F#5:1 E5:1 D5:1 C#5:3 |
    B4:1 D5:1 F#5:1 B5:2 A5:1 | A5:1 B5:1 A5:1 G5:1 F#5:1 E5:1 | B4:1 D5:1 G5:1 F#5:1 E5:1 D5:1 | C#5:1 E5:1 G5:1 A5:3`);
const C_CHORDS = chords("Bm A G A Bm A G A");

const STRUMMED = chords("D C D A");

const OUTRO = tune(`D5:1 E5:1 F#5:1 A5:3 | G5:1 F#5:1 E5:1 C5:3 | D5:1 E5:1 F#5:1 D5:3 | C#5:1 E5:1 G5:1 A5:3`);

// The scales the harmony keeps to: D Mixolydian, and D major (for the B minor strain); over an
// A major chord, C is sharpened, as the chord has it
const MIXOLYDIAN = [2, 4, 6, 7, 9, 11, 0];
const MAJOR = [2, 4, 6, 7, 9, 11, 1];

// The lowest note each instrument plays (an alto recorder's is F4): a harmony that would go
// lower goes an octave up instead, above the tune
const LOWEST = { recorder: 65, guitar: 40 };

// The note a third below, in the scale
function thirdBelow(pitch, scale, chord) {
    const notes = chord === "A" ? scale.map((pc) => (pc === 0 ? 1 : pc)) : scale;
    let steps = 0;
    let below = pitch;

    while (steps < 2) {
        below--;

        if (notes.includes(below % 12)) {
            steps++;
        }
    }

    return below;
}

/**
 * Compose it: { tempo, beatsPerBar, length (seconds), sections: [{ name, bar, bars, start (s) }],
 * notes: [{ time (s), instrument, pitch (MIDI; a kind for drums), duration (s), velocity (0 to
 * 1) }] in time order }, as score.js's.
 */
export function composeTavern() {
    const random = createRandom(1437);
    const notes = [];
    const sections = [];
    let at = 0;

    // A note at a bar and quaver of the current section; a dance's lilt: each beat's first quaver
    // leant on, the others lighter
    const play = (instrument, bar, quaver, pitch, quavers, velocity, { exact = false } = {}) => {
        const nudge = exact ? 0 : (random.next() - 0.5) * 0.016;

        notes.push({
            time: Math.max(0, (at + bar) * BAR + quaver * QUAVER + nudge),
            instrument,
            pitch,
            duration: quavers * QUAVER,
            velocity: Math.min(1, velocity * (exact ? 1 : 0.94 + random.next() * 0.12)),
        });
    };
    const lilt = (quaver) => (quaver % 3 === 0 ? 1.08 : 0.9);

    // A tune on an instrument; on the lute, its long notes played with a second voice a third
    // below, as a lutenist would
    const melody = (instrument, notesOfTune, names, velocity, { shift = 0, scale = MIXOLYDIAN, doubled = false } = {}) => {
        let quaver = 0;

        for (const [pitch, quavers] of notesOfTune) {
            const bar = Math.floor(quaver / 6);
            const within = quaver % 6;

            if (pitch !== null) {
                play(instrument, bar, within, pitch + shift, quavers * 0.95, velocity * lilt(within));

                if (doubled && quavers >= 2) {
                    play(instrument, bar, within + 0.02, thirdBelow(pitch, scale, names[bar]) + shift, quavers * 0.95, velocity * 0.55);
                }
            }

            quaver += quavers;
        }
    };
    const harmony = (instrument, notesOfTune, names, velocity, scale = MIXOLYDIAN) => {
        let quaver = 0;

        for (const [pitch, quavers] of notesOfTune) {
            const bar = Math.floor(quaver / 6);

            if (pitch !== null) {
                const below = thirdBelow(pitch, scale, names[bar]);

                play(instrument, bar, quaver % 6, below < LOWEST[instrument] ? below + 12 : below, quavers * 0.95, velocity * lilt(quaver % 6));
            }

            quaver += quavers;
        }
    };

    // The lute's accompaniment: the chord's root on the first beat and its fifth on the second
    // (low), the chord between (higher, lighter)
    const accompany = (names, velocity) => names.forEach((name, bar) => {
        const low = voicing(name, 40);
        const chord = voicing(name, 54);

        play("guitar", bar, 0, low.root, 2, velocity);
        play("guitar", bar, 3, low.root + 7 > 52 ? low.root - 5 : low.root + 7, 2, velocity * 0.85);

        for (const quaver of [2, 5]) {
            [chord.root, chord.third, chord.fifth].forEach((pitch, k) => play("guitar", bar, quaver + k * 0.07, pitch, 1, velocity * 0.5));
        }
    });

    // Strummed: down on each beat, the whole chord; up on its last quaver, lighter
    const strum = (names, velocity) => names.forEach((name, bar) => {
        const low = voicing(name, 40);
        const chord = voicing(name, 54);
        const strings = [low.root, low.root + 7, chord.root + 12, chord.third, chord.fifth];

        for (const [quaver, level, down] of [[0, 1, true], [2, 0.55, false], [3, 0.9, true], [5, 0.55, false]]) {
            const order = down ? strings : strings.slice(2).reverse();

            order.forEach((pitch, k) => play("guitar", bar, quaver + k * 0.1, pitch, 2, velocity * level * (k === 0 ? 1 : 0.75)));
        }
    });

    // The recorder holding the chord's third through each bar, under a tune
    const counter = (names, velocity) => names.forEach((name, bar) => play("recorder", bar, 0, voicing(name, 64).third, 5.8, velocity));

    // The drums: the frame drum low on each beat and high on its last quaver, the tambourine on
    // the off-beats ("light": the drum's first beat and the tambourine only); a run of high hits
    // into every eighth bar's end
    const drums = (bars, style, velocity, { fills = false } = {}) => {
        for (let bar = 0; bar < bars; bar++) {
            const hit = (quaver, kind, level) => play("drum", bar, quaver, kind, 1, velocity * level, { exact: true });
            const jingle = (quaver, level) => play("tambourine", bar, quaver, "hit", 1, velocity * level, { exact: true });

            if (style === "light") {
                hit(0, "low", 0.8);
                jingle(2, 0.45);
                jingle(5, 0.45);
            } else {
                hit(0, "low", 1);
                hit(2, "high", 0.45);
                hit(3, "low", 0.8);
                hit(5, "high", 0.5);
                jingle(1, 0.35);
                jingle(2, 0.6);
                jingle(4, 0.35);
                jingle(5, 0.65);
            }

            if (fills && bar % 8 === 7) {
                hit(3, "high", 0.6);
                hit(4, "high", 0.65);
                hit(5, "low", 0.8);
            }
        }
    };

    const section = (name, names, parts) => {
        sections.push({ name, bar: at, bars: names.length, start: at * BAR });
        parts(names);
        at += names.length;
    };

    section("intro", STRUMMED, (names) => {
        strum(names, 0.5);
        drums(names.length, "light", 0.45);
    });
    section("A", A_CHORDS, (names) => {
        melody("guitar", A, names, 0.85, { doubled: true });
        accompany(names, 0.5);
        drums(names.length, "light", 0.5);
    });
    section("A again", A_CHORDS, (names) => {
        melody("guitar", A, names, 0.85, { doubled: true });
        harmony("recorder", A, names, 0.4);
        accompany(names, 0.5);
        drums(names.length, "full", 0.55);
    });
    section("B", B_CHORDS, (names) => {
        melody("guitar", B, names, 0.9, { doubled: true });
        counter(names, 0.28);
        accompany(names, 0.52);
        drums(names.length, "full", 0.6);
    });
    section("B again", B_CHORDS, (names) => {
        melody("recorder", B, names, 0.62);
        melody("guitar", B, names, 0.5, { shift: -12 });
        accompany(names, 0.5);
        drums(names.length, "full", 0.6, { fills: true });
    });
    section("C", C_CHORDS, (names) => {
        melody("guitar", C, names, 0.85, { doubled: true, scale: MAJOR });
        accompany(names, 0.48);
        drums(names.length, "light", 0.5);
    });
    section("C again", C_CHORDS, (names) => {
        melody("recorder", C, names, 0.6);
        harmony("guitar", C, names, 0.55, MAJOR);
        accompany(names, 0.48);
        drums(names.length, "full", 0.55);
    });
    section("A on the lute", A_CHORDS, (names) => {
        melody("guitar", A, names, 0.8, { doubled: true });
        names.forEach((name, bar) => play("guitar", bar, 0, voicing(name, 40).root, 5, 0.45));
    });
    section("break", STRUMMED, (names) => {
        strum(names, 0.6);
        drums(names.length, "full", 0.65, { fills: true });
        play("drum", 3, 3, "high", 1, 0.5, { exact: true });
        play("drum", 3, 4, "high", 1, 0.55, { exact: true });
        play("drum", 3, 5, "low", 1, 0.65, { exact: true });
    });
    section("last A", A_CHORDS, (names) => {
        melody("guitar", A, names, 0.9, { doubled: true });
        melody("recorder", A, names, 0.5);
        accompany(names, 0.52);
        drums(names.length, "full", 0.65);
    });
    section("last B", B_CHORDS, (names) => {
        melody("guitar", B, names, 0.92, { doubled: true });
        harmony("recorder", B, names, 0.45);
        accompany(names, 0.55);
        drums(names.length, "full", 0.7, { fills: true });
    });
    section("outro", STRUMMED, (names) => {
        melody("guitar", OUTRO, names, 0.8, { doubled: true });
        accompany(names, 0.45);
        drums(names.length, "light", 0.5);
    });

    notes.sort((a, b) => a.time - b.time);

    return { tempo: TAVERN_TEMPO, beatsPerBar: TAVERN_BEATS_PER_BAR, length: at * BAR, sections, notes };
}

/** The tavern's music, composed once. */
export const TAVERN = composeTavern();
