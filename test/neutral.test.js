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
const { PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { WORLD_SIZE } = await import("../client/js/core/worldplan/plan.js");
const { gatehouse, keep, RUINED, tower, wall } = await import("../client/js/world/art/kits/castle.js");
const { builderOf } = await import("../client/js/world/town3d.js");
const { Shapes, siteShapes } = await import("../client/js/world/far/shapes.js");
const { createRandom } = await import("../client/js/core/random.js");
const { Solid } = await import("../client/js/world/art/engine/solid.js");
const { brokenRim, brokenTop, talus } = await import("../client/js/world/art/kits/decay.js");
const { brokenCart, fallenTimbers, oldBarrel, oldBeam, oldCrate } = await import("../client/js/world/art/kits/leftovers.js");
const { material } = await import("../client/js/world/art/engine/materials.js");

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

    it("lays a ruined castle out as the humans' are, its pieces left to ruin and its gate's way through open", () => {
        const laid = layoutNeutral({ kind: "ruined castle", seed: 7 });
        const kinds = new Set(laid.castle.map(({ key }) => key.split("-")[0]));

        assert.deepEqual([...kinds].sort(), ["gatehouse", "keep", "tower", "wall"]);
        assert.ok(laid.castle.every(({ ruined }) => ruined));

        // (Nothing stands in the middle of the gatehouse, where the way in is)
        const gate = laid.castle.find(({ key }) => key.startsWith("gatehouse"));
        const middle = [(gate.x + gate.w / 2) * PLOT, (gate.y + gate.h / 2) * PLOT];

        assert.ok(!laid.solid.some((rect) => within(middle, rect)), "the way through the gate is open");
    });
});

describe("the sites no people keeps in the world (sites.js)", () => {
    let world;
    let overworld;
    let sites;

    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
        sites = world.plan.sites.filter(isNeutral);

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
            // cave's floor, its pit)
            assert.equal(Boolean(down.pad), site.kind === "ruined castle" || site.kind === "cave" || site.kind === "dragon's lair", site.kind);
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
        const budget = { ruins: 4000, "ruined castle": 15000, "dragon's lair": 3000 };
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
