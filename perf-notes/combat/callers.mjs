// Who calls a function, in a .cpuprofile: its inclusive time by the nearest named caller above it.
//   node callers.mjs <file.cpuprofile> <function name> [depth of callers: 1]
import { readFileSync } from "node:fs";

const [file, wanted, depth = "1"] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parents = new Map();

for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
        parents.set(child, node.id);
    }
}

const self = new Map();
let total = 0;

profile.samples.forEach((id, k) => {
    self.set(id, (self.get(id) ?? 0) + profile.timeDeltas[k]);
});

const name = (id) => nodes.get(id).callFrame.functionName || `(anonymous:${nodes.get(id).callFrame.lineNumber + 1})`;
const by = new Map();
let under = 0;

for (const [id, time] of self) {
    // (The outermost frame of `wanted` on the stack, and who called it)
    let found = null;
    let inAdvance = false;

    for (let at = id; at !== undefined; at = parents.get(at)) {
        if (name(at) === wanted) {
            found = at;
        }

        if (name(at) === "advance") {
            inAdvance = true;
        }
    }

    if (inAdvance) {
        total += time;
    }

    if (found === null) {
        continue;
    }

    under += time;

    const chain = [];

    for (let at = parents.get(found), k = 0; at !== undefined && k < Number(depth); at = parents.get(at), k++) {
        chain.push(name(at));
    }

    by.set(chain.join(" < "), (by.get(chain.join(" < ")) ?? 0) + time);
}

console.log(`${wanted}: ${(under / 1000).toFixed(0)} ms inclusive, ${((under / total) * 100).toFixed(1)}% of advance`);

for (const [chain, time] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`${((time / total) * 100).toFixed(1).padStart(5)}%  ${chain}`);
}
