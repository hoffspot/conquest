// A measured run (docs/GAME.md *Measuring a device*; generated/multiplayer_scaling_plan.md, Stage
// 0): how a device keeps up over some minutes of play, counted frame by frame and told as one
// small report. Where the debug log (app/telemetry.js) keeps only the moments that went wrong,
// this keeps every frame of the run, in histograms:
//
//  - each frame's **interval** (ms since the frame before), its **work** (ms of the game's own
//    work in it), each of its **phases** (telemetry.js PHASES) and, on a frame that played steps
//    of the world, the ms **a step** took (`perStep`: the steps phase's time over the steps
//    played);
//  - each minute, every one of those series' middle (p50), 95th and 99th percentiles and worst;
//    how many frames came later than each of MEASURE.over ms after the one before; the steps
//    played and the ms a step took on average; the draw calls a frame made; and the most the game
//    held (MB, as the memory guard counts it, read no oftener than it reads: app/memoryguard.js);
//  - the same over the whole run, with each series' histogram;
//  - **heat**: how much longer the frames' work took late in the run than early in it (a phone
//    that's warmed up slows its processor down); and whether the **graphics card** was what held
//    the frames back (`gpuBound`), found by drawing fewer pixels for twenty seconds, twice, and
//    seeing whether the frames came quicker for it (MEASURE.heat, MEASURE.probe).
//
// A phone's browser tells nothing of long frames or of heat (Safari has neither Long Animation
// Frames nor Long Tasks), so both are read from the frames' own timings.
//
// Pure: nothing here reads a clock, the page or the game. Whoever measures writes a frame's times
// into `frame` and calls observe(); time goes by as the intervals add up. observe() makes
// nothing (no object, array or string: everything it counts into is made with the meter), so
// measuring gives the device no garbage to collect, which would show in what's measured.

import { MEMORY_GUARD } from "./memoryguard.js";
import { PHASES } from "./telemetry.js";

/**
 * - `version`: the report's format.
 * - `minutes`, `most`: how long a run is unless it's said (minutes), and at most.
 * - `low`, `per`, `buckets`: the histograms' buckets. The first holds times under `low` ms; each
 *   after it is 2^(1/per) times as wide as the one before (`per` to a doubling: 4.4% each), so a
 *   percentile read from one is within 2.2% of the time it stands for; the last holds everything
 *   past it (about 3.3 s).
 * - `over`: a frame this long after the last (ms) is counted, for each.
 * - `every`: how often what's held is read (seconds: the memory guard's).
 * - `bytes`: the most a report of `sized` minutes may be as JSON (the server takes 64 KB:
 *   server/storage/measures.js).
 * - `heat`: the device warming up, told by its work: the middle of the frames' work over the
 *   `warm` share of the run against that over the `cool` share (each [from, to] as shares of the
 *   run: of twelve minutes, the twelfth minute against the second), each of `frames` frames or
 *   more.
 * - `probe`: whether it's the graphics card or the processor that holds the frames back, told by
 *   drawing fewer pixels a while: `pixels` of them each way (0.7: half the pixels), for `length`
 *   of the run up to each of `ends` (shares of the run: of twelve minutes, the 20 seconds up to
 *   6:00 and to 11:00), set against the same length just before. The frames coming in `quicker`
 *   of the time or less (the mean of the quickest `kept` of them, so a hitch as the picture's
 *   resized doesn't count) say the graphics card was the limit. Only in a run of `least` minutes
 *   or more, and of windows of `frames` frames or more each.
 */
export const MEASURE = Object.freeze({
    version: 1,
    minutes: 12,
    most: 30,
    low: 0.05,
    per: 16,
    buckets: 257,
    over: Object.freeze([33, 50, 100, 200]),
    every: MEMORY_GUARD.every,
    bytes: 48 * 1024,
    sized: 15,
    heat: Object.freeze({ cool: Object.freeze([1 / 12, 2 / 12]), warm: Object.freeze([11 / 12, 1]), frames: 30 }),
    probe: Object.freeze({ pixels: 0.7, ends: Object.freeze([6 / 12, 11 / 12]), length: 1 / 36, quicker: 0.9, kept: 0.95, least: 3, frames: 30 }),
});

