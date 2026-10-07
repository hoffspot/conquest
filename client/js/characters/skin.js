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
import { cells, fbm, gaussian, hash3, smoothstep, valueNoise } from "./noise.js";
import { allAtOnce } from "../core/steps.js";

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
    rose: "#d88aa6",
});

/** Everything paintSkin() can be told, with the defaults. */
export const SKIN_DEFAULTS = Object.freeze({
    tone: SKIN_TONES.light,
    variation: 1, // blotchiness
    blush: 0.5, // redness of cheeks, nose, ears, knuckles, knees, elbows
    lips: null, // lip colour (null: from the tone)
    brows: 0.6, // thickness 0 to 1
    browColour: null, // null: from the hair colour
    hairColour: HAIR_COLOURS.brown, // (a character paints its hair's colour)
    scalp: 0, // hair painted on the scalp (a buzz cut, or under hair)
    stubble: 0, // beard shadow 0 to 1
    freckles: 0,
    warts: 0,
    warpaint: null, // colour of stripes across the eyes, or null
    veins: 0,
    // (Cat folk's and lizard folk's: fur, lying one way; stripes on it, of `stripeColour`, with a
    // paler belly; scales, each a little different)
    fur: 0,
    stripes: 0,
    stripeColour: null, // null: darker than the tone
    scales: 0,
    image: null, // a whole texture ({ width, height, data } RGBA): replaces the painted skin
});

/** The eye texture's settings. */
export const EYE_DEFAULTS = Object.freeze({ iris: "#6a4a2c", sclera: "#f1ede6", pupil: 0.3, slit: false });

const MASKS = ["lips", "ears", "eyelids", "aureolae", "fingernails", "toenails", "crotch"];

/**
 * Load MakeHuman's masks, as one channel each at `size`: from `paths` (the body's manifest's:
 * the MakeHuman body's client/characters/masks/*.jpg; another body's, carried over into its
 * texture layout), in MASKS' order. And the body's own skin pictures, if it has them (`skin`: its
 * manifest's, { light, dark, height, roughness }), as `skin`: the colours three channels a texel,
 * the height and roughness one.
 */
export async function loadMasks(base, size, fetch = globalThis.fetch.bind(globalThis), paths = MASKS.map((name) => `masks/${name}.jpg`), skin = null) {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const bitmap = async (path) => createImageBitmap(await (await fetch(new URL(path, base).href)).blob());
    const [bitmaps, pictures] = await Promise.all([Promise.all(paths.map(bitmap)), Promise.all(Object.entries(skin ?? {}).map(async ([name, path]) => [name, await bitmap(path)]))]);
    // (Each drawn at `size`, its channels taken: the first `channels` of each texel's four)
    const read = (image, channels) => {
        context.clearRect(0, 0, size, size);
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, size, size);
        image.close();

        const { data } = context.getImageData(0, 0, size, size);
        const out = new Uint8Array(size * size * channels);

        for (let i = 0; i < size * size; i++) {
            for (let k = 0; k < channels; k++) {
                out[i * channels + k] = data[i * 4 + k];
            }
        }

        return out;
    };
    const masks = Object.fromEntries(MASKS.map((name, k) => [name, read(bitmaps[k], 1)]));

    if (pictures.length) {
        masks.skin = Object.fromEntries(pictures.map(([name, image]) => [name, read(image, SKIN_PICTURE_CHANNELS[name] ?? 1)]));
    }

    return masks;
}

// (The body's own skin pictures' channels: the colours' three, the others' one)
const SKIN_PICTURE_CHANNELS = { light: 3, dark: 3 };

/**
 * Where every texel of the body's texture is on the body, and what's there. Build once per
 * texture size (a few hundred milliseconds at 1024), then paint as often as needed.
 */
