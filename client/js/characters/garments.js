// Clothing and armour fitted to the body: shirts, trousers, boots, gloves, breastplates...
//
// A garment is a region of the body's own surface, grown outward into a shell. Its region is a
// function over the body ("inside" > 0), written with measurements that fit any body: how far
// down the arm (0 at the shoulder, 0.5 at the elbow, 1 at the wrist), down the leg, heights of
// the waist, hips and neck. The body's triangles are cut exactly along the region's edge (so hems
// are smooth, not jagged), pushed out along the body's normals by the garment's thickness (plus
// any looseness), smoothed (a breastplate is smoother than a shirt) and given a hem: a strip
// folding back to the skin, so the garment has visible thickness at its edges.
//
// Because every garment vertex comes from the body's surface, it inherits the body's skin
// weights and texture coordinates: it bends exactly like the skin, and it can be painted in the
// body's texture layout. The skin under an opaque garment is hidden (it can't show through, and
// it's not drawn), and so is any garment under another.

import * as THREE from "three";
import { faceFrame } from "./face.js";
import { fbm, smoothstep } from "./noise.js";

const ARM = /^(Left|Right)(Arm|ForeArm)$/;
const HAND = /^(Left|Right)Hand/;
const LEG = /^(Left|Right)(UpLeg|Leg)$/;
const FOOT = /^(Left|Right)(Foot|ToeBase)$/;

/**
 * Measurements of the body at every vertex, for garments' regions: { region ("head", "torso",
 * "arm", "hand", "leg", "foot"), side (1 left, -1 right), arm and leg (fractions down the
 * limb), y, front (how far forward of the body's middle), face ([x, y, z] face coordinates) },
 * plus the landmarks' heights: { waist, hips, crotch, chest, armpit, neck }.
 */
export function measureBody(character) {
    const { human, rig, positions } = character;
    const head = (name) => rig.heads[rig.index.get(name)];
    const landmarks = {
        neck: head("Neck").y,
        chest: head("Spine2").y,
        waist: head("Spine").y,
        hips: head("Hips").y,
        crotch: head("LeftUpLeg").y - 0.07 * (character.height / 1.7),
        armpit: head("LeftArm").y - 0.08 * (character.height / 1.7),
        neckZ: head("Neck").z,
        ankle: head("LeftFoot").y,
        balls: [head("LeftToeBase"), head("RightToeBase")],
        height: character.height,
    };
    const face = faceFrame(human, positions);
    const chains = {};

    for (const side of ["Left", "Right"]) {
        chains[`arm${side}`] = [head(`${side}Arm`), head(`${side}ForeArm`), head(`${side}Hand`)];
        chains[`leg${side}`] = [head(`${side}UpLeg`), head(`${side}Leg`), head(`${side}Foot`)];
    }

    // How far along the foot, from the ankle (0) to the ball of the foot (1), level with the ground
    const feet = {};

    for (const side of ["Left", "Right"]) {
        const ankle = head(`${side}Foot`);
        const axis = head(`${side}ToeBase`).clone().sub(ankle).setY(0);
        const length = axis.length();

        axis.normalize();
        feet[side] = (point) => (point.x - ankle.x) * axis.x / length + (point.z - ankle.z) * axis.z / length;
    }

    const p = new THREE.Vector3();
    const along = (chain) => {
        // Fraction along a two-segment chain: 0 at its start, 0.5 at its joint, 1 at its end,
        // carrying on past either end
        const [a, b, c] = chain;
        const first = segment(p, a, b);
        const second = segment(p, b, c);

        return first.distance <= second.distance ? first.t * 0.5 : 0.5 + second.t * 0.5;
    };
    const vertices = [];

    for (let v = 0; v < human.vertexCount; v++) {
        p.fromArray(positions, v * 3);

        const name = human.bones[human.skinIndices[v * 4]].name;
        const side = p.x >= 0 ? "Left" : "Right";
        const region = name === "Head" ? "head" : HAND.test(name) ? "hand" : ARM.test(name) ? "arm" : LEG.test(name) ? "leg" : FOOT.test(name) ? "foot" : "torso";

        vertices.push({
            region,
            side: side === "Left" ? 1 : -1,
            arm: along(chains[`arm${side}`]),
            leg: along(chains[`leg${side}`]),
            foot: feet[side](p),
            x: p.x,
            y: p.y,
            z: p.z,
            face: face.toFace(p.x, p.y, p.z),
        });
    }

    return { vertices, landmarks };
}

/** Where a point is along a segment: t (0 at a, 1 at b, unclamped) and its distance from it. */
function segment(p, a, b) {
    const ab = b.clone().sub(a);
    const t = p.clone().sub(a).dot(ab) / ab.lengthSq();
    const closest = a.clone().addScaledVector(ab, Math.min(1, Math.max(0, t)));

    return { t, distance: p.distanceTo(closest) };
}

// --- Regions, for the garments below ---

const OUTSIDE = -1;

