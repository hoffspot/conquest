// The sites no people keeps (core/setpieces/neutral.js lays them out, sites.js sets them down,
// art/kits/neutral.js and the castle kit's RUINED build them, far/shapes.js draws them afar): the
// same every time, standing open where they're entered, lying with the land, broken down where
// they're ruins, and reached by their trails at their fronts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { buildWorld } = await import("../client/js/core/overworld.js");
const { isNeutral, restingOf } = await import("../client/js/core/sites.js");
const { heightAt } = await import("../client/js/core/terrain/height.js");
const { layoutNeutral, NEUTRAL } = await import("../client/js/core/setpieces/neutral.js");
const { WORKS_SIZE } = await import("../client/js/core/setpieces/works.js");
const { PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { WORLD_SIZE } = await import("../client/js/core/worldplan/plan.js");
const { gatehouse, keep, KEEP_RUIN, keepWindows, RUINED, tower, wall } = await import("../client/js/world/art/kits/castle.js");
const { builderOf } = await import("../client/js/world/town3d.js");
const { Shapes, siteShapes } = await import("../client/js/world/far/shapes.js");
const { createRandom } = await import("../client/js/core/random.js");
const { Solid } = await import("../client/js/world/art/engine/solid.js");
const { archOf, brokenRim, brokenTop, buttress, crumbledWall, stringCourse, talus, topAt } = await import("../client/js/world/art/kits/decay.js");
const { GRAVE, HALL, hallWindows, LICHENS } = await import("../client/js/world/art/kits/neutral.js");
const { brokenCart, fallenTimbers, oldBarrel, oldBeam, oldCrate } = await import("../client/js/world/art/kits/leftovers.js");
const { IVY, ivyAlong, ivyCurtain, ivyMaterial, ringFace, wallFace } = await import("../client/js/world/art/kits/ivy.js");
const { hedgeMaterials } = await import("../client/js/world/art/kits/hedges.js");
const { merge } = await import("../client/js/world/town3d.js");
const { material } = await import("../client/js/world/art/engine/materials.js");
const { MATERIALS, OLD_STONE, paintLayer, SIZE } = await import("../client/js/world/art/engine/painters.js");
const { AGED, atlasMaterial, LAYERS, layerOf } = await import("../client/js/world/art/engine/atlas.js");

function trianglesOf(object) {
    let count = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            count += (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
        }
    });

    return count;
}

// (Within a rectangle [x0, y0, x1, y1], `margin` inside its edges)
const within = ([x, y], [x0, y0, x1, y1], margin = 0) => x > x0 + margin && x < x1 - margin && y > y0 + margin && y < y1 - margin;

describe("the sites no people keeps (setpieces/neutral.js)", () => {
    it("lays each out the same for the same seed, within its plots, open ground at its heart", () => {
        for (const kind of Object.keys(NEUTRAL)) {
            for (let seed = 1; seed <= 24; seed++) {
                const laid = layoutNeutral({ kind, seed });
                const [width, depth] = [NEUTRAL[kind][0] * PLOT, NEUTRAL[kind][1] * PLOT];

                assert.deepEqual(layoutNeutral({ kind, seed }), laid, `${kind} ${seed}: the same again`);
                assert.ok(laid.parts.length > 0 || laid.castle?.length > 0, `${kind} ${seed}: something to build`);

                for (const rect of laid.solid) {
                    assert.ok(rect[0] >= -0.01 && rect[1] >= -0.01 && rect[2] <= width + 0.01 && rect[3] <= depth + 0.01, `${kind} ${seed}: ${rect} within ${width} by ${depth}`);
                }

                assert.ok(within(laid.heart, [0, 0, width, depth]), `${kind} ${seed}: its heart inside it`);
                assert.ok(!laid.solid.some((rect) => within(laid.heart, rect, -0.5)), `${kind} ${seed}: its heart (${laid.heart}) clear of what stands`);
            }
        }

        // (Different seeds, different layouts)
        assert.notDeepEqual(layoutNeutral({ kind: "ruins", seed: 1 }), layoutNeutral({ kind: "ruins", seed: 2 }));
        assert.equal(layoutNeutral({ kind: "castle", seed: 1 }), null);
    });

    it("puts a stair-house down to the crypt under an old hall against its back wall, in its middle: in the way, its door's way into the hall clear of the columns, no heap of fallen stone on it", () => {
        for (let seed = 1; seed <= 24; seed++) {
            const laid = layoutNeutral({ kind: "ruins", seed });
            const house = laid.parts.find(({ part }) => part === "crypt");
            const { entry } = laid;

            assert.equal(entry.inside, "crypt");
            assert.ok(laid.solid.some((rect) => within([(house.x0 + house.x1) / 2, (house.y0 + house.y1) / 2], rect)), `${seed}: the stair-house in the way`);
            assert.deepEqual([entry.x, entry.y], [(house.x0 + house.x1) / 2, house.y1]);

            for (let v = 0.2; v <= 2; v += 0.2) {
                for (let u = -1; u <= 1; u += 0.25) {
                    assert.ok(!laid.solid.some((rect) => within([entry.x + u, entry.y + v], rect)), `${seed}: its way into the hall clear at ${u}, ${v}`);
                }
            }

            assert.ok(laid.parts.filter(({ part }) => part === "rubble").every(({ x, y, r }) => x + r < house.x0 || x - r > house.x1 || y - r > house.y1), `${seed}: no heap of stone on it`);
        }
    });

    it("lays a ruined castle out as the humans' are, its pieces left to ruin and its gate's way through open", () => {
        const laid = layoutNeutral({ kind: "ruined castle", seed: 7 });
        const kinds = new Set(laid.castle.map(({ key }) => key.split("-")[0]));

        assert.deepEqual([...kinds].sort(), ["gatehouse", "keep", "tower", "wall"]);
        assert.ok(laid.castle.every(({ ruined }) => ruined));

        // (Nothing stands in the middle of the gatehouse, where the way in is)
        const gate = laid.castle.find(({ key }) => key.startsWith("gatehouse"));
        const middle = [(gate.x + gate.w / 2) * PLOT, (gate.y + gate.h / 2) * PLOT];

        assert.ok(!laid.solid.some((rect) => within(middle, rect)), "the way through the gate is open");

        // (Its keep gone into by the breach where its door was, in the middle of its south face,
        // the way to it clear of the stores and carts left in the courtyard)
        for (let seed = 1; seed <= 24; seed++) {
            const each = layoutNeutral({ kind: "ruined castle", seed });
            const keep = each.castle.find(({ key }) => key.startsWith("keep"));

            assert.equal(each.entry.inside, "ruin", `${seed}`);
            assert.deepEqual([each.entry.x, each.entry.y], [(keep.x + keep.w / 2) * PLOT, (keep.y + keep.h) * PLOT - 0.2]);

            for (let v = 0.4; v <= 2; v += 0.2) {
                for (let u = -1; u <= 1; u += 0.25) {
                    assert.ok(!each.solid.some((rect) => within([each.entry.x + u, each.entry.y + v], rect)), `${seed}: the way to its keep clear at ${u}, ${v}`);
                }
            }
        }
    });
});

