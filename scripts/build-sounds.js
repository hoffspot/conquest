// Makes the game's recorded sounds (client/sounds, listed in client/js/audio/recorded.js), played
// instead of synth.js's made ones of the same names once they're downloaded (or with none made,
// on their own), all CC0 or public domain (https://creativecommons.org/publicdomain/zero/1.0/),
// each source's page saying so (checked 2026-10-07):
//
// - Footsteps on each footing (audio/footing.js SURFACES), cut from recordings by Nox_Sound on
//   Freesound: one recordist throughout, mostly in soft-soled mountain boots (no heel's click),
//   close and dry, so every footing sounds like the same walker (STEPS, below).
// - The weapons', armour's and bodies' sounds (scripts/sounds/weapons.js): each a recipe of cuts
//   of recordings, from Freesound, OpenGameArt's packs (Still North Media's, Jan Schupke's) and
//   Kenney's, made by scripts/sounds/render.js.
// - The spells' (scripts/sounds/spells.js): each school's casts, landings and missiles, tier by
//   tier, the arcane bolt and hit, and the tome spells, the same way, from Freesound, the VCSL's
//   percussion, OpenGameArt's packs, lentikula's on itch.io and the National Park Service's
//   Yellowstone recordings. Downloaded by the game only once they're wanted (ON_DEMAND).
// - The creatures' (scripts/sounds/creatures.js): each family's call, attack, hurt and death, wings,
//   fire breath, falls and the player's breath, the same way, from Freesound, OpenGameArt's packs
//   and the National Park Service's. Downloaded only once they're wanted, too.
// - The ambience (scripts/sounds/ambience.js): beds that loop (wind, water, night, rooms) and the
//   world's one-shots (birds, beasts of the farm, bells, folk at work, doors), each one cut of one
//   recording at its own gain, from Freesound, the NPS's and the VCSL's; downloaded as they're
//   wanted where the player is.
// - The items', the interface's and the cues' (scripts/sounds/items.js): coins, things picked up,
//   put on, drunk, read and opened; the wheel's ticks, taps and talk; the cues in the music's
//   key. The interface's and the cues' downloaded at the start, the items' once wanted (its
//   ON_DEMAND), from Freesound, OpenGameArt's packs, Kenney's and the VCSL's.
//
//   npm run build:sounds
//   npm run build:sounds -- kaijuCall kaijuStep    (only these made again)
//
// Each recording is downloaded once (into .cache: Freesound's public previews, MP3s, as the
// originals need a login; a pack's archive whole), made mono, its rumble taken away (both ways,
// so nothing's shifted), and each sound cut from it where it starts to where it's died away
// (picked by ear and eye for being alike, clean, and on the beat). Each is faded in and out, made
// as loud as the rest (LEVEL, by its loudest 30 ms, as synth.js's are), and saved as an MP3 named
// for what's in it, so browsers and the service worker can keep them for good. Named, only those
// sounds are made again, from only their recordings: the rest are kept as recorded.js has them
// (each must be there already), so a few can be added or changed without downloading the rest.
//
// The game decodes each at a lower rate than its MP3's, as much as its sound needs (DECODED,
// written into recorded.js as RECORDED_RATES). Every sound, made now or kept, is checked against
// its rate before the list's written: it stops at one with more above half that rate than goes
// unheard (UNHEARD).

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Mp3Encoder } from "@breezystack/lamejs";
import { MPEGDecoder } from "mpg123-decoder";
import { loudness } from "../client/js/audio/dsp.js";
import { decode, fetchSource } from "./sounds/sources.js";
import { prepare, render } from "./sounds/render.js";
import * as ambience from "./sounds/ambience.js";
import * as creatures from "./sounds/creatures.js";
import * as items from "./sounds/items.js";
import * as spells from "./sounds/spells.js";
import * as weapons from "./sounds/weapons.js";

const CACHE = new URL("../.cache/freesound/", import.meta.url);
const OUT = new URL("../client/sounds/", import.meta.url);
const LIST = new URL("../client/js/audio/recorded.js", import.meta.url);

// The recordings' and the sounds' rate (Hz), and the MP3s' bit rate (kb/s)
const RATE = 48000;
const BITRATE = 64;

