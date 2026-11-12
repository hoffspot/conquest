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
import { designSolid, footAt, GARMENTS, insideBetween, insideOf, measuredVertices, measureVertex, regionAt, sideAt, TOE_CUT } from "./garment-pictures.js";
import { smoothstep } from "./noise.js";
import { allAtOnce } from "../core/steps.js";

// (What each garment is, and its pictures: garment-pictures.js, handed on from here)
export { COMPOSITE_BUMP, compositeGarments, compositingGarments, DESIGNS, designSolid, emblemAt, everyVertex, forgetPoints, GARMENTS, insideBetween, insideOf, paintGarment, paintingGarment, picturingOutfit, pointsHeld, surfaceOf, texelMap, tintOf, vertexAt } from "./garment-pictures.js";

const ARM = /^(Left|Right)(Arm|ForeArm)$/;
const HAND = /^(Left|Right)Hand/;
const LEG = /^(Left|Right)(UpLeg|Leg)$/;
const FOOT = /^(Left|Right)(Foot|ToeBase)$/;

/**
 * How many bodies have been measured (measureBody), for the tests: one for each kit (its body of
 * the usual shape) and one for each body that's worn a skirt, a gown or an apron, and no others.
 */
export const MEASURED = { bodies: 0 };

/**
 * Measurements of the body at every vertex, for garments' regions: { region ("head", "torso",
 * "arm", "hand", "leg", "foot": by the bone that moves it most), armShare and legShare (how much
 * of it moves with the arm's bones, the hand's included, and the leg's, the foot's included: 0
 * to 1), side (1 left, -1 right), arm and leg (fractions down the limb), foot (how far along
 * it), x, y, z }, held in columns (`vertices`: garment-pictures.js measuredVertices; one vertex's
 * as an object, vertexAt), plus the landmarks' heights: { waist, hips, crotch, chest, armpit,
 * neck }, and the neck's radius (`neckRadius`).
 */
export function measureBody(character) {
    const { human, rig, positions } = character;

    MEASURED.bodies++;

    const head = (name) => rig.heads[rig.index.get(name)];
    // (Half way up the neck, where MakeHuman's neck bone starts: up Vitruvian's, which starts at
    // the neck's foot)
    const neck = head("Neck").clone().lerp(head("Head"), human.landmarks?.neck ?? 0);
    const landmarks = {
        neck: neck.y,
        chest: head("Spine2").y,
        waist: head("Spine").y,
        hips: head("Hips").y,
        crotch: head("LeftUpLeg").y - 0.07 * (character.height / 1.7),
        armpit: head("LeftArm").y - 0.08 * (character.height / 1.7),
        neckZ: neck.z,
        ankle: head("LeftFoot").y,
        balls: [head("LeftToeBase"), head("RightToeBase")],
        height: character.height,
    };
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
    const vertices = measuredVertices(human.vertexCount);
    const armBone = human.bones.map(({ name }) => ARM.test(name) || HAND.test(name));
    const legBone = human.bones.map(({ name }) => LEG.test(name) || FOOT.test(name));

    for (let v = 0; v < human.vertexCount; v++) {
        p.fromArray(positions, v * 3);

        const name = human.bones[human.skinIndices[v * 4]].name;
        const side = p.x >= 0 ? "Left" : "Right";
        const region = name === "Head" ? "head" : HAND.test(name) ? "hand" : ARM.test(name) ? "arm" : LEG.test(name) ? "leg" : FOOT.test(name) ? "foot" : "torso";
        // (How much of its skin moves with the arm's bones, and with the leg's: smooth from one
        // vertex to the next, where its region, by its strongest bone, isn't)
        let total = 0;
        let arm = 0;
        let leg = 0;

        for (let k = 0; k < 4; k++) {
            const weight = human.skinWeights[v * 4 + k];
            const bone = human.skinIndices[v * 4 + k];

            total += weight;
            arm += armBone[bone] ? weight : 0;
            leg += legBone[bone] ? weight : 0;
        }

        measureVertex(vertices, v, {
            region,
            armShare: total ? arm / total : 0,
            legShare: total ? leg / total : 0,
            side: side === "Left" ? 1 : -1,
            arm: along(chains[`arm${side}`]),
            leg: along(chains[`leg${side}`]),
            foot: feet[side](p),
            x: p.x,
            y: p.y,
            z: p.z,
        });
    }

    // How far the neck's skin is from its middle, at the neck's height (the middle of its sides)
    const neckBone = human.bones.findIndex(({ name }) => name === "Neck");
    const round = [];

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && human.skinIndices[v * 4] === neckBone && Math.abs(positions[v * 3 + 1] - neck.y) < 0.01) {
            round.push(Math.hypot(positions[v * 3], positions[v * 3 + 2] - neck.z));
        }
    }

    round.sort((a, b) => a - b);

    landmarks.neckRadius = round.length ? round[round.length >> 1] : 0.07 * (character.height / 1.7);

    return { vertices, landmarks };
}