/** Up to the neck: a round neckline, dipping at the front. */
const neckline = (v, l, depth = 0.03) => l.neck - depth - v.y - 0.035 * smoothstep(0, 0.12, v.z - l.neckZ);

/** The torso from `bottom` up to the neckline, arms down to `sleeve` (0 none, 1 the wrist). */
function top(bottom, sleeve, neck = 0.03) {
    return (v, l) => {
        switch (v.region) {
            case "torso":
                return Math.min(v.y - bottom(l), neckline(v, l, neck));
            case "arm":
                return sleeve - v.arm;
            default:
                return OUTSIDE;
        }
    };
}

/** From `waist` down the legs to `length` (0 the hip, 1 the ankle). */
function bottoms(waist, length) {
    return (v, l) => {
        switch (v.region) {
            case "torso":
                return waist(l) - v.y;
            case "leg":
                return length - v.leg;
            default:
                return OUTSIDE;
        }
    };
}

/**
 * Every garment: its slot, layer (under garments first), region, thickness and looseness (metres),
 * smoothing, and look (colour, roughness, metalness, a pattern painted in, a tiling detail).
 */
export const GARMENTS = Object.freeze({
    briefs: { label: "Briefs", slot: "underwear", layer: 0, thickness: 0.0015, smooth: 2, colour: "#d8d2c4", roughness: 0.8, pattern: "cloth", inside: bottoms((l) => l.hips + 0.02, 0.1) },
    chestWrap: { label: "Chest wrap", slot: "undershirt", layer: 0, thickness: 0.0015, smooth: 3, colour: "#d8d2c4", roughness: 0.8, pattern: "cloth", inside: top((l) => l.chest - 0.02, 0, 0.12) },
    shirt: { label: "Linen shirt", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.006, smooth: 4, colour: "#cbbd9c", roughness: 0.85, pattern: "cloth", inside: top((l) => l.hips - 0.03, 0.97) },
    tunic: { label: "Tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#6f2f2a", roughness: 0.85, pattern: "trim", trim: "#c6a45a", inside: top((l) => l.hips - 0.06, 0.45) },
    trousers: { label: "Trousers", slot: "legs", layer: 1, thickness: 0.004, loose: 0.006, smooth: 4, colour: "#4a3f35", roughness: 0.9, pattern: "cloth", inside: bottoms((l) => l.waist - 0.02, 0.97) },
    breeches: { label: "Leather breeches", slot: "legs", layer: 1, thickness: 0.005, loose: 0.004, smooth: 4, colour: "#5a3a24", roughness: 0.7, pattern: "leather", inside: bottoms((l) => l.waist - 0.02, 0.62) },
    jerkin: { label: "Leather jerkin", slot: "chest", layer: 2, thickness: 0.008, loose: 0.004, smooth: 6, colour: "#6b4428", roughness: 0.65, pattern: "leather", inside: top((l) => l.hips - 0.01, 0.12, 0.05) },
    gambeson: { label: "Gambeson", slot: "chest", layer: 2, thickness: 0.012, loose: 0.006, smooth: 6, colour: "#b3a47e", roughness: 0.9, pattern: "quilted", inside: top((l) => l.hips - 0.07, 0.9, 0.035) },
    mail: { label: "Mail shirt", slot: "chest", layer: 2, thickness: 0.007, loose: 0.004, smooth: 4, colour: "#9aa0a4", roughness: 0.45, metalness: 0.85, pattern: "mail", inside: top((l) => l.hips - 0.06, 0.4, 0.04) },
    breastplate: { label: "Breastplate", slot: "armour", layer: 3, thickness: 0.02, loose: 0.01, smooth: 14, colour: "#b8bec2", roughness: 0.28, metalness: 1, pattern: "plate", inside: top((l) => l.waist - 0.04, 0.02, 0.05) },
    bracers: { label: "Bracers", slot: "forearms", layer: 3, thickness: 0.009, smooth: 6, colour: "#5c3a22", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "arm" ? Math.min(v.arm - 0.64, 0.93 - v.arm) : OUTSIDE) },
    belt: { label: "Belt", slot: "waist", layer: 4, thickness: 0.012, smooth: 6, colour: "#3a2616", roughness: 0.55, pattern: "leather", inside: (v, l) => (v.region === "torso" ? Math.min(v.y - (l.waist - 0.07), l.waist - 0.025 - v.y) : OUTSIDE) },
    boots: { label: "Boots", slot: "feet", layer: 2, thickness: 0.007, smooth: 8, toeBox: true, colour: "#3b2a1c", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.66 : OUTSIDE) },
    sabatons: { label: "Plate boots", slot: "feet", layer: 2, thickness: 0.012, smooth: 10, toeBox: true, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.72 : OUTSIDE) },
    gloves: { label: "Gloves", slot: "hands", layer: 2, thickness: 0.002, smooth: 1, colour: "#4a3322", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "hand" ? 1 : v.region === "arm" ? v.arm - 0.9 : OUTSIDE) },
    gauntlets: { label: "Gauntlets", slot: "hands", layer: 2, thickness: 0.007, smooth: 2, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "hand" ? 1 : v.region === "arm" ? v.arm - 0.8 : OUTSIDE) },
    greaves: { label: "Greaves", slot: "shins", layer: 3, thickness: 0.014, smooth: 8, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "leg" ? Math.min(v.leg - 0.56, 0.86 - v.leg) : OUTSIDE) },
    straps: { label: "Pack straps", slot: "straps", layer: 5, thickness: 0.012, smooth: 3, colour: "#2e1d12", roughness: 0.6, pattern: "leather", hidden: true, inside: (v, l) => (v.region === "torso" ? Math.min(0.016 * (l.height / 1.7) - Math.abs(Math.abs(v.x) - 0.085 * (l.height / 1.7)), v.y - l.armpit + 0.04) : OUTSIDE) },
    loincloth: { label: "Loincloth", slot: "underwear", layer: 0, thickness: 0.003, smooth: 3, colour: "#5b4632", roughness: 0.9, pattern: "leather", inside: bottoms((l) => l.hips + 0.03, 0.2) },
});

