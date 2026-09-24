// Generates the art for castles and towns (npm run build:art): opens the art generator
// (tools/artgen) in headless Chromium, which draws every piece with Three.js, and saves the
// sheet it makes to client/images/art/setpieces.webp, with its manifest setpieces.json.
//
// Uses Playwright's Chromium (or CHROMIUM_PATH), drawing with software WebGL where there is no GPU.
//
//     npm run build:art                    the sheet
//     npm run build:art -- --previews=dir  also save pictures of example castles and towns in dir

import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".gltf": "model/gltf+json",
    ".glb": "model/gltf-binary",
    ".bin": "application/octet-stream",
    ".png": "image/png",
    ".webp": "image/webp",
};

/** Serve the repository's files (the art generator imports the game's code and Three.js). */
export function serveRepository() {
    const server = createServer((request, response) => {
        const file = path.join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname));

        if (!file.startsWith(root)) {
            response.writeHead(403).end();

            return;
        }

        const stream = createReadStream(file);

        stream.on("open", () => response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }));
        stream.on("error", () => response.writeHead(404).end());
        stream.pipe(response);
    });

    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** Open the art generator in headless Chromium. Returns { page, close }. */
export async function openGenerator() {
    const server = await serveRepository();
    const browser = await chromium.launch({
        args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
    const page = await browser.newPage();

    page.on("pageerror", (error) => console.error("Art generator:", error));
    page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
            console.error("Art generator:", message.text());
        }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/artgen/index.html`);
    await page.waitForFunction(() => window.artgenReady, null, { timeout: 60000 });

    return {
        page,
        async close() {
            await browser.close();
            server.close();
        },
    };
}

const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

// Example castles and towns, for looking over the art
const PREVIEWS = [
    { name: "castle-1", kind: "castle", width: 22, height: 18, gate: "s", seed: 7 },
    { name: "castle-2", kind: "castle", width: 18, height: 22, gate: "e", seed: 12 },
    { name: "castle-3", kind: "castle", width: 26, height: 20, gate: "s", seed: 31 },
    { name: "castle-4", kind: "castle", width: 20, height: 16, gate: "n", seed: 5 },
    { name: "town-1", kind: "town", width: 26, height: 20, approaches: ["w", "e", "s"], seed: 3 },
    { name: "town-2", kind: "town", width: 22, height: 18, approaches: ["n", "s"], seed: 8 },
    { name: "town-3", kind: "town", width: 30, height: 22, approaches: ["n", "e", "s", "w"], seed: 21 },
    { name: "town-4", kind: "town", width: 20, height: 16, approaches: ["w"], seed: 14 },
];

async function main() {
    const previews = process.argv.find((arg) => arg.startsWith("--previews="))?.split("=")[1];
    const target = path.join(root, "client/images/art");
    const generator = await openGenerator();

    await mkdir(target, { recursive: true });

    try {
        const started = Date.now();
        const { image, manifest } = await generator.page.evaluate(() => window.artgen.buildSheet());

        await writeFile(path.join(target, "setpieces.webp"), dataUrlToBuffer(image));
        await writeFile(path.join(target, "setpieces.json"), `${JSON.stringify(manifest)}\n`);
        console.log(`${Object.keys(manifest.pieces).length} pieces in ${((Date.now() - started) / 1000).toFixed(1)} s`);

        if (previews) {
            await mkdir(previews, { recursive: true });

            for (const example of PREVIEWS) {
                const { image: picture } = await generator.page.evaluate((options) => window.artgen.preview(options), example);

                await writeFile(path.join(previews, `${example.name}.webp`), dataUrlToBuffer(picture));
            }

            const { image: pieces } = await generator.page.evaluate(() => window.artgen.board());

            await writeFile(path.join(previews, "pieces.webp"), dataUrlToBuffer(pieces));
            console.log(`${PREVIEWS.length} previews and the pieces in ${previews}`);
        }
    } finally {
        await generator.close();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
