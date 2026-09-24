// Hair and beards, grown from the head: many thin strips ("hair cards", as most games use) with
// a strand texture, each following a strand from a root on the skin.
//
// Roots are spread over the head's skin above the style's hairline (and, for beards, over the
// jaw). Each strand leaves the skin in the style's direction (combed back, parted, standing
// up...), bends under gravity and slides over the head: the head's shape is measured as its
// radius in every direction from its middle, and strands are kept just outside it, in layers,
// so the same style fits any head. The neck and body are ellipsoids for long hair to fall over.
// Hair is skinned to the head, handing over to the neck and upper back lower down, so long hair
// follows the body. Under the cards, the scalp is painted in the hair's colour (skin.js).

import * as THREE from "three";
import { aboveHairline, beardAmount, faceFrame, HEAD_CENTRE_Z, nearEar } from "./face.js";
import { random, smoothstep } from "./noise.js";

/**
 * Hairstyles: how many strands, how long (metres), how they leave the scalp (`flow`, and `lift`
 * away from it), how much they fall (`gravity`), how thick the hair is (`volume`, metres).
 * `scalp` is how much hair to paint on the scalp; `raise` moves the hairline up.
 */
export const HAIRSTYLES = Object.freeze({
    bald: { label: "Bald", strands: 0, scalp: 0 },
    buzz: { label: "Buzz cut", strands: 0, scalp: 1 },
    short: { label: "Short", strands: 1800, length: 0.05, lift: 0.1, gravity: 0.15, flow: "crown", width: 0.016, segments: 4, volume: 0.01 },
    swept: { label: "Swept back", strands: 1500, length: 0.13, lift: 0.04, gravity: 0.6, flow: "back", width: 0.018, segments: 7, volume: 0.01 },
    bob: { label: "Bob", strands: 1600, length: 0.19, lift: 0.05, gravity: 0.55, flow: "part", width: 0.018, segments: 9, volume: 0.012 },
    long: { label: "Long", strands: 1700, length: 0.42, lift: 0.05, gravity: 0.7, flow: "part", width: 0.02, segments: 14, volume: 0.012 },
    ponytail: { label: "Ponytail", strands: 1300, length: 0.12, lift: 0.02, gravity: 0.05, flow: "tail", width: 0.016, segments: 6, volume: 0.006, tail: { strands: 220, length: 0.34, width: 0.02 } },
    mohawk: { label: "Mohawk", strands: 520, length: 0.11, lift: 1.2, gravity: 0, flow: "up", width: 0.02, segments: 5, volume: 0.004, strip: 0.02, scalp: 0.3 },
    topknot: { label: "Topknot", strands: 900, length: 0.09, lift: 0.02, gravity: 0, flow: "knot", width: 0.016, segments: 6, volume: 0.005, raise: 0.03, scalp: 0.4, knot: true },
});

/** Beards: `stubble` is painted on the skin under them (or is all there is). */
export const BEARDS = Object.freeze({
    none: { label: "None", strands: 0, stubble: 0 },
    stubble: { label: "Stubble", strands: 0, stubble: 0.35 },
    short: { label: "Short beard", strands: 2600, length: 0.016, lift: 0.08, gravity: 0.3, width: 0.007, segments: 3, stubble: 1, volume: 0.003 },
    full: { label: "Full beard", strands: 1300, length: 0.075, lift: 0.12, gravity: 0.6, width: 0.014, segments: 6, stubble: 1, volume: 0.006 },
    goatee: { label: "Goatee", strands: 450, length: 0.045, lift: 0.1, gravity: 0.6, width: 0.012, segments: 4, stubble: 0.9, volume: 0.004, goatee: true },
});

let strandTexture = null;

/**
 * A texture of hair strands in clumps, white so a material's colour tints it, shared by all
 * hair. The left and right halves are two variants; the tips are at the bottom.
 */
