// The wilds' bushes (client/js/world/art/kits/bushes.js), drawn as the hedges are: a mound of
// leaves, lit as one soft mass (no facets: every point's normal out from its middle, the same
// either side of its picture's join), within a few hundred triangles; its outline sprigs of
// leaves, as many as the quality draws; its berries on its upper sides; the same every time; and
// on materials made as the hedges' are, so no new program's made for them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUSHES, bushMaterials, bushMesh } from "../client/js/world/art/kits/bushes.js";
import { hedgeMaterials } from "../client/js/world/art/kits/hedges.js";

const GREEN = [0.05, 0.14, 0.02];
const BUSH = Object.freeze({ at: [3, 0.5, 4], across: 1.8, height: 1.2, turn: 0.7, seed: 4242, leaves: GREEN, bloom: [0.6, 0.02, 0.03], blooms: 16 });

const values = (attribute) => Array.from(attribute.array);
const meshNamed = (object, name) => object.children.find((child) => child.name === name);

describe("a bush (kits/bushes.js)", () => {
    it("is a soft mound of leaves: its body lit round from its middle, no facets, within a few hundred triangles, its sprigs over it", () => {
        const { object } = bushMesh([BUSH], [100, 200]);
        const body = meshNamed(object, "bushes");
        const sprigs = meshNamed(object, "bush sprigs");

        assert.ok(body && sprigs);
        assert.equal(body.material.name, "bush");
        assert.equal(sprigs.material.name, "bush sprigs");
        assert.ok(body.castShadow && !sprigs.castShadow);
        assert.deepEqual(body.position.toArray(), [100, 0, 200]);

        const position = values(body.geometry.attributes.position);
        const normal = values(body.geometry.attributes.normal);
        const middle = [BUSH.at[0], BUSH.at[1] + BUSH.height * 0.38, BUSH.at[2]];
        const triangles = body.geometry.index.count / 3;

        assert.ok(triangles >= 100 && triangles <= 360, `${triangles} triangles`);

        // (Every point lit as facing out from its middle; and where its picture's join has the
        // same point twice, the same normal both times: no edge to be seen)
        const seen = new Map();

        for (let k = 0; k < position.length; k += 3) {
            const out = [position[k] - middle[0], position[k + 1] - middle[1], position[k + 2] - middle[2]];
            const facing = out[0] * normal[k] + out[1] * normal[k + 1] + out[2] * normal[k + 2];
            const key = position.slice(k, k + 3).map((v) => v.toFixed(4)).join();

            assert.ok(facing > 0 || Math.hypot(...out) < 0.05, `the point at ${key} faces in`);
            assert.ok(Math.abs(Math.hypot(normal[k], normal[k + 1], normal[k + 2]) - 1) < 1e-4);

            if (seen.has(key)) {
                assert.deepEqual(seen.get(key), normal.slice(k, k + 3).map((v) => v.toFixed(4)), `two normals at ${key}`);
            }

            seen.set(key, normal.slice(k, k + 3).map((v) => v.toFixed(4)));
        }

        // (As tall as it's meant to be, wider than it's tall, sat on its foot)
        const ys = position.filter((_, k) => k % 3 === 1);
        const xs = position.filter((_, k) => k % 3 === 0);

        assert.ok(Math.min(...ys) > BUSH.at[1] - 0.1 && Math.min(...ys) < BUSH.at[1] + 0.05, `foot ${Math.min(...ys)}`);
        assert.ok(Math.max(...ys) > BUSH.at[1] + BUSH.height * 0.85 && Math.max(...ys) < BUSH.at[1] + BUSH.height * 1.25, `top ${Math.max(...ys)}`);
        assert.ok(Math.max(...xs) - Math.min(...xs) > BUSH.height, "wider than it's tall");

        // (Darker at its foot than its top; all of it coloured)
        const colour = values(body.geometry.attributes.color);

        assert.ok(colour.every((v) => Number.isFinite(v) && v >= 0 && v <= 2));
        assert.ok(colour[1] < colour[colour.length - 2], "its foot darker than its top");
        assert.equal(values(sprigs.geometry.attributes.position).length / 12, Math.round(BUSHES.sprigs * BUSH.across * BUSH.across));
    });

    it("has as many sprigs as the quality draws, and none at none", () => {
        const count = (sprigs) => {
            const mesh = meshNamed(bushMesh([BUSH], [0, 0], { sprigs }).object, "bush sprigs");

            return mesh ? mesh.geometry.attributes.position.count / 4 : 0;
        };

        assert.equal(count(0), 0);
        assert.ok(Math.abs(count(0.5) - count(1) / 2) <= 1);
        assert.ok(count(1) > 30);
    });

    it("bears its berries on its upper sides, small and round; none on one that bears none; the same every time", () => {
        const { berries } = bushMesh([BUSH], [0, 0]);

        assert.equal(berries.length, 16);

        for (const { at, radius, colour } of berries) {
            assert.ok(at[1] > BUSH.at[1] + BUSH.height * 0.3 && at[1] < BUSH.at[1] + BUSH.height * 1.25, `a berry at ${at[1]}`);
            assert.ok(Math.hypot(at[0] - BUSH.at[0], at[2] - BUSH.at[2]) < BUSH.across * 0.7);
            assert.ok(radius >= 0.025 && radius <= 0.045);
            assert.ok(colour[0] > colour[1]);
        }

        assert.deepEqual(bushMesh([{ ...BUSH, bloom: null }], [0, 0]).berries, []);
        assert.deepEqual(bushMesh([BUSH], [0, 0]).berries, berries);
        assert.deepEqual(values(meshNamed(bushMesh([BUSH], [0, 0]).object, "bushes").geometry.attributes.position), values(meshNamed(bushMesh([BUSH], [0, 0]).object, "bushes").geometry.attributes.position));
        assert.deepEqual(bushMesh([], [0, 0]), { object: null, berries: [] });
    });

    it("is drawn on materials made as the hedges' are: no new program for the graphics card to make", () => {
        const [bush, hedge] = [bushMaterials(), hedgeMaterials()];

        assert.equal(bush.body.type, hedge.body.type);
        assert.equal(bush.body.vertexColors, hedge.body.vertexColors);
        assert.equal(bush.sprigs.customProgramCacheKey(), hedge.sprigs.customProgramCacheKey());
        assert.equal(bush.sprigs.alphaTest, hedge.sprigs.alphaTest);
    });
});
