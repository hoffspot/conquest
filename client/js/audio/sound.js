// The game's sound, played with the Web Audio API in three buses, each with its own volume (the
// sliders in Game options), all turned on or off together (the Sound switch):
//
//  - Sound effects: blows, spells, footsteps and cues (synth.js), each from where it happens:
//    quieter the further it is from the player, and to the left or right.
//  - The environment: the wind blowing, birds singing and leaves rustling in nearby trees.
//  - Music: the score (score.js), played on recordings of real instruments (instruments.js) as
//    it goes, note by note, a little ahead of time, so it loops without a seam; with a hall's
//    reverb.
//
// synth.js's sounds are made in a worker (worker.js), so nothing waits for them; the music's
// recordings (client/music, about a megabyte) are downloaded meanwhile. Browsers only let a page make sound once someone has tapped, clicked or pressed
// a key on it, so it starts on the first one (unlock()). The music plays from then on, on every
// screen, the pause menu included; everything is silent while the page is hidden.

import { baseFor, INSTRUMENTS, sampleFiles } from "./instruments.js";
import { SCORE } from "./score.js";
import { PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "./synth.js";

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

// The swing for each attack animation (actions.js), and the sound of each projectile's launch
const SWINGS = { sword: "swingSword", staff: "swingStaff", hammer: "swingHammer", punch: "swingPunch", cleaver: "swingCleaver" };
const LAUNCHES = { arrow: "arrow", bolt: "bolt", fireball: "fireball" };

// The footsteps on each kind of ground (setpieces/pieces.js GROUND: grass, road, cobbles, soil,
// courtyard)
const STEPS = ["stepGrass", "stepDirt", "stepStone", "stepDirt", "stepStone"];

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
        this.voices = 0;
        this.ambient = false;
        this.wind = null;
        this.trees = [];
        this.nextBird = BIRDS[0];
        this.nextLeaves = LEAVES[0];
        this.music = null;
        this.ready = null;
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
     * browsers allow it), and the music with it. Safe to call again and again.
     */
    unlock() {
        if (!this.context) {
            const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;

            if (!Context) {
                return;
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
            this.#startWind();
            this.music.timer = setInterval(() => this.scheduleMusic(), SCHEDULE_MS);
            this.music.timer.unref?.();
        }

        // (Suspended, or interrupted on iPhones by a call or another app.) Safari on iPhones and
        // iPads also wants something played in the tap itself: a moment of silence
        if (this.enabled && !this.hidden && this.context.state !== "running") {
            const silence = this.context.createBufferSource();

            silence.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
            silence.connect(this.context.destination);
            silence.start();
            this.context.resume().catch(() => {});
        }
    }

    /** Turn it all on or off. */
    setEnabled(on) {
        this.enabled = on;

        if (!this.context) {
            return;
        }

        if (on && !this.hidden) {
            this.context.resume().catch(() => {});
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
        } else if (this.enabled) {
            this.context.resume().catch(() => {});
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

    /** Birds and leaves, now and then. Call every frame. */
    update(dt) {
        if (!this.ambient || this.paused || !this.playing) {
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

        if (!this.playing || !buffers?.length || this.voices >= VOICES) {
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

        this.voices++;
        source.addEventListener("ended", () => {
            this.voices--;
            source.disconnect();
            level.disconnect();
        });
        source.start(context.currentTime + Math.max(0, delay));

        return source;
    }

    /** An attack starting: its swing, timed to be loudest `hitAt` seconds from now, when it lands. */
    attack(animation, at, hitAt) {
        const name = SWINGS[animation];

        return name ? this.play(name, { at, delay: hitAt - PEAKS[name] }) : null;
    }

    /** A projectile let go ("arrow", "bolt" or "fireball"). */
    launch(kind, at) {
        return LAUNCHES[kind] ? this.play(LAUNCHES[kind], { at }) : null;
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

    // The music's channels: one per instrument (its level and place), dry and through a reverb
    #buildMusic() {
        const context = this.context;
        const reverb = context.createConvolver();
        const send = context.createGain();
        const channels = {};

        reverb.buffer = hall(context, REVERB_TIME);
        send.gain.value = REVERB_SEND;
        send.connect(reverb).connect(this.buses.music);

        for (const [name, instrument] of Object.entries(INSTRUMENTS)) {
            const level = context.createGain();

            level.gain.value = instrument.mix * MUSIC_LEVEL;

            if (context.createStereoPanner) {
                const panner = context.createStereoPanner();

                panner.pan.value = instrument.pan;
                level.connect(panner);
                panner.connect(this.buses.music);
                panner.connect(send);
            } else {
                level.connect(this.buses.music);
                level.connect(send);
            }

            channels[name] = level;
        }

        this.music = { channels, start: null, index: 0, loop: 0, timer: null };
    }

    /**
     * Play the score's notes that start in the next LOOKAHEAD seconds, round again from its
     * start at its end (every SCHEDULE_MS, once started).
     */
    scheduleMusic() {
        const music = this.music;
        const context = this.context;

        // (Starting once every recording is ready, or known not to be, so none is missing from the start)
        if (!this.playing || (music.start === null && (!this.instruments.size || this.instruments.size + this.unplayable < RECORDINGS))) {
            return;
        }

        const now = context.currentTime;
        const notes = SCORE.notes;

        music.start ??= now + 0.3;

        for (;;) {
            const note = notes[music.index];
            const at = music.start + music.loop * SCORE.length + note.time;

            if (at > now + LOOKAHEAD) {
                break;
            }

            // (Notes that were due while the page was busy are let go, not played late)
            if (at >= now - 0.05 && this.volumes.music > 0) {
                this.#note(note, at);
            }

            music.index++;

            if (music.index >= notes.length) {
                music.index = 0;
                music.loop++;
            }
        }
    }

    #note(note, at) {
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
            level.gain.setValueAtTime(note.velocity, end + 1.2);
            level.gain.linearRampToValueAtTime(0, end + 1.5);
            source.stop(end + 1.52);
        }

        source.connect(level).connect(this.music.channels[note.instrument]);
        source.addEventListener("ended", () => {
            source.disconnect();
            level.disconnect();
        });
    }

    /** Stop everything for good (the music's timer and the browser's sound). */
    close() {
        clearInterval(this.music?.timer);
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
