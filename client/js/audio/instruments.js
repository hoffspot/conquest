// The music's instruments: recordings of real ones, from the Versilian Community Sample Library
// (CC0) by Versilian Studios and their VS Chamber Orchestra: Community Edition (CC0), and a
// classical guitar from FreePats (CC0).
// scripts/build-music.js makes them into short MP3s (client/music), listed in samples.js: an
// alto recorder, an ocarina (a small, round clay flute), a folk harp, a strumstick (a small
// plucked folk instrument, standing in for a lute in the town's music), a harpsichord, a
// Renaissance chamber organ, hand chimes, a frame drum and a tambourine; for the tavern's lute,
// the guitar, its nylon strings the nearest to a lute's gut; for a fight, French horns, a
// section of cellos, timpani, a bass drum and a rope-tensioned field drum; and for the peoples'
// own music, a flute, violins and cellos bowed and held, tenor trombones, a pipe organ's quiet
// stops, tubular bells, a bowed vibraphone, a kalimba, a balafon, a marimba, bongos, a conga, a
// shaker, a slit drum and tenor drums.
//
// Each pitched instrument was recorded at a few notes, a few semitones apart: a note plays the
// nearest, a little faster or slower. Blown and bowed instruments (and the organs) sound for as
// long as a note lasts, then fade over `release` seconds; plucked and struck ones ring on.

import { SAMPLES } from "./samples.js";

/**
 * Every instrument: what it is, whether it's held (faded out `release` seconds after a note
 * ends) or rings on (for `ring` seconds after, 1.2 unless it says: the guitar's quick notes are
 * stopped sooner, as a finger on the string would), how loud it plays in the mix (`mix`) and
 * where (`pan`, -1 left to 1 right), and how far from a recording a note may be (`reach`,
 * semitones: 2 unless it says, where the library recorded it sparsely). Unpitched ones (drums)
 * have `kinds` of hit instead.
 */
export const INSTRUMENTS = Object.freeze({
    recorder: { name: "Alto recorder", held: true, release: 0.15, mix: 0.5, pan: -0.15 },
    ocarina: { name: "Ocarina", held: true, release: 0.25, mix: 0.44, pan: 0.2, reach: 4 },
    harp: { name: "Folk harp", mix: 0.36, pan: -0.3 },
    strumstick: { name: "Strumstick", mix: 0.42, pan: 0.3 },
    harpsichord: { name: "Harpsichord", mix: 0.2, pan: 0.1 },
    organ: { name: "Renaissance organ", held: true, release: 0.3, mix: 0.34, pan: 0 },
    chimes: { name: "Hand chimes", mix: 0.18, pan: 0.1 },
    drum: { name: "Frame drum", kinds: ["low", "high"], mix: 0.42, pan: 0 },
    tambourine: { name: "Tambourine", kinds: ["hit"], mix: 0.18, pan: 0.25 },
    guitar: { name: "Classical guitar (a lute)", ring: 0.35, mix: 0.45, pan: -0.1 },
    // (A fight's: battle.js)
    horn: { name: "French horns", held: true, release: 0.35, mix: 0.42, pan: -0.2 },
    cello: { name: "Cellos (spiccato)", ring: 0.25, mix: 0.36, pan: 0.2 },
    timpani: { name: "Timpani", ring: 1, mix: 0.42, pan: 0 },
    bassdrum: { name: "Bass drum", kinds: ["hit"], mix: 0.42, pan: 0 },
    snare: { name: "Field drum (rope-tensioned)", kinds: ["hit"], mix: 0.22, pan: 0.1 },
    // (The peoples': elves.js, dark-elves.js, cat-folk.js, lizard-folk.js, orcs.js)
    flute: { name: "Flute", held: true, release: 0.3, mix: 0.42, pan: 0.15 },
    violins: { name: "Violins (a section)", held: true, release: 0.5, mix: 0.3, pan: -0.25 },
    celli: { name: "Cellos (bowed, held)", held: true, release: 0.5, mix: 0.36, pan: 0.25 },
    trombone: { name: "Tenor trombones", held: true, release: 0.35, mix: 0.36, pan: 0.15 },
    pipeorgan: { name: "Pipe organ (its quiet stops)", held: true, release: 0.6, mix: 0.36, pan: 0 },
    bells: { name: "Tubular bells", ring: 1, mix: 0.2, pan: 0.2 },
    vibes: { name: "Vibraphone (bowed)", held: true, release: 0.8, mix: 0.24, pan: -0.2, reach: 4 },
    kalimba: { name: "Kalimba", ring: 0.8, mix: 0.46, pan: -0.15 },
    balafon: { name: "Balafon (soft mallets)", ring: 0.6, mix: 0.4, pan: 0.2, reach: 4 },
    marimba: { name: "Marimba", ring: 0.8, mix: 0.4, pan: -0.1, reach: 4 },
    bongos: { name: "Bongos", kinds: ["high", "muted", "low"], mix: 0.42, pan: 0.3 },
    conga: { name: "Conga", kinds: ["low", "open"], mix: 0.48, pan: -0.2 },
    shaker: { name: "Shaker", kinds: ["down", "up"], mix: 0.34, pan: 0.35 },
    slitdrum: { name: "Slit drum", kinds: ["low", "high"], mix: 0.42, pan: 0.15 },
    toms: { name: "Tenor drums", kinds: ["low", "high"], mix: 0.38, pan: -0.1 },
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

/** The instruments a score plays (scores.js), by name. */
export const instrumentsOf = (score) => [...new Set(score.notes.map(({ instrument }) => instrument))];

/** Every recording (or those of the instruments `names`): [id ("instrument key", as `#note` asks for it), where it is]. */
export function sampleFiles(names = Object.keys(SAMPLES)) {
    return names.flatMap((name) => SAMPLES[name].map(({ key, kind, file }) => [`${name} ${key ?? kind}`, new URL(`../../music/${file}`, import.meta.url)]));
}
