// Making the recorded sounds (scripts/build-sounds.js): the sums they're made with
// (scripts/sounds/dsp.js, as SciPy's, which they were first made and auditioned with), a recipe
// made into a sound (render.js), and the recipes themselves (weapons.js, spells.js, creatures.js,
// ambience.js, items.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { butter, limitDenominator, peak, RATE, resamplePoly, rms30, sosfiltfilt, withoutRumble } from "../scripts/sounds/dsp.js";
import { LEVEL, prepare, render } from "../scripts/sounds/render.js";
import * as ambience from "../scripts/sounds/ambience.js";
import * as creatures from "../scripts/sounds/creatures.js";
import * as items from "../scripts/sounds/items.js";
import * as spells from "../scripts/sounds/spells.js";
import * as weapons from "../scripts/sounds/weapons.js";
import { ON_DEMAND, RECORDED } from "../client/js/audio/recorded.js";
import { CATALOG } from "../client/js/audio/catalog.js";
import { ITEM_SOUNDS } from "../client/js/audio/sound.js";

const tone = (hz, seconds, rate = RATE, level = 0.5) => Float64Array.from({ length: Math.round(seconds * rate) }, (_, n) => level * Math.sin((2 * Math.PI * hz * n) / rate));

describe("the sums the recorded sounds are made with (scripts/sounds/dsp.js)", () => {
    it("finds the nearest fraction with a small denominator, as Python's Fraction.limit_denominator", () => {
        // (Each as Python gives it)
        assert.deepEqual(limitDenominator(1 / 0.9439, 1000), [713, 673]);
        assert.deepEqual(limitDenominator(1 / 0.7, 1000), [10, 7]);
        assert.deepEqual(limitDenominator(1 / 1.12, 1000), [25, 28]);
        assert.deepEqual(limitDenominator(48000 / 44100, 2000), [160, 147]);
        assert.deepEqual(limitDenominator(Math.PI, 100), [311, 99]);
    });

    it("resamples to the length SciPy's resample_poly gives, a tone's pitch and level kept", () => {
        const x = tone(441, 0.5, 44100);
        const y = resamplePoly(x, 160, 147);

        assert.equal(y.length, Math.ceil((x.length * 160) / 147));

        // (Away from the ends, the same tone at the new rate)
        const want = tone(441, 0.5, 48000);

        for (let n = 2000; n < y.length - 2000; n += 97) {
            assert.ok(Math.abs(y[n] - want[n]) < 2e-3, `${n}: ${y[n]} vs ${want[n]}`);
        }
    });

    it("filters both ways: nothing shifted, the rumble gone, what's above it kept", () => {
        const high = tone(1000, 0.4);
        const low = tone(15, 0.4);
        const kept = sosfiltfilt(butter(4, 40, "highpass"), high);
        const gone = withoutRumble(Float64Array.from(low, (v) => v + 0.3));

        // (In phase with the tone once the filter's settled, a tenth of a second from each end;
        // the low tone and the offset all but gone)
        for (let n = 4800; n < high.length - 4800; n += 101) {
            assert.ok(Math.abs(kept[n] - high[n]) < 1e-3, `${n}`);
        }

        assert.ok(peak(gone.slice(4000, -4000)) < -30, `${peak(gone)} dBFS left`);
    });
});

