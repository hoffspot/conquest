// CharMorph's Vitruvian body (client/characters/vitruvian.*, made by scripts/build-vitruvian.js):
// the same kind of data as the MakeHuman body's (human.*), so everything made on that is made on
// this, at the same height and with garments cut at the same places
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { BODIES, HumanData } from "../client/js/characters/body.js";
import { allDetailTargetNames } from "../client/js/characters/details.js";
import { buildGarment, measureBody } from "../client/js/characters/garments.js";
import { allBustTargetNames, allMacroTargetNames } from "../client/js/characters/macro.js";
import { PRESETS } from "../client/js/characters/presets.js";
import { Rig } from "../client/js/characters/rig.js";

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
});