describe("the sites no people keeps in the world (sites.js)", () => {
    let world;
    let overworld;
    let sites;

    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
        // (The sites no people keeps: not the peoples' works, laid out the same way, test/works.test.js)
        sites = world.plan.sites.filter((site) => isNeutral(site) && !WORKS_SIZE[site.kind]);

        for (const site of sites) {
            overworld.sites.heartOf(site);
        }
    });

    it("sets each down blocking only what stands in its way, its heart open, lying with the land but for the ruined castles and the caves", () => {
        let set = 0;

        for (const site of sites) {
            const down = overworld.sites.set.get(site.id);

            if (!down) {
                continue;
            }

            set++;

            const [hx, hy] = down.heart.map(Math.floor);

            assert.ok(!down.squares.has(hy * WORLD_SIZE + hx), `${site.kind} ${site.id}: its heart open`);
            assert.ok(down.squares.size > 0 && down.squares.size < down.w * down.h * PLOT * PLOT * 0.7, `${site.kind} ${site.id}: ${down.squares.size} squares blocked of ${down.w * down.h * PLOT * PLOT}`);
            // (Levelled only where it's a ruined castle's courtyard, or dug into the ground: a
            // cave's floor, its pit, and a dungeon's way in, as a cave's)
            assert.equal(Boolean(down.pad), ["ruined castle", "cave", "dragon's lair", "dungeon"].includes(site.kind), site.kind);
        }

        assert.ok(set >= 100, `${set} set down`);
    });

    it("cuts each cave and the dragon's lair into a hillside facing down it, its floor dug in front of its face; or sinks a cave into the ground where there's none", () => {
        const forms = { hillside: 0, pit: 0 };

        for (const site of sites.filter(({ kind }) => kind === "cave" || kind === "dragon's lair")) {
            const down = overworld.sites.set.get(site.id);
            const rest = restingOf(world.plan, site);
            const { pad } = down;
            // (How far below the land the ground's dug in its middle)
            const dug = heightAt(world.plan, ...pad.at) - overworld.heightAt(...pad.at);

            forms[rest.form]++;

            if (rest.form === "hillside") {
                assert.equal(down.facing, rest.facing, `${site.id} faces down its hill`);
                assert.ok(pad.raise < -1.5 && pad.ease === 2.5, `${site.id}: ${JSON.stringify(pad)}`);
                assert.ok(dug > 1.5, `${site.id}: its floor dug ${dug.toFixed(2)} into the hill`);

                // (Its floor in front of it: from the face's middle, the way it faces)
                const [dx, dy] = [pad.at[0] - down.x, pad.at[1] - down.y];

                assert.ok(dx * Math.sin(down.facing) + dy * Math.cos(down.facing) > 0, `${site.id}: its floor before it`);
            } else {
                assert.equal(site.kind, "cave");
                assert.ok(Math.abs(dug - 3.2) < 0.1, `${site.id}: its pit sunk ${dug.toFixed(2)}`);
            }
        }

        assert.ok(forms.hillside >= 10 && forms.pit >= 3, JSON.stringify(forms));
    });

    it("builds a graveyard's wall narrowing as it rises, its headstones a third of their length in the ground, lichen as its stones grow it", () => {
        const yard = sites.find(({ kind }) => kind === "graveyard");
        const pieces = overworld.sites.set.get(yard.id).pieces;
        const near = (a, b, within) => Math.abs(a - b) < within;
        const pointsOf = (object) => {
            const points = [];

            object.traverse((node) => {
                if (node.isMesh) {
                    const position = node.geometry.attributes.position;

                    for (let k = 0; k < position.count; k++) {
                        points.push([position.getX(k), position.getY(k), position.getZ(k)]);
                    }
                }
            });

            return points;
        };

        // (A stretch of its wall: as thick as it's built at its foot, narrower at its top)
        const wallPiece = pieces.find(({ part }) => part?.part === "lowWall" && Math.abs(part.x1 - part.x0) > 4);
        const points = pointsOf(builderOf(wallPiece)(wallPiece));
        const top = Math.max(...points.map(([, y]) => y));
        const thin = Math.abs(wallPiece.part.x1 - wallPiece.part.x0) > Math.abs(wallPiece.part.y1 - wallPiece.part.y0) ? 2 : 0;
        const across = (keep) => {
            const values = points.filter(keep).map((point) => point[thin]);

            return Math.max(...values) - Math.min(...values);
        };
        const [foot, crest] = [across(([, y]) => y <= 0), across(([, y]) => y >= top * 0.9)];

        assert.ok(crest < foot * 0.9 && crest > foot * 0.6, `its foot ${foot.toFixed(2)} across, its top ${crest.toFixed(2)}`);
        assert.equal(GRAVE.batter, 0.16);

        // (A tall headstone set deeper than a short one, a third of its whole length down)
        const grave = pieces.find(({ part }) => part?.part === "grave" && part.stone && part.stone !== "cross");
        const depthOf = (tall) => {
            const piece = { ...grave, part: { ...grave.part, tall, state: "standing", sag: 0, lean: 0, sunk: 0, footstone: false, railed: false, ground: "flat" } };

            return -Math.min(...pointsOf(builderOf(piece)(piece)).map(([, y]) => y));
        };

        assert.ok(near(depthOf(1.2) / depthOf(0.6), 0.6 / GRAVE.deep, 0.05), `${depthOf(1.2)} and ${depthOf(0.6)} deep`);

        // (Orange lichen on limestone, grey-green on sandstone, little on dark glassy stone)
        const [r, g, b] = LICHENS["dressed-old"].colour;
        const [sr, sg, sb] = LICHENS["rock-pale"].colour;

        assert.ok(r > g && g > b, "limestone's orange");
        assert.ok(sg > sr && sg > sb, "sandstone's grey-green");
        assert.ok(LICHENS.obsidian.amount[1] < LICHENS["rock-pale"].amount[0]);
    });

    it("shapes a face cut into a hill to it, the rock going back under the hill: none standing out above it", () => {
        let checked = 0;

        for (const site of sites.filter(({ kind }) => kind === "cave" || kind === "dragon's lair")) {
            for (const piece of overworld.sites.set.get(site.id).pieces.filter(({ part }) => part?.part === "outcrop")) {
                const highest = Math.max(...piece.part.lie.heights.flat());
                const top = new THREE.Box3().setFromObject(builderOf(piece)(piece)).max.y / 5;

                // (Its broken lip at most a metre over its brow)
                assert.ok(top <= highest + 1, `${site.id}: its rock ${top.toFixed(2)} high, the hill behind it ${highest}`);
                checked++;
            }
        }

        assert.ok(checked >= 15, `${checked} faces`);
    });

    it("turns each a trail goes up to to face it, the trail ending a step before its front, on open ground", () => {
        let checked = 0;

        for (const trail of overworld.trails.all) {
            const site = world.plan.sites.find(({ id }) => id === trail.site);
            const down = overworld.sites.set.get(site.id);
            const facing = overworld.trails.facingOf(site);

            if (!down) {
                continue;
            }

            assert.equal(down.facing, facing, trail.id);

            // (In front of it: the way it faces)
            const [dx, dy] = [trail.to[0] - down.x, trail.to[1] - down.y];

            assert.ok(dx * Math.sin(facing) + dy * Math.cos(facing) > (down.h * PLOT) / 2 - 3, `${trail.id}: ends before its front`);
            assert.ok(!down.squares.has(Math.floor(trail.to[1]) * WORLD_SIZE + Math.floor(trail.to[0])), `${trail.id}: ends on open ground`);
            checked++;
        }

        assert.ok(checked >= 20, `${checked} trails`);
    });

    it("builds every part (the ruined castles' by the castle kit, left to ruin) within its budget", () => {
        // (A hall's ruins with its windows through its walls, its courses and its buttresses, and
        // a ruined keep with its rows of windows and its courses: M7b-3b, about 700 and 900 more;
        // the ivy hanging from their tops, M7b-3c, about 200 and 2,400 more)
        // (An old graveyard's sixty graves or so, its walls, gates, path, tombs and mausoleum: as much as
        // a house)
        const budget = { ruins: 5000, "ruined castle": 18000, "dragon's lair": 3000, graveyard: 6000 };
        const most = new Map();

        for (const site of sites) {
            const down = overworld.sites.set.get(site.id);
            let triangles = 0;

            for (const piece of down?.pieces ?? []) {
                if (piece.ruined) {
                    assert.equal(builderOf(piece), RUINED[piece.kind], piece.key);
                }

                triangles += trianglesOf(builderOf(piece)(piece));
            }

            most.set(site.kind, Math.max(most.get(site.kind) ?? 0, triangles));
        }

        for (const [kind, triangles] of most) {
            assert.ok(triangles > 0 && triangles <= (budget[kind] ?? 1500), `${kind}: ${triangles} triangles at most`);
        }
    });
});

