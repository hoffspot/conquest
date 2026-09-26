// The game's sound, played with the Web Audio API in three buses, each with its own volume (the
// sliders in Game options), all turned on or off together (the Sound switch):
//
//  - Sound effects: blows, spells, footsteps and cues (synth.js), each from where it happens:
//    quieter the further it is from the player, and to the left or right.
//  - The environment: the wind blowing, birds singing and leaves rustling in nearby trees.
//  - Music: the town's score (score.js), or, in the tavern, its jig (tavern.js), played on
//    recordings of real instruments (instruments.js) as it goes, note by note, a little ahead of
//    time, so it loops without a seam; with a hall's reverb. Going into the tavern, the town's
//    music fades into the tavern's, which starts from its beginning; coming out, the town's
//    comes back where it left off. Upstairs, the tavern's music is quieter and muffled, heard
//    through the floor.
//
// synth.js's sounds are made in a worker (worker.js), so nothing waits for them; the music's
// recordings (client/music, about a megabyte) are downloaded meanwhile. Browsers only let a page
// make sound once someone has tapped, clicked or pressed a key on it, so it starts on the first
// one (unlock()). The music plays from then on, on every screen, the pause menu included;
// everything is silent while the page is hidden.
//
// The browser's sound can stop on its own: suspended or interrupted (a call, an alarm, another
// app's sound, the screen locking), stuck (Safari on iPhones can say it's playing with its clock
// standing still), or closed. However it stops, it's started again: straight away where the
// browser allows it, on the next tap where it doesn't (restarting an interrupted or stuck one
// takes suspending it first), and if that doesn't help, it's made anew, the music carrying on
// where it was.

