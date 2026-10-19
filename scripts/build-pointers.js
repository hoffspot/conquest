// Draws the mouse pointers (client/js/app/pointer.js) into client/images/pointer/, each look at
// each size (POINTER_SIZES), 1x and 2x, as PNGs:
//
//     npm run build:pointers
//
// The knight's sword, tip to the top left (its hotspot, pointer.js TIP): a steel blade, a gilt
// guard and pommel, a leather grip, all outlined dark to stand out on grass and stone alike. Over
// things, its blade red-lit (an enemy) or a badge in its free corner, bottom left (a speech bubble,
// an arch, a hand), so where it points never moves; shaken, its blade glowing gold. Drawn here as
// SVG, made ours (the repository's licence), and rasterized by Chromium (Playwright's, or
// CHROMIUM_PATH's), so they look the same on every system. test/pointer.test.js checks every file
// is there, at its size.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { AIMS, pointerFile, POINTER_SIZES } from "../client/js/app/pointer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INK = "#140d06";

// The sword, drawn tip up along +y in its own frame, then laid tip to the top left of a 32 by 32
// box. `red`: its blade red-lit; `glow`: glowing gold all round
function sword({ red = false, glow = false } = {}) {
    const blade = "M0,0 L2.3,4.2 L2.3,23.5 L-2.3,23.5 L-2.3,4.2 Z";
    const parts = (fill) => `
        <path d="${blade}" ${fill("blade")}/>
        <rect x="-7.2" y="23.2" width="14.4" height="3.1" rx="1.4" ${fill("guard")}/>
        <rect x="-1.55" y="26.3" width="3.1" height="8.3" rx="0.6" ${fill("grip")}/>
        <circle cx="0" cy="36.7" r="2.6" ${fill("pommel")}/>`;
    const fills = { blade: red ? "url(#redsteel)" : glow ? "#fffbea" : "url(#steel)", guard: "url(#gilt)", grip: "#6b3c1c", pommel: "url(#gilt)" };
    const halo = red
        ? `<path d="${blade}" fill="none" stroke="#ff3b2f" stroke-width="4" stroke-linejoin="round" filter="url(#blur)" opacity="0.9"/>`
        : glow
          ? `<path d="${blade}" fill="none" stroke="#ffd25a" stroke-width="6" stroke-linejoin="round" filter="url(#blur)" opacity="0.95"/><path d="${blade}" fill="none" stroke="#fff3c4" stroke-width="3" stroke-linejoin="round" filter="url(#blur)"/>`
          : "";

    return `<g transform="translate(2.3 2.3) rotate(-45)">
        ${halo}
        <g fill="${INK}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round">${parts(() => "")}</g>
        ${parts((part) => `fill="${fills[part]}"`)}
        <path d="M0,5.6 L0,22.6" stroke="${red ? "#7a1410" : glow ? "#ffcf4d" : "#7f8b99"}" stroke-width="0.9"/>
        <path d="M-1.55,28.4 L1.55,28.4 M-1.55,30.5 L1.55,30.5 M-1.55,32.6 L1.55,32.6" stroke="#3b200d" stroke-width="0.7"/></g>`;
}

// The badges, in the sword's free corner (bottom left, x 0 to 15, y 17 to 31)
const BADGES = {
    talk: `<path d="M2.2,18.6 h11 a2.2,2.2 0 0 1 2.2,2.2 v5 a2.2,2.2 0 0 1 -2.2,2.2 h-5.6 l-3.4,3 v-3 h-2 a2.2,2.2 0 0 1 -2.2,-2.2 v-5 a2.2,2.2 0 0 1 2.2,-2.2 z" fill="url(#parchment)" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
        <g fill="#5a3416"><circle cx="4.9" cy="23.3" r="1.15"/><circle cx="7.9" cy="23.3" r="1.15"/><circle cx="10.9" cy="23.3" r="1.15"/></g>`,
    enter: `<g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M1.4,31 V22.4 a6.2,6.2 0 0 1 12.4,0 V31 Z" fill="#9aa1aa"/><path d="M3.9,31 V22.8 a3.7,3.7 0 0 1 7.4,0 V31 Z" fill="#6b3c1c"/></g>
        <path d="M7.6,19.4 V31" stroke="#3b200d" stroke-width="0.7"/><circle cx="9.6" cy="26.4" r="0.8" fill="#ffd25a"/>`,
    hand: `<path d="M3.2,30.6 C1.6,28.6 1.2,26.4 1.6,24.4 L2.6,21.6 a1.1,1.1 0 0 1 2.1,0.6 L4.4,24.2 L4.6,18.6 a1.15,1.15 0 0 1 2.3,0 L7,23.4 L7.6,17.8 a1.15,1.15 0 0 1 2.3,0.1 L9.6,23.4 L10.6,18.8 a1.1,1.1 0 0 1 2.2,0.4 L12,24.4 L13.1,22.2 a1.1,1.1 0 0 1 2,0.9 L13.4,27.6 C12.8,29.6 11.6,30.8 10,31.2 Z" fill="#f3c9a0" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`,
};

const DEFS = `<defs>
    <linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#e3e9f0"/><stop offset="0.5" stop-color="#b9c3cf"/><stop offset="1" stop-color="#8f9cab"/></linearGradient>
    <linearGradient id="redsteel" x1="0" x2="1"><stop offset="0" stop-color="#ffd9d4"/><stop offset="0.5" stop-color="#ff8f84"/><stop offset="0.5" stop-color="#e2463b"/><stop offset="1" stop-color="#a3231b"/></linearGradient>
    <linearGradient id="gilt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#b07a16"/></linearGradient>
    <linearGradient id="parchment" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f0dfb8"/></linearGradient>
    <filter id="blur" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1.5"/></filter></defs>`;

/** Each look's picture, as SVG in a 32 by 32 box: AIMS', and "shaken". */
export const POINTER_PICTURES = Object.freeze({
    sword: sword(),
    attack: sword({ red: true }),
    talk: sword() + BADGES.talk,
    enter: sword() + BADGES.enter,
    hand: sword() + BADGES.hand,
    shaken: sword({ glow: true }),
});

const svgOf = (look, pixels) => `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 32 32">${DEFS}${POINTER_PICTURES[look]}</svg>`;

// Every file: [look, size, scale]
const files = () => [...AIMS, "shaken"].flatMap((look) => Object.values(POINTER_SIZES).flatMap(({ still, shaken }) => [1, 2].map((scale) => [look, look === "shaken" ? shaken : still, scale])));

async function build() {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();

    await mkdir(path.join(root, "client/images/pointer"), { recursive: true });

    for (const [look, size, scale] of files()) {
        const pixels = size * scale;
        const png = await page.evaluate(async ([svg, pixels]) => {
            // (In the page: its Image and document)
            const image = new globalThis.Image();

            image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
            await image.decode();

            const canvas = Object.assign(globalThis.document.createElement("canvas"), { width: pixels, height: pixels });

            canvas.getContext("2d").drawImage(image, 0, 0, pixels, pixels);

            return canvas.toDataURL("image/png").split(",")[1];
        }, [svgOf(look, pixels), pixels]);

        await writeFile(path.join(root, "client", pointerFile(look, size, scale)), Buffer.from(png, "base64"));
        console.log(`${pointerFile(look, size, scale)}: ${pixels} x ${pixels}`);
    }

    await browser.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await build();
}