describe("the castle left to ruin (art/kits/castle.js RUINED)", () => {
    const top = (object) => new THREE.Box3().setFromObject(object).max.y;

    it("breaks each piece down below where it stood, differently where it stands, the same each time", () => {
        const at = { seed: 11, x: 40, y: 64 };

        for (const [piece, intact] of [
            [{ kind: "wall", axis: "h", length: 3 }, wall],
            [{ kind: "wall", axis: "v", length: 2 }, wall],
            [{ kind: "tower", shape: "round", top: "roof" }, tower],
            [{ kind: "tower", shape: "square", top: "battlements" }, tower],
            [{ kind: "gatehouse", facing: "s" }, gatehouse],
            [{ kind: "gatehouse", facing: "e" }, gatehouse],
            [{ kind: "keep", w: 5, h: 4, door: true }, keep],
        ]) {
            const ruined = RUINED[piece.kind]({ ...piece, ...at, ruined: true });
            const label = JSON.stringify(piece);

            assert.ok(top(ruined) < top(intact(piece)) * 0.95, `${label}: lower than it stood`);
            assert.equal(trianglesOf(RUINED[piece.kind]({ ...piece, ...at, ruined: true })), trianglesOf(ruined), `${label}: the same again`);

            const elsewhere = RUINED[piece.kind]({ ...piece, ...at, x: 80, ruined: true });

            assert.notDeepEqual([...elsewhere.children[0].geometry.attributes.position.array.slice(0, 600)], [...ruined.children[0].geometry.attributes.position.array.slice(0, 600)], `${label}: broken its own way where it stands`);
        }
    });
});