/** What's measured of a frame, in order: a histogram and a row's four numbers for each. */
export const SERIES = Object.freeze(["interval", "work", "perStep", ...PHASES]);

/**
 * Where a frame's times go in Meter.frame (ms): `interval` and `work`, then each phase's from
 * `phases` on, in PHASES' order. (`perStep` is the meter's own to work out.)
 */
export const FRAME = Object.freeze({ interval: 0, work: 1, perStep: 2, phases: 3 });

/** The percentiles a row keeps of each series, before its worst. */
export const PERCENTILES = Object.freeze([0.5, 0.95, 0.99]);

const BUCKETS = MEASURE.buckets;
const STEPS_PHASE = FRAME.phases + PHASES.indexOf("steps");
// (A row, as it's kept: each series' percentiles and worst, then these)
const STATS = PERCENTILES.length + 1;
const EXTRA = SERIES.length * STATS;
const FRAMES = EXTRA;
const OVER = EXTRA + 1;
const STEPS = OVER + MEASURE.over.length;
const STEP_MS = STEPS + 1;
const CALLS = STEPS + 2;
const CALLS_MOST = STEPS + 3;
const HELD = STEPS + 4;
const SECONDS = STEPS + 5;
const ROW = STEPS + 6;
// (The meter's clock, as it's kept)
const LENGTH = 0;
const ELAPSED = 1;
const CLOSING = 2;
// (The stretches of the run whose frames are counted apart, each with a histogram of the frames'
// intervals and one of their work: the cool one and the warm one, then for each probe the stretch
// before it and the stretch of it, the probes' own the odd ones)
const COOL = 0;
const WARM = 1;
const PROBES = 2;
const WINDOWS = PROBES + MEASURE.probe.ends.length * 2;

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

/** The bucket a time (ms) is counted in. */
export function bucketOf(ms) {
    if (!(ms >= MEASURE.low)) {
        return 0;
    }

    const bucket = 1 + Math.floor(Math.log2(ms / MEASURE.low) * MEASURE.per);

    return bucket < BUCKETS ? bucket : BUCKETS - 1;
}

/** The time (ms) a bucket stands for: its middle (the first's: half of MEASURE.low). */
export function bucketMs(bucket) {
    return bucket <= 0 ? MEASURE.low / 2 : MEASURE.low * 2 ** ((bucket - 0.5) / MEASURE.per);
}

// The time under which `share` of a histogram's `count` times fall (`counts`, its buckets from
// `from`): the bucket holding the one at that rank, never more than the `worst` there was
function percentile(counts, from, count, share, worst) {
    if (count <= 0) {
        return 0;
    }

    const rank = Math.max(1, Math.ceil(share * count));
    let seen = 0;

    for (let bucket = 0; bucket < BUCKETS; bucket++) {
        seen += counts[from + bucket];

        if (seen >= rank) {
            return Math.min(bucketMs(bucket), worst);
        }
    }

    return worst;
}

/**
 * A histogram as a report carries it ([its first bucket with anything in it, then each bucket's
 * count from there to the last with anything]) read back: the time under which `share` of its
 * times fall, or null if it's empty.
 */
export function percentileOf(histogram, share) {
    const [first = 0, ...counts] = histogram ?? [];
    const count = counts.reduce((sum, each) => sum + each, 0);
    const rank = Math.max(1, Math.ceil(share * count));
    let seen = 0;

    for (let k = 0; k < counts.length; k++) {
        seen += counts[k];

        if (count && seen >= rank) {
            return bucketMs(first + k);
        }
    }

    return null;
}

