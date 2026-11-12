// What some things in the lead's heap snapshot alone keep alive (their retained size): everything
// reachable from the roots, less what's still reachable with those things taken away.
import { readFileSync } from "node:fs";
const file = process.argv[2];
const t0 = Date.now();
const snap = JSON.parse(readFileSync(file, "utf8"));
const { node_fields: NF, edge_fields: EF, node_types, edge_types } = snap.snapshot.meta;
const [nT, nN, nS, nE] = [NF.indexOf("type"), NF.indexOf("name"), NF.indexOf("self_size"), NF.indexOf("edge_count")];
const [eT, eN, eTo] = [EF.indexOf("type"), EF.indexOf("name_or_index"), EF.indexOf("to_node")];
const NL = NF.length, EL = EF.length;
const nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
const count = nodes.length / NL;
const NT = node_types[0], ET = edge_types[0];
const WEAK = ET.indexOf("weak"), SHORTCUT = ET.indexOf("shortcut");
const first = new Uint32Array(count + 1);
for (let i = 0, e = 0; i < count; i++) { first[i] = e; e += nodes[i * NL + nE]; first[i + 1] = e; }
console.error(`parsed ${count} nodes in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const typeOf = (i) => NT[nodes[i * NL + nT]];
const nameOf = (i) => strings[nodes[i * NL + nN]];
const selfOf = (i) => nodes[i * NL + nS];
const edgeName = (e) => { const t = ET[edges[e * EL + eT]]; return t === "element" || t === "hidden" ? String(edges[e * EL + eN]) : strings[edges[e * EL + eN]]; };
const kids = (i) => { const out = []; for (let e = first[i]; e < first[i + 1]; e++) out.push([edgeName(e), edges[e * EL + eTo] / NL, ET[edges[e * EL + eT]]]); return out; };
const child = (i, name) => { for (let e = first[i]; e < first[i + 1]; e++) if (edgeName(e) === name && edges[e * EL + eT] !== WEAK) return edges[e * EL + eTo] / NL; return -1; };
function reach(blocked, blockedEdges = null) {
    const seen = new Uint8Array(count);
    const stack = [0];
    seen[0] = 1;
    let bytes = 0;
    while (stack.length) {
        const i = stack.pop();
        bytes += selfOf(i);
        for (let e = first[i]; e < first[i + 1]; e++) {
            const t = edges[e * EL + eT];
            if (t === WEAK || t === SHORTCUT) continue;
            if (blockedEdges && blockedEdges.has(e)) continue;
            const to = edges[e * EL + eTo] / NL;
            if (!seen[to] && !(blocked && blocked.has(to))) { seen[to] = 1; stack.push(to); }
        }
    }
    return bytes;
}
const all = reach(null);
const MB = (b) => (b / 1048576).toFixed(1);
console.log(`reachable in all: ${MB(all)} MB`);
const retained = (label, set, edgeSet = null) => { if (!set.size && !(edgeSet?.size)) { console.log(`${label}: none found`); return 0; } const r = all - reach(set, edgeSet); console.log(`${label}: ${set.size} things${edgeSet ? `, ${edgeSet.size} edges` : ""} keep ${MB(r)} MB`); return r; };
// By class
const byName = (name, type = "object") => { const set = new Set(); for (let i = 0; i < count; i++) if (nodes[i * NL + nT] === NT.indexOf(type) && nameOf(i) === name) set.add(i); return set; };
// The game
let win = -1;
for (let i = 0; i < count && win < 0; i++) if (typeOf(i) === "object" && nameOf(i).startsWith("Window") && child(i, "pellagos") >= 0) win = i;
const path = (from, ...names) => names.reduce((at, name) => (at < 0 ? -1 : child(at, name)), from);
const game = path(win, "pellagos", "debug", "game");
const view = path(win, "pellagos", "debug", "view");
console.log("window", win, "game", game, nameOf(game), "view", view, nameOf(view));
// (second pass: breakdowns)
const geomArrays = (i) => { const set = new Set(); const g = child(i, "geometry"); if (g >= 0) { const attrs = child(g, "attributes"); if (attrs >= 0) for (const [, a] of kids(attrs)) { let arr = child(a, "array"); if (arr < 0) arr = path(a, "data", "array"); if (arr >= 0) set.add(arr); } const idx = child(g, "index"); if (idx >= 0) { const arr = child(idx, "array"); if (arr >= 0) set.add(arr); } const morph = child(g, "morphAttributes"); if (morph >= 0) for (const [, list] of kids(morph)) for (const [, a, t] of kids(list)) if (t === "element") { const arr = child(a, "array"); if (arr >= 0) set.add(arr); } } const im = child(i, "instanceMatrix"); if (im >= 0) { const arr = child(im, "array"); if (arr >= 0) set.add(arr); } return set; };

const strOf = (i, prop) => { const n = child(i, prop); return n >= 0 && (typeOf(n) === "string" || typeOf(n) === "concatenated string" || typeOf(n) === "sliced string") ? nameOf(n) : ""; };
const numArr = (i) => i; // typed array node
// compressed textures: objects with mipmaps + source + isCompressedTexture marker is on the prototype; use the class name
const textures = [];
for (let i = 0; i < count; i++) if (typeOf(i) === "object" && child(i, "mipmaps") >= 0 && child(i, "source") >= 0 && child(i, "anisotropy") !== -1 && child(i, "wrapS") !== -1 && child(i, "uuid") >= 0) textures.push(i);
const byClass = new Map();
for (const t of textures) { const k = nameOf(t); if (!byClass.has(k)) byClass.set(k, new Set()); byClass.get(k).add(t); }
console.log("textures by class:", [...byClass].map(([k, s]) => `${k}:${s.size}`).join(" "));
for (const [k, set] of byClass) {
    const mips = new Set(), datas = new Set();
    for (const t of set) { const m = child(t, "mipmaps"); if (m >= 0) mips.add(m); const d = path(t, "source", "data"); if (d >= 0) datas.add(d); }
    retained(`  class ${k}: their mipmaps`, mips);
    retained(`  class ${k}: their source.data (pictures' pixels on the page)`, datas);
}
// The town, by its meshes' names
const town = path(game, "town", "object");
const breakdown = (root, label, keyOf) => {
    const byKind = new Map(); const seen = new Set(); const stack = [[root, ""]];
    while (stack.length) { const [i, top] = stack.pop(); if (seen.has(i)) continue; seen.add(i); const g = child(i, "geometry"); const name = strOf(i, "name"); const key = keyOf(i, name, top); if (g >= 0) { if (!byKind.has(key)) byKind.set(key, new Set()); for (const a of geomArrays(i)) byKind.get(key).add(a); } const ch = child(i, "children"); if (ch >= 0) for (const [, k, t] of kids(ch)) if (t === "element") stack.push([k, top || name || nameOf(i)]); }
    const rows = [...byKind].map(([name, set]) => [name, set.size, all - reach(set)]).sort((a, b) => b[2] - a[2]);
    console.log(label);
    for (const [name, n, r] of rows) if (r > 400000) console.log(`     ${MB(r).padStart(6)} MB  ${String(n).padStart(4)} arrays  ${name}`);
};
breakdown(town, "the town's meshes' arrays, by mesh:", (i, name, top) => `${top ? top + "/" : ""}${name.replace(/ -?\d+,-?\d+$/, " #")}`);
const scene = path(view, "scene");
breakdown(scene, "the scene's meshes' arrays, by the scene's child they're under:", (i, name, top) => (top || name || nameOf(i)).replace(/[-\d.,]+ ?/g, "#"));
// what kind of meshes under each interior
for (const [, k, t] of kids(child(scene, "children"))) { if (t !== "element") continue; const name = strOf(k, "name"); if (/tavern|floor|taproom|upstairs|cellar|inn|house|shop|smithy|temple|guild/i.test(name)) breakdown(k, `under scene child "${name}":`, (i, n2) => `${nameOf(i)} ${n2.replace(/[-\d.,]+ ?/g, "#")}`); }
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
