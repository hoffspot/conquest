// Makes the music's instrument samples (client/music, listed in client/js/audio/samples.js) from
// recordings of real instruments in the Versilian Community Sample Library (VCSL, CC0: public
// domain) by Versilian Studios: https://github.com/sgossner/VCSL
//
//   npm run build:music
//
// For each instrument the score plays (score.js), it reads the library's SFZ file (which says
// which recording is which note), picks a recording every few semitones across the notes the
// score uses (instruments.js plays the nearest, a little faster or slower), and downloads it
// (kept in .cache/vcsl). Each is made mono, tuned (by the SFZ's fine tuning), resampled to 32 kHz,
// cut to as long as the score needs, faded out, made about as loud as the others, and saved as
// an MP3 named for what's in it (so browsers and the service worker can keep them for good).

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Mp3Encoder } from "@breezystack/lamejs";
import { SCORE } from "../client/js/audio/score.js";

// The recordings, and the SFZ files (made for the library, kept with a copy of it)
const LIBRARY = "https://raw.githubusercontent.com/sgossner/VCSL/master/";
const SFZ_LIBRARY = "https://raw.githubusercontent.com/smpldsnds/sgossner-vcsl/main/";
const CACHE = new URL("../.cache/vcsl/", import.meta.url);
const OUT = new URL("../client/music/", import.meta.url);
const LIST = new URL("../client/js/audio/samples.js", import.meta.url);

// The samples' rate (Hz) and MP3 bit rate (kb/s)
const RATE = 32000;
const BITRATE = 80;

// A recording plays notes up to this many semitones either side of its own (where the library
// has one near enough)
const SPREAD = 2;

// How loud each sample is made: its loudest 50 ms in the first BODY seconds (what most notes
// play), as RMS, then kept under PEAK
const LOUDNESS = 0.25;
const BODY = 0.6;
const PEAK = 0.95;

// Where a note starts in its recording: the first moment it's this share of its loudest (less a
// few milliseconds), after any silence before it
const ONSET = 0.03;

/**
 * Each instrument: its SFZ in the library, how long its samples are (seconds: long enough for
 * the score's longest note and its release), and which recordings to use where the library
 * has more than one for a note (`pick`: a pattern in the file's name, such as a velocity
 * layer). Unpitched ones (drums) name a recording for each kind of hit instead. The bowed
 * psaltery's long bow strokes swell slowly, so its notes start into the stroke (`skip`
 * seconds), faded in over `fadeIn` like a bow's attack.
 */
const SOURCES = {
    recorder: { sfz: "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder - Sustain", seconds: 2.4 },
    psaltery: { sfz: "Chordophones/Zithers/Psaltery, Bowed and Plucked - LongBow", seconds: 2.4, skip: 0.4, fadeIn: 0.04 },
    harp: { sfz: "Chordophones/Composite Chordophones/Folk Harp", seconds: 2.4, pick: /_v2_/ },
    strumstick: { sfz: "Chordophones/Composite Chordophones/Strumstick", seconds: 2, pick: /_vl2_/ },
    harpsichord: { sfz: "Chordophones/Zithers/Harpsichord, Flemish - 8'", seconds: 1.2, pick: /_Low_Far_/ },
    organ: { sfz: "Aerophones/Edge-blown Aerophones/Renaissance Organ - 8'", seconds: 2.4 },
    chimes: { sfz: "Idiophones/Struck Idiophones/Hand Chimes", seconds: 2.6 },
    drum: { sfz: "Membranophones/Struck Membranophones/Frame Drum", seconds: 0.8, kinds: { low: /HDrumL_Hit_v3_rr1/, high: /HDrumS_Hit_v2_rr1/ } },
    tambourine: { sfz: "Idiophones/Struck Idiophones/Tambourine 1", seconds: 0.6, kinds: { hit: /Tamb1_Hit_v1_rr1/ } },
};

// A file from the library, downloaded once
export async function fetchFromLibrary(path, library = LIBRARY) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const cached = new URL(encoded, CACHE);

    try {
        return await readFile(cached);
    } catch {
        const response = await fetch(library + encoded);

        if (!response.ok) {
            throw new Error(`${path}: ${response.status}`);
        }

        const data = Buffer.from(await response.arrayBuffer());

        await mkdir(new URL(".", cached), { recursive: true });
        await writeFile(cached, data);

        return data;
    }
}