export class Meter {
    // (How long the run is, how much of it is measured, and when the minute under way ends, ms:
    // kept in an array, as every count here is, so that adding to one makes no new number)
    #clock = Float64Array.of(0, 0, 60000);
    #closed = 0;
    // (Each series' histogram, over the minute and over the run; its worst and its sum, the same)
    #minute = new Uint32Array(SERIES.length * BUCKETS);
    #total = new Uint32Array(SERIES.length * BUCKETS);
    #counted = new Uint32Array(SERIES.length * 2);
    #worst = new Float64Array(SERIES.length * 2);
    #sums = new Float64Array(SERIES.length);
    // (The minute's other counts, laid out as a row's from FRAMES on; and the run's)
    #now = new Float64Array(ROW);
    #all = new Float64Array(ROW);
    #rows;
    #held;
    #readings = 0;
    #scratch = new Float64Array(ROW);
    // (The stretches counted apart: when each begins and ends (ms into the run; never, a probe in
    // a run too short for one), its two histograms, and how many frames fell in it. And the
    // buckets the frame in hand's times fell in, for them)
    #spans = new Float64Array(WINDOWS * 2).fill(-1);
    #windows = new Uint32Array(WINDOWS * 2 * BUCKETS);
    #windowed = new Uint32Array(WINDOWS);
    #buckets = new Uint16Array(SERIES.length);

    /**
     * @param {object} [options]
     * @param {number} [options.minutes] - How long the run is (MEASURE.minutes; MEASURE.most at
     *   most; a part of a minute will do).
     */
    constructor({ minutes = MEASURE.minutes } = {}) {
        /** How long the run is (minutes). */
        this.minutes = Math.min(MEASURE.most, Math.max(0.05, Number(minutes) || MEASURE.minutes));
        this.#clock[LENGTH] = this.minutes * 60000;
        this.#rows = new Float64Array(Math.ceil(this.minutes) * ROW);
        this.#held = new Uint16Array(Math.ceil((this.minutes * 60) / MEASURE.every) + 8);

        /**
         * The frame being measured, for whoever measures to write before observe() (ms, at FRAME's
         * places): its interval, its work, and each phase's time.
         */
        this.frame = new Float64Array(SERIES.length);

        /** Where each of a frame's times goes in `frame` (FRAME), for whoever writes them. */
        this.at = FRAME;

        /** Has the run been measured through? Nothing more is counted once it has. */
        this.done = false;

        /**
         * Is the run in one of its probes just now (MEASURE.probe)? While it is, whoever measures
         * draws `pixels` of the pixels each way, and all of them again once it isn't.
         */
        this.probing = false;
        this.pixels = MEASURE.probe.pixels;

        const length = this.#clock[LENGTH];
        const span = (window, from, to) => this.#spans.set([from * length, to * length], window * 2);

        span(COOL, ...MEASURE.heat.cool);
        span(WARM, ...MEASURE.heat.warm);

        if (this.minutes >= MEASURE.probe.least) {
            MEASURE.probe.ends.forEach((end, k) => {
                span(PROBES + k * 2, end - MEASURE.probe.length * 2, end - MEASURE.probe.length);
                span(PROBES + k * 2 + 1, end - MEASURE.probe.length, end);
            });
        }
    }

    /** How much of the run has been measured (ms), and how much is left. */
    get elapsed() {
        return this.#clock[ELAPSED];
    }

