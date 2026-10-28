// Makes the paintings behind the loading screen and the title (client/js/app/backdrop.js
// BACKDROPS) from their masters in scripts/backdrops/ (<scene>-tall and <scene>-wide, as each
// scene's painted: .jpg or .png), into client/images/backdrops/, as small as each browser can show
// them:
//
//     npm run build:backdrops
//
// AVIF, 10-bit so the evening skies don't band, and WebP for a browser that can't show AVIF
// (Safari on a Mac before macOS Ventura), each at its master's size, or no more than BACKDROP.most
// pixels its longest side (a master made at 2K, 2752 by 1536, is made 2560 by 1428: as big as a
// computer's screen, or a phone's as it drifts). The masters are as the owner made them (Google's
// Gemini); AVIF at CRF 30 and WebP at 75 can't be told from them in
// Chromium at full size, and come to a fifth and a third of them. It needs ffmpeg with libaom-av1
// and libwebp. test/backdrop.test.js checks every picture backdrop.js shows is there, the way it's
// painted, within its budget.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKDROP, BACKDROPS } from "../client/js/app/backdrop.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masters = path.join(root, "scripts/backdrops");
const out = path.join(root, "client/images/backdrops");

// How each is made: no bigger than BACKDROP.most (its shape kept, its sides even); AVIF as a still
// picture, full-range sRGB as the masters are (left limited, as ffmpeg would, they're shown washed
// out); WebP as a picture
const FIT = `scale='min(${BACKDROP.most},iw)':'min(${BACKDROP.most},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
const AVIF = ["-vf", `${FIT},scale=out_color_matrix=bt709:out_range=full,format=yuv420p10le`, "-color_range", "pc", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1", "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "30", "-b:v", "0", "-cpu-used", "3"];
const WEBP = ["-vf", FIT, "-c:v", "libwebp", "-quality", "75", "-compression_level", "6", "-preset", "picture"];

mkdirSync(out, { recursive: true });

for (const { scene, tall, wide } of BACKDROPS) {
    for (const way of [tall && "tall", wide && "wide"].filter(Boolean)) {
        const master = ["jpg", "png"].map((type) => path.join(masters, `${scene}-${way}.${type}`)).find((file) => existsSync(file));

        if (!master) {
            throw new Error(`No master for ${scene}-${way} in scripts/backdrops (${scene}-${way}.jpg or .png)`);
        }
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
