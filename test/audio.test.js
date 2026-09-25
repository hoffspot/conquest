// The game's sounds (client/js/audio): made in code (synth.js) and played from where they happen
// (sound.js)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { pluck } from "../client/js/audio/dsp.js";
import { sampleFiles } from "../client/js/audio/instruments.js";
import { BUSES, gainOf, Sound, VOLUME_DEFAULTS } from "../client/js/audio/sound.js";
import { SCORE } from "../client/js/audio/score.js";
import { loudness, PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "../client/js/audio/synth.js";
import { createRandom } from "../client/js/core/random.js";
import { WEAPONS } from "../client/js/core/weapons.js";

const peakOf = (samples) => samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0);

describe("making sounds (synth.js)", () => {
    it("makes every variant of every sound: short, clean, starting and ending in silence", () => {
        for (const [name, sound] of Object.entries(SOUNDS)) {
            for (let variant = 0; variant < sound.variants; variant++) {
                const samples = render(name, variant);
                const seconds = samples.length / SAMPLE_RATE;

                assert.ok(samples.every(Number.isFinite), `${name} ${variant}: numbers`);
                assert.ok(seconds > 0.05 && seconds < 2, `${name} ${variant}: ${seconds.toFixed(2)} s`);
                assert.ok(peakOf(samples) <= 0.95 + 1e-6, `${name} ${variant}: no clipping`);
                assert.ok(loudness(samples) > 0.2 && loudness(samples) < 0.31, `${name} ${variant}: loudness ${loudness(samples).toFixed(2)}`);
                assert.ok(Math.abs(samples[0]) < 1e-3 && Math.abs(samples.at(-1)) < 1e-3, `${name} ${variant}: no clicks at the ends`);
            }
        }
    });

    it("makes the same sound every time, and each variant different", () => {
        assert.deepEqual(render("slash", 1), render("slash", 1));
        assert.notDeepEqual(render("slash", 0), render("slash", 1));
        assert.notDeepEqual(render("stepStone", 2), render("stepStone", 3));
    });

    it("has a swing for every melee attack, a hit for every reaction and a launch for every projectile", () => {
        const swings = { sword: "swingSword", staff: "swingStaff", hammer: "swingHammer", punch: "swingPunch", cleaver: "swingCleaver" };

        for (const [id, { attacks }] of Object.entries(WEAPONS)) {
            for (const attack of attacks) {
                assert.ok(SOUNDS[attack.reaction], `${id}: a sound for ${attack.reaction}`);

                if (attack.kind === "melee") {
                    assert.ok(SOUNDS[swings[attack.animation]], `${id}: a swing`);
                } else {
                    assert.ok(SOUNDS[attack.projectile.kind], `${id}: a launch`);
                }
            }
        }
    });

    it("knows when each swing is loudest, to time it to the blow", () => {
        const window = Math.round(0.03 * SAMPLE_RATE);

        for (const [name, peak] of Object.entries(PEAKS)) {
            const samples = render(name, 0);
            let loudest = 0;
            let when = 0;

            for (let start = 0; start + window < samples.length; start += window / 2) {
                const energy = samples.subarray(start, start + window).reduce((sum, value) => sum + value * value, 0);

                if (energy > loudest) {
                    loudest = energy;
                    when = (start + window / 2) / SAMPLE_RATE;
                }
            }

            assert.ok(Math.abs(when - peak) < 0.06, `${name} loudest at ${when.toFixed(3)} s, said ${peak.toFixed(3)}`);
        }
    });

    it("puts every sound on the effects bus but for the town's: birds and leaves", () => {
        for (const [name, sound] of Object.entries(SOUNDS)) {
            assert.equal(sound.bus ?? "effects", ["bird", "leaves"].includes(name) ? "environment" : "effects", name);
        }
    });

    it("blows a wind that loops without a seam", () => {
        const samples = wind();
        const step = (k) => Math.abs(samples[(k + 1) % samples.length] - samples[k]);
        const steps = Array.from({ length: samples.length }, (_, k) => step(k)).sort((a, b) => a - b);

        assert.equal(samples.length, 10 * SAMPLE_RATE);
        assert.ok(peakOf(samples) <= 0.8 + 1e-6);
        // Round the end to the start is no bigger a step than the wind takes anyway
        assert.ok(step(samples.length - 1) <= steps[Math.floor(steps.length * 0.99)], "seamless");
    });

    it("tunes its plucked string between samples, so the bow twangs in tune", () => {
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

        for (const frequency of [110, 293.66, 659.26, 987.77]) {
            const measured = pitchOf(pluck(createRandom(3), frequency, 0.6, 0.998), SAMPLE_RATE);
            const cents = 1200 * Math.log2(measured / frequency);

            assert.ok(Math.abs(cents) < 3, `${frequency} Hz is ${cents.toFixed(1)} cents out`);
        }
    });
});