export class SkinAtlas {
    /**
     * @param {import("./body.js").HumanData} human
     * @param {object} masks - loadMasks()'s result (or {} to paint without them).
     * @param {number} [size] - Texture size in texels (square).
     * @param {object} [analysed] - What another atlas of the body at this size found (its `parts`:
     *   worked out elsewhere, in a worker), taken as it is rather than worked out again.
     */
    constructor(human, masks = {}, size = 1024, analysed = null) {
        this.size = size;
        this.human = human;

        if (analysed) {
            Object.assign(this, { covered: analysed.covered, gutter: analysed.gutter, fields: analysed.fields, normals: analysed.normals });

            return;
        }

        const count = size * size;

        this.covered = new Uint8Array(count);
        this.fields = {};

        const field = (name) => (this.fields[name] = new Uint8Array(count));

        for (const name of ["fine", "coarse", "grain", "cavity", "red", "dark", "light", "lips", "nails", "areolae", "eyelids", "brow", "browHair", "beard", "scalp", "freckles", "warts", "paint", "veins", "ears", "oily"]) {
            field(name);
        }

        this.fields.brow.fill(255);

        // (The body's own skin pictures, if it has them: as they are, being in its layout)
        if (masks.skin) {
            Object.assign(this.fields, { skinLight: masks.skin.light, skinDark: masks.skin.dark, skinHeight: masks.skin.height, skinRoughness: masks.skin.roughness });
        }

        this.#analyse(human, masks);
    }

    /** What it found, for another atlas to take (a copy, when sent from a worker). */
    get parts() {
        const { size, covered, gutter, fields, normals } = this;

        return { size, covered, gutter, fields, normals };
    }

    /**
     * The fields only the other peoples' skins need (fur, stripes, a paler belly, scales: made
     * the first time they're wanted, as working out the scales is slow): `fields` has them after.
     */
    furAndScales() {
        if (this.fields.scales) {
            return;
        }

        const count = this.size * this.size;

        for (const name of ["fur", "stripes", "belly", "scales", "scaleTint"]) {
            this.fields[name] = new Uint8Array(count);
        }

        const { middle } = faceFrame(this.human, this.human.basePositions);
        const handBones = new Set(this.human.bones.map(({ name }, i) => (/Hand/.test(name) ? i : -1)));
        const headBones = new Set([this.human.boneIndex.get("Head"), this.human.boneIndex.get("Neck")]);

        this.#raster(this.human, (i, p, n, bone) => this.#furAndScales(i, p, n, [p[0] - middle[0], p[1] - middle[1], p[2] - middle[2]], headBones.has(bone), handBones.has(bone)));

        // (The texels just outside the triangles as their neighbours, so seams don't show)
        for (let g = 0; g < this.gutter.length; g += 2) {
            for (const name of ["fur", "stripes", "belly", "scales", "scaleTint"]) {
                this.fields[name][this.gutter[g]] = this.fields[name][this.gutter[g + 1]];
            }
        }
    }

    #furAndScales(i, p, n, face, onHead, onHand) {
        const f = this.fields;
        const set = (name, value) => (f[name][i] = Math.round(Math.min(1, Math.max(0, value)) * 255));
        const [fx, fy] = face;

        // Fur: fine strands lying down the body (long along it, narrow across)
        set("fur", valueNoise(p[0] * 520, p[1] * 70, p[2] * 520) * 0.65 + hash3(Math.floor(p[0] * 1800), Math.floor(p[1] * 300), Math.floor(p[2] * 1800)) * 0.35);

        // Stripes: bands round the body and limbs, wavering, broken here and there; a paler belly
        // and chest, throat and inner arms
        const warp = fbm(p[0] * 7 + 3, p[1] * 7, p[2] * 7, 3) - 0.5;
        const bands = 0.5 + 0.5 * Math.sin(p[1] * 70 + warp * 9 + (onHead ? fx * 90 : 0));
        const broken = smoothstep(0.35, 0.6, fbm(p[0] * 22, p[1] * 5, p[2] * 22, 2));

        set("stripes", smoothstep(0.62, 0.82, bands) * broken * (1 - smoothstep(0.35, 0.75, n[2]) * (onHead ? 0 : 0.8)));
        set("belly", onHead ? smoothstep(-0.02, -0.06, fy) * smoothstep(0.2, 0.6, n[2]) * 0.8 : smoothstep(0.3, 0.8, n[2]) * smoothstep(0.16, 0.05, Math.abs(p[0])) + smoothstep(0.2, 0.8, -n[1]) * 0.4);

        // Scales: cells a centimetre or so across (finer on the face and hands), edged, each its
        // own shade
        const fine = onHead || onHand ? 180 : 95;
        const cell = cells(p[0] * fine, p[1] * fine * 0.8, p[2] * fine);

