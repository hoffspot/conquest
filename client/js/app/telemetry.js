// The debug log (Game options: Debug log): what made the game slow, freeze or fall over, kept to be
// looked into later, the last TELEMETRY.kept such moments, each with what was going on then:
//
//  - **A freeze**: TELEMETRY.freeze ms or more without a frame, while playing and in view. Either
//    a frame's own work took that long (where its time went: its phases, the battle's steps, the
//    parts of the update, drawing), or the time went between frames, the page busy with something
//    else (the frame before's phases, for what was going on). With what the browser says ran then
//    (Chromium's long animation frames: each script's source, function and place in it, and what
//    called it), the slowest of the work done a step at a time then (core/steps.js, by name), and
//    what the graphics card was given then (shaders made, by material, and what each was for:
//    the material and what it's on, by name; textures and geometries).
//  - **Slow going**: the middle of TELEMETRY.slow.window ms of frames under TELEMETRY.slow.fps a
//    second. With each phase's time on average over it, and what's being drawn.
//  - **An error**: one no one caught (its stack), a frame's work failing (app/game.js #fault), or
//    the picture lost (a phone short of memory takes it back).
//  - **A crash**: the page loaded again after one that was playing, in view, and was never closed
//    or put away. While playing, a few notes of how it's going are written every
//    TELEMETRY.notes ms (TELEMETRY.alive) and marked closed when the page is closed or hidden; found
//    unclosed on loading, they're what's kept of the crash (with what the game held then: a phone
//    short of memory closes the page and loads it again). With them, how what's held went over
//    the last minute (rising, or jumping at the end), and the work begun lately, each written down
//    as it begins (TELEMETRY.working): work begun after the last notes was likely under way as the
//    page fell, as a step of it that takes half a second can be, the page never coming back from
//    it to say so.
//  - **Memory**: what the game holds (the page's heap where the browser tells, what the graphics
//    card's been given, the sounds, the way-finding's WebAssembly, the bodies' own copies) past
//    each of TELEMETRY.memory.marks, or the page's heap near its limit (TELEMETRY.memory.heap of
//    it). With what holds it, and what's going on.
//  - **A press lost**: a quick action's press whose lift was never heard (app/press.js: a phone's
//    Safari can lose it), dropped as the next began or once no finger was on the screen. With the
//    slot, what was in it, how long it was held, how it was found, whether the bar was up, and
//    what's going on (app/game.js #pressLost).
//
// Each event names the code it came from (its commit's first 10 digits, written into app/version.js
// as the site's put together: "dev" for a copy run from the repository) and the assets' release
// (app/assets.js); so does the log as copied, and a crash the code of the page that fell over.
//
// Each kind of event is kept at most once every TELEMETRY.again ms, so one bad patch doesn't fill
// the log; one that wouldn't be is never worked out (#due), so a patch where every frame's a
// freeze costs those frames nothing more. It costs a frame a few clock readings and a little
// arithmetic; the rest is only done when something's kept, and the notes (every TELEMETRY.notes
// ms) after a frame, not in it (aliveSoon). Kept in the browser's storage (localStorage), never
// sent anywhere.