describe("a recipe made into a sound (scripts/sounds/render.js)", () => {
    const recording = { channels: [tone(300, 1), tone(300, 1, RATE, 0.1)], rate: RATE };

    it("cuts, layers and places its recordings, fades them, and makes it as loud as asked by its loudest 30 ms", () => {
        const samples = prepare(recording);
        const made = render({ layers: [{ from: "a", cut: [4800, 24000] }, { from: "a", cut: [4800, 9600], at: 0.5, gain: -6 }] }, () => samples);

        assert.equal(made.length, 0.5 * RATE + 4800);
        assert.ok(Math.abs(rms30(made) - LEVEL) < 0.01);
        assert.equal(made[0], 0, "faded in from silence");
        assert.ok(Math.abs(made.at(-1)) < 1e-6, "and out to it");

        // (Trimmed at the front, cut short, and quieter if asked)
        const short = render({ layers: [{ from: "a", cut: [4800, 24000] }], trim: 0.05, cap: 0.2, level: -26 }, () => samples);

        assert.equal(short.length, 0.2 * RATE);
        assert.ok(Math.abs(rms30(short) + 26) < 0.01);
    });

    it("keeps its peak under −1 dBFS, however loud it's asked to be", () => {
        const spiky = { channels: [Float64Array.from({ length: RATE }, (_, n) => (n === 24000 ? 0.9 : 0.0001 * Math.sin(n)))], rate: RATE };
        const made = render({ layers: [{ from: "a", cut: [0, RATE] }] }, () => prepare(spiky));

        assert.ok(peak(made) <= -1, `${peak(made)} dBFS`);
    });

    it("leaves a bed as its layers' gains make it, unlevelled and unfaded, and takes a hum away as well as the rumble if asked", () => {
        const samples = prepare(recording);
        const bed = render({ layers: [{ from: "a", cut: [0, 24000], gain: -10, fadeIn: 0, fadeOut: 0 }], level: null, fadeIn: 0, fadeOut: 0 }, () => samples);

        // (Exactly its layer, 10 dB down: not levelled, nor faded at either end)
        for (const n of [0, 12007, 23990]) {
            assert.ok(Math.abs(bed[n] - samples[n] * 10 ** (-10 / 20)) < 1e-9 && Math.abs(bed[n]) > 0.01, `${n}`);
        }

        // (A 120 Hz hum gone with the 40 Hz rumble; the 300 Hz tone kept)
        const hum = { channels: [Float64Array.from(tone(300, 1), (v, n) => v + 0.5 * Math.sin((2 * Math.PI * 120 * n) / RATE))], rate: RATE };
        const humless = prepare(hum, { highpass: [40, 160] });

        assert.ok(rms30(humless.slice(9600, -9600)) < rms30(prepare(hum).slice(9600, -9600)) - 1.5);
        assert.ok(rms30(humless.slice(9600, -9600)) > rms30(tone(300, 1)) - 1.5);
    });

    it("plays a layer backwards, slower, through a filter, swelling", () => {
        const samples = prepare(recording);
        const slow = render({ layers: [{ from: "a", cut: [0, 24000], rate: 0.5, reverse: true, lp: 2000, ramp: [-30, 0, 1] }] }, () => samples);

        assert.equal(slow.length, 48000);

        // (Swelling: quieter at its start than its end)
        assert.ok(rms30(slow.slice(2400, 9600)) < rms30(slow.slice(-9600, -2400)) - 10);
    });
    it("plays a layer as a tape is (slowed first, then filtered, the cut alone), and levels it to the recipe's own ceiling", () => {
        const samples = prepare(recording);
        const tape = render({ layers: [{ from: "a", cut: [0, 24000], rate: 0.5, after: true, order: 4, hp: 100, fadeIn: 0, fadeOut: 0 }], level: 0, ceiling: -6 }, () => samples);

        assert.equal(tape.length, 48000);
        assert.ok(Math.abs(peak(tape) + 6) < 0.01, `${peak(tape)} dBFS: asked to be louder, its peak just the ceiling`);
    });

    it("fades a note before it's tuned (as the cues' were), its fades as long as they were before it was slowed", () => {
        const samples = prepare(recording);
        const note = (fadedFirst) => render({ layers: [{ from: "a", cut: [0, 4800], rate: 0.5, fadeIn: 10, fadeOut: 10, fadedFirst }], level: null, fadeIn: 0, fadeOut: 0 }, () => samples);
        const [first, after] = [note(true), note(false)];
        const energy = (y) => y.slice(0, 480).reduce((sum, value) => sum + value * value, 0);

        assert.equal(first.length, 9600);
        assert.equal(after.length, 9600);
        assert.ok(energy(first) < 0.5 * energy(after), `its first 10 ms still fading in (the fade slowed with it): ${(energy(first) / energy(after)).toFixed(2)} of the energy`);
    });
});

describe("the recipes (scripts/sounds)", () => {
    it("gives every recipe's sound its recordings, each from a known source, and describes each", () => {
        for (const area of [weapons, spells, creatures, ambience, items]) {
            for (const [name, variants] of Object.entries(area.SOUNDS)) {
                assert.equal(RECORDED[name]?.length, variants.length, `${name}: npm run build:sounds`);
                assert.ok(CATALOG[name], `${name} described`);

                for (const { layers } of variants) {
                    assert.ok(layers.length && layers.every(({ from, cut }) => area.SOURCES[from] && cut[1] > cut[0]), name);
                }
            }

            // (Every source used, each with where to get it, CC0 or in the public domain)
            const used = new Set(Object.values(area.SOUNDS).flatMap((variants) => variants.flatMap(({ layers }) => layers.map(({ from }) => from))));

            assert.deepEqual([...used].sort(), Object.keys(area.SOURCES).sort());
            assert.ok(Object.values(area.SOURCES).every((source) => (source.url || source.itch) && ["CC0", "public domain"].includes(source.licence)));
        }

        // (The spells', the creatures', the ambience's and the items' downloaded only once they're
        // wanted, the interface's and the cues' at the start; a cast, and a creature's attack, timed
        // by when it's loudest)
        assert.deepEqual([...ON_DEMAND].sort(), [...Object.keys(spells.SOUNDS), ...Object.keys(creatures.SOUNDS), ...Object.keys(ambience.SOUNDS), ...items.ON_DEMAND].sort());
        assert.deepEqual([...items.ON_DEMAND].sort(), [...ITEM_SOUNDS].sort(), "the game wants each of the items' as it starts (sound.js ITEM_SOUNDS)");
        assert.ok(["wheel", "tap", "denied", "slain", "levelUp"].every((name) => RECORDED[name] && !ON_DEMAND.includes(name)), "the interface's and the cues' there from the first tap");
        assert.ok(Object.keys(creatures.SOUNDS).filter((name) => name.endsWith("Attack")).every((name) => RECORDED[name].every(({ peak }) => peak > 0)));
        assert.ok(Object.keys(spells.SOUNDS).filter((name) => name.startsWith("cast")).every((name) => RECORDED[name].every(({ peak }) => peak > 0)));
    });

    it("cuts each of the ambience's beds as long as its loop and the crossfade into the next, levelled as auditioned, at a lower bitrate", () => {
        const beds = Object.entries(ambience.SOUNDS).filter(([, [recipe]]) => recipe.loop);

        assert.ok(beds.length >= 20);

        for (const [name, [{ layers, loop, bitrate }]] of beds) {
            const [length, crossfade] = loop;

            assert.deepEqual(RECORDED[name][0].loop, loop, name);
            assert.ok(length > crossfade * 3 && crossfade >= 1, name);
            assert.ok(layers.every(({ cut }) => cut[1] - cut[0] === Math.round((length + crossfade) * RATE)), `${name}: its loop and crossfade long`);
            assert.ok(bitrate < 64, name);
        }

        // (Levelled as each was auditioned: each layer at its own gain, none brought to LEVEL)
        assert.equal(ambience.RECIPE.level, null);
    });
});
