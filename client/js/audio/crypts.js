// A crypt's music: what's heard in crypts and the ancient tombs (sound.js PLACES crypt), a
// requiem for the long dead. A slow chorale, soft, in four parts, a breath between its chords: a
// pipe organ's deep bass under the chamber organ's chords; tubular bells tolling, far off; a
// flute's low lament over it; the cellos doubling its bass.
//
// D minor (D Aeolian, its A chords major), 3/4 at 60 beats a minute, about a minute and a
// half:
//
//   the bell (4 bars) · the chorale (8) · the lament (8, the flute) · the chorale (8, the cellos
//   with it) · the bell (4, ending on D minor as it began, so it loops without a seam)
//
// The lament is written out below; the chorale is made from its chords. Pure data, no Web
// Audio: sound.js plays it.

import { chords, midi, tune, voicing } from "./score.js";
import { writing } from "./writing.js";

const CHORALE = chords("Dm Gm Dm A Dm Bb Gm A");
const CHORALE_AGAIN = chords("Dm F Gm Dm Bb Gm A Dm");

const LAMENT = tune(`
    A4:2 F4:1 | G4:2 Bb4:1 | A4:2 D4:1 | E4:2 C#4:1 |
    F4:2 A4:1 | D5:2 Bb4:1 | A4:1 G4:1 E4:1 | D4:3`);
const LAMENT_CHORDS = chords("Dm Gm Dm A Dm Bb A Dm");

const STILL = chords("Dm Dm Dm Dm");

/** Compose it, as score.js compose. */
export function composeCrypts() {
    const { play, melody, section, done } = writing({ tempo: 60, beatsPerBar: 3, seed: 1348, level: 1.4 });

    // The chorale: the pipe organ's bass and the chord over it on the chamber organ, a bar each
    // (a breath before the next), softly
    const chorale = (names, velocity, { cellos = false } = {}) => names.forEach((name, bar) => {
        const bass = voicing(name, 38).root;
        const { root, third, fifth } = voicing(name, 55);

        play("pipeorgan", bar, 0, bass, 2.4, velocity);

        for (const pitch of [root, third, fifth]) {
            play("organ", bar, 0, pitch, 2.2, velocity * 0.65);
        }

        if (cellos) {
            play("celli", bar, 0, bass + 12, 2.4, velocity * 0.9);
        }
    });
    // The pipe organ's low D, held, sounded again each half bar
    const low = (bars, velocity) => {
        for (let bar = 0; bar < bars; bar++) {
            for (const beat of [0, 1.5]) {
                play("pipeorgan", bar, beat, midi("D2"), 1.9, velocity, { exact: true });
            }
        }
    };
    // A bell tolling D far off, every `every` bars
    const toll = (bars, velocity, every = 2) => {
        for (let bar = 0; bar < bars; bar += every) {
            play("bells", bar, 0, midi("D4"), 3, velocity);
        }
    };

    section("the bell", STILL, (names) => {
        toll(names.length, 0.3, 1);
        low(names.length, 0.28);
    });
    section("the chorale", CHORALE, (names) => {
        chorale(names, 0.4);
        toll(names.length, 0.24, 4);
    });
    section("the lament", LAMENT_CHORDS, (names) => {
        melody("flute", LAMENT, 0.52);
        chorale(names, 0.3);
    });
    section("the chorale", CHORALE_AGAIN, (names) => {
        chorale(names, 0.42, { cellos: true });
        toll(names.length, 0.24, 4);
    });
    section("the bell", STILL, (names) => {
        toll(names.length, 0.28, 1);
        low(names.length, 0.26);
    });

    return done();
}

/** A crypt's music, composed once. */
export const CRYPTS = composeCrypts();