export function hairTexture() {
    if (strandTexture) {
        return strandTexture;
    }

    const width = 128;
    const height = 256;
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    const next = random(7);

    context.lineCap = "round";

    for (const half of [0, 1]) {
        const left = half * (width / 2) + 3;
        const span = width / 2 - 6;

        // Clumps of strands, each narrowing to a point near the tip
        for (let clump = 0; clump < 5; clump++) {
            const centre = left + ((clump + 0.5) / 5) * span + (next() - 0.5) * 3;
            const spread = span / 10;
            const end = height * (0.72 + 0.26 * next());

            for (let s = 0; s < 14; s++) {
                const start = centre + (next() - 0.5) * 2 * spread;
                const tip = centre + (next() - 0.5) * spread * 0.4;
                const shade = Math.round(170 + next() * 85);

                // Each strand starts at its own height, fading in, so a card's root edge is ragged
                const top = next() * height * 0.14;
                const gradient = context.createLinearGradient(0, top, 0, end);

                gradient.addColorStop(0, `rgba(${shade},${shade},${shade},0)`);
                gradient.addColorStop(0.12, `rgba(${shade},${shade},${shade},0.95)`);
                gradient.addColorStop(0.8, `rgba(${shade},${shade},${shade},0.85)`);
                gradient.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
                context.strokeStyle = gradient;
                context.lineWidth = 0.8 + next() * 1.1;
                context.beginPath();
                context.moveTo(start, top);
                context.bezierCurveTo(start, top + (end - top) * 0.4, tip + (next() - 0.5) * 2, top + (end - top) * 0.7, tip, end * (0.85 + 0.15 * next()));
                context.stroke();
            }
        }
    }

    strandTexture = new THREE.CanvasTexture(canvas);
    strandTexture.colorSpace = THREE.SRGBColorSpace;
    strandTexture.anisotropy = 4;

    return strandTexture;
}

/**
 * The head's shape as its radius in every direction from a point inside it, for keeping hair on
 * the outside.
 */
class HeadShape {
    static AROUND = 48;
    static UPDOWN = 24;

    constructor(centre, points) {
        const { AROUND, UPDOWN } = HeadShape;

        this.centre = centre;
        this.radii = new Float32Array(AROUND * UPDOWN);

        const d = new THREE.Vector3();

        for (const point of points) {
            d.copy(point).sub(centre);

            const [a, e] = this.#bin(d);
            const i = Math.round(e) * AROUND + (Math.round(a) % AROUND);

            this.radii[i] = Math.max(this.radii[i], d.length());
        }

        // Fill directions no vertex fell in from their neighbours
        for (let pass = 0; pass < 8; pass++) {
            for (let e = 0; e < UPDOWN; e++) {
                for (let a = 0; a < AROUND; a++) {
                    const i = e * AROUND + a;

                    if (!this.radii[i]) {
                        const around = [[a - 1, e], [a + 1, e], [a, e - 1], [a, e + 1]]
                            .filter(([, ee]) => ee >= 0 && ee < UPDOWN)
                            .map(([aa, ee]) => this.radii[ee * AROUND + ((aa + AROUND) % AROUND)])
                            .filter(Boolean);

                        if (around.length) {
                            this.radii[i] = around.reduce((sum, r) => sum + r, 0) / around.length;
                        }
                    }
                }
            }
        }
    }

    /** A direction's position in the table (fractional): [around, up/down]. */
    #bin(direction) {
        const { AROUND, UPDOWN } = HeadShape;
        const length = direction.length() || 1;
        const around = ((Math.atan2(direction.x, direction.z) / (2 * Math.PI) + 1) % 1) * AROUND;
        const updown = ((Math.asin(Math.max(-1, Math.min(1, direction.y / length))) / Math.PI) + 0.5) * (UPDOWN - 1);

