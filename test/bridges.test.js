// The stone arch bridges (core/overworld.js BRIDGE.stone, world/art/kits/bridges.js, the terrain
// plan's M7i-2): the bigger roads' crossings, and some of the tracks', built of stone as grand as
// their road (a track's packhorse bridge, a road's, a trade road's with a gate tower near a capital
// or a city); their decks level over the river, up ramps from the banks, walked on as cobbles;
// their arches springing over the water, each of its own stones; what grows at their ends
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
const noop = () => {};

globalThis.document ??= {
    createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (target, key) => (key in target ? target[key] : () => ({ addColorStop: noop })) }),
    }),
};

const { BRIDGE, buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { GROUND } = await import("../client/js/core/setpieces/pieces.js");
const { archesOf, bridgeGrowth, GRADE_OF, STONE_BRIDGE, stoneBridgeBuilding, stoneBridgeInto, stoneBridges } = await import("../client/js/world/art/kits/bridges.js");
const { Solid } = await import("../client/js/world/art/engine/solid.js");
const { UNDERGROWTH } = await import("../client/js/world/art/kits/wilds.js");

// Seed 1's bridges near its start town: a road's stone bridge, a track's stone and timber ones,
// and a trade road's by the capital (found by looking)
const AT = { road: [3005, 5150], track: [2915, 4930], timber: [2816, 5025], trade: [3550, 5315] };

let town;
let bridges;

const lengthOf = ({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const surfaceOf = ({ a, b }) => town.waters.river((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 20).surface;
const env = () => ({ deckOf: (bridge, t) => town.deckOf(bridge, t), groundAt: (x, z) => town.ground.heightAt(x, z), surfaceOf });

before(() => {
    town = buildWorld({ seed: 1 }).maps.town;
    bridges = Object.fromEntries(Object.entries(AT).map(([name, [x, y]]) => [name, town.chunkAt(x, y).bridges.find(({ stone }) => (name === "timber" ? !stone : stone))]));
});

describe("the stone bridges (core/overworld.js)", () => {
    it("are the roads' and the trade roads' crossings and some of the tracks', each knowing its road, a trade road's by a capital with a gate tower", () => {
        assert.deepEqual(Object.values(bridges).map((bridge) => Boolean(bridge)), [true, true, true, true]);
        assert.deepEqual([bridges.road.kind, bridges.track.kind, bridges.trade.kind], ["road", "track", "trade"]);
        assert.equal(bridges.timber.stone, undefined, "a track's timber bridge");
        assert.deepEqual([bridges.road.tower, bridges.track.tower, bridges.trade.tower], [false, false, true]);

        for (const name of ["road", "track", "trade"]) {
            assert.deepEqual(bridges[name].ramps, [BRIDGE.stone.banks, BRIDGE.stone.banks], `${name}: up a ramp from each bank`);
        }
    });

    it("carry their decks level over the river, as high as their road's kind has it, up ramps no steeper than a hill's from the ground at their ends", () => {
        for (const name of ["road", "track", "trade"]) {
            const bridge = bridges[name];
            const surface = surfaceOf(bridge);
            const length = lengthOf(bridge);
            const top = town.deckOf(bridge, 0.5);

            assert.ok(Math.abs(top - Math.max(surface + BRIDGE.stone.over[bridge.kind], (town.ground.heightAt(...bridge.a) + town.ground.heightAt(...bridge.b)) / 2)) < 1e-9, `${name}: ${(top - surface).toFixed(2)} m over the water`);
            assert.ok(Math.abs(town.deckOf(bridge, 0) - town.ground.heightAt(...bridge.a)) < 1e-9 && Math.abs(town.deckOf(bridge, 1) - town.ground.heightAt(...bridge.b)) < 1e-9, `${name}: from the ground at its ends`);

            for (let k = 0; k < 60; k++) {
                const rise = Math.abs(town.deckOf(bridge, (k + 1) / 60) - town.deckOf(bridge, k / 60)) / (length / 60);

                assert.ok(rise < 0.5, `${name}: ${rise.toFixed(2)} steep`);
            }
        }

        // (A packhorse bridge humped higher over one high arch than a trade road's over its row)
        assert.ok(BRIDGE.stone.over.track > BRIDGE.stone.over.road && BRIDGE.stone.over.road > BRIDGE.stone.over.trade);
    });

    it("are walked on as cobbles (no planks' thickness over their decks), a timber bridge as planks", () => {
        for (const [name, kind] of [["road", GROUND.cobbles], ["track", GROUND.cobbles], ["timber", GROUND.planks]]) {
            const { a, b } = bridges[name];
            const [x, y] = [Math.floor((a[0] + b[0]) / 2), Math.floor((a[1] + b[1]) / 2)];
            const chunk = town.chunkAt(x, y);
            const k = (y - chunk.y0) * CHUNK + (x - chunk.x0);

            assert.equal(chunk.bridge[k], 1, `${name}: a bridge's square`);
            assert.equal(chunk.ground[k], kind, name);
        }
    });
});

describe("the stone bridges built (world/art/kits/bridges.js)", () => {
    it("spring their arches a little over the water, as wide as their grade's arches span for how high they rise, from bank to bank between piers", () => {
        for (const name of ["road", "track", "trade"]) {
            const bridge = bridges[name];
            const grade = GRADE_OF[bridge.kind];
            const { ratio, ring } = STONE_BRIDGE.grades[grade];
            const surface = surfaceOf(bridge);
            const length = lengthOf(bridge);
            const top = town.deckOf(bridge, 0.5);
            const arches = archesOf(length, bridge.ramps, top, surface, grade);
            const crown = top - STONE_BRIDGE.paving - ring;

            assert.ok(arches.length >= 1);
            assert.ok(Math.abs(arches[0].middle - arches[0].half - (bridge.ramps[0] - STONE_BRIDGE.springs)) < 1e-9, `${name}: from the bank`);
            assert.ok(Math.abs(arches.at(-1).middle + arches.at(-1).half - (length - bridge.ramps[1] + STONE_BRIDGE.springs)) < 1e-9, `${name}: to the other bank`);

            for (const [k, arch] of arches.entries()) {
                const rise = crown - arch.springs;

                assert.ok(Math.abs(arch.centre + arch.radius - crown) < 1e-9, `${name}: its crown under the deck`);
                assert.ok(arch.springs >= surface + STONE_BRIDGE.spring - 1e-9, `${name}: springing over the water`);
                assert.ok(arch.half * 2 <= ratio * rise + 1e-6 || Math.abs(rise - arch.half) < 1e-9, `${name}: ${(arch.half * 2).toFixed(1)} m wide, rising ${rise.toFixed(1)}`);

                if (k > 0) {
                    const gap = arch.middle - arch.half - (arches[k - 1].middle + arches[k - 1].half);

                    assert.ok(Math.abs(gap - STONE_BRIDGE.pier) < 1e-9, `${name}: a pier between`);
                }
            }
        }

        // (The packhorse bridge over its stream in one arch)
        assert.equal(archesOf(lengthOf(bridges.track), bridges.track.ramps, town.deckOf(bridges.track, 0.5), surfaceOf(bridges.track), "packhorse").length, 1);
    });

    it("are each a few thousand triangles of its grade's stone, a step at a time; the gate tower's slate roof and windows over the trade road's", () => {
        const counts = {};

        for (const name of ["road", "track", "trade"]) {
            const bridge = bridges[name];
            const length = lengthOf(bridge);
            const [ux, uy] = [(bridge.b[0] - bridge.a[0]) / length, (bridge.b[1] - bridge.a[1]) / length];
            const grade = GRADE_OF[bridge.kind];
            const options = { length, half: bridge.half, ramps: bridge.ramps, deck: (t) => town.deckOf(bridge, t), ground: (u) => town.ground.heightAt(bridge.a[0] + ux * u, bridge.a[1] + uy * u), surface: surfaceOf(bridge), grade, tower: bridge.tower, seed: 3 };
            const solid = new Solid();
            const building = stoneBridgeBuilding(solid, options);
            let steps = 0;

            while (!building.next().done) {
                steps++;
            }

            const again = new Solid();
            const { tower } = stoneBridgeInto(again, options);
            const object = again.toObject();
            const names = new Set();

            object.traverse((node) => node.isMesh && [node.material].flat().forEach(({ name: material }) => names.add(material)));
            counts[name] = solid.triangles;

            assert.ok(steps >= 3, `${name}: in ${steps + 1} steps`);
            assert.equal(again.triangles, solid.triangles, `${name}: the same either way`);
            assert.ok(solid.triangles > 1500 && solid.triangles < 6000, `${name}: ${solid.triangles} triangles`);
            assert.ok(names.has("cobbles") && names.has(STONE_BRIDGE.grades[grade].walls) && names.has("dressed-old"), `${name}: ${[...names].join(", ")}`);
            assert.equal(names.has("slate") && names.has("leaded"), name === "trade", `${name}: a tower or none`);
            assert.equal(tower !== null, name === "trade");
        }

        // (Drawn with the buildings' atlas, a chunk's in a draw or two, in the world)
        const drawn = stoneBridges([bridges.road, bridges.trade], env());

        assert.equal(drawn.name, "stone bridges");
        assert.ok(drawn.children.length <= 3, `${drawn.children.length} meshes`);
        assert.equal(stoneBridges([], env()), null);
        assert.ok(counts.road > 0 && counts.track > 0);
    });

    it("lay their cobbles on the deck where it's walked, and stand their faces out past it", () => {
        const bridge = bridges.road;
        const length = lengthOf(bridge);
        const [ux, uy] = [(bridge.b[0] - bridge.a[0]) / length, (bridge.b[1] - bridge.a[1]) / length];
        const solid = new Solid();

        stoneBridgeInto(solid, { length, half: bridge.half, ramps: bridge.ramps, deck: (t) => town.deckOf(bridge, t), ground: (u) => town.ground.heightAt(bridge.a[0] + ux * u, bridge.a[1] + uy * u), surface: surfaceOf(bridge), grade: "road" });

        const object = solid.toObject();
        let checked = 0;

        object.traverse((node) => {
            if (!node.isMesh || [node.material].flat()[0].name !== "cobbles") {
                return;
            }

            const position = node.geometry.getAttribute("position");

            for (let k = 0; k < position.count; k += 5) {
                const [u, y, z] = [position.getX(k) / 5, position.getY(k) / 5, position.getZ(k) / 5];

                assert.ok(Math.abs(y - town.deckOf(bridge, u / length)) < 1e-6, `the deck's height at ${u.toFixed(1)} m`);
                assert.ok(Math.abs(z) <= bridge.half + 1e-6);
                checked++;
            }
        });

        assert.ok(checked > 20);
    });

    it("have what grows by the river at their ends, on the banks, and tufts in a packhorse bridge's coping; none in the snow, nor with no undergrowth", () => {
        for (const name of ["road", "track"]) {
            const bridge = bridges[name];
            const surface = surfaceOf(bridge);
            const options = { land: "meadow", undergrowth: UNDERGROWTH, groundAt: (x, y) => town.ground.heightAt(x, y), deckOf: (each, t) => town.deckOf(each, t), surface };
            const plants = bridgeGrowth(bridge, options);
            const high = plants.filter(({ ground, x, y }) => ground > town.ground.heightAt(x, y) + 1);

            assert.ok(plants.length > 10, `${name}: ${plants.length} plants`);
            assert.ok(plants.every(({ kind }) => !["pebbles", "stones", "sticks", "molehill", "campfire"].includes(kind)), "plants only");
            assert.ok(plants.filter((plant) => !high.includes(plant)).every(({ ground }) => ground > surface), "on the banks, not in the water");
            assert.equal(high.length > 0, name === "track", `${name}: in its coping`);
            assert.equal(bridgeGrowth(bridge, { ...options, land: "snow" }).length, 0);
            assert.equal(bridgeGrowth(bridge, { ...options, density: 0 }).length, 0);
        }
    });
});
