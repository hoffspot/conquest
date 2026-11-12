// What parsing app/game.js and main.js costs: bytes, vm.SourceTextModule compile time (V8's lazy
// parse: the top level parsed, function bodies pre-parsed), and the same with every function
// compiled eagerly (an upper bound: what's paid by the time every function has run once).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import v8 from "node:v8";
import zlib from "node:zlib";
const files = process.argv.slice(2);
for (const file of files) {
    const source = readFileSync(file, "utf8");
    const lazy = [], eager = [];
    for (let run = 0; run < 5; run++) {
        // (A fresh source text each run, so nothing's reused from the compilation cache)
        const text = `${source}\n// ${run} ${Math.random()}`;
        let s = performance.now();
        new vm.SourceTextModule(text, { identifier: `lazy-${run}-${file}` });
        lazy.push(performance.now() - s);
    }
    v8.setFlagsFromString("--no-lazy");
    for (let run = 0; run < 5; run++) {
        const text = `${source}\n// e${run} ${Math.random()}`;
        const s = performance.now();
        new vm.SourceTextModule(text, { identifier: `eager-${run}-${file}` });
        eager.push(performance.now() - s);
    }
    v8.setFlagsFromString("--lazy");
    const fmt = (list) => list.map((t) => t.toFixed(1)).join(" / ");
    console.log(`${file.replace("/home/user/conquest/client/js/", "")}: ${(source.length / 1024).toFixed(0)} KB, ${source.split("\n").length} lines, gzip ${(zlib.gzipSync(source).length / 1024).toFixed(0)} KB, brotli ${(zlib.brotliCompressSync(source).length / 1024).toFixed(0)} KB | lazy compile ms: ${fmt(lazy)} | eager (every function) ms: ${fmt(eager)}`);
}