describe("the sites no people keeps seen from afar (far/shapes.js)", () => {
    it("draws what stands high enough, where it stands as it's laid out near to, and nothing of what doesn't", () => {
        const shapesOf = (kind, people = null, seed = 5) => {
            const shapes = new Shapes();
            const [w, h] = NEUTRAL[kind];

            siteShapes(shapes, { kind, people, seed, x: 100, z: 200, facing: 0.6, w, h, heightOf: () => 10 });

            return shapes;
        };

        for (const kind of ["ruins", "ruined castle", "dragon's lair", "watchtower"]) {
            const shapes = shapesOf(kind);

            assert.ok(shapes.triangles > 0 && shapes.triangles < 600, `${kind}: ${shapes.triangles}`);
            assert.deepEqual(shapesOf(kind).positions, shapes.positions, `${kind}: the same again`);
        }

        // (Nor a cave: its face is cut into a hill, below the hill's top)
        for (const kind of ["shrine", "standing stones", "cave"]) {
            assert.equal(shapesOf(kind).triangles, 0, kind);
        }

        // (A ruin's walls where its layout puts them: none higher than its highest wall)
        const ruins = shapesOf("ruins");
        const tallest = Math.max(...layoutNeutral({ kind: "ruins", seed: 5 }).parts.filter(({ part }) => part === "wall").map(({ h }) => h));
        const heights = ruins.positions.filter((_, k) => k % 3 === 1);

        assert.ok(Math.max(...heights) <= 10 + tallest, `${Math.max(...heights)} high`);
    });
});

describe("how old stone crumbles (art/kits/decay.js)", () => {
    it("breaks a wall's top off between its lowest and highest, along all of it, jagged at a stone's size, the same each time", () => {
        for (let seed = 1; seed <= 20; seed++) {
            const [length, low, high] = [60, 6, 30];
            const top = brokenTop(createRandom(seed), length, low, high, { stone: 4.5, breaches: 0.3 });

            assert.deepEqual(brokenTop(createRandom(seed), length, low, high, { stone: 4.5, breaches: 0.3 }), top, `${seed}: the same again`);
            assert.equal(top[0][0], 0);
            assert.equal(top.at(-1)[0], length);
            assert.ok(
                top.every(([u, h], k) => h >= low * 0.35 - 1e-9 && h <= high + 1e-9 && (k === 0 || u >= top[k - 1][0])),
                `${seed}: within its heights, along it`,
            );
            // (A point at least every two stones or so)
            assert.ok(top.length >= length / (4.5 * 1.4), `${seed}: ${top.length} points`);
        }

        const rim = brokenRim(createRandom(3), 16, 80, 4, 20);

        assert.equal(rim.length, 16);
        assert.ok(rim.every((h) => h >= 4 * 0.35 && h <= 20));
    });

    it("heaps fallen stone at a wall's foot only where much of it fell", () => {
        const at = (u, y, v) => [u, y, v];
        const heaped = (top) => {
            const solid = new Solid();

            talus(solid, createRandom(5), at, top, 0, 2, 1, 30, 0, material("granite"));

            return solid.triangles;
        };

        assert.equal(heaped([[0, 29], [10, 28], [20, 30]]), 0, "none where it stands near as high as it stood");
        assert.ok(heaped([[0, 8], [10, 6], [20, 9]]) > 0, "a heap where it fell");
    });
});

