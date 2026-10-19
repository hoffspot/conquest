// The music of a fight: what's heard while the player's in one (sound.js setBattle), faded in over
// whatever was playing and back to it once the fight's done. Martial and driving, but played by the
// town's band (score.js) with what an army brings: French horns for its theme (warm, never brassy:
// held in their middle register, played softly), a section of cellos bowing a galloping figure
// under it, pitched timpani, a big bass drum and a rope-tensioned field drum, over the town's
// organ, harp, strumstick, recorder, ocarina, chimes, frame drum and tambourine
// (instruments.js).
//
// D minor (D Aeolian, its A chords major, so they lead home), 4/4 at 132 beats a minute, about a
// minute and a half:
//
//   the cellos (2 bars, galloping alone) · the horns' theme (8) · the theme up high, on recorder
//   and ocarina over the horns (8) · a second tune, towards F major (8) · drums alone under the
//   horns' calls (8) · everyone, the theme (8) · the turn (4, ending on A, which leads back into
//   the cellos' D minor, so it loops without a seam)
//
// It starts from the cellos each time a fight does. The tunes are written out below; the rest is
// made from each section's chords. Pure data, no Web Audio: sound.js plays it.

import { createRandom } from "../core/random.js";
import { chords, tune, voicing } from "./score.js";

/** Beats a minute, and beats to a bar. */
export const BATTLE_TEMPO = 132;
export const BATTLE_BEATS_PER_BAR = 4;

const BEAT = 60 / BATTLE_TEMPO;
const BAR = BATTLE_BEATS_PER_BAR * BEAT;

// --- The tunes ---

// The horns' theme: a call (the tonic struck twice and a leap to the fifth), answered, climbing
// to the relative major and back down to A
const THEME = tune(`
    D3:1.5 D3:0.5 A3:1 A3:1 | G3:0.75 F3:0.25 E3:0.5 F3:0.5 D3:2 | F3:1.5 F3:0.5 C4:1 C4:1 | Bb3:0.75 A3:0.25 G3:0.5 A3:0.5 F3:2 |
    D4:1.5 C4:0.5 Bb3:1 A3:1 | G3:1.5 F3:0.5 E3:1 D3:1 | E3:1 C#3:1 E3:1 G3:1 | A3:2 r:2`);
const THEME_CHORDS = chords("Dm Dm F Bb Gm Dm A A");

// The second tune, high, in F major and back
const SECOND = tune(`
    A4:1 C5:1 F5:1.5 E5:0.5 | E5:1 D5:0.5 C5:0.5 G4:2 | F5:1.5 D5:0.5 Bb4:1 D5:1 | C5:1.5 A4:0.5 F4:2 |
    G4:1 Bb4:1 D5:1.5 C5:0.5 | A4:1 D5:1 F5:2 | D5:1 C5:1 Bb4:1 G4:1 | A4:2 C#5:1 E5:1`);
const SECOND_CHORDS = chords("F C Bb F Gm Dm Bb A");

// The horns' calls over the drums: long notes, a bar each, a bar's rest between
const CALLS = tune(`D3:4 | r:4 | F3:4 | r:4 | G3:4 | r:4 | A3:4 | A3:2 r:2`);
const CALLS_CHORDS = chords("Dm Dm Bb Bb Gm Gm A A");

const OPENING = chords("Dm Dm");

const TURN = tune(`D3:2 F3:2 | Bb3:2 A3:2 | E3:2 C#3:2 | A3:4`);
const TURN_CHORDS = chords("Dm Bb A A");

// --- Writing it out ---

/**
 * Compose it: { tempo, beatsPerBar, length (seconds), sections: [{ name, bar, bars, start (s) }],
 * notes: [{ time (s), instrument, pitch (MIDI; a kind for drums), duration (s), velocity }] in
 * time order }, as score.js compose.
 */