// A stand-in for the browser's Web Audio: records what's played, how loud, where and on which bus
function fakeAudio() {
    const played = [];
    const param = (value) => ({ value, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });

    // A node remembers what it's connected to, so a sound can be followed to its bus
    const node = (extra = {}) => {
        const self = {
            outputs: [],
            connect(next) {
                self.outputs.push(next);

                return next;
            },
            disconnect() {},
            ...extra,
        };

        return self;
    };

    class FakeContext {
        constructor() {
            this.state = "suspended";
            this.currentTime = 10;
            this.sampleRate = 48000;
            this.destination = node({ name: "destination" });
        }

        resume() {
            this.state = "running";

            return Promise.resolve();
        }

        suspend() {
            this.state = "suspended";

            return Promise.resolve();
        }

        close() {}

        createGain() {
            return node({ gain: param(1) });
        }

        createStereoPanner() {
            return node({ pan: param(0) });
        }

        createConvolver() {
            return node({ buffer: null });
        }

        createDynamicsCompressor() {
            return node({ threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
        }

        createBuffer(channels, length, rate) {
            const data = Array.from({ length: channels }, () => new Float32Array(length));

            return { length, sampleRate: rate, numberOfChannels: channels, getChannelData: (channel) => data[channel] };
        }

        // (Decodes a recording to a stand-in buffer, as the browser would, a moment later)
        decodeAudioData(recording) {
            return Promise.resolve(this.createBuffer(1, Math.max(1, recording.byteLength), 32000));
        }

        createBufferSource() {
            const source = node({
                playbackRate: param(1),
                addEventListener() {},
                start: (when = 0) => played.push({ source, when }),
                stop() {},
            });

            return source;
        }
    }

    globalThis.AudioContext = FakeContext;

    return played;
}

// Where a sound goes: its level (gain), pan, and the bus it ends up on
function route(sound, source) {
    const level = source.outputs[0];
    const next = level.outputs[0];
    const pan = next.pan ? next.pan.value : 0;
    const bus = Object.entries(sound.buses).find(([, gain]) => gain === next || gain === next.outputs[0])?.[0];

    return { gain: level.gain.value, pan, bus };
}

// Recordings "downloaded" from client/music, as the browser would
const fromDisk = async (url) => {
    const data = await readFile(url);

    return { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
};

// The sounds, made once (without a worker, as in Node), and the music's recordings, downloaded
// once, handed to each Sound tested
const made = new Sound({ fetch: fromDisk });
const making = made.prepare();

async function started(options) {
    await making;
    await made.downloading;

    const played = fakeAudio();
    const sound = new Sound({ fetch: fromDisk, ...options });

    sound.samples = new Map(made.samples);
    sound.recordings = new Map(made.recordings);
    sound.ready = making;
    sound.downloading = made.downloading;
    sound.unlock();

    // (The browser decodes the recordings a moment later)
    await new Promise((resolve) => setTimeout(resolve, 0));

    return { sound, played };
}

describe("playing sounds (sound.js)", () => {
    it("makes every sound (here without a worker), downloads the music's recordings, and plays nothing before it's unlocked", async () => {
        await making;
        await made.downloading;

        for (const [name, { variants }] of Object.entries(SOUNDS)) {
            assert.equal(made.samples.get(name)?.filter(Boolean).length, variants, name);
        }

        assert.ok(made.samples.has("wind"));
        assert.deepEqual([...made.recordings.keys()].sort(), sampleFiles().map(([id]) => id).sort());
        assert.equal(made.play("slash"), null, "no sound until the browser allows it");

        // Unlocked, the browser decodes them all
        const { sound } = await started();

        assert.equal(sound.instruments.size, sampleFiles().length);
        assert.equal(sound.recordings.size, 0, "and they're let go once decoded");
        sound.close();
    });

    it("plays no music without its recordings (offline, say), and doesn't mind", async () => {
        const offline = new Sound({ fetch: async () => ({ ok: false, status: 404 }) });

        await offline.prepare();
        await offline.downloading;
        assert.equal(offline.recordings.size, 0);
        assert.equal(offline.unplayable, sampleFiles().length);
    });

    it("starts the music without a recording it couldn't get, rather than never", async () => {
        const [missing] = sampleFiles()[0];
        const { sound } = await started();

        // (As if that one had failed to download)
        sound.instruments.delete(missing);
        sound.unplayable = 1;
        sound.scheduleMusic();
        assert.notEqual(sound.music.start, null);
        sound.close();
    });

    it("plays from where things happen: quieter further away, and to the side they're on", async () => {
        const { sound, played } = await started();

        sound.setListener(50, 50);

        const level = (x, z) => {
            played.length = 0;

            const source = sound.play("crush", { at: { x, z } });

            return source ? route(sound, source) : null;
        };
        const near = level(51, 50);
        const middle = level(65, 50);

        assert.ok(near && middle && near.gain > middle.gain * 2, "quieter further away");
        assert.equal(level(95, 50), null, "not heard at all far away");
        assert.ok(level(40, 50).pan < 0 && level(60, 50).pan > 0, "left and right");
        sound.close();
    });

    it("sends each kind of sound to its own bus, as loud as its slider says", async () => {
        const { sound } = await started({ volumes: { effects: 0.8, environment: 0.5, music: 0.2 } });

        assert.deepEqual(BUSES, ["effects", "environment", "music"]);
        assert.deepEqual(VOLUME_DEFAULTS, { effects: 0.5, environment: 0.4, music: 0.35 });
        assert.equal(route(sound, sound.play("slash")).bus, "effects");
        assert.equal(route(sound, sound.play("bird")).bus, "environment");
        assert.ok(Math.abs(sound.buses.music.gain.value - gainOf(0.2)) < 1e-9);

        // The music is soft next to the effects and the town, to start with
        assert.ok(gainOf(VOLUME_DEFAULTS.music) < gainOf(VOLUME_DEFAULTS.environment) && gainOf(VOLUME_DEFAULTS.environment) < gainOf(VOLUME_DEFAULTS.effects));

        sound.setVolume("effects", 0.25);
        assert.ok(Math.abs(sound.buses.effects.gain.value - gainOf(0.25)) < 1e-9);
        assert.equal(gainOf(0), 0);
        assert.equal(gainOf(1), 1);
        assert.equal(gainOf(0.5), 0.25, "halfway is 12 dB down");
        sound.close();
    });

    it("times a swing to be loudest as the blow lands, and falls silent turned off or hidden", async () => {
        const { sound, played } = await started();

        sound.attack("hammer", { x: 0, z: 0 }, 0.64);
        assert.ok(Math.abs(played.at(-1).when - (10 + 0.64 - PEAKS.swingHammer)) < 1e-9);
        assert.equal(sound.attack("bow", { x: 0, z: 0 }, 0.66), null, "bows twang when they let go, not when drawn");

        sound.setHidden(true);
        assert.equal(sound.play("lock"), null);
        sound.setHidden(false);
        await Promise.resolve();
        sound.setEnabled(false);
        assert.equal(sound.play("lock"), null);
        sound.setEnabled(true);
        await Promise.resolve();
        assert.ok(sound.play("lock"));
        sound.close();
    });

    it("plays the score a little ahead of time, on the music bus, round again without a gap", async () => {
        const { sound, played } = await started();
        const context = sound.context;
        const music = () => played.filter(({ source }) => source.outputs[0].outputs[0] && Object.values(sound.music.channels).includes(source.outputs[0].outputs[0]));

        played.length = 0;
        sound.scheduleMusic();

        const first = music();
        const start = sound.music.start;

        assert.ok(first.length > 0, "the first notes are scheduled");
        assert.ok(first.every(({ when }) => when >= context.currentTime && when <= context.currentTime + 1.6), "a little ahead");

        // Nearly four minutes on, into the next time round: the notes carry straight on
        for (let t = 0; t <= SCORE.length + 5; t += 0.2) {
            context.currentTime = 10 + t;
            sound.scheduleMusic();
        }

        const times = music().map(({ when }) => when);

        assert.equal(sound.music.loop, 1);
        assert.ok(times.some((when) => Math.abs(when - (start + SCORE.length + SCORE.notes[0].time)) < 0.05), "the first note again, one score's length later");
        assert.ok(times.every((when, k) => k === 0 || when >= times[k - 1] - 0.05), "in order");

        const gaps = times.slice(1).map((when, k) => when - times[k]);
        const bar = (SCORE.beatsPerBar * 60) / SCORE.tempo;

        // At most a bar held without a new note, and round the end straight back to the start
        assert.ok(Math.max(...gaps) < bar + 0.05, `never more than ${Math.max(...gaps).toFixed(2)} s without a note`);
        assert.ok(SCORE.length - SCORE.notes.at(-1).time + SCORE.notes[0].time < 0.5, "no pause at the seam");

        // Silent while turned off; turned down to nothing, nothing is played
        sound.setVolume("music", 0);
        played.length = 0;
        context.currentTime += 1;
        sound.scheduleMusic();
        assert.equal(music().length, 0);
        sound.close();
    });
});