        return [around, updown];
    }

    /** The head's radius in a direction. */
    radius(direction) {
        const { AROUND } = HeadShape;
        const [a, e] = this.#bin(direction);
        const a0 = Math.floor(a);
        const e0 = Math.floor(e);
        const fa = a - a0;
        const fe = e - e0;
        const at = (aa, ee) => this.radii[Math.min(HeadShape.UPDOWN - 1, ee) * AROUND + (aa % AROUND)];

        return (at(a0, e0) * (1 - fa) + at(a0 + 1, e0) * fa) * (1 - fe) + (at(a0, e0 + 1) * (1 - fa) + at(a0 + 1, e0 + 1) * fa) * fe;
    }

    /** Push a point out to `margin` above the head's surface. */
    pushOut(point, margin) {
        const d = point.clone().sub(this.centre);
        const length = d.length();
        const needed = this.radius(d) + margin;

        if (length < needed && length > 1e-6) {
            point.copy(this.centre).addScaledVector(d, needed / length);
        }
    }
}

/** An ellipsoid (centre, radii) fitted to the vertices mostly moved by some bones. */
function fitEllipsoid(human, positions, bones, grow = 1) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && bones.has(human.skinIndices[v * 4])) {
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], positions[v * 3 + k]);
                max[k] = Math.max(max[k], positions[v * 3 + k]);
            }
        }
    }

    return {
        centre: new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2),
        radii: new THREE.Vector3(((max[0] - min[0]) / 2) * grow, ((max[1] - min[1]) / 2) * grow, ((max[2] - min[2]) / 2) * grow),
    };
}

/** Push a point out of an ellipsoid (with a margin). */
function pushOutOfEllipsoid(point, { centre, radii }, margin) {
    const x = (point.x - centre.x) / (radii.x + margin);
    const y = (point.y - centre.y) / (radii.y + margin);
    const z = (point.z - centre.z) / (radii.z + margin);
    const d = Math.hypot(x, y, z);

    if (d < 1 && d > 1e-6) {
        point.set(centre.x + (x / d) * (radii.x + margin), centre.y + (y / d) * (radii.y + margin), centre.z + (z / d) * (radii.z + margin));
    }
}

/** Random points on triangles (area-weighted), with the triangles' normals. */
function sampleSurface(positions, triangles, count, next) {
    const areas = [];
    let total = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let t = 0; t < triangles.length; t += 3) {
        a.fromArray(positions, triangles[t] * 3);
        b.fromArray(positions, triangles[t + 1] * 3);
        c.fromArray(positions, triangles[t + 2] * 3);
        total += b.sub(a).cross(c.sub(a)).length() / 2;
        areas.push(total);
    }

    const points = [];

    for (let s = 0; s < count && total > 0; s++) {
        const pick = next() * total;
        let low = 0;
        let high = areas.length - 1;

        while (low < high) {
            const mid = (low + high) >> 1;

            if (areas[mid] < pick) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        const t = low * 3;
        let u = next();
        let v = next();

        if (u + v > 1) {
            u = 1 - u;
            v = 1 - v;
        }

        a.fromArray(positions, triangles[t] * 3);
        b.fromArray(positions, triangles[t + 1] * 3);
        c.fromArray(positions, triangles[t + 2] * 3);

        const point = a.clone().multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();

        points.push({ point, normal });
    }

    return points;
}

/**
 * Build a character's hair and beard as one geometry, to skin to its rig (or null for none).
 * `character` is a Character; `style` and `beard` are keys of HAIRSTYLES and BEARDS. Under a
 * hat or helmet, `below` keeps only the hair growing below that height (face coordinates).
 */