        set("scales", smoothstep(0.18, 0.02, cell.next - cell.near));
        set("scaleTint", cell.cell);
    }

    // Every texel of the body's triangles in texture space, once: where it is on the base body
    // (`p`), its normal (`n`), its triangle's first vertex (`v`) and weights (`w`), and its bone
    #raster(human, visit) {
        const size = this.size;
        const positions = human.basePositions;
        const normals = (this.normals ??= human.normals(positions));
        const indices = human.renderIndices("body");
        const uvs = human.uvs;
        const source = human.renderSource;
        const seen = new Uint8Array(size * size);
        const p = [0, 0, 0];
        const n = [0, 0, 0];

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

                    if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02 || seen[i]) {
                        continue;
                    }

                    for (let k = 0; k < 3; k++) {
                        p[k] = w0 * positions[v[0] * 3 + k] + w1 * positions[v[1] * 3 + k] + w2 * positions[v[2] * 3 + k];
                        n[k] = w0 * normals[v[0] * 3 + k] + w1 * normals[v[1] * 3 + k] + w2 * normals[v[2] * 3 + k];
                    }

                    seen[i] = 1;
                    visit(i, p, n, bone, v, [w0, w1, w2]);
                }
            }
        }
    }

    #analyse(human, masks) {
        const positions = human.basePositions;
        const normals = (this.normals = human.normals(positions));

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
        const cavity = this.#cavity(human, positions, normals, human.renderIndices("body"));
        const face = [0, 0, 0];

        this.#raster(human, (i, p, n, bone, v, [w0, w1, w2]) => {
            for (let k = 0; k < 3; k++) {
                face[k] = p[k] - middle[k];
            }

            this.covered[i] = 1;
            this.fields.cavity[i] = Math.round(Math.min(1, Math.max(0, 0.5 + 2.5 * (w0 * cavity[v[0]] + w1 * cavity[v[1]] + w2 * cavity[v[2]]))) * 255);
            this.#texel(i, p, n, face, bone, { eyeX, joints, handBones, footBones, headBones, dist2, masks });
        });

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

        // The T-zone, where skin is oilier and shines more: the middle of the forehead, and down
        // the nose to its tip
        if (onHead && fz > 0) {
            const nose = Math.max(0, Math.min(1, -fy / 0.036));
            const bridge = gaussian(fx * fx + (fy + 0.036 * nose) ** 2 * (fy > 0 || fy < -0.036 ? 1 : 0) + (fz - 0.03 - 0.014 * nose) ** 2 * 0.3, 0.011);

            set("oily", Math.max(0.8 * gaussian(fx * fx * 0.45 + (fy - 0.052) ** 2, 0.028), 0.9 * bridge));
        }

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

            // (Down the neck, where the triangles are the chest's, the beard's and the scalp's
            // edges fade as on the head, rather than stopping along the triangles)
            if (ax < 0.09) {
                set("beard", beardAmount(fx, fy, fz) * (1 - mask("ears")));
                set("scalp", smoothstep(-0.005, 0.005, aboveHairline(fx, fy, fz)) * (1 - smoothstep(0.35, 0.6, nearEar(fx, fy, fz))) * (1 - mask("ears")));
            }

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
 * How rough the skin is at each texel, from 0 (a mirror) to 1: what's painted in its picture's
 * alpha, which the body's shader (character.js SkinMaterial) reads as its roughness. Skin's a
 * little glossy (SKIN_ROUGHNESS.skin), oilier down the forehead and nose, matte in its creases
 * and where hair's painted on; lips are moist and nails glossy; fur is matte, and scales glossy
 * with rough cracks between them.
 */
export const SKIN_ROUGHNESS = Object.freeze({ skin: 0.56, oily: 0.4, crease: 0.72, lips: 0.32, nails: 0.28, hair: 0.8, paint: 0.5, fur: 0.84, scales: 0.38, cracks: 0.75 });