describe("old stone (art/engine/painters.js OLD_STONE, atlas.js AGED)", () => {
    // (Every material a built thing is drawn with)
    const namesOf = (object) => {
        const names = new Set();

        object.traverse((node) => node.isMesh && [node.material].flat().forEach(({ name }) => names.add(name)));

        return names;
    };

    it("lays the ruins' stone in courses of many heights, dark mortar sunk deep between its blocks", () => {
        const painted = paintLayer("stone-old", SIZE);
        const mortar = (x, y) => painted[(y * SIZE + x) * 4 + 3] < 30;
        const brightness = (i) => painted[i] + painted[i + 1] + painted[i + 2];
        let [joints, faces, dark, light] = [0, 0, 0, 0];

        for (let i = 0; i < painted.length; i += 4) {
            if (painted[i + 3] < 30) {
                [joints, dark] = [joints + 1, dark + brightness(i)];
            } else {
                [faces, light] = [faces + 1, light + brightness(i)];
            }
        }

        assert.deepEqual(paintLayer("stone-old", SIZE), painted, "the same every time");
        assert.ok(joints > painted.length / 4 / 20 && joints < painted.length / 4 / 3, `${joints} of ${painted.length / 4} in the joints`);
        assert.ok(dark / joints < (light / faces) * 0.5, "the mortar dark");

        // (The courses: where most of a row is a joint, each course's first; how far apart they are)
        const rows = [...Array(SIZE).keys()].filter((y) => [...Array(SIZE).keys()].filter((x) => mortar(x, y)).length > SIZE * 0.5);
        const heights = new Set(rows.slice(1).map((y, k) => y - rows[k]));
        const px = SIZE / OLD_STONE.metres;

        assert.ok(heights.size >= 3, `courses ${[...heights]} pixels high`);
        assert.ok([...heights].every((h) => h >= OLD_STONE.courses[0] * px - 2 && h <= 2 * OLD_STONE.courses.at(-1) * px), `courses ${[...heights]} pixels high`);

        // (Greener and darker than a kept castle's stone)
        const [old, kept] = [MATERIALS["stone-old"].base, MATERIALS.stone.base].map((hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);

        assert.ok(old[1] >= old[0] && old[1] > old[2], "green-grey");
        assert.ok(old[0] + old[1] + old[2] < (kept[0] + kept[1] + kept[2]) * 0.8, "darker");
    });

    it("weathers the old stone where it's drawn, last of the atlas's layers but the plain colours, and nothing else", () => {
        const old = LAYERS.filter((name) => MATERIALS[name]?.old);

        assert.ok(old.length >= 4);
        assert.deepEqual(LAYERS.slice(AGED.from, AGED.to), old);
        assert.equal(LAYERS[AGED.to], "plain");
        assert.ok(LAYERS.slice(0, AGED.from).every((name) => !MATERIALS[name]?.old));
        assert.ok(old.every((name) => layerOf(material(name)) >= AGED.from && layerOf(material(name)) < AGED.to), "drawn from their own layers");

        // (Moss and streaks once the normal's known, for the old stone's layers alone)
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };

        atlasMaterial().onBeforeCompile(shader);
        assert.match(shader.fragmentShader, /float agedNoise\(vec2 p\)/);
        assert.match(shader.fragmentShader, new RegExp(`#include <normal_fragment_maps>[^]*if \\(vLayer > ${AGED.from - 0.5} && vLayer < ${AGED.to - 0.5}\\)[^]*agedMoss[^]*#include <emissivemap_fragment>`));
    });

    it("builds the ruins of old stone, their breaks showing its rubble core, and the peoples' castles of their own", () => {
        const at = { seed: 11, x: 40, y: 64 };

        for (const piece of [
            { kind: "wall", axis: "h", length: 3 },
            { kind: "tower", shape: "round", top: "roof" },
            { kind: "gatehouse", facing: "s" },
            { kind: "keep", w: 5, h: 4, door: true },
        ]) {
            const names = namesOf(RUINED[piece.kind]({ ...piece, ...at, ruined: true }));

            assert.ok(names.has("stone-old") && names.has("rubble-old") && !names.has("stone"), `${piece.kind}: ${[...names]}`);
        }

        for (const [piece, build] of [
            [{ kind: "wall", axis: "h", length: 3 }, wall],
            [{ kind: "tower", shape: "round", top: "roof" }, tower],
            [{ kind: "keep", w: 5, h: 4, door: true }, keep],
        ]) {
            const names = namesOf(build({ ...piece, ...at }));

            assert.ok(names.has("stone") && ![...names].some((name) => MATERIALS[name]?.old), `${piece.kind} kept: ${[...names]}`);
        }
    });
});

