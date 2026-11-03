/* global process, URL */
// A contact sheet of our own pictures, drawn in a browser: node sheet.mjs <out.png> <columns> <picture>...
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../../../package.json", import.meta.url))("playwright");
const [out, columns, ...files] = process.argv.slice(2);
const cells = files
    .map((file) => `<figure><img src="data:image/png;base64,${readFileSync(file).toString("base64")}"><figcaption>${file.split("/").pop().replace(/\.png$/, "")}</figcaption></figure>`)
    .join("");
const html = `<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${columns},320px);gap:2px}figure{margin:0;position:relative}img{width:320px;height:240px;display:block}figcaption{position:absolute;top:4px;left:6px;color:#ff0;font:12px sans-serif}</style>${cells}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 322 * Number(columns), height: 200 } });

await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