// (A texel's: `hollow` how far into a crease, -0.5 to 0.5; the painted hair's amounts; `own`, the
// body's own pictures' (ownSkin), whose roughness picture has its oily and creased places)
function roughness(f, i, look, { fine, hollow, stubble, browAlpha, own }) {
    const R = SKIN_ROUGHNESS;
    let rough;

    if (own) {
        rough = R.skin + f.skinRoughness[i] / 255 - own.roughness;
    } else {
        rough = R.skin + 0.05 * fine;

        if (f.oily[i]) {
            rough += (R.oily - R.skin) * (f.oily[i] / 255);
        }

        if (hollow > 0) {
            rough += (R.crease - R.skin) * Math.min(1, hollow * 3);
        }
    }

    if (f.lips[i]) {
        rough += (R.lips - rough) * (f.lips[i] / 255) * 0.9;
    }

    if (f.nails[i]) {
        rough += (R.nails - rough) * (f.nails[i] / 255);
    }

    if (look.warpaint && f.paint[i]) {
        rough += (R.paint - rough) * (f.paint[i] / 255);
    }

    const hair = Math.min(1, Math.max(stubble, browAlpha, (f.scalp[i] / 255) * look.scalp));

    if (hair) {
        rough += (R.hair - rough) * hair;
    }

    if (look.fur) {
        rough += (R.fur - rough) * look.fur;
    }

    if (look.scales) {
        rough += (R.scales + (R.cracks - R.scales) * (f.scales[i] / 255) - rough) * look.scales;
    }

    return Math.min(1, Math.max(0.05, rough));
}

/**
 * How much of each painted layer goes over a body's own skin pictures (ownSkin), which have their
 * own: their redness and shading, the lips, areolae and eyelids their colour, the creases
 * shaded. (Palms, soles and nails aren't painted over them at all.) And how much of their fine
 * relief (the height picture's bytes from 128) is the bump map's.
 */
export const OVER_OWN = Object.freeze({ blush: 0.5, dark: 0.5, areolae: 0.5, eyelids: 0, cavity: 0.5, relief: 0.6 });

// sRGB bytes as linear; linear, in 4096ths, as sRGB (0 to 1)
const LINEAR = Float32Array.from({ length: 256 }, (_, b) => (b / 255 <= 0.04045 ? b / 255 / 12.92 : ((b / 255 + 0.055) / 1.055) ** 2.4));
const SRGB = Float32Array.from({ length: 4097 }, (_, k) => (k / 4096 <= 0.0031308 ? (12.92 * k) / 4096 : 1.055 * (k / 4096) ** (1 / 2.4) - 0.055));
const ownAverages = new WeakMap();

/**
 * A body's own skin pictures (the atlas's skinLight and skinDark: its light and its dark skin's
 * colours) for a tone ("#rrggbb"): `dark`, how far from the light to the dark (mixed linearly, as
 * they're made to be) for the skin's average to be as bright as the tone, and `gain`, what each
 * channel's then multiplied by (linear) for it to be the tone's colour; `roughness`, the
 * roughness picture's average. Null if the body has none.
 */
export function ownSkin(atlas, tone) {
    const f = atlas.fields;

    if (!f.skinLight) {
        return null;
    }

    if (!ownAverages.has(f.skinLight)) {
        const light = [0, 0, 0];
        const dark = [0, 0, 0];
        let [roughness, count] = [0, 0];

        for (let i = 0; i < atlas.covered.length; i++) {
            if (atlas.covered[i]) {
                for (let k = 0; k < 3; k++) {
                    light[k] += LINEAR[f.skinLight[i * 3 + k]];
                    dark[k] += LINEAR[f.skinDark[i * 3 + k]];
                }

                roughness += f.skinRoughness[i] / 255;
                count++;
            }
        }

        ownAverages.set(f.skinLight, { light: light.map((c) => c / count), dark: dark.map((c) => c / count), roughness: roughness / count });
    }

    const { light, dark, roughness } = ownAverages.get(f.skinLight);
    const target = rgb(tone).map((c) => LINEAR[Math.round(c * 255)]);
    const brightness = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const toDark = Math.min(1, Math.max(0, (brightness(light) - brightness(target)) / (brightness(light) - brightness(dark))));

    return { dark: toDark, gain: target.map((c, k) => c / (light[k] + (dark[k] - light[k]) * toDark)), roughness };
}

/**
 * Paint the skin: returns { width, height, data } (RGBA bytes: its colour, and its roughness in
 * alpha), and the bump map's heights in `bump` (one byte a texel).
 */
export function paintSkin(atlas, settings = {}) {
    return allAtOnce(paintingSkin(atlas, settings));
}

// How many texels paintingSkin paints a step
const SKIN_STEP = 16384;