/** Where a point is along a segment: t (0 at a, 1 at b, unclamped) and its distance from it. */
function segment(p, a, b) {
    const ab = b.clone().sub(a);
    const t = p.clone().sub(a).dot(ab) / ab.lengthSq();
    const closest = a.clone().addScaledVector(ab, Math.min(1, Math.max(0, t)));

    return { t, distance: p.distanceTo(closest) };
}

// Each garment's cut (cutOf), for the measures it was cut for: made once for each, as garments
// drawn all at once are all fitted to the same measures (Character `merge`); the most recently
// wanted kept, this many for each measures (a few hundred kilobytes each)
const cutsByMeasures = new WeakMap();
const CUTS_KEPT = 40;

/**
 * What a garment is on the body, whatever the body's own shape (its positions): the body's
 * triangles it takes in, cut along the edge of its region; which of its points are one; what's
 * beside what, its edge and where its hem goes; its texture coordinates and skin weights; and the
 * body triangles it hides. Or null, where it takes in none. The same for everyone measured the
 * same (`measures`: measureBody's), so kept for each measures, and not to be changed.
 */
function cutOf(human, id, measures) {
    if (!cutsByMeasures.has(measures)) {
        cutsByMeasures.set(measures, new Map());
    }

    const cuts = cutsByMeasures.get(measures);
    const cut = cuts.has(id) ? cuts.get(id) : cutGarment(human, GARMENTS[id], measures);

    // (The most recently wanted last, and the longest unwanted let go)
    cuts.delete(id);
    cuts.set(id, cut);

    if (cuts.size > CUTS_KEPT) {
        cuts.delete(cuts.keys().next().value);
    }

    return cut;
}