import { baseFor, INSTRUMENTS, sampleFiles } from "./instruments.js";
import { SCORE } from "./score.js";
import { PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "./synth.js";
import { TAVERN } from "./tavern.js";

/** The music: the town's, and the tavern's. */
export const SCORES = Object.freeze({ town: SCORE, tavern: TAVERN });

/**
 * Where the player can be (the game's maps), and the music heard there: which score, how loud
 * (a share of the music bus), and how muffled (heard through a floor: a low-pass filter's
 * frequency, Hz, or null).
 */
export const PLACES = Object.freeze({
    town: { score: "town", level: 1, muffle: null },
    taproom: { score: "tavern", level: 1, muffle: null },
    upstairs: { score: "tavern", level: 0.4, muffle: 650 },
});

/** The buses, and how loud each is to start with (0 to 1, as the sliders show them). */
export const BUSES = Object.freeze(["effects", "environment", "music"]);
export const VOLUME_DEFAULTS = Object.freeze({ effects: 0.5, environment: 0.4, music: 0.35 });

/**
 * How loud a slider's setting (0 to 1) sounds: a curve, as ears hear loudness (halfway is a
 * quarter as loud as the top, 12 dB down).
 */
export const gainOf = (volume) => Math.max(0, Math.min(1, volume)) ** 2;

// Heard at full volume this close (metres), and not at all this far away
const NEAR = 4;
const FAR = 34;

// Panned all the way to one side this far to the side (metres), and at most this far
const SIDE = 14;
const MOST_PAN = 0.85;

// At most this many sound effects at once
const VOICES = 24;

// If the browser's clock stands still this long (seconds) while it says it's playing, it's
// started again; if it's stuck again that soon after, it's made anew
const STALL = 1.5;

// The music's recordings: how many there are, and how many are downloaded at once
const RECORDINGS = sampleFiles().length;
const DOWNLOADS = 6;

// How loud the wind is; how long between birds singing, and leaves rustling (seconds, from and
// to), and how near a tree has to be to be heard (metres)
const WIND = 0.2;
const BIRDS = [4, 14];
const LEAVES = [2.5, 7];
const TREES_HEARD = 22;

// How quickly it fades in and out (seconds)
const FADE = 0.08;

// How loud it all is at the speakers: the mix is turned down this much (about 10 dB, so the
// sliders' defaults are comfortable on a phone at middling volume, with room to turn them up),
// gently compressed, then limited just under full scale, so a busy fight turned up can't clip
const OUTPUT = 0.32;
const LIMIT = -1.5;

// The music: scheduled this far ahead (seconds), checked this often (ms); how loud it is
// against the rest (about 5 dB up, at the same slider setting), how much of it goes through the
// reverb, and how long the reverb rings (seconds)
const LOOKAHEAD = 1.2;
const MUSIC_LEVEL = 1.8;
const SCHEDULE_MS = 200;
const REVERB_SEND = 0.28;
const REVERB_TIME = 2.6;

// Going from one score to the other, the one fades out and the other in over this long
// (seconds); going upstairs or down, the music gets quieter and muffled, or louder and clear,
// over this long; and the low-pass filter's frequency when it isn't muffled (Hz)
const CROSSFADE = 1.5;
const THROUGH_FLOOR = 0.8;
const CLEAR = 20000;

// The swing for each attack animation (actions.js), and the sound of each projectile's launch
const SWINGS = { sword: "swingSword", staff: "swingStaff", hammer: "swingHammer", punch: "swingPunch", cleaver: "swingCleaver" };
const LAUNCHES = { arrow: "arrow", bolt: "bolt", fireball: "fireball" };

// The footsteps on each kind of ground (setpieces/pieces.js GROUND: grass, road, cobbles, soil,
// courtyard, planks)
const STEPS = ["stepGrass", "stepDirt", "stepStone", "stepDirt", "stepStone", "stepWood"];

// How long between the hearth's crackles (seconds, from and to)
const CRACKLES = [0.2, 0.9];

export class Sound {
    /**
     * @param {object} [options]
     * @param {boolean} [options.enabled] - Whether it's on.
     * @param {object} [options.volumes] - { effects, environment, music }, 0 to 1.
     * @param {Function} [options.fetch] - How to download the music's recordings.
     */
    constructor({ enabled = true, volumes = VOLUME_DEFAULTS, fetch = globalThis.fetch?.bind(globalThis) } = {}) {
        this.enabled = enabled;
        this.volumes = { ...VOLUME_DEFAULTS, ...volumes };
        this.paused = true;
        this.hidden = false;
        this.context = null;
        this.master = null;
        this.buses = {};

        /** Sounds' samples as they're made (name → [variant]), and the music's recordings as they're downloaded ("instrument key" → MP3). */
        this.samples = new Map();
        this.recordings = new Map();
        this.unplayable = 0;
        this.fetch = fetch;

        /** The browser's copies: sounds' (name → [variant]) and instruments' ("instrument key"). */
        this.buffers = new Map();
        this.instruments = new Map();

        /** Where the player is (metres): sounds are heard from there. */
        this.listener = { x: 0, z: 0 };

        /** When each sound effect playing ends (the browser's time), to keep to VOICES. */
        this.sounding = [];

        /** The time now (ms), and the browser's clock when it last moved: { time, at } (for noticing it stuck). */
        this.now = () => performance.now();
        this.clock = null;
        this.stalled = false;
        this.restarted = -Infinity;
        this.ambient = false;
        this.wind = null;
        this.trees = [];
        this.nextBird = BIRDS[0];
        this.nextLeaves = LEAVES[0];
        this.hearth = null;
        this.nextCrackle = 0;
        this.music = null;
        this.ready = null;

        /** Where the player is (a PLACES key), and each score's playing: { score, start, index, loop, channels, output, filter }. */
        this.place = "town";
        this.tracks = {};
        this.timer = null;
    }

    /** Can sound be heard (started, on, and the page showing)? */
    get playing() {
        return Boolean(this.context && this.enabled && !this.hidden && this.context.state === "running");
    }

    /**
     * Start making the sounds (once), in a worker, and downloading the music's recordings.
     * Resolves when the sounds are made (`downloading` when the recordings are downloaded).
     */
    prepare() {
        this.downloading ??= this.#download();
        this.ready ??= new Promise((resolve) => {
            let worker = null;
            const here = async () => {
                worker?.terminate();

                for (const [name, sound] of Object.entries(SOUNDS)) {
                    for (let variant = 0; variant < sound.variants; variant++) {
                        this.#receive({ name, variant, samples: render(name, variant) });
                        await new Promise((next) => setTimeout(next, 0));
                    }
                }

                this.#receive({ name: "wind", variant: 0, samples: wind() });
                resolve();
            };

            try {
                worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
                worker.addEventListener("message", ({ data }) => {
                    if (data.done) {
                        worker.terminate();
                        resolve();
                    } else {
                        this.#receive(data);
                    }
                });
                worker.addEventListener("error", (event) => {
                    event.preventDefault();
                    here();
                });
                worker.postMessage("make");
            } catch {
                // (No module workers here: make them on the page, a little at a time)
                here();
            }
        });

        return this.ready;
    }

    /**
     * Start the browser's sound, if it hasn't been (call on a tap, click or key press, when
     * browsers allow it), and the music with it; or start it again, if it's stopped. Safe to
     * call again and again.
     */
    unlock() {
        if (this.context || this.#start()) {
            this.#revive({ tap: true });
        }
    }

    /** Start the sound again if it's stopped, without a tap (the page shown again, say). */
    wake() {
        if (this.context) {
            this.#revive();
        }
    }

    /**
     * Check the browser's sound is going, and play the music's next notes. Call every
     * SCHEDULE_MS (the sound's own timer does, once started).
     */
    tick() {
        this.#watch();
        this.scheduleMusic();
    }

    // Make the browser's sound: its context, the mix (buses, compressor, limiter), the music's
    // channels and every sample the browser doesn't yet have. Returns whether it could.
    #start() {
        const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;

        if (!Context) {
            return false;
        }

        const context = new Context({ latencyHint: "interactive" });
        const compressor = context.createDynamicsCompressor();
        const limiter = context.createDynamicsCompressor();

        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.enabled ? OUTPUT : 0;

        // A little compression evens it out; the limiter keeps a busy fight from clipping
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        limiter.threshold.value = LIMIT;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.1;
        this.master.connect(compressor).connect(limiter).connect(context.destination);

        for (const bus of BUSES) {
            this.buses[bus] = context.createGain();
            this.buses[bus].gain.value = gainOf(this.volumes[bus]);
            this.buses[bus].connect(this.master);
        }

        this.#buildMusic();

        for (const [name, variants] of this.samples) {
            variants.forEach((samples, variant) => this.#buffer(name, variant, samples));
        }

        for (const [id, recording] of this.recordings) {
            this.#decode(id, recording);
        }

        this.samples.clear();
        this.sounding = [];
        this.clock = null;
        this.#startWind();

        // Stopped by the browser rather than by us: started again
        context.addEventListener?.("statechange", () => context === this.context && context.state !== "running" && this.#revive());

        if (!this.timer) {
            this.timer = setInterval(() => this.tick(), SCHEDULE_MS);
            this.timer.unref?.();
        }

        return true;
    }

    // Start the browser's sound again if it's stopped (and it's meant to be playing): resumed if
    // suspended or interrupted; in a tap (or stuck), suspended first, as Safari on iPhones won't
    // resume an interrupted or stuck one otherwise (without a tap, an interrupted one is only
    // asked to resume, which it does when the interruption's over: suspended without a tap,
    // Safari might not let it); made anew if closed. Safari also wants something played in a
    // tap, so a moment of silence is.
    #revive({ tap = false } = {}) {
        const context = this.context;

        if (!context || !this.enabled || this.hidden || (context.state === "running" && !this.stalled)) {
            return;
        }

        if (context.state === "closed") {
            this.#rebuild();

            return;
        }

        try {
            const silence = context.createBufferSource();

            silence.buffer = context.createBuffer(1, 1, context.sampleRate);
            silence.connect(context.destination);
            silence.start();
        } catch {
            // (Only silence: nothing lost)
        }

        if (context.state !== "suspended" && (tap || this.stalled)) {
            context.suspend().catch(() => {});
        }

        context.resume().catch(() => {});
        this.stalled = false;
        this.clock = null;
    }

    // Notice the browser's clock standing still while it says it's playing: start it again, or,
    // if it was started again for that lately and is stuck again, make it anew
    #watch() {
        const context = this.context;
        const now = this.now();

        if (!context || context.state !== "running" || !this.enabled || this.hidden) {
            this.clock = null;

            return;
        }

        if (!this.clock || context.currentTime > this.clock.time) {
            this.clock = { time: context.currentTime, at: now };
            this.stalled = false;

            return;
        }

        if (now - this.clock.at < STALL * 1000) {
            return;
        }

        this.stalled = true;

        if (now - this.restarted < STALL * 4000) {
            this.#rebuild();
        } else {
            this.restarted = now;
            this.#revive();
        }
    }

    // Make the browser's sound anew (it's closed, or stuck however it's started again), keeping
    // every sample it had, and carrying the music on from where it was
    #rebuild() {
        const old = this.context;
        const music = this.music;
        const next = music?.score.notes[music.index];

        this.context = null;
        this.wind = null;

        try {
            old?.close?.()?.catch?.(() => {});
        } catch {
            // (Already closed)
        }

        if (!this.#start()) {
            return;
        }

        if (music && music.start !== null && next) {
            this.music.start = this.context.currentTime + 0.3 - this.music.loop * music.score.length - next.time;
        }

        this.stalled = false;
        this.restarted = -Infinity;
        this.#revive();
    }

    /** Turn it all on or off. */
    setEnabled(on) {
        this.enabled = on;

        if (!this.context) {
            return;
        }

        // (Turned on with a tap on the switch)
        if (on) {
            this.#revive({ tap: true });
        }

        this.#fade(on ? OUTPUT : 0);

        // Off, the browser needn't keep working on it
        if (!on) {
            setTimeout(() => !this.enabled && this.context.suspend().catch(() => {}), FADE * 3000);
        }
    }

    /** Set how loud a bus is ("effects", "environment" or "music"; 0 to 1). */
    setVolume(bus, volume) {
        this.volumes[bus] = Math.max(0, Math.min(1, volume));

        const gain = this.buses[bus]?.gain;

        if (gain) {
            const now = this.context.currentTime;

            gain.cancelScheduledValues(now);
            gain.setValueAtTime(gain.value, now);
            gain.linearRampToValueAtTime(gainOf(this.volumes[bus]), now + FADE);
        }
    }

    /** Silence everything while the page is hidden (another tab or app), and bring it back after. */
    setHidden(hidden) {
        this.hidden = hidden;

        if (!this.context) {
            return;
        }

        if (hidden) {
            this.context.suspend().catch(() => {});
        } else {
            this.#revive();
        }
    }

    /**
     * Say where the player is (a PLACES key: the town, or a floor of the tavern), for the music
     * heard there: from the town into the tavern, the town's music fades into the tavern's, from
     * its start; back out, the town's comes back where it left off; upstairs, the tavern's is
     * quieter and muffled.
     */
    setPlace(place) {
        const was = PLACES[this.place];
        const now = PLACES[place];

        if (!now || place === this.place) {
            return;
        }

        this.place = place;

        // (Not started yet: the music starts where the player is)
        if (!this.context) {
            this.music = this.tracks[now.score] ?? this.music;

            return;
        }

        const time = this.context.currentTime;
        const ramp = (param, to, seconds) => {
            param.cancelScheduledValues(time);
            param.setValueAtTime(param.value, time);
            param.linearRampToValueAtTime(to, time + seconds);
        };
        const track = this.tracks[now.score];

        if (was.score !== now.score) {
            ramp(this.tracks[was.score].output.gain, 0, CROSSFADE);

            if (now.score !== "town" || track.start === null) {
                // From the start (once every recording is ready)
                Object.assign(track, { start: null, index: 0, loop: 0 });
            } else {
                // Where it was, its next note in a moment
                const next = track.score.notes[track.index];

                track.start = time + 0.3 - track.loop * track.score.length - next.time;
            }

            this.music = track;
        }

        ramp(track.output.gain, now.level, was.score !== now.score ? CROSSFADE : THROUGH_FLOOR);

        if (track.filter) {
            ramp(track.filter.frequency, now.muffle ?? CLEAR, THROUGH_FLOOR);
        }
    }

    /** While the game is paused, no birds sing or leaves rustle (the music and wind go on). */
    setPaused(paused) {
        this.paused = paused;
    }

    /** Where the player is (metres), for hearing everything from. */
    setListener(x, z) {
        this.listener.x = x;
        this.listener.z = z;
    }

    /** Where the trees are ([{ x, z }] metres), for hearing their leaves. */
    setTrees(trees) {
        this.trees = trees;
    }

    /** Where a fire is burning near the player ({ x, z } metres: the tavern's hearth), to hear it crackle; or null. */
    setHearth(at) {
        this.hearth = at;
    }

    /** Let the wind blow, birds sing and leaves rustle (in the game), or not. */
    setAmbient(on) {
        this.ambient = on;

        if (on) {
            this.#startWind();
        } else {
            this.wind?.source.stop();
            this.wind = null;
        }
    }

    /** Birds and leaves, and the hearth's crackling, now and then. Call every frame. */
    update(dt) {
        if (this.paused || !this.playing) {
            return;
        }

        if (this.hearth) {
            this.nextCrackle -= dt;

            if (this.nextCrackle <= 0) {
                this.nextCrackle = CRACKLES[0] + Math.random() * (CRACKLES[1] - CRACKLES[0]);
                this.play("crackle", { at: this.hearth, volume: 0.6 + Math.random() * 0.4, rate: 0.85 + Math.random() * 0.3 });
            }
        }

        if (!this.ambient) {
            return;
        }

        this.nextBird -= dt;
        this.nextLeaves -= dt;

        if (this.nextBird <= 0) {
            this.nextBird = BIRDS[0] + Math.random() * (BIRDS[1] - BIRDS[0]);
            this.play("bird", { at: { x: this.listener.x + (Math.random() - 0.5) * 40, z: this.listener.z + (Math.random() - 0.5) * 40 }, volume: 0.6 + Math.random() * 0.4, rate: 0.9 + Math.random() * 0.2 });
        }

        if (this.nextLeaves <= 0) {
            this.nextLeaves = LEAVES[0] + Math.random() * (LEAVES[1] - LEAVES[0]);

            const near = this.trees.filter(({ x, z }) => Math.hypot(x - this.listener.x, z - this.listener.z) < TREES_HEARD);

            if (near.length) {
                this.play("leaves", { at: near[Math.floor(Math.random() * near.length)], volume: 0.7 + Math.random() * 0.3, rate: 0.9 + Math.random() * 0.2 });
            }
        }
    }

    /**
     * Play a sound (a SOUNDS name) from a point in the world ({ x, z } metres; null for
     * everywhere), `volume` times its own, starting `delay` seconds from now, `rate` times as fast
     * (higher). Returns its source node, or null if it isn't played (off, too far, too many).
     */
    play(name, { at = null, volume = 1, delay = 0, rate = 1 } = {}) {
        const context = this.context;
        const buffers = this.buffers.get(name);

        // (Counting the sounds still playing by when they end, not by the browser saying they
        // have: a stuck browser never does)
        this.sounding = this.sounding.filter((end) => end > context?.currentTime);

        if (!this.playing || !buffers?.length || this.sounding.length >= VOICES) {
            return null;
        }

        let gain = volume * (SOUNDS[name]?.volume ?? 1);
        let pan = 0;

        if (at) {
            const dx = at.x - this.listener.x;
            const distance = Math.hypot(dx, at.z - this.listener.z);

            gain *= Math.max(0, Math.min(1, 1 - (distance - NEAR) / (FAR - NEAR))) ** 2;
            pan = Math.max(-MOST_PAN, Math.min(MOST_PAN, dx / SIDE));
        }

        if (gain < 0.005) {
            return null;
        }

        const source = context.createBufferSource();
        const level = context.createGain();
        const bus = this.buses[SOUNDS[name]?.bus ?? "effects"];

        source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
        source.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
        level.gain.value = gain;
        source.connect(level);

        if (pan && context.createStereoPanner) {
            const panner = context.createStereoPanner();

            panner.pan.value = pan;
            level.connect(panner).connect(bus);
        } else {
            level.connect(bus);
        }

        const start = context.currentTime + Math.max(0, delay);

        this.sounding.push(start + source.buffer.duration / source.playbackRate.value);
        source.addEventListener("ended", () => {
            source.disconnect();
            level.disconnect();
        });
        source.start(start);

        return source;
    }

    /** An attack starting: its swing, timed to be loudest `hitAt` seconds from now, when it lands. */
    attack(animation, at, hitAt) {
        const name = SWINGS[animation];

        return name ? this.play(name, { at, delay: hitAt - PEAKS[name] }) : null;
    }

    /** A projectile let go ("arrow", "bolt" or "fireball"), higher or lower (`rate`) for its look. */
    launch(kind, at, { rate = 1 } = {}) {
        return LAUNCHES[kind] ? this.play(LAUNCHES[kind], { at, rate }) : null;
    }

    /** A blow landing: the sound of its reaction (weapons.js: slash, strike, crush...). */
    hit(reaction, at) {
        return SOUNDS[reaction] ? this.play(reaction, { at }) : null;
    }

    /** A footstep on a kind of ground (GROUND), walking or running (faster: louder). */
    step(ground, at, speed = 1.5) {
        const running = speed > 3;

        return this.play(STEPS[ground] ?? "stepDirt", { at, volume: running ? 1.3 : 0.6 + 0.15 * speed, rate: running ? 1.08 : 1 });
    }

    // Keep a sound's samples, and give the browser a copy if it's started
    #receive({ name, variant, samples }) {
        if (this.context) {
            this.#buffer(name, variant, samples);
        } else {
            const variants = this.samples.get(name) ?? [];

            variants[variant] = samples;
            this.samples.set(name, variants);
        }

        if (name === "wind") {
            this.#startWind();
        }
    }

    #buffer(name, variant, samples) {
        const buffer = this.context.createBuffer(1, samples.length, SAMPLE_RATE);
        const variants = this.buffers.get(name) ?? [];

        buffer.getChannelData(0).set(samples);
        variants[variant] = buffer;
        this.buffers.set(name, variants);
    }

    // Download the music's recordings, a few at a time, and have the browser decode them once it's started
    async #download() {
        const files = sampleFiles();
        let next = 0;

        const worker = async () => {
            while (next < files.length) {
                const [id, url] = files[next++];

                try {
                    const response = await this.fetch(url);

                    if (!response.ok) {
                        throw new Error(`${url}: ${response.status}`);
                    }

                    this.recordings.set(id, await response.arrayBuffer());

                    if (this.context) {
                        this.#decode(id, this.recordings.get(id));
                    }
                } catch {
                    // (Offline, say: the music just doesn't play, or plays without it)
                    this.unplayable++;
                }
            }
        };

        await Promise.all(Array.from({ length: DOWNLOADS }, worker));
    }

    #decode(id, recording) {
        this.recordings.delete(id);
        this.context.decodeAudioData(recording).then((buffer) => this.instruments.set(id, buffer), () => this.unplayable++);
    }

    #startWind() {
        const buffer = this.buffers.get("wind")?.[0];

        if (!this.ambient || this.wind || !buffer) {
            return;
        }

        const source = this.context.createBufferSource();
        const level = this.context.createGain();

        source.buffer = buffer;
        source.loop = true;
        level.gain.value = WIND;
        source.connect(level).connect(this.buses.environment);
        source.start();
        this.wind = { source, level };
    }

    // The music's tracks, one for each score: a channel for each instrument it plays (its level
    // and place), into the score's own level (for fading it in and out) and filter (muffling it
    // upstairs), then dry and through a reverb
    #buildMusic() {
        const context = this.context;
        const reverb = context.createConvolver();
        const send = context.createGain();
        const here = PLACES[this.place];

        reverb.buffer = hall(context, REVERB_TIME);
        send.gain.value = REVERB_SEND;
        send.connect(reverb).connect(this.buses.music);

        for (const [name, score] of Object.entries(SCORES)) {
            const output = context.createGain();
            const filter = context.createBiquadFilter?.() ?? null;
            const channels = {};

            output.gain.value = here.score === name ? here.level : 0;

            if (filter) {
                filter.type = "lowpass";
                filter.frequency.value = here.score === name && here.muffle ? here.muffle : CLEAR;
                filter.Q.value = 0.5;
                output.connect(filter);
            }

            (filter ?? output).connect(this.buses.music);
            (filter ?? output).connect(send);

            for (const instrument of new Set(score.notes.map((note) => note.instrument))) {
                const level = context.createGain();

                level.gain.value = INSTRUMENTS[instrument].mix * MUSIC_LEVEL;

                if (context.createStereoPanner) {
                    const panner = context.createStereoPanner();

                    panner.pan.value = INSTRUMENTS[instrument].pan;
                    level.connect(panner).connect(output);
                } else {
                    level.connect(output);
                }

                channels[instrument] = level;
            }

            // (Where each score has got to is kept when the browser's sound is made anew)
            this.tracks[name] = { start: null, index: 0, loop: 0, ...this.tracks[name], score, channels, output, filter };
        }

        this.music = this.tracks[here.score];
    }

    /**
     * Play the notes of the score heard where the player is that start in the next LOOKAHEAD
     * seconds, round again from its start at its end (every SCHEDULE_MS, once started).
     */
    scheduleMusic() {
        const music = this.music;
        const context = this.context;
        const score = music?.score;

        // (Starting once every recording is ready, or known not to be, so none is missing from the start)
        if (!this.playing || (music.start === null && (!this.instruments.size || this.instruments.size + this.unplayable < RECORDINGS))) {
            return;
        }

        const now = context.currentTime;
        const notes = score.notes;

        music.start ??= now + 0.3;

        for (;;) {
            const note = notes[music.index];
            const at = music.start + music.loop * score.length + note.time;

            if (at > now + LOOKAHEAD) {
                break;
            }

            // (Notes that were due while the page was busy are let go, not played late)
            if (at >= now - 0.05 && this.volumes.music > 0) {
                try {
                    this.#note(note, at, music);
                } catch {
                    // (One note going wrong mustn't stop the rest)
                }
            }

            music.index++;

            if (music.index >= notes.length) {
                music.index = 0;
                music.loop++;
            }
        }
    }

    #note(note, at, track) {
        const instrument = INSTRUMENTS[note.instrument];
        const key = baseFor(note.instrument, note.pitch);
        const buffer = this.instruments.get(`${note.instrument} ${key}`);

        if (!buffer) {
            return;
        }

        const context = this.context;
        const source = context.createBufferSource();
        const level = context.createGain();
        const end = at + note.duration;

        source.buffer = buffer;
        source.playbackRate.value = instrument.kinds ? 1 : 2 ** ((note.pitch - key) / 12);
        level.gain.setValueAtTime(note.velocity, at);
        source.start(at);

        if (instrument.held) {
            level.gain.setValueAtTime(note.velocity, end);
            level.gain.linearRampToValueAtTime(0, end + instrument.release);
            source.stop(end + instrument.release + 0.02);
        } else {
            // Plucked and struck notes ring on a while
            const ring = instrument.ring ?? 1.2;

            level.gain.setValueAtTime(note.velocity, end + ring);
            level.gain.linearRampToValueAtTime(0, end + ring + 0.3);
            source.stop(end + ring + 0.32);
        }

        source.connect(level).connect(track.channels[note.instrument]);
        source.addEventListener("ended", () => {
            source.disconnect();
            level.disconnect();
        });
    }

    /** Stop everything for good (the music's timer and the browser's sound). */
    close() {
        clearInterval(this.timer);
        this.context?.close?.();
        this.context = null;
    }

    #fade(to) {
        if (!this.master) {
            return;
        }

        const now = this.context.currentTime;
        const gain = this.master.gain;

        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(to, now + FADE);
    }
}

// A hall's reverb: stereo noise, fading away over `seconds`, a little darker as it fades
function hall(context, seconds) {
    const length = Math.round(seconds * context.sampleRate);
    const buffer = context.createBuffer(2, length, context.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let smooth = 0;

        for (let n = 0; n < length; n++) {
            const t = n / length;
            const white = Math.random() * 2 - 1;

            // Lower frequencies last longer: a gentler low-pass as it goes
            smooth += (white - smooth) * (0.9 - 0.75 * t);
            data[n] = smooth * (1 - t) ** 3 * (n < 0.01 * context.sampleRate ? n / (0.01 * context.sampleRate) : 1);
        }
    }

    return buffer;
}