export function buildHair(character, style = "short", beard = "none", { seed = 1, below = Infinity } = {}) {
    const human = character.human;
    const positions = character.positions;
    const rig = character.rig;
    const hair = HAIRSTYLES[style] ?? HAIRSTYLES.short;
    const whiskers = BEARDS[beard] ?? BEARDS.none;

    if (!hair.strands && !whiskers.strands) {
        return null;
    }

    const next = random(seed);
    const face = faceFrame(human, positions);
    const at = (x, y, z) => new THREE.Vector3(...face.fromFace(x, y, z));
    const headBones = new Set([rig.index.get("Head")]);
    const headTriangles = character.sourceTriangles("body", headBones);
    const headPoints = [];

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && headBones.has(human.skinIndices[v * 4])) {
            headPoints.push(new THREE.Vector3().fromArray(positions, v * 3));
        }
    }

    const head = new HeadShape(at(0, 0.01, HEAD_CENTRE_Z), headPoints);
    const neck = fitEllipsoid(human, positions, new Set([rig.index.get("Neck")]), 0.92);
    const body = fitEllipsoid(human, positions, new Set([rig.index.get("Spine2"), rig.index.get("LeftShoulder"), rig.index.get("RightShoulder")]), 0.95);
    const keepOut = (point, margin) => {
        head.pushOut(point, margin);
        pushOutOfEllipsoid(point, neck, margin);
        pushOutOfEllipsoid(point, body, margin + 0.01);
    };
    const builder = new CardBuilder(rig, next);

    // Where the hair's crown whorl, topknot and ponytail tie are
    const crown = at(0, 0.1, -0.11);
    const knot = at(0, 0.145, -0.085);
    const tie = at(0, 0.035, -0.17);

    // A ponytail or topknot can't come out of a helmet
    const gathered = below < Infinity && (hair.tail || hair.knot);

    if (hair.strands && !gathered) {
        const roots = sampleSurface(positions, headTriangles, hair.strands * 4, next).filter(({ point }) => {
            const [x, y, z] = face.toFace(point.x, point.y, point.z);

            if (hair.strip && Math.abs(x) > hair.strip * (1 + 0.5 * smoothstep(0.08, -0.05, z))) {
                return false;
            }

            return y < below && aboveHairline(x, y, z, hair.raise ?? 0) > 0.002 && nearEar(x, y, z) < 0.3;
        }).slice(0, hair.strands);

        for (const { point, normal } of roots) {
            const outward = point.clone().sub(head.centre).normalize();
            const along = (direction) => direction.addScaledVector(outward, -direction.dot(outward)).normalize();
            const [x, y] = face.toFace(point.x, point.y, point.z);
            let direction;

            switch (hair.flow) {
                case "crown":
                    // Radiating from the whorl, forward over the forehead
                    direction = along(point.clone().sub(crown).add(new THREE.Vector3(0, -0.02, 0)));
                    break;
                case "back":
                    direction = along(new THREE.Vector3(Math.sign(x) * 0.15, -0.1 + 0.4 * smoothstep(0.05, 0.08, y), -1));
                    break;
                case "part":
                    // Away from a parting down the middle, then down
                    direction = along(new THREE.Vector3(Math.sign(x) || 1, -0.5, -0.35 + 0.2 * smoothstep(0.03, 0.07, y)));
                    break;
                case "tail":
                    direction = along(tie.clone().sub(point));
                    break;
                case "knot":
                    direction = along(knot.clone().sub(point));
                    break;
                default:
                    direction = outward.clone().add(new THREE.Vector3(0, 0, -0.35)).normalize();
            }

            const jitter = 0.25;

            direction.addScaledVector(outward, hair.lift).add(new THREE.Vector3((next() - 0.5) * jitter, (next() - 0.5) * jitter, (next() - 0.5) * jitter)).normalize();

            const layer = next();
            const length = hair.length * (0.75 + 0.45 * next());
            const stop = hair.flow === "knot" ? knot : hair.flow === "tail" ? tie : null;
            const start = point.clone().addScaledVector(normal.dot(outward) > 0 ? normal : outward, 0.001);
            const points = grow(start, direction, length, hair, (p, k) => keepOut(p, 0.002 + hair.volume * layer * Math.min(1, k * 2)), stop, next);

            builder.strand(points, hair.width, (p) => p.clone().sub(head.centre).normalize(), layer);
        }

        if (hair.tail) {
            addTail(builder, hair.tail, tie, keepOut, next);
        }

        if (hair.knot) {
            addKnot(builder, knot, next, face.scale);
        }
    }

    if (whiskers.strands) {
        const roots = sampleSurface(positions, headTriangles, whiskers.strands * 6, next).filter(({ point }) => {
            const [x, y, z] = face.toFace(point.x, point.y, point.z);

            if (whiskers.goatee && (Math.abs(x) > 0.024 || y > -0.045)) {
                return false;
            }

            // Not on the lips
            const onLips = Math.abs(x) < 0.027 && y < -0.056 && y > -0.081 && z > 0.015;

            return !onLips && beardAmount(x, y, z) > 0.6;
        }).slice(0, whiskers.strands);

        for (const { point, normal } of roots) {
            const down = new THREE.Vector3(0, -1, 0.1);
            const direction = down.addScaledVector(normal, -down.dot(normal)).normalize().addScaledVector(normal, whiskers.lift);

            direction.add(new THREE.Vector3((next() - 0.5) * 0.3, 0, (next() - 0.5) * 0.3)).normalize();

            const layer = next();
            const surface = normal.clone();
            const points = grow(point.clone().addScaledVector(normal, 0.001), direction, whiskers.length * (0.7 + 0.6 * next()), whiskers, (p, k) => {
                // Keep off the face: no nearer the face than the root, along its normal
                const above = p.clone().sub(point).dot(surface);
                const wanted = 0.001 + whiskers.volume * layer * Math.min(1, k * 2);

                if (above < wanted) {
                    p.addScaledVector(surface, wanted - above);
                }

                pushOutOfEllipsoid(p, neck, 0.004);
            }, null, next);

            builder.strand(points, whiskers.width, () => surface, layer);
        }
    }

    return builder.build();
}

