// A fixed scene set into the world's land (core/terrain/scenes.js: Bellhaven's castle on its crag,
// docs/WORLD.md): where the plan has it, facing its road; the land laid under it where it stands,
// meeting the top of its ground at its edges and its road's end at the ridge's height, and its own
// again past its band; its way in at its road's end, the rest of it stood on.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { heightAt, landHeight, scenesIn } from "../client/js/core/terrain/height.js";
import { onWayIn, placedOf, SCENES, sceneOf, standsOn, toScene, toWorld, wayInOf, within } from "../client/js/core/terrain/scenes.js";
import { floorAt } from "../client/js/core/walk.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

describe("a scene set into the land (terrain/scenes.js): Bellhaven", () => {
    const settings = SCENES.bellhaven;
    const scene = sceneOf("bellhaven");
    let plan;
    let bare;
    let placed;

    before(() => {
        plan = planWorld(1);
        // (The same land with nothing set into it)
        bare = { ...plan, sites: plan.sites.filter(({ scenery }) => !scenery) };
        [placed] = scenesIn(plan);
    });

    it("is its walk's ground: its box the patches under it, its middle, its ridge's floor; its lowest under its top", () => {
        const { origin, size, square } = scene.walk.under;

        assert.deepEqual(scene.box, [origin[0], origin[1], origin[0] + size[0] * square, origin[1] + size[1] * square]);
        assert.deepEqual(scene.middle, [(scene.box[0] + scene.box[2]) / 2, (scene.box[1] + scene.box[3]) / 2]);
        assert.equal(scene.ridge, floorAt(scene.walk, 0, settings.ridge[0] - scene.walk.origin[0], settings.ridge[1] - scene.walk.origin[1]));
        assert.ok(scene.ridge > 60 && scene.ridge < 70, `${scene.ridge}`);
        assert.ok(scene.low.every((low, k) => Number.isFinite(low) && low <= scene.top[k]));
        // (Its near edge its road comes up to)
        assert.equal(settings.approach[1], scene.box[3]);
    });

    it("stands where the plan has it, facing its road: turned there and back exactly enough", () => {
        const site = plan.sites.find(({ scenery }) => scenery === "bellhaven");

        assert.ok(placed);
        assert.deepEqual(placed.at, site.at);
        assert.equal(placed.facing, site.facing);

        for (const [sx, sz] of [scene.middle, settings.approach, [-100, -200], [150, 40]]) {
            const [x, y] = toWorld(placed, sx, sz);
            const [bx, bz] = toScene(placed, x, y);

            assert.ok(Math.abs(bx - sx) < 1e-9 && Math.abs(bz - sz) < 1e-9, `${sx}, ${sz}`);
        }

        // (Its middle at the site's spot; its road's end toward its road: facing, 0 toward +y)
        assert.deepEqual(toWorld(placed, ...scene.middle), site.at);

        const [ax, ay] = toWorld(placed, ...settings.approach);
        const out = Math.atan2(ax - site.at[0], ay - site.at[1]);

        assert.ok(Math.abs(Math.sin(out - site.facing)) < 1e-9 && Math.cos(out - site.facing) > 0);
    });

    it("lays the land under it where it stands: under every floor of its walk away from its edges, its own 0 set by its road's end", () => {
        // (Its road's end `rise` over the land's own lie there)
        const [ax, ay] = toWorld(placed, ...settings.approach);

        assert.ok(Math.abs(placed.base + scene.ridge - settings.rise - landHeight(bare, ax, ay)) < 1e-6);

        const { walk } = scene;
        let looked = 0;

        for (let z = 0; z < walk.size[1]; z += 2) {
            for (let x = 0; x < walk.size[0]; x += 2) {
                const floor = floorAt(walk, 0, x, z);
                const [sx, sz] = [walk.origin[0] + x + 0.5, walk.origin[1] + z + 0.5];
                const inward = Math.min(sx - scene.box[0], scene.box[2] - sx, sz - scene.box[1], scene.box[3] - sz);

                if (floor === null || inward < settings.ring) {
                    continue;
                }

                looked++;
                assert.ok(landHeight(plan, ...toWorld(placed, sx, sz)) <= placed.base + floor - settings.margin + 1e-6, `${sx}, ${sz}`);
            }
        }

        assert.ok(looked > 1500, `${looked}`);
    });

    it("meets the top of its ground at its edges (or the land's own, higher), and the land's own past its band, without a step", () => {
        const [x0, z0, x1, z1] = scene.box;
        const edges = [];

        for (let t = 0; t <= 1; t += 1 / 64) {
            edges.push([x0 + (x1 - x0) * t, z0, 0, -1], [x0 + (x1 - x0) * t, z1, 0, 1], [x0, z0 + (z1 - z0) * t, -1, 0], [x1, z0 + (z1 - z0) * t, 1, 0]);
        }

        let steepest = 0;

        for (const [sx, sz, ox, oz] of edges) {
            const at = (d) => landHeight(plan, ...toWorld(placed, sx + ox * d, sz + oz * d));
            const own = (d) => landHeight(bare, ...toWorld(placed, sx + ox * d, sz + oz * d));

            // (Its edge: no lower than the land's own, nor than the top of its ground there: the
            // lowest of the patches' tops round it)
            const [px, pz] = [Math.min(scene.size[0] - 1, Math.floor((sx - x0) / scene.square)), Math.min(scene.size[1] - 1, Math.floor((sz - z0) / scene.square))];
            const tops = [-1, 0, 1].flatMap((dz) => [-1, 0, 1].map((dx) => scene.top[Math.min(scene.size[1] - 1, Math.max(0, pz + dz)) * scene.size[0] + Math.min(scene.size[0] - 1, Math.max(0, px + dx))]));

            assert.ok(at(0) >= own(0) - 1e-6, `${sx}, ${sz}`);
            assert.ok(at(0) >= placed.base + Math.min(...tops) - 0.05 - 1e-6, `${sx}, ${sz}: ${at(0) - placed.base} under ${Math.min(...tops)}`);
            // (Past its band, the land's own)
            assert.ok(Math.abs(at(settings.band + 1) - own(settings.band + 1)) < 1e-6, `${sx}, ${sz}`);

            for (let d = -2; d < settings.band; d += 0.5) {
                steepest = Math.max(steepest, Math.abs(at(d + 0.5) - at(d)) / 0.5);
            }
        }

        assert.ok(steepest < 4, `${steepest}`);
    });

    it("lays its road's end level with its ridge's floor, out from it into the land", () => {
        for (const sz of [settings.ridge[1], settings.approach[1] - 2, settings.approach[1] + 1]) {
            for (const sx of [-settings.pad / 2, 0, settings.pad / 2]) {
                const land = landHeight(plan, ...toWorld(placed, settings.approach[0] + sx, sz));

                assert.ok(Math.abs(land - (placed.base + scene.ridge - 0.05)) < 0.05, `${sx}, ${sz}: ${land - placed.base}`);
            }
        }
    });

    it("has its way in on its road's end, at its near edge, and stands on the rest of its box", () => {
        const way = wayInOf(placedOf(plan.sites.find(({ scenery }) => scenery)));

        assert.ok(way.front.length >= 24, `${way.front.length}`);

        for (const [x, y] of way.front) {
            const [sx, sz] = toScene(placed, x + 0.5, y + 0.5);

            assert.ok(within(scene, sx, sz) && sz >= scene.box[3] - settings.way.deep && Math.abs(sx - settings.approach[0]) <= settings.way.across, `${sx}, ${sz}`);
            assert.ok(onWayIn(placed, x, y) && !standsOn(placed, x, y));
        }

        // (They come back out on the pad, out past its edge)
        const [ox, oz] = toScene(placed, way.outside[0] + 0.5, way.outside[1] + 0.5);

        assert.ok(!within(scene, ox, oz) && Math.abs(ox - settings.approach[0]) < 2 && oz - scene.box[3] < settings.way.out + 2, `${ox}, ${oz}`);
        assert.ok(!standsOn(placed, ...way.outside));
        assert.equal(way.facing, placed.facing);

        // (The rest of its box stood on; nothing past it)
        assert.ok(standsOn(placed, ...toWorld(placed, ...scene.middle).map(Math.floor)));
        assert.ok(standsOn(placed, ...toWorld(placed, settings.approach[0], scene.box[3] - settings.way.deep - 3).map(Math.floor)));
        assert.ok(!standsOn(placed, ...toWorld(placed, scene.box[2] + 3, scene.middle[1]).map(Math.floor)));
    });

    it("is the ground the world stands on: heightAt has it too, the same every time", () => {
        const [x, y] = toWorld(placed, 0, -150);

        assert.equal(heightAt(plan, x, y), heightAt(plan, x, y));
        assert.ok(Math.abs(heightAt(plan, x, y) - landHeight(plan, x, y)) < 0.01);
        assert.notEqual(Math.round(landHeight(plan, x, y)), Math.round(landHeight(bare, x, y)));
    });
});
