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
// 1. every glTF parser
const parsers = new Set();
for (let i = 0; i < count; i++) if (typeOf(i) === "object" && child(i, "associations") >= 0 && child(i, "json") >= 0 && child(i, "primitiveCache") >= 0) parsers.add(i);
retained("glTF parsers (gltf.parser of every file read)", parsers);
// and their binary chunks alone
const bodies = new Set();
for (const p of parsers) { const b = path(p, "extensions", "KHR_binary_glTF", "body"); if (b >= 0) bodies.add(b); }
retained("  of which their files' binary chunks (KHR_binary_glTF.body)", bodies);
// 2. the atlas's promise
const occ = path(view, "occluders", "at", "context", "atlas");
retained("view.occluders.at's context's `atlas` promise", new Set(occ >= 0 ? [occ] : []));
// 3. compressed textures' mipmaps
const mips = new Set();
for (let i = 0; i < count; i++) if (typeOf(i) === "object" && child(i, "isCompressedTexture") !== -2) { if (child(i, "mipmaps") >= 0 && child(i, "source") >= 0 && child(i, "image") >= 0 && nameOf(i) === "ln") mips.add(child(i, "mipmaps")); }
retained("compressed textures' mipmaps (every CompressedTexture.mipmaps)", mips);
// 4. the town
const town = path(game, "town", "object");
retained("game.town.object (the start town's meshes)", new Set([town]));
const townKids = child(town, "children");
const list = kids(townKids).filter(([n, , t]) => t === "element");
const last = list.reduce((a, b) => (Number(b[0]) > Number(a[0]) ? b : a));
console.log("town children", list.length, "last", last[0], nameOf(last[1]), "named", (() => { const n = child(last[1], "name"); return n >= 0 ? nameOf(n) : "?"; })());
retained("  of which its trees (the last child: plantTrees')", new Set([last[1]]));
// its meshes' geometries' attribute arrays (all meshes directly under the town)
const geomArrays = (root) => { const set = new Set(); const seen = new Set(); const stack = [root]; while (stack.length) { const i = stack.pop(); if (seen.has(i)) continue; seen.add(i); const g = child(i, "geometry"); if (g >= 0) { const attrs = child(g, "attributes"); if (attrs >= 0) for (const [, a] of kids(attrs)) { const arr = child(a, "array"); if (arr >= 0) set.add(arr); } const idx = child(g, "index"); if (idx >= 0) { const arr = child(idx, "array"); if (arr >= 0) set.add(arr); } } const ch = child(i, "children"); if (ch >= 0) for (const [, k, t] of kids(ch)) if (t === "element") stack.push(k); } return set; };
retained("  its meshes' attributes' and indices' arrays", geomArrays(town));
// 5. the chunks
const chunksObject = path(game, "chunks", "object");
retained("game.chunks.object (the chunks' meshes)", new Set([chunksObject]));
retained("  its meshes' attributes' and indices' arrays", geomArrays(chunksObject));
// by name of mesh under chunks
{
    const byKind = new Map(); const seen = new Set(); const stack = [chunksObject];
    while (stack.length) { const i = stack.pop(); if (seen.has(i)) continue; seen.add(i); const g = child(i, "geometry"); if (g >= 0) { const n = child(i, "name"); const name = (n >= 0 ? nameOf(n) : "?").replace(/[-\d.,]+ ?/g, "#"); if (!byKind.has(name)) byKind.set(name, new Set()); for (const a of geomArrays(i)) byKind.get(name).add(a); } const ch = child(i, "children"); if (ch >= 0) for (const [, k, t] of kids(ch)) if (t === "element") stack.push(k); }
    for (const [name, set] of byKind) { const r = all - reach(set); if (r > 300000) console.log(`     ${name}: ${set.size} arrays keep ${MB(r)} MB`); }
}
// 6. Solids left alive
retained("Solid builders still alive (art/engine/solid.js)", byName("Solid"));
// 7. the whole scene's meshes' arrays, and those of the interiors
const scene = path(view, "scene");
retained("view.scene's meshes' attributes' and indices' arrays (all of them)", geomArrays(scene));
// 8. the woodland
retained("game.chunks.woodland", new Set([path(game, "chunks", "woodland")]));
retained("game.setIn (the scenes set in)", new Set([path(game, "setIn")]));
retained("game.interiors", new Set([path(game, "interiors")]));
retained("game.navBaker", new Set([path(game, "navBaker")]));
retained("game.chunks.overworld", new Set([path(game, "chunks", "overworld")]));
retained("game.kit (characters)", new Set([path(game, "kit")]));
retained("game.avatars", new Set([path(game, "avatars")]));
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