/**
 * Build a garment on a character: { geometry, covers (the body triangles it covers, a Set of
 * body triangle numbers), sources (the body triangle each of its triangles comes from), garment }.
 * `measures` is measureBody(character).
 */
export function buildGarment(character, id, measures) {
    const garment = GARMENTS[id];
    const { human, positions, normals } = character;
    const { vertices, landmarks } = measures;
    const inside = new Float32Array(human.vertexCount);

    // Footwear with a toe box stops at the ball of the foot; the toe box is built separately
    const cut = (v) => (garment.toeBox && vertices[v].region === "foot" ? Math.min(1, TOE_CUT - vertices[v].foot) : 1);

    for (let v = 0; v < human.vertexCount; v++) {
        inside[v] = human.partOf[v] === 0 ? Math.min(garment.inside(vertices[v], landmarks), cut(v)) : OUTSIDE;
    }

    const body = human.renderIndices("body");
    const source = human.renderSource;
    const covers = new Set();

    // (the toes under a toe box aren't drawn)
    if (garment.toeBox) {
        for (let t = 0; t < body.length; t += 3) {
            if ([body[t], body[t + 1], body[t + 2]].some((r) => vertices[source[r]].region === "foot" && vertices[source[r]].foot > TOE_CUT - 0.05)) {
                covers.add(t / 3);
            }
        }
    }

    // Cut the body's triangles along the region's edge. Vertices are either the body's (by render
    // vertex) or new ones on its edges (by the two render vertices and where along)
    const points = new Map(); // key -> index into the lists below
    const list = [];
    const triangles = [];
    const sources = []; // the body triangle each triangle comes from
    const point = (a, b = a, t = 0) => {
        const key = a === b ? `${a}` : a < b ? `${a}:${b}` : `${b}:${a}`;

        if (!points.has(key)) {
            points.set(key, list.length);
            list.push(a < b || a === b ? { a, b, t } : { a: b, b: a, t: 1 - t });
        }

        return points.get(key);
    };

    for (let t = 0; t < body.length; t += 3) {
        const corners = [body[t], body[t + 1], body[t + 2]];
        const values = corners.map((r) => inside[source[r]]);
        const kept = values.filter((value) => value > 0).length;

        if (kept === 0) {
            continue;
        }

        if (kept === 3) {
            covers.add(t / 3);
            triangles.push(point(corners[0]), point(corners[1]), point(corners[2]));
            sources.push(t / 3);
            continue;
        }

        // Clip the triangle to the inside (Sutherland-Hodgman against one edge)
        const polygon = [];

        for (let k = 0; k < 3; k++) {
            const a = corners[k];
            const b = corners[(k + 1) % 3];
            const va = values[k];
            const vb = values[(k + 1) % 3];

            if (va > 0) {
                polygon.push(point(a));
            }

            if ((va > 0) !== (vb > 0)) {
                polygon.push(point(a, b, va / (va - vb)));
            }
        }

        for (let k = 1; k < polygon.length - 1; k++) {
            triangles.push(polygon[0], polygon[k], polygon[k + 1]);
            sources.push(t / 3);
        }
    }

    if (!triangles.length) {
        return null;
    }

    // Shared positions: vertices on the same body vertex (or the same point on the same edge)
    // are one point, whatever their texture coordinates, so smoothing and hems ignore UV seams
    const shared = new Map();
    const sharedOf = list.map(({ a, b, t }) => {
        const sa = source[a];
        const sb = source[b];
        const key = sa === sb || t === 0 ? `${sa}` : t === 1 ? `${sb}` : sa < sb ? `${sa}:${sb}:${t.toFixed(4)}` : `${sb}:${sa}:${(1 - t).toFixed(4)}`;

        if (!shared.has(key)) {
            shared.set(key, shared.size);
        }

        return shared.get(key);
    });
    const count = shared.size;
    const base = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const onEdge = new Uint8Array(count);

    list.forEach(({ a, b, t }, i) => {
        const s = sharedOf[i];
        const sa = source[a] * 3;
        const sb = source[b] * 3;

        for (let k = 0; k < 3; k++) {
            base[s * 3 + k] = positions[sa + k] * (1 - t) + positions[sb + k] * t;
            normal[s * 3 + k] = normals[sa + k] * (1 - t) + normals[sb + k] * t;
        }

        if (t > 0 && t < 1) {
            onEdge[s] = 1;
        }
    });

    for (let s = 0; s < count; s++) {
        const length = Math.hypot(normal[s * 3], normal[s * 3 + 1], normal[s * 3 + 2]) || 1;

        normal[s * 3] /= length;
        normal[s * 3 + 1] /= length;
        normal[s * 3 + 2] /= length;
    }

    // Neighbours and the garment's edge (sides used by one triangle only)
    const neighbours = Array.from({ length: count }, () => new Set());
    const sides = new Map();

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const a = sharedOf[triangles[t + k]];
            const b = sharedOf[triangles[t + ((k + 1) % 3)]];

            neighbours[a].add(b);
            neighbours[b].add(a);

            const key = a < b ? `${a}:${b}` : `${b}:${a}`;

            sides.set(key, (sides.get(key) ?? 0) + 1);
        }
    }

    for (const [key, uses] of sides) {
        if (uses === 1) {
            const [a, b] = key.split(":").map(Number);

            onEdge[a] = onEdge[b] = 1;
        }
    }

    // Grow outward, then smooth, keeping at least most of the thickness everywhere
    const thickness = garment.thickness + (garment.loose ?? 0);
    const shell = new Float32Array(count * 3);

    for (let j = 0; j < count * 3; j++) {
        shell[j] = base[j] + normal[j] * thickness;
    }

    const smoothPasses = (passes, keepOut, only = null) => {
        for (let pass = 0; pass < passes; pass++) {
            const next = shell.slice();

            for (let s = 0; s < count; s++) {
                if (onEdge[s] || !neighbours[s].size || (only && !only.has(s))) {
                    continue;
                }

                for (let k = 0; k < 3; k++) {
                    let sum = 0;

                    for (const n of neighbours[s]) {
                        sum += shell[n * 3 + k];
                    }

                    next[s * 3 + k] = shell[s * 3 + k] * 0.4 + (sum / neighbours[s].size) * 0.6;
                }

                if (!keepOut) {
                    continue;
                }

                // Not closer to the skin than 70% of the thickness
                const out = (next[s * 3] - base[s * 3]) * normal[s * 3] + (next[s * 3 + 1] - base[s * 3 + 1]) * normal[s * 3 + 1] + (next[s * 3 + 2] - base[s * 3 + 2]) * normal[s * 3 + 2];

                if (out < thickness * 0.7) {
                    for (let k = 0; k < 3; k++) {
                        next[s * 3 + k] += normal[s * 3 + k] * (thickness * 0.7 - out);
                    }
                }
            }

            shell.set(next);
        }
    };

    smoothPasses(garment.smooth ?? 0, true);

    // The mesh: the shell, then a hem folding back to the skin along the garment's edge
    const out = {
        positions: [],
        uvs: [],
        skinIndices: [],
        skinWeights: [],
        indices: [],
    };
    const skinOf = (a, b, t) => mixSkin(human, source[a], source[b], t);

    list.forEach(({ a, b, t }, i) => {
        const s = sharedOf[i];

        out.positions.push(shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]);
        out.uvs.push(human.uvs[a * 2] * (1 - t) + human.uvs[b * 2] * t, human.uvs[a * 2 + 1] * (1 - t) + human.uvs[b * 2 + 1] * t);

        const [indices, weights] = skinOf(a, b, t);

        out.skinIndices.push(...indices);
        out.skinWeights.push(...weights);
    });

    out.indices.push(...triangles);

    // Points on the toe box cut (where the toe box joins on, with no hem)
    const onCut = new Uint8Array(count);

    if (garment.toeBox) {
        list.forEach(({ a, b, t }, i) => {
            const va = vertices[source[a]];
            const vb = vertices[source[b]];

            if (va.region === "foot" && vb.region === "foot" && Math.abs(va.foot * (1 - t) + vb.foot * t - TOE_CUT) < 1e-4) {
                onCut[sharedOf[i]] = 1;
            }
        });
    }

    // Hem: for each edge side, a strip from the shell back down to near the skin
    const hemDepth = Math.max(0.0015, thickness * 0.85);

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const i = triangles[t + k];
            const j = triangles[t + ((k + 1) % 3)];
            const a = sharedOf[i];
            const b = sharedOf[j];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;

            if (sides.get(key) !== 1 || (onCut[a] && onCut[b])) {
                continue;
            }

            const first = out.positions.length / 3;

            for (const [index, s] of [[i, a], [j, b]]) {
                for (let k2 = 0; k2 < 3; k2++) {
                    out.positions.push(shell[s * 3 + k2] - normal[s * 3 + k2] * hemDepth);
                }

                out.uvs.push(out.uvs[index * 2], out.uvs[index * 2 + 1]);
                out.skinIndices.push(...out.skinIndices.slice(index * 4, index * 4 + 4));
                out.skinWeights.push(...out.skinWeights.slice(index * 4, index * 4 + 4));
            }

            // The triangle runs i -> j, so its outside is to the right: keep the same winding
            out.indices.push(j, i, first, j, first, first + 1);
            sources.push(sources[t / 3], sources[t / 3]);
        }
    }

    const shellVertices = out.positions.length / 3;

    if (garment.toeBox) {
        const cap = { shell, sharedOf, sides, onCut, out, sources, human, positions, normals, vertices, thickness, landmarks };

        for (const side of [1, -1]) {
            addToeCap(cap, side);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(out.uvs, 2));
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(out.skinIndices), 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(out.skinWeights), 4, true));
    geometry.setIndex(out.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(out.indices, 1) : new THREE.Uint16BufferAttribute(out.indices, 1));
    geometry.computeVertexNormals();
    // Hem and toe cap vertices keep their own normals
    smoothNormalsAcrossSeams(geometry, [...sharedOf, ...new Array(out.positions.length / 3 - list.length).fill(-1)]);

    if (garment.toeBox) {
        joinToeCaps(geometry, shellVertices, out.capJoins ?? []);
    }

    return { geometry, covers, sources: Int32Array.from(sources), garment };
}

