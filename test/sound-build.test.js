// Making the recorded sounds (scripts/build-sounds.js): the sums they're made with
// (scripts/sounds/dsp.js, as SciPy's, which they were first made and auditioned with), a recipe
// made into a sound (render.js), and the recipes themselves (weapons.js, spells.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { butter, limitDenominator, peak, RATE, resamplePoly, rms30, sosfiltfilt, withoutRumble } from "../scripts/sounds/dsp.js";
import { LEVEL, prepare, render } from "../scripts/sounds/render.js";
import * as spells from "../scripts/sounds/spells.js";
import * as weapons from "../scripts/sounds/weapons.js";
import { ON_DEMAND, RECORDED } from "../client/js/audio/recorded.js";
import { CATALOG } from "../client/js/audio/catalog.js";

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

    it("plays a layer backwards, slower, through a filter, swelling", () => {
        const samples = prepare(recording);
        const slow = render({ layers: [{ from: "a", cut: [0, 24000], rate: 0.5, reverse: true, lp: 2000, ramp: [-30, 0, 1] }] }, () => samples);

        assert.equal(slow.length, 48000);

        // (Swelling: quieter at its start than its end)
        assert.ok(rms30(slow.slice(2400, 9600)) < rms30(slow.slice(-9600, -2400)) - 10);
    });
});

describe("the recipes (scripts/sounds)", () => {
    it("gives every recipe's sound its recordings, each from a known source, and describes each", () => {
        for (const area of [weapons, spells]) {
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

        // (The spells' downloaded only once they're wanted; a cast timed by when it's loudest)
        assert.deepEqual([...ON_DEMAND].sort(), Object.keys(spells.SOUNDS).sort());
        assert.ok(Object.keys(spells.SOUNDS).filter((name) => name.startsWith("cast")).every((name) => RECORDED[name].every(({ peak }) => peak > 0)));
    });
});
