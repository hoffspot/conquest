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

/** A band round the torso, from `bottom` up to `top`. */
function band(bottom, top) {
    return (v, l) => (v.region === "torso" ? Math.min(v.y - bottom(l), top(l) - v.y) : OUTSIDE);
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
    // Round the bust, whatever its size: from a little under the fullest bust (which reaches two
    // thirds of the way down from the chest to the waist) to above the armpits, smoothed enough to
    // bridge between the breasts
    chestWrap: { label: "Chest wrap", slot: "undershirt", layer: 0, thickness: 0.0015, smooth: 6, colour: "#d8d2c4", roughness: 0.8, pattern: "cloth", inside: band((l) => l.chest - 0.75 * (l.chest - l.waist), (l) => l.armpit + 0.02) },
    shirt: { label: "Linen shirt", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.006, smooth: 4, colour: "#cbbd9c", roughness: 0.85, pattern: "cloth", inside: top((l) => l.hips - 0.03, 0.97) },
    tunic: { label: "Tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#6f2f2a", roughness: 0.85, pattern: "trim", trim: "#c6a45a", inside: top((l) => l.hips - 0.06, 0.45) },
    trousers: { label: "Trousers", slot: "legs", layer: 1, thickness: 0.004, loose: 0.006, smooth: 4, colour: "#4a3f35", roughness: 0.9, pattern: "cloth", inside: bottoms((l) => l.waist - 0.02, 0.97) },
    breeches: { label: "Leather pants", slot: "legs", layer: 1, thickness: 0.005, loose: 0.004, smooth: 4, colour: "#5a3a24", roughness: 0.7, pattern: "leather", inside: bottoms((l) => l.waist - 0.02, 0.62) },
    jerkin: { label: "Leather jerkin", slot: "chest", layer: 2, thickness: 0.008, loose: 0.004, smooth: 6, colour: "#6b4428", roughness: 0.65, pattern: "leather", inside: top((l) => l.hips - 0.01, 0.12, 0.05) },
    gambeson: { label: "Gambeson", slot: "chest", layer: 2, thickness: 0.012, loose: 0.006, smooth: 6, colour: "#b3a47e", roughness: 0.9, pattern: "quilted", inside: top((l) => l.hips - 0.07, 0.9, 0.035) },
    mail: { label: "Mail shirt", slot: "chest", layer: 2, thickness: 0.007, loose: 0.004, smooth: 4, colour: "#9aa0a4", roughness: 0.45, metalness: 0.85, pattern: "mail", inside: top((l) => l.hips - 0.06, 0.4, 0.04) },
    breastplate: { label: "Breastplate", slot: "armour", layer: 3, thickness: 0.02, loose: 0.01, smooth: 14, colour: "#b8bec2", roughness: 0.28, metalness: 1, pattern: "plate", inside: top((l) => l.waist - 0.04, 0.02, 0.05) },
    bracers: { label: "Leather bracers", slot: "forearms", layer: 3, thickness: 0.009, smooth: 6, colour: "#5c3a22", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "arm" ? Math.min(v.arm - 0.64, 0.93 - v.arm) : OUTSIDE) },
    belt: { label: "Belt", slot: "waist", layer: 4, thickness: 0.012, smooth: 6, colour: "#3a2616", roughness: 0.55, pattern: "leather", inside: (v, l) => (v.region === "torso" ? Math.min(v.y - (l.waist - 0.07), l.waist - 0.025 - v.y) : OUTSIDE) },
    boots: { label: "Leather boots", slot: "feet", layer: 2, thickness: 0.007, smooth: 8, toeBox: true, colour: "#3b2a1c", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.66 : OUTSIDE) },
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

    // The cut round each foot is the boot's edge, so the smoothing below keeps it where it is:
    // it's put onto a smooth outline first, for the boot and its toe box to carry on from
    const cuts = {};

    if (garment.toeBox) {
        for (const side of [1, -1]) {
            const loop = cutLoop(sides, onCut, shell, side);

            if (loop) {
                cuts[side] = { loop, fractions: roundOffCut(loop, shell) };
            }
        }
    }

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

    if (garment.toeBox) {
        const cap = { shell, sharedOf, onCut, neighbours, out, sources, human, positions, normals, vertices, thickness, triangles };

        for (const side of [1, -1]) {
            if (cuts[side]) {
                addToeCap(cap, cuts[side], side);
            }
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
        joinToeCaps(geometry, out.capJoins ?? []);
    }

    return { geometry, covers, sources: Int32Array.from(sources), garment };
}