// Footwear with a toe box is cut this far along the foot (1 is the ball of the foot)
const TOE_CUT = 0.92;

/**
 * A toe box for one foot (side 1 left, -1 right): a smooth cap lofted forward from where the
 * boot was cut near the ball of the foot, following the outline of all the toes together, and
 * closed off in front of the longest. Each ring round the foot takes the furthest the toes reach
 * in every direction from the ring's middle (the gaps between toes bridged by their neighbours),
 * so the cap is the size of the toes, with no gaps between them. It's skinned from the foot to
 * the toes, so it bends with them.
 */
function addToeCap(cap, side) {
    const { shell, sharedOf, sides, onCut, out, sources, human, positions, normals, vertices, thickness } = cap;
    const RINGS = 16;
    const ANGLES = 32;

    // The cut loop, in order round the foot
    const next = new Map();
    const indexOf = new Map();

    sharedOf.forEach((s, i) => indexOf.set(s, indexOf.get(s) ?? i));

    for (const [key, uses] of sides) {
        const [a, b] = key.split(":").map(Number);

        if (uses === 1 && onCut[a] && onCut[b] && Math.sign(shell[a * 3]) === side) {
            next.set(a, [...(next.get(a) ?? []), b]);
            next.set(b, [...(next.get(b) ?? []), a]);
        }
    }

    if (next.size < 6) {
        return;
    }

    const loop = [next.keys().next().value];

    while (loop.length < next.size) {
        const [a, b] = next.get(loop[loop.length - 1]);
        const following = a === loop[loop.length - 2] || loop.includes(a) ? b : a;

        if (following === undefined || loop.includes(following)) {
            break;
        }

        loop.push(following);
    }

    // The toes, grown by the boot's thickness, and where they are in the texture
    const toes = [];
    const toeUVs = new Map();

    for (let v = 0; v < human.vertexCount; v++) {
        const vertex = vertices[v];

        if (human.partOf[v] === 0 && vertex.region === "foot" && vertex.side === side && vertex.foot > TOE_CUT - 0.02) {
            toes.push([0, 1, 2].map((k) => positions[v * 3 + k] + normals[v * 3 + k] * thickness));
            toes[toes.length - 1].vertex = v;
        }
    }

    human.renderSource.forEach((v, r) => {
        if (!toeUVs.has(v)) {
            toeUVs.set(v, [human.uvs[r * 2], human.uvs[r * 2 + 1]]);
        }
    });

    // The texture position of the toe nearest a point (so the boot's pattern carries on over it)
    const uvNear = (point) => {
        let best = null;
        let distance = Infinity;

        for (const toe of toes) {
            const d = (toe[0] - point[0]) ** 2 + (toe[1] - point[1]) ** 2 + (toe[2] - point[2]) ** 2;

            if (d < distance) {
                distance = d;
                best = toe;
            }
        }

        return toeUVs.get(best.vertex);
    };

    const at = (s) => [shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]];
    const loopPoints = loop.map(at);
    const loopCentre = [0, 1, 2].map((k) => loopPoints.reduce((sum, p) => sum + p[k], 0) / loopPoints.length);
    const z0 = loopCentre[2];
    const tip = Math.max(...toes.map((p) => p[2])) + thickness * 0.3;

    // Each ring's middle and outline, from the toes near it
    const rings = [];

    for (let j = 1; j <= RINGS; j++) {
        const z = z0 + (j / (RINGS + 0.5)) * (tip - z0);
        const near = toes.filter((p) => Math.abs(p[2] - z) < (tip - z0) / RINGS);
        const previous = rings[rings.length - 1];

        if (!near.length) {
            rings.push({ ...previous, z });
            continue;
        }

        const xs = near.map((p) => p[0]);
        const ys = near.map((p) => p[1]);
        const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        let radius = new Float32Array(ANGLES);

        for (const [x, y] of near) {
            const a = Math.round((((Math.atan2(y - centre[1], x - centre[0]) / (2 * Math.PI)) + 1) % 1) * ANGLES) % ANGLES;

            radius[a] = Math.max(radius[a], Math.hypot(x - centre[0], y - centre[1]));
        }

        // Bridge gaps between toes, fill directions with no toe, then round it off
        radius = radius.map((r, a) => Math.max(r, radius[(a + 1) % ANGLES], radius[(a + ANGLES - 1) % ANGLES], radius[(a + 2) % ANGLES], radius[(a + ANGLES - 2) % ANGLES]));

        for (let pass = 0; pass < 3; pass++) {
            radius = radius.map((r, a) => (r > 0 ? (r * 2 + (radius[(a + 1) % ANGLES] || r) + (radius[(a + ANGLES - 1) % ANGLES] || r)) / 4 : (radius[(a + 1) % ANGLES] + radius[(a + ANGLES - 1) % ANGLES]) / 2));
        }

        rings.push({ z, centre, radius });
    }

    // Rings smoothed along the foot, so it tapers evenly
    const smoothRings = rings.map((ring, j) => {
        const around = [rings[j - 1], ring, rings[j + 1]].filter(Boolean);

        return {
            z: ring.z,
            centre: [0, 1].map((k) => around.reduce((sum, r) => sum + r.centre[k], 0) / around.length),
            radius: ring.radius.map((_, a) => around.reduce((sum, r) => sum + r.radius[a], 0) / around.length),
        };
    });

    // Vertices: the cut loop's own, then each ring, then the tip
    const firstRing = out.positions.length / 3;
    const loopIndex = loop.map((s) => indexOf.get(s));
    const toeBone = human.boneIndex.get(side > 0 ? "LeftToeBase" : "RightToeBase");
    const radiusAt = (ring, angle) => {
        const f = (((angle / (2 * Math.PI)) + 1) % 1) * ANGLES;
        const a0 = Math.floor(f) % ANGLES;

        return ring.radius[a0] * (1 - (f - Math.floor(f))) + ring.radius[(a0 + 1) % ANGLES] * (f - Math.floor(f));
    };
    const addVertex = (position, uvFrom, towardToes) => {
        out.positions.push(...position);
        out.uvs.push(...uvNear(position));

        // From the foot's weights at the cut to the toe bone at the front
        const weights = new Map();

        for (let k = 0; k < 4; k++) {
            const bone = out.skinIndices[uvFrom * 4 + k];
            const weight = out.skinWeights[uvFrom * 4 + k] / 255;

            if (weight) {
                weights.set(bone, (weights.get(bone) ?? 0) + weight * (1 - towardToes));
            }
        }

        weights.set(toeBone, (weights.get(toeBone) ?? 0) + towardToes);

        const strongest = [...weights].sort((x, y) => y[1] - x[1]).slice(0, 4);
        const bytes = strongest.map(([, w]) => Math.round(w * 255));

        bytes[0] += 255 - bytes.reduce((sum, w) => sum + w, 0);

        while (strongest.length < 4) {
            strongest.push([0, 0]);
            bytes.push(0);
        }

        out.skinIndices.push(...strongest.map(([bone]) => bone));
        out.skinWeights.push(...bytes);
    };

    smoothRings.forEach((ring, j) => {
        const t = (j + 1) / RINGS;
        const blend = smoothstep(0, 0.35, t);

        loopPoints.forEach((p, i) => {
            const angle = Math.atan2(p[1] - loopCentre[1], p[0] - loopCentre[0]);
            const fromLoop = Math.hypot(p[0] - loopCentre[0], p[1] - loopCentre[1]);
            const centre = [loopCentre[0] + (ring.centre[0] - loopCentre[0]) * blend, loopCentre[1] + (ring.centre[1] - loopCentre[1]) * blend];
            const r = fromLoop + (radiusAt(ring, angle) - fromLoop) * blend;

            addVertex([centre[0] + Math.cos(angle) * r, centre[1] + Math.sin(angle) * r, ring.z], loopIndex[i], smoothstep(0.1, 0.6, t));
        });
    });

    const last = smoothRings[smoothRings.length - 1];
    const tipIndex = out.positions.length / 3;

    addVertex([last.centre[0], last.centre[1], tip], loopIndex[0], 1);

    // Triangles, facing out (checked on the first quad, flipped if needed)
    const n = loop.length;
    const vertex = (j, i) => (j < 0 ? loopIndex[i % n] : firstRing + j * n + (i % n));
    const triangles = [];

    for (let j = -1; j < RINGS - 1; j++) {
        for (let i = 0; i < n; i++) {
            triangles.push(vertex(j, i), vertex(j, i + 1), vertex(j + 1, i + 1), vertex(j, i), vertex(j + 1, i + 1), vertex(j + 1, i));
        }
    }

    for (let i = 0; i < n; i++) {
        triangles.push(vertex(RINGS - 1, i), vertex(RINGS - 1, i + 1), tipIndex);
    }

    const position = (index) => out.positions.slice(index * 3, index * 3 + 3);
    const [a, b, c] = [position(triangles[0]), position(triangles[1]), position(triangles[2])];
    const normal = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const outward = [a[0] - loopCentre[0], a[1] - loopCentre[1], 0];

    if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0) {
        for (let k = 0; k < triangles.length; k += 3) {
            [triangles[k + 1], triangles[k + 2]] = [triangles[k + 2], triangles[k + 1]];
        }
    }

    out.indices.push(...triangles);

    for (let k = 0; k < triangles.length / 3; k++) {
        sources.push(-1);
    }

    // The cut loop's vertices are shared with the boot; their normals are joined up later
    out.capJoins ??= [];
    out.capJoins.push(...loopIndex);
}

