// Getting the recordings the recorded sounds are made from (scripts/build-sounds.js): each
// downloaded once into .cache/sounds, as it's published (a sound's file, or the archive it's in,
// or an itch.io pack through the page's own free download), and decoded to its channels' samples.
//
// A source is { url } (the file itself), with { member } (its path inside the archive at url, a
// .zip or .7z), or { itch: { page, upload } } in place of url (the upload's name on the itch.io
// page, downloaded for free as a visitor would) with its { member }.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { FLACDecoder } from "@wasm-audio-decoders/flac";
import { OggVorbisDecoder } from "@wasm-audio-decoders/ogg-vorbis";
import { ArchiveReader, libarchiveWasm } from "libarchive-wasm";
import { MPEGDecoder } from "mpg123-decoder";

const CACHE = new URL("../../.cache/sounds/", import.meta.url);
const AGENT = "conquest build-sounds (https://github.com/hoffspot/conquest)";

// No sooner than this after the last request to the same site (ms): Freesound asks for a second
const POLITE = 1500;
const last = new Map();

async function politely(url, options = {}) {
    const host = new URL(url).host;
    const wait = (last.get(host) ?? 0) + POLITE - Date.now();

    if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
    }

    last.set(host, Date.now());

    const response = await fetch(url, { ...options, headers: { "user-agent": AGENT, ...options.headers } });

    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }

    return response;
}

// A file downloaded once, kept in the cache by its address's hash
async function cached(key, download) {
    const file = new URL(createHash("sha256").update(key).digest("hex").slice(0, 16), CACHE);

    try {
        return await readFile(file);
    } catch {
        const data = Buffer.from(await download());

        await mkdir(CACHE, { recursive: true });
        await writeFile(file, data);

        return data;
    }
}

// An itch.io page's upload, downloaded for free as a visitor does: the page's download button
// (its own short-lived link), then the upload's
async function fromItch({ page, upload }) {
    const cookies = new Map();
    const keep = (response) => {
        for (const line of response.headers.getSetCookie()) {
            const [pair] = line.split(";");
            const at = pair.indexOf("=");

            cookies.set(pair.slice(0, at), pair.slice(at + 1));
        }

        return response;
    };
    const cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    const html = await keep(await politely(page)).text();
    const csrf = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    const form = { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: `csrf_token=${encodeURIComponent(csrf)}` };
    const { url: downloads } = await keep(await politely(`${page}/download_url`, form)).json();
    const listing = await keep(await politely(downloads, { headers: { cookie: cookie() } })).text();
    const id = [...listing.matchAll(/data-upload_id="(\d+)"[\s\S]*?class="name"[^>]*>([^<]+)</g)].find(([, , name]) => name.trim() === upload)?.[1];

    if (!id) {
        throw new Error(`${page}: no upload "${upload}"`);
    }

    // (Free, so asked for from the downloads page as its button does, with no purchase's key)
    const { url } = await keep(await politely(`${page}/file/${id}?source=game_download&after_download_lightbox=true`, { ...form, headers: { ...form.headers, cookie: cookie(), referer: downloads } })).json();

    return (await politely(url)).arrayBuffer();
}

let archives = null;

// A file inside an archive (.zip or .7z)
async function member(archive, path) {
    archives ??= await libarchiveWasm();

    const reader = new ArchiveReader(archives, new Int8Array(archive.buffer, archive.byteOffset, archive.length));

    try {
        for (const entry of reader.entries()) {
            if (entry.getPathname() === path) {
                return Buffer.from(entry.readData());
            }
        }
    } finally {
        reader.free();
    }

    throw new Error(`no ${path} in the archive`);
}

/** A source's file, downloaded once (its archive or pack, if it's in one). */
export async function fetchSource(source) {
    const whole = source.itch ? await cached(`${source.itch.page} ${source.itch.upload}`, () => fromItch(source.itch)) : await cached(source.url, async () => (await politely(source.url)).arrayBuffer());

    return source.member ? member(whole, source.member) : whole;
}

// A WAV file's samples (PCM of 8 to 32 bits, or floating point), each channel's as numbers
// from -1 to 1
function decodeWav(data) {
    let at = 12;
    let format = null;

    while (at + 8 <= data.length) {
        const id = data.toString("ascii", at, at + 4);
        const size = data.readUInt32LE(at + 4);
        const body = at + 8;

        if (id === "fmt ") {
            const tag = data.readUInt16LE(body);

            format = {
                float: tag === 3 || (tag === 0xfffe && data.readUInt16LE(body + 24) === 3),
                channels: data.readUInt16LE(body + 2),
                rate: data.readUInt32LE(body + 4),
                bits: data.readUInt16LE(body + 14),
            };
        } else if (id === "data") {
            const { float, channels, rate, bits } = format;
            const bytes = bits / 8;
            const frames = Math.floor(Math.min(size, data.length - body) / (bytes * channels));
            const out = Array.from({ length: channels }, () => new Float64Array(frames));

            for (let n = 0; n < frames; n++) {
                for (let c = 0; c < channels; c++) {
                    const p = body + (n * channels + c) * bytes;

                    out[c][n] = float
                        ? bits === 64
                            ? data.readDoubleLE(p)
                            : data.readFloatLE(p)
                        : bits === 8
                          ? (data[p] - 128) / 128
                          : bits === 16
                            ? data.readInt16LE(p) / 32768
                            : bits === 24
                              ? data.readIntLE(p, 3) / 8388608
                              : data.readInt32LE(p) / 2147483648;
                }
            }

            return { channels: out, rate };
        }

        at = body + size + (size % 2);
    }

    throw new Error("no audio in the WAV");
}

const DECODERS = { mp3: MPEGDecoder, ogg: OggVorbisDecoder, flac: FLACDecoder };

/** A file's samples by its kind (wav, mp3, ogg, flac): { channels: [samples], rate }. */
export async function decode(data, kind) {
    if (kind === "wav") {
        return decodeWav(data);
    }

    const decoder = new DECODERS[kind]();

    await decoder.ready;

    const decoded = kind === "mp3" ? decoder.decode(data) : await decoder.decodeFile(data);

    decoder.free();

    return { channels: decoded.channelData, rate: decoded.sampleRate };
}