/**
 * How loud each sound's made (its loudest 30 ms, as RMS: about −20 dBFS), and the loudest a
 * sample may be (−1 dBFS). A footfall's sharp start is far louder than the rest of it, so these
 * sit lower than synth.js's (sound.js plays them up to match).
 */
export const LEVEL = 0.1;
const PEAK = 0.89;

// Rumble taken away under this (Hz), and fades in and out (s)
const HIGHPASS = 40;
const FADE_IN = 0.002;
const FADE_OUT = 0.015;

/**
 * The rate the game decodes each recorded sound at (Hz), written into recorded.js for it
 * (RECORDED_RATES; sound.js #decodeData): a bed (one that loops) and any other. Lower than the
 * MP3s' own, because the encoder cuts the top off what it's given: a bed's, at 48 kb/s, comes out
 * a 32 kHz MP3 with nothing above 12 kHz (−104 dB of it, in every one), and the rest, at 64 kb/s,
 * 48 kHz MP3s with nothing above 18 kHz (−71 dB at most; mail hits and snakes' hisses have real
 * sound between 16 and 17 kHz, so 32 kHz would lose some). Decoded at 24 and 36 kHz they hold
 * a quarter less (32-bit samples: all of them decoded 236 MB, then 177) and sound the same. Every
 * sound made here is checked against its rate (unheard).
 */
export const DECODED = Object.freeze({ bed: 24000, sound: 36000 });

/**
 * What counts as nothing: the most of a sound's energy there may be above half the rate it's
 * decoded at (dB, of all of it) for none of it to be missed.
 */
export const UNHEARD = -60;

// The Fourier transform of `re` and `im` (as long as a power of two), in place
function fft(re, im) {
    const n = re.length;

    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;

        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }

        j ^= bit;

        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }

    for (let size = 2; size <= n; size <<= 1) {
        const angle = (-2 * Math.PI) / size;
        const [wr, wi] = [Math.cos(angle), Math.sin(angle)];

        for (let i = 0; i < n; i += size) {
            let [cr, ci] = [1, 0];

            for (let k = 0; k < size / 2; k++) {
                const [a, b] = [i + k, i + k + size / 2];
                const [xr, xi] = [re[b] * cr - im[b] * ci, re[b] * ci + im[b] * cr];

                re[b] = re[a] - xr;
                im[b] = im[a] - xi;
                re[a] += xr;
                im[a] += xi;
                [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
            }
        }
    }
}

/**
 * How much of a sound is above `hz`: its energy above there as a share of all its energy, in dB
 * (0: all of it; −100 and under: nothing). Its spectrum is summed over windows of 4096 samples,
 * each half over the last (Welch's way, Hann windows).
 *
 * @param {Float32Array|Float64Array} samples - The sound, mono.
 * @param {number} rate - Its sample rate (Hz).
 * @param {number} hz - Above where.
 */
export function above(samples, rate, hz) {
    const size = 4096;
    const power = new Float64Array(size / 2);

    for (let at = 0; at === 0 || at + size / 2 < samples.length; at += size / 2) {
        const re = new Float64Array(size);
        const im = new Float64Array(size);

        for (let n = 0; n < size && at + n < samples.length; n++) {
            re[n] = samples[at + n] * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / size));
        }

        fft(re, im);

        for (let k = 0; k < size / 2; k++) {
            power[k] += re[k] * re[k] + im[k] * im[k];
        }
    }

    const all = power.reduce((sum, each) => sum + each, 0) || 1e-30;
    const over = power.subarray(Math.ceil(hz / (rate / size))).reduce((sum, each) => sum + each, 0);

    return 10 * Math.log10(over / all + 1e-30);
}

/**
 * An MP3 the game's to decode at `decoded` Hz, checked: how much of it is above half that rate
 * (dB: above). Throws, naming it, if that's more than UNHEARD: decoded so, some of it would go.
 * (`decoder`: an MPEGDecoder to decode it with, if there's one to hand: one's made if not.)
 */
