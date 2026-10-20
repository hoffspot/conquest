// The game's sounds (client/js/audio): made in code (synth.js) or recorded (recorded.js), played
// from where they happen (sound.js), and each described for the sound studio (catalog.js)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { ambienceOf, CALLS, doorOf, HELL, INDOORS, TOLLS, tolled } from "../client/js/audio/ambience.js";
import { CATALOG, GROUPS, LOOPS, MUSIC } from "../client/js/audio/catalog.js";
import { filter, pluck } from "../client/js/audio/dsp.js";
import { sampleFiles } from "../client/js/audio/instruments.js";
import { SURFACES } from "../client/js/audio/footing.js";
import { useSound, wearSound } from "../client/js/audio/handling.js";
import { ON_DEMAND, RECORDED, RECORDED_LEVEL, SOURCES } from "../client/js/audio/recorded.js";
import { ARMOUR, BUSES, CREATURE_VOICES, creatureSounds, DECODED_BUDGET, FOOTSTEPS, GAITS, gainOf, ITEM_SOUNDS, MURMUR, PLACES, RECORDED_ONLY, recordedFiles, Sound, spellSounds, VOLUME_DEFAULTS } from "../client/js/audio/sound.js";
import { SCORE } from "../client/js/audio/score.js";
import { BEDS, LEVEL, loudness, PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "../client/js/audio/synth.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { GEAR } from "../client/js/core/gear.js";
import { ITEMS } from "../client/js/core/progress.js";
import { DAY, HOUR } from "../client/js/core/daytime.js";
import { createRandom } from "../client/js/core/random.js";
import { SPELLS } from "../client/js/core/spells.js";
import { BIOMES } from "../client/js/core/worldplan/plan.js";
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
        const swings = { sword: "swingSword", staff: "swingStaff", hammer: "swingHammer", punch: "swingPunch", kick: "swingKick", cleaver: "swingCleaver" };

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

    it("puts every sound on the effects bus but for the town's, the tavern's and an ants' nest's: birds, leaves, the hearth crackling, a colony's murmur and soil trickling", () => {
        for (const [name, sound] of Object.entries(SOUNDS)) {
            assert.equal(sound.bus ?? "effects", ["bird", "leaves", "crackle", "colonyRustle", "soilTrickle"].includes(name) ? "environment" : "effects", name);
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

    it("makes beds that loop without a seam: a hell's drone, low but heard on a phone, and a heart beating every 1.2 seconds", () => {
        const rms = (samples) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const made = Object.fromEntries(Object.entries(BEDS).map(([name, { make }]) => [name, make()]));

        assert.deepEqual(Object.keys(BEDS), ["hellDrone", "heartbeat"]);

        for (const [name, samples] of Object.entries(made)) {
            const step = (k) => Math.abs(samples[(k + 1) % samples.length] - samples[k]);
            const steps = Array.from({ length: samples.length }, (_, k) => step(k)).sort((a, b) => a - b);

            assert.ok(Math.abs(peakOf(samples) - 0.8) < 1e-6, name);
            assert.ok(step(samples.length - 1) <= steps[Math.floor(steps.length * 0.99)], `${name}: seamless`);
            assert.ok(BEDS[name].volume > 0 && BEDS[name].volume <= 1, name);
        }

        // (The drone: eight seconds, mostly low, but a good share of it over 200 Hz, where a
        // phone's speaker plays; dark, little over a kilohertz)
        const drone = made.hellDrone;

        assert.equal(drone.length, 8 * SAMPLE_RATE);
        assert.ok(rms(filter(drone, "highpass", 200)) > 0.25 * rms(drone), "heard on a phone");
        assert.ok(rms(filter(drone, "highpass", 2000)) < 0.05 * rms(drone), "dark");

        // (The heart: four beats, one every 1.2 seconds, silent between them and at each end)
        const heart = made.heartbeat;
        const loudAt = (from, to) => rms(heart.subarray(Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE)));

        assert.equal(heart.length, 4.8 * SAMPLE_RATE);

        for (let beat = 0; beat < 4; beat++) {
            const at = beat * 1.2;

            assert.ok(loudAt(at, at + 0.15) > 10 * loudAt(at + 0.75, at + 1.15), `beat ${beat}: loud, then quiet till the next`);
        }

        assert.ok(Math.abs(heart[0]) < 1e-3 && Math.abs(heart.at(-1)) < 1e-3, "starting and ending in silence");
    });

    it("tunes its plucked string between samples, so the bow twangs in tune", () => {
        // The pitch, by where the signal best matches itself a period later
        const pitchOf = (samples, rate) => {
            const window = 6000;
            const match = (lag) => samples.subarray(1000, 1000 + window).reduce((sum, value, n) => sum + value * samples[1000 + n + lag], 0);
            let best = 0;
            let lag = 0;

            for (let l = Math.floor(rate / 1500); l < rate / 60; l++) {
                const m = match(l);

                if (m > best) {
                    best = m;
                    lag = l;
                }
            }

            const [a, b, c] = [match(lag - 1), match(lag), match(lag + 1)];

            return rate / (lag + (a - c) / (2 * (a - 2 * b + c)));
        };

        for (const frequency of [110, 293.66, 659.26, 987.77]) {
            const measured = pitchOf(pluck(createRandom(3), frequency, 0.6, 0.998), SAMPLE_RATE);
            const cents = 1200 * Math.log2(measured / frequency);

            assert.ok(Math.abs(cents) < 3, `${frequency} Hz is ${cents.toFixed(1)} cents out`);
        }
    });
});

// A stand-in for the browser's Web Audio: records what's played, how loud, where and on which bus
function fakeAudio() {
    const played = [];
    const param = (value) => ({ value, curves: [], cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, setValueCurveAtTime(curve, at, duration) { this.curves.push({ curve, at, duration }); } });

    // A node remembers what it's connected to, so a sound can be followed to its bus
    const node = (extra = {}) => {
        const self = {
            outputs: [],
            connect(next) {
                self.outputs.push(next);

                return next;
            },
            disconnect() {},
            ...extra,
        };

        return self;
    };

    class FakeContext {
        constructor() {
            this.state = "suspended";
            this.calls = [];
            this.currentTime = 10;
            this.sampleRate = 48000;
            this.destination = node({ name: "destination" });
        }

        // (Each call is kept in `calls`, to see how it was started again)
        resume() {
            this.calls.push("resume");
            this.state = "running";

            return Promise.resolve();
        }

        suspend() {
            this.calls.push("suspend");
            this.state = "suspended";

            return Promise.resolve();
        }

        close() {
            this.state = "closed";

            return Promise.resolve();
        }

        createGain() {
            return node({ gain: param(1) });
        }

        createStereoPanner() {
            return node({ pan: param(0) });
        }

        createConvolver() {
            return node({ buffer: null });
        }

        createBiquadFilter() {
            return node({ type: "lowpass", frequency: param(350), Q: param(1) });
        }

        createDynamicsCompressor() {
            return node({ threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
        }

        createBuffer(channels, length, rate) {
            const data = Array.from({ length: channels }, () => new Float32Array(length));

            return { length, sampleRate: rate, duration: length / rate, numberOfChannels: channels, getChannelData: (channel) => data[channel] };
        }

        // (Decodes a recording to a stand-in buffer, as the browser would, a moment later)
        decodeAudioData(recording) {
            return Promise.resolve(this.createBuffer(1, Math.max(1, recording.byteLength), 32000));
        }

        createBufferSource() {
            const source = node({
                playbackRate: param(1),
                addEventListener() {},
                start: (when = 0, offset = 0) => played.push({ source, when, offset }),
                stop: (when = 0) => (source.stopped = when),
            });

            return source;
        }
    }

    globalThis.AudioContext = FakeContext;

    return played;
}

// Where a sound goes: its level (gain), pan, and the bus it ends up on
function route(sound, source) {
    const level = source.outputs[0];
    const next = level.outputs[0];
    const pan = next.pan ? next.pan.value : 0;
    const bus = Object.entries(sound.buses).find(([, gain]) => gain === next || gain === next.outputs[0])?.[0];

    return { gain: level.gain.value, pan, bus };
}

// Recordings "downloaded" from client/music, as the browser would
const fromDisk = async (url) => {
    const data = await readFile(url);

    return { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
};

// The same, each download noted in `fetched`, to see what's downloaded again
const noting = (fetched) => (url) => {
    fetched.push(String(url));

    return fromDisk(url);
};

// The sounds, made once (without a worker, as in Node), and the music's recordings, downloaded
// once, handed to each Sound tested
const made = new Sound({ fetch: fromDisk });
const making = made.prepare();

async function started(options) {
    await making;
    await made.downloading;

    const played = fakeAudio();
    const sound = new Sound({ fetch: fromDisk, ...options });

    sound.samples = new Map(made.samples);
    sound.recordings = new Map(made.recordings);
    sound.ready = making;
    sound.downloading = made.downloading;
    sound.unlock();

    // (The browser decodes the recordings a moment later)
    await new Promise((resolve) => setTimeout(resolve, 0));

    return { sound, played };
}

describe("every sound described, for the sound studio (catalog.js, sound-studio.html)", () => {
    const described = (entry) => ["label", "about", "plays"].every((key) => typeof entry[key] === "string" && entry[key].length > 2);

    it("describes every sound the game makes, in one of its groups: what it is and when it plays", () => {
        assert.deepEqual(Object.keys(CATALOG).sort(), [...Object.keys(SOUNDS), ...Object.keys(RECORDED_ONLY)].sort(), "a sound added, changed or taken out is described with it");

        for (const [name, entry] of [...Object.entries(CATALOG), ...Object.entries(LOOPS)]) {
            assert.ok(GROUPS.includes(entry.group), `${name}'s group`);
            assert.ok(described(entry), name);
        }

        assert.ok(GROUPS.every((group) => Object.values(CATALOG).some((entry) => entry.group === group)), "no group empty");
        assert.deepEqual(Object.keys(LOOPS), ["wind", ...Object.keys(BEDS)], "the beds made in code");
        assert.deepEqual(Object.keys(MUSIC).sort(), [...Object.keys(PLACES), "battle"].sort(), "the music in every place, and a fight's");
        assert.ok(Object.values(MUSIC).every(described));
    });

    it("says where every recording comes from, by whom, under CC0 or in the public domain", () => {
        for (const [name, files] of Object.entries(RECORDED)) {
            assert.ok(SOUNDS[name] || RECORDED_ONLY[name], `${name} is played instead of a made sound, or said to be recorded only`);

            for (const { file, from } of files) {
                assert.match(file, /^[a-z-]+-\d+\.[0-9a-f]{8}\.mp3$/);
                assert.ok(from.length > 0, `${file}'s sources`);

                for (const key of from) {
                    const source = SOURCES[key];

                    assert.ok(source, `${file}'s source ${key}`);
                    assert.ok(["CC0", "public domain"].includes(source.licence), `${file}: ${source.licence}`);
                    assert.match(source.page, /^https:\/\//);
                    assert.ok(source.title && source.by, file);
                }
            }
        }

        // (Each recorded-only sound recorded, as loud as it's said, and what plays in its place
        // till then a made sound)
        // (Two recordings at least, to vary it; a bed, looped, one)
        for (const [name, { volume, instead }] of Object.entries(RECORDED_ONLY)) {
            assert.ok(RECORDED[name]?.length >= (RECORDED[name]?.[0].loop ? 1 : 2) && !SOUNDS[name], name);
            assert.ok(volume > 0 && volume <= 1, name);
            assert.ok(!instead || SOUNDS[instead], `${name} instead: ${instead}`);
        }
    });
});

describe("playing sounds (sound.js)", () => {
    it("makes every sound (here without a worker), downloads the music's recordings and the recorded sounds, and plays nothing before it's unlocked", async () => {
        await making;
        await made.downloading;

        for (const [name, { variants }] of Object.entries(SOUNDS)) {
            assert.equal(made.samples.get(name)?.filter(Boolean).length, variants, name);
        }

        assert.ok(made.samples.has("wind"));
        assert.deepEqual([...made.recordings.keys()].sort(), [...sampleFiles(), ...recordedFiles()].map(([id]) => id).sort());
        assert.equal(made.play("slash"), null, "no sound until the browser allows it");

        // Unlocked, the browser decodes them all (but those downloaded once they're wanted: the spells')
        const { sound } = await started();

        assert.equal(sound.instruments.size, sampleFiles().length);

        for (const [name, files] of Object.entries(RECORDED)) {
            assert.equal(sound.recorded.get(name)?.length, ON_DEMAND.includes(name) ? undefined : files.length, name);
        }

        assert.equal(sound.recordings.size, 0, "and they're let go once decoded");
        sound.close();
    });

    it("has a recording of a footstep on every footing, a few of each, played instead of the made ones, as loud", async () => {
        for (const surface of SURFACES) {
            const name = `step${surface[0].toUpperCase()}${surface.slice(1)}`;

            assert.ok(RECORDED[name]?.length >= 4 && SOUNDS[name], name);
        }

        const { sound, played } = await started();

        played.length = 0;
        sound.play("stepGrass", { volume: 0.5 });
        sound.play("anvil", { volume: 0.5 });

        const [step, anvil] = played;

        assert.ok(sound.recorded.get("stepGrass").includes(step.source.buffer), "the recording");
        assert.ok(sound.buffers.get("anvil").includes(anvil.source.buffer), "a made sound where there's no recording");
        assert.ok(Math.abs(route(sound, step.source).gain - 0.5 * SOUNDS.stepGrass.volume * (LEVEL / RECORDED_LEVEL)) < 1e-9, "played up to a made sound's loudness");

        // (Before the recordings are decoded, or if they couldn't be downloaded, the made ones)
        sound.recorded.clear();
        played.length = 0;
        sound.play("stepGrass");
        assert.ok(sound.buffers.get("stepGrass").includes(played[0].source.buffer));
        sound.close();
    });

    it("plays the variant asked for, and the made one rather than the recording, as the sound studio asks", async () => {
        const { sound, played } = await started();

        played.length = 0;
        sound.play("stepStone", { variant: 2 });
        sound.play("stepStone", { variant: 2 });
        sound.play("stepStone", { variant: 1, made: true });
        sound.play("anvil", { variant: SOUNDS.anvil.variants - 1 });

        assert.equal(played[0].source.buffer, sound.recorded.get("stepStone")[2]);
        assert.equal(played[1].source.buffer, sound.recorded.get("stepStone")[2], "even twice running");
        assert.equal(played[2].source.buffer, sound.buffers.get("stepStone")[1]);
        assert.ok(Math.abs(route(sound, played[2].source).gain - SOUNDS.stepStone.volume) < 1e-9, "at the made one's own level");
        assert.equal(played[3].source.buffer, sound.buffers.get("anvil").at(-1));
        sound.close();
    });

    it("plays footsteps barely heard, everyone's alike, well under the blows: walking about a fourteenth of a slash, running about a ninth", (t) => {
        const sound = new Sound({ fetch: fromDisk, enabled: false });
        const heard = [];

        // (Each step as loud as the middle of its jitter: how loud each footing is, the jitter's checked below)
        const random = t.mock.method(Math, "random", () => 0.5);

        sound.play = (name, { volume }) => heard.push({ name, loud: volume * SOUNDS[name].volume });

        // (Every footing has its own footsteps)
        for (const surface of SURFACES) {
            sound.step(surface, null, { speed: 1.5 });
        }

        assert.deepEqual(
            heard.map(({ name }) => name),
            SURFACES.map((surface) => `step${surface[0].toUpperCase()}${surface.slice(1)}`),
        );
        assert.ok(heard.every(({ name }) => SOUNDS[name]));
        assert.ok(heard.every(({ loud }) => loud < SOUNDS.slash.volume / 11), `walking: ${heard.map(({ loud }) => (SOUNDS.slash.volume / loud).toFixed(1)).join()}`);

        // (Running on cobbles and boards)
        heard.length = 0;
        sound.step("stone", null, { speed: 4.5 });
        sound.step("wood", null, { speed: 4.5 });
        assert.ok(heard.every(({ loud }) => loud < SOUNDS.slash.volume / 7), "running");

        // (Each a little louder or softer than the last, never by much)
        random.mock.restore();
        heard.length = 0;

        for (let k = 0; k < 40; k++) {
            sound.step("grass", null, { speed: 1.5 });
        }

        const louds = heard.map(({ loud }) => loud);
        const middle = (FOOTSTEPS.walk + FOOTSTEPS.pace * 1.5) * SOUNDS.stepGrass.volume;

        assert.ok(new Set(louds).size > 30 && louds.every((loud) => Math.abs(loud / middle - 1) <= FOOTSTEPS.jitter + 1e-9));
    });

    it("hears footsteps only near, where a blow's heard further off", async () => {
        const { sound } = await started();

        sound.setListener(0, 0);
        assert.ok(sound.step("grass", { x: 10, z: 0 }, { speed: 1.5 }), "10 m off");
        assert.equal(sound.step("grass", { x: FOOTSTEPS.far, z: 0 }, { speed: 1.5 }), null, `${FOOTSTEPS.far} m off`);
        assert.ok(sound.play("slash", { at: { x: FOOTSTEPS.far + 5, z: 0 } }), "a blow further off");
        sound.close();
    });

    it("plays a creature's footfalls as heavy as it's big and as its feet sound, and none for what floats", (t) => {
        const sound = new Sound({ fetch: fromDisk, enabled: false });
        const heard = [];

        // (Each step as loud as the middle of its jitter)
        t.mock.method(Math, "random", () => 0.5);

        sound.play = (name, { volume, rate, delay }) => heard.push({ name, volume, rate, delay });

        // (A rat's paws, a person, a dragon's paws, walking at 1.5 m/s on grass)
        sound.step("grass", null, { speed: 1.5, size: 0.28, feet: "paws" });
        sound.step("grass", null, { speed: 1.5 });
        sound.step("grass", null, { speed: 1.5, size: 3.1, feet: "paws" });

        const [rat, person, dragon] = heard;

        assert.ok(rat.volume < person.volume && person.volume < dragon.volume, heard.map(({ volume }) => volume.toFixed(3)).join());
        assert.ok(rat.rate > person.rate && person.rate > dragon.rate, heard.map(({ rate }) => rate.toFixed(2)).join());

        // (A dragon's long stride at 5 m/s is a walk, where a person's running)
        heard.length = 0;
        sound.step("grass", null, { speed: 5, size: 3.1, feet: "paws" });
        sound.step("grass", null, { speed: 5 });
        assert.ok(heard[0].volume < FOOTSTEPS.run * 3.1 ** FOOTSTEPS.weight * GAITS.paws.volume && heard[1].volume === FOOTSTEPS.run);

        // (A spider skitters, a slime squelches, a serpent slithers, a frog's webbed feet slap,
        // whatever's under them; what floats isn't heard)
        heard.length = 0;

        for (const feet of ["legs", "slime", "scales", "webbed"]) {
            sound.step("stone", null, { speed: 1, feet });
        }

        assert.deepEqual(heard.map(({ name }) => name), ["skitter", "squelch", "slither", "squelch"]);
        assert.equal(sound.step("grass", null, { speed: 1, feet: null }), null);

        // (Later: up the stairs a tread at a time)
        heard.length = 0;
        sound.step("wood", null, { delay: 0.52, volume: 0.5 });
        assert.equal(heard[0].delay, 0.52);
        assert.ok(Math.abs(heard[0].volume - 0.5 * (FOOTSTEPS.walk + FOOTSTEPS.pace * 1.5)) < 1e-9);
    });

    it("hears armour: mail jingling and plate clanking with each step, leather swishing running, and each under a blow but not a spell", async () => {
        const { sound, played } = await started();
        const heard = () => played.map(({ source: { buffer } }) => [...sound.recorded].find(([, buffers]) => buffers.includes(buffer))?.[0]);

        played.length = 0;
        sound.step("stone", null, { armour: "mail" });
        sound.step("stone", null, { armour: "leather" });
        sound.step("stone", null, { armour: "leather", speed: 5 });
        sound.step("stone", null, { armour: "plate" });
        assert.deepEqual(heard(), ["mailJingle", "stepStone", "stepStone", "clothRustle", "stepStone", "plateClank", "stepStone"]);

        // (Under the step: as loud against it as ARMOUR says)
        const [jingle, step] = played.map(({ source }) => route(sound, source).gain);

        assert.ok(Math.abs(jingle / step - (ARMOUR.mail.with * RECORDED_ONLY.mailJingle.volume) / SOUNDS.stepStone.volume) < 0.25);

        played.length = 0;
        sound.hit("slash", null, "plate");
        sound.hit("fire", null, "plate");
        sound.hit("punch", null, null);
        assert.deepEqual(heard(), ["hitPlate", "slash", undefined, "punch"]);
        sound.close();
    });

    it("plays a recorded-only sound's made stand-in till its recordings are in, and nothing for one with none", async () => {
        const { sound, played } = await started();

        sound.recorded.delete("clash");
        sound.recorded.delete("hitMail");
        played.length = 0;
        sound.play("clash");
        assert.equal(sound.play("hitMail"), null);
        assert.ok(sound.buffers.get("block").includes(played[0].source.buffer));
        sound.close();
    });

    it("downloads the spells' recordings only once they're wanted, what's made playing in their place till then", async () => {
        const { sound, played } = await started();
        const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

        assert.ok(ON_DEMAND.includes("fire") && ON_DEMAND.includes("castFireLow") && !ON_DEMAND.includes("stepGrass"));
        assert.ok(!sound.recorded.has("fire") && !sound.recorded.has("castFireLow"), "none at the start");

        // (Played before it's in: the made one, and it's asked for, for next time)
        played.length = 0;
        sound.play("fire");
        assert.ok(sound.buffers.get("fire").includes(played[0].source.buffer));
        assert.ok(sound.wanted.has("fire"));
        sound.play("castFireLow");
        assert.ok(sound.buffers.get("fireball").includes(played[1].source.buffer), "a recorded-only one's stand-in meanwhile");

        await sound.want(["fire", "castFireLow"]);
        await tick();
        assert.equal(sound.recorded.get("fire")?.length, RECORDED.fire.length);
        assert.equal(sound.recorded.get("castFireLow")?.length, RECORDED.castFireLow.length);

        played.length = 0;
        sound.play("fire");
        assert.ok(sound.recorded.get("fire").includes(played[0].source.buffer), "then its recording");

        // (Asked for again: not downloaded again)
        const fetched = sound.wanted.get("fire");

        await sound.want("fire");
        assert.equal(sound.wanted.get("fire"), fetched);
        sound.close();
    });

    it("gives every spell its sounds: each school's by its tier, cast, missile and landing; the rest by what they do", () => {
        const exists = (name) => Boolean(SOUNDS[name] || RECORDED_ONLY[name]);

        for (const id of Object.keys(SPELLS)) {
            const { cast, missile, land } = spellSounds(id);

            assert.ok(cast && exists(cast), `${id}'s cast: ${cast}`);
            assert.ok(!missile || exists(missile), `${id}'s missile: ${missile}`);
            assert.ok(!land || exists(land), `${id}'s landing: ${land}`);
        }

        assert.deepEqual(spellSounds("burn"), { cast: "castFireLow", missile: "fireball", land: "impactFireLow" });
        assert.deepEqual(spellSounds("earthquake"), { cast: "castEarthMid", missile: null, land: "impactEarthMid" });
        assert.deepEqual(spellSounds("absoluteZero"), { cast: "castWaterHigh", missile: null, land: "impactWaterHigh" });
        assert.equal(spellSounds("stoneCrush").missile, "stoneShot");
        assert.equal(spellSounds("shockbolt").land, "shockbolt", "Shockbolt's own");
        assert.deepEqual(spellSounds("prismaticWater"), { cast: "castWaterHigh", missile: null, land: "impactWaterHigh" }, "a Prismatic element spell: as its element's greatest (the sigil's chord over it: Sound landed)");
        assert.equal(spellSounds("renewal").land, "impactHealingMid");
        assert.equal(spellSounds("astralHeal").cast, "castHealingHigh", "healing's fifth its greatest");
        assert.deepEqual(spellSounds("stun"), { cast: "bolt", missile: null, land: null }, "the made stun kept, heard as it stuns");
        assert.equal(spellSounds("resistFire").land, "ward");
        assert.equal(spellSounds("curePoison").cast, "castHealingLow", "a friend's or one's own tome spell cast with a healing's swell");
        assert.equal(spellSounds("teleport").land, null, "carried off: heard going and coming");

        // (Every sound downloaded once it's wanted used: the spells', and the creatures' and the
        // player's breath; the ambience's anywhere, at any time of day, and its doors, a tavern's
        // stairs and hearth, a church's bell; all but the rain and thunder, with no weather yet,
        // heard only in the sound studio)
        const heard = everywhere().flatMap((facts) => {
            const { beds, calls, wants } = ambienceOf(facts);

            return [...Object.keys(beds), ...Object.keys(calls), ...wants];
        });
        const used = new Set([...Object.keys(SPELLS).flatMap((id) => Object.values(spellSounds(id))), "teleportIn", "fizzle", "spellCircle", "fire", "arcane", ...Object.keys(CREATURES).flatMap(creatureSounds), "breath", ...heard, ...Object.keys(PLACES).map(doorOf), "crackle", "churchBell", ...ITEM_SOUNDS]);

        assert.deepEqual(ON_DEMAND.filter((name) => !used.has(name)), ["rainLoop", "thunder"]);
    });

    it("swells a cast to its release, loudest as it's let go, part way in if it's let go sooner; its missile flying the last of it; cut short if it's broken off", async () => {
        const { sound, played } = await started();

        await sound.want(["castFireLow", "fireball", "castAirMid", "teleportOut", "teleportIn", "ward"]);
        await new Promise((resolve) => setTimeout(resolve, 0));

        played.length = 0;
        sound.cast("fireball", null, 2, { travel: 0.3 });

        const [missile, cast] = played;

        assert.ok(sound.recorded.get("fireball").includes(missile.source.buffer) && sound.recorded.get("castFireLow").includes(cast.source.buffer));
        assert.ok(Math.abs(cast.when + cast.source.buffer.peak / cast.source.playbackRate.value - 12) < 1e-9, "loudest at the release");
        assert.ok(Math.abs(missile.when + missile.source.buffer.peak / missile.source.playbackRate.value - (12 - 0.15)) < 1e-9, "the missile loudest halfway through its flight");
        assert.equal(cast.offset, 0);

        // (Let go sooner than it swells to its loudest: started at once, that far in)
        played.length = 0;

        const quick = sound.cast("shockbolt", null, 0.1);
        const [early] = played;

        assert.equal(early.when, 10);
        assert.ok(early.offset > 0 && early.offset <= quick.buffer.duration, `${early.offset}`);

        // (Broken off: faded out at once)
        sound.cut(quick);
        assert.equal(route(sound, quick).gain, 0);

        // (Carried off by magic: gone with a pop, come with one; the player's own heard wherever)
        played.length = 0;
        sound.carried(null, null, { mine: true });
        assert.deepEqual(played.map(({ when }) => when), [10, 10.35]);

        played.length = 0;
        sound.carried({ x: 100, z: 0 }, { x: 2, z: 0 });
        assert.equal(played.length, 1, "gone too far off to hear, come near");

        // (Vanishing from sight: a hush of the same)
        played.length = 0;
        sound.landed("invisibility", null);
        sound.landed("resistFire", null);
        assert.equal(played.length, 2);
        assert.ok(Math.abs(route(sound, played[0].source).gain - 0.5 * RECORDED_ONLY.teleportOut.volume * (LEVEL / RECORDED_LEVEL)) < 1e-9);
        sound.close();
    });

    it("gives every creature its family's voice, downloaded once it's wanted, and its fall", () => {
        const families = new Set();

        for (const id of Object.keys(CREATURES)) {
            const voice = CREATURE_VOICES[id];

            assert.ok(voice, `${id} has a voice`);
            families.add(voice.family);

            for (const what of ["Attack", "Hurt", "Death"]) {
                assert.ok(RECORDED_ONLY[`${voice.family}${what}`] && RECORDED[`${voice.family}${what}`], `${id}: ${voice.family}${what}`);
            }

            // (Its fall a body's thud for its size, a person's fall till it's in; none heard; or as
            // a person falls)
            assert.ok(voice.fall === undefined || voice.fall === null || RECORDED_ONLY[voice.fall]?.instead === "fall", `${id}'s fall`);
            assert.ok(creatureSounds(id).length >= 3 && creatureSounds(id).every((name) => ON_DEMAND.includes(name) && RECORDED_ONLY[name]), id);
            assert.ok(voice.rate === undefined || (voice.rate > 0.7 && voice.rate < 1.25), `${id}'s pitch`);
        }

        // (Every family but the men's calls)
        assert.deepEqual([...families].filter((family) => !RECORDED[`${family}Call`]).sort(), ["human", "humanRough"]);
        assert.deepEqual(creatureSounds("dragon").filter((name) => !name.startsWith("dragon")), ["deathThudBig", "wingbeat"]);
        assert.ok(creatureSounds("dragon").includes("dragonBreath") && creatureSounds("magmaSlime").includes("slimeSizzle") && creatureSounds("bats").includes("smallWings"));
        assert.deepEqual(creatureSounds("nobody"), []);
    });

    it("voices the wild's creatures: their family's at their own pitch, an attack loudest as it lands, a call heard furthest, what's heard with it, a drake's own fire", async () => {
        const { sound, played } = await started();

        await sound.want([...creatureSounds("direWolf"), ...creatureSounds("magmaSlime"), ...creatureSounds("dragon"), ...creatureSounds("bandit")]);
        await new Promise((resolve) => setTimeout(resolve, 0));

        // (A dire wolf a wolf's, lower: loudest as its bite lands)
        played.length = 0;
        sound.voice("direWolf", "attack", null, { hitAt: 1 });

        const [snarl] = played;
        const rate = snarl.source.playbackRate.value;

        assert.ok(sound.recorded.get("wolfAttack").includes(snarl.source.buffer));
        assert.ok(rate >= 0.85 * 0.96 - 1e-9 && rate <= 0.85 * 1.04 + 1e-9, `${rate}`);
        assert.ok(Math.abs(snarl.when + snarl.source.buffer.peak / rate - 11) < 1e-9, "loudest as it lands");

        // (Its call heard further off than its bite)
        assert.ok(sound.voice("wolf", "call", { x: 40, z: 0 }));
        assert.equal(sound.voice("wolf", "attack", { x: 40, z: 0 }), null);

        // (A magma slime's sizzle under its voice, but not its hurt)
        played.length = 0;
        sound.voice("magmaSlime", "death", null);
        assert.equal(played.length, 2);
        assert.ok(sound.recorded.get("slimeSizzle").includes(played[0].source.buffer) && sound.recorded.get("slimeDeath").includes(played[1].source.buffer));
        played.length = 0;
        sound.voice("magmaSlime", "hurt", null);
        assert.equal(played.length, 1);

        // (A man has no call; none for what has no voice)
        assert.equal(sound.voice("bandit", "call", null), null);
        assert.ok(sound.voice("bandit", "hurt", null));
        assert.equal(sound.voice("nobody", "hurt", null), null);

        // (A dragon's fire its own, not the made fireball)
        played.length = 0;
        sound.launch("flame", null);
        assert.ok(sound.recorded.get("dragonBreath").includes(played[0].source.buffer));
        sound.close();
    });

    it("never plays the same variant of a sound twice running", async () => {
        const { sound, played } = await started();

        // (Fewer than can sound at once: the browser's clock stands still here)
        for (let k = 0; k < 20; k++) {
            sound.play("anvil");
        }

        // (Leaving out the wind, started with the sound)
        const buffers = sound.buffers.get("anvil");
        const variants = played.map(({ source }) => buffers.indexOf(source.buffer)).filter((variant) => variant >= 0);

        assert.equal(variants.length, 20);
        assert.ok(variants.every((variant, k) => k === 0 || variant !== variants[k - 1]), variants.join());
        assert.equal(new Set(variants).size, buffers.length, "and every one of them, in time");
        sound.close();
    });

    it("plays no music without its recordings (offline, say), and doesn't mind", async () => {
        const offline = new Sound({ fetch: async () => ({ ok: false, status: 404 }) });

        await offline.prepare();
        await offline.downloading;
        assert.equal(offline.recordings.size, 0);
        assert.equal(offline.unplayable, sampleFiles().length);
    });

    it("starts the music without a recording it couldn't get, rather than never", async () => {
        const [missing] = sampleFiles()[0];
        const { sound } = await started();

        // (As if that one had failed to download)
        sound.instruments.delete(missing);
        sound.unplayable = 1;
        sound.scheduleMusic();
        assert.notEqual(sound.music.start, null);
        sound.close();
    });

    it("plays from where things happen: quieter further away, and to the side they're on", async () => {
        const { sound, played } = await started();

        sound.setListener(50, 50);

        const level = (x, z) => {
            played.length = 0;

            const source = sound.play("crush", { at: { x, z } });

            return source ? route(sound, source) : null;
        };
        const near = level(51, 50);
        const middle = level(65, 50);

        assert.ok(near && middle && near.gain > middle.gain * 2, "quieter further away");
        assert.equal(level(95, 50), null, "not heard at all far away");
        assert.ok(level(40, 50).pan < 0 && level(60, 50).pan > 0, "left and right");
        sound.close();
    });

    it("sends each kind of sound to its own bus, as loud as its slider says", async () => {
        const { sound } = await started({ volumes: { effects: 0.8, environment: 0.5, music: 0.2 } });

        assert.deepEqual(BUSES, ["effects", "environment", "music"]);
        assert.deepEqual(VOLUME_DEFAULTS, { effects: 0.5, environment: 0.4, music: 0.35 });
        assert.equal(route(sound, sound.play("slash")).bus, "effects");
        assert.equal(route(sound, sound.play("bird")).bus, "environment");
        assert.ok(Math.abs(sound.buses.music.gain.value - gainOf(0.2)) < 1e-9);

        // The music is soft next to the effects and the town, to start with
        assert.ok(gainOf(VOLUME_DEFAULTS.music) < gainOf(VOLUME_DEFAULTS.environment) && gainOf(VOLUME_DEFAULTS.environment) < gainOf(VOLUME_DEFAULTS.effects));

        sound.setVolume("effects", 0.25);
        assert.ok(Math.abs(sound.buses.effects.gain.value - gainOf(0.25)) < 1e-9);
        assert.equal(gainOf(0), 0);
        assert.equal(gainOf(1), 1);
        assert.equal(gainOf(0.5), 0.25, "halfway is 12 dB down");
        sound.close();
    });

    it("times a swing to be loudest as the blow lands, and falls silent turned off or hidden", async () => {
        const { sound, played } = await started();

        // (Recorded, by when the recording's said to be loudest; made, by synth.js's PEAKS)
        sound.attack("hammer", { x: 0, z: 0 }, 0.64);

        const { source, when } = played.at(-1);

        assert.ok(sound.recorded.get("swingHammer").includes(source.buffer));
        assert.ok(source.buffer.peak > 0.05 && Math.abs(when - (10 + 0.64 - source.buffer.peak / source.playbackRate.value)) < 1e-9);
        sound.play("swingHammer", { peakAt: 0.64, made: true });
        assert.ok(Math.abs(played.at(-1).when - (10 + 0.64 - PEAKS.swingHammer / played.at(-1).source.playbackRate.value)) < 1e-9);

        // A bow: an arrow taken from the quiver, then the string drawn back (its twang when it
        // lets go: launch)
        played.length = 0;
        sound.attack("bow", { x: 0, z: 0 }, 0.66);
        assert.deepEqual(
            played.map(({ source: { buffer } }) => ["arrowQuiver", "bowDraw"].find((name) => sound.recorded.get(name).includes(buffer))),
            ["arrowQuiver", "bowDraw"],
        );
        assert.ok(played[1].when > played[0].when);

        sound.setHidden(true);
        assert.equal(sound.play("lock"), null);
        sound.setHidden(false);
        await Promise.resolve();
        sound.setEnabled(false);
        assert.equal(sound.play("lock"), null);
        sound.setEnabled(true);
        await Promise.resolve();
        assert.ok(sound.play("lock"));
        sound.close();
    });

    it("doesn't start the browser's sound at all while turned off, only once turned on (with a tap)", async () => {
        await making;
        fakeAudio();

        const sound = new Sound({ fetch: fromDisk, enabled: false });

        sound.samples = new Map(made.samples);
        sound.unlock();
        assert.equal(sound.context, null, "a tap, turned off: nothing started");
        sound.setEnabled(true);
        assert.ok(sound.context, "turned on after a tap: started");
        assert.equal(sound.playing, true);
        sound.close();
    });

    it("plays the score a little ahead of time, on the music bus, round again without a gap", async () => {
        const { sound, played } = await started();
        const context = sound.context;
        const music = () => played.filter(({ source }) => source.outputs[0].outputs[0] && Object.values(sound.music.channels).includes(source.outputs[0].outputs[0]));

        played.length = 0;
        sound.scheduleMusic();

        const first = music();
        const start = sound.music.start;

        assert.ok(first.length > 0, "the first notes are scheduled");
        assert.ok(first.every(({ when }) => when >= context.currentTime && when <= context.currentTime + 1.6), "a little ahead");

        // Nearly four minutes on, into the next time round: the notes carry straight on
        for (let t = 0; t <= SCORE.length + 5; t += 0.2) {
            context.currentTime = 10 + t;
            sound.scheduleMusic();
        }

        const times = music().map(({ when }) => when);

        assert.equal(sound.music.loop, 1);
        assert.ok(times.some((when) => Math.abs(when - (start + SCORE.length + SCORE.notes[0].time)) < 0.05), "the first note again, one score's length later");
        assert.ok(times.every((when, k) => k === 0 || when >= times[k - 1] - 0.05), "in order");

        const gaps = times.slice(1).map((when, k) => when - times[k]);
        const bar = (SCORE.beatsPerBar * 60) / SCORE.tempo;

        // At most a bar held without a new note, and round the end straight back to the start
        assert.ok(Math.max(...gaps) < bar + 0.05, `never more than ${Math.max(...gaps).toFixed(2)} s without a note`);
        assert.ok(SCORE.length - SCORE.notes.at(-1).time + SCORE.notes[0].time < 0.5, "no pause at the seam");

        // Silent while turned off; turned down to nothing, nothing is played
        sound.setVolume("music", 0);
        played.length = 0;
        context.currentTime += 1;
        sound.scheduleMusic();
        assert.equal(music().length, 0);
        sound.close();
    });

    it("fades the town's music into the tavern's going in, from its start; quieter and muffled upstairs; and back to the town's where it left off", async () => {
        const { sound, played } = await started();
        const context = sound.context;
        const { town, tavern } = sound.tracks;
        const on = (track) => played.filter(({ source }) => Object.values(track.channels).includes(source.outputs[0]?.outputs[0]));

        // A minute into the town's music
        for (let t = 0; t <= 60; t += 0.2) {
            context.currentTime = 10 + t;
            sound.scheduleMusic();
        }

        const index = town.index;

        assert.equal(sound.music, town);
        assert.equal(tavern.output.gain.value, 0, "the tavern's silent out here");

        // In: the town's fades out, the tavern's in, from the start, led by the lute
        sound.setPlace("taproom");
        assert.equal(sound.music, tavern);
        assert.equal(town.output.gain.value, 0);
        assert.equal(tavern.output.gain.value, 1);
        assert.equal(tavern.filter.frequency.value, 20000, "clear");
        played.length = 0;
        sound.scheduleMusic();
        assert.ok(Math.abs(tavern.start - (context.currentTime + 0.3)) < 1e-9);
        assert.ok(on(tavern).length > 0 && on(town).length === 0);

        for (let t = 0; t <= 4; t += 0.2) {
            context.currentTime += 0.2;
            sound.scheduleMusic();
        }

        assert.ok(on(tavern).some(({ source }) => source.outputs[0].outputs[0] === tavern.channels.guitar));

        // Upstairs: the same, quieter and muffled; down again, as it was
        sound.setPlace("upstairs");
        assert.equal(sound.music, tavern);
        assert.equal(tavern.output.gain.value, 0.4);
        assert.equal(tavern.filter.frequency.value, 650);
        sound.setPlace("taproom");
        assert.deepEqual([tavern.output.gain.value, tavern.filter.frequency.value], [1, 20000]);

        // Out: the town's again, where it left off, straight away
        sound.setPlace("town");
        assert.equal(sound.music, town);
        assert.equal(town.index, index);
        assert.equal(tavern.output.gain.value, 0);
        played.length = 0;
        sound.scheduleMusic();

        const next = on(town)[0];

        assert.ok(next && Math.abs(next.when - (context.currentTime + 0.3)) < 0.05, "its next note in a moment");
        sound.close();
    });

    it("fades a fight's music in over whatever's heard, from its start; once it's done, back to what was heard, where it left off; none in a hell's realms", async () => {
        const { sound, played } = await started();
        const context = sound.context;
        const { town, tavern, battle } = sound.tracks;
        const on = (track) => played.filter(({ source }) => Object.values(track.channels).includes(source.outputs[0]?.outputs[0]));

        // (Half a minute into the town's music)
        for (let t = 0; t <= 30; t += 0.2) {
            context.currentTime = 10 + t;
            sound.scheduleMusic();
        }

        const index = town.index;

        assert.equal(battle.output.gain.value, 0, "silent out of a fight");

        // A fight: its music in, from its start (the cellos galloping), the town's out
        sound.setBattle(true);
        assert.equal(sound.music, battle);
        assert.deepEqual([battle.output.gain.value, town.output.gain.value, battle.filter.frequency.value], [1, 0, 20000]);
        played.length = 0;
        sound.scheduleMusic();
        assert.ok(Math.abs(battle.start - (context.currentTime + 0.3)) < 1e-9);
        assert.ok(on(battle).length > 0 && on(battle).every(({ source }) => source.outputs[0].outputs[0] === battle.channels.cello));
        assert.equal(on(town).length, 0);

        // (Said again, nothing changes)
        sound.setBattle(true);
        assert.equal(sound.music, battle);

        // Indoors in a fight, it's as loud and clear as out
        sound.setPlace("smithy");
        assert.deepEqual([sound.music, battle.output.gain.value, battle.filter.frequency.value], [battle, 1, 20000]);

        // Done: what's heard where they are now fades back, where it left off (the town's,
        // through the smithy's walls)
        sound.setBattle(false);
        assert.equal(sound.music, town);
        assert.deepEqual([town.output.gain.value, town.filter.frequency.value, battle.output.gain.value], [PLACES.smithy.level, PLACES.smithy.muffle, 0]);
        assert.equal(town.index, index);

        // Back in a fight, from its start again; in the tavern, the tavern's after it
        sound.setBattle(true);
        assert.deepEqual([battle.start, battle.index], [null, 0]);
        sound.setPlace("taproom");
        sound.setBattle(false);
        assert.equal(sound.music, tavern);

        // In a hell's realms, none: the drone alone
        sound.setPlace("hellBreach");
        sound.setBattle(true);
        assert.notEqual(sound.music, battle);
        assert.equal(battle.output.gain.value, 0);
        sound.close();
    });

    it("starts the music where the player is, if they're in the tavern when the sound starts", async () => {
        await making;

        fakeAudio();

        const sound = new Sound({ fetch: fromDisk });

        sound.recordings = new Map(made.recordings);
        sound.samples = new Map(made.samples);
        sound.setPlace("upstairs");
        sound.unlock();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(sound.music, sound.tracks.tavern);
        assert.deepEqual([sound.tracks.tavern.output.gain.value, sound.tracks.town.output.gain.value, sound.tracks.tavern.filter.frequency.value], [0.4, 0, 650]);
        sound.close();
    });
});

describe("the player's things in their hands, the interface and the cues (handling.js, sound.js)", () => {
    it("hears a piece put on or taken off by what it's made of: cloth, leather, mail or plate; a shield slung, a weapon taken up, a ring's chink", () => {
        for (const [id, piece] of Object.entries(GEAR)) {
            const heard = wearSound({ id });

            assert.ok(heard && RECORDED[heard], `${id}: ${heard}`);

            if (piece.slot === "mainHand") {
                assert.equal(heard, "pickup", id);
            } else if (piece.jewel) {
                assert.equal(heard, "coinPickup", id);
            } else if (piece.slot === "offHand" && id !== "quiver") {
                assert.equal(heard, "shieldSling", id);
            } else {
                assert.ok(["equipCloth", "equipLeather", "equipMail", "equipPlate"].includes(heard), `${id}: worn, by what it's made of`);
            }
        }

        assert.equal(wearSound({ id: "gambeson" }), "equipCloth");
        assert.equal(wearSound({ id: "jerkin" }), "equipLeather");
        assert.equal(wearSound({ id: "mail" }), "equipMail");
        assert.equal(wearSound({ id: "sabatons" }), "equipPlate");

        // (A people's hauberk as their livery has it: an orc's a breastplate, a lizard's a gambeson)
        assert.equal(wearSound({ id: "hauberk", people: "elf" }), "equipMail");
        assert.equal(wearSound({ id: "hauberk", people: "orc" }), "equipPlate");
        assert.equal(wearSound({ id: "hauberk", people: "lizard" }), "equipCloth");
        assert.equal(wearSound({ id: "potion" }), null, "not worn");
    });

    it("hears each thing used as what it is: a tome opened, a scroll unrolled, food eaten, a draught drunk", () => {
        for (const [id, def] of Object.entries(ITEMS)) {
            const heard = useSound(id);

            assert.equal(Boolean(heard), Boolean(def.use), id);
            assert.ok(!heard || RECORDED[heard], `${id}: ${heard} recorded`);
        }

        assert.equal(useSound(Object.keys(ITEMS).find((id) => ITEMS[id].tome)), "bookOpen");
        assert.equal(useSound("scrollOfSafety"), "scroll");
        assert.equal(useSound("meal"), "eat");
        assert.equal(useSound("boarMeat"), "eat");
        assert.equal(useSound("potion"), "potionDrink");
        assert.equal(useSound("ale"), "potionDrink");
        assert.equal(useSound("bandage"), "equipCloth");
        assert.equal(useSound("sword"), null);
    });

    it("plays the interface and the cues gently, all under a blow (\"audible, but barely and not distracting\"), the interface the softest; the recorded wheel, lock, no and slain softer than the made", async () => {
        const interfaces = ["tap", "wheelSelect", "talk", "quickAction"];
        const cues = ["levelUp", "questDone", "newsHeard", "pinSet", "buyDenied"];

        for (const name of [...interfaces, ...cues, ...ITEM_SOUNDS]) {
            assert.ok(RECORDED_ONLY[name] && RECORDED[name], name);
            assert.ok(RECORDED_ONLY[name].volume <= 0.4 && RECORDED_ONLY[name].volume < SOUNDS.slash.volume / 1.5, `${name} at ${RECORDED_ONLY[name].volume}`);
            assert.equal(RECORDED_ONLY[name].bus ?? "effects", "effects", name);
        }

        assert.ok(interfaces.every((name) => RECORDED_ONLY[name].volume <= 0.25), "the interface softest");
        assert.ok(Object.values(RECORDED_ONLY).every(({ volume }) => volume >= RECORDED_ONLY.tap.volume), "a tap softest of all");
        assert.ok(cues.every((name) => !ON_DEMAND.includes(name)) && ITEM_SOUNDS.every((name) => ON_DEMAND.includes(name)), "the cues there from the start, the items' downloaded as the game starts");

        // (The wheel recorded, softer than made)
        const { sound, played } = await started();
        const level = (name) => route(sound, sound.play(name)).gain;
        const recorded = level("wheel");

        sound.recorded.delete("wheel");

        const made = level("wheel");

        assert.ok(Math.abs(recorded / made - (0.18 / SOUNDS.wheel.volume) * (LEVEL / RECORDED_LEVEL)) < 1e-6, `${recorded} recorded against ${made} made`);
        assert.ok(played.length > 0);
        sound.close();
    });
});

describe("keeping the sound going (sound.js)", () => {
    // The music's notes played so far
    const musicOf = (sound, played) => played.filter(({ source }) => Object.values(sound.music.channels).includes(source.outputs[0]?.outputs[0]));

    it("starts again on the next tap when the browser interrupted it (a call, an alarm, the screen locking), suspending it first as Safari needs", async () => {
        const { sound } = await started();
        const context = sound.context;

        assert.equal(sound.playing, true);

        // A tap while it's playing leaves it be
        context.calls.length = 0;
        sound.unlock();
        assert.deepEqual(context.calls, []);

        context.state = "interrupted";
        assert.equal(sound.playing, false);
        sound.unlock();
        assert.deepEqual(context.calls, ["suspend", "resume"]);
        assert.equal(sound.playing, true);

        // Without a tap (coming back to the page), only asked to resume: the browser does when
        // the interruption's over
        context.state = "interrupted";
        context.calls.length = 0;
        sound.wake();
        assert.deepEqual(context.calls, ["resume"]);
        assert.equal(sound.playing, true);
        sound.close();
    });

    it("starts again when the page is shown again, and turned back on, but not while it's hidden or off", async () => {
        const { sound } = await started();
        const context = sound.context;

        sound.setHidden(true);
        assert.equal(context.state, "suspended");
        sound.wake();
        assert.equal(context.state, "suspended", "not while hidden");
        sound.setHidden(false);
        assert.equal(sound.playing, true);

        sound.setEnabled(false);
        context.state = "interrupted";
        sound.unlock();
        assert.equal(context.state, "interrupted", "not while turned off");
        sound.setEnabled(true);
        assert.equal(sound.playing, true);
        sound.close();
    });

    it("notices the browser's clock standing still while it says it's playing, starts it again, and if it's still stuck makes it anew, the music carrying on", async () => {
        const { sound, played } = await started();
        let now = 0;

        sound.now = () => now;

        // The music under way, a few seconds in
        for (let t = 0; t < 5; t += 0.2) {
            sound.context.currentTime = 10 + t;
            now += 200;
            sound.tick();
        }

        const first = sound.context;
        const index = sound.music.index;

        assert.ok(index > 0);

        // The clock stands still: after a moment and a half, started again
        first.calls.length = 0;

        for (let k = 0; k < 9; k++) {
            now += 200;
            sound.tick();
        }

        assert.deepEqual(first.calls, ["suspend", "resume"]);
        assert.equal(sound.context, first);

        // Still stuck: made anew, with every sample, and the music carries on where it was
        const before = played.length;

        for (let k = 0; k < 9; k++) {
            now += 200;
            sound.tick();
        }

        assert.notEqual(sound.context, first);
        assert.equal(first.state, "closed");
        assert.equal(sound.playing, true);
        assert.equal(sound.instruments.size, sampleFiles().length);
        assert.ok(sound.buffers.has("slash"));

        const notes = musicOf(sound, played.slice(before));

        assert.ok(notes.length > 0, "the music plays on");
        assert.ok(sound.music.index >= index, "from where it was, not from the start");
        assert.ok(notes.every(({ when }) => when >= sound.context.currentTime && when <= sound.context.currentTime + 1.6));
        sound.close();
    });

    it("makes the sound anew if the browser closed it", async () => {
        const { sound } = await started();
        const first = sound.context;

        first.state = "closed";
        sound.unlock();
        assert.notEqual(sound.context, first);
        assert.equal(sound.playing, true);
        assert.ok(sound.play("slash"));
        sound.close();
    });

    it("keeps the music playing when one note goes wrong", async () => {
        const { sound, played } = await started();
        const make = sound.context.createBufferSource.bind(sound.context);
        let failed = false;

        // The first note can't be made
        sound.context.createBufferSource = () => {
            if (!failed) {
                failed = true;
                throw new Error("InvalidStateError");
            }

            return make();
        };

        played.length = 0;
        sound.scheduleMusic();
        assert.ok(failed);
        assert.ok(musicOf(sound, played).length > 0, "the rest are played");
        sound.close();
    });

    it("never runs out of sound effects, even when the browser doesn't say they've ended", async () => {
        const { sound } = await started();

        for (let k = 0; k < 24; k++) {
            assert.ok(sound.play("slash"), `sound ${k}`);
        }

        assert.equal(sound.play("slash"), null, "at most 24 at once");

        // (The stand-in never says a sound has ended)
        sound.context.currentTime += 5;
        assert.ok(sound.play("slash"), "once they're over, more play");
        sound.close();
    });
});

// The facts (app/surroundings.js) of every kind of place: indoors, each place; out of doors, every
// land, high or not, by night, at dawn and by day, in the wild and in a town, beside every water,
// a market, a smithy and fires
function everywhere() {
    const times = [DAY.night + HOUR, DAY.dawn + HOUR / 2, DAY.day + HOUR];
    const near = { water: { stream: 0, river: 0, falls: 0, sea: 0, lake: 0 }, market: 0, fire: 0, brazier: 0, smithy: { x: 0, z: 0, far: 0 } };
    const indoors = Object.keys(INDOORS).map((place) => ({ place, time: DAY.day, hearth: 0, heart: 0, forge: { x: 0, z: 0, far: 0 } }));
    const outdoors = BIOMES.flatMap(({ id }) => times.flatMap((time) => [false, true].flatMap((high) => [0, 1].flatMap((settled) => [{ place: "town", land: id, high, time, settled }, { place: "town", land: id, high, time, settled, ...near }]))));

    return [...indoors, ...outdoors];
}

describe("the ambience (ambience.js)", () => {
    const at = (facts) => ambienceOf({ place: "town", time: DAY.day + HOUR, ...facts });

    it("blows the land's own wind: over open land, in the trees, up high; less of it in a town", () => {
        assert.deepEqual(Object.keys(at({ land: "meadow" }).beds), ["windOpen"]);
        assert.deepEqual(Object.keys(at({ land: "woods" }).beds), ["windForest"]);
        assert.deepEqual(Object.keys(at({ land: "meadow", high: true }).beds), ["windHigh"]);
        assert.ok(at({ land: "meadow", settled: 1 }).beds.windOpen === at({ land: "meadow" }).beds.windOpen / 2);
    });

    it("hears water near, louder nearer, and none past its reach", () => {
        const river = (far) => at({ land: "meadow", water: { river: far } }).beds.riverLoop ?? 0;

        assert.ok(river(0) === 1 && river(10) > river(30) && river(30) > 0 && river(70) === 0);
        assert.ok(at({ land: "beach", water: { sea: 20 } }).beds.surfLoop > 0.5 && at({ land: "beach", water: { sea: 20 } }).calls.gull, "the surf, and gulls");
        assert.ok(at({ land: "mountain", water: { stream: 5, falls: 20 } }).beds.waterfallLoop > 0.5);
        assert.ok(at({ land: "meadow", water: { lake: 10 } }).beds.lakeLapping > 0);
    });

    it("sings by the time of day: birds by day, the dawn chorus and the cock at first light, crickets and an owl at night", () => {
        const day = at({ land: "woods" });
        const dawn = at({ land: "woods", time: DAY.dawn + HOUR / 2 });
        const night = at({ land: "woods", time: DAY.night + HOUR });

        assert.ok(day.calls.birdDay && !day.calls.owl && !day.beds.nightLoop && day.calls.creakTree);
        assert.ok(dawn.calls.birdDawn && at({ land: "meadow", settled: 1, time: DAY.dawn + HOUR / 2 }).calls.rooster);
        assert.ok(!night.calls.birdDay && night.calls.owl && night.beds.nightLoop > 0.7);
        assert.ok(at({ land: "marsh", time: DAY.night + HOUR }).beds.frogsLoop, "frogs in the marsh at night");
        assert.ok(!at({ land: "snow", time: DAY.night + HOUR }).beds.nightLoop && !at({ land: "snow" }).calls.birdDay, "none on the snow");
        assert.ok(at({ land: "woods" }).calls.birdDay.often > at({ land: "woods", settled: 1 }).calls.birdDay.often, "fewer in a town");
    });

    it("hears a town's bustle, its market by day, its dogs, hens and horses, a smithy's hammer from the smithy", () => {
        const smithy = { x: 30, z: 40, far: 20 };
        const town = at({ land: "meadow", settled: 1, market: 10, smithy });
        const night = at({ land: "meadow", settled: 1, market: 10, smithy, time: DAY.night + HOUR });

        assert.ok(town.beds.townLoop > night.beds.townLoop && town.beds.marketLoop > 0 && !night.beds.marketLoop);
        assert.ok(town.calls.dogBark && town.calls.chickens && town.calls.horseWhinny);
        assert.deepEqual(town.calls.distantHammer.at, smithy);
        assert.ok(town.calls.distantHammer.muffle, "heard through the air from off");
        assert.ok(!night.calls.distantHammer && !night.calls.chickens && night.calls.dogBark);
        assert.ok(town.wants.includes("churchBell") && town.wants.includes("door"));
        assert.ok(at({ land: "farmland" }).calls.cowMoo && at({ land: "farmland" }).calls.sheepBleat && !at({ land: "woods" }).calls.cowMoo);
    });

    it("hears a fire close by: a camp fire's crackle, a brazier's roar", () => {
        assert.ok(at({ land: "heath", fire: 4 }).beds.campfireLoop > 0.3 && !at({ land: "heath", fire: 20 }).beds.campfireLoop);
        assert.ok(at({ land: "heath", brazier: 2 }).beds.brazierLoop > 0.3);
    });

    it("hears each place indoors its own way, its hearth louder nearer, its folk at work's sounds downloaded", () => {
        const taproom = (hearth) => ambienceOf({ place: "taproom", time: DAY.day, hearth });

        assert.ok(taproom(1).beds.tavernLoop && taproom(1).beds.hearthLoop > taproom(8).beds.hearthLoop);
        assert.deepEqual(Object.keys(taproom(Infinity).beds), ["tavernLoop"]);
        assert.ok(["clink", "pour", "door"].every((name) => taproom(1).wants.includes(name)));
        assert.deepEqual(ambienceOf({ place: "cave", time: DAY.day }).beds, { caveDrips: 1 });
        assert.deepEqual(ambienceOf({ place: "smithy", time: DAY.night }).calls, {}, "no birds indoors");
        assert.ok(ambienceOf({ place: "smithy", time: DAY.day }).wants.includes("anvil"));
        assert.ok(Object.keys(PLACES).every((place) => place === "town" || INDOORS[place]), "every place indoors heard");
    });

    it("hears an ants' nest's close, still earth, its colony murmuring round about and something chittering far off through it, slowed and muffled", () => {
        const nest = ambienceOf({ place: "nest", time: DAY.day });
        const { spiderCall } = nest.calls;

        assert.equal(THEMES.nest.sound, "nest");
        assert.ok(PLACES.nest);
        assert.deepEqual(nest.beds, { cryptLoop: 0.7, caveDrips: 0.25 });
        assert.deepEqual(Object.keys(nest.calls), ["spiderCall"]);
        assert.ok(spiderCall.volume > 0 && spiderCall.often === 1 && spiderCall.away[0] >= 15 && spiderCall.muffle <= 1200 && spiderCall.pitch < 0.8, JSON.stringify(spiderCall));
        assert.equal(nest.murmur, "colonyRustle");
        assert.equal(SOUNDS.colonyRustle.bus, "environment");

        // (Nowhere else murmurs)
        for (const facts of everywhere().filter(({ place }) => place !== "nest")) {
            assert.equal(ambienceOf(facts).murmur, null, facts.place);
        }
    });

    it("hears a hell's realms each its own way: its drone lower the deeper the realm, the Halls' heart, lava hissing, the dead far off, the Hellforge's hammer; none of the world's music", () => {
        const realms = THEMES.hell.realms.map(({ sound }) => sound);
        const hear = (place, facts = {}) => ambienceOf({ place, time: DAY.day, ...facts });

        assert.deepEqual(realms, ["hellBreach", "hellBone", "hellFire", "hellPit"]);

        for (const place of realms) {
            assert.equal(PLACES[place].level, 0, `${place}: no music`);
            assert.ok(hear(place).beds.hellDrone > 0, `${place}'s drone`);
            assert.equal(doorOf(place), null, "through a portal");
        }

        // (Lower each realm down, the Pit's a fifth under the Breach's; a bed slowed is slowed there)
        const drones = realms.map((place) => hear(place).rates.hellDrone);

        assert.ok(drones.every((rate, k) => k === 0 || rate < drones[k - 1]), drones.join());
        assert.equal(drones[0], 1);
        assert.ok(Math.abs(drones[3] - 2 ** (-7 / 12)) < 1e-3);

        for (const place of realms) {
            const { beds, rates } = hear(place);

            assert.ok(Object.entries(rates).every(([name, rate]) => beds[name] && rate > 0 && rate <= 1), place);
        }

        // (The Halls' heart, heard all through them, louder nearer it; nowhere else)
        const heart = (far) => hear("hellBone", { heart: far }).beds.heartbeat;

        assert.ok(heart(0) === INDOORS.hellBone.heart && heart(5) > heart(20) && heart(20) > heart(Infinity));
        assert.equal(heart(Infinity), HELL.heart.through * INDOORS.hellBone.heart);
        assert.ok(realms.filter((place) => place !== "hellBone").every((place) => !hear(place, { heart: 0 }).beds.heartbeat));

        // (The Hellforge's hammer in the River of Fire, from the forge: muffled through the rock,
        // slowed, louder nearer it; none without a forge, or in the other realms)
        const forge = (far) => hear("hellFire", { forge: { x: 4, z: 5, far } }).calls.distantHammer;

        assert.deepEqual(forge(10).at, { x: 4, z: 5, far: 10 });
        assert.ok(forge(10).volume > forge(40).volume && forge(10).muffle <= 1000 && forge(10).pitch < 0.8 && forge(10).often === 1);
        assert.ok(!hear("hellFire").calls.distantHammer && !forge(100));
        assert.ok(realms.filter((place) => place !== "hellFire").every((place) => !hear(place, { forge: { x: 0, z: 0, far: 0 } }).calls.distantHammer));

        // (Lava hissing close by in the Breach and the River of Fire; the dead groaning and
        // wailing far off through the rock in the Halls and the Pit, lower, muffled)
        assert.ok(hear("hellBreach").calls.slimeSizzle && hear("hellFire").calls.slimeSizzle && !hear("hellPit").calls.slimeSizzle);

        for (const place of ["hellBone", "hellPit"]) {
            const { ghostCall, wightCall } = hear(place).calls;

            assert.ok([ghostCall, wightCall].every((call) => call.volume > 0 && call.away[0] >= 15 && call.muffle <= 1500 && call.pitch < 1), place);
        }
    });

    it("hears each building's door: a keep's heavy one, a ruin's iron gate, a crypt's trapdoor, none into a cave or an ants' nest", () => {
        assert.equal(doorOf("taproom"), "door");
        assert.equal(doorOf("keep"), "doorHeavy");
        assert.equal(doorOf("temple"), "doorHeavy");
        assert.equal(doorOf("ruin"), "gate");
        assert.equal(doorOf("crypt"), "trapdoor");
        assert.equal(doorOf("cave"), null);
        assert.equal(doorOf("nest"), null);
    });

    it("rings a church's bell at the hours of prayer, once as each comes", () => {
        assert.ok(tolled(5.9 * HOUR, 6.1 * HOUR));
        assert.ok(!tolled(6.1 * HOUR, 6.4 * HOUR));
        assert.ok(!tolled(23.9 * HOUR, 0.1 * HOUR) && tolled(17.5 * HOUR, 0.5 * HOUR), "round midnight");
        assert.deepEqual(TOLLS.hours, [6, 9, 12, 15, 18]);
    });

    it("names only recorded sounds, downloaded where they're heard, or beds made in code: each bed a loop on the environment's bus, each call a sound of its own", () => {
        for (const facts of everywhere()) {
            const { beds, calls, wants } = ambienceOf(facts);

            // (Or one made in code, made once it's wanted: synth.js BEDS)
            for (const name of Object.keys(beds)) {
                assert.ok((RECORDED[name]?.[0].loop && RECORDED_ONLY[name]?.bus === "environment" && ON_DEMAND.includes(name)) || BEDS[name], name);
                assert.ok(beds[name] > 0 && beds[name] <= 1.1, `${name}: ${beds[name]}`);
            }

            for (const [name, call] of Object.entries(calls)) {
                assert.ok(CALLS[name] && RECORDED[name] && ON_DEMAND.includes(name) && call.volume > 0 && call.often > 0, name);
            }

            assert.ok(wants.every((name) => RECORDED[name]), wants.join());
        }
    });
});

describe("the ambience played (sound.js setAmbience)", () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("loops a bed once it's in, each copy crossfading into the next (equal power), as loud as it's asked; the made wind until a recorded one blows", async () => {
        const { sound, played: all } = await started();
        const [length, crossfade] = RECORDED.windOpen[0].loop;
        // (The bed's copies, not the music's notes)
        const played = { get list() { return all.filter(({ source }) => sound.recorded.get("windOpen")?.includes(source.buffer)); } };

        sound.setAmbient(true);
        assert.ok(sound.wind && sound.wind.level.gain.value === 0.2, "the made wind blowing");
        sound.setAmbience({ beds: { windOpen: 0.8 } });
        assert.ok(sound.wanted.has("windOpen") && !sound.beds.get("windOpen").level, "asked for; nothing till it's in");

        await sound.want("windOpen");
        await tick();
        sound.tick();

        const bed = sound.beds.get("windOpen");
        const [first] = played.list;

        assert.equal(played.list.length, 1);
        assert.ok(sound.recorded.get("windOpen").includes(first.source.buffer));
        assert.ok(Math.abs(bed.level.gain.value - 0.8 * RECORDED_ONLY.windOpen.volume * (LEVEL / RECORDED_LEVEL)) < 1e-9, "as loud as asked");
        assert.equal(sound.wind.level.gain.value, 0, "the made wind gone");

        // (Its copy fading out over the crossfade at the loop's end, and stopped after it)
        const envelope = first.source.outputs[0];

        assert.equal(envelope.gain.curves.length, 1);
        assert.ok(Math.abs(envelope.gain.curves[0].at - (first.when + length)) < 1e-9 && envelope.gain.curves[0].duration === crossfade);
        assert.ok(Math.abs(first.source.stopped - (first.when + length + crossfade)) < 1e-9);

        // (Not started again till the next's near: then fading in as the first fades out)
        sound.tick();
        assert.equal(played.list.length, 1);
        sound.context.currentTime = first.when + length - 1;
        sound.tick();
        assert.equal(played.list.length, 2);

        const next = played.list[1];
        const [rise, fall] = next.source.outputs[0].gain.curves;

        assert.ok(Math.abs(next.when - (first.when + length)) < 1e-9);
        assert.ok(Math.abs(rise.at - next.when) < 1e-9 && rise.duration === crossfade && Math.abs(fall.at - (next.when + length)) < 1e-9);

        // (Equal power: the two together as loud as either, all through the crossfade)
        for (let k = 0; k < rise.curve.length; k++) {
            assert.ok(Math.abs(rise.curve[k] ** 2 + envelope.gain.curves[0].curve[k] ** 2 - 1) < 1e-6);
        }

        sound.close();
    });

    it("fades a bed out when it's not heard, stops it, and in a while lets its recording go, decoded again from its MP3 if it's wanted again", async () => {
        const fetched = [];
        const { sound, played } = await started({ fetch: noting(fetched) });

        sound.setAmbience({ beds: { caveDrips: 1 } });
        await sound.want("caveDrips");
        await tick();
        sound.tick();

        const copy = played.find(({ source }) => sound.recorded.get("caveDrips").includes(source.buffer)).source;

        sound.setAmbience({ beds: { cryptLoop: 0.5 } });
        assert.equal(sound.beds.get("caveDrips").level.gain.value, 0, "fading out");
        assert.ok(sound.wanted.has("cryptLoop"));
        sound.context.currentTime += 3;
        sound.tick();
        assert.ok(copy.stopped !== undefined && !sound.beds.get("caveDrips").level, "stopped once it's faded");
        assert.ok(sound.recorded.has("caveDrips"), "kept a while, should it come back");

        sound.context.currentTime += 61;
        sound.tick();
        assert.ok(!sound.beds.has("caveDrips") && !sound.recorded.has("caveDrips") && !sound.decoded.has("caveDrips"), "let go of");
        assert.ok(sound.mp3s.get("caveDrips")?.every(Boolean) && sound.wanted.has("caveDrips"), "its MP3 kept");

        // (Heard again: decoded again from it, not downloaded, and looped)
        fetched.length = 0;
        sound.setAmbience({ beds: { caveDrips: 1 } });
        await tick();
        sound.tick();
        assert.ok(sound.recorded.has("caveDrips") && sound.beds.get("caveDrips").level, "heard again");
        assert.deepEqual(fetched, []);
        sound.close();
    });

    it("makes a made bed once it's wanted (here on the page, with no worker), loops it whole as loud as it's asked, slides it to a new rate, and forgets it a while after it's silent", async () => {
        const { sound, played } = await started();
        const drones = () => played.filter(({ source }) => sound.buffers.get("hellDrone")?.includes(source.buffer));

        sound.setAmbience({ beds: { hellDrone: 0.8 }, rates: { hellDrone: 0.9 } });
        assert.ok(!sound.buffers.has("hellDrone") && !sound.wanted.has("hellDrone"), "made, not downloaded");
        sound.tick();
        assert.ok(sound.making.has("hellDrone"), "being made");
        sound.tick();
        await tick();
        sound.tick();

        const bed = sound.beds.get("hellDrone");
        const [looped] = drones().map(({ source }) => source);

        assert.equal(drones().length, 1, "one copy, looped");
        assert.ok(looped.loop && looped.buffer.duration === 8 && looped.playbackRate.value === 0.9);
        assert.ok(Math.abs(bed.level.gain.value - 0.8 * BEDS.hellDrone.volume) < 1e-9, "as loud as asked");
        assert.equal(route(sound, looped).bus, "environment");

        // (Its loop needs no next copy; down another realm, sliding lower)
        sound.context.currentTime += 30;
        sound.tick();
        assert.equal(drones().length, 1);
        sound.setAmbience({ beds: { hellDrone: 1 }, rates: { hellDrone: 0.667 } });
        assert.equal(looped.playbackRate.value, 0.667);
        assert.equal(drones().length, 1, "the same one, slid down");

        // (Silent: stopped once it's faded, forgotten a minute on, made again if it's wanted again)
        sound.setAmbience({});
        sound.context.currentTime += 3;
        sound.tick();
        assert.ok(looped.stopped !== undefined && !sound.beds.get("hellDrone").level);
        sound.context.currentTime += 61;
        sound.tick();
        assert.ok(!sound.beds.has("hellDrone") && !sound.buffers.has("hellDrone"), "let go of");
        sound.setAmbience({ beds: { hellDrone: 1 } });
        sound.tick();
        await tick();
        sound.tick();
        assert.equal(drones().length, 1, "made again, and looped");
        assert.equal(drones()[0].source.playbackRate.value, 1);
        sound.close();
    });

    it("plays a recorded bed slower and lower where it's asked, each copy at its rate, its loop and crossfade the longer", async () => {
        const { sound, played } = await started();
        const [length, crossfade] = RECORDED.cryptLoop[0].loop;
        const copies = () => played.filter(({ source }) => sound.recorded.get("cryptLoop")?.includes(source.buffer));

        sound.setAmbience({ beds: { cryptLoop: 0.6 }, rates: { cryptLoop: 0.8 } });
        await sound.want("cryptLoop");
        await tick();
        sound.tick();

        const [first] = copies();
        const [fall] = first.source.outputs[0].gain.curves;

        assert.equal(first.source.playbackRate.value, 0.8);
        assert.ok(Math.abs(fall.at - (first.when + length / 0.8)) < 1e-9 && Math.abs(fall.duration - crossfade / 0.8) < 1e-9);
        assert.ok(Math.abs(first.source.stopped - (first.when + (length + crossfade) / 0.8)) < 1e-9);

        // (The next copy, as it's asked now)
        sound.setAmbience({ beds: { cryptLoop: 0.6 } });
        sound.context.currentTime = first.when + length / 0.8 - 1;
        sound.tick();
        assert.equal(copies().length, 2);
        assert.ok(Math.abs(copies()[1].when - (first.when + length / 0.8)) < 1e-9);
        assert.equal(copies()[1].source.playbackRate.value, 1);
        sound.close();
    });

    it("calls now and then from round about, on the environment's bus, a made bird singing in a recorded one's place till it's in", async () => {
        const { sound, played } = await started();

        const birds = () => played.filter(({ source }) => sound.buffers.get("bird").includes(source.buffer));

        sound.setPaused(false);
        sound.setListener(100, 100);
        sound.setAmbience({ calls: { birdDay: { ...CALLS.birdDay, volume: 1, often: 1 } } });
        sound.recorded.delete("birdDay");
        sound.update(CALLS.birdDay.every[1] + 0.1);
        assert.equal(birds().length, 1, "heard once in its wait, the made bird meanwhile");
        assert.equal(route(sound, birds()[0].source).bus, "environment");
        assert.ok(sound.due.get("birdDay") >= CALLS.birdDay.every[0] && sound.due.get("birdDay") <= CALLS.birdDay.every[1], "and again in a while");

        // (A call no longer heard there: not heard again)
        sound.setAmbience({});
        sound.update(60);
        assert.equal(birds().length, 1);
        sound.close();
    });

    it("calls slowed where a call says so: something chittering far off in an ants' nest", async () => {
        const { sound } = await started();
        const { pitch } = CALLS.spiderCall;

        const asked = [];
        const play = sound.play.bind(sound);

        sound.play = (name, options) => (asked.push({ name, ...options }), play(name, options));
        sound.setPaused(false);
        sound.setListener(100, 100);
        sound.setAmbience({ calls: { spiderCall: { ...CALLS.spiderCall, volume: 1, often: 1 } } });
        sound.update(CALLS.spiderCall.every[1] + 0.1);

        const [chitter] = asked.filter(({ name }) => name === "spiderCall");

        assert.ok(chitter.rate >= pitch * 0.94 - 1e-9 && chitter.rate <= pitch * 1.06 + 1e-9, `at ${chitter.rate}`);
        assert.equal(chitter.muffle, CALLS.spiderCall.muffle);
        assert.ok(Math.hypot(chitter.at.x - 100, chitter.at.z - 100) >= CALLS.spiderCall.away[0] - 1e-9);
        sound.close();
    });

    it("murmurs an ants' nest's colony over and over from round about, each overlapping the last, on the environment's bus; and stops once out of it", async () => {
        const { sound, played } = await started();
        const murmurs = () => played.filter(({ source }) => sound.buffers.get("colonyRustle").includes(source.buffer));
        // (Along its way out, muffled on the way: the first pan it's through, and the bus it ends on)
        const along = (source) => {
            const way = [];

            for (let node = source; node; node = node.outputs?.[0]) {
                way.push(node);
            }

            return way;
        };
        const busOf = (source) => along(source).map((node) => Object.entries(sound.buses).find(([, gain]) => gain === node)?.[0]).find(Boolean);
        const panOf = (source) => along(source).find((node) => node.pan)?.pan.value ?? 0;

        sound.setPaused(false);
        sound.setListener(100, 100);
        sound.setAmbience({ murmur: "colonyRustle" });

        for (let t = 0; t < 30; t += 0.1) {
            sound.update(0.1);
        }

        const heard = murmurs().length;

        assert.ok(heard >= 30 / MURMUR.every[1] - 1 && heard <= 30 / MURMUR.every[0] + 1, `${heard} in 30 s`);
        assert.ok(sound.buffers.get("colonyRustle").every(({ duration }) => duration > MURMUR.every[1]), "each longer than the longest wait");
        assert.ok(murmurs().every(({ source }) => busOf(source) === "environment"));

        // (From all round: to the left and to the right)
        const pans = murmurs().map(({ source }) => panOf(source));

        assert.ok(pans.some((pan) => pan < -0.2) && pans.some((pan) => pan > 0.2), pans.map((pan) => pan.toFixed(2)).join());

        sound.setAmbience({});
        sound.update(10);
        assert.equal(murmurs().length, heard);
        sound.close();
    });
});

describe("the recorded sounds kept decoded to a budget (sound.js DECODED_BUDGET)", () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    // What's held (bytes): by a sound decoded (here, a sample for each byte of its MP3s), by all
    // of them, and by any of the sound's kept copies
    const held = (sound, name) => (sound.decoded.get(name) ?? []).reduce((bytes, buffer) => bytes + buffer.length * buffer.numberOfChannels * 4, 0);
    const decoded = (sound) => [...sound.decoded.keys()].reduce((bytes, name) => bytes + held(sound, name), 0);
    const bytes = (kept) => [...kept.values()].flat().reduce((sum, each) => sum + (each.byteLength ?? each.length * each.numberOfChannels * 4), 0);

    // A spell's sound decoded, before it's downloaded (from its MP3s on disk)
    const sizeOf = async (name) => (await Promise.all(recordedFiles([name]).map(([, url]) => readFile(url)))).reduce((sum, mp3) => sum + mp3.byteLength * 4, 0);

    it("keeps less on a touch screen than on a computer, and past it lets go of the sounds played least lately, their MP3s kept", async () => {
        assert.ok(DECODED_BUDGET.touch < DECODED_BUDGET.other);
        assert.equal(new Sound().budget, DECODED_BUDGET.other);

        try {
            globalThis.matchMedia = (query) => ({ matches: query === "(pointer: coarse)" });
            assert.equal(new Sound().budget, DECODED_BUDGET.touch, "on a phone");
        } finally {
            delete globalThis.matchMedia;
        }

        const { sound } = await started();

        // Played one after another, and done
        for (const name of ["stepGrass", "stepStone", "stepDirt"]) {
            assert.ok(sound.play(name));
        }

        sound.context.currentTime += 5;

        // A spell's sound decoded, with room for it and the last two played only
        sound.budget = held(sound, "stepStone") + held(sound, "stepDirt") + (await sizeOf("castFireLow"));
        await sound.want("castFireLow");
        await tick();
        assert.deepEqual([...sound.decoded.keys()].sort(), ["castFireLow", "stepDirt", "stepStone"], "the rest let go of, the footstep played first with them");
        assert.ok(decoded(sound) <= sound.budget);
        assert.ok(!sound.recorded.has("stepGrass") && !sound.recorded.has("slash"));
        assert.equal(sound.mp3s.get("stepGrass").filter(Boolean).length, RECORDED.stepGrass.length, "its MP3s kept");
        assert.equal(sound.mp3s.size, Object.keys(RECORDED).filter((name) => !ON_DEMAND.includes(name)).length + 1, "and every other's");
        sound.close();
    });

    it("never lets go of a sound playing: a bed heard, or fading out; a sound not done", async () => {
        const { sound } = await started();

        sound.setAmbience({ beds: { caveDrips: 1 } });
        await sound.want("caveDrips");
        await tick();
        sound.tick();
        assert.ok(sound.beds.get("caveDrips").level, "looping");
        assert.ok(sound.play("stepGrass"), "a footstep sounding");

        // Past a budget of nothing, everything else let go of (but the spell's just decoded)
        sound.budget = 0;
        await sound.want("castFireLow");
        await tick();
        assert.deepEqual([...sound.decoded.keys()].sort(), ["castFireLow", "caveDrips", "stepGrass"]);

        // Fading out, still not
        sound.setAmbience({});
        await sound.want("castFireMid");
        await tick();
        assert.deepEqual([...sound.decoded.keys()].sort(), ["castFireMid", "caveDrips", "stepGrass"]);

        // Faded out and stopped, and the footstep done: let go of as the next is decoded
        sound.context.currentTime += 3;
        sound.tick();
        assert.ok(!sound.beds.get("caveDrips").level);
        await sound.want("castFireHigh");
        await tick();
        assert.deepEqual([...sound.decoded.keys()], ["castFireHigh"]);
        sound.close();
    });

    it("plays a sound let go of as before it was in (its made one, or what stands in for it), and decodes it again from its MP3, not downloading it again", async () => {
        const fetched = [];
        const { sound, played } = await started({ fetch: noting(fetched) });

        sound.budget = 0;
        await sound.want("castFireLow");
        await tick();
        assert.ok(!sound.recorded.has("stepGrass") && !sound.recorded.has("clash"));

        sound.budget = Infinity;
        fetched.length = 0;
        played.length = 0;
        sound.play("stepGrass");
        sound.play("clash");
        assert.ok(sound.buffers.get("stepGrass").includes(played[0].source.buffer), "the made footstep meanwhile");
        assert.ok(sound.buffers.get("block").includes(played[1].source.buffer), "a recorded-only one's stand-in");

        await tick();
        assert.equal(sound.recorded.get("stepGrass")?.length, RECORDED.stepGrass.length, "decoded again");
        assert.equal(sound.recorded.get("clash")?.length, RECORDED.clash.length);
        assert.deepEqual(fetched, [], "from its MP3s");

        played.length = 0;
        sound.play("stepGrass");
        assert.ok(sound.recorded.get("stepGrass").includes(played[0].source.buffer), "then its recording again");
        sound.close();
    });

    it("counts the MP3s it keeps in what it holds, with what's decoded", async () => {
        const { sound } = await started();
        const mp3s = bytes(sound.mp3s);
        const was = bytes(sound.decoded);

        assert.ok(mp3s > 0 && sound.recordings.size === 0, "kept once they're decoded");
        assert.equal(sound.memory(), bytes(sound.buffers) + bytes(sound.instruments) + was + mp3s);

        // (Let go of, what's decoded is less, and the MP3s are all still counted)
        sound.budget = 0;
        await sound.want("castFireLow");
        await tick();
        assert.ok(bytes(sound.decoded) < was / 4 && bytes(sound.mp3s) > mp3s);
        assert.equal(sound.memory(), bytes(sound.buffers) + bytes(sound.instruments) + bytes(sound.decoded) + bytes(sound.mp3s));
        sound.close();
    });
});