// An SFZ's regions: { sample, key, offset, tune }, with its groups' settings
export function regionsOf(text) {
    const regions = [];
    let group = {};

    for (const [, header, body] of text.matchAll(/<(group|region)>([^<]*)/g)) {
        const settings = Object.fromEntries([...body.matchAll(/^\s*(\w+)=(.+?)\s*$/gm)].map(([, key, value]) => [key, value]));

        if (header === "group") {
            group = settings;
        } else {
            const all = { ...group, ...settings };

            regions.push({ sample: all.sample, key: Number(all.pitch_keycenter), offset: Number(all.offset ?? 0), tune: Number(all.tune ?? 0) });
        }
    }

    return regions;
}

// Decode a WAV file (PCM or float) to one channel of samples in -1 to 1, and its rate
export function decodeWav(data) {
    let offset = 12;
    let format = null;
    let samples = null;

    while (offset + 8 <= data.length) {
        const id = data.toString("ascii", offset, offset + 4);
        const size = data.readUInt32LE(offset + 4);
        const body = offset + 8;

        if (id === "fmt ") {
            format = { code: data.readUInt16LE(body), channels: data.readUInt16LE(body + 2), rate: data.readUInt32LE(body + 4), bits: data.readUInt16LE(body + 14) };

            // (WAVE_FORMAT_EXTENSIBLE: the real format's code is in its sub-format)
            if (format.code === 0xfffe) {
                format.code = data.readUInt16LE(body + 24);
            }
        } else if (id === "data") {
            const { code, channels, bits } = format;
            const width = bits / 8;
            const frames = Math.floor(size / (width * channels));

            samples = new Float32Array(frames);

            for (let frame = 0; frame < frames; frame++) {
                let sum = 0;

                for (let channel = 0; channel < channels; channel++) {
                    const at = body + (frame * channels + channel) * width;

                    if (code === 3) {
                        sum += bits === 64 ? data.readDoubleLE(at) : data.readFloatLE(at);
                    } else if (bits === 16) {
                        sum += data.readInt16LE(at) / 32768;
                    } else if (bits === 24) {
                        sum += data.readIntLE(at, 3) / 8388608;
                    } else if (bits === 32) {
                        sum += data.readInt32LE(at) / 2147483648;
                    } else {
                        sum += (data[at] - 128) / 128;
                    }
                }

                samples[frame] = sum / channels;
            }
        }

        offset = body + size + (size % 2);
    }

    if (!format || !samples) {
        throw new Error("not a WAV file");
    }

    return { samples, rate: format.rate };
}

// Resample to RATE, `cents` higher, from `start`, for `seconds` (windowed sinc, low-passed below
// the new rate's limit)
function resample(input, rate, { start = 0, cents = 0, seconds }) {
    const step = (rate / RATE) * 2 ** (cents / 1200);
    const scale = Math.max(1, step);
    const lobes = 12;
    const reach = Math.ceil(lobes * scale);
    const output = new Float32Array(Math.round(seconds * RATE));
    const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

    for (let n = 0; n < output.length; n++) {
        const at = start + n * step;
        const middle = Math.floor(at);
        let sum = 0;
        let weights = 0;

        for (let k = middle - reach + 1; k <= middle + reach; k++) {
            const x = (at - k) / scale;
            const weight = Math.abs(x) < lobes ? sinc(x) * sinc(x / lobes) : 0;

            sum += (input[k] ?? 0) * weight;
            weights += weight;
        }

        output[n] = weights ? sum / weights : 0;
    }

    return output;
}

// Where a recording's note starts (from `from`): a few milliseconds before it first reaches
// ONSET of its loudest
function onsetOf(samples, rate, from = 0) {
    let peak = 0;

    for (let n = from; n < samples.length; n++) {
        peak = Math.max(peak, Math.abs(samples[n]));
    }

    let n = from;

    while (n < samples.length && Math.abs(samples[n]) < ONSET * peak) {
        n++;
    }

    return Math.max(from, n - Math.round(0.003 * rate));
}

// Fade in (over `fadeIn` seconds) and out over the last fifth of a second, then make it as loud
// as the others
function finish(samples, { fadeIn = 0.002 } = {}) {
    const rise = Math.max(1, Math.round(fadeIn * RATE));
    const fadeOut = Math.round(0.2 * RATE);
    const window = Math.round(0.05 * RATE);
    const body = Math.min(samples.length, Math.round(BODY * RATE));
    let loudest = 0;
    let peak = 0;

    for (let n = 0; n < samples.length; n++) {
        samples[n] *= Math.min(1, n / rise, (samples.length - 1 - n) / fadeOut);
    }

    for (let start = 0; start + window <= body; start += window / 2) {
        let sum = 0;

        for (let n = start; n < start + window; n++) {
            sum += samples[n] * samples[n];
        }

        loudest = Math.max(loudest, Math.sqrt(sum / window));
    }

    for (const value of samples) {
        peak = Math.max(peak, Math.abs(value));
    }

    const gain = Math.min(LOUDNESS / loudest, PEAK / peak);

    return samples.map((value) => value * gain);
}

