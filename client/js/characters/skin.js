// Skin: paints a character's body texture (in MakeHuman's UV layout) from a few settings, or
// takes a whole painted texture.
//
// Painting works from where each texel is on the body. SkinAtlas maps every texel back to its
// point on the base mesh once, and works out, per texel, everything the painting needs that
// doesn't change with the settings: two kinds of noise (seamless across the UV map's seams,
// because they come from 3D positions), MakeHuman's masks (lips, nails, eyelids...), and regions
// found from the face's landmarks (cheeks, brows, beard, scalp...). paintSkin() then only mixes
// colours per texel, which is quick enough to redo while a slider moves.
//
// Pure data (the DOM is only needed to load the masks: loadMasks), so it can be tested in Node.

import { aboveHairline, beardAmount, faceFrame, nearEar } from "./face.js";
import { fbm, gaussian, hash3, smoothstep, valueNoise } from "./noise.js";

/** Skin tones, light to dark (sRGB), and a few that aren't human. */
export const SKIN_TONES = Object.freeze({
    porcelain: "#f3d5c0",
    fair: "#e8bc9c",
    light: "#d9a47f",
    medium: "#c28560",
    olive: "#a97a52",
    tan: "#9a6440",
    brown: "#7a4a30",
    dark: "#5a3423",
    deep: "#3d2319",
    orc: "#4c5c2e",
    darkOrc: "#3a4724",
    ash: "#8c9493",
    pale: "#b9bdb0",
});

export const HAIR_COLOURS = Object.freeze({
    black: "#141110",
    darkBrown: "#2e1f16",
    brown: "#533626",
    auburn: "#7a3a1f",
    red: "#a4481f",
    blond: "#b88f55",
    platinum: "#d9ccb0",
    grey: "#8d8a86",
    white: "#e6e2dc",
});

/** Everything paintSkin() can be told, with the defaults. */
export const SKIN_DEFAULTS = Object.freeze({
    tone: SKIN_TONES.light,
    variation: 1, // blotchiness
    blush: 0.5, // redness of cheeks, nose, ears, knuckles, knees, elbows
    lips: null, // lip colour (null: from the tone)
    brows: 0.6, // thickness 0 to 1
    browColour: null, // null: from the hair colour
    hairColour: HAIR_COLOURS.brown,
    scalp: 0, // hair painted on the scalp (a buzz cut, or under hair)
    stubble: 0, // beard shadow 0 to 1
    freckles: 0,
    warts: 0,
    warpaint: null, // colour of stripes across the eyes, or null
    veins: 0,
    image: null, // a whole texture ({ width, height, data } RGBA): replaces the painted skin
});

/** The eye texture's settings. */
export const EYE_DEFAULTS = Object.freeze({ iris: "#6a4a2c", sclera: "#f1ede6", pupil: 0.3, slit: false });

const MASKS = ["lips", "ears", "eyelids", "aureolae", "fingernails", "toenails", "crotch"];

/** Load MakeHuman's masks (client/characters/masks/*.jpg), as one channel each at `size`. */
export async function loadMasks(base, size) {
    const masks = {};
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d", { willReadFrequently: true });

    await Promise.all(MASKS.map(async (name) => {
        const blob = await (await fetch(new URL(`masks/${name}.jpg`, base))).blob();
        const bitmap = await createImageBitmap(blob);

        masks[name] = bitmap;
    }));

    for (const name of MASKS) {
        context.clearRect(0, 0, size, size);
        context.drawImage(masks[name], 0, 0, size, size);
        masks[name].close();

        const { data } = context.getImageData(0, 0, size, size);
        const channel = new Uint8Array(size * size);

        for (let i = 0; i < channel.length; i++) {
            channel[i] = data[i * 4];
        }

        masks[name] = channel;
    }

    return masks;
}

/**
 * Where every texel of the body's texture is on the body, and what's there. Build once per
 * texture size (a few hundred milliseconds at 1024), then paint as often as needed.
 */