/**
 * Grow a strand: `segments` steps from `root`, bending under gravity; `keepOut(point, step)`
 * keeps each point off the body. Strands with a `stop` (a tie or knot) are drawn to it.
 */
function grow(root, direction, length, style, keepOut, stop, next) {
    const points = [root.clone()];
    const segments = style.segments;
    const step = length / segments;
    const heading = direction.clone();
    const point = root.clone();

    for (let s = 1; s <= segments; s++) {
        heading.y -= style.gravity * (0.4 + 0.15 * next());
        heading.normalize();

        if (stop) {
            if (point.distanceTo(stop) < step) {
                points.push(stop.clone());
                break;
            }

            heading.lerp(stop.clone().sub(point).normalize(), 0.45).normalize();
        }

        const previous = point.clone();

        point.addScaledVector(heading, step);
        keepOut(point, s / segments);
        heading.copy(point).sub(previous).normalize();
        points.push(point.clone());
    }

    return points;
}

/** A ponytail: strands from a tie at the back of the head, hanging down the back. */
function addTail(builder, tail, tie, keepOut, next) {
    for (let s = 0; s < tail.strands; s++) {
        const start = tie.clone().add(new THREE.Vector3((next() - 0.5) * 0.016, (next() - 0.5) * 0.016, -0.004));
        const direction = new THREE.Vector3((next() - 0.5) * 0.2, -0.3, -0.9).normalize();
        const points = grow(start, direction, tail.length * (0.8 + 0.4 * next()), { segments: 10, gravity: 0.8 }, (p) => keepOut(p, 0.012), null, next);
        const middle = points[0].clone();

        // Gathered at the tie, spreading a little lower down
        points.forEach((point, k) => {
            const spread = 0.25 + 0.75 * (k / points.length);

            point.x = middle.x + (point.x - middle.x) * spread;
        });

        builder.strand(points, tail.width, (p) => new THREE.Vector3(p.x - middle.x, 0, p.z - middle.z - 0.03).normalize(), next());
    }
}