    get left() {
        return Math.max(0, this.#clock[LENGTH] - this.#clock[ELAPSED]);
    }

    /** How many whole minutes have been measured. */
    get closed() {
        return this.#closed;
    }

    /**
     * A frame (its times in `frame`), which played `steps` of the world's steps and made `calls`
     * draw calls. Returns whether it was counted (not once the run's done).
     */
    observe(steps = 0, calls = 0) {
        if (this.done) {
            return false;
        }

        const frame = this.frame;
        const interval = frame[FRAME.interval];
        const now = this.#now;
        const clock = this.#clock;

        frame[FRAME.perStep] = steps > 0 ? frame[STEPS_PHASE] / steps : 0;

        for (let series = 0; series < SERIES.length; series++) {
            // (What a step took, only of a frame that played one)
            if (series === FRAME.perStep && steps <= 0) {
                continue;
            }

            // (Its bucket, as bucketOf has it: worked out here, the time never handed on)
            const ms = frame[series];
            const bucket = ms >= MEASURE.low ? 1 + Math.floor(Math.log2(ms / MEASURE.low) * MEASURE.per) : 0;
            const at = series * BUCKETS + (bucket < BUCKETS ? bucket : BUCKETS - 1);

            this.#buckets[series] = at - series * BUCKETS;
            this.#minute[at]++;
            this.#total[at]++;
            this.#counted[series * 2]++;
            this.#counted[series * 2 + 1]++;
            this.#sums[series] += ms;

            if (ms > this.#worst[series * 2]) {
                this.#worst[series * 2] = ms;
            }

            if (ms > this.#worst[series * 2 + 1]) {
                this.#worst[series * 2 + 1] = ms;
            }
        }

        now[FRAMES]++;

        for (let k = 0; k < MEASURE.over.length; k++) {
            if (interval > MEASURE.over[k]) {
                now[OVER + k]++;
            }
        }

        if (steps > 0) {
            now[STEPS] += steps;
            now[STEP_MS] += frame[STEPS_PHASE];
        }

        now[CALLS] += calls;

        if (calls > now[CALLS_MOST]) {
            now[CALLS_MOST] = calls;
        }

        if (interval > 0) {
            clock[ELAPSED] += interval;
        }

        // (The stretches counted apart that this frame ended in: its interval and its work counted
        // there too; and in a probe's own, the frames to come drawn at fewer pixels)
        const spans = this.#spans;
        const elapsed = clock[ELAPSED];
        let probing = false;

        for (let window = 0; window < WINDOWS; window++) {
            if (elapsed > spans[window * 2] && elapsed <= spans[window * 2 + 1]) {
                this.#windows[window * 2 * BUCKETS + this.#buckets[FRAME.interval]]++;
                this.#windows[(window * 2 + 1) * BUCKETS + this.#buckets[FRAME.work]]++;
                this.#windowed[window]++;
                probing ||= window >= PROBES && (window - PROBES) % 2 === 1;
            }
        }

        this.probing = probing;

        // (A minute measured through: its row kept, the next begun. A frame that took minutes,
        // the page put away meanwhile, leaves those minutes' rows empty)
        while (clock[ELAPSED] >= clock[CLOSING] && clock[CLOSING] <= clock[LENGTH]) {
            this.#close();
        }

        if (clock[ELAPSED] >= clock[LENGTH]) {
            this.done = true;
        }

        return true;
    }

    /** What the game holds (`mb`, as the memory guard counts it), read just now. */
    memory(mb) {
        if (this.done || !(mb >= 0)) {
            return;
        }

        if (this.#readings < this.#held.length) {
            this.#held[this.#readings++] = mb < 65535 ? mb : 65535;
        }

        if (mb > this.#now[HELD]) {
            this.#now[HELD] = mb;
        }
    }

    // The minute's row worked out into `into` from `from` on (its series' percentiles and worsts,
    // then its counts as they stand): `seconds` of it measured
    #row(into, from, seconds) {
        for (let series = 0; series < SERIES.length; series++) {
            const count = this.#counted[series * 2];
            const worst = this.#worst[series * 2];

            for (let k = 0; k < PERCENTILES.length; k++) {
                into[from + series * STATS + k] = percentile(this.#minute, series * BUCKETS, count, PERCENTILES[k], worst);
            }

            into[from + series * STATS + PERCENTILES.length] = worst;
        }

        for (let k = FRAMES; k < ROW; k++) {
            into[from + k] = this.#now[k];
        }

        into[from + SECONDS] = seconds;
    }

    // A minute measured through: its row kept, its counts added to the run's, and begun again
    #close() {
        this.#row(this.#rows, this.#closed * ROW, 60);
        this.#closed++;
        this.#clock[CLOSING] += 60000;
        this.#tally(this.#all);
        this.#now.fill(0);
        this.#minute.fill(0);

        for (let series = 0; series < SERIES.length; series++) {
            this.#counted[series * 2] = 0;
            this.#worst[series * 2] = 0;
        }
    }

