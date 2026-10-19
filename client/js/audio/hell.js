// A hell's music: what's heard in a hell's realms (sound.js PLACES), forlorn, creepy and without
// hope, over the realm's own drone (synth.js drone, ambience.js). No beat at all: a chamber
// organ's soft chords over a bass that only ever falls, a half step at a time (the old lament's bass,
// from A down to E, and down again, lower); the cellos with it; two bells far off, tolling A and
// the E flat a tritone over it, the devil's interval; a pipe organ's low A held under it all; a
// bowed vibraphone's notes high and cold, a half step apart; and a flute's sighs, each a half
// step down, and none answered.
//
// A minor, 4/4 at 50 beats a minute, about two and a half minutes:
//
//   the toll (4 bars) · the lament (8) · the sighs (8, the flute) · the lament (8, lower at its
//   end) · the toll (4, ending on A as it began, so it loops without a seam)
//
// Each realm's deeper than the last, and so's its drone (ambience.js: the Halls of Bone's a tone
// under the Breach's, the River of Fire's two, the Pit's a fifth): its music's played that much
// lower (`shifts`, sound.js PLACES `shift`), so it's always in tune with it. Pure data, no Web
// Audio: sound.js plays it.

import { chords, midi, tune, voicing } from "./score.js";
import { writing } from "./writing.js";

// The lament's bass, two notes a bar, each a half step under the last, and the chord over each
const LAMENT = tune(`A3:2 G#3:2 | G3:2 F#3:2 | F3:2 E3:2 | A3:2 A3:2 | A3:2 G#3:2 | G3:2 F#3:2 | F3:2 E3:2 | E3:2 D#3:2`);
const OVER = chords("Am E C D Dm E Am Am Am E C D Dm E E B");

// The flute's sighs: a note and the half step under it, a bar's rest after each
const SIGHS = tune(`C5:2 B4:2 | r:4 | F5:2 E5:2 | r:4 | A4:2 G#4:2 | r:4 | D5:2 C#5:2 | r:4`);

const STILL = chords("Am Am Am Am");
const LAMENTING = chords("Am C Dm Am Am C Dm E");
const SIGHING = chords("Am Am Am Am Am Am Am Am");

/** Compose it, as score.js compose. */
export function composeHell() {
    const { play, melody, section, done } = writing({ tempo: 50, beatsPerBar: 4, seed: 6660, level: 1.5 });

    // The cellos on the lament's bass, and the organ's chord over each of its notes, softly
    const lament = (velocity) => {
        let beat = 0;

        LAMENT.forEach(([bass, beats], k) => {
            const { root, third, fifth } = voicing(OVER[k], 55);
            const bar = Math.floor(beat / 4);

            play("celli", bar, beat % 4, bass, beats - 0.1, velocity);

            for (const pitch of [root, third, fifth]) {
                play("organ", bar, beat % 4, pitch, beats - 0.1, velocity * 0.6);
            }

            beat += beats;
        });
    };
    // Two bells far off, the first bar of every `every`: A, and a beat and a half after, the E
    // flat over it
    const toll = (bars, velocity, every = 2) => {
        for (let bar = 0; bar < bars; bar += every) {
            play("bells", bar, 0, midi("A4"), 3, velocity);
            play("bells", bar, 1.5, midi("D#5"), 3, velocity * 0.7);
        }
    };
    // The vibraphone's cold notes: E and the F over it, every other bar
    const cold = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar += 2) {
            play("vibes", bar, 0, midi("E5"), 2.8, velocity);
            play("vibes", bar, 1, midi("F5"), 2.4, velocity * 0.7);
        }
    };
    // The organ's low A, held, sounded again each half bar
    const low = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            for (const beat of [0, 2]) {
                play("pipeorgan", bar, beat, midi("A2"), 2.2, velocity, { exact: true });
            }
        }
    };

    section("the toll", STILL, (names) => {
        toll(names.length, 0.3, 2);
        low(names.length, 0.3);
    });
    section("the lament", LAMENTING, (names) => {
        lament(0.42);
        toll(names.length, 0.22, 4);
    });
    section("the sighs", SIGHING, (names) => {
        melody("flute", SIGHS, 0.45);
        cold(names.length, 0.24);
        low(names.length, 0.28);
    });
    section("the lament", LAMENTING, (names) => {
        lament(0.44);
        cold(names.length, 0.18);
        toll(names.length, 0.22, 4);
    });
    section("the toll", STILL, (names) => {
        toll(names.length, 0.3, 2);
        low(names.length, 0.3);
    });

    return done();
}

/** A hell's music, composed once, and how much lower it's played in each realm (semitones). */
export const HELL = Object.assign(composeHell(), { shifts: Object.freeze([0, -2, -4, -7]) });
