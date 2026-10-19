// An ants' nest's music: what's heard down in an ants' nest (sound.js PLACES nest), skittering
// and tense, like something many-legged close by in the dark. Cellos plucked, quick and low,
// creeping by half steps; a marimba ticking softly high up; a shaker's rattle and a slit drum's
// knocks; a bowed vibraphone holding two notes a half step apart, high and thin, never loud.
//
// E minor with a flattened second (E Phrygian: F natural), 4/4 at 116 beats a minute, about a
// minute and a half:
//
//   the scratching (4 bars, the cellos) · the ticking (8) · closer (8, the vibraphone) · the
//   climb (8, a half step higher each two bars) · the ticking (8) · the scratching (4, ending
//   on E as it began, so it loops without a seam)
//
// Everything's made from each section's chords. Pure data, no Web Audio: sound.js plays it.

import { chords, midi } from "./score.js";
import { writing } from "./writing.js";

// The plucked cellos' creeping figure in quavers, in semitones from the bar's root
const CREEP = [0, 0, 1, 0, 3, 1, 0, -1];

// The ticking marimba's figure in semiquavers, in semitones from E5 (E F E D, a step up and back)
const TICKS = [0, 1, 0, -2, 0, 1, 3, 1];

const E = midi("E2");

/** Compose it, as score.js compose. */
export function composeNest() {
    const { play, section, done } = writing({ tempo: 116, beatsPerBar: 4, seed: 4242, level: 1.7 });

    // The cellos plucked, from each bar's root (semitones over E)
    const creep = (roots, velocity) => roots.forEach((root, bar) => {
        CREEP.forEach((step, k) => play("pizzicato", bar, k * 0.5, E + root + step, 0.4, velocity * (k % 4 === 0 ? 1 : 0.75)));
    });
    // The marimba ticking in semiquavers on the bar's last two beats
    const ticks = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            TICKS.forEach((step, k) => play("marimba", bar, 2 + k * 0.25, midi("E5") + step, 0.25, velocity * (k % 2 ? 0.6 : 0.85)));
        }
    };
    // The shaker and the slit drum
    const rattle = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            for (let beat = 0; beat < 4; beat++) {
                play("shaker", bar, beat + 0.5, beat % 2 ? "up" : "down", 0.5, velocity * 0.5, { exact: true });
            }

            play("slitdrum", bar, 0, "low", 0.5, velocity, { exact: true });
            play("slitdrum", bar, 1.75, "high", 0.5, velocity * 0.6, { exact: true });
            play("slitdrum", bar, 3.25, "high", 0.5, velocity * 0.5, { exact: true });
        }
    };
    // The vibraphone's two notes a half step apart (B and C), held, every other bar
    const thin = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar += 2) {
            play("vibes", bar, 0, midi("B4"), 3, velocity);
            play("vibes", bar, 0, midi("C5"), 3, velocity * 0.8);
        }
    };

    const roots = (text) => text.split(" ").map(Number);

    section("the scratching", chords("Em Em Em Em"), () => {
        creep(roots("0 0 0 0"), 0.42);
    });
    section("the ticking", chords("Em Em F Em Em Em F Em"), () => {
        creep(roots("0 0 1 0 0 0 1 0"), 0.46);
        ticks(8, 0.32);
        rattle(8, 0.36);
    });
    section("closer", chords("Em Em F Em Em Em F Em"), () => {
        creep(roots("0 0 1 0 0 0 1 0"), 0.48);
        ticks(8, 0.3);
        thin(8, 0.2);
        rattle(8, 0.38);
    });
    section("the climb", chords("Em Em F F G G F F"), () => {
        creep(roots("0 0 1 1 3 3 1 1"), 0.5);
        thin(8, 0.22);
        rattle(8, 0.4);
    });
    section("the ticking", chords("Em Em F Em Em Em F Em"), () => {
        creep(roots("0 0 1 0 0 0 1 0"), 0.46);
        ticks(8, 0.32);
        rattle(8, 0.36);
    });
    section("the scratching", chords("Em Em Em Em"), () => {
        creep(roots("0 0 0 0"), 0.4);
    });

    return done();
}

/** An ants' nest's music, composed once. */
export const NEST = composeNest();
