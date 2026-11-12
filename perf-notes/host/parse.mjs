// How long V8 takes to parse and compile the core's biggest modules as they load (lazily: each
// function's body is only pre-parsed), and fully (every function compiled: what calling them all
// once would add). Run with --experimental-vm-modules.
import { readFileSync } from "node:fs";
import vm from "node:vm";

for (const file of ["client/js/core/host.js", "client/js/core/battle.js", "client/js/core/overworld.js", "client/js/core/war/war.js", "client/js/app/game.js"]) {
    const source = readFileSync(`/home/user/conquest/${file}`, "utf8");
    const lazy = [];

    for (let k = 0; k < 7; k++) {
        const t0 = performance.now();

        new vm.SourceTextModule(`${source}\n// ${k}`, { identifier: `file:///x/${k}/${file}` });
        lazy.push(performance.now() - t0);
    }

    lazy.sort((a, b) => a - b);
    console.log(`${file}: ${(source.length / 1024).toFixed(0)} KB, ${source.split("\n").length} lines; parsed as a module (lazily) in ${lazy[0].toFixed(1)}-${lazy[3].toFixed(1)}-${lazy[6].toFixed(1)} ms (least-median-most of 7)`);
}
