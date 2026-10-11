// The debug log (Game options: Debug log): what made the game slow, freeze or fall over, kept to be
// looked into later, the last TELEMETRY.kept such moments, each with what was going on then:
//
//  - **A freeze**: TELEMETRY.freeze ms or more without a frame, while playing and in view. Either
//    a frame's own work took that long (where its time went: its phases, the battle's steps, the
//    parts of the update, drawing), or the time went between frames, the page busy with something
//    else (the frame before's phases, for what was going on). With what the browser says ran then
//    (Chromium's long animation frames: each script's source, function and place in it, and what
//    called it), and the slowest of the work done a step at a time then (core/steps.js, by name).
//  - **Slow going**: the middle of TELEMETRY.slow.window ms of frames under TELEMETRY.slow.fps a
//    second. With each phase's time on average over it, and what's being drawn.
//  - **An error**: one no one caught (its stack), a frame's work failing (app/game.js #fault), or
//    the picture lost (a phone short of memory takes it back).
//  - **A crash**: the page loaded again after one that was playing, in view, and was never closed
//    or put away. While playing, a few notes of how it's going are written every
//    TELEMETRY.notes ms (TELEMETRY.alive) and marked closed when the page is closed or hidden; found
//    unclosed on loading, they're what's kept of the crash (with what the game held then: a phone
//    short of memory closes the page and loads it again).
//  - **Memory**: what the game holds (the page's heap where the browser tells, what the graphics
//    card's been given, the sounds) past each of TELEMETRY.memory.marks, or the page's heap near
//    its limit (TELEMETRY.memory.heap of it). With what holds it, and what's going on.
//
// Each kind of event is kept at most once every TELEMETRY.again ms, so one bad patch doesn't fill
// the log. It costs a frame a few clock readings and a little arithmetic; the rest is only done
// when something's kept. Kept in the browser's storage (localStorage), never sent anywhere.

/**
 * - `kept`: how many events are kept (the newest).
 * - `freeze`: a frame this long after the last (ms) is a freeze.
 * - `slow`: frames slower than `fps` a second over `window` ms (their middle) is slow going,
 *   looked at every `every` frames.
 * - `again`: how long before another event of the same kind is kept (ms).
 * - `notes`: how often the notes of how it's going are written while playing (ms).
 * - `recent`: how many of the latest frames' times an event keeps.
 * - `scripts`, `jobs`: how many of the scripts the browser names, and of the slowest jobs done a
 *   step at a time, an event keeps; `job`: a step of one that takes longer than this (ms) is noted.
 * - `memory`: what the game holds (MB) kept as it passes each of `marks`, once each; and the page's
 *   heap past `heap` of its limit, once.
 */
export const TELEMETRY = Object.freeze({
    kept: 5,
    freeze: 200,
    slow: Object.freeze({ fps: 30, window: 3000, every: 30 }),
    again: 20000,
    notes: 2000,
    recent: 60,
    scripts: 8,
    jobs: 5,
    job: 20,
    memory: Object.freeze({ marks: Object.freeze([768, 1024, 1536, 2048, 3072]), heap: 0.8 }),
    key: "pellagos.debuglog",
    alive: "pellagos.alive",
});

/**
 * A frame's phases, in order (Telemetry.mark: each the time the frame's work reached its end):
 * the battle's steps, the update's parts (setting up, everyone moved and posed, the effects and the
 * HUD, the world round the player, the buildings' insides and their folk, the bars over heads),
 * and drawing.
 */
export const PHASES = Object.freeze(["steps", "setup", "bodies", "effects", "world", "inside", "bars", "draw"]);

/** Each phase's index (Telemetry.mark's argument). */
export const PHASE = Object.freeze(Object.fromEntries(PHASES.map((name, index) => [name, index])));

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

// What an error says, and where it was (its stack), however it was thrown
const described = (error) => (error instanceof Error ? { message: String(error.message), name: error.name, stack: String(error.stack ?? "") } : { message: String(error?.message ?? error), stack: String(error?.stack ?? "") });

export class Telemetry {
    #storage;
    #clock;
    #now;
    #marks = new Float64Array(PHASES.length);
    #started = 0;
    #intervals = new Float32Array(240);
    #phases = new Float32Array(240 * PHASES.length);
    #filled = 0;
    #at = 0;
    #frames = 0;
    #last = new Map();
    #jobs = [];
    #frameJobs = [];
    #scripts = [];
    #notedAt = -Infinity;
    #errors = [];
    #lastOwn = 0;
    #memoryMark = 0;
    #nearLimit = false;

