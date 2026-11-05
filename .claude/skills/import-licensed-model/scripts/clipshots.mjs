/* global console, process, URL, window, document */
// Pictures of a model's clips at moments through them, from the pipeline's viewer (served on
// `port`): node clipshots.mjs <port> <file under utilities/blenderpipeline> <out dir> <clip:t,t,...>...
// Each picture <out>/<clip>-<t>.png. In the model's own skin, or a variant's (VARIANT: its file, as
// the model's is given); every part shown, or only those PARTS names (its config's `join` names,
// comma-separated: a dressing of a model whose parts are kept apart)
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../../../package.json", import.meta.url))("playwright");
const [port, file, out, ...asks] = process.argv.slice(2);

mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });

page.on("pageerror", (error) => console.error("page:", error.message));
await page.goto(`http://localhost:${port}/?test&file=${encodeURIComponent(file)}`);
await page.waitForFunction(() => window.viewerReady && window.viewer && document.querySelector("#clips button"), null, { timeout: 120000 });
await page.evaluate((file) => window.viewer.load(`/${file}`), file);

if (process.env.VARIANT) {
    await page.evaluate((file) => window.viewer.look(`/${file}`), process.env.VARIANT);
}

if (process.env.PARTS) {
    await page.evaluate((parts) => window.viewer.show(parts.split(",")), process.env.PARTS);
}

await page.waitForTimeout(1500);

console.log("clips:", JSON.stringify((await page.evaluate(() => window.viewer.info())).clips.map((clip) => clip.name)));

for (const ask of asks) {
    const [clip, times] = ask.split(":");

    for (const t of times.split(",").map(Number)) {
        await page.evaluate(({ clip, t }) => window.viewer.pose(clip || null, t), { clip, t });
        await page.waitForTimeout(250);
        await page.screenshot({ clip: await page.evaluate(() => { const box = document.getElementById("view").getBoundingClientRect(); return { x: box.x, y: box.y, width: Math.min(box.width, 1400), height: Math.min(box.height, 900) }; }), path: `${out}/${(clip || "rest").replace(/ /g, "_")}-${t}.png` });
    }
}

console.log(JSON.stringify(await page.evaluate(() => window.viewer.info())).slice(0, 600));
await browser.close();