describe("old walls as they were built: openings, courses and buttresses (art/kits/decay.js)", () => {
    // (A wall along x, 0 to 60 across u, 6 thick, its top level at `height`)
    const at = (u, y, v) => [u, y, v];
    const level = (height) => [
        [0, height],
        [60, height],
    ];
    const hits = (object, from, direction) => {
        object.updateMatrixWorld(true);

        return new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...direction).normalize(), 0, 100).intersectObject(object, true).length;
    };

    it("heads each opening round or pointed, rising to its middle and down again", () => {
        for (const [k, rise] of [
            [0.5, 0.5],
            [1, Math.sqrt(0.75)],
        ]) {
            const arch = archOf(10, k, 4);
            const top = Math.max(...arch.map(([, r]) => r));

            assert.deepEqual(arch[0], [0, 0]);
            assert.ok(Math.abs(arch.at(-1)[0] - 10) < 1e-9 && Math.abs(arch.at(-1)[1]) < 1e-9);
            assert.ok(Math.abs(top - rise * 10) < 1e-6, `k ${k}: ${top} high`);
            assert.ok(arch.every(([u], i) => i === 0 || u > arch[i - 1][0]), "along it");
            assert.ok(arch.every(([u, r]) => Math.abs(r - arch.find(([w]) => Math.abs(w - (10 - u)) < 1e-9)[1]) < 1e-9), "the same both sides");
        }

        // (A lancet's taller than a round arch over the same span)
        assert.ok(Math.max(...archOf(10, 1.3).map(([, r]) => r)) > Math.max(...archOf(10, 1).map(([, r]) => r)));
    });

    it("cuts an opening right through a wall, its jambs, sill and head as deep as the wall", () => {
        const opening = { u0: 25, u1: 31, sill: 10, spring: 20, k: 1 };
        const [whole, cut] = [[], [opening]].map((openings) => {
            const solid = new Solid();

            crumbledWall(solid, at, level(40), 0, [-3, 3], 0, material("stone-old"), { openings });

            return solid.toObject();
        });

        // (Through it: nothing in the way; beside it, below its sill and above its head, the
        // wall's face, from either side: what faces the eye. The rays miss the faces' seams, where
        // a ray meets both triangles of an edge)
        for (const [z, way] of [
            [20, -1],
            [-20, 1],
        ]) {
            assert.equal(hits(cut, [27.3, 15.4, z], [0, 0, way]), 0);
            assert.equal(hits(whole, [27.3, 15.4, z], [0, 0, way]), 1);
            assert.equal(hits(cut, [20.3, 15.4, z], [0, 0, way]), 1);
            assert.equal(hits(cut, [28.3, 5.3, z], [0, 0, way]), 1);
            assert.equal(hits(cut, [28.3, 30.4, z], [0, 0, way]), 1);
        }

        // (Its jambs and sill inside it, and its head over it, the wall's whole thickness)
        assert.ok(hits(cut, [28.3, 15.4, 2.5], [-1, 0, 0]) >= 1, "a jamb");
        assert.ok(hits(cut, [28.3, 15.4, -2.5], [0, -1, 0]) >= 1, "the sill");
        assert.ok(hits(cut, [28.3, 15.4, 2.5], [0, 1, 0]) >= 1, "the head");
    });

    it("runs a string course across a wall only where it still stands above it, and not over its openings", () => {
        const solid = new Solid();
        const top = [
            [0, 40],
            [30, 40],
            [31, 8],
            [60, 8],
        ];

        stringCourse(solid, at, top, 0, 3, 1, 12, material("stone-old"), { width: 2, depth: 1, openings: [{ u0: 10, u1: 16, sill: 10, spring: 20, k: 1 }] });

        const object = solid.toObject();
        const xs = [];

        object.traverse((node) => node.isMesh && node.geometry.attributes.position.array.forEach((value, i) => i % 3 === 0 && xs.push(value)));
        assert.ok(xs.length > 0);
        assert.ok(xs.every((x) => x < 31), "none where the wall's lower than it");
        assert.ok(xs.every((x) => x < 10 || x > 16), "none across the opening");
        assert.equal(hits(object, [5, 12, 10], [0, 0, -1]), 1, "on its face");
    });

    it("stands a buttress out from the face it's against, in stages each less deep, no higher than asked", () => {
        const solid = new Solid();

        buttress(solid, at, 0, 30, 3, 1, 0, [10, 18, 24], [4, 2.5, 1.5], 3.5, material("stone-old"));

        const box = new THREE.Box3().setFromObject(solid.toObject());

        assert.ok(box.min.z >= 3 - 1e-6 && box.max.z <= 7 + 1e-6, "out from its face, as deep as its foot");
        assert.ok(box.max.y <= 24 + 1e-6 && box.min.y >= 0, "no higher than its top");
        assert.ok(Math.abs(box.max.x - box.min.x - 3.5) < 1e-6, "as wide as asked");
        assert.equal(hits(solid.toObject(), [30, 22, 20], [0, 0, -1]), 1, "its top stage");
        assert.ok(hits(solid.toObject(), [30, 5, 20], [0, 0, -1]) >= 1 && hits(solid.toObject(), [30, 5, 20], [0, 0, -1]) === hits(solid.toObject(), [30, 5, 7.5], [0, 0, -1]), "its foot, the deepest");
    });

    it("leaves an opening open above where the wall's top has fallen below its head, its jambs standing as high as the top beside them", () => {
        // (The top falls from 40 to 16, below the springing, over the opening's middle)
        const solid = new Solid();
        const top = [
            [0, 40],
            [26, 40],
            [27, 16],
            [60, 16],
        ];

        crumbledWall(solid, at, top, 0, [-3, 3], 0, material("stone-old"), { openings: [{ u0: 25, u1: 31, sill: 10, spring: 20, k: 1 }] });

        const wall = solid.toObject();

        for (const [z, way] of [
            [20, -1],
            [-20, 1],
        ]) {
            assert.equal(hits(wall, [29.3, 13.4, z], [0, 0, way]), 0, "open through it");
            assert.equal(hits(wall, [29.3, 5.3, z], [0, 0, way]), 1, "below its sill");
            assert.equal(hits(wall, [25.6, 30.4, z], [0, 0, way]), 1, "what's left over its head");
        }

        assert.equal(hits(wall, [29.3, 12.4, 0.37], [0, 1, 0]), 0, "open to the sky");
        assert.equal(hits(wall, [25.6, 15.4, 0.37], [0, 1, 0]), 1, "its head where the top's above it");
        assert.equal(hits(wall, [28.3, 13.4, 0.37], [1, 0, 0]), 1, "its jamb, up to the top beside it");
        assert.equal(hits(wall, [28.3, 18.4, 0.37], [1, 0, 0]), 0, "and no higher");
        assert.equal(hits(wall, [28.3, 15.4, 0.37], [-1, 0, 0]), 1, "its other jamb");
    });

    it("puts an old hall's windows where its wall still stands above their sills, and a ruined keep's in rows", () => {
        const { span, every, end, sill, standing, clear } = HALL.windows;
        let placed = 0;

        for (let seed = 1; seed <= 40; seed++) {
            const random = createRandom(seed);
            const length = random.range(40, 120);
            const top = brokenTop(random, length, 4, 23, { stone: 4.5, course: 1.6 });
            const windows = hallWindows(top, length, createRandom(seed + 100));

            placed += windows.length;
            assert.deepEqual(hallWindows(top, length, createRandom(seed + 100)), windows, "the same every time");

            for (const [i, { u0, u1 }] of windows.entries()) {
                assert.ok(Math.abs(u1 - u0 - span * 5) < 1e-9 && u0 >= end * 5 && u1 <= length - end * 5);
                assert.ok([u0 - clear * 5, u1 + clear * 5, ...top.map(([u]) => u).filter((u) => u > u0 - clear * 5 && u < u1 + clear * 5)].every((u) => topAt(top, u) > (sill + standing) * 5 - 1e-9), `${seed}: standing above its sill`);
                assert.ok(i === 0 || u0 - windows[i - 1].u0 >= every[0] * 5 - 1e-9, "apart");
            }
        }

        assert.ok(placed > 10, `${placed} windows in 40 walls`);
        assert.equal(hallWindows(level((sill + standing) * 5 - 1), 60, createRandom(1)).length, 0, "none in a low wall");

        // (A keep's: in rows at its two heights, through its walls where they still stand)
        const height = 90;
        const tall = keepWindows(level(height), 80, height);
        const rows = KEEP_RUIN.windows.sills.map((at) => tall.filter(({ sill }) => Math.abs(sill - height * at) < 1e-9));

        assert.ok(rows.every((row) => row.length >= 2) && rows[0].length + rows[1].length === tall.length);
        assert.deepEqual(
            rows[0].map(({ u0 }) => u0),
            rows[1].map(({ u0 }) => u0),
            "one over another",
        );
        assert.equal(keepWindows(level(height * 0.3), 80, height).length, 0);
        assert.equal(keepWindows(level(height * 0.5), 80, height).length, rows[0].length, "only the lower row in a wall half fallen");
    });

    it("leaves a ruined keep's flat window slits behind for windows through its walls", () => {
        const names = new Set();

        RUINED.keep({ kind: "keep", w: 5, h: 4, door: true, seed: 11, x: 40, y: 64, ruined: true }).traverse((node) => node.isMesh && [node.material].flat().forEach(({ name }) => names.add(name)));
        assert.ok(!names.has("shadow"), [...names].join(", "));
    });
});

