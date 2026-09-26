// The music's instruments: recordings of real ones, from the Versilian Community Sample Library
// (CC0) by Versilian Studios, and a classical guitar from FreePats (CC0).
// scripts/build-music.js makes them into short MP3s (client/music), listed in samples.js: an
// alto recorder, an ocarina (a small, round clay flute), a folk harp, a strumstick (a small
// plucked folk instrument, standing in for a lute in the town's music), a harpsichord, a
// Renaissance chamber organ, hand chimes, a frame drum and a tambourine; and, for the tavern's
// lute, the guitar, its nylon strings the nearest to a lute's gut.
//
// Each pitched instrument was recorded at a few notes, a few semitones apart: a note plays the
// nearest, a little faster or slower. Blown instruments (and the organ) sound for as long as a
// note lasts, then fade over `release` seconds; plucked and struck ones ring on.

import { SAMPLES } from "./samples.js";

/**
 * Every instrument: what it is, whether it's held (faded out `release` seconds after a note
 * ends) or rings on (for `ring` seconds after, 1.2 unless it says: the guitar's quick notes are
 * stopped sooner, as a finger on the string would), how loud it plays in the mix (`mix`) and
 * where (`pan`, -1 left to 1 right). Unpitched ones (drums) have `kinds` of hit instead.
 */
export const INSTRUMENTS = Object.freeze({
    recorder: { name: "Alto recorder", held: true, release: 0.15, mix: 0.5, pan: -0.15 },
    ocarina: { name: "Ocarina", held: true, release: 0.25, mix: 0.44, pan: 0.2 },
    harp: { name: "Folk harp", mix: 0.36, pan: -0.3 },
    strumstick: { name: "Strumstick", mix: 0.42, pan: 0.3 },
    harpsichord: { name: "Harpsichord", mix: 0.2, pan: 0.1 },
    organ: { name: "Renaissance organ", held: true, release: 0.3, mix: 0.34, pan: 0 },
    chimes: { name: "Hand chimes", mix: 0.18, pan: 0.1 },
    drum: { name: "Frame drum", kinds: ["low", "high"], mix: 0.42, pan: 0 },
    tambourine: { name: "Tambourine", kinds: ["hit"], mix: 0.18, pan: 0.25 },
    guitar: { name: "Classical guitar (a lute)", ring: 0.35, mix: 0.45, pan: -0.1 },
});

/** The notes an instrument was recorded at (MIDI), low to high. */
export const keysOf = (name) => SAMPLES[name].map(({ key }) => key).filter((key) => key !== undefined).sort((a, b) => a - b);

/** The recording a note plays: the instrument's nearest (its key), or a drum's kind of hit. */
export function baseFor(name, pitch) {
    if (INSTRUMENTS[name].kinds) {
        return pitch;
    }

    return keysOf(name).reduce((best, key) => (Math.abs(key - pitch) < Math.abs(best - pitch) ? key : best));
}

/** Every recording: [id ("instrument key", as `#note` asks for it), where it is]. */
export function sampleFiles() {
    return Object.entries(SAMPLES).flatMap(([name, samples]) => samples.map(({ key, kind, file }) => [`${name} ${key ?? kind}`, new URL(`../../music/${file}`, import.meta.url)]));
}