// Footwear with a toe box is cut this far along the foot (1 is the ball of the foot)
const TOE_CUT = 0.85;

/**
 * A toe box for one foot (side 1 left, -1 right): a smooth cap lofted forward from where the
 * boot was cut near the ball of the foot (`loop`, in order round it), keeping the cut's outline
 * but as wide and tall as all the toes together, and rounded off in front of them like a dome.
 * The toes under it aren't drawn, so it needn't follow each one. It's skinned from the foot to
 * the toes, so it bends with them.
 */
function addToeCap(cap, { loop, fractions }, side) {
    const { shell, sharedOf, onCut, neighbours, out, sources, human, positions, normals, vertices, thickness, triangles } = cap;
    const RINGS = 20;

    // Which of the boot's vertices each stretch of the cut uses at its ends. Where the cut
    // crosses a texture seam, the boot has two vertices at one point, one either side; the cap
    // has a column for each, so its texture carries on from both
    const n = loop.length;
    const edges = new Map();

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const i = triangles[t + k];
            const j = triangles[t + ((k + 1) % 3)];

            if (onCut[sharedOf[i]] && onCut[sharedOf[j]]) {
                edges.set(`${sharedOf[i]}:${sharedOf[j]}`, [i, j]);
                edges.set(`${sharedOf[j]}:${sharedOf[i]}`, [j, i]);
            }
        }
    }

    const leaving = [];
    const arriving = [];

    for (let i = 0; i < n; i++) {
        const [from, to] = edges.get(`${loop[i]}:${loop[(i + 1) % n]}`);

        leaving[i] = from;
        arriving[(i + 1) % n] = to;
    }

    const columns = [];
    const columnOf = new Map();

    for (let i = 0; i < n; i++) {
        for (const from of new Set([arriving[i], leaving[i]])) {
            columnOf.set(from, columns.length);
            columns.push({ i, from });
        }
    }

    // The toes, grown by the boot's thickness (with the render vertex each is from, which knows
    // where it is in the texture)
    const toes = [];
    const seen = new Set();

    for (const r of human.renderIndices("body")) {
        const v = human.renderSource[r];
        const vertex = vertices[v];

        if (!seen.has(r) && vertex.region === "foot" && vertex.side === side && vertex.foot > TOE_CUT - 0.02) {
            seen.add(r);
            toes.push(Object.assign([0, 1, 2].map((k) => positions[v * 3 + k] + normals[v * 3 + k] * thickness), { r }));
        }
    }

    const at = (s) => [shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]];
    const loopPoints = loop.map(at);
    const loopCentre = [0, 1, 2].map((k) => loopPoints.reduce((sum, p) => sum + p[k], 0) / loopPoints.length);
    const z0 = loopCentre[2];
    const tip = Math.max(...toes.map((p) => p[2])) + thickness * 0.3;

    // Rings run evenly to the start of the nose, then round it off like a dome: their spacing
    // follows a quarter circle, and they shrink with it to a point
    const NOSE_START = 0.55;
    const noseLength = Math.min(0.02, 0.25 * (tip - z0));
    const place = (j) => {
        const t = j / RINGS;

        if (t <= NOSE_START) {
            return { z: z0 + (t / NOSE_START) * (tip - noseLength - z0), nose: 1 };
        }

        const angle = ((t - NOSE_START) / (1 - NOSE_START)) * (Math.PI / 2);

        return { z: tip - noseLength + noseLength * Math.sin(angle), nose: Math.cos(angle) };
    };

    // Each ring wraps the toes near it tightly (their convex hull, as they're grown by the
    // boot's thickness already), smoothed, so the cap follows the toes as a whole, down to the
    // shortest, not each toe. Columns go round each ring as far as they are round the cut, both
    // measured from straight above their middles, so they stay in order however the rings differ
    const places = Array.from({ length: RINGS }, (_, j) => place(j + 1));
    const columnFractions = columns.map(({ i }) => fractions[i]);
    const flat = loopPoints.map(([x, y]) => [x, y]);
    const sections = [];

    for (const { z, nose } of places) {
        const near = nose < 1 ? [] : toes.filter((p) => Math.abs(p[2] - z) < (tip - z0) / RINGS);
        const hull = near.length >= 3 ? convexHull(near.map(([x, y]) => [x, y])) : [];

        if (nose < 1 || hull.length < 3) {
            sections.push(sections[sections.length - 1] ?? columns.map(({ i }) => flat[i]));
            continue;
        }

        const outline = outlineOf(hull, 6);

        sections.push(columnFractions.map((f) => outline(f)));
    }

    // Smoothed along the foot from the cut, so it tapers evenly; the nose shrinks the last ring
    // before it to its middle, like a dome
    const body = places.filter(({ nose }) => nose === 1).length;
    let smoothed = sections.slice(0, body);

    for (let pass = 0; pass < 3; pass++) {
        smoothed = smoothed.map((section, j) => section.map((point, c) => {
            const around = [smoothed[j - 1]?.[c] ?? flat[columns[c].i], point, smoothed[j + 1]?.[c]].filter(Boolean);

            return [0, 1].map((k) => around.reduce((sum, other) => sum + other[k], 0) / around.length);
        }));
    }

    const last = smoothed[body - 1];
    const xs = last.map(([x]) => x);
    const ys = last.map(([, y]) => y);
    const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const rings = places.map(({ z, nose }, j) => ({
        z,
        blend: smoothstep(0, 0.35, (j + 1) / RINGS),
        points: j < body ? smoothed[j] : last.map((point) => [0, 1].map((k) => middle[k] + (point[k] - middle[k]) * nose)),
    }));

    // Texture: from the boot's at the cut, each column slides along the cap to the middle of the
    // toes' part of the texture (the garment's pattern is painted there too), so it fans in as
    // the cap narrows to its nose. The toes' part is in one piece that far in from the cut, so
    // it never reaches the empty texture between the toes
    const uvOf = (i) => [out.uvs[i * 2], out.uvs[i * 2 + 1]];
    const toesUV = [0, 1].map((k) => toes.reduce((sum, { r }) => sum + human.uvs[r * 2 + k], 0) / toes.length);

    // Vertices: the boot's own along the cut, then each ring, column by column
    const firstRing = out.positions.length / 3;
    const toeBone = human.boneIndex.get(side > 0 ? "LeftToeBase" : "RightToeBase");
    const addVertex = (position, uv, skinFrom, towardToes) => {
        out.positions.push(...position);
        out.uvs.push(...uv);

        // From the foot's weights at the cut to the toe bone at the front
        const weights = new Map();

        for (let k = 0; k < 4; k++) {
            const bone = out.skinIndices[skinFrom * 4 + k];
            const weight = out.skinWeights[skinFrom * 4 + k] / 255;

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

    // The boot's slope at each point of the cut (sideways and up, for each step forward), from
    // the boot just behind it, for the cap to set off along so there's no crease where they join
    let slopes = loop.map((s, i) => {
        const behind = [...neighbours[s]].filter((other) => !onCut[other]);

        return behind.length ? [0, 1, 2].map((k) => loopPoints[i][k] - behind.reduce((sum, other) => sum + shell[other * 3 + k], 0) / behind.length) : [0, 0, 1];
    });

    for (let pass = 0; pass < 3; pass++) {
        slopes = slopes.map((slope, i) => [0, 1, 2].map((k) => slope[k] * 0.5 + (slopes[(i + 1) % n][k] + slopes[(i + n - 1) % n][k]) * 0.25));
    }

    slopes = slopes.map(([x, y, z]) => {
        const forward = Math.max(z, 0.3 * Math.hypot(x, y, z), 1e-6);

        return [Math.max(-1.5, Math.min(1.5, x / forward)), Math.max(-1.5, Math.min(1.5, y / forward))];
    });

    // Each column starts from its own point on the cut (the foot turns out a little, so the cut
    // isn't square to the rings) and heads the way the boot was going, easing into its ring
    rings.forEach((ring, j) => {
        const t = (j + 1) / RINGS;
        const along = (ring.z - z0) / (tip - z0);

        columns.forEach(({ i, from }, c) => {
            const p = loopPoints[i];
            const [x, y] = ring.points[c];
            const [u, v] = uvOf(from);
            const z = ring.z + (p[2] - z0) * (1 - ring.blend);
            const carried = [p[0] + slopes[i][0] * (z - p[2]), p[1] + slopes[i][1] * (z - p[2])];
            const position = [carried[0] + (x - carried[0]) * ring.blend, carried[1] + (y - carried[1]) * ring.blend, z];

            addVertex(position, [u + (toesUV[0] - u) * along, v + (toesUV[1] - v) * along], from, smoothstep(0.1, 0.6, t));
        });
    });

    // Triangles, facing out (checked on the first quad, flipped if needed). The last ring is
    // the point of the nose
    const count = columns.length;
    const vertex = (j, c) => (j < 0 ? columns[c].from : firstRing + j * count + c);
    const faces = [];

    for (let j = -1; j < RINGS - 1; j++) {
        for (let i = 0; i < n; i++) {
            const a = columnOf.get(leaving[i]);
            const b = columnOf.get(arriving[(i + 1) % n]);

            faces.push(vertex(j, a), vertex(j, b), vertex(j + 1, b), vertex(j, a), vertex(j + 1, b), vertex(j + 1, a));
        }
    }

    const position = (index) => out.positions.slice(index * 3, index * 3 + 3);
    const [a, b, c] = [position(faces[0]), position(faces[1]), position(faces[2])];
    const normal = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const outward = [a[0] - loopCentre[0], a[1] - loopCentre[1], 0];

    if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0) {
        for (let k = 0; k < faces.length; k += 3) {
            [faces[k + 1], faces[k + 2]] = [faces[k + 2], faces[k + 1]];
        }
    }

    out.indices.push(...faces);

    for (let k = 0; k < faces.length / 3; k++) {
        sources.push(-1);
    }

    // Normals are shared later wherever the cap has more than one vertex at a point: the boot's
    // along the cut, the two columns at a texture seam, and the point of the nose
    out.capJoins ??= [];
    out.capJoins.push(...columns.map(({ from }) => from));

    for (let k = firstRing; k < out.positions.length / 3; k++) {
        out.capJoins.push(k);
    }
}