export async function unheard(mp3, decoded, name, decoder = null) {
    const mine = decoder ?? new MPEGDecoder();

    await mine.ready;
    await mine.reset();

    const { channelData, sampleRate } = mine.decode(new Uint8Array(mp3));

    if (!decoder) {
        mine.free();
    }

    const over = sampleRate > decoded ? above(channelData[0], sampleRate, decoded / 2) : -Infinity;

    if (over > UNHEARD) {
        throw new Error(`${name}: ${over.toFixed(1)} dB of it is above ${decoded / 2000} kHz, more than goes unheard (${UNHEARD} dB): decoded at ${decoded / 1000} kHz (DECODED) it would be lost. Give it less up there, or raise the rate for all of its kind`);
    }

    return over;
}

// The recorded sounds made from recipes (scripts/sounds), by what they are; and those the game
// downloads only once they're wanted (sound.js want), not at the start: the spells', the
// creatures' and the ambience's, many, and big once decoded, each heard only by those who cast
// it, meet them or come there; and an area's own that are (its ON_DEMAND: the items')
const AREAS = { weapons, spells, creatures, ambience, items };
const ON_DEMAND = new Set([spells, creatures, ambience]);

// The footsteps' recordings, by Freesound id: by Nox_Sound, CC0, each https://freesound.org/s/<id>/
const RECORDINGS = {
    490951: { name: "Footsteps_Walk.wav", preview: "490/490951_9250976-hq.mp3" },
    496420: { name: "Footsteps_Leaves_Stereo.wav", preview: "496/496420_9250976-hq.mp3" },
    530384: { name: "Footsteps_Boots_Gritty_Ground_Stones_Leaves_Mono.wav", preview: "530/530384_9250976-hq.mp3" },
    543685: { name: "Footsteps_Wood_Walk_Mono.wav", preview: "543/543685_9250976-hq.mp3" },
    548384: { name: "Footsteps_Mountain_Boots_Mud_Mono.wav", preview: "548/548384_9250976-hq.mp3" },
    556002: { name: "Footsteps_Mountain_Boots_Gravel_Mono.wav", preview: "556/556002_9250976-hq.mp3" },
    556042: { name: "Footsteps_Mountain_Boots_Grass_Mono.wav", preview: "556/556042_9250976-hq.mp3" },
    558472: { name: "Footsteps_Mountain_Boots_Rock_Walk_Sequence_Mono.wav", preview: "558/558472_9250976-hq.mp3" },
    564893: { name: "Footsteps_Mountain_Boots_Wet_Sand_Sequence_Mono.wav", preview: "564/564893_9250976-hq.mp3" },
    613849: { name: "Footsteps_Mountain_Boots_Snow_Walk_Mono.wav", preview: "613/613849_9250976-hq.mp3" },
};

/**
 * Each footing's footfalls: [recording, from, to (samples at 48 kHz), fade out (ms) if not
 * FADE_OUT's]. Grass, gravel, mud, wet sand and snow in mountain boots; stone on rock outdoors;
 * dirt on a dirty ground and gritty stones; wood on a wooden floor (trainers and mountain boots:
 * both soft rubber soles); leaves on dry leaf litter; water wading at an average depth, its slosh
 * longer than a footfall's and faded out over 150 ms.
 */
const STEPS = {
    grass: [[556042, 51780, 78372], [556042, 409728, 435384], [556042, 597780, 620076], [556042, 699468, 725580], [556042, 806760, 828480], [556042, 853332, 879492]],
    dirt: [[490951, 216, 13848], [490951, 47976, 62880], [490951, 96000, 110664], [490951, 143940, 157980], [490951, 191004, 203556], [530384, 146916, 165540]],
    stone: [[558472, 89172, 104124], [558472, 180096, 195792], [558472, 269928, 285912], [558472, 445668, 464604], [558472, 493152, 511344], [558472, 676212, 693228]],
    wood: [[543685, 276, 16428], [543685, 48252, 63012], [543685, 90348, 105060], [543685, 1019880, 1034376], [543685, 1061808, 1079736], [543685, 1106268, 1121988]],
    sand: [[564893, 323136, 348360], [564893, 372588, 398532], [564893, 422628, 446412], [564893, 623988, 650676], [564893, 675312, 701304], [564893, 1206876, 1232964]],
    snow: [[613849, 50400, 66912], [613849, 176220, 190608], [613849, 264144, 280536], [613849, 356724, 375276]],
    gravel: [[556002, 76008, 97584], [556002, 122952, 151908], [556002, 177336, 198528], [556002, 228504, 246408], [556002, 336264, 361344], [556002, 503400, 527592]],
    mud: [[548384, 0, 24360], [548384, 47640, 74616], [548384, 101028, 121836], [548384, 147432, 176448], [548384, 203088, 221928], [548384, 323724, 345480]],
    leaves: [[496420, 384, 29424], [496420, 48060, 74052], [496420, 89316, 111180], [496420, 126576, 149256], [496420, 166404, 189780], [496420, 301548, 326436]],
    water: [[490951, 887232, 916248, 150], [490951, 984396, 1013436, 150], [490951, 1066872, 1095888, 150], [490951, 1159320, 1188360, 150], [490951, 1239312, 1268328, 150]],
};