export class SkinAtlas {
    /**
     * @param {import("./body.js").HumanData} human
     * @param {object} masks - loadMasks()'s result (or {} to paint without them).
     * @param {number} [size] - Texture size in texels (square).
     */
    constructor(human, masks = {}, size = 1024) {
        this.size = size;

        const count = size * size;

        this.covered = new Uint8Array(count);
        this.fields = {};

        const field = (name) => (this.fields[name] = new Uint8Array(count));

        for (const name of ["fine", "coarse", "grain", "cavity", "red", "dark", "light", "lips", "nails", "areolae", "eyelids", "brow", "browHair", "beard", "scalp", "freckles", "warts", "paint", "veins", "ears"]) {
            field(name);
        }

        this.fields.brow.fill(255);

        this.#analyse(human, masks);
    }

    #analyse(human, masks) {
        const size = this.size;
        const positions = human.basePositions;
        const normals = human.normals(positions);

        // Landmarks, in the base mesh: eyes, and joints
        const { middle, eyeX } = faceFrame(human, positions);
        const joint = (name, end = 0) => {
            const at = human.boneIndex.get(name) * 6 + end * 3;

            return [human.jointBase[at], human.jointBase[at + 1], human.jointBase[at + 2]];
        };
        const joints = {
            elbows: [joint("LeftForeArm"), joint("RightForeArm")],
            knees: [joint("LeftLeg"), joint("RightLeg")],
            armpits: [joint("LeftArm"), joint("RightArm")],
            neck: joint("Neck"),
            head: joint("Head"),
        };
        const handBones = new Set(human.bones.map(({ name }, i) => (/Hand/.test(name) ? i : -1)));
        const footBones = new Set(human.bones.map(({ name }, i) => (/Foot|Toe/.test(name) ? i : -1)));
        const headBones = new Set([human.boneIndex.get("Head"), human.boneIndex.get("Neck")]);
        const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

        // Rasterise the body's triangles in texture space
        const indices = human.renderIndices("body");
        const uvs = human.uvs;
        const source = human.renderSource;
        const cavity = this.#cavity(human, positions, normals, indices);
        const p = [0, 0, 0];
        const n = [0, 0, 0];
        const face = [0, 0, 0];

        for (let t = 0; t < indices.length; t += 3) {
            const r = [indices[t], indices[t + 1], indices[t + 2]];
            const x = r.map((k) => uvs[k * 2] * size);
            const y = r.map((k) => (1 - uvs[k * 2 + 1]) * size);
            const v = r.map((k) => source[k]);
            const bone = human.skinIndices[v[0] * 4];
            const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);

            if (Math.abs(area) < 1e-12) {
                continue;
            }

            const minX = Math.max(0, Math.floor(Math.min(...x)));
            const maxX = Math.min(size - 1, Math.ceil(Math.max(...x)));
            const minY = Math.max(0, Math.floor(Math.min(...y)));
            const maxY = Math.min(size - 1, Math.ceil(Math.max(...y)));

            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    const cx = px + 0.5;
                    const cy = py + 0.5;
                    const w0 = ((x[1] - cx) * (y[2] - cy) - (x[2] - cx) * (y[1] - cy)) / area;
                    const w1 = ((x[2] - cx) * (y[0] - cy) - (x[0] - cx) * (y[2] - cy)) / area;
                    const w2 = 1 - w0 - w1;
                    const i = py * size + px;

