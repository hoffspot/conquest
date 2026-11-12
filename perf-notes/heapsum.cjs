// Summarize a V8 heap snapshot: what kinds of thing hold the memory, the biggest single things,
// and (roughly) who holds them: each thing counted under the shortest way to it from the roots.
//   node --max-old-space-size=12000 heapsum.cjs out/<tag>.heapsnapshot [minMB to expand, default 4]
const fs = require("fs");
const file = process.argv[2];
const minMB = Number(process.argv[3] ?? 4);
const snap = JSON.parse(fs.readFileSync(file, "utf8"));
const { node_fields: NF, node_types: NT, edge_fields: EF, edge_types: ET } = snap.snapshot.meta;
const { nodes, edges, strings } = snap;
const nf = NF.length, ef = EF.length;
const [nType, nName, nSelf, nEdges] = ["type", "name", "self_size", "edge_count"].map((f) => NF.indexOf(f));
const [eType, eName, eTo] = ["type", "name_or_index", "to_node"].map((f) => EF.indexOf(f));
const types = NT[0], etypes = ET[0];
const count = nodes.length / nf;
const mb = (b) => +(b / 1048576).toFixed(1);

const firstEdge = new Uint32Array(count + 1);
for (let i = 0; i < count; i++) firstEdge[i + 1] = firstEdge[i] + nodes[i * nf + nEdges];

let total = 0;
const byType = new Map(), byName = new Map();
for (let i = 0; i < count; i++) {
    const self = nodes[i * nf + nSelf];
    const type = types[nodes[i * nf + nType]];
    let name = strings[nodes[i * nf + nName]];
    if (type === "string" || type === "concatenated string" || type === "sliced string") name = "(string)";
    else if (type === "code") name = "(code) " + name.slice(0, 40);
    else if (type === "closure") name = "(closure)";
    else if (type === "number" || type === "bigint") name = "(number)";
    else name = name.slice(0, 60);
    total += self;
    byType.set(type, (byType.get(type) ?? 0) + self);
    const key = `${type}: ${name}`;
    const at = byName.get(key) ?? [0, 0];
    at[0] += self; at[1]++;
    byName.set(key, at);
}
console.log(`nodes ${count}, edges ${edges.length / ef}, total self ${mb(total)} MB`);
console.log("\nBy type (MB):");
for (const [k, v] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`  ${String(mb(v)).padStart(8)}  ${k}`);
console.log("\nBy kind and name, top 50 (MB, count):");
for (const [k, [b, n]] of [...byName].sort((a, b) => b[1][0] - a[1][0]).slice(0, 50)) console.log(`  ${String(mb(b)).padStart(8)}  ${String(n).padStart(8)}  ${k}`);

// The shortest way to each thing from the roots (not by weak links or shortcuts), named links first
const parent = new Int32Array(count).fill(-1);
const via = new Int32Array(count).fill(-1);
const depth = new Int32Array(count).fill(-1);
const order = new Int32Array(count);
let head = 0, tail = 0;
order[tail++] = 0; depth[0] = 0; parent[0] = 0;
while (head < tail) {
    const i = order[head++];
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e++) {
        const type = etypes[edges[e * ef + eType]];
        if (type === "weak" || type === "shortcut") continue;
        const to = edges[e * ef + eTo] / nf;
        if (parent[to] === -1) { parent[to] = i; via[to] = e; depth[to] = depth[i] + 1; order[tail++] = to; }
    }
}
const subtree = new Float64Array(count);
for (let i = 0; i < count; i++) subtree[i] = nodes[i * nf + nSelf];
for (let k = tail - 1; k > 0; k--) { const i = order[k]; subtree[parent[i]] += subtree[i]; }
const label = (i) => `${types[nodes[i * nf + nType]]} ${strings[nodes[i * nf + nName]].slice(0, 50).replace(/\s+/g, " ")}`;
const edgeName = (e) => { const type = etypes[edges[e * ef + eType]]; const v = edges[e * ef + eName]; return type === "element" || type === "hidden" ? `[${v}]` : `${strings[v]}`.slice(0, 40); };
const children = new Map();
for (let k = 1; k < tail; k++) { const i = order[k]; if (subtree[i] >= minMB * 1048576) { const p = parent[i]; if (!children.has(p)) children.set(p, []); children.get(p).push(i); } }
console.log(`\nWho holds it (each thing under the shortest way to it; those of ${minMB} MB and more):`);
const show = (i, indent) => {
    const kids = (children.get(i) ?? []).sort((a, b) => subtree[b] - subtree[a]);
    for (const c of kids) {
        console.log(`${String(mb(subtree[c])).padStart(8)}  ${"  ".repeat(indent)}.${edgeName(via[c])} → ${label(c)}`);
        if (indent < 14) show(c, indent + 1);
    }
};
show(0, 0);

// The biggest single things, and the way to each
console.log("\nBiggest single things (MB) and the way to each:");
const big = [];
for (let i = 0; i < count; i++) if (nodes[i * nf + nSelf] > 2 * 1048576) big.push(i);
big.sort((a, b) => nodes[b * nf + nSelf] - nodes[a * nf + nSelf]);
for (const i of big.slice(0, 45)) {
    const way = [];
    for (let at = i; at !== 0 && way.length < 14; at = parent[at]) { if (parent[at] === -1) { way.push("(unreached)"); break; } way.push(edgeName(via[at])); }
    console.log(`  ${String(mb(nodes[i * nf + nSelf])).padStart(7)}  ${label(i)}  ←  ${way.join(" ← ")}`);
}
console.log(`\n${big.length} things over 2 MB: ${mb(big.reduce((s, i) => s + nodes[i * nf + nSelf], 0))} MB`);
