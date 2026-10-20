// A great lair's music: what's heard in the drake's lair or a Dreadthorn's (sound.js PLACES
// lair), vast and ominous, something huge asleep close by. A bass drum beating slow and double,
// like a great heart; a gong at each turn, softly; French horns and tenor trombones together on a
// slow, heavy theme low down, never loud, and holding the chords under the cellos when they take
// it up; at the last, everyone, the cellos an octave over the brass, the timpani under them.
//
// C minor (C Aeolian, its G chords major), 4/4 at 66 beats a minute, about two minutes:
//
//   the heart (4 bars) · the theme (8, the brass) · the theme (8, the cellos, the brass under
//   them) · the theme (8, everyone) · the heart (4, ending on G, which leads back into C minor at
//   the start, so it loops without a seam)
//
// The theme is written out below; the rest is made from each section's chords. Pure data, no
// Web Audio: sound.js plays it.

import { chords, tune, voicing } from "./score.js";
import { writing } from "./writing.js";

const THEME = tune(`
    C3:2 D3:1 Eb3:1 | D3:2 C3:2 | Bb2:2 C3:1 D3:1 | G2:2 B2:2 |
    Ab2:2 Bb2:1 C3:1 | Eb3:2 D3:2 | D3:1 C3:1 B2:2 | C3:2 G2:2`);
const THEME_CHORDS = chords("Cm Cm Gm G Ab Cm G Cm");

const HEART = chords("Cm Cm Ab G");

/** Compose it, as score.js compose. */
export function composeLair() {
    const { play, melody, section, done } = writing({ tempo: 66, beatsPerBar: 4, seed: 1066, level: 1.25 });

    // The heart: the bass drum twice, a little apart and the second softer, every bar
    const heart = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            play("bassdrum", bar, 0, "hit", 0.5, velocity, { exact: true });
            play("bassdrum", bar, 0.6, "hit", 0.5, velocity * 0.6, { exact: true });
        }
    };
    const gong = (velocity) => play("gong", 0, 0, "hit", 4, velocity, { exact: true });
    // The brass holding the chord low, sounded again each half bar: the trombones its root, the
    // horns its fifth
    const held = (names, velocity) => names.forEach((name, bar) => {
        const { root, fifth } = voicing(name, 43);

        for (const beat of [0, 2]) {
            play("trombone", bar, beat, root, 2.2, velocity);
            play("horn", bar, beat, fifth, 2.2, velocity * 0.8);
        }
    });
    // The timpani on the chord's root, every beat, the first of each bar leant on
    const timpani = (names, velocity) => names.forEach((name, bar) => {
        for (let beat = 0; beat < 4; beat++) {
            play("timpani", bar, beat, voicing(name, 39).root, 1, velocity * (beat === 0 ? 1 : 0.6), { exact: true });
        }
    });

    section("the heart", HEART, (names) => {
        gong(0.4);
        heart(names.length, 0.5);
        held(names, 0.3);
    });
    section("the theme", THEME_CHORDS, (names) => {
        melody("horn", THEME, 0.55);
        melody("trombone", THEME, 0.45);
        heart(names.length, 0.45);
    });
    section("the theme", THEME_CHORDS, (names) => {
        gong(0.32);
        melody("celli", THEME, 0.55);
        held(names, 0.32);
        heart(names.length, 0.45);
    });
    section("the theme", THEME_CHORDS, (names) => {
        gong(0.38);
        melody("horn", THEME, 0.6);
        melody("celli", THEME, 0.45, { shift: 12 });
        melody("trombone", THEME, 0.45);
        timpani(names, 0.4);
        heart(names.length, 0.5);
    });
    section("the heart", HEART, (names) => {
        heart(names.length, 0.48);
        held(names, 0.3);
    });

    return done();
}

/** A great lair's music, composed once. */
export const LAIR = composeLair();
