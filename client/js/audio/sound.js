// The game's sound: plays the sounds synth.js makes (in a worker, worker.js) with the Web Audio
// API, each from where it happens: quieter the further it is from the player, and to the left or
// right. The wind blows quietly all the time, and birds sing now and then. It can be turned off
// (the menu's Game options), and is silent while the game is paused.
//
// Browsers only let a page make sound once someone has tapped, clicked or pressed a key on it,
// so the sound starts on the first one (unlock()).

import { PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "./synth.js";

// Heard at full volume this close (metres), and not at all this far away
const NEAR = 4;
const FAR = 34;

// Panned all the way to one side this far to the side (metres), and at most this far
const SIDE = 14;
const MOST_PAN = 0.85;

// At most this many sounds at once
const VOICES = 24;

// How loud the wind is, and how long between birds singing (seconds, from and to)
const WIND = 0.09;
const BIRDS = [4, 14];

// How quickly it fades in and out (seconds)
const FADE = 0.08;

// The swing for each attack animation (actions.js), and the sound of each projectile's launch
const SWINGS = { sword: "swingSword", staff: "swingStaff", hammer: "swingHammer", punch: "swingPunch", cleaver: "swingCleaver" };
const LAUNCHES = { arrow: "arrow", bolt: "bolt", fireball: "fireball" };

// The footsteps on each kind of ground (setpieces/pieces.js GROUND: grass, road, cobbles, soil,
// courtyard)
const STEPS = ["stepGrass", "stepDirt", "stepStone", "stepDirt", "stepStone"];

export class Sound {
    /** @param {object} [options] @param {boolean} [options.enabled] - Whether it's on. */
    constructor({ enabled = true } = {}) {
        this.enabled = enabled;
        this.paused = true;
        this.context = null;
        this.master = null;

        /** The sounds' samples as they're made (name → [variant]), and the browser's copies. */
        this.samples = new Map();
        this.buffers = new Map();

        /** Where the player is (metres): sounds are heard from there. */
        this.listener = { x: 0, z: 0 };
        this.voices = 0;
        this.ambient = false;
        this.wind = null;
        this.nextBird = BIRDS[0];
        this.ready = null;
    }

    /** Is sound playing (on, started, and not paused)? */
    get playing() {
        return Boolean(this.context && this.enabled && !this.paused && this.context.state === "running");
    }

    /** Start making the sounds (once), in a worker. Resolves when they're all made. */
    prepare() {
        this.ready ??= new Promise((resolve) => {
            let worker = null;
            const here = async () => {
                worker?.terminate();

                for (const [name, sound] of Object.entries(SOUNDS)) {
                    for (let variant = 0; variant < sound.variants; variant++) {
                        this.#receive(name, variant, render(name, variant));
                        await new Promise((next) => setTimeout(next, 0));
                    }
                }

                this.#receive("wind", 0, wind());
                resolve();
            };

            try {
                worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
                worker.addEventListener("message", ({ data }) => {
                    if (data.done) {
                        worker.terminate();
                        resolve();
                    } else {
                        this.#receive(data.name, data.variant, data.samples);
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
     * browsers allow it). Safe to call again and again.
     */
    unlock() {
        if (!this.context) {
            const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;

            if (!Context) {
                return;
            }

            const context = new Context({ latencyHint: "interactive" });
            const compressor = context.createDynamicsCompressor();

            this.context = context;
            this.master = context.createGain();
            this.master.gain.value = this.enabled && !this.paused ? 1 : 0;

            // A little compression keeps a busy fight from clipping
            compressor.threshold.value = -14;
            compressor.knee.value = 12;
            compressor.ratio.value = 4;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.2;
            this.master.connect(compressor).connect(context.destination);

            for (const [name, variants] of this.samples) {
                variants.forEach((samples, variant) => this.#buffer(name, variant, samples));
            }

            this.#startWind();
        }

        if (this.enabled && this.context.state !== "running") {
            this.context.resume().catch(() => {});
        }
    }

    /** Turn it on or off. */
    setEnabled(on) {
        this.enabled = on;

        if (!this.context) {
            return;
        }

        if (on) {
            this.context.resume().catch(() => {});
        }

        this.#fade(on && !this.paused ? 1 : 0);

        // Off, the browser needn't keep working on it
        if (!on) {
            setTimeout(() => !this.enabled && this.context.suspend().catch(() => {}), FADE * 3000);
        }
    }

    /** Silence it while the game is paused, and bring it back after. */
    setPaused(paused) {
        this.paused = paused;
        this.#fade(this.enabled && !paused ? 1 : 0);
    }

    /** Where the player is (metres), for hearing everything from. */
    setListener(x, z) {
        this.listener.x = x;
        this.listener.z = z;
    }

    /** Let the wind blow and birds sing (or not). */
    setAmbient(on) {
        this.ambient = on;

        if (on) {
            this.#startWind();
        } else {
            this.wind?.source.stop();
            this.wind = null;
        }
    }

    /** Birds, now and then. Call every frame. */
    update(dt) {
        if (!this.ambient || !this.playing) {
            return;
        }

        this.nextBird -= dt;

        if (this.nextBird <= 0) {
            this.nextBird = BIRDS[0] + Math.random() * (BIRDS[1] - BIRDS[0]);
            this.play("bird", { at: { x: this.listener.x + (Math.random() - 0.5) * 40, z: this.listener.z + (Math.random() - 0.5) * 40 }, volume: 0.6 + Math.random() * 0.4, rate: 0.9 + Math.random() * 0.2 });
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

        source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
        source.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
        level.gain.value = gain;
        source.connect(level);

        if (pan && context.createStereoPanner) {
            const panner = context.createStereoPanner();

            panner.pan.value = pan;
            level.connect(panner).connect(this.master);
        } else {
            level.connect(this.master);
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
    #receive(name, variant, samples) {
        const variants = this.samples.get(name) ?? [];

        variants[variant] = samples;
        this.samples.set(name, variants);
        this.#buffer(name, variant, samples);

        if (name === "wind") {
            this.#startWind();
        }
    }

    #buffer(name, variant, samples) {
        if (!this.context || !samples) {
            return;
        }

        const buffer = this.context.createBuffer(1, samples.length, SAMPLE_RATE);
        const variants = this.buffers.get(name) ?? [];

        buffer.getChannelData(0).set(samples);
        variants[variant] = buffer;
        this.buffers.set(name, variants);
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
        source.connect(level).connect(this.master);
        source.start();
        this.wind = { source, level };
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
