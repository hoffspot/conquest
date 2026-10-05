// CharMorph's Vitruvian body (client/characters/vitruvian.*, made by scripts/build-vitruvian.js):
// the same kind of data as the MakeHuman body's (human.*), so everything made on that is made on
// this, at the same height and with garments cut at the same places
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync, inflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import * as THREE from "three";
import { BODIES, HumanData } from "../client/js/characters/body.js";
import { allDetailTargetNames } from "../client/js/characters/details.js";
import { socketOn } from "../client/js/characters/equipment.js";
import { faceFrame } from "../client/js/characters/face.js";
import { buildGarment, measureBody } from "../client/js/characters/garments.js";
import { allBustTargetNames, allMacroTargetNames } from "../client/js/characters/macro.js";
import { PRESETS } from "../client/js/characters/presets.js";
import { Rig } from "../client/js/characters/rig.js";
import { faceLandmarks } from "../scripts/build-vitruvian.js";

const folder = new URL("../client/characters/", import.meta.url);
const load = (body) => {
    const manifest = JSON.parse(readFileSync(new URL(`${body}.json`, folder), "utf8"));
    const unpacked = gunzipSync(readFileSync(new URL(`${body}.bin`, folder)));

    return new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));
};
const human = load("human");
const vitruvian = load("vitruvian");

/** The parts of a Character that garments and measures use, of a body in a shape. */
function figure(data, shape = {}) {
    const { positions, joints } = data.shape(shape);
    const rig = new Rig(data.bones);
    const object = new THREE.Group();
    let height = 0;

    for (let v = 0; v < data.vertexCount; v++) {
        if (data.partOf[v] === 0) {
            height = Math.max(height, positions[v * 3 + 1]);
        }
    }

    object.add(rig.root);
    rig.fit(joints);
    object.updateMatrixWorld(true);

    return { human: data, rig, object, positions, normals: data.normals(positions), joints, height, holds: {}, items: [] };
}

// A grey PNG's pixels (as scripts/build-vitruvian.js writes them: rows unfiltered)
function readGrayPng(bytes) {
    const width = bytes.readUInt32BE(16);
    const parts = [];

    for (let at = 8; at < bytes.length;) {
        const length = bytes.readUInt32BE(at);

        if (bytes.toString("latin1", at + 4, at + 8) === "IDAT") {
            parts.push(bytes.subarray(at + 8, at + 8 + length));
        }

        at += 12 + length;
    }

    const rows = inflateSync(Buffer.concat(parts));

    assert.ok([...Array(width).keys()].every((y) => rows[y * (width + 1)] === 0), "unfiltered rows");

    return { width, height: width, at: (x, y) => rows[y * (width + 1) + 1 + x] };
}

// How much each of a body's vertices is in a mask (in its texture layout): the most of its
// texture coordinates'
function maskOnVertices(data, mask) {
    const values = new Float32Array(data.vertexCount);

    for (const r of data.renderIndices("body")) {
        const x = Math.min(mask.width - 1, Math.max(0, Math.round(data.uvs[r * 2] * mask.width - 0.5)));
        const y = Math.min(mask.height - 1, Math.max(0, Math.round((1 - data.uvs[r * 2 + 1]) * mask.height - 0.5)));
        const v = data.renderSource[r];

        values[v] = Math.max(values[v], mask.at(x, y) / 255);
    }

    return values;
}

// A body's face's landmarks in its face frame (face.js: Vitruvian's mapped onto MakeHuman's), its
// lips by its own lip mask
function faceOf(data, shape, lips) {
    const { positions } = data.shape(shape);
    const frame = faceFrame(data, positions);
    const [points, weights] = [[], []];

    for (let v = 0; v < data.vertexCount; v++) {
        const p = frame.toFace(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);

        if (data.partOf[v] === 0 && Math.abs(p[0]) < 0.12 && Math.abs(p[1]) < 0.2 && p[2] > -0.25) {
            points.push(p);
            weights.push(lips[v]);
        }
    }

    return faceLandmarks(points, weights);
}

const humanLipsJpeg = jpeg.decode(readFileSync(new URL("masks/lips.jpg", folder)), { useTArray: true });
const humanLips = maskOnVertices(human, { width: humanLipsJpeg.width, height: humanLipsJpeg.height, at: (x, y) => humanLipsJpeg.data[(y * humanLipsJpeg.width + x) * 4] });
const vitruvianLips = maskOnVertices(vitruvian, readGrayPng(readFileSync(new URL("vitruvian/masks/lips.png", folder))));

const SHAPES = { average: {}, hero: PRESETS.hero.shape, heroine: PRESETS.heroine.shape, orc: PRESETS.orc.shape };

