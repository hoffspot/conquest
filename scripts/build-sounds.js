// Makes the game's recorded sounds (client/sounds, listed in client/js/audio/recorded.js), played
// instead of synth.js's made ones of the same names once they're downloaded: footsteps on each
// footing (audio/footing.js SURFACES), cut from recordings by Nox_Sound on Freesound, all CC0
// (public domain: https://creativecommons.org/publicdomain/zero/1.0/), each sound's page saying so
// (checked 2026-10-07). One recordist throughout, mostly in soft-soled mountain boots (no heel's
// click), close and dry, so every footing sounds like the same walker.
//
//   npm run build:sounds
//
// Each recording is downloaded once (Freesound's public preview, an MP3: the originals need a
// login; kept in .cache), made mono, its rumble under 40 Hz taken away (both ways, so nothing's
// shifted), and each footfall cut from it where it starts to where it's died away (STEPS: picked
// by ear and eye for being alike, clean, and on the beat). Each is faded in and out, made as
// loud as the rest (LEVEL, by its loudest 30 ms, as synth.js's are), and saved as an MP3 named for
// what's in it, so browsers and the service worker can keep them for good.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Mp3Encoder } from "@breezystack/lamejs";
import { MPEGDecoder } from "mpg123-decoder";
import { loudness } from "../client/js/audio/dsp.js";

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

// The recordings, by Freesound id: by Nox_Sound, CC0, each https://freesound.org/s/<id>/
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

async function main() {
    const recordings = new Map();
    const list = {};
    const written = new Set();
    let bytes = 0;

    await mkdir(OUT, { recursive: true });

    for (const [surface, steps] of Object.entries(STEPS)) {
        const name = `step${surface[0].toUpperCase()}${surface.slice(1)}`;

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
            list[name].push(file);
            console.log(`${file.padEnd(32)} ${String(mp3.length).padStart(6)} bytes  from ${RECORDINGS[id].name} (${(from / RATE).toFixed(3)} to ${(to / RATE).toFixed(3)} s)`);
        }
    }

    // Take away sounds from before
    for (const file of await readdir(OUT)) {
        if (!written.has(file)) {
            await rm(new URL(file, OUT));
        }
    }

    const lines = Object.entries(list).map(([name, files]) => `    ${name}: [\n${files.map((file) => `        ${JSON.stringify(file)},\n`).join("")}    ],`);

    await writeFile(LIST, `// Made by scripts/build-sounds.js (npm run build:sounds): don't edit it by hand.
//
// The sounds recorded rather than made, in client/sounds, played instead of synth.js's of the same
// names once they're downloaded: footsteps on each footing, cut from recordings by Nox_Sound on
// Freesound (CC0: public domain), https://freesound.org/people/Nox_Sound/.

/** How loud each recording's made (its loudest 30 ms, as RMS: dsp.js loudness). */
export const RECORDED_LEVEL = ${LEVEL};

/** Each recorded sound's variants (a synth.js SOUNDS name → files in client/sounds). */
export const RECORDED = Object.freeze({
${lines.join("\n")}
});
`);
    console.log(`${written.size} sounds, ${(bytes / 1024).toFixed(0)} KB`);
}

// (Run, not imported)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