describe("what's left where people lived (art/kits/leftovers.js)", () => {
    const made = (seed, make) => {
        const solid = new Solid();

        make(solid, createRandom(seed));

        return solid.toObject();
    };
    const box = (object) => new THREE.Box3().setFromObject(object);
    const m = (metres) => metres * 5;

    it("makes old timber, barrels, crates and a cart, each its own way, the same each time, few triangles", () => {
        const makers = {
            beam: (solid, random) => oldBeam(solid, random, [0, 0, 0], [m(4), m(1), 0], m(0.25)),
            "broken beam": (solid, random) => oldBeam(solid, random, [0, 0, 0], [m(4), m(1), 0], m(0.25), { broken: true }),
            barrel: (solid, random) => oldBarrel(solid, random, [0, 0, 0], "whole"),
            "tipped barrel": (solid, random) => oldBarrel(solid, random, [0, 0, 0], "tipped"),
            "burst barrel": (solid, random) => oldBarrel(solid, random, [0, 0, 0], "burst"),
            crate: (solid, random) => oldCrate(solid, random, [0, 0, 0], m(0.8), 0.4, false),
            "broken crate": (solid, random) => oldCrate(solid, random, [0, 0, 0], m(0.8), 0.4, true),
            cart: (solid, random) => brokenCart(solid, random, [0, 0, 0], 0.7),
            timbers: (solid, random) => fallenTimbers(solid, random, [0, 0, 0], m(1.8)),
        };

        for (const [name, make] of Object.entries(makers)) {
            const object = made(7, make);
            const triangles = trianglesOf(object);

            assert.ok(triangles > 0 && triangles <= 600, `${name}: ${triangles} triangles`);
            assert.equal(trianglesOf(made(7, make)), triangles, `${name}: the same again`);
            assert.ok(Number.isFinite(box(object).max.y), `${name}: somewhere`);
        }

        // (A barrel stands on the ground, a man's waist high; burst, its staves lie lower)
        const whole = box(made(3, makers.barrel));

        assert.ok(whole.min.y > -0.01 && whole.max.y > m(0.75) && whole.max.y < m(1.05), `a barrel ${whole.min.y} to ${whole.max.y}`);
        assert.ok(box(made(3, makers["burst barrel"])).max.y < whole.max.y, "burst, lower");
    });
});