function encodeMp3(samples) {
    const encoder = new Mp3Encoder(1, RATE, BITRATE);
    const pcm = Int16Array.from(samples, (value) => Math.round(Math.max(-1, Math.min(1, value)) * 32767));
    const parts = [];

    for (let start = 0; start < pcm.length; start += 1152) {
        parts.push(encoder.encodeBuffer(pcm.subarray(start, start + 1152)));
    }

    parts.push(encoder.flush());

    return Buffer.concat(parts.map((part) => Buffer.from(part.buffer, part.byteOffset, part.length)));
}

// The recordings to use for notes `low` to `high`: the fewest, each covering SPREAD semitones
// either side, from those the library has (`regions`, one per note)
function cover(regions, low, high) {
    const chosen = [];
    let next = low;

    while (next <= high) {
        const near = regions.filter(({ key }) => key <= next + SPREAD).at(-1);
        const region = near && near.key >= next - SPREAD ? near : regions.find(({ key }) => key >= next) ?? regions.at(-1);

        chosen.push(region);

        if (region.key + SPREAD + 1 <= next) {
            break;
        }

        next = region.key + SPREAD + 1;
    }

    return chosen;
}

async function main() {
    const list = {};
    const written = new Set();
    let bytes = 0;

    await mkdir(OUT, { recursive: true });

    for (const [name, source] of Object.entries(SOURCES)) {
        const folder = source.sfz.slice(0, source.sfz.lastIndexOf("/") + 1);
        const sfz = (await fetchFromLibrary(`${source.sfz}.sfz`, SFZ_LIBRARY)).toString("utf8");
        const regions = regionsOf(sfz).filter(({ sample }) => !source.pick || source.pick.test(sample));
        let chosen;

        if (source.kinds) {
            chosen = Object.entries(source.kinds).map(([kind, pattern]) => ({ kind, ...regions.find(({ sample }) => pattern.test(sample)) }));
        } else {
            // One recording per note (the first round of any the library repeats), low to high
            const notes = SCORE.notes.filter(({ instrument }) => instrument === name).map(({ pitch }) => pitch);
            const byKey = [...new Map(regions.map((region) => [region.key, region])).values()].sort((a, b) => a.key - b.key);

            chosen = cover(byKey, Math.min(...notes), Math.max(...notes));
        }

        list[name] = [];

        for (const region of chosen) {
            const wav = decodeWav(await fetchFromLibrary(folder + region.sample.replaceAll("\\", "/")));
            const start = onsetOf(wav.samples, wav.rate, region.offset) + Math.round((source.skip ?? 0) * wav.rate);
            const samples = finish(resample(wav.samples, wav.rate, { start, cents: region.tune, seconds: source.seconds }), { fadeIn: source.fadeIn });
            const mp3 = encodeMp3(samples);
            const label = region.kind ?? region.key;
            const file = `${name}-${label}.${createHash("sha256").update(mp3).digest("hex").slice(0, 8)}.mp3`;

            await writeFile(new URL(file, OUT), mp3);
            written.add(file);
            bytes += mp3.length;
            list[name].push(region.kind ? { kind: region.kind, file } : { key: region.key, file });
            console.log(`${file.padEnd(34)} ${String(mp3.length).padStart(7)} bytes  from ${region.sample}`);
        }
    }

    // Take away samples from before
    for (const file of await readdir(OUT)) {
        if (!written.has(file)) {
            await rm(new URL(file, OUT));
        }
    }

    const lines = Object.entries(list).map(([name, samples]) => `    ${name}: [\n${samples.map((sample) => `        ${JSON.stringify(sample).replace(/"(\w+)":/g, "$1: ")},\n`).join("")}    ],`);

    await writeFile(LIST, `// Made by scripts/build-music.js (npm run build:music): don't edit it by hand.
//
// The music's samples, in client/music: recordings of real instruments from the Versilian
// Community Sample Library by Versilian Studios (CC0), https://github.com/sgossner/VCSL. Each
// pitched instrument has recordings at a few notes (\`key\`, MIDI); drums one for each kind of hit.

/** Each instrument's samples: [{ key, file }], or [{ kind, file }] for drums. */
export const SAMPLES = Object.freeze({
${lines.join("\n")}
});
`);
    console.log(`${written.size} samples, ${(bytes / 1024).toFixed(0)} KB`);
}

// (Run, not imported)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
