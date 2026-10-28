// Makes the crest over the loading screen and the title (client/js/app/crest.js) from its master in
// scripts/crest/ (crest.jpg or crest.png: painted on flat magenta), cut out of the magenta, into
// client/images/crest/:
//
//     npm run build:crest
//
// Its magenta made see-through, and taken out of its edges' colours: the magenta as it is in the
// master (never quite #FF00FF: its corners', all told), each pixel's share of it by how much more
// blue than green it is (the crest's gold, crimson, leather and steel are all about as green as
// they're blue, or more; the magenta 200 or so bluer), then that share of it taken out of the
// rest, so no pink fringe is left. Then an AVIF (10-bit, tagged full-range sRGB as the backdrops'
// are, its see-through kept beside it) and a WebP for a browser that can't show AVIF, at its
// master's size. The master is as the owner made it (Google's Gemini). It needs ffmpeg with
// libaom-av1 and libwebp. test/crest.test.js checks both are there, see-through, the master's size,
// and within their budget.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = ["jpg", "png"].map((type) => path.join(root, `scripts/crest/crest.${type}`)).find((file) => existsSync(file));
const out = path.join(root, "client/images/crest");

if (!master) {
    throw new Error("No master in scripts/crest (crest.jpg or .png)");
}

// The magenta it's painted on, as it is: its four corners' (8 pixels square each), all told
function backgroundOf(file) {
    const [width, height] = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" }).trim().split(",").map(Number);
    const sum = [0, 0, 0];
    let count = 0;

    for (const [x, y] of [
        [0, 0],
        [width - 8, 0],
        [0, height - 8],
        [width - 8, height - 8],
    ]) {
        const pixels = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", `format=rgb24,crop=8:8:${x}:${y}`, "-f", "rawvideo", "-"]);

        for (let k = 0; k + 2 < pixels.length; k += 3, count++) {
            sum[0] += pixels[k];
            sum[1] += pixels[k + 1];
            sum[2] += pixels[k + 2];
        }
    }

    return sum.map((total) => Math.round(total / count));
}

const [kr, kg, kb] = backgroundOf(master);

if (kb - kg < 120 || kr - kg < 120) {
    throw new Error(`The master's corners aren't magenta (${kr}, ${kg}, ${kb}): paint it on flat magenta, #FF00FF`);
}

// How much of each pixel is the crest (1) and how much magenta (0): solid where it's no more than
// 20 bluer than it's green, none where it's within 15 of the magenta's own; and each colour with
// that share of the magenta taken out of it
const SHARE = `clip((${kb - kg - 15}-(b(X,Y)-g(X,Y)))/${kb - kg - 35},0,1)`;
const OF = `max(${SHARE},0.05)`;
const CUT = `format=rgba,geq=r='clip((r(X,Y)-(1-${SHARE})*${kr})/${OF},0,255)':g='clip((g(X,Y)-(1-${SHARE})*${kg})/${OF},0,255)':b='clip((b(X,Y)-(1-${SHARE})*${kb})/${OF},0,255)':a='255*${SHARE}'`;

// AVIF as a still picture, its colours and its see-through as two (the see-through beside them);
// WebP as a picture, its see-through in it
const AVIF = [
    "-filter_complex",
    `[0:v]${CUT},split[colour][alpha];[colour]scale=out_color_matrix=bt709:out_range=full,format=yuv420p10le[c];[alpha]format=yuva444p,alphaextract,format=gray10le[a]`,
    "-map",
    "[c]",
    "-map",
    "[a]",
    "-color_range",
    "pc",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "iec61966-2-1",
    "-c:v",
    "libaom-av1",
    "-still-picture",
    "1",
    "-crf",
    "34",
    "-b:v",
    "0",
    "-cpu-used",
    "3",
];
const WEBP = ["-vf", CUT, "-c:v", "libwebp", "-quality", "75", "-compression_level", "6", "-preset", "picture", "-pix_fmt", "yuva420p"];

mkdirSync(out, { recursive: true });

const sizes = [];

for (const [type, options] of [
    ["avif", AVIF],
    ["webp", WEBP],
]) {
    const file = path.join(out, `crest.${type}`);

    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", master, "-frames:v", "1", ...options, file]);
    sizes.push(`${type} ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

console.log(`crest: ${(statSync(master).size / 1024).toFixed(0)} KB master on (${kr}, ${kg}, ${kb}), ${sizes.join(", ")}`);