/** Recompute the normals where toe caps join their boots, from both sides. */
function joinToeCaps(geometry, shellVertices, joins) {
    if (!joins.length) {
        return;
    }

    // computeVertexNormals already averaged every triangle at each vertex, cap and boot alike;
    // only vertices split by texture seams along the join need their normals shared
    const normal = geometry.attributes.normal;
    const position = geometry.attributes.position;
    const byPlace = new Map();

    for (const i of joins) {
        const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;

        byPlace.set(key, [...(byPlace.get(key) ?? []), i]);
    }

    for (const group of byPlace.values()) {
        const sum = [0, 0, 0];

        for (const i of group) {
            sum[0] += normal.getX(i);
            sum[1] += normal.getY(i);
            sum[2] += normal.getZ(i);
        }

        const length = Math.hypot(...sum) || 1;

        for (const i of group) {
            normal.setXYZ(i, sum[0] / length, sum[1] / length, sum[2] / length);
        }
    }

    return shellVertices;
}

/**
 * Average the normals of vertices at the same point (texture seams split them). Returns
 * { sums (point -> normal), sharedOf }.
 */
function smoothNormalsAcrossSeams(geometry, sharedOf) {
    const normal = geometry.attributes.normal;
    const sums = new Map();

    sharedOf.forEach((s, i) => {
        if (s < 0) {
            return;
        }

        const sum = sums.get(s) ?? [0, 0, 0];

        sum[0] += normal.getX(i);
        sum[1] += normal.getY(i);
        sum[2] += normal.getZ(i);
        sums.set(s, sum);
    });

    sharedOf.forEach((s, i) => {
        if (s >= 0) {
            const [x, y, z] = sums.get(s);
            const length = Math.hypot(x, y, z) || 1;

            normal.setXYZ(i, x / length, y / length, z / length);
        }
    });

    for (const [s, [x, y, z]] of sums) {
        const length = Math.hypot(x, y, z) || 1;

        sums.set(s, [x / length, y / length, z / length]);
    }

    return { sums, sharedOf };
}