// A recording, downloaded once
async function fetchRecording(id) {
    const cached = new URL(`${id}.mp3`, CACHE);

    try {
        return await readFile(cached);
    } catch {
        const response = await fetch(`https://cdn.freesound.org/previews/${RECORDINGS[id].preview}`);

        if (!response.ok) {
            throw new Error(`Freesound ${id}: ${response.status}`);
        }

        const data = Buffer.from(await response.arrayBuffer());

        await mkdir(CACHE, { recursive: true });
        await writeFile(cached, data);

        return data;
    }
}

// A recording's samples, mono (its channels' mean)
async function decodeMp3(data) {
    const decoder = new MPEGDecoder();

    await decoder.ready;

    const { channelData, sampleRate } = decoder.decode(data);

    decoder.free();

    if (sampleRate !== RATE) {
        throw new Error(`${sampleRate} Hz, not ${RATE}`);
    }

    return channelData[0].map((value, n) => channelData.reduce((sum, channel) => sum + channel[n], 0) / channelData.length);
}

// One pass of a biquad high-pass filter (RBJ's) over `samples`, in place
function highpass(samples, frequency, q) {
    const w = (2 * Math.PI * frequency) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    const [b0, b1, b2, a1, a2] = [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
    let [x1, x2, y1, y2] = [0, 0, 0, 0];

    for (let n = 0; n < samples.length; n++) {
        const x = samples[n];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

        [x2, x1, y2, y1] = [x1, x, y1, y];
        samples[n] = y;
    }
}

// The rumble under HIGHPASS taken away: a 4th-order Butterworth high-pass run forwards and then
// backwards, so nothing's shifted in time; the recording's mean taken away first
function withoutRumble(samples) {
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const out = samples.map((value) => value - mean);

    for (const backwards of [false, true]) {
        if (backwards) {
            out.reverse();
        }

        // (The two sections of a 4th-order Butterworth)
        highpass(out, HIGHPASS, 0.5412);
        highpass(out, HIGHPASS, 1.3066);
    }

    return out.reverse();
}

// A footfall cut from a recording, faded in and out (raised cosines) and made LEVEL loud
function footfall(samples, from, to, fadeOut) {
    const out = samples.slice(from, to);
    const [rise, fall] = [Math.round(FADE_IN * RATE), Math.round((fadeOut / 1000) * RATE)];

    for (let n = 0; n < out.length; n++) {
        const along = Math.min(n / rise, (out.length - 1 - n) / fall, 1);

        out[n] *= 0.5 - 0.5 * Math.cos(Math.PI * along);
    }

    const peak = out.reduce((most, value) => Math.max(most, Math.abs(value)), 0);
    const gain = Math.min(LEVEL / loudness(out), PEAK / peak);

    return out.map((value) => value * gain);
}

// "swingSword" as "swing-sword", for its files
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function encodeMp3(samples, bitrate = BITRATE) {
    const encoder = new Mp3Encoder(1, RATE, bitrate);
    const pcm = Int16Array.from(samples, (value) => Math.round(Math.max(-1, Math.min(1, value)) * 32767));
    const parts = [];

    for (let start = 0; start < pcm.length; start += 1152) {
        parts.push(encoder.encodeBuffer(pcm.subarray(start, start + 1152)));
    }

    parts.push(encoder.flush());

    return Buffer.concat(parts.map((part) => Buffer.from(part.buffer, part.byteOffset, part.length)));
}

async function main(only = []) {
    const recordings = new Map();
    const list = {};
    const written = new Set();
    const sources = {};
    let bytes = 0;

    await mkdir(OUT, { recursive: true });

    // (Only some made again, if they're named: each of the rest kept as it is, its files and its
    // recordings' credits with it)
    const names = [...Object.keys(STEPS).map((surface) => `step${surface[0].toUpperCase()}${surface.slice(1)}`), ...Object.values(AREAS).flatMap((area) => Object.keys(area.SOUNDS))];
    const unknown = only.filter((name) => !names.includes(name));
    const before = only.length ? (await import(`${LIST.href}?${Date.now()}`)).RECORDED : {};
    const kept = (name, credit) => {
        if (!before[name]) {
            throw new Error(`${name} isn't made yet: name it too`);
        }

        list[name] = before[name].map((made) => ({ ...made }));

        for (const { file, from } of list[name]) {
            written.add(file);

            for (const key of from) {
                sources[key] = credit(key);
            }
        }
    };

    if (unknown.length) {
        throw new Error(`no such sounds: ${unknown.join(", ")}`);
    }

    for (const [surface, steps] of Object.entries(STEPS)) {
        const name = `step${surface[0].toUpperCase()}${surface.slice(1)}`;

        if (only.length && !only.includes(name)) {
            kept(name, (id) => ({ title: RECORDINGS[id].name, by: "Nox_Sound", page: `https://freesound.org/s/${id}/`, licence: "CC0" }));
            continue;
        }

        list[name] = [];

        for (const [k, [id, from, to, fadeOut = FADE_OUT * 1000]] of steps.entries()) {
            if (!recordings.has(id)) {
                recordings.set(id, withoutRumble(await decodeMp3(await fetchRecording(id))));
            }

            const mp3 = encodeMp3(footfall(recordings.get(id), from, to, fadeOut));
            const file = `step-${surface}-${k + 1}.${createHash("sha256").update(mp3).digest("hex").slice(0, 8)}.mp3`;

            await writeFile(new URL(file, OUT), mp3);
            written.add(file);
            bytes += mp3.length;
            list[name].push({ file, from: [String(id)] });
            sources[id] = { title: RECORDINGS[id].name, by: "Nox_Sound", page: `https://freesound.org/s/${id}/`, licence: "CC0" };
            console.log(`${file.padEnd(32)} ${String(mp3.length).padStart(6)} bytes  from ${RECORDINGS[id].name} (${(from / RATE).toFixed(3)} to ${(to / RATE).toFixed(3)} s)`);
        }
    }

    // The sounds made from recipes: each recording prepared once (by the channel and rumble it's
    // wanted with)
    const prepared = new Map();
    const decoded = new Map();
    const wanted = [];

    for (const area of Object.values(AREAS)) {
        for (const [name, variants] of Object.entries(area.SOUNDS)) {
            if (ON_DEMAND.has(area) || area.ON_DEMAND?.includes(name)) {
                wanted.push(name);
            }

            if (only.length && !only.includes(name)) {
                kept(name, (key) => {
                    const { title, by, page, licence } = area.SOURCES[key];

                    return { title, by, page, licence };
                });
                continue;
            }

            list[name] = [];

            for (const [k, variant] of variants.entries()) {
                // (Under its own, its area's defaults, if it has any: scripts/sounds LAYER, RECIPE)
                const recipe = { ...area.RECIPE, ...variant, layers: variant.layers.map((layer) => ({ ...area.LAYER, ...layer })) };

                for (const { from, channel = null, highpass = 40 } of recipe.layers) {
                    const key = `${from} ${channel} ${highpass}`;

                    if (!decoded.has(from)) {
                        const source = area.SOURCES[from];

                        decoded.set(from, await decode(await fetchSource(source), (source.member ?? new URL(source.url).pathname).split(".").pop().toLowerCase()));
                    }

                    if (!prepared.has(key)) {
                        prepared.set(key, prepare(decoded.get(from), { channel, highpass }));
                    }
                }

                const samples = render(recipe, ({ from, channel = null, highpass = 40 }) => prepared.get(`${from} ${channel} ${highpass}`));
                const mp3 = encodeMp3(samples, recipe.bitrate);
                const file = `${kebab(name)}-${k + 1}.${createHash("sha256").update(mp3).digest("hex").slice(0, 8)}.mp3`;
                const from = [...new Set(recipe.layers.map((layer) => layer.from))];

                await writeFile(new URL(file, OUT), mp3);
                written.add(file);
                bytes += mp3.length;
                list[name].push({ file, from, ...(recipe.peak !== undefined ? { peak: recipe.peak } : {}), ...(recipe.loop ? { loop: recipe.loop } : {}) });

                for (const key of from) {
                    const { title, by, page, licence } = area.SOURCES[key];

                    sources[key] = { title, by, page, licence };
                }

                console.log(`${file.padEnd(32)} ${String(mp3.length).padStart(6)} bytes  ${(samples.length / RATE).toFixed(3)} s`);
            }
        }
    }

    // Take away sounds from before
    for (const file of await readdir(OUT)) {
        if (!written.has(file)) {
            await rm(new URL(file, OUT));
        }
    }

    // Every sound, made now or kept, checked against the rate the game decodes it at (DECODED:
    // a bed's, or any other's): nothing of it above half that, or the list isn't written
    const decoder = new MPEGDecoder();

    for (const [name, files] of Object.entries(list)) {
        for (const { file, loop } of files) {
            await unheard(await readFile(new URL(file, OUT)), loop ? DECODED.bed : DECODED.sound, `${name} (${file})`, decoder);
        }
    }

    decoder.free();

    const lines = Object.entries(list).map(([name, files]) => `    ${name}: [\n${files.map(({ file, from, peak, loop }) => `        { file: ${JSON.stringify(file)}, from: ${JSON.stringify(from)}${peak === undefined ? "" : `, peak: ${peak}`}${loop ? `, loop: ${JSON.stringify(loop)}` : ""} },\n`).join("")}    ],`);
    const credits = Object.entries(sources)
        .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
        .map(([key, { title, by, page, licence }]) => `    ${JSON.stringify(key)}: { title: ${JSON.stringify(title)}, by: ${JSON.stringify(by)}, page: ${JSON.stringify(page)}, licence: ${JSON.stringify(licence)} },`);

    await writeFile(LIST, `// Made by scripts/build-sounds.js (npm run build:sounds): don't edit it by hand.
//
// The sounds recorded rather than made, in client/sounds, played instead of synth.js's of the same
// names once they're downloaded (or, with none made, on their own): footsteps on each footing, the
// weapons', armour's and bodies', the spells', the creatures', the ambience, the items', the
// interface's and the cues'; all CC0 or public domain, each from the recordings in SOURCES.

/** How loud each recording's made (its loudest 30 ms, as RMS: dsp.js loudness). */
export const RECORDED_LEVEL = ${LEVEL};

/**
 * The rate each recorded sound's decoded at (Hz: sound.js #decodeData), a bed's (one that loops)
 * and any other's: lower than its MP3's own, whose top the encoder cut off, so nothing heard is
 * lost and a quarter less is held (scripts/build-sounds.js DECODED, each checked as it's made).
 */
export const RECORDED_RATES = Object.freeze({ bed: ${DECODED.bed}, sound: ${DECODED.sound} });

/**
 * Each recorded sound's variants (a name → [{ file in client/sounds, from: [SOURCES keys], peak:
 * when it's loudest, s, for a swing or a cast to be timed by; loop: [length, crossfade], s, for
 * a bed played round and round, its file the crossfade longer (sound.js) }]).
 */
export const RECORDED = Object.freeze({
${lines.join("\n")}
});

/** The recorded sounds downloaded only once they're wanted (sound.js want), not at the start. */
export const ON_DEMAND = Object.freeze([${wanted.map((name) => JSON.stringify(name)).join(", ")}]);

/** The recordings they're made from: what each is, who recorded it, where it is, its licence. */
export const SOURCES = Object.freeze({
${credits.join("\n")}
});
`);
    console.log(`${written.size} sounds, ${(bytes / 1024).toFixed(0)} KB made${only.length ? ` (${only.join(", ")}; the rest kept)` : ""}`);
}

// (Run, not imported)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main(process.argv.slice(2));
}