/** The toe box cut round one foot (side 1 left, -1 right): its shared points in order, or null. */
function cutLoop(sides, onCut, shell, side) {
    const next = new Map();

    for (const [key, uses] of sides) {
        const [a, b] = key.split(":").map(Number);

        if (uses === 1 && onCut[a] && onCut[b] && Math.sign(shell[a * 3]) === side) {
            next.set(a, [...(next.get(a) ?? []), b]);
            next.set(b, [...(next.get(b) ?? []), a]);
        }
    }

    if (next.size < 6) {
        return null;
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

    return loop;
}

/**
 * Put a toe box cut onto a smooth outline round the foot. Grown out from the skin along its
 * normals, the cut loops over itself where the skin curves in more tightly than the boot is
 * thick (between the toes); instead it goes round all of it (its convex hull, smoothed), its
 * points kept in order and spread evenly round it, and how far forward each is smoothed too.
 * Returns how far round the outline each point is (see outlineOf).
 */
function roundOffCut(loop, shell) {
    const n = loop.length;
    const points = loop.map((s) => [shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]]);
    const ys = points.map((p) => p[1]);
    const top = ys.indexOf(Math.max(...ys));

    // How far round each point is, measured round the cut smoothed hard (which shrinks its loops
    // over itself away), so the points spread evenly round the outline
    let flat = points.map((p) => [p[0], p[1]]);

    for (let pass = 0; pass < 40; pass++) {
        flat = flat.map((p, i) => [0, 1].map((k) => p[k] * 0.5 + (flat[(i + 1) % n][k] + flat[(i + n - 1) % n][k]) * 0.25));
    }

    const around = new Float32Array(n);
    let perimeter = 0;

    for (let k = 1; k <= n; k++) {
        const i = (top + k) % n;
        const previous = flat[(top + k - 1) % n];

        perimeter += Math.hypot(flat[i][0] - previous[0], flat[i][1] - previous[1]);
        around[i] = k < n ? perimeter : 0;
    }

    const anticlockwise = points.reduce((sum, p, i) => sum + p[0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * p[1], 0) > 0;
    const outline = outlineOf(convexHull(points.map(([x, y]) => [x, y])), 8);

    // The outline is measured from straight above its middle; the cut from its top point, which
    // is where the outline comes nearest it
    const nearest = Array.from({ length: 256 }, (_, k) => k / 256).reduce((best, f) => {
        const [x, y] = outline(f);
        const d = Math.hypot(x - points[top][0], y - points[top][1]);

        return d < best.d ? { f, d } : best;
    }, { f: 0, d: Infinity }).f;
    const fractions = loop.map((_, i) => (((nearest + (anticlockwise ? 1 : -1) * (around[i] / perimeter)) % 1) + 1) % 1);
    let z = points.map((p) => p[2]);

    for (let pass = 0; pass < 10; pass++) {
        z = z.map((value, i) => value * 0.5 + (z[(i + 1) % n] + z[(i + n - 1) % n]) * 0.25);
    }

    loop.forEach((s, i) => {
        const [x, y] = outline(fractions[i]);

        shell[s * 3] = x;
        shell[s * 3 + 1] = y;
        shell[s * 3 + 2] = z[i];
    });

    return fractions;
}

/** The convex hull of 2D points, anticlockwise (Andrew's monotone chain). */
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
        const chain = [];

        for (const p of list) {
            while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
                chain.pop();
            }

            chain.push(p);
        }

        chain.pop();

        return chain;
    };

    return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * A smooth closed outline round an anticlockwise convex polygon: a function from how far round
 * it (0 to 1, anticlockwise from straight above its middle) to a point, keeping the first few
 * harmonics of the polygon (so its size and shape, but no corners).
 */
