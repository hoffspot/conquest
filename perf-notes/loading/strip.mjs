import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
const require = createRequire("/home/user/conquest/package.json");
const esbuild = require("esbuild");
const client = "/home/user/conquest/client";
const { MANIFEST } = await import(client + "/js/app/manifest.js");
const html = await readFile(client + "/index.html", "utf8");
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const own = Object.keys(map).filter((k) => k.startsWith("./js/")).map((k) => k.slice(2));
const gz = (b) => zlib.gzipSync(Buffer.from(b), { level: 6 }).length;
let raw = 0, g = 0; const res = { strip: [0, 0], ws: [0, 0], full: [0, 0] }; let biggest = null;
for (const f of own) { const src = await readFile(path.join(client, f), "utf8"); raw += Buffer.byteLength(src); g += gz(src);
    for (const [k, o] of [["strip", {}], ["ws", { minifyWhitespace: true }], ["full", { minify: true }]]) { const out = (await esbuild.transform(src, { ...o, format: "esm", target: "es2022", legalComments: "none" })).code; res[k][0] += Buffer.byteLength(out); res[k][1] += gz(out); if (f === "js/app/game.js") (biggest ??= {})[k] = [Buffer.byteLength(out), gz(out)]; }
    if (f === "js/app/game.js") biggest.now = [Buffer.byteLength(src), gz(src)]; }
const MB = (n) => (n / 1048576).toFixed(2);
console.log(`own modules in the import map: ${own.length}; as shipped ${MB(raw)} MB raw, ${MB(g)} MB gzip`);
for (const [k, [r, z]] of Object.entries(res)) console.log(`  ${k}: ${MB(r)} MB raw (${(100 * (1 - r / raw)).toFixed(0)}% less), ${MB(z)} MB gzip (${(100 * (1 - z / g)).toFixed(0)}% less)`);
console.log("game.js:", Object.entries(biggest).map(([k, [r, z]]) => `${k} ${(r / 1024).toFixed(0)}K/${(z / 1024).toFixed(0)}K gz`).join("; "));
// comment share
let comment = 0, lines = 0, clines = 0; for (const f of own) { const src = await readFile(path.join(client, f), "utf8"); for (const line of src.split("\n")) { lines++; if (/^\s*(\/\/|\/\*|\*)/.test(line)) { clines++; comment += line.length + 1; } } }
console.log(`comment lines: ${clines} of ${lines} (${(100 * clines / lines).toFixed(0)}%), ${MB(comment)} MB of ${MB(raw)} MB`);
