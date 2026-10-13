// The debug log (client/js/app/telemetry.js): a freeze kept with where its frame's time went, what
// the browser says ran and the slow work then; slow going over a few seconds; errors with their
// stacks; a crash found on loading from the notes of a game that was never closed; memory past its
// marks, or the heap near its limit; each kind kept at most so often, the newest five, kept across
// loads; and work done a step at a time naming a slow step (core/steps.js). And the debug
// overlay's memory (app/debug.js memoryLines)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryLines } from "../client/js/app/debug.js";
import { PHASE, Telemetry, TELEMETRY } from "../client/js/app/telemetry.js";
import { Steps } from "../client/js/core/steps.js";

// A page's storage, in memory
function storage() {
    const kept = new Map();

    return {
        kept,
        getItem: (key) => (kept.has(key) ? kept.get(key) : null),
        setItem: (key, value) => kept.set(key, String(value)),
        removeItem: (key) => kept.delete(key),
    };
}

// A log on its own clocks: `time.now` the frame clock (ms), `time.clock` the time of day
function logOn(kept = storage(), time = { now: 1000, clock: Date.UTC(2026, 9, 11, 12) }) {
    const log = new Telemetry({ storage: kept, now: () => time.now, clock: () => time.clock, build: "test" });

    return { log, kept, time };
}

// A frame `interval` ms after the last, its phases taking `phases` ms each (PHASE's names), its
// own work beginning at `time.now`
function frame({ log, time }, interval, phases = {}, state = () => ({ map: "town" })) {
    time.now += interval;
    log.begin(time.now);

    for (const [name, ms] of Object.entries(phases)) {
        time.now += ms;
        log.mark(PHASE[name]);
    }

    log.end(interval, state);
}