export function composeBattle() {
    const random = createRandom(1415);
    const notes = [];
    const sections = [];
    let at = 0;

    const play = (instrument, bar, beat, pitch, beats, velocity, { exact = false } = {}) => {
        const nudge = exact ? 0 : (random.next() - 0.5) * 0.012;

        notes.push({
            time: Math.max(0, (at + bar) * BAR + beat * BEAT + nudge),
            instrument,
            pitch,
            duration: beats * BEAT,
            velocity: Math.min(1, velocity * (exact ? 1 : 0.94 + random.next() * 0.12)),
        });
    };

    const melody = (instrument, notesOfTune, velocity, { shift = 0 } = {}) => {
        let beat = 0;

        for (const [pitch, beats] of notesOfTune) {
            if (pitch !== null) {
                play(instrument, Math.floor(beat / BATTLE_BEATS_PER_BAR), beat % BATTLE_BEATS_PER_BAR, pitch + shift, beats * 0.95, velocity);
            }

            beat += beats;
        }
    };
    // The cellos' gallop: the chord's root in eighths, its octave flung in, its fifth and third
    // turning the bar
    const gallop = (names, velocity) => names.forEach((name, bar) => {
        if (!name) {
            return;
        }

        const { root, third, fifth } = voicing(name, 38);
        const figure = [root, root, root + 12, root, root, root + 12, fifth, third];

        figure.forEach((pitch, k) => play("cello", bar, k * 0.5, pitch, 0.45, velocity * (k % 4 === 0 ? 1 : 0.78), { exact: true }));
    });
    // Timpani on the chord's root (`beats` a bar), the last bar of eight closing with a flourish
    const timpani = (names, beats, velocity) => names.forEach((name, bar) => {
        const { root } = voicing(name, 38);

        for (const beat of beats) {
            play("timpani", bar, beat, root, 0.5, velocity * (beat === 0 ? 1 : 0.8), { exact: true });
        }

        if (bar % 8 === 7) {
            play("timpani", bar, 3, root + 7, 0.25, velocity * 0.75, { exact: true });
            play("timpani", bar, 3.5, root, 0.25, velocity * 0.85, { exact: true });
        }
    });
    // The march: the bass drum on the strong beats, the field drum on the others, softly, its
    // quick notes between in the fuller sections; the frame drum and tambourine with them
    const march = (bars, style, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            const hit = (instrument, beat, kind, level) => play(instrument, bar, beat, kind, 0.25, velocity * level, { exact: true });

            hit("bassdrum", 0, "hit", 1);
            hit("bassdrum", 2, "hit", 0.85);
            hit("snare", 1, "hit", 0.6);
            hit("snare", 3, "hit", 0.6);

            if (style !== "light") {
                hit("drum", 0, "low", 0.7);
                hit("drum", 2.5, "high", 0.5);
            }

            if (style === "full") {
                for (const beat of [1.75, 3.5, 3.75]) {
                    hit("snare", beat, "hit", 0.32);
                }

                for (let k = 0; k < 4; k++) {
                    hit("tambourine", k + 0.5, "hit", 0.45);
                }
            }

            // (The end of every eight leading into the next: the field drum on the last two
            // beats' quavers, louder each)
            if (bar % 8 === 7) {
                for (let k = 0; k < 4; k++) {
                    hit("snare", 2 + k * 0.5, "hit", 0.35 + k * 0.07);
                }
            }
        }
    };
    const bass = (names, velocity) => names.forEach((name, bar) => play("organ", bar, 0, voicing(name, 38).root, 3.9, velocity));
    const pad = (names, velocity) => names.forEach((name, bar) => {
        const { root, third, fifth } = voicing(name, 53);

        for (const pitch of [root, third, fifth]) {
            play("organ", bar, 0, pitch, 3.9, velocity * 0.6);
        }
    });
    // The horns holding the chord under a tune: root and fifth, a bar each
    const hornChords = (names, velocity) => names.forEach((name, bar) => {
        const { root, fifth } = voicing(name, 48);

        play("horn", bar, 0, root, 3.8, velocity);
        play("horn", bar, 0, fifth > 60 ? fifth - 12 : fifth, 3.8, velocity * 0.8);
    });
    // The harp up and down the chord in eighths
    const harp = (names, velocity) => names.forEach((name, bar) => {
        const { root, third, fifth } = voicing(name, 50);
        const figure = [root, third, fifth, root + 12, third + 12, root + 12, fifth, third];

        figure.forEach((pitch, k) => play("harp", bar, k * 0.5, pitch, 0.5, velocity * (k === 0 ? 1 : 0.75)));
    });
    // The strumstick driving the chord, strummed on every beat and its offbeat
    const strum = (names, velocity) => names.forEach((name, bar) => {
        const chord = voicing(name, 55);

        for (let k = 0; k < 8; k++) {
            [chord.root, chord.third, chord.fifth].forEach((pitch, n) => play("strumstick", bar, k * 0.5 + n * 0.02, pitch, 0.5, velocity * (k % 2 ? 0.55 : 0.8)));
        }
    });
    // Hand chimes ringing out a section's first chord, and halfway through
    const chimes = (names, velocity) => [0, 4].forEach((bar) => {
        const { root, fifth } = voicing(names[bar], 74);

        play("chimes", bar, 0, root, 2, velocity);
        play("chimes", bar, 0, fifth, 2, velocity * 0.8);
    });

    const section = (name, names, parts) => {
        sections.push({ name, bar: at, bars: names.length, start: at * BAR });
        parts(names);
        at += names.length;
    };

    section("cellos", OPENING, (names) => {
        // (The cellos alone, galloping, into the horns' theme)
        gallop(names, 0.8);
    });
    section("theme", THEME_CHORDS, (names) => {
        melody("horn", THEME, 0.75);
        gallop(names, 0.6);
        timpani(names, [0, 2], 0.6);
        march(names.length, "light", 0.65);
        bass(names, 0.4);
    });
    section("theme high", THEME_CHORDS, (names) => {
        melody("recorder", THEME, 0.62, { shift: 24 });
        melody("ocarina", THEME, 0.4, { shift: 24 });
        melody("horn", THEME, 0.6);
        gallop(names, 0.6);
        harp(names, 0.45);
        timpani(names, [0, 2], 0.6);
        march(names.length, "steady", 0.7);
        bass(names, 0.4);
    });
    section("second tune", SECOND_CHORDS, (names) => {
        melody("recorder", SECOND, 0.62);
        melody("harp", SECOND, 0.4, { shift: -12 });
        hornChords(names, 0.5);
        strum(names, 0.42);
        gallop(names, 0.55);
        timpani(names, [0], 0.55);
        march(names.length, "steady", 0.65);
        bass(names, 0.4);
    });
    section("drums", CALLS_CHORDS, (names) => {
        melody("horn", CALLS, 0.7);
        melody("horn", CALLS, 0.5, { shift: -5 });
        gallop(names, 0.5);
        timpani(names, [0, 1.5, 2, 3], 0.65);
        march(names.length, "steady", 0.7);
    });
    section("everyone", THEME_CHORDS, (names) => {
        melody("horn", THEME, 0.82);
        melody("ocarina", THEME, 0.62, { shift: 24 });
        melody("harp", THEME, 0.42, { shift: 12 });
        gallop(names, 0.65);
        harp(names, 0.45);
        strum(names, 0.4);
        timpani(names, [0, 2], 0.7);
        march(names.length, "full", 0.72);
        chimes(names, 0.38);
        pad(names, 0.4);
        bass(names, 0.45);
    });
    section("turn", TURN_CHORDS, (names) => {
        melody("horn", TURN, 0.7);
        gallop(names, 0.55);
        timpani(names, [0, 2], 0.6);
        march(names.length, "light", 0.6);
        bass(names, 0.4);
    });

    notes.sort((a, b) => a.time - b.time);

    return { tempo: BATTLE_TEMPO, beatsPerBar: BATTLE_BEATS_PER_BAR, length: at * BAR, sections, notes };
}

/** The battle's music, composed once. */
export const BATTLE = composeBattle();