describe("ivy hanging from the old walls (art/kits/ivy.js)", () => {
    const level = (height) => [
        [0, height],
        [80, height],
    ];
    // (A wall along x, its face at z = 3 facing +z, standing on 0)
    const face = (top) => wallFace((u, y, v) => [u, y, v], top, 0, 3, 1, 0);
    const ivyOf = (object) => {
        const found = [];

        object.traverse((node) => node.isMesh && node.material === ivyMaterial() && found.push(node));

        return found;
    };
    const pointsOf = (meshes) => meshes.flatMap(({ geometry }) => Array.from({ length: geometry.attributes.position.count }, (_, k) => [0, 1, 2].map((c) => geometry.attributes.position.getComponent(k, c))));

    it("hangs a curtain from over the top's edge down the face, proud of it, shorter at its sides, its foot ragged", () => {
        const solid = new Solid();
        const top = level(40);

        ivyCurtain(solid, createRandom(3), face(top), [20, 34]);

        const meshes = ivyOf(solid.toObject());
        const points = pointsOf(meshes);
        const foot = (x) => Math.min(...points.filter(([px]) => Math.abs(px - x) < 1e-6).map(([, y]) => y));

        assert.equal(meshes.length, 1);
        assert.ok(points.every(([x]) => x >= 20 - 1e-9 && x <= 34 + 1e-9));
        assert.ok(points.every(([, y]) => y <= 40 + 5 * 0.1 + 1e-9 && y >= 40 - IVY.longest * 5 - 1e-9), "from its top down no further than its longest");
        assert.ok(points.some(([, , z]) => z < 3 - 5 * IVY.over + 1e-6), "draped over the top, inwards");
        assert.ok(points.filter(([, y]) => y < 38).every(([, , z]) => z > 3 + 0.5), "hanging proud of the face");
        const strands = [...new Set(points.map(([x]) => x))].sort((a, b) => a - b);
        const middle = strands[strands.length >> 1];

        assert.ok(foot(middle) < foot(strands[0]) && foot(middle) < foot(strands.at(-1)), "longer in its middle than at its sides");
        assert.equal(new Set(points.filter(([, y]) => y < 38).map(([x]) => x)).size, Math.round(14 / (IVY.strand * 5)) + 1, "a strand every IVY.strand");
        // (The same every time)
        const again = new Solid();

        ivyCurtain(again, createRandom(3), face(top), [20, 34]);
        assert.deepEqual(pointsOf(ivyOf(again.toObject())), points);
    });

    it("hangs it along a wall now and then, clear of its openings and what stands out of it, none where it's low", () => {
        let hung = 0;

        for (let seed = 1; seed <= 30; seed++) {
            const solid = new Solid();
            const clear = [
                [30, 36],
                [50, 54],
            ];
            const curtains = ivyAlong(solid, createRandom(seed), face(level(40)), 80, { clear });

            hung += curtains.length;

            for (const [a, b] of curtains) {
                assert.ok(a >= 0 && b <= 80 && b - a >= IVY.width[0] * 5 * 0.6 - 1e-9);
                assert.ok(clear.every(([c0, c1]) => b <= c0 - IVY.clear * 5 + 1e-9 || a >= c1 + IVY.clear * 5 - 1e-9), `${seed}: clear`);
            }

            assert.equal(ivyAlong(new Solid(), createRandom(seed), face(level(IVY.least * 5 - 1)), 80).length, 0, "none on a low wall");
        }

        assert.ok(hung > 20, `${hung} curtains on 30 walls`);
    });

    it("hangs round a tower's face, standing out of it, as high as its rim", () => {
        const solid = new Solid();
        const heights = Array.from({ length: 24 }, (_, k) => 40 + (k % 3));

        ivyAlong(solid, createRandom(5), ringFace(10, 20, 8, 0, heights), 2 * Math.PI * 8, { chance: 1 });

        const points = pointsOf(ivyOf(solid.toObject()));

        assert.ok(points.length > 0);
        assert.ok(points.filter(([, y]) => y < 38).every(([x, , z]) => Math.hypot(x - 10, z - 20) > 8 + 0.4), "outside its face");
        assert.ok(points.every(([, y]) => y <= 42 + 1));
    });

    it("is drawn as leaf cards are, one program with the hedges' sprigs, casting no shadow; merged, the ruins' ivy one mesh", () => {
        const ivy = ivyMaterial();
        const { sprigs } = hedgeMaterials();

        assert.equal(ivy.customProgramCacheKey(), sprigs.customProgramCacheKey());
        assert.deepEqual([ivy.alphaTest, ivy.alphaToCoverage, ivy.side, ivy.vertexColors], [sprigs.alphaTest, sprigs.alphaToCoverage, sprigs.side, sprigs.vertexColors]);
        assert.equal(ivy.userData.shadow, false);

        const castle = new THREE.Group();

        for (const kind of ["keep", "wall", "tower"]) {
            castle.add(RUINED[kind]({ kind, w: 5, h: 4, door: true, axis: "h", length: 4, shape: "round", seed: 7, x: 40, y: 64, ruined: true }));
        }

        castle.updateMatrixWorld(true);

        const merged = merge(castle).children.filter(({ material }) => material === ivy);

        assert.equal(merged.length, 1, "one mesh of ivy");
        assert.equal(merged[0].castShadow, false);
        assert.ok(merged[0].geometry.attributes.position.count > 100);
    });

    it("grows on the ruins only: a kept castle has none", () => {
        const kept = new THREE.Group();

        kept.add(keep({ w: 5, h: 4, door: true }), wall({ axis: "h", length: 4 }), tower({ shape: "round" }));
        assert.equal(ivyOf(kept).length, 0);
    });
});
