// Sum a .cpuprofile's self time by function, and its total (inclusive) time by function.
//   node analyze.mjs <file.cpuprofile> [top] [only under this function's name]
import { readFileSync } from "node:fs";

const [file, top = "40", filter = ""] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const self = new Map();
const dt = profile.timeDeltas;
let total = 0;

profile.samples.forEach((id, k) => {
    self.set(id, (self.get(id) ?? 0) + dt[k]);
    total += dt[k];
});

const parents = new Map();

for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
        parents.set(child, node.id);
    }
}

const name = (node) => `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url.split("/").slice(-2).join("/")}:${node.callFrame.lineNumber + 1}`;
const bySelf = new Map();
const byTotal = new Map();

const under = (id) => {
    if (!filter) {
        return true;
    }

    for (let at = id; at !== undefined; at = parents.get(at)) {
        if (nodes.get(at).callFrame.functionName === filter) {
            return true;
        }
    }

    return false;
};

let counted = 0;

for (const [id, time] of self) {
    if (!under(id)) {
        continue;
    }

    counted += time;

    const node = nodes.get(id);

    bySelf.set(name(node), (bySelf.get(name(node)) ?? 0) + time);

    const seen = new Set();

    for (let at = id; at !== undefined; at = parents.get(at)) {
        const n = name(nodes.get(at));

        if (!seen.has(n)) {
            seen.add(n);
            byTotal.set(n, (byTotal.get(n) ?? 0) + time);
        }
    }
}

const show = (title, map) => {
    console.log(`\n${title}`);

    for (const [n, time] of [...map].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) {
        console.log(`${((time / counted) * 100).toFixed(1).padStart(5)}%  ${(time / 1000).toFixed(0).padStart(7)} ms  ${n}`);
    }
};

console.log(`total ${(total / 1000).toFixed(0)} ms, counted ${(counted / 1000).toFixed(0)} ms${filter ? ` under ${filter}` : ""}`);
show("SELF", bySelf);
show("TOTAL (inclusive)", byTotal);
