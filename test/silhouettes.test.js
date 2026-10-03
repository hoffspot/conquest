// What's built seen from afar (world/far/shapes.js, gather.js, silhouettes.js): boxes, roofs,
// columns and cones facing outwards; every settlement in reach laid out as it is near to, the
// peoples' great places where they stand; within the budget per quality; fading in where the near
// world fades out (fog.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { squareOf } from "../client/js/core/settlements.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";
import { FAR_LEVELS, farReach } from "../client/js/world/far/levels.js";
import { gatherSilhouettes, SILHOUETTES } from "../client/js/world/far/gather.js";
import { archesOf, feetOf } from "../client/js/core/arches.js";
import { heightAt } from "../client/js/core/terrain/height.js";
import { ARCH_ROCK, archShapes, building, Shapes, siteShapes } from "../client/js/world/far/shapes.js";
import { RESHAPE, Silhouettes } from "../client/js/world/far/silhouettes.js";
import { farHaze } from "../client/js/world/fog.js";

// (Each triangle's normal points away from the middle of what it's part of, or up)
function facesOut(shapes, [mx, my, mz]) {
    for (let t = 0; t < shapes.triangles; t++) {
        const at = (k) => shapes.positions.slice(t * 9 + k * 3, t * 9 + k * 3 + 3);
        const [a, b, c] = [at(0), at(1), at(2)];
        const centroid = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
        const normal = shapes.normals.slice(t * 9, t * 9 + 3);
        const out = normal[0] * (centroid[0] - mx) + normal[1] * (centroid[1] - my) + normal[2] * (centroid[2] - mz);

        if (out < -1e-6) {
            return false;
        }
    }

    return true;
}

