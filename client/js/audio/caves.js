// A cave's music: what's heard in caves and bandits' hideouts (sound.js PLACES cave), dark,
// echoing and alone. Slow, with no beat to speak of: the cellos holding a low chord (or, under
// their tune, a pipe organ's low A), a bowed vibraphone's cold held notes, and over them a
// kalimba and a marimba dropping notes here and there like water dripping from the roof, now
// one, now two together, never in time; a slit drum far off, like something moving deeper in.
//
// A minor (A Aeolian), 4/4 at 56 beats a minute, a little over two minutes:
//
//   the dark (4 bars) · drips (8) · the deep (8, the cellos' tune) · drips (8) · the dark (4,
//   ending on A minor as it began, so it loops without a seam)
//
// The cellos' tune is written out below; the drips are placed by a seeded random choice, the
// same every time. Pure data, no Web Audio: sound.js plays it.

import { createRandom } from "../core/random.js";
import { chords, midi, tune, voicing } from "./score.js";
import { writing } from "./writing.js";

// Where the drips fall: A minor's five-note scale (A C D E G), high up, so no two of them jar
const DRIPS = [69, 72, 74, 76, 79, 81, 84];

const DEEP = tune(`
    E3:3 D3:1 | C3:3 r:1 | D3:2 E3:2 | A2:3 r:1 |
    E3:3 F3:1 | E3:2 D3:2 | C3:2 B2:2 | A2:3 r:1`);
const DEEP_CHORDS = chords("Am Am Dm Am Am Dm G Am");

const DARK = chords("Am Am Dm Am");
const DRIPPING = chords("Am Am F F Dm Dm Am Am");

/** Compose it, as score.js compose. */
export function composeCaves() {
    const { play, melody, section, done } = writing({ tempo: 56, beatsPerBar: 4, seed: 2112, level: 1.4 });
    const random = createRandom(2113);

    // The cellos holding the chord's root and fifth, low, through each bar: bowed again each
    // half bar, each held on over the next's start
    const held = (names, velocity) => names.forEach((name, bar) => {
        const { root, fifth } = voicing(name, 40);

        for (const beat of [0, 2]) {
            play("celli", bar, beat, root, 2.4, velocity);
            play("celli", bar, beat, fifth, 2.4, velocity * 0.7);
        }
    });
    // The vibraphone's cold notes: the chord's fifth up high, every other bar
    const cold = (names, velocity) => names.forEach((name, bar) => {
        if (bar % 2 === 0) {
            play("vibes", bar, 0.5, voicing(name, 74).fifth, 3, velocity);
        }
    });
    // Drips: one or two a bar, anywhere in it, on the kalimba or the marimba, from A minor's notes
    const drips = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            const count = random.chance(0.4) ? 2 : 1;

            for (let k = 0; k < count; k++) {
                const beat = Math.round(random.range(0, 3.75) * 4) / 4;
                const pitch = DRIPS[random.int(0, DRIPS.length - 1)];

                play(random.chance(0.6) ? "kalimba" : "marimba", bar, beat, pitch, 0.5, velocity * random.range(0.6, 1));
            }
        }
    };
    // The slit drum far off, now and then
    const far = (bars, velocity) => {
        for (let bar = 1; bar < bars; bar += 4) {
            play("slitdrum", bar, 2.5, "low", 0.5, velocity, { exact: true });
            play("slitdrum", bar, 3, "low", 0.5, velocity * 0.7, { exact: true });
        }
    };

    section("the dark", DARK, (names) => {
        held(names, 0.4);
        cold(names, 0.22);
    });
    section("drips", DRIPPING, (names) => {
        held(names, 0.38);
        drips(names.length, 0.4);
        cold(names, 0.2);
        far(names.length, 0.35);
    });
    section("the deep", DEEP_CHORDS, (names) => {
        melody("celli", DEEP, 0.52);
        names.forEach((_, bar) => [0, 2].forEach((beat) => play("pipeorgan", bar, beat, midi("A2"), 2.4, 0.22, { exact: true })));
        cold(names, 0.24);
        drips(names.length, 0.3);
    });
    section("drips", DRIPPING, (names) => {
        held(names, 0.38);
        drips(names.length, 0.42);
        cold(names, 0.22);
        far(names.length, 0.35);
    });
    section("the dark", DARK, (names) => {
        held(names, 0.36);
        cold(names, 0.2);
    });

    return done();
}

/** A cave's music, composed once. */
export const CAVES = composeCaves();
