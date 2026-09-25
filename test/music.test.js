// The music: its score (client/js/audio/score.js) and the recordings of real instruments it's
// played on (instruments.js, samples.js, made by scripts/build-music.js)
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { baseFor, INSTRUMENTS, keysOf, sampleFiles } from "../client/js/audio/instruments.js";
import { SAMPLES } from "../client/js/audio/samples.js";
import { BEATS_PER_BAR, midi, SCORE, TEMPO } from "../client/js/audio/score.js";
import { decodeWav, regionsOf } from "../scripts/build-music.js";

const BAR = (BEATS_PER_BAR * 60) / TEMPO;
const MUSIC = new URL("../client/music/", import.meta.url);

describe("the score (score.js)", () => {
    it("is a song four minutes long: intro, verses, choruses, a bridge and an outro", () => {
        assert.equal(TEMPO, 96);
        assert.equal(BEATS_PER_BAR, 3);
        assert.ok(Math.abs(SCORE.length - 240) < 1e-9, `${SCORE.length} s`);
        assert.deepEqual(SCORE.sections.map(({ name }) => name), ["intro", "verse", "chorus", "verse", "chorus", "bridge", "quiet verse", "last chorus", "outro"]);
        assert.equal(SCORE.sections.reduce((bars, section) => bars + section.bars, 0) * BAR, SCORE.length);
        assert.ok(SCORE.sections.every((section, k) => k === 0 || section.bar === SCORE.sections[k - 1].bar + SCORE.sections[k - 1].bars));
    });

    it("writes every note in time, on an instrument, near a recording of it, in order", () => {
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
                // Two semitones from a recording at most, but for the ocarina's lowest notes
                // (the library's lowest is A4: F4 plays it four semitones down)
                const most = note.instrument === "ocarina" ? 4 : 2;

                assert.ok(Math.abs(baseFor(note.instrument, note.pitch) - note.pitch) <= most, `${note.instrument} ${note.pitch}`);
            }
        }
    });

    it("has a tune in every section, and a band playing the choruses", () => {
        const melodic = ["recorder", "ocarina", "harp"];

        for (const section of SCORE.sections) {
            const start = section.start;
            const end = start + section.bars * BAR;
            const playing = new Set(SCORE.notes.filter(({ time }) => time >= start && time < end).map(({ instrument }) => instrument));

            assert.ok(melodic.some((name) => playing.has(name)), `${section.name} has a tune`);

            if (section.name.includes("chorus")) {
                assert.ok(playing.size >= 6, `${section.name}: ${[...playing]}`);
            }
        }

        // The bridge's harpsichord arpeggios
        const bridge = SCORE.sections.find(({ name }) => name === "bridge");

        assert.ok(SCORE.notes.some(({ instrument, time }) => instrument === "harpsichord" && time >= bridge.start && time < bridge.start + bridge.bars * BAR));
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

describe("the instruments (instruments.js, samples.js)", () => {
    it("has recordings of every instrument the score plays, and of every kind of drum hit", () => {
        const played = new Set(SCORE.notes.map(({ instrument }) => instrument));

        assert.deepEqual([...played].sort(), Object.keys(INSTRUMENTS).sort());
        assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(INSTRUMENTS).sort());

        for (const [name, instrument] of Object.entries(INSTRUMENTS)) {
            if (instrument.kinds) {
                assert.deepEqual(SAMPLES[name].map(({ kind }) => kind), instrument.kinds, name);
            } else {
                assert.ok(keysOf(name).length >= 2, name);
            }
        }
    });

    it("plays each note from the nearest recording (a drum's kind of hit, as it is)", () => {
        assert.deepEqual(keysOf("recorder"), [65, 70, 74, 78, 82]);
        assert.equal(baseFor("recorder", 66), 65);
        assert.equal(baseFor("recorder", 69), 70);
        assert.equal(baseFor("recorder", 81), 82);
        assert.equal(baseFor("drum", "low"), "low");
    });

    it("keeps every recording in client/music, as a small MP3, and nothing else", () => {
        const files = sampleFiles();
        const listed = new Set(files.map(([, url]) => url.pathname.split("/").pop()));
        let bytes = 0;

        assert.equal(files.length, Object.values(SAMPLES).flat().length);
        assert.equal(new Set(files.map(([id]) => id)).size, files.length, "one each");
        assert.deepEqual(readdirSync(MUSIC).sort(), [...listed].sort());

        for (const [id, url] of files) {
            const data = readFileSync(url);

            // An MP3 frame's sync word, and a name that changes with what's in it
            assert.ok(data[0] === 0xff && (data[1] & 0xe0) === 0xe0, `${id}: an MP3`);
            assert.match(url.pathname, /\/[a-z]+-[a-z0-9]+\.[0-9a-f]{8}\.mp3$/);
            assert.ok(statSync(url).size < 40_000, `${id}: small`);
            bytes += data.length;
        }

        assert.ok(bytes < 1_200_000, `${bytes} bytes in all`);
    });
});

describe("making the recordings (scripts/build-music.js)", () => {
    it("reads the library's SFZ files: each recording, its note, where it starts, its tuning, and whether it's a note's release", () => {
        const regions = regionsOf(`// Made by a tool
<group>
ampeg_release=0.3

<region>
sample=Recorder/Sus/Alto_F3.wav
pitch_keycenter=65
offset=1002
tune=-2

<group>
trigger=release

<region>
sample=Recorder/Sus/Alto_G#3.wav
pitch_keycenter=68
`);

        assert.deepEqual(regions, [
            { sample: "Recorder/Sus/Alto_F3.wav", key: 65, offset: 1002, tune: -2, trigger: "attack" },
            { sample: "Recorder/Sus/Alto_G#3.wav", key: 68, offset: 0, tune: 0, trigger: "release" },
        ]);
    });

    it("reads its WAV files, 16 and 24 bit, mono and stereo, mixed to one channel", () => {
        // A WAV file of `frames` [left, right] pairs
        const wav = (bits, channels, frames) => {
            const width = bits / 8;
            const data = Buffer.alloc(frames.length * channels * width);

            frames.forEach((frame, n) => frame.slice(0, channels).forEach((value, channel) => data.writeIntLE(Math.round(value * (2 ** (bits - 1) - 1)), (n * channels + channel) * width, width)));

            const format = Buffer.alloc(16);

            format.writeUInt16LE(1, 0);
            format.writeUInt16LE(channels, 2);
            format.writeUInt32LE(44100, 4);
            format.writeUInt32LE(44100 * channels * width, 8);
            format.writeUInt16LE(channels * width, 12);
            format.writeUInt16LE(bits, 14);

            const chunk = (id, body) => Buffer.concat([Buffer.from(id), Buffer.from(Uint32Array.of(body.length).buffer), body]);

            return Buffer.concat([Buffer.from("RIFF"), Buffer.from(Uint32Array.of(0).buffer), Buffer.from("WAVE"), chunk("fmt ", format), chunk("data", data)]);
        };

        const mono = decodeWav(wav(16, 1, [[0.5], [-0.25]]));
        const stereo = decodeWav(wav(24, 2, [[0.5, 0.25], [-1, 0]]));

        assert.equal(mono.rate, 44100);
        assert.ok(Math.abs(mono.samples[0] - 0.5) < 1e-3 && Math.abs(mono.samples[1] + 0.25) < 1e-3);
        assert.ok(Math.abs(stereo.samples[0] - 0.375) < 1e-4 && Math.abs(stereo.samples[1] + 0.5) < 1e-4);
    });
});