    // The minute's counts added to `all` (the run's): sums added, the mosts the greater
    #tally(all) {
        const now = this.#now;

        for (let k = FRAMES; k < ROW; k++) {
            all[k] = k === CALLS_MOST || k === HELD ? Math.max(all[k], now[k]) : all[k] + now[k];
        }
    }

    /**
     * The run as measured so far, to be kept or sent (JSON: no more than MEASURE.bytes for
     * MEASURE.sized minutes), with whatever `about` says of it (its name, the device, the world):
     *
     *   { measure: MEASURE.version, ...about, minutes, seconds, done, frames,
     *     buckets: { low, per },                     how the histograms are read (bucketMs)
     *     over: { 33, 50, 100, 200 },                frames later than each (ms)
     *     stepsPlayed, stepMs,                       steps played, and the ms one took on average
     *     calls: { mean, most },                     draw calls a frame
     *     heldMB,                                    the most held
     *     heat,                                      the work late in the run over the work early in it
     *                                                (MEASURE.heat), or null if there wasn't enough of either
     *     gpuBound,                                  whether fewer pixels brought the frames quicker
     *                                                (MEASURE.probe: any probe's), or null with no probe
     *     windows: { cool, warm, probes: [{ pixels, before, during, gpuBound }] },
     *                                                each stretch they're told from: { from, to (s),
     *                                                frames, interval, work (ms) }
     *     total: { <series>: { count, mean, p50, p95, p99, worst } },
     *     rows: [{ minute, seconds, frames, over: [..], stepsPlayed, stepMs, calls, callsMost, heldMB,
     *              <series>: [p50, p95, p99, worst] }],   a minute each; the last, a part of one
     *     histograms: { <series>: [first bucket, counts...] },
     *     held: { every, mb: [...] } }               what was held, each reading
     */
    report(about = {}) {
        const rows = [];
        const partial = this.#clock[ELAPSED] - this.#closed * 60000;
        const all = this.#scratch;

        for (let k = 0; k < this.#closed; k++) {
            rows.push(this.#rowOf(this.#rows, k * ROW, k + 1));
        }

        all.set(this.#all);

        // (The minute under way, as far as it's got)
        if (this.#now[FRAMES] > 0) {
            const row = new Float64Array(ROW);

            this.#row(row, 0, round(Math.min(60000, Math.max(0, partial)) / 1000, 1));
            rows.push(this.#rowOf(row, 0, this.#closed + 1));
            this.#tally(all);
        }

        const total = {};
        const histograms = {};

        SERIES.forEach((name, series) => {
            const count = this.#counted[series * 2 + 1];
            const worst = this.#worst[series * 2 + 1];
            const counts = Array.from(this.#total.subarray(series * BUCKETS, (series + 1) * BUCKETS));
            const first = counts.findIndex((each) => each > 0);

            total[name] = { count, mean: count ? round(this.#sums[series] / count) : 0, worst: round(worst) };
            PERCENTILES.forEach((share, k) => (total[name][`p${Math.round(share * 100)}`] = round(percentile(this.#total, series * BUCKETS, count, PERCENTILES[k], worst))));
            histograms[name] = first < 0 ? [] : [first, ...counts.slice(first, counts.findLastIndex((each) => each > 0) + 1)];
        });

        // (Heat: the frames' work late in the run over their work early in it. And each probe:
        // whether the frames came quicker for fewer pixels, which only the graphics card's limit
        // would have them do)
        const cool = this.#windowOf(COOL);
        const warm = this.#windowOf(WARM);
        const enough = (window, frames) => window.frames >= frames;
        const probes = MEASURE.probe.ends
            .map((end, k) => ({ before: this.#windowOf(PROBES + k * 2), during: this.#windowOf(PROBES + k * 2 + 1) }))
            .filter(({ during }) => during.to > 0)
            .map(({ before, during }) => ({ pixels: MEASURE.probe.pixels, before, during, gpuBound: enough(before, MEASURE.probe.frames) && enough(during, MEASURE.probe.frames) ? during.interval <= before.interval * MEASURE.probe.quicker : null }));
        const bound = probes.map(({ gpuBound }) => gpuBound).filter((each) => each !== null);

        return {
            measure: MEASURE.version,
            ...about,
            minutes: this.minutes,
            seconds: round(this.#clock[ELAPSED] / 1000, 1),
            done: this.done,
            frames: all[FRAMES],
            buckets: { low: MEASURE.low, per: MEASURE.per },
            over: Object.fromEntries(MEASURE.over.map((ms, k) => [ms, all[OVER + k]])),
            stepsPlayed: all[STEPS],
            stepMs: all[STEPS] ? round(all[STEP_MS] / all[STEPS]) : 0,
            calls: { mean: all[FRAMES] ? Math.round(all[CALLS] / all[FRAMES]) : 0, most: all[CALLS_MOST] },
            heldMB: all[HELD],
            heat: enough(cool, MEASURE.heat.frames) && enough(warm, MEASURE.heat.frames) && cool.work > 0 ? round(warm.work / cool.work) : null,
            gpuBound: bound.length ? bound.includes(true) : null,
            windows: { cool, warm, probes },
            total,
            rows,
            histograms,
            held: { every: MEASURE.every, mb: Array.from(this.#held.subarray(0, this.#readings)) },
        };
    }

    // A stretch counted apart, as a report carries it: when it was (seconds into the run), how
    // many frames fell in it, how they came (ms: the mean of the quickest MEASURE.probe.kept of
    // their intervals) and the middle of their work (ms)
    #windowOf(window) {
        const frames = this.#windowed[window];
        const intervals = window * 2 * BUCKETS;
        const kept = Math.max(1, Math.ceil(frames * MEASURE.probe.kept));
        let sum = 0;
        let seen = 0;

        for (let bucket = 0; bucket < BUCKETS && seen < kept; bucket++) {
            const here = Math.min(this.#windows[intervals + bucket], kept - seen);

            sum += here * bucketMs(bucket);
            seen += here;
        }

        return {
            from: round(Math.max(0, this.#spans[window * 2]) / 1000, 1),
            to: round(Math.max(0, this.#spans[window * 2 + 1]) / 1000, 1),
            frames,
            interval: frames ? round(sum / kept) : 0,
            work: round(percentile(this.#windows, (window * 2 + 1) * BUCKETS, frames, 0.5, Infinity)),
        };
    }

    // A row as a report carries it, from where it's kept (`rows`, from `from`)
    #rowOf(rows, from, minute) {
        const frames = rows[from + FRAMES];
        const steps = rows[from + STEPS];
        const row = {
            minute,
            seconds: rows[from + SECONDS],
            frames,
            over: MEASURE.over.map((ms, k) => rows[from + OVER + k]),
            stepsPlayed: steps,
            stepMs: steps ? round(rows[from + STEP_MS] / steps) : 0,
            calls: frames ? Math.round(rows[from + CALLS] / frames) : 0,
            callsMost: rows[from + CALLS_MOST],
            heldMB: rows[from + HELD],
        };

        SERIES.forEach((name, series) => {
            row[name] = Array.from(rows.subarray(from + series * STATS, from + (series + 1) * STATS), (ms) => round(ms));
        });

        return row;
    }
}
