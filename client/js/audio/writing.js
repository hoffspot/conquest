// Writing a score out as a band would play it, for the peoples' music (elves.js, dark-elves.js,
// cat-folk.js, lizard-folk.js, orcs.js): its notes at bars and beats, each a touch early or late
// and a little louder or softer, as players play (a part marked exact, the drums', on the beat),
// section after section; and a tune's harmony in its scale. Pure data, no Web Audio: sound.js
// plays it.

import { createRandom } from "../core/random.js";

/**
 * A score to write at `tempo` beats a minute, `beatsPerBar` to a bar, its players' unevenness
 * from `seed` (each note up to `nudge` seconds early or late, in all):
 *
 *  - play(instrument, bar, beat, pitch, beats, velocity, { exact }): a note at a bar and beat of
 *    the section being written (a drum's kind of hit for its pitch);
 *  - melody(instrument, tune, velocity, { shift, legato }): a tune (score.js tune) from the
 *    section's start, `shift` semitones up, each note sounding `legato` of its length;
 *  - section(name, chords, parts): a section, its bars' chords (score.js chords), and what's
 *    played over them (parts(chords));
 *  - done(): the score, { tempo, beatsPerBar, length (seconds), sections: [{ name, bar, bars,
 *    start (s) }], notes: [{ time (s), instrument, pitch, duration (s), velocity }] in time
 *    order }, as score.js compose.
 */
export function writing({ tempo, beatsPerBar, seed, nudge = 0.016 }) {
    const beat = 60 / tempo;
    const bar = beatsPerBar * beat;
    const random = createRandom(seed);
    const notes = [];
    const sections = [];
    let at = 0;

    const play = (instrument, inBar, onBeat, pitch, beats, velocity, { exact = false } = {}) => {
        const off = exact ? 0 : (random.next() - 0.5) * nudge;

        notes.push({
            time: Math.max(0, (at + inBar) * bar + onBeat * beat + off),
            instrument,
            pitch,
            duration: beats * beat,
            velocity: Math.min(1, velocity * (exact ? 1 : 0.93 + random.next() * 0.14)),
        });
    };

    const melody = (instrument, notesOfTune, velocity, { shift = 0, legato = 0.96 } = {}) => {
        let count = 0;

        for (const [pitch, beats] of notesOfTune) {
            if (pitch !== null) {
                play(instrument, Math.floor(count / beatsPerBar), count % beatsPerBar, pitch + shift, beats * legato, velocity);
            }

            count += beats;
        }
    };

    const section = (name, names, parts) => {
        sections.push({ name, bar: at, bars: names.length, start: at * bar });
        parts(names);
        at += names.length;
    };

    const done = () => {
        notes.sort((a, b) => a.time - b.time);

        return { tempo, beatsPerBar, length: at * bar, sections, notes };
    };

    return { play, melody, section, done };
}

/**
 * A tune's harmony: each note `steps` notes of `scale` (its pitch classes) below (2, a third),
 * rests kept; a note that would fall under `lowest` taken an octave up.
 */
export function harmony(notesOfTune, scale, { steps = 2, lowest = 0 } = {}) {
    return notesOfTune.map(([pitch, beats]) => {
        if (pitch === null) {
            return [null, beats];
        }

        let below = pitch;

        for (let count = 0; count < steps; ) {
            below--;

            if (scale.includes(((below % 12) + 12) % 12)) {
                count++;
            }
        }

        return [below < lowest ? below + 12 : below, beats];
    });
}
