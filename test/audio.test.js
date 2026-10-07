// The game's sounds (client/js/audio): made in code (synth.js) or recorded (recorded.js), played
// from where they happen (sound.js), and each described for the sound studio (catalog.js)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { CATALOG, GROUPS, LOOPS, MUSIC } from "../client/js/audio/catalog.js";
import { pluck } from "../client/js/audio/dsp.js";
import { sampleFiles } from "../client/js/audio/instruments.js";
import { SURFACES } from "../client/js/audio/footing.js";
import { ON_DEMAND, RECORDED, RECORDED_LEVEL, SOURCES } from "../client/js/audio/recorded.js";
import { ARMOUR, BUSES, CREATURE_VOICES, creatureSounds, FOOTSTEPS, GAITS, gainOf, PLACES, RECORDED_ONLY, recordedFiles, Sound, spellSounds, VOLUME_DEFAULTS } from "../client/js/audio/sound.js";
import { SCORE } from "../client/js/audio/score.js";
import { LEVEL, loudness, PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "../client/js/audio/synth.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { createRandom } from "../client/js/core/random.js";
import { SPELLS } from "../client/js/core/spells.js";
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

    it("puts every sound on the effects bus but for the town's and the tavern's: birds, leaves and the hearth crackling", () => {
        for (const [name, sound] of Object.entries(SOUNDS)) {
            assert.equal(sound.bus ?? "effects", ["bird", "leaves", "crackle"].includes(name) ? "environment" : "effects", name);
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
    const param = (value) => ({ value, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });

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
                stop() {},
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
        assert.deepEqual(Object.keys(LOOPS), ["wind"]);
        assert.deepEqual(Object.keys(MUSIC).sort(), Object.keys(PLACES).sort(), "the music in every place");
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
        for (const [name, { volume, instead }] of Object.entries(RECORDED_ONLY)) {
            assert.ok(RECORDED[name]?.length >= 2 && !SOUNDS[name], name);
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

    it("plays footsteps barely heard, everyone's alike, well under the blows: walking about a fourteenth of a slash, running about a ninth", () => {
        const sound = new Sound({ fetch: fromDisk, enabled: false });
        const heard = [];

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
        assert.equal(spellSounds("renewal").land, "impactHealingMid");
        assert.equal(spellSounds("astralHeal").cast, "castHealingHigh", "healing's fifth its greatest");
        assert.deepEqual(spellSounds("stun"), { cast: "bolt", missile: null, land: null }, "the made stun kept, heard as it stuns");
        assert.equal(spellSounds("resistFire").land, "ward");
        assert.equal(spellSounds("curePoison").cast, "castHealingLow", "a friend's or one's own tome spell cast with a healing's swell");
        assert.equal(spellSounds("teleport").land, null, "carried off: heard going and coming");

        // (Every sound downloaded once it's wanted used: the spells', and the creatures' and the
        // player's breath)
        const used = new Set([...Object.keys(SPELLS).flatMap((id) => Object.values(spellSounds(id))), "teleportIn", "fizzle", "spellCircle", "fire", "arcane", ...Object.keys(CREATURES).flatMap(creatureSounds), "breath"]);

        assert.deepEqual(ON_DEMAND.filter((name) => !used.has(name)), []);
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

    it("voices the wild's creatures: their family's at their own pitch, an attack loudest as it lands, a call heard furthest, what's heard with it, a dragon's own fire", async () => {
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