/** A topknot: a bun of short curled strands on top of the head. */
function addKnot(builder, centre, next, scale) {
    const radius = 0.026 * scale;

    for (let s = 0; s < 140; s++) {
        const angle = next() * Math.PI * 2;
        const height = (next() - 0.35) * radius * 1.2;
        const points = [];

        for (let k = 0; k <= 6; k++) {
            const a = angle + (k / 6) * 2.4;
            const r = radius * Math.sqrt(Math.max(0.15, 1 - (height / radius) ** 2));

            points.push(new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + radius * 0.7 + height, centre.z + Math.sin(a) * r));
        }

        builder.strand(points, 0.018 * scale, (p) => p.clone().sub(centre).normalize(), next());
    }
}

/** Collects strands as cards and builds the skinned geometry. */
class CardBuilder {
    constructor(rig, next) {
        this.next = next;
        this.positions = [];
        this.normals = [];
        this.colours = [];
        this.uvs = [];
        this.skinIndices = [];
        this.skinWeights = [];
        this.indices = [];
        this.head = rig.index.get("Head");
        this.neck = rig.index.get("Neck");
        this.chest = rig.index.get("Spine2");
        this.headY = rig.heads[this.head].y;
        this.neckY = rig.heads[this.neck].y;
    }

    /**
     * Add a strand (points from root to tip) as a card `width` wide, lying on the surface whose
     * normal at a point is `normalAt(point)`. `layer` (0 to 1): inner layers are darker.
     */
    strand(points, width, normalAt, layer = 0.5) {
        const first = this.positions.length / 3;
        const count = points.length;
        const u = this.next() < 0.5 ? 0 : 0.5;
        const shade = (0.8 + 0.35 * this.next()) * (0.8 + 0.2 * layer);
        const side = new THREE.Vector3();
        const along = new THREE.Vector3();

        if (count < 2) {
            return;
        }

        points.forEach((point, k) => {
            const t = k / (count - 1);
            const normal = normalAt(point);

            along.copy(points[Math.min(count - 1, k + 1)]).sub(points[Math.max(0, k - 1)]).normalize();
            side.crossVectors(along, normal).normalize();

            const half = (width / 2) * (1 - 0.45 * t);

            // Darker at the roots, where less light gets in
            const light = shade * (0.65 + 0.35 * smoothstep(0, 0.35, t));

            for (const s of [-1, 1]) {
                this.positions.push(point.x + side.x * half * s, point.y + side.y * half * s, point.z + side.z * half * s);
                this.normals.push(normal.x, normal.y, normal.z);
                this.colours.push(light, light, light);
                this.uvs.push(u + (s > 0 ? 0.5 : 0), 1 - t);

                // Skinned to the head, handing over to the neck and chest lower down
                const toHead = smoothstep(this.neckY - 0.02, this.headY + 0.02, point.y);
                const toNeck = (1 - toHead) * smoothstep(this.neckY - 0.12, this.neckY, point.y);
                const weights = [[this.head, toHead], [this.neck, toNeck], [this.chest, Math.max(0, 1 - toHead - toNeck)]].sort((a, b) => b[1] - a[1]);
                const bytes = weights.map(([, w]) => Math.round(w * 255));

                bytes[0] += 255 - bytes[0] - bytes[1] - bytes[2];
                this.skinIndices.push(weights[0][0], weights[1][0], weights[2][0], 0);
                this.skinWeights.push(bytes[0], bytes[1], bytes[2], 0);
            }

            if (k > 0) {
                const a = first + (k - 1) * 2;

                this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
        });
    }

    build() {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colours, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
        geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(this.skinIndices), 4));
        geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(this.skinWeights), 4, true));
        geometry.setIndex(this.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));

        return geometry;
    }
}