/**
 * - `kept`: how many events are kept (the newest).
 * - `freeze`: a frame this long after the last (ms) is a freeze.
 * - `slow`: frames slower than `fps` a second over `window` ms (their middle) is slow going,
 *   looked at every `every` frames.
 * - `again`: how long before another event of the same kind is kept (ms).
 * - `notes`: how often the notes of how it's going are written while playing (ms).
 * - `recent`: how many of the latest frames' times an event keeps.
 * - `scripts`, `jobs`: how many of the scripts the browser names, and of the slowest jobs done a
 *   step at a time, an event keeps; `job`: a step of one that takes longer than this (ms) is noted;
 *   `lately`: only those noted this long before the event (ms).
 * - `memory`: what the game holds (MB) kept as it passes each of `marks`, once each; and the page's
 *   heap past `heap` of its limit, once.
 * - `trend`: how many of the notes' readings of what's held the notes keep (a minute's).
 * - `begun`: how many of the jobs begun lately are written down (`working`), as each begins.
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
    lately: 30000,
    memory: Object.freeze({ marks: Object.freeze([768, 1024, 1536, 2048, 3072]), heap: 0.8 }),
    trend: 30,
    begun: 6,
    key: "pellagos.debuglog",
    alive: "pellagos.alive",
    working: "pellagos.working",
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
    #trend = [];
    #begun = [];
    // (The notes asked for after this frame, not yet written; and how many times they've been
    // closed, for those asked for before to know they mustn't be: aliveSoon)
    #noting = false;
    #closings = 0;
    // What the graphics card had been given as this frame and the one before began (#look)
    #given = { textures: 0, geometries: 0, shaders: -1, newest: -1 };
    #givenBefore = { textures: 0, geometries: 0, shaders: -1, newest: -1 };

    /**
     * @param {object} [options]
     * @param {Storage} [options.storage] - Where the log and the notes are kept (localStorage).
     * @param {Function} [options.now] - The time (ms, a frame's: performance.now).
     * @param {Function} [options.clock] - The time of day (ms since 1970: Date.now).
     * @param {string} [options.build] - Which release of the game's assets this is (app/assets.js).
     * @param {string} [options.code] - Which code this is: its commit's first 10 digits, or "dev"
     *   (app/version.js codeVersion).
     * @param {?string} [options.built] - When the code was put together (an ISO date), if known.
     */
    constructor({ storage = null, now = () => performance.now(), clock = () => Date.now(), build = "", code = "", built = null } = {}) {
        this.#storage = storage ?? null;
        this.#now = now;
        this.#clock = clock;
        this.build = build;
        this.code = code;
        this.built = built;

        /** The events kept, the newest first. */
        this.events = this.#read(TELEMETRY.key) ?? [];

        /** Called with the log whenever an event's kept (the Debug log page, open). */
        this.onChange = null;

        /** Is the game being played, in view (a freeze or slow going counts only then)? */
        this.playing = false;

        /**
         * What the graphics card's been given (three.js's WebGLRenderer.info: its programs, each
         * numbered as made, and how many textures and geometries): set by the game, for a freeze
         * to say what its frame made. Read as each frame begins.
         */
        this.graphics = null;

        /**
         * What the shaders a freeze's frame made were for (set by the game: (programs) => [what
         * each was for: "MeshStandardMaterial body < home:guild-1/receptionist"...]), asked only
         * when one's kept: a shader's own name is only its material's, often none.
         */
        this.madeFor = null;
    }

    // --- Frames ---

    /** A frame's work begun (performance.now()'s). */
    begin(now = this.#now()) {
        this.#started = now;
        this.#marks.fill(now);
        this.#frameJobs.length = 0;
        this.#look();
    }

    // What the graphics card's been given as a frame begins (the frame before's kept): how many
    // textures and geometries, and the newest shader's number (looked for again only when there
    // are more or fewer of them)
    #look() {
        const info = this.graphics;

        if (!info) {
            return;
        }

        const programs = info.programs ?? [];
        const before = this.#given;
        const given = this.#givenBefore;
        let newest = before.newest;

        if (programs.length !== before.shaders) {
            newest = -1;

            for (const program of programs) {
                newest = Math.max(newest, program.id);
            }
        }

        given.textures = info.memory.textures;
        given.geometries = info.memory.geometries;
        given.shaders = programs.length;
        given.newest = newest;
        this.#givenBefore = before;
        this.#given = given;
    }

    // What the graphics card's been given since `given` (#look's, as a frame began): the shaders
    // made (how many of each, by material: its type and name), and how many more textures and
    // geometries it holds (fewer, if more were let go): as `made`, if anything
    #made(given) {
        const info = this.graphics;

        if (!info || given.shaders < 0) {
            return {};
        }

        const made = {};
        const shaders = {};
        const fresh = (info.programs ?? []).filter((program) => program.id > given.newest);

        for (const program of fresh) {
            const name = [program.type, program.name].filter(Boolean).join(" ") || "unnamed";

            shaders[name] = (shaders[name] ?? 0) + 1;
        }

        if (Object.keys(shaders).length) {
            made.shaders = shaders;

            // (And what they were for, if the game can say: the first few)
            try {
                const used = this.madeFor?.(fresh) ?? [];

                if (used.length) {
                    made.for = used.slice(0, TELEMETRY.scripts);
                }
            } catch {
                // (Never the log's own fault that a freeze isn't kept)
            }
        }

        for (const kind of ["textures", "geometries"]) {
            if (info.memory[kind] !== given[kind]) {
                made[kind] = info.memory[kind] - given[kind];
            }
        }

        return Object.keys(made).length ? { made } : {};
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
    // browser says ran from `from` to `end`, the jobs then, and what the graphics card was given
    // since the frame (or the frame before) began
    #freeze({ ms, where, slot, own, from, end, state }) {
        if (!this.#due("freeze")) {
            return;
        }

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
            jobs: this.#lately(this.#frameJobs),
            scripts: this.#scriptsBetween(from, end),
            ...this.#made(where === "frame" ? this.#given : this.#givenBefore),
            recent: this.#recent(),
            state: state(),
        });
    }

    // Slow going: the window's frames' middle, and each phase's time on average over it
    #slow(state) {
        if (!this.#due("slow")) {
            return;
        }

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
            jobs: this.#lately(),
            recent: this.#recent(),
            state: state(),
        });
    }

    // The slowest steps of work noted lately (TELEMETRY.lately), and `also` (this frame's), each once
    #lately(also = []) {
        const since = this.#now() - TELEMETRY.lately;

        return [...new Set([...also, ...this.#jobs.filter(({ at }) => at >= since)])].sort((a, b) => b.ms - a.ms).slice(0, TELEMETRY.jobs);
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
     * One step of some work done a step at a time took `ms` (core/steps.js Steps.slow): kept, by
     * name and when (`at`, ms since the page loaded), for the next event, the slowest of those
     * lately.
     */
    job(label, ms) {
        const entry = { label: String(label ?? "unnamed work"), ms: round(ms), at: round(this.#now()) };

        this.#frameJobs.push(entry);
        this.#jobs.push(entry);
        this.#jobs.splice(0, Math.max(0, this.#jobs.length - 40));
    }

    /**
     * Some work done a step at a time begun (core/steps.js Steps.begun: what it's making, by name):
     * while playing, written down at once with the others begun lately, so that if the page falls
     * over doing it, the crash says what it was doing.
     */
    began(label) {
        this.#begun.push({ label: String(label ?? "unnamed work"), at: round(this.#now()) });
        this.#begun.splice(0, Math.max(0, this.#begun.length - TELEMETRY.begun));

        if (this.playing) {
            this.#write(TELEMETRY.working, this.#begun);
        }
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

        if (!this.#due(`error:${what.message}`)) {
            return;
        }

        this.keep(`error:${what.message}`, { kind: "error", summary: `${where === "uncaught" ? "Error" : `Error (${where})`}: ${what.message}`, where, error: what, recent: this.#recent(), state: state() });
    }

    /** The picture lost (WebGL's context: a phone short of memory takes it back). */
    lost(state = () => ({})) {
        if (!this.#due("lost")) {
            return;
        }

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
        const memory = noted?.memory;

        // (What's held, read at each of the notes: the last minute of it)
        if (memory) {
            this.#trend.push({ at: round(now / 1000), totalMB: memory.totalMB, gpuMB: memory.gpu?.totalMB ?? null, soundMB: memory.soundMB, bodiesMB: memory.bodiesMB ?? null, heapMB: memory.heapMB, avatars: memory.held?.avatars ?? null, actors: noted.actors ?? null });
            this.#trend.splice(0, Math.max(0, this.#trend.length - TELEMETRY.trend));
        }

        this.#write(TELEMETRY.alive, { at: this.#clock(), pageAt: round(now), build: this.build, code: this.code, built: this.built, closed: false, state: noted, trend: this.#trend, recent: this.#recent(), jobs: this.#lately(), errors: this.#errors });
        this.#memory(noted);
    }

    /**
     * The notes (alive), if they're due, written just after this frame (`later`: a task of its
     * own, setTimeout's) rather than in it: a frame's shown only once its work's done, and the
     * notes take a millisecond or two on a phone. Not if the game's closed or hidden meanwhile
     * (closed: whatever comes next isn't a crash).
     */
    aliveSoon(state, later = (write) => setTimeout(write, 0)) {
        if (this.#noting || this.#now() - this.#notedAt < TELEMETRY.notes) {
            return;
        }

        const closings = this.#closings;

        this.#noting = true;
        later(() => {
            this.#noting = false;

            if (closings === this.#closings) {
                this.alive(state);
            }
        });
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
            jobs: this.#lately(),
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
        this.#closings++;

        if (notes && !notes.closed) {
            this.#write(TELEMETRY.alive, { ...notes, closed: true });
        }
    }

    /**
     * Loading: the last game's notes, if it was playing, in view, and never closed: a crash, kept
     * (`navigation`: how this page was come to, as the browser has it: "reload"...), with what was
     * held over the minute before (`trend`), and the work begun lately (`begun`, each `afterNotes`
     * if it was begun after the last notes: likely under way as the page fell). Returns it.
     */
    recover(navigation = "") {
        const notes = this.#read(TELEMETRY.alive);
        const begun = this.#read(TELEMETRY.working) ?? [];

        this.#storage?.removeItem?.(TELEMETRY.alive);
        this.#storage?.removeItem?.(TELEMETRY.working);

        if (!notes || notes.closed) {
            return null;
        }

        const ago = Math.max(0, this.#clock() - notes.at);
        const pageAt = notes.pageAt ?? null;

        return this.keep("crash", {
            summary: `The game stopped while playing and loaded again${navigation ? ` (${navigation})` : ""}`,
            at: notes.at,
            later: round(ago / 1000),
            build: notes.build,
            code: notes.code ?? null,
            built: notes.built ?? null,
            pageAt,
            jobs: notes.jobs ?? [],
            begun: begun.map((each) => (pageAt !== null && each.at > pageAt ? { ...each, afterNotes: true } : each)),
            errors: notes.errors ?? [],
            recent: notes.recent ?? [],
            trend: notes.trend ?? [],
            state: notes.state ?? {},
        });
    }

    // --- The log ---

    // Whether an event of `kind` would be kept now (none of its kind kept in the last
    // TELEMETRY.again ms): asked before what it'd say is worked out (how the game's going among
    // it), so that in a bad patch, every frame a freeze, those that can't be kept cost nothing
    #due(kind) {
        const last = this.#last.get(kind);

        return last === undefined || this.#now() - last >= TELEMETRY.again;
    }

    /**
     * Keep an event (`kind`, and what it says), unless one of its kind was kept less than
     * TELEMETRY.again ms ago; the newest TELEMETRY.kept kept. Returns it, if kept.
     */
    keep(kind, detail) {
        if (!this.#due(kind)) {
            return null;
        }

        this.#last.set(kind, this.#now());

        const { kind: named = kind, summary, at = this.#clock(), build = this.build, code = this.code, built = this.built, ...rest } = detail;

        this.events = [{ kind: named, summary, at: new Date(at).toISOString(), build, code, built, ...rest }, ...this.events].slice(0, TELEMETRY.kept);
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
        return JSON.stringify({ build: this.build, code: this.code, built: this.built, events: this.events }, null, 2);
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