/** Two body vertices' skin influences mixed (t of the way to b), as the four strongest. */
function mixSkin(human, a, b, t) {
    const total = new Map();

    for (const [v, share] of [[a, 1 - t], [b, t]]) {
        for (let k = 0; k < 4; k++) {
            const weight = human.skinWeights[v * 4 + k];

            if (weight) {
                const bone = human.skinIndices[v * 4 + k];

                total.set(bone, (total.get(bone) ?? 0) + weight * share);
            }
        }
    }

    const strongest = [...total].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = strongest.reduce((s, [, w]) => s + w, 0) || 1;
    const bytes = strongest.map(([, w]) => Math.round((w / sum) * 255));

    bytes[0] += 255 - bytes.reduce((s, w) => s + w, 0);

    while (strongest.length < 4) {
        strongest.push([0, 0]);
        bytes.push(0);
    }

    return [strongest.map(([bone]) => bone), bytes];
}

// --- Painting garments: colour and relief from where each texel is on the body ---

/**
 * Where every texel of a (smaller) body texture is on the base body, for painting garments:
 * { size, covered, positions (3 floats a texel), bones }.
 */
export function texelMap(human, size = 512) {
    const count = size * size;
    const covered = new Uint8Array(count);
    const where = new Float32Array(count * 3);
    const bones = new Uint8Array(count);
    const positions = human.basePositions;
    const indices = human.renderIndices("body");
    const uvs = human.uvs;
    const source = human.renderSource;

    for (let t = 0; t < indices.length; t += 3) {
        const r = [indices[t], indices[t + 1], indices[t + 2]];
        const x = r.map((k) => uvs[k * 2] * size);
        const y = r.map((k) => (1 - uvs[k * 2 + 1]) * size);
        const v = r.map((k) => source[k]);
        const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);

        if (Math.abs(area) < 1e-12) {
            continue;
        }

        for (let py = Math.max(0, Math.floor(Math.min(...y))); py <= Math.min(size - 1, Math.ceil(Math.max(...y))); py++) {
            for (let px = Math.max(0, Math.floor(Math.min(...x))); px <= Math.min(size - 1, Math.ceil(Math.max(...x))); px++) {
                const cx = px + 0.5;
                const cy = py + 0.5;
                const w0 = ((x[1] - cx) * (y[2] - cy) - (x[2] - cx) * (y[1] - cy)) / area;
                const w1 = ((x[2] - cx) * (y[0] - cy) - (x[0] - cx) * (y[2] - cy)) / area;
                const w2 = 1 - w0 - w1;
                const i = py * size + px;

                if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05 || covered[i]) {
                    continue;
                }

                covered[i] = 1;
                bones[i] = human.skinIndices[v[0] * 4];

                for (let k = 0; k < 3; k++) {
                    where[i * 3 + k] = w0 * positions[v[0] * 3 + k] + w1 * positions[v[1] * 3 + k] + w2 * positions[v[2] * 3 + k];
                }
            }
        }
    }

    return { size, covered, positions: where, bones };
}

