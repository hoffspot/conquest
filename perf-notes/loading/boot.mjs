// What downloads before the title: the page's own files and the manifest's groups, raw and gzip
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
const client = "/home/user/conquest/client";
const { MANIFEST } = await import(client + "/js/app/manifest.js");
const gz = async (f) => zlib.gzipSync(await readFile(path.join(client, f)), { level: 6 }).length;
const KB = (n) => (n / 1024).toFixed(0).padStart(6) + " KB";
let T = 0, G = 0, N = 0;
// Does Pages compress it? text types only (js, json, css, html, svg, wasm? ...). Count both ways.
const compressible = (f) => /\.(m?js|json|css|html|svg|wasm|txt)$/.test(f);
for (const g of MANIFEST) { let t = 0, z = 0, zc = 0; for (const [f, b] of g.files) { t += b; const c = await gz(f); z += c; zc += compressible(f) ? c : b; } T += t; G += zc; N += g.files.length; console.log(`${g.id.padEnd(11)} ${String(g.files.length).padStart(4)} files ${KB(t)} raw, ${KB(z)} if all gzipped, ${KB(zc)} as a host that gzips text only would send`); if (g.files.length < 20) for (const [f, b] of g.files) console.log(`      ${f} ${KB(b)}`); }
console.log(`manifest total: ${N} files, ${KB(T)} raw, ${KB(G)} over the wire (text gzipped)`);
for (const f of ["index.html", "styles.css", "sw.js", "manifest.webmanifest", "js/app/version.js", "images/crest/crest.avif", "images/crest/crest.webp", "images/backdrops/town-dusk-tall.avif", "images/backdrops/town-dusk-wide.avif", "images/icons/icon-192.png", "fonts/CinzelDecorative-Bold.woff2"]) { try { const s = (await stat(path.join(client, f))).size; console.log(`${f.padEnd(40)} ${KB(s)} raw ${compressible(f) ? KB(await gz(f)) + " gz" : ""}`); } catch { console.log(f, "missing"); } }
