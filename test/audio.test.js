// The game's sounds (client/js/audio): made in code (synth.js) and played from where they happen
// (sound.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Sound } from "../client/js/audio/sound.js";
import { loudness, PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "../client/js/audio/synth.js";
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

    it("blows a wind that loops without a seam", () => {
        const samples = wind();
        const step = (k) => Math.abs(samples[(k + 1) % samples.length] - samples[k]);
        const steps = Array.from({ length: samples.length }, (_, k) => step(k)).sort((a, b) => a - b);

        assert.equal(samples.length, 10 * SAMPLE_RATE);
        assert.ok(peakOf(samples) <= 0.8 + 1e-6);
        // Round the end to the start is no bigger a step than the wind takes anyway
        assert.ok(step(samples.length - 1) <= steps[Math.floor(steps.length * 0.99)], "seamless");
    });
});

// A stand-in for the browser's Web Audio: records what's played, how loud and where
function fakeAudio() {
    const played = [];
    const param = (value) => ({ value, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });
    const node = (extra = {}) => ({ connect: (next) => next, disconnect() {}, ...extra });

    class FakeContext {
        constructor() {
            this.state = "suspended";
            this.currentTime = 10;
            this.destination = node();
        }

        resume() {
            this.state = "running";

            return Promise.resolve();
        }

        suspend() {
            this.state = "suspended";

            return Promise.resolve();
        }

        createGain() {
            return node({ gain: param(1) });
        }

        createStereoPanner() {
            return node({ pan: param(0) });
        }

        createDynamicsCompressor() {
            return node({ threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
        }

        createBuffer(channels, length, rate) {
            const data = new Float32Array(length);

            return { length, sampleRate: rate, getChannelData: () => data };
        }

        createBufferSource() {
            const level = { gain: 1 };
            const source = node({
                playbackRate: param(1),
                addEventListener() {},
                start: (when = 0) => played.push({ buffer: source.buffer, when, level, pan: source.pan }),
                stop() {},
            });

            // (Follow the source through its gain and panner, to see how loud and where)
            source.connect = (gain) => {
                gain.connect = (next) => {
                    if (next.pan) {
                        source.pan = next.pan;
                    }

                    return next;
                };

                Object.defineProperty(level, "gain", { get: () => gain.gain.value });

                return gain;
            };

            return source;
        }
    }

    globalThis.AudioContext = FakeContext;

    return played;
}

describe("playing sounds (sound.js)", () => {
    it("makes every sound (here without a worker), and plays nothing before it's unlocked", async () => {
        const sound = new Sound();

        await sound.prepare();

        for (const [name, { variants }] of Object.entries(SOUNDS)) {
            assert.equal(sound.samples.get(name)?.filter(Boolean).length, variants, name);
        }

        assert.ok(sound.samples.has("wind"));
        assert.equal(sound.play("slash"), null, "no sound until the browser allows it");
    });

    it("plays from where things happen: quieter further away, and to the side they're on", async () => {
        const played = fakeAudio();
        const sound = new Sound();

        await sound.prepare();
        sound.unlock();
        await Promise.resolve();
        sound.setPaused(false);
        sound.setListener(50, 50);

        const level = (x, z) => {
            played.length = 0;
            sound.play("crush", { at: { x, z } });

            return played[0] ?? null;
        };
        const near = level(51, 50);
        const middle = level(65, 50);

        assert.ok(near && middle && near.level.gain > middle.level.gain * 2, "quieter further away");
        assert.equal(level(95, 50), null, "not heard at all far away");
        assert.ok(level(40, 50).pan.value < 0 && level(60, 50).pan.value > 0, "left and right");

        delete globalThis.AudioContext;
    });

    it("times a swing to be loudest as the blow lands, and falls silent paused or turned off", async () => {
        const played = fakeAudio();
        const sound = new Sound();

        await sound.prepare();
        sound.unlock();
        await Promise.resolve();
        sound.setPaused(false);

        sound.attack("hammer", { x: 0, z: 0 }, 0.64);
        assert.ok(Math.abs(played[0].when - (10 + 0.64 - PEAKS.swingHammer)) < 1e-9);
        assert.equal(sound.attack("bow", { x: 0, z: 0 }, 0.66), null, "bows twang when they let go, not when drawn");

        sound.setPaused(true);
        assert.equal(sound.play("lock"), null);
        sound.setPaused(false);
        sound.setEnabled(false);
        assert.equal(sound.play("lock"), null);
        sound.setEnabled(true);
        await Promise.resolve();
        assert.ok(sound.play("lock"));

        delete globalThis.AudioContext;
    });
});
