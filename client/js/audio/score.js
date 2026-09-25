// The music: an original ballad for a bard, in the spirit of the songs in 1985's The Bard's Tale
// (short, modal, folk-like tunes, played there on home computers' sound chips) but played by a
// band of real, old instruments (instruments.js): a recorder, an ocarina, a folk harp, a
// strumstick (a small plucked folk instrument, for a lute), a Renaissance organ, hand chimes, a
// frame drum and a tambourine, with harpsichord arpeggios in the bridge.
//
// D Dorian (D minor with a bright B natural), 3/4 at 96 beats a minute, four minutes:
//
//   intro (8 bars) · verse (16) · chorus (16) · verse (16) · chorus (16) · bridge (16, towards F
//   major) · quiet verse (16) · last chorus (16) · outro (8, ending on A, which leads back into
//   the intro's D minor, so it loops without a seam)
//
// The tunes are written out below; the accompaniment (arpeggios, strumming, the organ's bass
// and chords, drums) is made from each section's chords. Pure data, no Web Audio: sound.js plays it.

import { createRandom } from "../core/random.js";

/** Beats a minute, and beats to a bar. */
export const TEMPO = 96;
export const BEATS_PER_BAR = 3;

const BEAT = 60 / TEMPO;
const BAR = BEATS_PER_BAR * BEAT;

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note's MIDI number from its name: "D4" is 62, "C#5" 73, "Bb3" 58. */
export function midi(name) {
    const [, letter, accidental, octave] = /^([A-G])([#b]?)(-?\d)$/.exec(name);

    return 12 * (Number(octave) + 1) + LETTERS[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
}

// A tune written as notes and how many beats each lasts ("r" rests), bars between |s
const tune = (text) => text.split(/\s+/).filter((token) => token && token !== "|").map((token) => {
    const [name, beats] = token.split(":");

    return [name === "r" ? null : midi(name), Number(beats)];
});

// Chords: the pitch classes of the root, third and fifth
const CHORDS = { Dm: [2, 5, 9], C: [0, 4, 7], G: [7, 11, 2], A: [9, 1, 4], Am: [9, 0, 4], F: [5, 9, 0], Bb: [10, 2, 5] };
const chords = (text) => text.split(/\s+/).filter(Boolean);

// A chord's notes from its root in [low, low + 11]: root, third and fifth above it
function voicing(name, low) {
    const [root, third, fifth] = CHORDS[name];
    const r = low + ((root - low) % 12 + 12) % 12;
    const above = (pc) => r + ((pc - root) % 12 + 12) % 12;

    return { root: r, third: above(third), fifth: above(fifth) };
}

// --- The tunes ---

const VERSE = tune(`
    D5:1 A4:1 A4:0.5 B4:0.5 | C5:1 G4:1 G4:0.5 A4:0.5 | F4:0.5 G4:0.5 A4:1 D5:1 | C5:1.5 B4:0.5 A4:1 |
    D5:1 A4:1 A4:0.5 B4:0.5 | C5:1 E5:1 D5:0.5 C5:0.5 | B4:1 D5:1 B4:0.5 G4:0.5 | A4:2 r:1 |
    F4:1 A4:1 C5:1 | E5:1.5 D5:0.5 C5:1 | D5:1 F5:1 E5:0.5 D5:0.5 | C5:1 A4:2 |
    A4:1 C5:1 F5:1 | E5:1 D5:1 B4:1 | C#5:1.5 B4:0.5 A4:1 | D5:2 r:1`);
const VERSE_CHORDS = chords("Dm C Dm Am Dm C G A F C Dm Am F G A Dm");

const CHORUS = tune(`
    C5:1 F5:2 | E5:1 G5:1 E5:1 | D5:2 G5:1 | F5:1.5 E5:0.5 D5:1 |
    C5:1 F5:1 A5:1 | G5:2 E5:1 | E5:1 C#5:1 E5:1 | A5:2 G5:1 |
    F5:1.5 E5:0.5 D5:1 | E5:1.5 D5:0.5 C5:1 | F5:1 A5:2 | G5:1.5 F5:0.5 D5:1 |
    D5:1 F5:1 A5:1 | A5:1.5 G5:0.5 E5:1 | E5:1 C#5:1 E5:1 | D5:3`);
const CHORUS_CHORDS = chords("F C G Dm F C A A Dm C F G Dm Am A Dm");

const BRIDGE = tune(`
    F5:3 | E5:3 | D5:3 | C5:2 E5:1 | A5:2 G5:1 | E5:3 | F5:1.5 E5:0.5 D5:1 | C#5:3 |
    D5:3 | C5:3 | E5:2 G5:1 | F5:1.5 E5:0.5 D5:1 | D5:2 F5:1 | E5:3 | C#5:1.5 D5:0.5 E5:1 | A4:3`);
const BRIDGE_CHORDS = chords("F C Bb C F C Dm A Bb F C Dm Bb C A A");

const INTRO = tune(`r:3 | r:3 | r:3 | r:3 | D5:1 A4:1 A4:0.5 B4:0.5 | C5:1 G4:1 G4:0.5 A4:0.5 | B4:1 D5:1 B4:0.5 G4:0.5 | A4:3`);
const INTRO_CHORDS = chords("Dm C Dm Am Dm C G A");

const OUTRO = tune(`D5:1 F5:1 A5:1 | A5:1.5 G5:0.5 E5:1 | E5:1 G5:1 E5:1 | D5:3 | r:3 | r:3 | r:3 | r:3`);
const OUTRO_CHORDS = chords("Dm Am C Dm Dm C G A");

// D Dorian's notes (D E F G A B C), for harmonising a third below a tune; over an A major
// chord, C is sharpened to C#, as the chord has it
const DORIAN = [2, 4, 5, 7, 9, 11, 0];

function thirdBelow(pitch, chord) {
    if (pitch === null) {
        return null;
    }

    const scale = chord === "A" ? DORIAN.map((pc) => (pc === 0 ? 1 : pc)) : DORIAN;
    let steps = 0;
    let below = pitch;

    while (steps < 2) {
        below--;

        if (scale.includes(below % 12)) {
            steps++;
        }
    }

    return below;
}

// A tune's harmony a third below, over its chords, from bar `from` on (rests before it)
function harmony(notesOfTune, names, from = 0) {
    let beat = 0;

    return notesOfTune.map(([pitch, beats]) => {
        const bar = Math.floor(beat / BEATS_PER_BAR);
        const note = [bar >= from ? thirdBelow(pitch, names[bar]) : null, beats];

        beat += beats;

        return note;
    });
}

// --- Writing it out ---

/**
 * Compose the score: { tempo, beatsPerBar, length (seconds), sections: [{ name, bar, bars,
 * start (s) }], notes: [{ time (s), instrument, pitch (MIDI; a kind for drums), duration (s),
 * velocity (0 to 1) }] in time order }.
 */
export function compose() {
    const random = createRandom(1985);
    const notes = [];
    const sections = [];
    let at = 0;

    // A note at a bar and beat of the current section
    const play = (instrument, bar, beat, pitch, beats, velocity, { exact = false } = {}) => {
        const nudge = exact ? 0 : (random.next() - 0.5) * 0.02;

        notes.push({
            time: Math.max(0, (at + bar) * BAR + beat * BEAT + nudge),
            instrument,
            pitch,
            duration: beats * BEAT,
            velocity: Math.min(1, velocity * (exact ? 1 : 0.93 + random.next() * 0.14)),
        });
    };

    // Parts
    const melody = (instrument, notesOfTune, velocity, { shift = 0 } = {}) => {
        let beat = 0;

        for (const [pitch, beats] of notesOfTune) {
            if (pitch !== null) {
                play(instrument, Math.floor(beat / BEATS_PER_BAR), beat % BEATS_PER_BAR, pitch + shift, beats * 0.97, velocity);
            }

            beat += beats;
        }
    };
    const harp = (names, velocity) => names.forEach((name, bar) => {
        const { root, third } = voicing(name, 45);
        const pattern = [root, root + 7, root + 12, third + 12, root + 12, root + 7];
        const level = typeof velocity === "function" ? velocity(bar) : velocity;

        pattern.forEach((pitch, k) => play("harp", bar, k * 0.5, pitch, 0.5, level * (k === 0 ? 1 : 0.8)));
    });
    // The strumstick: the chord's root on the beat, then the chord strummed twice
    const strum = (names, velocity) => names.forEach((name, bar) => {
        const low = voicing(name, 50);
        const chord = voicing(name, 55);

        play("strumstick", bar, 0, low.root, 1, velocity);

        for (const beat of [1, 2]) {
            [chord.third, chord.fifth, chord.root + 12].forEach((pitch, k) => play("strumstick", bar, beat + k * 0.035, pitch, 1, velocity * 0.7));
        }
    });
    // The organ: a bass note held through each bar, and (softer) the chord above it
    const bass = (names, velocity) => names.forEach((name, bar) => play("organ", bar, 0, voicing(name, 36).root, 2.95, velocity));
    const pad = (names, velocity) => names.forEach((name, bar) => {
        const { root, third, fifth } = voicing(name, 55);

        for (const pitch of [root, third, fifth]) {
            play("organ", bar, 0, pitch, 2.95, velocity * 0.6);
        }
    });
    // Harpsichord arpeggios, in sixteenths
    const arpeggios = (names, velocity) => names.forEach((name, bar) => {
        const { root, third, fifth } = voicing(name, 62);
        const cycle = [root, third, fifth, root + 12];

        for (let k = 0; k < 12; k++) {
            play("harpsichord", bar, k * 0.25, cycle[k % 4], 0.25, velocity * (k % 4 === 0 ? 1 : 0.75), { exact: true });
        }
    });
    const counter = (names, velocity) => names.forEach((name, bar) => {
        const { third } = voicing(name, 67);

        play("recorder", bar, 0, third, 2.9, velocity);
    });
    // Hand chimes: the tune's first note in every other bar (or every `every`), an octave up
    const chimes = (notesOfTune, velocity, every = 2) => {
        let beat = 0;

        for (const [pitch, beats] of notesOfTune) {
            const bar = Math.floor(beat / BEATS_PER_BAR);

            if (pitch !== null && beat % BEATS_PER_BAR === 0 && bar % every === 0) {
                play("chimes", bar, 0, pitch + 12 > 96 ? pitch : pitch + 12, 2, velocity);
            }

            beat += beats;
        }
    };
    const drums = (bars, style, velocity, { fills = false } = {}) => {
        for (let bar = 0; bar < bars; bar++) {
            const hit = (beat, kind, level) => play("drum", bar, beat, kind, 0.5, velocity * level, { exact: true });
            const jingle = (beat, level) => play("tambourine", bar, beat, "hit", 0.5, velocity * level, { exact: true });

            if (style === "verse") {
                hit(0, "low", 1);
                hit(2, "high", 0.5);
            } else if (style === "chorus") {
                hit(0, "low", 1);
                hit(1.5, "high", 0.55);
                hit(2, "high", 0.6);
                jingle(1, 0.8);
                jingle(2, 0.7);
            } else {
                hit(0, "low", 0.9);
                hit(1.5, "low", 0.55);
                jingle(0.5, 0.5);
                jingle(1.5, 0.5);
                jingle(2.5, 0.5);
            }

            if (fills && bar % 8 === 7) {
                hit(2.5, "high", 0.6);
                hit(2.75, "low", 0.7);
            }
        }
    };

    // Each section: its name, chords, and what plays
    const section = (name, names, parts) => {
        sections.push({ name, bar: at, bars: names.length, start: at * BAR });
        parts(names);
        at += names.length;
    };

    section("intro", INTRO_CHORDS, (names) => {
        harp(names, 0.55);
        names.forEach((_, bar) => play("organ", bar, 0, midi("D2"), 2.95, 0.3));
        melody("recorder", INTRO, 0.5);
    });
    section("verse", VERSE_CHORDS, (names) => {
        melody("recorder", VERSE, 0.7);
        strum(names, 0.55);
        bass(names, 0.4);
        drums(names.length, "verse", 0.5);
    });
    section("chorus", CHORUS_CHORDS, (names) => {
        melody("ocarina", CHORUS, 0.7);
        melody("recorder", harmony(CHORUS, names, 8), 0.42);
        harp(names, 0.45);
        pad(names, 0.4);
        bass(names, 0.45);
        drums(names.length, "chorus", 0.6);
    });
    section("verse", VERSE_CHORDS, (names) => {
        melody("ocarina", VERSE, 0.65);
        counter(names, 0.32);
        strum(names, 0.55);
        bass(names, 0.4);
        drums(names.length, "verse", 0.55);
    });
    section("chorus", CHORUS_CHORDS, (names) => {
        melody("ocarina", CHORUS, 0.75);
        melody("recorder", harmony(CHORUS, names), 0.45);
        harp(names, 0.5);
        pad(names, 0.45);
        bass(names, 0.5);
        chimes(CHORUS, 0.4);
        drums(names.length, "chorus", 0.65);
    });
    section("bridge", BRIDGE_CHORDS, (names) => {
        arpeggios(names, 0.45);
        melody("recorder", BRIDGE, 0.6);
        pad(names, 0.45);
        bass(names, 0.4);
        drums(names.length, "bridge", 0.5);
    });
    section("quiet verse", VERSE_CHORDS, (names) => {
        melody("harp", VERSE, 0.62);
        pad(names, 0.3);
        bass(names, 0.3);
        chimes(VERSE, 0.3, 8);
    });
    section("last chorus", CHORUS_CHORDS, (names) => {
        melody("ocarina", CHORUS, 0.8);
        melody("recorder", harmony(CHORUS, names), 0.5);
        harp(names, 0.5);
        strum(names, 0.45);
        pad(names, 0.5);
        bass(names, 0.55);
        chimes(CHORUS, 0.45);
        drums(names.length, "chorus", 0.7, { fills: true });
    });
    section("outro", OUTRO_CHORDS, (names) => {
        melody("recorder", OUTRO, 0.5);
        harp(names, (bar) => 0.55 - bar * 0.025);
        bass(names, 0.3);
        pad(names, 0.25);
    });

    notes.sort((a, b) => a.time - b.time);

    return { tempo: TEMPO, beatsPerBar: BEATS_PER_BAR, length: at * BAR, sections, notes };
}

/** The score, composed once. */
export const SCORE = compose();