describe("the Vitruvian body (client/characters/vitruvian.*)", () => {
    it("is a body to choose, with MakeHuman's 52 bones in the same order", () => {
        assert.deepEqual(BODIES, ["human", "vitruvian"]);
        assert.deepEqual(vitruvian.bones.map(({ name, parent }) => [name, parent]), human.bones.map(({ name, parent }) => [name, parent]));
    });

    it("weights every vertex by its four strongest bones, the strongest first, adding up to 255", () => {
        for (let v = 0; v < vitruvian.vertexCount; v++) {
            const weights = vitruvian.skinWeights.subarray(v * 4, v * 4 + 4);

            assert.equal(weights[0] + weights[1] + weights[2] + weights[3], 255, `vertex ${v}'s weights add up`);
            // (Within a 255th, as two near enough the same can round either way)
            assert.ok(weights[0] + 1 >= weights[1] && weights[1] + 1 >= weights[2] && weights[2] + 1 >= weights[3], `vertex ${v}'s strongest first`);
            assert.ok([...vitruvian.skinIndices.subarray(v * 4, v * 4 + 4)].every((b) => b < vitruvian.bones.length));
        }
    });

    it("has MakeHuman's parts, drawn with 16-bit indices, and every shape the sliders blend", () => {
        assert.deepEqual(Object.keys(vitruvian.parts), Object.keys(human.parts));
        assert.ok(vitruvian.renderSource.length < 65536 && vitruvian.vertexCount < 65536);
        assert.ok(vitruvian.indices.every((r) => r < vitruvian.renderSource.length));
        assert.ok(vitruvian.renderSource.every((v) => v < vitruvian.vertexCount));
        assert.ok(vitruvian.uvs.every((value) => value >= 0 && value <= 1));
        assert.deepEqual([...vitruvian.macroIndex.keys()], allMacroTargetNames());
        assert.deepEqual(new Set(vitruvian.details.keys()), new Set([...allDetailTargetNames(), ...allBustTargetNames()]));
        assert.deepEqual(vitruvian.manifest.masks, ["lips", "ears", "eyelids", "aureolae", "fingernails", "toenails", "crotch"].map((name) => `vitruvian/masks/${name}.png`));

        for (const path of vitruvian.manifest.masks) {
            assert.equal(readFileSync(new URL(path, folder)).toString("latin1", 1, 4), "PNG", path);
        }
    });

    it("stands on the ground as tall as MakeHuman's body, in every shape", () => {
        for (const [name, shape] of Object.entries(SHAPES)) {
            const [a, b] = [figure(human, shape), figure(vitruvian, shape)];
            let lowest = Infinity;

            for (let v = 0; v < vitruvian.vertexCount; v++) {
                lowest = Math.min(lowest, b.positions[v * 3 + 1]);
            }

            assert.ok(Math.abs(b.height - a.height) < (name === "average" ? 0.005 : 0.025), `${name}: ${b.height.toFixed(3)} m, MakeHuman's ${a.height.toFixed(3)} m`);
            assert.ok(Math.abs(lowest) < 0.02, `${name}: feet at ${lowest}`);
        }

        assert.ok(figure(vitruvian, { macro: { gender: 1 } }).height > figure(vitruvian, { macro: { gender: 0 } }).height + 0.05, "men taller");
        assert.ok(figure(vitruvian, { macro: { height: 1 } }).height > figure(vitruvian, { macro: { height: 0 } }).height + 0.2, "the height slider");
    });

    it("measures the neck where MakeHuman's is measured, so a shirt comes as high up it", () => {
        // (Vitruvian's neck bone starts at the neck's foot, MakeHuman's half way up it: the
        // manifest's landmark puts garments' neck where MakeHuman's is)
        assert.ok(vitruvian.landmarks.neck > 0.2 && vitruvian.landmarks.neck < 0.7, `${vitruvian.landmarks.neck}`);
        assert.equal(human.landmarks.neck, 0);

        for (const [name, shape] of Object.entries(SHAPES)) {
            const [a, b] = [figure(human, shape), figure(vitruvian, shape)];
            const [ma, mb] = [measureBody(a), measureBody(b)];
            // (The shirt's top at the front of the neck, and at its back)
            const collar = (f, measures, front) => {
                const position = buildGarment(f, "shirt", measures).geometry.attributes.position;
                let top = -Infinity;

                for (let i = 0; i < position.count; i++) {
                    if (Math.abs(position.getX(i)) < 0.03 && (front ? position.getZ(i) > measures.landmarks.neckZ : position.getZ(i) < measures.landmarks.neckZ)) {
                        top = Math.max(top, position.getY(i));
                    }
                }

                return top / f.height;
            };

            assert.ok(Math.abs(mb.landmarks.neck / b.height - ma.landmarks.neck / a.height) < 0.01, `${name}: neck at ${(mb.landmarks.neck / b.height).toFixed(3)} of the height, MakeHuman's ${(ma.landmarks.neck / a.height).toFixed(3)}`);

            for (const front of [true, false]) {
                const [ours, theirs] = [collar(b, mb, front), collar(a, ma, front)];

                assert.ok(Math.abs(ours - theirs) < 0.012, `${name}: the shirt's ${front ? "front" : "back"} comes up to ${ours.toFixed(3)} of the height, on MakeHuman's ${theirs.toFixed(3)}`);
            }
        }
    });

    it("has its face where MakeHuman's is in face coordinates: lips, nose, chin, crown, the back of the skull, the ears", () => {
        // (Vitruvian's eyes are wider apart, which face coordinates are scaled by: its manifest's
        // landmarks.face brings its head onto MakeHuman's. Its lips are by its own lip mask, so
        // they're where its mouth is)
        assert.ok(vitruvian.landmarks.face.size > 0.85 && vitruvian.landmarks.face.size < 0.97, `${vitruvian.landmarks.face.size}`);
        assert.equal(human.landmarks.face, undefined);

        for (const [name, shape] of Object.entries(SHAPES)) {
            const [ours, theirs] = [faceOf(vitruvian, shape, vitruvianLips), faceOf(human, shape, humanLips)];
            const near = (what, a, b, within) => assert.ok(Math.abs(a - b) < within, `${name}: ${what} at ${a.toFixed(4)}, on MakeHuman's ${b.toFixed(4)}`);

            near("the lips", ours.lips[0], theirs.lips[0], 0.006);
            near("the nose's tip", ours.nose[0], theirs.nose[0], 0.006);
            near("the nose's tip, forward", ours.nose[1], theirs.nose[1], 0.006);
            near("the chin", ours.chin[0], theirs.chin[0], 0.008);
            near("the crown", ours.top, theirs.top, 0.006);
            near("the back of the skull", ours.back, theirs.back, 0.008);
            near("the ears", ours.ear, theirs.ear, 0.008);
        }
    });

    it("takes the face sliders where MakeHuman's face takes them: the lips' on its lips, the chin's on its chin", () => {
        // (How far forward the middle of the face reaches in a band of heights, and how wide the
        // jaw is, in face coordinates)
        const measure = (data, details) => {
            const { positions } = data.shape({ details });
            const frame = faceFrame(data, positions);
            const points = [];

            for (let v = 0; v < data.vertexCount; v++) {
                const p = frame.toFace(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);

                if (data.partOf[v] === 0 && Math.abs(p[0]) < 0.12 && Math.abs(p[1]) < 0.2 && p[2] > -0.25) {
                    points.push(p);
                }
            }

            const forward = (low, high) => Math.max(...points.filter((p) => Math.abs(p[0]) < 0.006 && p[1] > low && p[1] < high).map((p) => p[2]));

            return {
                lowerLip: forward(-0.09, -0.074),
                chin: forward(-0.115, -0.095),
                brow: forward(0, 0.03),
                jaw: 2 * Math.max(...points.filter((p) => p[1] > -0.1 && p[1] < -0.08 && p[2] > -0.06).map((p) => Math.abs(p[0]))),
            };
        };
        const [ours, theirs] = [measure(vitruvian, {}), measure(human, {})];

        for (const [slider, what] of [["underbite", "lowerLip"], ["lips", "lowerLip"], ["chin", "chin"], ["browRidge", "brow"], ["headSquare", "jaw"]]) {
            const ourChange = measure(vitruvian, { [slider]: 1 })[what] - ours[what];
            const theirChange = measure(human, { [slider]: 1 })[what] - theirs[what];

            assert.ok(ourChange > 0.7 * theirChange && ourChange < 1.3 * theirChange, `${slider}: ${what} ${(ourChange * 1000).toFixed(1)} mm, on MakeHuman's ${(theirChange * 1000).toFixed(1)} mm`);
        }
    });

    it("brings points into face coordinates and back as they were", () => {
        const { positions } = vitruvian.shape({});
        const frame = faceFrame(vitruvian, positions);

        for (const point of [[0, 1.5, 0.1], [0.05, 1.6, 0], [-0.08, 1.45, -0.05], [0, 1.7, -0.1]]) {
            const back = frame.fromFace(...frame.toFace(...point));

            assert.ok(back.every((value, k) => Math.abs(value - point[k]) < 1e-9), `${point} → ${back}`);
        }
    });

    it("puts an orc's tusks at its lower lip, as on MakeHuman's", () => {
        // (Where the jaw's pushed the lower lip forward: the orcs' underbite. Its height in face
        // coordinates, as MakeHuman's)
        const tusks = (data) => {
            const f = figure(data, PRESETS.orc.shape);
            const frame = faceFrame(data, f.positions);

            return frame.toFace(...socketOn(f, "mouth").position.clone().add(f.rig.heads[f.rig.index.get("Head")]).toArray());
        };
        const [ours, theirs] = [tusks(vitruvian), tusks(human)];
        const face = faceOf(vitruvian, PRESETS.orc.shape, vitruvianLips);

        assert.ok(ours[1] < face.lips[0] && ours[1] > face.chin[0], `the tusks at ${ours[1].toFixed(4)}, between the lips (${face.lips[0].toFixed(4)}) and the chin (${face.chin[0].toFixed(4)})`);
        assert.ok(Math.abs(ours[1] - theirs[1]) < 0.006, `the tusks at ${ours[1].toFixed(4)}, on MakeHuman's ${theirs[1].toFixed(4)}`);
    });
});