                    if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02 || this.covered[i]) {
                        continue;
                    }

                    for (let k = 0; k < 3; k++) {
                        p[k] = w0 * positions[v[0] * 3 + k] + w1 * positions[v[1] * 3 + k] + w2 * positions[v[2] * 3 + k];
                        n[k] = w0 * normals[v[0] * 3 + k] + w1 * normals[v[1] * 3 + k] + w2 * normals[v[2] * 3 + k];
                        face[k] = p[k] - middle[k];
                    }

                    this.covered[i] = 1;
                    this.fields.cavity[i] = Math.round(Math.min(1, Math.max(0, 0.5 + 2.5 * (w0 * cavity[v[0]] + w1 * cavity[v[1]] + w2 * cavity[v[2]]))) * 255);
                    this.#texel(i, p, n, face, bone, { eyeX, joints, handBones, footBones, headBones, dist2, masks });
                }
            }
        }

        this.#gutter();
    }

    /** Everything about one texel, from its point on the body. */
    #texel(i, p, n, face, bone, context) {
        const f = this.fields;
        const { eyeX, joints, handBones, footBones, headBones, dist2, masks } = context;
        const mask = (name) => (masks[name] ? masks[name][i] / 255 : 0);
        const set = (name, value) => (f[name][i] = Math.round(Math.min(1, Math.max(0, value)) * 255));
        const onHead = headBones.has(bone);
        const [fx, fy, fz] = face;
        const ax = Math.abs(fx);

        set("fine", fbm(p[0] * 60, p[1] * 60, p[2] * 60, 3));
        set("coarse", fbm(p[0] * 9 + 11, p[1] * 9, p[2] * 9, 4));
        set("grain", hash3(Math.floor(p[0] * 2500), Math.floor(p[1] * 2500), Math.floor(p[2] * 2500)));

        // Redness: cheeks, nose, ears, knuckles, elbows, knees
        let red = 0;

        if (onHead) {
            red += 0.8 * gaussian((ax - 0.036) ** 2 + (fy + 0.028) ** 2 + (fz - 0.005) ** 2 * 0.3, 0.02);
            red += 0.6 * gaussian(fx * fx + (fy + 0.036) ** 2 + ((fz - 0.044) ** 2) * 0.5, 0.012);
            red += 0.7 * mask("ears");
        }

        if (handBones.has(bone)) {
            red += 0.35 + 0.3 * Math.max(0, -n[1]);
        }

        for (const elbow of joints.elbows) {
            red += 0.5 * gaussian(dist2(p, elbow), 0.035);
        }

        for (const knee of joints.knees) {
            red += 0.5 * gaussian(dist2(p, [knee[0], knee[1], knee[2] + 0.03]), 0.045);
        }

        set("red", red);
        set("ears", mask("ears"));

        // Shading: under the eyes, eyelids, armpits, crotch
        let dark = 0.6 * mask("crotch");

        if (onHead) {
            dark += 0.5 * gaussian((ax - eyeX) ** 2 * 0.6 + (fy + 0.017) ** 2, 0.009) * (fz > -0.02 ? 1 : 0);
        }

        for (const armpit of joints.armpits) {
            dark += 0.4 * gaussian(dist2(p, [armpit[0] * 0.85, armpit[1] - 0.06, armpit[2]]), 0.05);
        }

        set("dark", dark);

        // Palms and soles are lighter
        let light = 0;

        if (handBones.has(bone)) {
            light = smoothstep(0.1, 0.7, -n[0] * Math.sign(p[0]) * 0.6 - n[1] * 0.6);
        } else if (footBones.has(bone)) {
            light = smoothstep(-0.3, -0.8, n[1]);
        }

        set("light", light);
        set("lips", mask("lips"));
        set("nails", Math.max(mask("fingernails"), mask("toenails")));
        set("areolae", mask("aureolae"));
        set("eyelids", mask("eyelids"));

        set("warts", smoothstep(0.8, 0.9, fbm(p[0] * 180 + 5, p[1] * 180, p[2] * 180, 2)));
        set("veins", this.#veins(p));

        if (!onHead) {
            // Freckles on the shoulders and upper chest
            set("freckles", (p[1] > joints.armpits[0][1] - 0.15 && n[2] > 0.1 ? 0.6 : 0) * smoothstep(0.62, 0.8, fbm(p[0] * 700, p[1] * 700, p[2] * 700, 2)));

            return;
        }

        // Brows: an arch above each eye, thick by the nose, thinning to the tail. The field is
        // the distance from the brow's middle line (0) to twice its fullest half-height (1)
        const u = ax - eyeX; // along the brow: negative towards the nose
        const along = (u + 0.019) / 0.044; // 0 at the inner end, 1 at the tail

        if (along > -0.15 && along < 1.15 && fz > 0) {
            const t = Math.min(1, Math.max(0, along));
            const centre = 0.019 + 0.0045 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.005 * t * t;
            const half = 0.0065 * (1 - 0.55 * t);
            const d = Math.abs(fy - centre) / half;
            const ends = smoothstep(-0.15, 0.05, along) * (1 - smoothstep(0.9, 1.15, along));

            f.brow[i] = Math.round((1 - ends * (1 - Math.min(1, d / 2))) * 255);

            // Hairs: short strokes, pointing up at the inner end and outwards along the rest
            const direction = (75 - 70 * t) * (Math.PI / 180);
            const a = u * Math.cos(direction) + fy * Math.sin(direction);
            const b = -u * Math.sin(direction) + fy * Math.cos(direction);
            const strands = valueNoise(b * 900, a * 160, 3.7) * 0.7 + hash3(Math.floor(b * 2000), Math.floor(a * 400), 9) * 0.3;

            set("browHair", smoothstep(0.35, 0.7, strands));
        }

        // Beard: the jaw, chin, upper lip and upper neck, but not the lips
        set("beard", beardAmount(fx, fy, fz) * (1 - smoothstep(0.05, 0.4, mask("lips"))) * (1 - mask("ears")));

        // Scalp: above the hairline, not on or just round the ears
        set("scalp", smoothstep(-0.005, 0.005, aboveHairline(fx, fy, fz)) * (1 - smoothstep(0.35, 0.6, nearEar(fx, fy, fz))) * (1 - mask("ears")));

        // War paint: a band across the eyes and down the cheeks
        const band = smoothstep(0.013, 0.009, Math.abs(fy + 0.002)) * smoothstep(0.075, 0.065, ax);
        const drips = smoothstep(0.004, 0.002, Math.abs(ax - 0.03)) * smoothstep(-0.05, -0.04, fy) * smoothstep(0.012, 0.0, fy + 0.002);

        set("paint", Math.max(band, drips) * (fz > 0 ? 1 : 0));
        set("freckles", smoothstep(0.62, 0.8, fbm(p[0] * 700, p[1] * 700, p[2] * 700, 2)) * gaussian((ax - 0.028) ** 2 + (fy + 0.028) ** 2, 0.03) * (fz > 0.02 ? 1 : 0));
    }

    /**
     * How hollow the body is at each vertex: positive in creases and hollows (the neighbours rise
     * above it along its normal), negative on ridges.
     */
    #cavity(human, positions, normals, indices) {
        const source = human.renderSource;
        const sum = new Float32Array(human.vertexCount);
        const count = new Uint16Array(human.vertexCount);

        for (let t = 0; t < indices.length; t += 3) {
            for (let k = 0; k < 3; k++) {
                const a = source[indices[t + k]];
                const b = source[indices[t + ((k + 1) % 3)]];

                for (const [from, to] of [[a, b], [b, a]]) {
                    const dx = positions[to * 3] - positions[from * 3];
                    const dy = positions[to * 3 + 1] - positions[from * 3 + 1];
                    const dz = positions[to * 3 + 2] - positions[from * 3 + 2];
                    const length = Math.hypot(dx, dy, dz) || 1;

                    sum[from] += (dx * normals[from * 3] + dy * normals[from * 3 + 1] + dz * normals[from * 3 + 2]) / length;
                    count[from]++;
                }
            }
        }

        return sum.map((value, v) => (count[v] ? value / count[v] : 0));
    }

    #veins(p) {
        const a = fbm(p[0] * 25, p[1] * 25, p[2] * 25, 3);

        return smoothstep(0.03, 0.0, Math.abs(a - 0.5)) * 0.8;
    }

    /** Fill the texels just outside the triangles from their neighbours, so seams don't show. */
    #gutter() {
        const size = this.size;
        let covered = this.covered;

        this.gutter = [];

        for (let pass = 0; pass < 4; pass++) {
            const next = covered.slice();

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = y * size + x;

                    if (covered[i]) {
                        continue;
                    }

                    const neighbour = [i - 1, i + 1, i - size, i + size].find((j, k) => (k === 0 ? x > 0 : k === 1 ? x < size - 1 : k === 2 ? y > 0 : y < size - 1) && covered[j]);

                    if (neighbour !== undefined) {
                        next[i] = 1;
                        this.gutter.push(i, neighbour);
                    }
                }
            }

            covered = next;
        }
    }
}

