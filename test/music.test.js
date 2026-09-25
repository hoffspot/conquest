// The music: its score (client/js/audio/score.js) and instruments (instruments.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atRate, loudness, pluck } from "../client/js/audio/dsp.js";
import { baseFor, basesOf, frequencyOf, instrumentSamples, INSTRUMENTS, MUSIC_RATE, renderInstrument } from "../client/js/audio/instruments.js";
import { BEATS_PER_BAR, midi, SCORE, TEMPO } from "../client/js/audio/score.js";
import { createRandom } from "../client/js/core/random.js";

const BAR = (BEATS_PER_BAR * 60) / TEMPO;

describe("the score (score.js)", () => {
    it("is a song four minutes long: intro, verses, choruses, a bridge and an outro", () => {
        assert.equal(TEMPO, 96);
        assert.equal(BEATS_PER_BAR, 3);
        assert.ok(Math.abs(SCORE.length - 240) < 1e-9, `${SCORE.length} s`);
        assert.deepEqual(SCORE.sections.map(({ name }) => name), ["intro", "verse", "chorus", "verse", "chorus", "bridge", "quiet verse", "last chorus", "outro"]);
        assert.equal(SCORE.sections.reduce((bars, section) => bars + section.bars, 0) * BAR, SCORE.length);
        assert.ok(SCORE.sections.every((section, k) => k === 0 || section.bar === SCORE.sections[k - 1].bar + SCORE.sections[k - 1].bars));
    });

    it("writes every note in time and in its instrument's range, in order", () => {
        assert.ok(SCORE.notes.length > 1500);

        for (const [k, note] of SCORE.notes.entries()) {
            const instrument = INSTRUMENTS[note.instrument];

            assert.ok(instrument, note.instrument);
            assert.ok(note.time >= 0 && note.time < SCORE.length, `${note.instrument} at ${note.time}`);
            assert.ok(k === 0 || note.time >= SCORE.notes[k - 1].time, "in time order");
            assert.ok(note.duration > 0 && note.velocity > 0 && note.velocity <= 1);

            if (instrument.kinds) {
                assert.ok(instrument.kinds.includes(note.pitch));
            } else {
                assert.ok(note.pitch >= instrument.range[0] && note.pitch <= instrument.range[1], `${note.instrument} ${note.pitch}`);
            }
        }
    });

    it("has a tune in every section, and a band playing the choruses", () => {
        const melodic = ["recorder", "fiddle", "harp"];

        for (const section of SCORE.sections) {
            const start = section.start;
            const end = start + section.bars * BAR;
            const playing = new Set(SCORE.notes.filter(({ time }) => time >= start && time < end).map(({ instrument }) => instrument));

            assert.ok(melodic.some((name) => playing.has(name)), `${section.name} has a tune`);

            if (section.name.includes("chorus")) {
                assert.ok(playing.size >= 6, `${section.name}: ${[...playing]}`);
            }
        }

        // The bridge's nod to the old games' sound chips
        const bridge = SCORE.sections.find(({ name }) => name === "bridge");

        assert.ok(SCORE.notes.some(({ instrument, time }) => instrument === "chip" && time >= bridge.start && time < bridge.start + bridge.bars * BAR));
    });

    it("keeps to D Dorian, but for the A major chord's C sharp and the bridge's B flat", () => {
        const allowed = new Set([2, 4, 5, 7, 9, 11, 0, 1, 10]);
        const pitched = SCORE.notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds);
        const inKey = pitched.filter(({ pitch }) => allowed.has(pitch % 12));

        assert.equal(inKey.length, pitched.length);
        assert.equal(midi("D4"), 62);
        assert.equal(midi("C#5"), 73);
        assert.equal(midi("Bb3"), 58);
    });

    it("ends on A, leading back into D minor at the start: it loops without a seam", () => {
        const lastBar = SCORE.notes.filter(({ time }) => time >= SCORE.length - BAR);
        const firstBar = SCORE.notes.filter(({ time }) => time < BAR);
        const lowest = (notes) => notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds).reduce((low, note) => (note.pitch < low.pitch ? note : low));

        assert.equal(lowest(lastBar).pitch % 12, 9, "an A underneath at the end");
        assert.equal(lowest(firstBar).pitch % 12, 2, "a D underneath at the start");
        assert.ok(SCORE.length - SCORE.notes.at(-1).time + SCORE.notes[0].time < 0.5, "no pause between them");
    });
});

describe("the instruments (instruments.js)", () => {
    it("makes each instrument at pitches a fifth apart across its range, and plays notes from the nearest", () => {
        assert.deepEqual(basesOf(INSTRUMENTS.recorder), [60, 67, 74, 81, 88]);
        assert.equal(baseFor(INSTRUMENTS.recorder, 72), 74);
        assert.equal(baseFor(INSTRUMENTS.recorder, 63), 60);
        assert.ok(Math.abs(frequencyOf(69) - 440) < 1e-9);
        assert.ok(Math.abs(frequencyOf(81) - 880) < 1e-9);

        // Never more than three and a half semitones from a note to its sample
        for (const note of SCORE.notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds)) {
            assert.ok(Math.abs(baseFor(INSTRUMENTS[note.instrument], note.pitch) - note.pitch) <= 3.5, `${note.instrument} ${note.pitch}`);
        }
    });

    it("makes every sample, clean and about as loud as the others", () => {
        for (const [name, key] of instrumentSamples()) {
            const samples = renderInstrument(name, key);

            assert.ok(samples.every(Number.isFinite), `${name} ${key}`);
            assert.ok(samples.length >= INSTRUMENTS[name].length * MUSIC_RATE - 1, `${name} ${key}: long enough`);
            assert.ok(atRate(MUSIC_RATE, () => loudness(samples)) > 0.15, `${name} ${key}: heard`);
            assert.ok(samples.every((value) => Math.abs(value) <= 0.95 + 1e-6), `${name} ${key}: no clipping`);
        }
    });

    it("tunes its plucked strings between samples, so the lute and harp are in tune", () => {
        // The pitch, by where the signal best matches itself a period later
        const pitchOf = (samples, rate) => {
            const window = 6000;
            const match = (lag) => samples.subarray(1000, 1000 + window).reduce((sum, value, n) => sum + value * samples[1000 + n + lag], 0);
            let best = 0;
            let lag = 0;

            for (let l = Math.floor(rate / 1500); l < rate / 60; l++) {
                const m = match(l);

                if (m > best) {
                    best = m;
                    lag = l;
                }
            }

            const [a, b, c] = [match(lag - 1), match(lag), match(lag + 1)];

            return rate / (lag + (a - c) / (2 * (a - 2 * b + c)));
        };

        atRate(MUSIC_RATE, () => {
            for (const frequency of [110, 293.66, 659.26, 987.77]) {
                const measured = pitchOf(pluck(createRandom(3), frequency, 0.6, 0.998), MUSIC_RATE);
                const cents = 1200 * Math.log2(measured / frequency);

                assert.ok(Math.abs(cents) < 3, `${frequency} Hz is ${cents.toFixed(1)} cents out`);
            }
        });
    });
});
