// A fixed scene set into the world's land (core/terrain/scenes.js: Bellhaven's castle on its crag,
// docs/WORLD.md): where the plan has it, facing its road; the land laid under it where it stands,
// meeting the top of its ground at its edges and its road's end at the ridge's height, and its own
// again past its band; its way in at its road's end, the rest of it stood on.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { heightAt, landHeight, scenesIn, woodsAt } from "../client/js/core/terrain/height.js";
import { aroundOf, growsAt, hillOf, onWayIn, placedOf, SCENES, sceneOf, standsOn, steepestOf, toScene, toWorld, wayInOf, within } from "../client/js/core/terrain/scenes.js";
import { runningIn } from "../client/js/core/terrain/waters.js";
import { gatherTrees, TREE_FLOATS } from "../client/js/world/far/trees.js";
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

    it("never lays the land up through a floor of its walk, and lays it just under most of them; its own 0 set by its road's end", () => {
        // (Its road's end `rise` over the land's own lie there)
        const [ax, ay] = toWorld(placed, ...settings.approach);

        assert.ok(Math.abs(placed.base + scene.ridge - settings.rise - landHeight(bare, ax, ay)) < 1e-6);

        const { walk, ground } = scene;
        const under = [];

        for (let z = 0; z < walk.size[1]; z += 2) {
            for (let x = 0; x < walk.size[0]; x += 2) {
                const floor = floorAt(walk, 0, x, z);
                const [sx, sz] = [walk.origin[0] + x + 0.5, walk.origin[1] + z + 0.5];
                const inward = Math.min(sx - scene.box[0], scene.box[2] - sx, sz - scene.box[1], scene.box[3] - sz);

                if (floor === null || inward < 8) {
                    continue;
                }

                const land = landHeight(plan, ...toWorld(placed, sx, sz)) - placed.base;

                assert.ok(land <= floor + 1e-6, `${sx}, ${sz}: ${land} over ${floor}`);

                // (Where it's its own terrain all round, the land's along it: its floors there on it)
                const [px, pz] = [Math.floor((sx - ground.origin[0]) / ground.square), Math.floor((sz - ground.origin[1]) / ground.square)];

                if ([-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ground.has[(pz + dz) * ground.size[0] + px + dx] === 1))) {
                    under.push(floor - land);
                }
            }
        }

        under.sort((a, b) => a - b);
        assert.ok(under.length > 1500, `${under.length}`);
        // (Most of its floors are its terrain: the land a little under them)
        assert.ok(under[Math.floor(under.length / 2)] < 0.6, `${under[Math.floor(under.length / 2)]}`);
    });

    it("meets its own terrain at its edges, and the land's own past its band, without a step", () => {
        const [x0, z0, x1, z1] = scene.box;
        const { ground } = scene;
        const [width, depth] = ground.size;
        const edges = [];
        let met = 0;

        for (let t = 0; t <= 1; t += 1 / 64) {
            edges.push([x0 + (x1 - x0) * t, z0, 0, -1], [x0 + (x1 - x0) * t, z1, 0, 1], [x0, z0 + (z1 - z0) * t, -1, 0], [x1, z0 + (z1 - z0) * t, 1, 0]);
        }

        let steepest = 0;

        for (const [sx, sz, ox, oz] of edges) {
            const at = (d) => landHeight(plan, ...toWorld(placed, sx + ox * d, sz + oz * d));
            const own = (d) => landHeight(bare, ...toWorld(placed, sx + ox * d, sz + oz * d));

            // (Its edge, where it's its own terrain: between the heights of the patches round it,
            // a little under them)
            const u = Math.min(width - 1, Math.max(0, (sx - ground.origin[0]) / ground.square - 0.5));
            const v = Math.min(depth - 1, Math.max(0, (sz - ground.origin[1]) / ground.square - 0.5));
            const round = [];

            for (const pz of [Math.min(depth - 2, Math.floor(v)), Math.min(depth - 2, Math.floor(v)) + 1]) {
                for (const px of [Math.min(width - 2, Math.floor(u)), Math.min(width - 2, Math.floor(u)) + 1]) {
                    round.push(pz * width + px);
                }
            }

            if (round.every((k) => ground.has[k] === 1)) {
                const tops = round.map((k) => ground.top[k]);

                met++;
                assert.ok(at(0) - placed.base < Math.max(...tops) && at(0) - placed.base > Math.min(...tops) - 0.5, `${sx}, ${sz}: ${at(0) - placed.base} by ${tops}`);
            }

            // (Past its band, or its hill, at its widest, the land's own)
            assert.ok(Math.abs(at(settings.hill.most + 1) - own(settings.hill.most + 1)) < 1e-6, `${sx}, ${sz}`);

            for (let d = -2; d < settings.band; d += 0.5) {
                steepest = Math.max(steepest, Math.abs(at(d + 0.5) - at(d)) / 0.5);
            }
        }

        // (Its terrain's round: it comes to its box's edges along the middle of each side)
        assert.ok(met >= 16, `${met} of ${edges.length}`);
        assert.ok(steepest < 4, `${steepest}`);
    });

    it("lays the land along its own terrain on the open ground round it, and under it where it's kept, round all that stands on it", () => {
        const { ground } = scene;
        const [width, depth] = ground.size;
        let [open, kept] = [0, 0];

        for (let pz = 1; pz < depth - 1; pz++) {
            for (let px = 1; px < width - 1; px++) {
                const k = pz * width + px;
                const [sx, sz] = [ground.origin[0] + (px + 0.5) * ground.square, ground.origin[1] + (pz + 0.5) * ground.square];
                const land = landHeight(plan, ...toWorld(placed, sx, sz)) - placed.base;
                // (Its road's end and its sides kept out: the pad's laid level)
                const pad = Math.abs(sx - settings.approach[0]) < settings.pad + 8 && sz > settings.ridge[1] - 8;

                if (!ground.has[k] || pad || !within(scene, sx, sz)) {
                    continue;
                }

                if (ground.open[k] && ground.deep[k] === 0 && !ground.bare[k]) {
                    open++;
                    assert.ok(Math.abs(land - (ground.top[k] - 0.1)) < 1e-3, `${sx}, ${sz}: ${land} by ${ground.top[k]}`);
                } else if (ground.deep[k] === 1) {
                    kept++;
                    assert.ok(land <= ground.top[k] - 0.1 + 1e-6, `${sx}, ${sz}: ${land} over ${ground.top[k]}`);
                }

                // (Where it's open, nothing of it stands; at its edge with the open, the land's laid
                // along it, where its own's cut)
                assert.ok(!ground.open[k] || Number.isNaN(ground.over[k]));

                if ([-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => ground.open[k + dz * width + dx]))) {
                    assert.equal(ground.deep[k], 0, `${sx}, ${sz}`);
                }
            }
        }

        assert.ok(open > 5000 && kept > 5000, `${open} open, ${kept} kept`);
    });

    it("grows trees on its terrain leading up to it and round it, never within its walls, on its road's end or up its ridge", () => {
        const { ground } = scene;
        const [width, depth] = ground.size;
        const middleOf = (k) => [ground.origin[0] + ((k % width) + 0.5) * ground.square, ground.origin[1] + (Math.floor(k / width) + 0.5) * ground.square];
        let open = 0;

        for (let k = 0; k < width * depth; k++) {
            if (!ground.open[k]) {
                continue;
            }

            open++;
            // (Its own terrain, or nothing of it, nothing standing on it)
            assert.ok(Number.isNaN(ground.over[k]), `${middleOf(k)}`);
        }

        // (A good part of it: the land round it; none of its middle, within its walls)
        assert.ok(open > (width * depth) / 4, `${open}`);
        assert.ok(open < (width * depth) * 0.8, `${open}`);

        const grows = (sx, sz) => growsAt(placed, ...toWorld(placed, sx, sz));

        assert.ok(!grows(...scene.middle));
        assert.ok(!grows(settings.approach[0], settings.approach[1] - 2));
        assert.ok(!grows(settings.approach[0], settings.approach[1] + 10));
        assert.ok(!grows(settings.approach[0], (settings.path[1] + settings.ridge[1]) / 2));
        // (Its far corners, past its terrain, and out past it)
        assert.ok(grows(scene.box[0] + 3, scene.box[1] + 3));
        assert.ok(grows(scene.box[2] - 3, scene.box[1] + 3));
        assert.ok(grows(scene.box[2] + 20, scene.middle[1]));
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

    it("eases its crags down to the land behind and beside it over a hill, as wide as there's room for, gentler than its band", () => {
        const [x0, z0, x1, z1] = scene.box;
        const steepness = (band) => {
            let steepest = 0;

            // (Across its back, out from its edge as far as its hill may reach)
            for (let k = 0; k <= 8; k++) {
                const sx = x0 + ((x1 - x0) * k) / 8;
                let last = null;

                for (let d = 0; d <= settings.hill.most; d += 4) {
                    const h = band(sx, z0 - d);

                    steepest = last === null ? steepest : Math.max(steepest, Math.abs(h - last) / 4);
                    last = h;
                }
            }

            return steepest;
        };
        const hill = steepness((sx, sz) => landHeight(plan, ...toWorld(placed, sx, sz)));
        // (The same, eased over its band alone, as it was)
        const banded = { ...plan, sites: plan.sites.map((site) => ({ ...site })) };
        const [flat] = scenesIn(banded);

        flat.hill = null;

        const band = steepness((sx, sz) => landHeight(banded, ...toWorld(flat, sx, sz)));

        assert.ok(hill < band * 0.95, `${hill.toFixed(2)} by its hill, ${band.toFixed(2)} by its band`);
        // (Its hill's reach, round its box: never less than its band, nor more than its most, and
        // gently changing along its edges)
        assert.equal(placed.hill.length, Math.ceil((2 * (x1 - x0 + z1 - z0)) / settings.hill.every));
        assert.ok(placed.hill.every((most) => most >= settings.band && most <= settings.hill.most));
        assert.ok(placed.hill.some((most) => most > settings.band));
        assert.ok(placed.hill.every((most, k) => Math.abs(most - placed.hill[(k + 1) % placed.hill.length]) <= settings.hill.every * settings.hill.turn + 1e-3));
        // (As steep as steepestOf, the plan's reckoning, says)
        const near = aroundOf({ ...plan, running: runningIn(plan) }, placed.at, placed.reach, plan.sites.find(({ scenery }) => scenery));

        const reckoned = steepestOf(placed, near, (x, y) => landHeight(bare, x, y));

        assert.ok(Math.abs(reckoned - hill) < hill * 0.35, `${reckoned.toFixed(2)} by the plan, ${hill.toFixed(2)} by the land`);
    });

    it("stops its hill short of the roads, the waters, the sites, the camps and the settlements round it", () => {
        const site = plan.sites.find(({ scenery }) => scenery);
        const near = aroundOf({ ...plan, running: runningIn(plan) }, placed.at, placed.reach, site);
        const [x0, z0, x1, z1] = scene.box;
        let past = 0;

        assert.ok(near.length > 20, `${near.length}`);
        assert.deepEqual(hillOf(placed, near), placed.hill);

        for (const [x, y, radius] of near) {
            const [sx, sz] = toScene(placed, x, y);
            const out = Math.hypot(sx - Math.min(x1, Math.max(x0, sx)), sz - Math.min(z1, Math.max(z0, sz)));

            // (Past its band, the land there its own: its hill stopped short of it)
            if (out - radius > settings.band) {
                past++;
                assert.ok(Math.abs(landHeight(plan, x, y) - landHeight(bare, x, y)) < 1e-6, `${Math.round(sx)}, ${Math.round(sz)}: ${out.toFixed(0)} out`);
            }
        }

        assert.ok(past > 10, `${past}`);
    });

    it("grows woods on its hill, near and far alike, and none of them past it", () => {
        const [x0, z0, x1] = scene.box;
        // (The middle of its hill behind it, where it's widest)
        let best = null;

        for (let k = 0; k <= 8; k++) {
            const sx = x0 + ((x1 - x0) * k) / 8;
            const [x, y] = toWorld(placed, sx, z0 - 60);
            const woods = woodsAt(plan, x, y);

            best = !best || woods > best.woods ? { x, y, woods } : best;
        }

        assert.ok(best.woods > SCENES.bellhaven.hill.woods / 2, `${best.woods}`);
        // (Nothing far off, nor on its own land, nor where nothing's set in)
        assert.equal(woodsAt(plan, ...toWorld(placed, scene.middle[0], z0 - settings.hill.most - 40)), 0);
        assert.equal(woodsAt(plan, ...toWorld(placed, ...scene.middle)), 0);
        assert.equal(woodsAt(bare, best.x, best.y), 0);

        // (Carried in from its edges over its own open ground, fading; none where its own terrain's
        // kept or anything of it stands)
        const [bx] = toScene(placed, best.x, best.y);
        let carried = 0;

        for (let sz = z0 + 1; sz < z0 + settings.hill.inward; sz += 2) {
            for (let sx = bx - 40; sx <= bx + 40; sx += 4) {
                const [x, y] = toWorld(placed, sx, sz);
                const woods = woodsAt(plan, x, y);

                assert.ok(woods <= settings.hill.woods, `${woods}`);

                if (!within(scene, sx, sz)) {
                    continue;
                }

                if (!growsAt(placed, x, y)) {
                    assert.equal(woods, 0, `${sx}, ${sz}`);
                } else if (woods > 0) {
                    carried++;
                }
            }
        }

        assert.ok(carried > 5, `${carried}`);

        // (Wherever trees grow round it, in its band and on its own open ground, and the land's
        // set steep enough to show rock, it's a forest's floor: by its chasm, where its walls run
        // out past its edges, too)
        const slope = (x, y) => Math.hypot(landHeight(plan, x + 4, y) - landHeight(plan, x - 4, y), landHeight(plan, x, y + 4) - landHeight(plan, x, y - 4)) / 8;
        let steep = 0;

        for (let sz = z0 - settings.band; sz <= scene.box[3] + settings.band; sz += 12) {
            for (let sx = x0 - settings.band; sx <= x1 + settings.band; sx += 12) {
                const [x, y] = toWorld(placed, sx, sz);

                if (growsAt(placed, x, y) && slope(x, y) > settings.hill.wooded[1] + 0.05) {
                    steep++;
                    assert.ok(woodsAt(plan, x, y) > settings.hill.woods * 0.4, `${sx}, ${sz}: ${slope(x, y).toFixed(2)} steep, ${woodsAt(plan, x, y)} woods`);
                }
            }
        }

        assert.ok(steep > 20, `${steep}`);

        // (More trees there than its land's own, as thick as woods: the far land's, as the near
        // world's are)
        const trees = (of) => gatherTrees(of, { x: best.x, z: best.y, reach: 40 }).length / TREE_FLOATS;

        assert.ok(trees(plan) > trees(bare), `${trees(plan)} on its hill, ${trees(bare)} with nothing set in`);
        assert.ok(trees(plan) > 30, `${trees(plan)}`);
    });

    it("is the ground the world stands on: heightAt has it too, the same every time", () => {
        const [x, y] = toWorld(placed, 0, -150);

        assert.equal(heightAt(plan, x, y), heightAt(plan, x, y));
        assert.ok(Math.abs(heightAt(plan, x, y) - landHeight(plan, x, y)) < 0.01);
        assert.notEqual(Math.round(landHeight(plan, x, y)), Math.round(landHeight(bare, x, y)));
    });
});