/** The same (paintSkin), painted a step at a time (each a yield: a few rows of texels), returning it. */
export function* paintingSkin(atlas, settings = {}) {
    const look = { ...SKIN_DEFAULTS, ...settings };

    // (Fur, stripes and scales: the fields for them made, the first time)
    if (look.fur || look.stripes || look.scales) {
        atlas.furAndScales();
    }

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
    const stripeColour = look.stripeColour ? rgb(look.stripeColour) : tone.map((c) => c * 0.45);
    const image = look.image;
    // (The body's own skin pictures, if it has them, matched to the tone: what's painted over)
    const own = image ? null : ownSkin(atlas, look.tone);
    const over = (layer) => (own ? OVER_OWN[layer] : 1);
    const colour = [0, 0, 0];
    // (Towards a colour, r g b: not an array, as this is done a few dozen times a texel)
    const mix = (r, g, b, amount) => {
        colour[0] += (r - colour[0]) * amount;
        colour[1] += (g - colour[1]) * amount;
        colour[2] += (b - colour[2]) * amount;
    };
    const mixTo = (target, amount) => mix(target[0], target[1], target[2], amount);
    // (The painted hair's colours, a little darker than the hair's: the same for every texel)
    const stubbleColour = hair.map((c) => c * 0.78);
    const scalpColour = hair.map((c) => c * 0.75);

    for (let i = 0; i < count; i++) {
        if (i % SKIN_STEP === 0) {
            yield;
        }

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
            if (own) {
                // Its own skin: its light and dark pictures mixed, made the tone's colour; its
                // blotches as much more or less as `variation`
                for (let k = 0; k < 3; k++) {
                    const light = LINEAR[f.skinLight[i * 3 + k]];
                    const linear = (light + (LINEAR[f.skinDark[i * 3 + k]] - light) * own.dark) * own.gain[k];

                    colour[k] = SRGB[Math.min(4096, Math.round(linear * 4096))];

                    if (look.variation !== 1) {
                        colour[k] = Math.max(0, tone[k] + (colour[k] - tone[k]) * look.variation);
                    }
                }
            } else {
                const shade = 1 + look.variation * (0.07 * coarse + 0.06 * fine);

                colour[0] = tone[0] * shade;
                colour[1] = tone[1] * shade;
                colour[2] = tone[2] * shade;

                // Patches a little redder or yellower
                mix(colour[0] * 1.04, colour[1] * 0.92, colour[2] * 0.9, Math.max(0, coarse) * 0.4 * look.variation);
            }

            // (Each of what follows only where its field has any: most have none on most of the
            // skin, and mixing none in changes nothing)

            // Redness, stronger on lighter skin
            if (f.red[i]) {
                mix(colour[0] * 1.08, colour[1] * 0.8, colour[2] * 0.8, (f.red[i] / 255) * look.blush * (0.35 + 0.5 * luminance) * over("blush"));
            }

            if (f.dark[i]) {
                mix(colour[0] * 0.7, colour[1] * 0.62, colour[2] * 0.66, (f.dark[i] / 255) * 0.25 * over("dark"));
            }

            // Palms and soles: lighter, more so on darker skin
            if (f.light[i] && !own) {
                mix(Math.min(1, tone[0] * 1.15 + 0.12), Math.min(1, tone[1] * 1.1 + 0.08), Math.min(1, tone[2] * 1.1 + 0.07), (f.light[i] / 255) * (0.25 + 0.55 * (1 - luminance)));
            }

            // (Over its own pictures, only a colour they're given: theirs is their own lips')
            if (f.lips[i] && (!own || look.lips)) {
                mixTo(lip, (f.lips[i] / 255) * 0.7);
            }

            if (f.areolae[i]) {
                mix(colour[0] * 0.72, colour[1] * 0.55, colour[2] * 0.52, (f.areolae[i] / 255) * 0.8 * over("areolae"));
            }

            if (f.nails[i] && !own) {
                mix(Math.min(1, tone[0] * 0.5 + 0.48), Math.min(1, tone[1] * 0.45 + 0.4), Math.min(1, tone[2] * 0.45 + 0.4), (f.nails[i] / 255) * 0.75);
            }

            if (f.eyelids[i]) {
                mix(colour[0] * 0.8, colour[1] * 0.7, colour[2] * 0.75, (f.eyelids[i] / 255) * 0.35 * over("eyelids"));
            }

            if (f.freckles[i]) {
                mix(tone[0] * 0.78, tone[1] * 0.6, tone[2] * 0.48, (f.freckles[i] / 255) * look.freckles);
            }

            if (f.veins[i]) {
                mix(colour[0] * 0.62, colour[1] * 0.66, colour[2] * 0.72, (f.veins[i] / 255) * look.veins * 0.6);
            }

            if (f.warts[i]) {
                mix(colour[0] * 0.75, colour[1] * 0.72, colour[2] * 0.6, (f.warts[i] / 255) * look.warts);
            }

            if (paint && f.paint[i]) {
                mixTo(paint, (f.paint[i] / 255) * (0.8 + 0.2 * fine));
            }

            // Fur: its strands lighter and darker; stripes; the belly paler
            if (look.fur) {
                const strand = f.fur[i] / 255 - 0.5;

                mix(colour[0] * (1 + strand * 0.5), colour[1] * (1 + strand * 0.5), colour[2] * (1 + strand * 0.45), look.fur);
            }

            if (look.stripes && f.stripes[i]) {
                mixTo(stripeColour, (f.stripes[i] / 255) * look.stripes * (0.8 + 0.2 * (f.fur[i] / 255)));
            }

            if ((look.fur || look.scales) && f.belly[i]) {
                mix(Math.min(1, tone[0] * 1.25 + 0.12), Math.min(1, tone[1] * 1.22 + 0.1), Math.min(1, tone[2] * 1.15 + 0.08), (f.belly[i] / 255) * 0.55 * Math.max(look.fur, look.scales));
            }

            // Scales: each its own shade, the cracks between them dark
            if (look.scales) {
                const tint = f.scaleTint[i] / 255 - 0.5;

                mix(colour[0] * (1 + tint * 0.3), colour[1] * (1 + tint * 0.25), colour[2] * (1 + tint * 0.2), look.scales);
                mix(colour[0] * 0.45, colour[1] * 0.48, colour[2] * 0.42, (f.scales[i] / 255) * look.scales * 0.8);
            }
        }

        // Creases darker, ridges a little lighter
        const hollow = f.cavity[i] / 255 - 0.5;

        if (hollow > 0) {
            mix(colour[0] * 0.7, colour[1] * 0.58, colour[2] * 0.58, Math.min(0.3, hollow) * over("cavity"));
        } else {
            mix(Math.min(1, colour[0] * 1.08), Math.min(1, colour[1] * 1.08), Math.min(1, colour[2] * 1.06), Math.min(0.4, -hollow) * over("cavity"));
        }

        // Hair painted on: stubble, scalp, brows
        // (Stubble and scalp get denser as they go up, so under a beard or hair they're solid)
        const beard = (f.beard[i] / 255) * look.stubble;
        const stubble = beard * (0.35 + 0.65 * grain) + Math.max(0, beard - 0.6) * 1.5;

        // (Painted hair is a little darker than the colour, like hair cards on average)
        if (stubble) {
            mixTo(stubbleColour, Math.min(0.95, stubble));
        }

        if (f.scalp[i]) {
            mixTo(scalpColour, Math.min(1, (f.scalp[i] / 255) * look.scalp * (0.75 + 0.25 * grain)));
        }

        const browEdge = 0.62 * look.brows;
        const browAlpha = (1 - smoothstep(browEdge - 0.08, browEdge + 0.03, f.brow[i] / 255)) * (0.45 + 0.55 * (f.browHair[i] / 255)) * Math.min(1, look.brows * 4);

        mixTo(brow, browAlpha * 0.95);

        data[i * 4] = colour[0] * 255;
        data[i * 4 + 1] = colour[1] * 255;
        data[i * 4 + 2] = colour[2] * 255;
        data[i * 4 + 3] = roughness(f, i, look, { fine, hollow, stubble, browAlpha, own }) * 255;

        // (Over its own pictures, their fine relief in place of the painted pores and lip lines)
        const relief = own ? OVER_OWN.relief * (f.skinHeight[i] - 128) : 40 * fine - 30 * (f.lips[i] / 255) * fine;

        bump[i] = 128 + relief + 14 * (grain - 0.5) + 40 * (f.warts[i] / 255) * look.warts + 25 * browAlpha + 12 * stubble + (look.fur ? 30 * look.fur * (f.fur[i] / 255 - 0.5) : 0) - (look.scales ? 55 * look.scales * (f.scales[i] / 255) : 0);
    }

    // Seams: copy each gutter texel from its neighbour
    const gutter = atlas.gutter;

    for (let g = 0; g < gutter.length; g += 2) {
        const to = gutter[g] * 4;
        const from = gutter[g + 1] * 4;

        data[to] = data[from];
        data[to + 1] = data[from + 1];
        data[to + 2] = data[from + 2];
        data[to + 3] = data[from + 3];
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