    /**
     * @param {object} [options]
     * @param {Storage} [options.storage] - Where the log and the notes are kept (localStorage).
     * @param {Function} [options.now] - The time (ms, a frame's: performance.now).
     * @param {Function} [options.clock] - The time of day (ms since 1970: Date.now).
     * @param {string} [options.build] - Which build of the game this is.
     */
    constructor({ storage = null, now = () => performance.now(), clock = () => Date.now(), build = "" } = {}) {
        this.#storage = storage ?? null;
        this.#now = now;
        this.#clock = clock;
        this.build = build;

        /** The events kept, the newest first. */
        this.events = this.#read(TELEMETRY.key) ?? [];

        /** Called with the log whenever an event's kept (the Debug log page, open). */
        this.onChange = null;

        /** Is the game being played, in view (a freeze or slow going counts only then)? */
        this.playing = false;
    }

    // --- Frames ---

    /** A frame's work begun (performance.now()'s). */
    begin(now = this.#now()) {
        this.#started = now;
        this.#marks.fill(now);
        this.#frameJobs.length = 0;
    }

    /** A frame's work reached the end of a phase (PHASE's index). */
    mark(phase) {
        this.#marks[phase] = this.#now();
    }

    /**
     * A frame ended, `interval` ms after the last began (as the game counted it); `state`, called
     * only if an event's kept, says what was going on (the game's: Game.telemetryState).
     */
    end(interval, state = () => ({})) {
        const end = this.#now();
        const own = end - this.#started;
        const before = this.#lastOwn;
        const slot = this.#at;
        let reached = this.#started;

        // (Each phase's time: from the end of the one before, those not reached taking none)
        for (let k = 0; k < PHASES.length; k++) {
            const mark = Math.max(reached, this.#marks[k]);

            this.#phases[slot * PHASES.length + k] = mark - reached;
            reached = mark;
        }

        this.#intervals[slot] = interval;
        this.#at = (slot + 1) % this.#intervals.length;
        this.#filled = Math.min(this.#filled + 1, this.#intervals.length);
        this.#frames++;
        this.#lastOwn = own;

        if (!this.playing) {
            return;
        }

        if (own >= TELEMETRY.freeze) {
            // (This frame's own work held it up)
            this.#freeze({ ms: own, where: "frame", slot, own, from: this.#started, end, state });
        } else if (interval >= TELEMETRY.freeze && before < TELEMETRY.freeze && this.#filled > 1) {
            // (The time went between the frame before and this one)
            this.#freeze({ ms: interval - before, where: "between", slot: (slot + this.#intervals.length - 1) % this.#intervals.length, own: before, from: end - own - interval, end, state });
        } else if (this.#frames % TELEMETRY.slow.every === 0) {
            this.#slow(state);
        }
    }

    // A freeze (`ms` long): in a frame's own work (`where`: "frame"), its phases; or between frames
    // ("between"), the time not in either and the phases of the frame before it; with what the
    // browser says ran from `from` to `end`, and the jobs then
    #freeze({ ms, where, slot, own, from, end, state }) {
        const phases = {};

        PHASES.forEach((name, k) => {
            const time = this.#phases[slot * PHASES.length + k];

            if (time >= 0.5) {
                phases[name] = round(time);
            }
        });

        phases.frame = round(own);

        if (where === "between") {
            phases.between = round(ms);
        }

        this.keep("freeze", {
            summary: `A ${round(ms / 1000, 2)} s freeze ${where === "frame" ? "in a frame's work" : "between frames"}`,
            ms: round(ms),
            where,
            phases,
            jobs: [...this.#frameJobs, ...this.#jobs].sort((a, b) => b.ms - a.ms).slice(0, TELEMETRY.jobs),
            scripts: this.#scriptsBetween(from, end),
            recent: this.#recent(),
            state: state(),
        });
    }

    // Slow going: the window's frames' middle, and each phase's time on average over it
    #slow(state) {
        let spanned = 0;
        const intervals = [];

        for (let k = 1; k <= this.#filled && spanned < TELEMETRY.slow.window; k++) {
            const slot = (this.#at - k + this.#intervals.length) % this.#intervals.length;

            intervals.push(this.#intervals[slot]);
            spanned += this.#intervals[slot];
        }

        if (spanned < TELEMETRY.slow.window * 0.9 || intervals.length < 2) {
            return;
        }

        const middle = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

        if (middle <= 1000 / TELEMETRY.slow.fps) {
            return;
        }

        const phases = {};

        PHASES.forEach((name, k) => {
            let sum = 0;

            for (let n = 1; n <= intervals.length; n++) {
                const slot = (this.#at - n + this.#intervals.length) % this.#intervals.length;

                sum += this.#phases[slot * PHASES.length + k];
            }

            phases[name] = round(sum / intervals.length);
        });

        this.keep("slow", {
            summary: `Slow: ${round(1000 / middle)} frames a second over ${round(spanned / 1000)} s`,
            fps: round(1000 / middle),
            phases,
            jobs: this.#jobs.slice(0, TELEMETRY.jobs),
            recent: this.#recent(),
            state: state(),
        });
    }

    // The latest frames' times (ms, whole), the newest last
    #recent() {
        const recent = [];

        for (let k = Math.min(this.#filled, TELEMETRY.recent); k >= 1; k--) {
            recent.push(Math.round(this.#intervals[(this.#at - k + this.#intervals.length) % this.#intervals.length]));
        }

        return recent;
    }

    /**
     * One step of some work done a step at a time took `ms` (core/steps.js Steps.slow): the
     * slowest kept, by name, for the next event.
     */
    job(label, ms) {
        const entry = { label: String(label ?? "unnamed work"), ms: round(ms), at: round(this.#now()) };

        this.#frameJobs.push(entry);
        this.#jobs.push(entry);
        this.#jobs.sort((a, b) => b.ms - a.ms);
        this.#jobs.length = Math.min(this.#jobs.length, TELEMETRY.jobs * 2);
    }

    // --- What the browser says ran (Chromium's long animation frames) ---

    /**
     * Listen for what the browser says took long (long animation frames, where there are: their
     * scripts; else long tasks), to name what ran in a freeze.
     */
    observe(Observer = globalThis.PerformanceObserver) {
        const types = Observer?.supportedEntryTypes ?? [];
        const type = types.includes("long-animation-frame") ? "long-animation-frame" : types.includes("longtask") ? "longtask" : null;

        if (!type) {
            return null;
        }

        const observer = new Observer((list) => {
            for (const entry of list.getEntries()) {
                this.#scripts.push({
                    start: entry.startTime,
                    end: entry.startTime + entry.duration,
                    scripts: (entry.scripts ?? []).map((script) => ({
                        ms: round(script.duration),
                        source: script.sourceURL ? `${script.sourceURL.split("/").slice(-2).join("/")}:${script.sourceCharPosition ?? "?"}` : "",
                        function: script.sourceFunctionName || "",
                        invoker: script.invoker || "",
                        type: script.invokerType || "",
                        layout: round(script.forcedStyleAndLayoutDuration ?? 0),
                    })),
                    blocking: round(entry.blockingDuration ?? entry.duration),
                    render: entry.renderStart ? round(entry.startTime + entry.duration - entry.renderStart) : undefined,
                });
            }

            this.#scripts.splice(0, Math.max(0, this.#scripts.length - 20));
        });

        observer.observe({ type, buffered: false });

        return observer;
    }

    // What the browser said ran between two times: its scripts, the longest first
    #scriptsBetween(from, to) {
        return this.#scripts
            .filter(({ start, end }) => end >= from && start <= to)
            .flatMap(({ scripts, blocking, render }) => (scripts.length ? scripts : [{ ms: blocking, source: "", function: "(not named)", render }]))
            .sort((a, b) => b.ms - a.ms)
            .slice(0, TELEMETRY.scripts);
    }

    // --- Errors ---

    /** An error (`where`: what it was doing), kept with its stack. */
    error(error, where = "uncaught", state = () => ({})) {
        const what = described(error);

        this.#errors.push({ ...what, where, at: this.#clock() });
        this.#errors.splice(0, Math.max(0, this.#errors.length - 3));
        this.keep(`error:${what.message}`, { kind: "error", summary: `${where === "uncaught" ? "Error" : `Error (${where})`}: ${what.message}`, where, error: what, recent: this.#recent(), state: state() });
    }

    /** The picture lost (WebGL's context: a phone short of memory takes it back). */
    lost(state = () => ({})) {
        this.keep("lost", { summary: "The picture was lost (the graphics context)", recent: this.#recent(), state: state() });
    }

    // --- Crashes ---

    /**
     * While playing, in view: how it's going (`state`, called at most every TELEMETRY.notes ms),
     * written down, so a crash that loads the page again finds it.
     */
    alive(state) {
        const now = this.#now();

        if (now - this.#notedAt < TELEMETRY.notes) {
            return;
        }

        this.#notedAt = now;

        const noted = state();

        this.#write(TELEMETRY.alive, { at: this.#clock(), build: this.build, closed: false, state: noted, recent: this.#recent(), jobs: this.#jobs.slice(0, TELEMETRY.jobs), errors: this.#errors });
        this.#memory(noted);
    }

    // What the game holds (the state's memory: app/game.js memoryNow) past its next mark, or the
    // page's heap near its limit: kept, with what holds it and what's going on
    #memory(state) {
        const memory = state?.memory;

        if (!memory) {
            return;
        }

        const { totalMB, heapMB, limitMB } = memory;
        const near = heapMB !== null && limitMB > 0 && heapMB >= limitMB * TELEMETRY.memory.heap;
        const mark = TELEMETRY.memory.marks.filter((each) => totalMB >= each).at(-1) ?? 0;

        if (mark <= this.#memoryMark && (!near || this.#nearLimit)) {
            return;
        }

        const past = mark >= 1024 ? `${round(mark / 1024)} GB` : `${mark} MB`;
        const kept = this.keep("memory", {
            summary: near && !this.#nearLimit ? `The page's memory near its limit: ${heapMB} of ${limitMB} MB` : `Memory past ${past}: ${totalMB} MB held`,
            recent: this.#recent(),
            jobs: this.#jobs.slice(0, TELEMETRY.jobs),
            state,
        });

        if (kept) {
            this.#memoryMark = Math.max(this.#memoryMark, mark);
            this.#nearLimit ||= near;
        }
    }

    /** Closed, hidden or no longer playing: whatever comes next isn't a crash. */
    closed() {
        const notes = this.#read(TELEMETRY.alive);

        this.#notedAt = -Infinity;

        if (notes && !notes.closed) {
            this.#write(TELEMETRY.alive, { ...notes, closed: true });
        }
    }

    /**
     * Loading: the last game's notes, if it was playing, in view, and never closed: a crash, kept
     * (`navigation`: how this page was come to, as the browser has it: "reload"...). Returns it.
     */
    recover(navigation = "") {
        const notes = this.#read(TELEMETRY.alive);

        this.#storage?.removeItem?.(TELEMETRY.alive);

        if (!notes || notes.closed) {
            return null;
        }

        const ago = Math.max(0, this.#clock() - notes.at);

        return this.keep("crash", {
            summary: `The game stopped while playing and loaded again${navigation ? ` (${navigation})` : ""}`,
            at: notes.at,
            later: round(ago / 1000),
            build: notes.build,
            jobs: notes.jobs ?? [],
            errors: notes.errors ?? [],
            recent: notes.recent ?? [],
            state: notes.state ?? {},
        });
    }

    // --- The log ---

    /**
     * Keep an event (`kind`, and what it says), unless one of its kind was kept less than
     * TELEMETRY.again ms ago; the newest TELEMETRY.kept kept. Returns it, if kept.
     */
    keep(kind, detail) {
        const now = this.#now();
        const last = this.#last.get(kind);

        if (last !== undefined && now - last < TELEMETRY.again) {
            return null;
        }

        this.#last.set(kind, now);

        const { kind: named = kind, summary, at = this.#clock(), build = this.build, ...rest } = detail;

        this.events = [{ kind: named, summary, at: new Date(at).toISOString(), build, ...rest }, ...this.events].slice(0, TELEMETRY.kept);
        this.#write(TELEMETRY.key, this.events);
        this.onChange?.(this.events);

        return this.events[0];
    }

    /** Forget every event kept (and when each kind was last: the next is kept at once). */
    clear() {
        this.events = [];
        this.#last.clear();
        this.#storage?.removeItem?.(TELEMETRY.key);
        this.onChange?.(this.events);
    }

    /** The log as text to copy (JSON, the newest first). */
    text() {
        return JSON.stringify({ build: this.build, events: this.events }, null, 2);
    }

    #read(key) {
        try {
            return JSON.parse(this.#storage?.getItem(key) ?? "null");
        } catch {
            return null;
        }
    }

    #write(key, value) {
        try {
            this.#storage?.setItem(key, JSON.stringify(value));
        } catch {
            // (Storage full or refused: kept for this page only)
        }
    }
}

/** The game's debug log (one for the page: what's kept is the page's storage's). */
export const telemetry = new Telemetry({
    storage: (() => {
        // (Where there's none, or it's refused, as a private window's can be: kept for the page alone)
        try {
            return globalThis.localStorage ?? null;
        } catch {
            return null;
        }
    })(),
});
