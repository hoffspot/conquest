// Makes the paintings behind the loading screen and the title (client/js/app/backdrop.js
// BACKDROPS) from their masters in scripts/backdrops/ (<scene>-tall.jpg, <scene>-wide.jpg, as
// each scene's painted), into client/images/backdrops/, as small as each browser can show them:
//
//     npm run build:backdrops
//
// AVIF, 10-bit so the evening skies don't band, and WebP for a browser that can't show AVIF
// (Safari on a Mac before macOS Ventura), each at its master's size. The masters are JPEGs as the
// owner made them (Google's Gemini); AVIF at CRF 30 and WebP at 75 can't be told from them in
// Chromium at full size, and come to a fifth and a third of them. It needs ffmpeg with libaom-av1
// and libwebp. test/backdrop.test.js checks every picture backdrop.js shows is there, the way it's
// painted, within its budget.

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKDROPS } from "../client/js/app/backdrop.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masters = path.join(root, "scripts/backdrops");
const out = path.join(root, "client/images/backdrops");

// How each is made: AVIF as a still picture, full-range sRGB as the masters are (left limited,
// as ffmpeg would, they're shown washed out); WebP as a picture
const AVIF = ["-vf", "scale=out_color_matrix=bt709:out_range=full,format=yuv420p10le", "-color_range", "pc", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1", "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "30", "-b:v", "0", "-cpu-used", "3"];
const WEBP = ["-c:v", "libwebp", "-quality", "75", "-compression_level", "6", "-preset", "picture"];

mkdirSync(out, { recursive: true });

for (const { scene, tall, wide } of BACKDROPS) {
    for (const way of [tall && "tall", wide && "wide"].filter(Boolean)) {
        const master = path.join(masters, `${scene}-${way}.jpg`);
        const sizes = [];

        for (const [type, options] of [
            ["avif", AVIF],
            ["webp", WEBP],
        ]) {
            const file = path.join(out, `${scene}-${way}.${type}`);

            execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", master, "-frames:v", "1", ...options, file]);
            sizes.push(`${type} ${(statSync(file).size / 1024).toFixed(0)} KB`);
        }

        console.log(`${scene}-${way}: ${(statSync(master).size / 1024).toFixed(0)} KB master, ${sizes.join(", ")}`);
    }
}
