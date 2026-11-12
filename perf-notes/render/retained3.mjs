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
// Shortest ways from the roots (breadth first): each node's parent and the edge's name
const parent = new Int32Array(count).fill(-1), via = new Int32Array(count).fill(-1);
{
    const queue = new Uint32Array(count); let qh = 0, qt = 0; queue[qt++] = 0; parent[0] = 0;
    while (qh < qt) { const i = queue[qh++]; for (let e = first[i]; e < first[i + 1]; e++) { const t = edges[e * EL + eT]; if (t === WEAK || t === SHORTCUT) continue; const to = edges[e * EL + eTo] / NL; if (parent[to] < 0) { parent[to] = i; via[to] = e; queue[qt++] = to; } } }
}
const wayTo = (i, hops = 9) => { const names = []; for (let at = i; at !== 0 && names.length < 40; at = parent[at]) names.push(edgeName(via[at])); const all = names.reverse(); const start = all.indexOf("pellagos"); return (start >= 0 ? all.slice(start + 1) : all).slice(0, 14).join("."); };
const textures = [];
for (let i = 0; i < count; i++) if (typeOf(i) === "object" && child(i, "mipmaps") >= 0 && child(i, "source") >= 0 && child(i, "uuid") >= 0 && child(i, "repeat") >= 0) textures.push(i);
// pictures of data: by how much each keeps, and the way to it
const rows = [];
for (const t of textures) { const d = path(t, "source", "data"); if (d < 0) continue; const arr = child(d, "data"); if (arr < 0) continue; rows.push([t, arr]); }
const sizeOfArr = (arr) => { let b = selfOf(arr); const buf = child(arr, "buffer"); if (buf >= 0) { b += selfOf(buf); const bs = child(buf, "backing_store"); if (bs >= 0) b += selfOf(bs); } return b; };
const seenArr = new Set(); const groups = new Map();
for (const [t, arr] of rows) { if (seenArr.has(arr)) continue; seenArr.add(arr); const bytes = sizeOfArr(arr); const way = wayTo(t).replace(/\.\d+\./g, ".#.").replace(/\.\d+$/, ".#"); const key = `${nameOf(t)} ${way}`; const g = groups.get(key) ?? { n: 0, bytes: 0 }; g.n++; g.bytes += bytes; groups.set(key, g); }
console.log("pictures of data still on the page (their pixels), by the shortest way to them:");
for (const [key, g] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 45)) console.log(`  ${MB(g.bytes).padStart(6)} MB ${String(g.n).padStart(4)}  ${key}`);
// compressed pictures' mipmaps likewise
const cgroups = new Map(); const seenM = new Set();
for (const t of textures) { if (nameOf(t) !== "ln") continue; const m = child(t, "mipmaps"); if (m < 0 || seenM.has(m)) continue; seenM.add(m); let bytes = 0; for (const [, lvl, ty] of kids(m)) { if (ty !== "element") continue; const arr = child(lvl, "data"); if (arr >= 0) bytes += sizeOfArr(arr); } const way = wayTo(t).replace(/\.\d+\./g, ".#.").replace(/\.\d+$/, ".#"); const g = cgroups.get(way) ?? { n: 0, bytes: 0 }; g.n++; g.bytes += bytes; cgroups.set(way, g); }
console.log("compressed pictures' mipmaps on the page, by the shortest way to them:");
for (const [key, g] of [...cgroups].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 30)) console.log(`  ${MB(g.bytes).padStart(6)} MB ${String(g.n).padStart(4)}  ${key}`);
// The scene's meshes' arrays by the scene's child
const scene = path(view, "scene");
const nameStr = (i) => { const n = child(i, "name"); if (n < 0) return ""; const ty = typeOf(n); if (ty === "string") return nameOf(n); if (ty === "concatenated string") { const a = child(n, "first"), b = child(n, "second"); return (a >= 0 ? nameOf(a) : "") + (b >= 0 ? nameOf(b) : ""); } return ""; };
const sceneRows = [];
for (const [idx, k, t] of kids(child(scene, "children"))) {
    if (t !== "element") continue;
    const sets = new Map(); const seen = new Set(); const stack = [[k, 0, ""]];
    while (stack.length) { const [i, depth, sub] = stack.pop(); if (seen.has(i)) continue; seen.add(i); const key = sub; if (!sets.has(key)) sets.set(key, new Set()); for (const a of geomArrays(i)) sets.get(key).add(a); const ch = child(i, "children"); if (ch >= 0) for (const [, c, ty] of kids(ch)) if (ty === "element") stack.push([c, depth + 1, depth === 0 ? (nameStr(c) || nameOf(c)).replace(/[-\d.,]+ ?/g, "#") : sub]); }
    const allSet = new Set(); for (const s of sets.values()) for (const a of s) allSet.add(a);
    if (!allSet.size) continue;
    const r = all - reach(allSet);
    sceneRows.push([r, idx, nameStr(k) || nameOf(k), allSet.size, sets]);
}
sceneRows.sort((a, b) => b[0] - a[0]);
console.log("the scene's children, by what their meshes' arrays keep:");
for (const [r, idx, name, n, sets] of sceneRows.slice(0, 16)) {
    console.log(`  ${MB(r).padStart(6)} MB ${String(n).padStart(5)} arrays  [${idx}] ${name}`);
    if (r > 6e6) { const subs = [...sets].map(([key, s]) => [key, s.size, all - reach(s)]).sort((a, b) => b[2] - a[2]).slice(0, 8); for (const [key, n2, r2] of subs) if (r2 > 500000) console.log(`           ${MB(r2).padStart(6)} MB ${String(n2).padStart(5)}  ${key || "(itself)"}`); }
}
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