/** "#rrggbb" to [r, g, b] (0 to 1). */
export function rgb(hex) {
    const value = Number.parseInt(hex.slice(1), 16);

    return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * Paint the skin: returns { width, height, data } (RGBA bytes), and the bump map's heights in
 * `bump` (one byte a texel).
 */
export function paintSkin(atlas, settings = {}) {
    const look = { ...SKIN_DEFAULTS, ...settings };
    const size = atlas.size;
    const count = size * size;
    const data = new Uint8ClampedArray(count * 4);
    const bump = new Uint8ClampedArray(count);
    const f = atlas.fields;
    const tone = rgb(look.tone);
    const luminance = 0.3 * tone[0] + 0.59 * tone[1] + 0.11 * tone[2];
    const hair = rgb(look.hairColour);
    const brow = look.browColour ? rgb(look.browColour) : hair.map((c) => c * 0.8);
    const lip = look.lips ? rgb(look.lips) : [tone[0] * 0.84, tone[1] * 0.64, tone[2] * 0.66];
    const paint = look.warpaint ? rgb(look.warpaint) : null;
    const image = look.image;
    const colour = [0, 0, 0];
    const mix = (target, amount) => {
        for (let k = 0; k < 3; k++) {
            colour[k] += (target[k] - colour[k]) * amount;
        }
    };

    for (let i = 0; i < count; i++) {
        if (!atlas.covered[i]) {
            continue;
        }

        const fine = f.fine[i] / 255 - 0.5;
        const coarse = f.coarse[i] / 255 - 0.5;
        const grain = f.grain[i] / 255;

        if (image) {
            const x = i % size;
            const y = Math.floor(i / size);
            const at = (Math.floor((y * image.height) / size) * image.width + Math.floor((x * image.width) / size)) * 4;

            colour[0] = image.data[at] / 255;
            colour[1] = image.data[at + 1] / 255;
            colour[2] = image.data[at + 2] / 255;
        } else {
            const shade = 1 + look.variation * (0.07 * coarse + 0.06 * fine);

            colour[0] = tone[0] * shade;
            colour[1] = tone[1] * shade;
            colour[2] = tone[2] * shade;

            // Patches a little redder or yellower
            mix([colour[0] * 1.04, colour[1] * 0.92, colour[2] * 0.9], Math.max(0, coarse) * 0.4 * look.variation);

            // Redness, stronger on lighter skin
            const red = (f.red[i] / 255) * look.blush * (0.35 + 0.5 * luminance);

            mix([colour[0] * 1.08, colour[1] * 0.8, colour[2] * 0.8], red);

            const dark = (f.dark[i] / 255) * 0.25;

            mix([colour[0] * 0.7, colour[1] * 0.62, colour[2] * 0.66], dark);

            // Palms and soles: lighter, more so on darker skin
            const light = (f.light[i] / 255) * (0.25 + 0.55 * (1 - luminance));

            mix([Math.min(1, tone[0] * 1.15 + 0.12), Math.min(1, tone[1] * 1.1 + 0.08), Math.min(1, tone[2] * 1.1 + 0.07)], light);

            mix(lip, (f.lips[i] / 255) * 0.7);
            mix([colour[0] * 0.72, colour[1] * 0.55, colour[2] * 0.52], (f.areolae[i] / 255) * 0.8);
            mix([Math.min(1, tone[0] * 0.5 + 0.48), Math.min(1, tone[1] * 0.45 + 0.4), Math.min(1, tone[2] * 0.45 + 0.4)], (f.nails[i] / 255) * 0.75);
            mix([colour[0] * 0.8, colour[1] * 0.7, colour[2] * 0.75], (f.eyelids[i] / 255) * 0.35);
            mix([tone[0] * 0.78, tone[1] * 0.6, tone[2] * 0.48], (f.freckles[i] / 255) * look.freckles);
            mix([colour[0] * 0.62, colour[1] * 0.66, colour[2] * 0.72], (f.veins[i] / 255) * look.veins * 0.6);
            mix([colour[0] * 0.75, colour[1] * 0.72, colour[2] * 0.6], (f.warts[i] / 255) * look.warts);

            if (paint) {
                mix(paint, (f.paint[i] / 255) * (0.8 + 0.2 * fine));
            }
        }

        // Creases darker, ridges a little lighter
        const hollow = f.cavity[i] / 255 - 0.5;

        if (hollow > 0) {
            mix([colour[0] * 0.7, colour[1] * 0.58, colour[2] * 0.58], Math.min(0.3, hollow));
        } else {
            mix([Math.min(1, colour[0] * 1.08), Math.min(1, colour[1] * 1.08), Math.min(1, colour[2] * 1.06)], Math.min(0.4, -hollow));
        }

        // Hair painted on: stubble, scalp, brows
        const stubble = (f.beard[i] / 255) * look.stubble * (0.35 + 0.65 * grain);

        mix(hair.map((c) => c * 0.9), Math.min(0.85, stubble));

        const scalp = (f.scalp[i] / 255) * look.scalp * (0.55 + 0.45 * grain);

        mix(hair, Math.min(0.92, scalp));

        const browEdge = 0.62 * look.brows;
        const browAlpha = (1 - smoothstep(browEdge - 0.08, browEdge + 0.03, f.brow[i] / 255)) * (0.25 + 0.75 * (f.browHair[i] / 255)) * Math.min(1, look.brows * 4);

        mix(brow, browAlpha * 0.9);

        data[i * 4] = colour[0] * 255;
        data[i * 4 + 1] = colour[1] * 255;
        data[i * 4 + 2] = colour[2] * 255;
        data[i * 4 + 3] = 255;

        bump[i] = 128 + 40 * fine + 14 * (grain - 0.5) + 40 * (f.warts[i] / 255) * look.warts + 25 * browAlpha + 12 * stubble - 30 * (f.lips[i] / 255) * fine;
    }

    // Seams: copy each gutter texel from its neighbour
    const gutter = atlas.gutter;

    for (let g = 0; g < gutter.length; g += 2) {
        const to = gutter[g] * 4;
        const from = gutter[g + 1] * 4;

        data[to] = data[from];
        data[to + 1] = data[from + 1];
        data[to + 2] = data[from + 2];
        data[to + 3] = 255;
        bump[gutter[g]] = bump[gutter[g + 1]];
    }

    return { width: size, height: size, data, bump };
}

/** Paint an eye (iris, pupil, sclera) for the eyes' texture: { width, height, data }. */
export function paintEye(settings = {}, size = 256) {
    const look = { ...EYE_DEFAULTS, ...settings };
    const data = new Uint8ClampedArray(size * size * 4);
    const iris = rgb(look.iris);
    const sclera = rgb(look.sclera);
    const irisRadius = 0.24;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const dy = (y + 0.5) / size - 0.5;
            const r = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const i = (y * size + x) * 4;
            let colour;

            if (r > irisRadius) {
                // Sclera, with faint veins towards the corners
                const vein = smoothstep(0.35, 0.5, r) * smoothstep(0.7, 0.9, valueNoise(angle * 12, r * 30, 1.5)) * 0.35;

                colour = [sclera[0] * (1 - 0.1 * vein) + 0.3 * vein, sclera[1] * (1 - 0.5 * vein), sclera[2] * (1 - 0.5 * vein)];
                colour = colour.map((c) => c * (1 - 0.12 * smoothstep(irisRadius, irisRadius + 0.05, r) * (1 - smoothstep(irisRadius + 0.05, 0.5, r))));
            } else {
                // Iris: radial fibres, a darker rim, lighter around the pupil
                const t = r / irisRadius;
                const fibres = 0.75 + 0.35 * valueNoise(angle * 18, t * 3, 0.5) + 0.15 * valueNoise(angle * 45, t * 8, 2.5);
                const rim = 1 - 0.55 * smoothstep(0.82, 1, t);
                const collar = 1 + 0.25 * gaussian((t - 0.42) ** 2, 0.12);

                colour = iris.map((c) => c * fibres * rim * collar);

                // Pupil: round, or a slit
                const pupil = look.slit ? Math.abs(dx) / (look.pupil * irisRadius * 0.35) + (dy / irisRadius) ** 2 : t / look.pupil;
                const inPupil = 1 - smoothstep(0.9, 1.05, pupil);

                colour = colour.map((c) => c * (1 - inPupil) + 0.02 * inPupil);
            }

            data[i] = colour[0] * 255;
            data[i + 1] = colour[1] * 255;
            data[i + 2] = colour[2] * 255;
            data[i + 3] = 255;
        }
    }

    return { width: size, height: size, data };
}
