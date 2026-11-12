// Measure what minifying / bundling the game's code would save. Writes only to the scratch folder.
import { createRequire } from "node:module";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
const require = createRequire("/home/user/conquest/package.json");
const esbuild = require("esbuild");
const client = "/home/user/conquest/client";
const out = "/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/loading/out";
const gz = (b) => zlib.gzipSync(b, { level: 6 }).length;
const br = (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }).length;
const MB = (n) => (n / 1048576).toFixed(2) + " MB";

// The files: reuse the graph script's list (everything reachable)
const STATIC = /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g;
const DYNAMIC = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const WORKER = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*["']([^"']+)["']/g;
const named = { three: "./vendor/three-r186/three.module.min.js", "three/addons/": "./vendor/three-r186/addons/" };
function resolve(spec, from) {
    for (const [name, target] of Object.entries(named)) if (name.endsWith("/") ? spec.startsWith(name) : spec === name) return path.posix.normalize(path.posix.join(target, spec.slice(name.length)));
    if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    return null;
}
const seen = new Map();
const queue = ["js/main.js", "js/app/session.js", "js/app/creator.js", "js/app/worldmap.js", "js/app/wheelsetup.js", "js/app/together.js", "js/app/character-file.js"];
while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    const src = await readFile(path.join(client, f), "utf8");
    seen.set(f, src);
    for (const re of [STATIC, DYNAMIC, WORKER]) for (const m of src.matchAll(re)) { const n = resolve(m[1], f); if (n && !seen.has(n)) queue.push(n); }
}
const files = [...seen.keys()];
const own = files.filter((f) => !f.startsWith("vendor/"));
const vendor = files.filter((f) => f.startsWith("vendor/"));
function tot(list, get) { let raw = 0, g = 0, b = 0; for (const f of list) { const buf = Buffer.from(get(f)); raw += buf.length; g += gz(buf); b += br(buf); } return { raw, g, b }; }
const now = tot(files, (f) => seen.get(f));
const nowOwn = tot(own, (f) => seen.get(f));
const nowVendor = tot(vendor, (f) => seen.get(f));
console.log(`As shipped: ${files.length} files, raw ${MB(now.raw)}, gzip ${MB(now.g)}, brotli ${MB(now.b)}`);
console.log(`  own code: ${own.length} files, raw ${MB(nowOwn.raw)}, gzip ${MB(nowOwn.g)}; vendor: ${vendor.length} files, raw ${MB(nowVendor.raw)}, gzip ${MB(nowVendor.g)}`);

// A. per-file: strip whitespace + comments only (names and syntax untouched)
// B. per-file: full minify (local identifiers mangled, syntax compressed; exports keep their names)
for (const [label, opts] of []) {
    const t0 = performance.now();
    const res = new Map();
    for (const f of own) res.set(f, (await esbuild.transform(seen.get(f), { ...opts, format: "esm", target: "es2022", legalComments: "none" })).code);
    const t = tot(own, (f) => res.get(f));
    console.log(`${label}: own code raw ${MB(t.raw)}, gzip ${MB(t.g)}, brotli ${MB(t.b)}  (+vendor: gzip ${MB(t.g + nowVendor.g)} total)  [${(performance.now() - t0).toFixed(0)} ms]`);
}

// C. bundle, with splitting, minified or not
async function dirSize(dir) { let list = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) list.push(...await dirSize(p)); else list.push(p); } return list; }
const workers = files.filter((f) => /worker\.js$/.test(f));
console.log("worker entries:", workers.join(", "));
for (const [label, minify, splitting] of [["bundle (splitting, not minified)", false, true], ["bundle (splitting, minified)", true, true]]) {
    await rm(out, { recursive: true, force: true });
    const t0 = performance.now();
    const result = await esbuild.build({
        absWorkingDir: client,
        entryPoints: ["js/main.js", ...workers],
        bundle: true, external: ["node:*"], splitting, format: "esm", minify, target: "es2022", outdir: out, metafile: true, logLevel: "silent", legalComments: "none",
        alias: { three: "./vendor/three-r186/three.module.min.js" },
        plugins: [{ name: "addons", setup(b) { b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(client, "vendor/three-r186/addons", a.path.slice("three/addons/".length)) })); } }],
    });
    const outs = (await dirSize(out)).filter((p) => p.endsWith(".js"));
    let raw = 0, g = 0, b = 0; const each = [];
    for (const p of outs) { const buf = await readFile(p); raw += buf.length; const gg = gz(buf); g += gg; b += br(buf); each.push([path.relative(out, p), buf.length, gg]); }
    each.sort((a, c) => c[1] - a[1]);
    console.log(`${label}: ${outs.length} output files, raw ${MB(raw)}, gzip ${MB(g)}, brotli ${MB(b)}; inputs ${Object.keys(result.metafile.inputs).length} [${(performance.now() - t0).toFixed(0)} ms]`);
    console.log("   largest: " + each.slice(0, 8).map(([n, r, gg]) => `${n} ${MB(r)}/${MB(gg)} gz`).join("; "));
    console.log("   warnings:", result.warnings.length, result.warnings.slice(0, 3).map((w) => w.text).join(" | "));
}
await rm(out, { recursive: true, force: true });