function outlineOf(polygon, harmonics) {
    const SAMPLES = 128;
    const count = polygon.length;
    const xs = polygon.map(([x]) => x);
    const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
    const lengths = [0];

    for (let k = 1; k <= count; k++) {
        const a = polygon[k - 1];
        const b = polygon[k % count];

        lengths.push(lengths[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }

    // Where a line straight up from the middle leaves it
    let start = 0;
    let highest = -Infinity;

    for (let k = 0; k < count; k++) {
        const a = polygon[k];
        const b = polygon[(k + 1) % count];

        if ((a[0] - middle) * (b[0] - middle) <= 0 && a[0] !== b[0]) {
            const w = (middle - a[0]) / (b[0] - a[0]);
            const y = a[1] + (b[1] - a[1]) * w;

            if (y > highest) {
                highest = y;
                start = lengths[k] + (lengths[k + 1] - lengths[k]) * w;
            }
        }
    }

    const at = (f) => {
        const target = (start + f * lengths[count]) % lengths[count];
        let k = 0;

        while (k < count - 1 && lengths[k + 1] < target) {
            k++;
        }

        const a = polygon[k];
        const b = polygon[(k + 1) % count];
        const w = Math.min(1, Math.max(0, (target - lengths[k]) / (lengths[k + 1] - lengths[k] || 1)));

        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
    };
    const samples = Array.from({ length: SAMPLES }, (_, k) => at(k / SAMPLES));
    const terms = [];

    for (let h = 0; h <= harmonics; h++) {
        terms.push([0, 1].map((axis) => {
            let cosine = 0;
            let sine = 0;

            samples.forEach((p, k) => {
                cosine += p[axis] * Math.cos((2 * Math.PI * h * k) / SAMPLES);
                sine += p[axis] * Math.sin((2 * Math.PI * h * k) / SAMPLES);
            });

            return [(cosine / SAMPLES) * (h ? 2 : 1), (sine / SAMPLES) * 2];
        }));
    }

    return (f) => [0, 1].map((axis) => terms.reduce((sum, term, h) => sum + term[axis][0] * Math.cos(2 * Math.PI * h * f) + term[axis][1] * Math.sin(2 * Math.PI * h * f), 0));
}

/** Share normals between toe cap and boot vertices at the same point. */
function joinToeCaps(geometry, joins) {
    if (!joins.length) {
        return;
    }

    // computeVertexNormals already averaged every triangle at each vertex, cap and boot alike;
    // only vertices at one point (split by texture seams, or where the nose closes) need sharing
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