function cutGarment(human, garment, measures) {
    const { vertices } = measures;
    const inside = insideOf(human, garment, measures);
    const body = human.renderIndices("body");
    const source = human.renderSource;
    const covers = new Set();

    // A garment cut from a design covers only where its fabric is opaque
    const solid = garment.design ? designSolid(human, garment.design) : null;

    // (the toes under a toe box aren't drawn)
    if (garment.toeBox) {
        for (let t = 0; t < body.length; t += 3) {
            if ([body[t], body[t + 1], body[t + 2]].some((r) => regionAt(vertices, source[r]) === "foot" && footAt(vertices, source[r]) > TOE_CUT - 0.05)) {
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
            if (!solid || corners.every((r) => solid[source[r]])) {
                covers.add(t / 3);
            }

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
                polygon.push(point(a, b, insideBetween(garment, measures, source[a], source[b], va, vb)));
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
    const onEdge = new Uint8Array(count);

    list.forEach(({ t }, i) => {
        if (t > 0 && t < 1) {
            onEdge[sharedOf[i]] = 1;
        }
    });

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

    // Points on the toe box cut (where the toe box joins on, with no hem)
    const onCut = new Uint8Array(count);

    if (garment.toeBox) {
        list.forEach(({ a, b, t }, i) => {
            const [va, vb] = [source[a], source[b]];

            if (regionAt(vertices, va) === "foot" && regionAt(vertices, vb) === "foot" && Math.abs(footAt(vertices, va) * (1 - t) + footAt(vertices, vb) * t - TOE_CUT) < 1e-4) {
                onCut[sharedOf[i]] = 1;
            }
        });
    }

    // The hem's sides: each edge side (not on the toe box cut), as [i, j] (the triangle's
    // vertices, in its winding) and the triangle it's of
    const hem = [];

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const i = triangles[t + k];
            const j = triangles[t + ((k + 1) % 3)];
            const a = sharedOf[i];
            const b = sharedOf[j];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;

            if (sides.get(key) === 1 && !(onCut[a] && onCut[b])) {
                hem.push(i, j, t / 3);
            }
        }
    }

    // Each vertex's texture coordinates and skin weights
    const size = list.length;
    const uvs = new Float64Array(size * 2);
    const skinIndices = new Uint8Array(size * 4);
    const skinWeights = new Uint8Array(size * 4);

    list.forEach(({ a, b, t }, i) => {
        const [indices, weights] = mixSkin(human, source[a], source[b], t);

        uvs[i * 2] = human.uvs[a * 2] * (1 - t) + human.uvs[b * 2] * t;
        uvs[i * 2 + 1] = human.uvs[a * 2 + 1] * (1 - t) + human.uvs[b * 2 + 1] * t;
        skinIndices.set(indices, i * 4);
        skinWeights.set(weights, i * 4);
    });

    // (Kept compact, in typed arrays: the neighbours a list for each point, in one list, from
    // where each starts; the edge's sides as pairs of points)
    const near = { start: new Int32Array(count + 1), list: new Int32Array(neighbours.reduce((sum, set) => sum + set.size, 0)) };

    neighbours.forEach((set, n) => {
        near.start[n + 1] = near.start[n] + set.size;
        near.list.set([...set], near.start[n]);
    });

    const edge = Int32Array.from([...sides].filter(([, uses]) => uses === 1).flatMap(([key]) => key.split(":").map(Number)));

    return {
        size,
        from: Int32Array.from(list, ({ a }) => a),
        to: Int32Array.from(list, ({ b }) => b),
        along: Float64Array.from(list, ({ t }) => t),
        triangles: Int32Array.from(triangles),
        sources: Int32Array.from(sources),
        covers: Int32Array.from(covers),
        sharedOf: Int32Array.from(sharedOf),
        count,
        onEdge,
        near,
        edge,
        onCut,
        hem: Int32Array.from(hem),
        uvs,
        skinIndices,
        skinWeights,
    };
}

/**
 * Build a garment on a character: { geometry, covers (the body triangles it hides, a Set of
 * body triangle numbers), sources (the body triangle each of its triangles
 * comes from), garment }. `measures` is measureBody(character). (Its cut is the same for everyone
 * measured the same: cutOf.) One that lies over what's worn under it (`over`) is grown out past
 * that too: `under`, how far it reaches at each of the body's vertices (underneath).
 */
export function buildGarment(character, id, measures, under = null) {
    return allAtOnce(fittingGarment(character, id, measures, under));
}

/** How far (metres) a garment stands at least over every one worn under it (fittingOutfit). */
export const STAND_OFF = 0.003;

// How far (metres) a hem over another garment goes down under its surface
const HEM_UNDER = 0.0008;

// How many times what a strap's grown over, and its normals, are smoothed along it (over about 5 cm)
const STRAP_PASSES = 8;

/** The order garments are worn in, under ones first: by layer, then how far out each is grown, then id. */
export function stackOrder(a, b) {
    const [ga, gb] = [GARMENTS[a], GARMENTS[b]];
    const reach = (garment) => garment.thickness + (garment.loose ?? 0);

    return ga.layer - gb.layer || reach(ga) - reach(gb) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Garments (`ids`) fitted one over another, as worn (stackOrder): each over how far out those
 * under it reach at each of the body's vertices (`reach`). A step at a time, returning them,
 * under ones first.
 */
export function* fittingOutfit(character, ids, measures) {
    const under = new Float32Array(character.human.vertexCount);
    const built = [];

    for (const id of [...new Set(ids)].filter((each) => GARMENTS[each]).sort(stackOrder)) {
        yield;

        const garment = yield* fittingGarment(character, id, measures, under);

        if (!garment) {
            continue;
        }

        for (let v = 0; v < under.length; v++) {
            under[v] = Math.max(under[v], garment.reach[v]);
        }

        built.push({ id, ...garment });
    }

    return built;
}

/**
 * The same (buildGarment), a step at a time, returning it: { geometry, covers (the body's
 * triangles it covers whole), sources (the body triangle each of its triangles is cut from),
 * garment, reach (metres out at each of the body's vertices) }. At least STAND_OFF over what's
 * under it (`under`: reach, or none), a strap (`over`) its own thickness.
 */
export function* fittingGarment(character, id, measures, under = null) {
    const garment = GARMENTS[id];
    const { human, positions, normals } = character;
    const { vertices } = measures;
    const cut = cutOf(human, id, measures);

    if (!cut) {
        return null;
    }

    const { size, from, to, along, triangles, covers, sharedOf, count, onEdge, near, edge, onCut, hem } = cut;
    const source = human.renderSource;
    const sources = Array.from(cut.sources);
    const base = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    // (How far out it's grown at each point, and how near the skin smoothing may bring it)
    const thickness = garment.thickness + (garment.loose ?? 0);
    const grown = new Float32Array(count).fill(thickness);
    const least = new Float32Array(count).fill(thickness * 0.7);
    const beneath = new Float32Array(count);

    for (let i = 0; i < size; i++) {
        const s = sharedOf[i];
        const sa = source[from[i]] * 3;
        const sb = source[to[i]] * 3;
        const t = along[i];

        for (let k = 0; k < 3; k++) {
            base[s * 3 + k] = positions[sa + k] * (1 - t) + positions[sb + k] * t;
            normal[s * 3 + k] = normals[sa + k] * (1 - t) + normals[sb + k] * t;
        }

        const below = under ? under[sa / 3] * (1 - t) + under[sb / 3] * t : 0;

        if (below > 0) {
            grown[s] = garment.over ? thickness + below : Math.max(thickness, below + STAND_OFF);
            least[s] = Math.max(grown[s] * 0.7, below + STAND_OFF);
            beneath[s] = below;
        }
    }

    // (A strap bridges the edges of what's under it, ramped up to them, never down, and keeps
    // most of its thickness)
    if (garment.over) {
        const bridged = beneath.slice();

        for (let pass = 0; pass < STRAP_PASSES; pass++) {
            const next = bridged.slice();

            for (let s = 0; s < count; s++) {
                const [first, end] = [near.start[s], near.start[s + 1]];
                let sum = 0;

                for (let m = first; m < end; m++) {
                    sum += bridged[near.list[m]];
                }

                next[s] = end > first ? Math.max(beneath[s], 0.5 * bridged[s] + (0.5 * sum) / (end - first)) : bridged[s];
            }

            bridged.set(next);
        }

        for (let s = 0; s < count; s++) {
            grown[s] = thickness + bridged[s];
            least[s] = bridged[s] + thickness * 0.6;
        }
    }

    const normalize = () => {
        for (let s = 0; s < count; s++) {
            const length = Math.hypot(normal[s * 3], normal[s * 3 + 1], normal[s * 3 + 2]) || 1;

            normal[s * 3] /= length;
            normal[s * 3 + 1] /= length;
            normal[s * 3 + 2] /= length;
        }
    };

    normalize();

    // (A strap's grown along the body's normals smoothed along it, so its edges don't cross
    // over a hollow)
    for (let pass = 0; garment.over && pass < STRAP_PASSES; pass++) {
        const next = normal.slice();

        for (let s = 0; s < count; s++) {
            for (let m = near.start[s]; m < near.start[s + 1]; m++) {
                for (let k = 0; k < 3; k++) {
                    next[s * 3 + k] += normal[near.list[m] * 3 + k];
                }
            }
        }

        normal.set(next);
        normalize();
    }

    // Grow outward, then smooth, keeping at least most of the thickness everywhere
    const shell = new Float32Array(count * 3);

    for (let j = 0; j < count * 3; j++) {
        shell[j] = base[j] + normal[j] * grown[Math.floor(j / 3)];
    }

    const footwear = Boolean(garment.toeBox);
    const smoothPasses = (passes, keepOut, only = null) => {
        for (let pass = 0; pass < passes; pass++) {
            const next = shell.slice();

            for (let s = 0; s < count; s++) {
                const [first, end] = [near.start[s], near.start[s + 1]];

                // (Its edges too, only out or in, so they stay where they were cut; footwear's stay)
                if ((footwear ? onEdge[s] : onCut[s]) || first === end || (only && !only.has(s))) {
                    continue;
                }

                // (Toward the middle of those beside it, only out or in along the normal, so its
                // picture doesn't slide; footwear's slide too, merging the toes)
                let moved = 0;

                for (let k = 0; k < 3; k++) {
                    let sum = 0;

                    for (let m = first; m < end; m++) {
                        sum += shell[near.list[m] * 3 + k];
                    }

                    next[s * 3 + k] = shell[s * 3 + k] * 0.4 + (sum / (end - first)) * 0.6;
                    moved += (next[s * 3 + k] - shell[s * 3 + k]) * normal[s * 3 + k];
                }

                if (!footwear) {
                    for (let k = 0; k < 3; k++) {
                        next[s * 3 + k] = shell[s * 3 + k] + normal[s * 3 + k] * moved;
                    }
                }

                if (!keepOut) {
                    continue;
                }

                // Not closer to the skin than 70% of how far it's grown, nor than STAND_OFF over
                // what's under it
                const now = (next[s * 3] - base[s * 3]) * normal[s * 3] + (next[s * 3 + 1] - base[s * 3 + 1]) * normal[s * 3 + 1] + (next[s * 3 + 2] - base[s * 3 + 2]) * normal[s * 3 + 2];

                if (now < least[s]) {
                    for (let k = 0; k < 3; k++) {
                        next[s * 3 + k] += normal[s * 3 + k] * (least[s] - now);
                    }
                }
            }

            shell.set(next);
        }
    };

    // The cut round each foot is the boot's edge, so the smoothing below keeps it where it is:
    // it's put onto a smooth outline first, for the boot and its toe box to carry on from
    const cuts = {};

    if (garment.toeBox) {
        for (const side of [1, -1]) {
            const loop = cutLoop(edge, onCut, shell, side);

            if (loop) {
                cuts[side] = { loop, fractions: roundOffCut(loop, shell) };
            }
        }
    }

    smoothPasses(garment.smooth ?? 0, true);
    yield;

    // How far out it stands at each of the body's vertices it's on, and at those beside where its
    // edge crosses (for what's worn over it: its edge covered too)
    const reach = new Float32Array(human.vertexCount);

    for (let i = 0; i < size; i++) {
        const s = sharedOf[i];
        const stands = (shell[s * 3] - base[s * 3]) * normal[s * 3] + (shell[s * 3 + 1] - base[s * 3 + 1]) * normal[s * 3 + 1] + (shell[s * 3 + 2] - base[s * 3 + 2]) * normal[s * 3 + 2];

        for (const [v, on] of [[source[from[i]], along[i] < 1], [source[to[i]], along[i] > 0]]) {
            if (on && stands > reach[v]) {
                reach[v] = stands;
            }
        }
    }

    // The mesh: the shell, then a hem folding back to the skin along the garment's edge
    const out = {
        positions: [],
        uvs: [],
        skinIndices: [],
        skinWeights: [],
        indices: [],
    };

    for (let i = 0; i < size; i++) {
        const s = sharedOf[i];

        out.positions.push(shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]);
    }

    out.uvs.push(...cut.uvs);
    out.skinIndices.push(...cut.skinIndices);
    out.skinWeights.push(...cut.skinWeights);
    out.indices.push(...triangles);

    // Hem: for each edge side, a strip from the shell back down to near the skin, or just under
    // what's worn under it there
    const hemOf = [];

    for (let h = 0; h < hem.length; h += 3) {
        const [i, j, t] = [hem[h], hem[h + 1], hem[h + 2]];
        const first = out.positions.length / 3;

        for (const [index, s] of [[i, sharedOf[i]], [j, sharedOf[j]]]) {
            hemOf.push(out.positions.length / 3, index);

            const stands = (shell[s * 3] - base[s * 3]) * normal[s * 3] + (shell[s * 3 + 1] - base[s * 3 + 1]) * normal[s * 3 + 1] + (shell[s * 3 + 2] - base[s * 3 + 2]) * normal[s * 3 + 2];
            const hemDepth = beneath[s] > 0 ? Math.max(0.0015, stands - beneath[s] + HEM_UNDER) : Math.max(0.0015, stands * 0.85);

            for (let k2 = 0; k2 < 3; k2++) {
                out.positions.push(shell[s * 3 + k2] - normal[s * 3 + k2] * hemDepth);
            }

            out.uvs.push(out.uvs[index * 2], out.uvs[index * 2 + 1]);
            out.skinIndices.push(...out.skinIndices.slice(index * 4, index * 4 + 4));
            out.skinWeights.push(...out.skinWeights.slice(index * 4, index * 4 + 4));
        }

        // The triangle runs i -> j, so its outside is to the right: keep the same winding
        out.indices.push(j, i, first, j, first, first + 1);
        sources.push(sources[t], sources[t]);
    }

    if (garment.toeBox) {
        const cap = { shell, sharedOf, onCut, out, sources, human, positions, normals, vertices, thickness, triangles };

        for (const side of [1, -1]) {
            if (cuts[side]) {
                yield;
                addToeCap(cap, cuts[side], side);
            }
        }

        yield;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(out.uvs, 2));
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(out.skinIndices), 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(out.skinWeights), 4, true));
    geometry.setIndex(out.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(out.indices, 1) : new THREE.Uint16BufferAttribute(out.indices, 1));
    geometry.computeVertexNormals();
    // Toe cap vertices keep their own normals; the hem's are the edge's it folds back from
    smoothNormalsAcrossSeams(geometry, [...sharedOf, ...new Array(out.positions.length / 3 - size).fill(-1)]);

    const shading = geometry.attributes.normal;

    // (A strap's shell shades as the normals it's grown along, not its own few faces')
    if (garment.over) {
        for (let i = 0; i < size; i++) {
            const s = sharedOf[i];

            shading.setXYZ(i, normal[s * 3], normal[s * 3 + 1], normal[s * 3 + 2]);
        }
    }

    for (let h = 0; h < hemOf.length; h += 2) {
        shading.setXYZ(hemOf[h], shading.getX(hemOf[h + 1]), shading.getY(hemOf[h + 1]), shading.getZ(hemOf[h + 1]));
    }

    if (garment.toeBox) {
        joinToeCaps(geometry, out.capJoins ?? []);
    }

    return { geometry, covers: new Set(covers), sources: Int32Array.from(sources), garment, reach };
}