describe("what's built seen from afar (far/shapes.js, gather.js, silhouettes.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(1);
    });

    it("builds each people's houses and great places of boxes, roofs, columns and cones, every face facing out", () => {
        for (const people of ["human", "elf", "darkElf", "cat", "lizard", "orc"]) {
            const shapes = new Shapes();

            building(shapes, { x: 10, z: 20, ground: 5, width: 9, depth: 6, facing: 0.7, storeys: 2, people });
            assert.ok(shapes.triangles >= 10 && shapes.triangles <= 20, `${people}: ${shapes.triangles}`);
            assert.ok(facesOut(shapes, [10, 7, 20]), people);
        }

        for (const [kind, people] of [
            ["castle", "human"],
            ["castle", "darkElf"],
            ["castle", "lizard"],
            ["obsidian spire", "darkElf"],
            ["starwatch", "elf"],
            ["ziggurat", "lizard"],
            ["sun temple", "cat"],
            ["war totem", "orc"],
        ]) {
            const shapes = new Shapes();

            siteShapes(shapes, { kind, people, x: 0, z: 0, facing: 0.3, w: 12, h: 10, heightOf: () => 0 });
            assert.ok(shapes.triangles > 0 && shapes.triangles < 600, `${kind}: ${shapes.triangles}`);
        }

        // (Too low to be seen far off: nothing)
        const pool = new Shapes();

        siteShapes(pool, { kind: "serpent pool", people: "lizard", x: 0, z: 0, w: 6, h: 6, heightOf: () => 0 });
        assert.equal(pool.triangles, 0);
    });

    it("gathers every settlement in reach, laid out as it is near to, and the great places; within the budget for each quality", () => {
        const layouts = new Map();
        const [x, z] = [2928, 5072];
        const counts = {};

        for (const [quality, levels] of Object.entries(FAR_LEVELS)) {
            const reach = farReach(levels);
            const { shapes, done } = gatherSilhouettes(plan, { x, z, reach, layouts });

            assert.ok(done);
            counts[quality] = shapes.triangles;

            // (Every settlement near enough, and none further, laid out)
            for (const place of plan.places) {
                const distance = Math.hypot(place.at[0] - x, place.at[1] - z);

                if (distance < Math.min(reach, SILHOUETTES.reach[place.kind])) {
                    assert.ok(layouts.has(place.id), place.name);
                }
            }
        }

        assert.ok(counts.low < counts.medium && counts.medium < counts.high);
        assert.ok(counts.low <= 15000 && counts.medium <= 25000 && counts.high <= 40000, JSON.stringify(counts));

        // A settlement's houses where its layout has them: the shapes reach over its square
        const place = plan.places.find((each) => Math.hypot(each.at[0] - x, each.at[1] - z) < 600 && each.kind !== "farmstead");
        const { shapes } = gatherSilhouettes(plan, { x, z, reach: 600, layouts });
        const { at, size } = squareOf(place);
        let inside = 0;

        for (let k = 0; k < shapes.positions.length; k += 3) {
            const [px, pz] = [shapes.positions[k], shapes.positions[k + 2]];

            inside += px > at[0] && px < at[0] + size && pz > at[1] && pz < at[1] + size ? 1 : 0;
        }

        assert.ok(inside > 50, `(${inside} corners in ${place.name})`);
    });

    it("sees an arch of rock from afar: its two legs and the band over them, in its land's rock, facing out", () => {
        const arch = archesOf(plan).find(({ land }) => land === "savannah" || land === "badlands") ?? archesOf(plan)[0];
        const heightOf = (x, z) => heightAt(plan, x, z);
        const shapes = new Shapes();

        archShapes(shapes, arch, heightOf);
        // (Three boxes, each its four sides and its top)
        assert.equal(shapes.triangles, 3 * 10);

        // (Each box faces out from its own middle: the legs' at their feet, the band's at its middle)
        const [a, b] = feetOf(arch);
        const top = (heightOf(...a) + heightOf(...b)) / 2 + arch.rise;

        for (const [box, middle] of [[0, [a[0], top / 2, a[1]]], [1, [b[0], top / 2, b[1]]], [2, [arch.x, top + 1.4, arch.y]]]) {
            const one = new Shapes();

            one.positions = shapes.positions.slice(box * 90, (box + 1) * 90);
            one.normals = shapes.normals.slice(box * 90, (box + 1) * 90);
            assert.ok(facesOut(one, middle), `box ${box} faces out`);
        }

        // (The band from leg to leg, as high as the arch rises)
        const ys = shapes.positions.filter((_, k) => k % 3 === 1);

        assert.ok(Math.max(...ys) > top + 2);
        assert.ok(ARCH_ROCK[arch.land]);

        // (Gathered with what's built near, out to SILHOUETTES.arches)
        const near = gatherSilhouettes(plan, { x: arch.x + 500, z: arch.y, reach: 1000, layouts: new Map() }).shapes;
        const far = gatherSilhouettes(plan, { x: arch.x + SILHOUETTES.arches + 100, z: arch.y, reach: SILHOUETTES.arches + 50, layouts: new Map() }).shapes;
        const touches = (each) => {
            for (let k = 0; k < each.positions.length; k += 3) {
                if (Math.hypot(each.positions[k] - arch.x, each.positions[k + 2] - arch.y) < arch.span) {
                    return true;
                }
            }

            return false;
        };

        assert.ok(touches(near), "seen from 500 m");
        assert.ok(!touches(far), "not past its reach");
    });

    it("puts a great place where it's been set down, once it has", () => {
        const site = plan.sites.find((each) => each.kind === "castle");
        const [x, z] = site.at;
        const where = (settled) => {
            const { shapes } = gatherSilhouettes(plan, { x, z, reach: 300, settled, layouts: new Map() });
            const xs = [];

            for (let k = 0; k < shapes.positions.length; k += 3) {
                xs.push(shapes.positions[k]);
            }

            return xs.reduce((sum, value) => sum + value, 0) / xs.length;
        };
        const before = where(new Map());
        const after = where(new Map([[site.id, { x: x + 40, y: z, facing: 0 }]]));

        assert.ok(after - before > 5, `(${before} → ${after})`);
    });

    it("is one mesh, drawn with the far land and the near world, worked out again only as the player goes or more's set down; fading in where the near world fades out", () => {
        const silhouettes = new Silhouettes(plan, { reach: farReach(FAR_LEVELS.low) });

        silhouettes.update(2928, 5072);
        assert.ok(silhouettes.triangles > 1000);
        assert.equal(silhouettes.far.geometry, silhouettes.near.geometry);
        assert.ok(silhouettes.far.visible);

        const asked = silhouettes.id;

        silhouettes.update(2928 + RESHAPE / 2, 5072);
        assert.equal(silhouettes.id, asked, "(not yet)");
        silhouettes.update(2928 + RESHAPE / 2, 5072, new Map([[plan.sites[0].id, { x: 0, y: 0, facing: 0 }]]));
        assert.equal(silhouettes.id, asked + 1, "(a site set down)");
        silhouettes.update(2928 + RESHAPE * 2, 5072, new Map([[plan.sites[0].id, { x: 0, y: 0, facing: 0 }]]));
        assert.equal(silhouettes.id, asked + 2, "(walked on)");

        assert.equal(farHaze(), true);
        assert.match(THREE.ShaderChunk.fog_fragment, /#if defined\( FAR_FADE_IN \)/);
        assert.ok("FAR_FADE_IN" in silhouettes.material.defines);
        silhouettes.dispose();
    });
});