/** Paint a garment's texture: { data (RGBA), bump (one byte a texel), size }. */
export function paintGarment(map, garment) {
    const { size, covered, positions } = map;
    const count = size * size;
    const data = new Uint8ClampedArray(count * 4);
    const bump = new Uint8ClampedArray(count);
    const colour = new THREE.Color(garment.colour);
    const trim = new THREE.Color(garment.trim ?? garment.colour);
    const pattern = garment.pattern ?? "cloth";

    for (let i = 0; i < count; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        let shade = 1;
        let height = 0.5;
        let c = colour;

        if (!covered[i]) {
            continue;
        }

        switch (pattern) {
            case "leather": {
                const grain = fbm(x * 90, y * 90, z * 90, 3);
                const wear = fbm(x * 12 + 3, y * 12, z * 12, 3);

                shade = 0.82 + 0.3 * wear + 0.08 * (grain - 0.5);
                height = 0.5 + 0.25 * (grain - 0.5);
                break;
            }
            case "quilted": {
                // Diamond quilting: two sets of diagonal stitch lines round the body
                const angle = Math.atan2(x, z) * 0.12;
                const a = (y + angle) * 32;
                const b = (y - angle) * 32;
                const seam = Math.min(Math.abs(a - Math.round(a)), Math.abs(b - Math.round(b)));

                shade = 0.9 + 0.12 * smoothstep(0, 0.2, seam) + 0.05 * (fbm(x * 60, y * 60, z * 60, 2) - 0.5);
                height = 0.25 + 0.6 * smoothstep(0, 0.35, seam);
                break;
            }
            case "mail": {
                const rings = Math.sin(y * 900) * Math.sin(Math.atan2(x, z) * 180 + y * 450);

                shade = 0.8 + 0.25 * rings * rings;
                height = 0.5 + 0.4 * rings;
                break;
            }
            case "plate": {
                // Horizontal lames, slightly darker at their overlaps
                const band = (y * 10) % 1;

                shade = 0.92 + 0.08 * smoothstep(0, 0.1, band) + 0.04 * (fbm(x * 30, y * 30, z * 30, 2) - 0.5);
                height = 0.5 + 0.3 * smoothstep(0, 0.08, band);
                break;
            }
            case "trim": {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);

                // Bands of embroidered trim round the neck and the bottom
                const neck = Math.abs(y - 0.585);
                const hem = Math.abs(y - 0.045);

                if (neck < 0.012 || hem < 0.016) {
                    c = trim;
                    height += 0.2;
                }

                break;
            }
            default: {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);
            }
        }

        data[i * 4] = Math.min(255, c.r * shade * 255);
        data[i * 4 + 1] = Math.min(255, c.g * shade * 255);
        data[i * 4 + 2] = Math.min(255, c.b * shade * 255);
        data[i * 4 + 3] = 255;
        bump[i] = height * 255;
    }

    dilate(size, covered, data, bump);

    return { size, data, bump };
}

/** Spread painted texels a few texels outward, so seams don't show. */
function dilate(size, covered, data, bump) {
    let filled = covered.slice();

    for (let pass = 0; pass < 3; pass++) {
        const next = filled.slice();

        for (let i = 0; i < size * size; i++) {
            if (filled[i]) {
                continue;
            }

            const x = i % size;
            const neighbour = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size].find((j) => j >= 0 && j < size * size && filled[j]);

            if (neighbour !== undefined) {
                data.copyWithin(i * 4, neighbour * 4, neighbour * 4 + 4);
                bump[i] = bump[neighbour];
                next[i] = 1;
            }
        }

        filled = next;
    }
}
