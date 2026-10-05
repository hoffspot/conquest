// What the props and the yards' fences stand on, as the navigation mesh walks round them
// (core/setpieces/outlines.js, standing.js): the art's, as world/art/footprints.js measures it,
// and where the layout puts each one
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// (The art paints canvases: enough of one for it to in Node, every other drawing call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            createPattern: () => ({}),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { outlinesSource, PEOPLES, HEAD } = await import("../client/js/world/art/footprints.js");
const { PROP_OUTLINES, FENCE_BANDS } = await import("../client/js/core/setpieces/outlines.js");
const { fenceOutlines, HOUSE_REACH, propOutlines } = await import("../client/js/core/setpieces/standing.js");
const { PROPS } = await import("../client/js/core/setpieces/pieces.js");
const { builderOf, placed } = await import("../client/js/world/town3d.js");

describe("what props and fences stand on (setpieces/outlines.js, standing.js)", () => {
    it("is the art's, as `npm run build:footprints` measures it", async () => {
        const made = await readFile(new URL("../client/js/core/setpieces/outlines.js", import.meta.url), "utf8");

        assert.equal(made, await outlinesSource(), "outlines.js is out of date: npm run build:footprints");
        assert.deepEqual(Object.keys(PROP_OUTLINES), PEOPLES);
        assert.deepEqual(Object.keys(FENCE_BANDS), PEOPLES);

        for (const people of PEOPLES) {
            assert.deepEqual(Object.keys(PROP_OUTLINES[people]), Object.keys(PROPS), people);
        }
    });

    it("puts each prop's outlines round it where it's drawn, turned as it is", async () => {
        // (A stall and a well, turned, of a people of their own and anyone's: everything of them
        // lower than a body, as drawn in the town, is inside their outlines)
        for (const [people, name, facing] of [["human", "tent", 0.7], ["lizard", "well", 2.1], ["cat", "tent", -1.2], ["orc", "well", 3.9]]) {
            const [w, h] = PROPS[name];
            const piece = { kind: "prop", key: `prop-${name}`, name, w, h, x: 41.5, y: 17.25, facing, ...(people === "human" ? {} : { people }) };
            const object = placed(await builderOf(piece)(piece), piece);
            const outlines = propOutlines(piece);
            const point = new THREE.Vector3();
            let [checked, astray] = [0, 0];

            object.updateMatrixWorld(true);
            object.traverse((mesh) => {
                const position = mesh.isMesh && mesh.geometry.attributes.position;

                for (let i = 0; position && i < position.count; i += 3) {
                    // (In the art's world pixels, five to a metre)
                    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).divideScalar(5);

                    if (point.y <= HEAD) {
                        // (Each's built a little differently, from where it stands: within a few
                        // centimetres of the outlines of the ones measured)
                        const near = outlines.some((outline) => insideOrNear(outline, [point.x, point.z], 0.03));

                        checked++;
                        astray += near ? 0 : 1;
                    }
                }
            });

            assert.ok(checked > 20, `${people} ${name}: ${checked} points`);
            assert.equal(astray, 0, `${people} ${name}: ${astray} of ${checked} points outside its outlines`);
        }
    });

    it("stands a yard's fences along the sides it fences, as thick as its people's, closed along its house's back", () => {
        const yard = { kind: "yard", x: 20, y: 30, w: 2, h: 1.5, facing: Math.PI / 2, people: "elf", fence: [[[0, 6]], [[0, 3.2], [4.8, 8]], []], gate: { side: 1, at: 4 } };
        const quads = fenceOutlines(yard);
        const width = (quad) => Math.min(Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]), Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1]));
        // (A point of the yard's, `u` metres across from its left side and `v` in from its back)
        const [c, s] = [Math.cos(yard.facing), Math.sin(yard.facing)];
        const at = (u, v) => [yard.x + (u - 4) * c + (v - 3) * s, yard.y - (u - 4) * s + (v - 3) * c];

        // (Three runs: its left side and its back either side of its gateway, none down its right;
        // and along its front, its house's back)
        assert.equal(quads.length, 4);
        assert.ok(quads.slice(0, 3).every((quad) => Math.abs(width(quad) - (FENCE_BANDS.elf.to - FENCE_BANDS.elf.from)) < 1e-9), "as thick as the elves' hedges");
        assert.ok(insideOrNear(quads[3], at(4, 6 + HOUSE_REACH / 2), 0) && !insideOrNear(quads[3], at(4, 5.9), 0), "its house's back, from its front on");
        assert.ok(insideOrNear(quads[3], at(0.5, 6.05), 0) && insideOrNear(quads[3], at(7.5, 6.05), 0), "its house's back, as wide as it");

        // (Its gateway left open: the middle of its back, 4 m along it, on none)
        assert.ok(quads.every((quad) => !insideOrNear(quad, at(4, 0.1), 0)), "its gateway open");
    });
});

// Whether a point's inside a convex outline (on the same side of all its edges), or within
// `margin` metres of it
function insideOrNear(outline, [x, y], margin) {
    const edges = outline.map(([ax, ay], k) => {
        const [bx, by] = outline[(k + 1) % outline.length];
        const length = Math.hypot(bx - ax, by - ay) || 1;
        const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length ** 2));

        return { side: Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)), distance: Math.hypot(x - ax - (bx - ax) * t, y - ay - (by - ay) * t) };
    });
    const inside = edges.every(({ side }) => side >= 0) || edges.every(({ side }) => side <= 0);

    return inside || Math.min(...edges.map(({ distance }) => distance)) <= margin;
}