/**
 * A toe box for one foot (side 1 left, -1 right): a smooth cap lofted forward from where the
 * boot was cut near the ball of the foot (`loop`, in order round it), keeping the cut's outline
 * but as wide and tall as all the toes together, and rounded off in front of them like a dome.
 * The toes under it aren't drawn, so it needn't follow each one. It's skinned from the foot to
 * the toes, so it bends with them.
 */
function addToeCap(cap, { loop, fractions }, side) {
    const { shell, sharedOf, onCut, out, sources, human, positions, normals, vertices, thickness, triangles } = cap;
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

        if (!seen.has(r) && regionAt(vertices, v) === "foot" && sideAt(vertices, v) === side && footAt(vertices, v) > TOE_CUT - 0.02) {
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

    // The boot's slope at each point of the cut (sideways and up, for each step forward), for the
    // cap to set off along so there's no crease where they join: from the boot 1 to 3 cm behind
    // it, the same way round the foot (from the point's own neighbours, a column set off 2 cm out
    // past the little toe where they lay more to its side than behind it)
    const around = (x, y) => Math.atan2(y - loopCentre[1], x - loopCentre[0]);
    const boot = [];

    for (let s = 0; s < shell.length / 3; s++) {
        const dz = z0 - shell[s * 3 + 2];

        if (!onCut[s] && Math.sign(shell[s * 3]) === side && dz > 0 && dz < 0.06) {
            boot.push(s);
        }
    }

    let slopes = loopPoints.map((p) => {
        const way = around(p[0], p[1]);
        let behind = -1;
        let nearest = Infinity;

        for (const s of boot) {
            const dz = p[2] - shell[s * 3 + 2];
            const turn = Math.abs(Math.atan2(Math.sin(around(shell[s * 3], shell[s * 3 + 1]) - way), Math.cos(around(shell[s * 3], shell[s * 3 + 1]) - way)));

            if (dz >= 0.01 && dz <= 0.03 && turn < nearest) {
                behind = s;
                nearest = turn;
            }
        }

        return behind >= 0 ? [0, 1, 2].map((k) => p[k] - shell[behind * 3 + k]) : [0, 0, 1];
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
function cutLoop(edge, onCut, shell, side) {
    const next = new Map();

    for (let e = 0; e < edge.length; e += 2) {
        const [a, b] = [edge[e], edge[e + 1]];

        if (onCut[a] && onCut[b] && Math.sign(shell[a * 3]) === side) {
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