describe("the debug log (telemetry.js)", () => {
    it("keeps a freeze while playing: a frame's own work held up, where its time went, the frames before, and how it was going", () => {
        const at = logOn();
        let asked = 0;

        at.log.playing = true;

        for (let k = 0; k < 30; k++) {
            frame(at, 16, { steps: 1, bodies: 3, draw: 4 });
        }

        assert.equal(at.log.events.length, 0, "nothing kept while it keeps up");
        frame(at, 450, { steps: 2, setup: 1, bodies: 6, world: 300, draw: 12 }, () => (asked++, { map: "town", bodies: { drawn: 40 } }));

        const [freeze] = at.log.events;

        assert.equal(asked, 1, "how it was going asked for once, when kept");
        assert.equal(freeze.kind, "freeze");
        assert.equal(freeze.where, "frame");
        assert.equal(freeze.ms, 321);
        assert.equal(freeze.summary, "A 0.32 s freeze in a frame's work");
        assert.deepEqual(freeze.phases, { steps: 2, setup: 1, bodies: 6, world: 300, draw: 12, frame: 321 });
        assert.equal(freeze.recent.length, 31);
        assert.equal(freeze.recent.at(-1), 450);
        assert.deepEqual(freeze.state, { map: "town", bodies: { drawn: 40 } });
        assert.equal(freeze.build, "test");
        assert.match(freeze.at, /^2026-10-11T12:00/);

        // (The time gone between two quick frames: the page busy elsewhere, the frame before's
        // phases for what was going on)
        const gap = logOn();

        gap.log.playing = true;
        frame(gap, 16, { steps: 1, bodies: 3, draw: 4 });
        frame(gap, 500, { draw: 5 });
        assert.equal(gap.log.events[0].where, "between");
        assert.equal(gap.log.events[0].ms, 492);
        assert.deepEqual(gap.log.events[0].phases, { steps: 1, bodies: 3, draw: 4, frame: 8, between: 492 });
        assert.equal(gap.log.events[0].summary, "A 0.49 s freeze between frames");

        // (Not playing, or put away: no freeze, however long)
        at.log.playing = false;
        at.time.now += TELEMETRY.again;
        frame(at, 5000);
        assert.equal(at.log.events.length, 1);
    });

    it("says what a frozen frame gave the graphics card: the shaders it made, by material, and the textures and geometries it sent", () => {
        const at = logOn();
        const info = { programs: [{ id: 0, type: "ShaderMaterial", name: "sky" }, { id: 1, type: "MeshStandardMaterial", name: "" }], memory: { textures: 40, geometries: 300 } };

        at.log.playing = true;
        at.log.graphics = info;
        frame(at, 16, { draw: 4 });
        frame(at, 16, { draw: 4 });

        // (Two more shaders for a lit window's material and another of the sky's, as three.js
        // numbers them; a texture and geometries sent, as the frame's drawn)
        at.time.now += 16;
        at.log.begin(at.time.now);
        info.programs.push({ id: 2, type: "MeshLambertMaterial", name: "lit windows" }, { id: 3, type: "MeshLambertMaterial", name: "lit windows" }, { id: 4, type: "ShaderMaterial", name: "sky" });
        info.memory.textures += 3;
        info.memory.geometries += 12;
        at.time.now += 400;
        at.log.mark(PHASE.draw);
        at.log.end(416, () => ({}));

        assert.deepEqual(at.log.events[0].made, { shaders: { "MeshLambertMaterial lit windows": 2, "ShaderMaterial sky": 1 }, textures: 3, geometries: 12 });

        // (Nothing made: nothing said; between frames, since the frame before began)
        const still = logOn();

        still.log.playing = true;
        still.log.graphics = { programs: [{ id: 7, type: "ShaderMaterial", name: "sky" }], memory: { textures: 1, geometries: 2 } };
        frame(still, 16, { draw: 4 });
        frame(still, 300, { draw: 300 });
        assert.equal(still.log.events[0].made, undefined);

        const gap = logOn();
        const later = { programs: [], memory: { textures: 0, geometries: 0 } };

        gap.log.playing = true;
        gap.log.graphics = later;
        frame(gap, 16, { draw: 4 });
        later.programs.push({ id: 9, type: "MeshBasicMaterial", name: "" });
        later.memory.textures = 2;
        frame(gap, 500, { draw: 5 });
        assert.equal(gap.log.events[0].where, "between");
        assert.deepEqual(gap.log.events[0].made, { shaders: { MeshBasicMaterial: 1 }, textures: 2 });

        // (What they were for, as the game says (madeFor, asked with the new ones only); its
        // failing never losing the freeze)
        const named = logOn();
        const asked = [];

        named.log.playing = true;
        named.log.graphics = { programs: [], memory: { textures: 0, geometries: 0 } };
        named.log.madeFor = (programs) => (asked.push(programs.map(({ id }) => id)), ["MeshStandardMaterial: body < home:guild-1/receptionist"]);
        frame(named, 16, { draw: 4 });
        named.time.now += 16;
        named.log.begin(named.time.now);
        named.log.graphics.programs.push({ id: 5, type: "MeshStandardMaterial", name: "" });
        named.time.now += 300;
        named.log.mark(PHASE.draw);
        named.log.end(316, () => ({}));
        assert.deepEqual(named.log.events[0].made, { shaders: { MeshStandardMaterial: 1 }, for: ["MeshStandardMaterial: body < home:guild-1/receptionist"] });
        assert.deepEqual(asked, [[5]]);

        const broken = logOn();

        broken.log.playing = true;
        broken.log.graphics = { programs: [], memory: { textures: 0, geometries: 0 } };
        broken.log.madeFor = () => {
            throw new Error("no scene");
        };
        frame(broken, 16, { draw: 4 });
        broken.time.now += 16;
        broken.log.begin(broken.time.now);
        broken.log.graphics.programs.push({ id: 6, type: "MeshBasicMaterial", name: "" });
        broken.time.now += 300;
        broken.log.mark(PHASE.draw);
        broken.log.end(316, () => ({}));
        assert.deepEqual(broken.log.events[0].made, { shaders: { MeshBasicMaterial: 1 } });
    });

    it("keeps each kind at most so often, the newest five, across loads; and forgets them all when cleared", () => {
        const at = logOn();

        at.log.playing = true;
        frame(at, 300);
        frame(at, 300);
        assert.equal(at.log.events.length, 1, "a second freeze straight after: not kept");

        for (let k = 0; k < 7; k++) {
            at.time.now += TELEMETRY.again;
            at.time.clock += 60000;
            frame(at, 250 + k);
        }

        assert.equal(at.log.events.length, TELEMETRY.kept);
        assert.equal(at.log.events[0].ms, 256, "the newest first");

        const again = logOn(at.kept);

        assert.deepEqual(again.log.events, at.log.events, "kept across loads");
        again.log.clear();
        assert.equal(again.log.events.length, 0);
        assert.equal(logOn(at.kept).log.events.length, 0);
    });

    it("keeps slow going: the middle of a few seconds' frames under 30 a second, with each phase's time on average", () => {
        const at = logOn();

        at.log.playing = true;

        for (let k = 0; k < 200; k++) {
            frame(at, 20, { bodies: 8, draw: 6 });
        }

        assert.equal(at.log.events.length, 0, "50 a second: not slow");

        for (let k = 0; k < 90; k++) {
            frame(at, 50, { steps: 2, bodies: 25, draw: 15 });
        }

        const slow = at.log.events.find(({ kind }) => kind === "slow");

        assert.ok(slow, "kept");
        assert.equal(slow.fps, 20);
        assert.equal(slow.phases.bodies, 25);
        assert.equal(slow.phases.draw, 15);
        assert.equal(at.log.events.filter(({ kind }) => kind === "slow").length, 1, "once, however long it lasts");
    });

    it("names the slowest work done a step at a time in a freeze, and a step that takes long is told by name (core/steps.js)", () => {
        const at = logOn();
        const told = [];

        at.log.playing = true;
        frame(at, 16);
        at.log.job("crowd figure wild:bandit:1:sword", 85);
        at.log.job("building tavern-1", 40);
        frame(at, 500, { inside: 130 });
        assert.deepEqual(
            at.log.events[0].jobs.map(({ label, ms }) => [label, ms]),
            [
                ["crowd figure wild:bandit:1:sword", 85],
                ["building tavern-1", 40],
            ],
        );

        const was = Steps.slow;

        Steps.slow = (label, ms) => told.push({ label, ms });

        try {
            const steps = new Steps(
                (function* () {
                    yield;

                    const until = performance.now() + Steps.SLOW + 10;

                    while (performance.now() < until) {
                        // (a step that takes long)
                    }

                    yield;
                })(),
                "dressing beast wolf",
            );

            assert.ok(steps.take());
        } finally {
            Steps.slow = was;
        }

        assert.equal(told.length, 1);
        assert.equal(told[0].label, "dressing beast wolf");
        assert.ok(told[0].ms > Steps.SLOW);
    });

    it("keeps what the browser says ran in a freeze (long animation frames' scripts), the longest first", () => {
        const at = logOn();
        let listener = null;

        class Observer {
            static supportedEntryTypes = ["long-animation-frame"];

            constructor(callback) {
                listener = callback;
            }

            observe() {}
        }

        at.log.playing = true;
        frame(at, 16);
        at.log.observe(Observer);
        listener({
            getEntries: () => [
                {
                    startTime: 1100,
                    duration: 380,
                    blockingDuration: 330,
                    renderStart: 1460,
                    scripts: [
                        { duration: 60, sourceURL: "https://example.org/js/world/chunks3d.js", sourceCharPosition: 1234, sourceFunctionName: "update", invoker: "FrameRequestCallback", invokerType: "user-callback", forcedStyleAndLayoutDuration: 0 },
                        { duration: 290, sourceURL: "https://example.org/js/app/game.js", sourceCharPosition: 99, sourceFunctionName: "#frame", invoker: "FrameRequestCallback", invokerType: "user-callback", forcedStyleAndLayoutDuration: 2 },
                    ],
                },
                { startTime: 50, duration: 120, scripts: [] },
            ],
        });
        at.time.now = 1100;
        frame(at, 400, { draw: 20 });

        assert.deepEqual(
            at.log.events[0].scripts.map(({ ms, source, function: name }) => [ms, source, name]),
            [
                [290, "app/game.js:99", "#frame"],
                [60, "world/chunks3d.js:1234", "update"],
            ],
        );
        assert.equal(logOn().log.observe(class {}), null, "nothing to listen to: nothing listened for");
    });

    it("keeps an error with its stack, the same one once so often; and the picture lost", () => {
        const at = logOn();

        at.log.error(new TypeError("avatar.actions.dodge is not a function"), "frame", () => ({ map: "town" }));
        at.log.error(new TypeError("avatar.actions.dodge is not a function"), "frame");
        at.log.error("a promise refused", "promise");
        at.log.lost();

        const [lost, refused, error] = at.log.events;

        assert.equal(at.log.events.length, 3);
        assert.equal(error.kind, "error");
        assert.equal(error.summary, "Error (frame): avatar.actions.dodge is not a function");
        assert.equal(error.error.name, "TypeError");
        assert.match(error.error.stack, /telemetry\.test\.js/);
        assert.deepEqual(error.state, { map: "town" });
        assert.equal(refused.error.message, "a promise refused");
        assert.equal(lost.kind, "lost");
    });

    it("finds a crash on loading: the last game's notes, written while playing and never closed; none if it was closed or put away", () => {
        const at = logOn();

        at.log.playing = true;
        frame(at, 16);
        at.log.alive(() => ({ map: "town", bodies: { drawn: 61 } }));
        at.log.error(new RangeError("Invalid array length"), "frame");
        at.time.now += TELEMETRY.notes;
        at.log.job("crowd figure herd:wolf:1", 70);
        at.log.alive(() => ({ map: "town", bodies: { drawn: 63 } }));

        // (The page fell over, and loaded again a minute later)
        const later = { now: 200, clock: at.time.clock + 60000 };
        const next = logOn(at.kept, later);
        const crash = next.log.recover("reload");

        assert.equal(crash.kind, "crash");
        assert.equal(crash.summary, "The game stopped while playing and loaded again (reload)");
        assert.equal(crash.later, 60);
        assert.deepEqual(crash.state, { map: "town", bodies: { drawn: 63 } });
        assert.equal(crash.jobs[0].label, "crowd figure herd:wolf:1");
        assert.equal(crash.errors[0].message, "Invalid array length");
        assert.equal(next.log.events[0], crash);
        assert.equal(next.log.recover(), null, "found once");

        // (Closed, or put away, before loading again: no crash)
        const closed = logOn();

        closed.log.alive(() => ({}));
        closed.log.closed();
        assert.equal(logOn(closed.kept).log.recover("reload"), null);

        // (Notes written no oftener than so often)
        const often = logOn();
        let asked = 0;

        often.log.alive(() => (asked++, {}));
        often.log.alive(() => (asked++, {}));
        assert.equal(asked, 1);
    });

    it("a crash keeps the minute before it: what was held at each of the notes, when the last were written, and the work begun lately, that begun after the last notes marked (likely under way as it fell)", () => {
        const at = logOn();
        const held = (totalMB, avatars) => () => ({ map: "town", actors: 32, memory: { totalMB, heapMB: null, limitMB: null, gpu: { totalMB: totalMB - 100 }, soundMB: 100, bodiesMB: avatars * 5, held: { avatars } } });

        at.log.playing = true;
        at.log.job("dressing player player", 357);

        // (Notes every so often for over a minute, what's held rising as more bodies are dressed)
        for (let k = 0; k < TELEMETRY.trend + 5; k++) {
            at.time.now += TELEMETRY.notes;
            at.log.began(`dressing folk folk-${k}`);
            at.log.alive(held(300 + k * 5, k));
        }

        at.time.now += TELEMETRY.lately;
        at.log.job("dressing beast boggart", 491);
        at.log.alive(held(520, 40));

        // (Then a boggart begun, after the last notes, and the page falls over doing it)
        at.time.now += 800;
        at.log.began("dressing beast boggart");

        const crash = logOn(at.kept, { now: 300, clock: at.time.clock + 1500 }).log.recover("back_forward");

        assert.equal(crash.trend.length, TELEMETRY.trend, "a minute of the notes' readings");
        assert.deepEqual(crash.trend.at(-1), { at: Math.round((at.time.now - 800) / 100) / 10, totalMB: 520, gpuMB: 420, soundMB: 100, bodiesMB: 200, heapMB: null, avatars: 40, actors: 32 });
        assert.ok(crash.trend[0].totalMB < crash.trend.at(-2).totalMB, "rising");
        assert.equal(crash.pageAt, at.time.now - 800);
        assert.deepEqual(
            crash.jobs.map(({ label }) => label),
            ["dressing beast boggart"],
            "only the slow work of the last half minute: not the player's, dressed at the start",
        );
        assert.equal(crash.begun.length, TELEMETRY.begun);
        assert.deepEqual(crash.begun.at(-1), { label: "dressing beast boggart", at: at.time.now, afterNotes: true });
        assert.ok(crash.begun.slice(0, -1).every((each) => !each.afterNotes));
        assert.equal(at.kept.getItem(TELEMETRY.working), null, "what was begun forgotten once it's kept");

        // (Work begun while not playing, as the game loads, isn't written down)
        const loading = logOn();

        loading.log.began("dressing player player");
        assert.equal(loading.kept.getItem(TELEMETRY.working), null);
    });

    it("tells of work as it takes its first step, by name, once; not work without a name (core/steps.js)", () => {
        const told = [];
        const was = Steps.begun;
        const work = () =>
            (function* () {
                yield;
                yield;
            })();

        Steps.begun = (label) => told.push(label);

        try {
            const named = new Steps(work(), "building home:tavern");

            named.take(0);
            assert.deepEqual(told, ["building home:tavern"], "told before a step's taken, though there's no time for one");
            named.take();
            new Steps(work()).take();
        } finally {
            Steps.begun = was;
        }

        assert.deepEqual(told, ["building home:tavern"]);
    });

    it("keeps memory as it passes each mark, once each, and the page's heap near its limit; a crash keeps what was held", () => {
        const at = logOn();
        const held = (totalMB, heapMB = null, limitMB = null) => () => ({ map: "town", memory: { totalMB, heapMB, limitMB, gpu: { totalMB: totalMB / 2 }, soundMB: 20, held: { avatars: 40 } } });
        const noted = (state) => {
            at.time.now += Math.max(TELEMETRY.notes, TELEMETRY.again);
            at.log.alive(state);
        };

        at.log.playing = true;
        noted(held(500));
        assert.equal(at.log.events.length, 0, "under the first mark");
        noted(held(800));
        assert.equal(at.log.events[0].kind, "memory");
        assert.equal(at.log.events[0].summary, "Memory past 768 MB: 800 MB held");
        assert.equal(at.log.events[0].state.memory.held.avatars, 40);
        noted(held(900));
        noted(held(760));
        assert.equal(at.log.events.length, 1, "the same mark: once");
        noted(held(1600));
        assert.equal(at.log.events[0].summary, "Memory past 1.5 GB: 1600 MB held");
        noted(held(1700, 3300, 4096));
        assert.equal(at.log.events[0].summary, "The page's memory near its limit: 3300 of 4096 MB");
        noted(held(1800, 3400, 4096));
        assert.equal(at.log.events.length, 3);

        // (The page fell over: what it held at the last notes is what the crash keeps)
        const crash = logOn(at.kept, { now: 0, clock: at.time.clock + 5000 }).log.recover("reload");

        assert.equal(crash.state.memory.totalMB, 1800);
    });

    it("shows what's held in the debug overlay: all of it, the graphics card's, the sounds', the heap where it's told, and how much of the world's kept", () => {
        const gpu = { totalMB: 540.2, buffersMB: 226.3, texturesMB: 301.9, targetsMB: 12, count: {} };

        assert.deepEqual(memoryLines({ totalMB: 1245.6, heapMB: 684.5, limitMB: 4096, gpu, soundMB: 20.9, held: { avatars: 64, chunks: 9, interiors: 2, crowds: 6 } }), [
            "Memory 1245.6 MB held: graphics 540.2 MB (buffers 226.3, pictures 301.9, targets 12), sound 20.9 MB, JS heap 684.5 of 4096 MB",
            "Held 64 bodies  9 chunks  2 interiors  6 crowd kinds",
        ]);
        assert.match(memoryLines({ totalMB: 560, heapMB: null, limitMB: null, gpu, soundMB: 20, held: { avatars: 3, chunks: 9, interiors: 0, crowds: 0 } })[0], /JS heap not told by this browser$/);
        assert.match(
            memoryLines({ totalMB: 731, heapMB: null, limitMB: null, gpu, soundMB: 101.3, wasmMB: 16, bodiesMB: 154.5, held: { avatars: 30, chunks: 9, interiors: 0, crowds: 0 } })[0],
            /sound 101\.3 MB, way-finding 16 MB, bodies' own copies 154\.5 MB, JS heap not told by this browser$/,
        );
        assert.equal(
            memoryLines({ totalMB: 731, heapMB: null, limitMB: null, gpu, soundMB: 20, held: { avatars: 30, chunks: 9, interiors: 0, crowds: 2, beasts: { looks: 12, unheld: 3, MB: 9.4 } } })[1],
            "Held 30 bodies  9 chunks  0 interiors  2 crowd kinds  12 beast looks (9.4 MB, 3 none drawn)",
        );
        assert.match(memoryLines(null, gpu)[0], /^Memory graphics 540\.2 MB/);
    });

    it("gives the log as text to copy: what each event says, the newest first", () => {
        const at = logOn();

        at.log.error(new Error("boom"));

        const text = JSON.parse(at.log.text());

        assert.equal(text.build, "test");
        assert.equal(text.events[0].summary, "Error: boom");
    });
});
