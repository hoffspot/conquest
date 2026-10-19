// A ruin's music: what's heard in a ruined keep or a broken watchtower (sound.js PLACES ruin and
// tower), melancholy, glory long gone. The town's own ballad (score.js), its verse slowed and in
// D minor (its B naturals flattened, its G major chords minor), as a lament: the folk harp alone
// to begin with, then the recorder's tune over it, the cellos and a section of violins holding
// the chords; then the harp alone again with it, softer, and a hand chime now and then.
//
// D minor (D Aeolian, its A chords major), 3/4 at 72 beats a minute, a little under two minutes:
//
//   the harp (4 bars) · the verse (16, the recorder) · the verse again (16, the harp alone, the
//   strings under it) · the harp (4, ending on A, which leads back into D minor at the start, so
//   it loops without a seam)
//
// Pure data, no Web Audio: sound.js plays it.

import { chords, VERSE, VERSE_CHORDS, voicing } from "./score.js";
import { writing } from "./writing.js";

// The verse in D minor: each B natural a B flat, each G major chord G minor
const LAMENT = VERSE.map(([pitch, beats]) => [pitch !== null && pitch % 12 === 11 ? pitch - 1 : pitch, beats]);
const LAMENT_CHORDS = VERSE_CHORDS.map((name) => (name === "G" ? "Gm" : name));

const OPENING = chords("Dm Gm Dm A");

/** Compose it, as score.js compose. */
export function composeRuins() {
    const { play, melody, section, done } = writing({ tempo: 72, beatsPerBar: 3, seed: 1314, level: 1.2 });

    // The harp up and down the chord in quavers: root, fifth, octave, tenth, octave, fifth
    const harp = (names, velocity) => names.forEach((name, bar) => {
        const { root, third } = voicing(name, 45);

        [root, root + 7, root + 12, third + 12, root + 12, root + 7].forEach((pitch, k) => play("harp", bar, k * 0.5, pitch, 0.5, velocity * (k === 0 ? 1 : 0.75)));
    });
    // The cellos on the chord's root, the violins its third and fifth, held through each bar
    const strings = (names, velocity) => names.forEach((name, bar) => {
        const { third, fifth } = voicing(name, 62);

        play("celli", bar, 0, voicing(name, 38).root, 2.9, velocity);
        play("violins", bar, 0, third, 2.9, velocity * 0.7);
        play("violins", bar, 0, fifth, 2.9, velocity * 0.6);
    });
    // A hand chime on the chord's root, high, every `every` bars
    const chime = (names, velocity, every) => names.forEach((name, bar) => {
        if (bar % every === 0) {
            play("chimes", bar, 0, voicing(name, 74).root, 2, velocity);
        }
    });

    section("the harp", OPENING, (names) => {
        harp(names, 0.5);
    });
    section("the verse", LAMENT_CHORDS, (names) => {
        melody("recorder", LAMENT, 0.55);
        harp(names, 0.38);
        strings(names, 0.32);
    });
    section("the verse again", LAMENT_CHORDS, (names) => {
        melody("harp", LAMENT, 0.55);
        strings(names, 0.26);
        chime(names, 0.25, 4);
    });
    section("the harp", OPENING, (names) => {
        harp(names, 0.45);
    });

    return done();
}

/** A ruin's music, composed once. */
export const RUINS = composeRuins();
