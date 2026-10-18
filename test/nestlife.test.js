// An ants' nest's story (docs/DUNGEONS.md): its brood heaped in its brood chambers and the heap of
// what it's thrown out in its middens (core/dungeons/themes.js, place.js); and as they're drawn
// (client/js/world/nestlife.js, dungeondressing.js, interiors3d.js): the eggs, larvae and pupae in
// their rings, the midden's heap with the gear of those the ants killed on it, heaps of the earth
// they've dug out where other dungeons have fallen rock, roots through the roof clear of anyone's
// head, a widow's web and the prey it's hung in it, and what the fallen were doing when they fell
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { CREATURES } = await import("../client/js/core/creatures.js");
const { buildDungeon } = await import("../client/js/core/dungeons/build.js");
const { THEMES } = await import("../client/js/core/dungeons/themes.js");
const { dungeonRooms } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { fallenScene, middenGearAt, remainsAt } = await import("../client/js/world/dungeondressing.js");
const { buildInterior } = await import("../client/js/world/interiors3d.js");
const { broodIn, cocoonGeometry, eggGeometry, heapGeometry, heapHeightAt, heapOf, larvaGeometry, NEST_LIFE, pupaGeometry, randomOf, rootsUnder, webAround } = await import("../client/js/world/nestlife.js");

// A geometry's points: [[x, y, z]...]
const pointsOf = (geometry) => Array.from({ length: geometry.attributes.position.count }, (_, k) => [geometry.attributes.position.getX(k), geometry.attributes.position.getY(k), geometry.attributes.position.getZ(k)]);

// A nest's levels as the game makes them (core/insides.js #makeDungeon), each built as it's drawn,
// with where those that lurk under its roof wait
function levelsOf(seed) {
    return dungeonRooms({ seed, theme: "nest", tier: 3 }).map((floor, k, floors) => {
        const map = readPlan(`test-nest-${seed}-${k}`, floor.name, floor.rows, { ground: floor.ground });

        Object.assign(map, {
            origin: [0, 0],
            style: floor.style,
            look: floor.look,
            people: "human",
            dungeon: { theme: floor.look, level: k, levels: floors.length, lights: floor.level.lights, rooms: floor.level.rooms, lurks: floor.level.packs.flatMap(({ foes }) => foes).filter(({ creature }) => CREATURES[creature]?.lurk).map(({ at }) => at) },
        });

        return map;
    });
}

describe("an ants' nest's brood and middens in its plan (dungeons/themes.js, place.js)", () => {
    it("heaps its brood in the middle of nearly every brood chamber and what it's thrown out in the middle of nearly every midden, two squares by two that can't be walked over; no other theme's", () => {
        let [chambers, heaped] = [0, 0];

        for (let seed = 1; seed <= 30; seed++) {
            const dungeon = buildDungeon({ seed, theme: "nest", tier: 1 + (seed % 7), levels: 1 + (seed % 3) });

            dungeon.levels.forEach((level, k) => {
                const map = readPlan(`d${seed}-${k}`, dungeon.name, level.rows);

                for (const room of level.rooms.filter(({ kind }) => kind === "brood" || kind === "midden")) {
                    const pieces = map.pieces.filter(({ kind, x, y }) => kind === room.kind && x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h);

                    chambers++;
                    assert.ok(pieces.length <= 1, `${seed}/${k}: ${pieces.length} heaps in a ${room.kind}`);

                    for (const piece of pieces) {
                        heaped++;
                        assert.deepEqual([piece.w, piece.h], [2, 2]);
                        assert.ok(Math.hypot(piece.x + 1 - room.centre[0] - 0.5, piece.y + 1 - room.centre[1] - 0.5) <= Math.max(room.w, room.h) / 3, `${seed}/${k}: a ${room.kind}'s heap off its middle`);
                        assert.ok(piece.squares.every(([x, y]) => map.blocked[y][x] === 1));
                    }
                }

                // (Only in their own chambers)
                for (const piece of map.pieces.filter(({ kind }) => kind === "brood" || kind === "midden")) {
                    assert.ok(level.rooms.some((room) => room.kind === piece.kind && piece.x >= room.x && piece.y >= room.y && piece.x < room.x + room.w && piece.y < room.y + room.h));
                }
            });
        }

        assert.ok(chambers > 40 && heaped >= chambers * 0.95, `${heaped} heaped of ${chambers}`);

        for (const theme of Object.keys(THEMES).filter((id) => id !== "nest")) {
            for (const level of buildDungeon({ seed: 4, theme, tier: 3, levels: 3 }).levels) {
                assert.ok(level.rows.every((row) => !/[Ez]/.test(row)), theme);
            }
        }
    });
});

describe("an ants' nest's life drawn (world/nestlife.js)", () => {
    it("lays a brood chamber's eggs heaped in its middle, its larvae in a ring round them and its pupae round those, on free floor, none on another", () => {
        const { eggs, larvae, pupae } = NEST_LIFE.brood;

        for (let seed = 1; seed <= 20; seed++) {
            // (Free floor but for a wall to the east of the middle)
            const brood = broodIn([10, 10], (x) => x < 12.5, randomOf(seed));

            assert.ok(brood.eggs.length >= eggs.count[0] && brood.eggs.length <= eggs.count[1]);
            assert.ok(brood.larvae.length >= 3 && brood.larvae.length <= larvae.count[1]);
            assert.ok(brood.pupae.length >= 3 && brood.pupae.length <= pupae.count[1]);

            for (const egg of brood.eggs) {
                assert.ok(Math.hypot(egg.x - 10, egg.z - 10) <= eggs.ring[1] + 1e-9);
                assert.ok(egg.size >= eggs.size[0] && egg.size <= eggs.size[1] && egg.y > 0 && egg.y < 0.5);
            }

            for (const [kind, spec] of [["larvae", larvae], ["pupae", pupae]]) {
                for (const one of brood[kind]) {
                    const out = Math.hypot(one.x - 10, one.z - 10);

                    assert.ok(out >= spec.ring[0] - 1e-9 && out <= spec.ring[1] + 1e-9, `${kind} ${out}`);
                    assert.ok(one.x < 12.5, `${kind} on the wall`);
                }
            }

            const lying = [...brood.larvae, ...brood.pupae];

            lying.forEach((one, k) => {
                for (const other of lying.slice(k + 1)) {
                    assert.ok(Math.hypot(one.x - other.x, one.z - other.z) > (one.size + other.size) * 0.45);
                }
            });
        }
    });

    it("makes each of the brood and the prey once, shared: an egg an oval, a larva curled, a pupa a barrel, the prey a body bound in silk, widest at its shoulders", () => {
        for (const make of [eggGeometry, larvaGeometry, pupaGeometry, cocoonGeometry]) {
            assert.equal(make(), make());
            assert.equal(make().userData.shared, true);
        }

        const sizeOf = (geometry) => {
            geometry.computeBoundingBox();

            const { min, max } = geometry.boundingBox;

            return [max.x - min.x, max.y - min.y, max.z - min.z];
        };
        const [ex, ey, ez] = sizeOf(eggGeometry());
        const [px, , pz] = sizeOf(pupaGeometry());

        assert.ok(Math.abs(ez - 1) < 0.02 && ex > 0.55 && ex < 0.7 && ey > ex * 0.9 && ey <= ex, "an egg");
        assert.ok(Math.abs(pz - 1) < 0.02 && px > 0.3 && px < 0.45, "a pupa");

        // (The prey, hung by its head: a metre down from 0, its head narrower than its shoulders,
        // its feet narrowest)
        const points = pointsOf(cocoonGeometry());
        const across = (from, to) => Math.max(...points.filter(([, y]) => -y >= from && -y <= to).map(([x, , z]) => Math.hypot(x, z)));

        assert.ok(Math.max(...points.map(([, y]) => y)) <= 0.01 && Math.min(...points.map(([, y]) => y)) >= -1.01);
        assert.ok(across(0.2, 0.36) > across(0.05, 0.12) * 1.5, "shoulders and head");
        assert.ok(across(0.85, 1) < across(0.2, 0.36) * 0.7, "shoulders and feet");
    });

    it("heaps a midden's refuse wider than the earth dug out elsewhere, each as high as its kind's, highest at its middle and nothing past its edge, one mesh for all of a kind", () => {
        const pieces = [{ x: 4, y: 4, w: 2, h: 2 }, { x: 12, y: 6, w: 1, h: 1 }];

        for (let k = 0; k < 20; k++) {
            const rough = k / 20;
            const midden = heapOf(pieces[0], rough);
            const spoil = heapOf(pieces[1], rough, { kind: "spoil", out: [0.25, 0] });

            assert.equal(midden.kind, "heap");
            assert.deepEqual([midden.x, midden.z], [5, 5]);
            assert.deepEqual([spoil.x, spoil.z], [12.75, 6.5]);
            for (const [heap, { radius, high }] of [[midden, NEST_LIFE.heap], [spoil, NEST_LIFE.spoil]]) {
                assert.ok(heap.radius >= radius[0] && heap.radius <= radius[1] && heap.high >= high[0] && heap.high <= high[1]);
            }

            assert.ok(spoil.radius < midden.radius);

            for (const heap of [midden, spoil]) {
                assert.equal(heapHeightAt(heap, heap.x, heap.z), heap.high);

                // (Falling away from its middle every way, to nothing past its edge)
                for (let a = 0; a < 6.28; a += 0.5) {
                    let last = heap.high;

                    for (let out = 0.05; out <= heap.radius * 1.3; out += 0.05) {
                        const now = heapHeightAt(heap, heap.x + Math.cos(a) * out, heap.z + Math.sin(a) * out);

                        assert.ok(now <= last + 1e-9);
                        last = now;
                    }

                    assert.equal(heapHeightAt(heap, heap.x + Math.cos(a) * heap.radius * 1.25, heap.z + Math.sin(a) * heap.radius * 1.25), 0);
                }
            }

            // (Both in one geometry: their tops at their heights, nothing under the floor; the
            // dug earth redder than the refuse)
            const geometry = heapGeometry([midden, spoil]);
            const points = pointsOf(geometry);
            const colours = geometry.attributes.color;
            // (The dug earth's points after the midden's, from its top)
            const half = points.findIndex(([x, y, z], k) => k > 0 && x === Math.fround(spoil.x) && y === Math.fround(spoil.high) && z === Math.fround(spoil.z));
            const warmth = (from, to) => {
                let [r, g] = [0, 0];

                for (let j = from; j < to; j++) {
                    [r, g] = [r + colours.getX(j), g + colours.getY(j)];
                }

                return r / g;
            };

            assert.deepEqual(points[0], [midden.x, midden.high, midden.z].map(Math.fround));
            assert.ok(half > 0 && half < points.length - 1);
            assert.ok(points.every(([, y]) => y >= 0));
            assert.ok(warmth(half, points.length) > warmth(0, half) * 1.1);
        }
    });

    it("hangs roots through the roof, the more the nearer the meadow, none of them or their rootlets lower than 2.1 m over the floor, none under a low roof", () => {
        const squares = [];

        for (let x = 0; x < 30; x++) {
            for (let z = 0; z < 30; z++) {
                squares.push([x + 0.5, z + 0.5]);
            }
        }

        // (A roof 4.6 m high)
        const counts = [0, 1, 2].map((depth) => {
            const { tubes, lines } = rootsUnder(squares, () => 4.6, depth, randomOf(5));

            // (Each root down from the roof, as thick as a root is)
            for (let k = 1; k < tubes.positions.length; k += 3) {
                assert.ok(tubes.positions[k] >= 2.1 - 0.06 && tubes.positions[k] <= 4.6 + 0.1, `a root at ${tubes.positions[k]}`);
            }

            for (let k = 1; k < lines.positions.length; k += 3) {
                assert.ok(lines.positions[k] >= 2.1 - 1e-9, `a rootlet at ${lines.positions[k]}`);
            }

            return tubes.positions.length;
        });

        assert.ok(counts[0] > counts[1] && counts[1] > counts[2] && counts[2] > 0, JSON.stringify(counts));

        // (None under a roof too low for them)
        assert.equal(rootsUnder(squares, () => 2.4, 0, randomOf(5)).tubes.positions.length, 0);
    });

    it("spins a widow's web under the roof where it waits, a tangle of sagging threads, some to the walls, and sticky threads hanging from it to the floor", () => {
        // (A round chamber 3 m across from its middle, its roof 3.6 m high)
        const [cx, cz] = [10, 10];
        const open = (x, y, z) => Math.min(3 - Math.hypot(x - cx, z - cz), 3.6 - y, y);
        const roofAt = () => 3.6;
        const { reach, threads, hanging } = NEST_LIFE.web;

        for (let seed = 1; seed <= 10; seed++) {
            const segments = webAround([cx, cz], open, roofAt, randomOf(seed));
            const ends = [];

            for (let k = 0; k < segments.length; k += 3) {
                ends.push(segments.slice(k, k + 3));
            }

            // (Those hanging: to the floor)
            const down = ends.filter((end, k) => k % 2 === 1 && end[1] === 0.01);

            for (let k = 0; k < ends.length; k += 2) {
                for (const [x, y, z] of [ends[k], ends[k + 1]]) {
                    assert.ok(Math.hypot(x - cx, z - cz) <= Math.max(reach * 1.4, 3) + 0.5, "near where it waits");
                    assert.ok(y <= 3.6 && y >= 0, "under the roof");
                }
            }

            // (Each thread of its tangle in three pieces, sagging below the line between its ends)
            const tangle = (ends.length / 2 - down.length) / 3;

            assert.ok(tangle >= threads[0] * 0.8 && tangle <= threads[1], `${tangle} threads`);
            assert.ok(down.length >= 1 && down.length <= hanging[1], `${down.length} hanging`);

            for (let k = 0; k < tangle * 6; k += 6) {
                const [a, p, q, b] = [ends[k], ends[k + 1], ends[k + 3], ends[k + 5]];

                assert.deepEqual(ends[k + 2], p);
                assert.deepEqual(ends[k + 4], q);
                assert.ok(p[1] <= a[1] + (b[1] - a[1]) / 3 + 1e-9 && q[1] <= a[1] + ((b[1] - a[1]) * 2) / 3 + 1e-9, "sagging");
            }

            // (Some anchored on the walls, high up)
            assert.ok(ends.some(([x, y, z]) => Math.hypot(x - cx, z - cz) > 2.8 && y > 2));
        }
    });
});

describe("what the ants and their prey have left (world/dungeondressing.js)", () => {
    it("throws the gear of those the ants killed out on a midden's heap and round its foot, lying on it, the blades laid down", () => {
        for (let k = 0; k < 20; k++) {
            const heap = heapOf({ x: 4 + k, y: 4, w: 2, h: 2 }, k / 20);
            const heightAt = (x, z) => heapHeightAt(heap, x, z);
            const gear = middenGearAt(heap, heightAt, k / 20);

            assert.ok(gear.length >= 9 && gear.length <= 13);
            assert.ok(gear.some(({ model }) => model === "ribcage"));

            for (const one of gear) {
                assert.ok(Math.hypot(one.x - heap.x, one.z - heap.z) <= heap.radius * 1.3 + 1e-9);
                assert.ok(one.y >= 0 && one.y <= heightAt(one.x, one.z) + 1e-9, `${one.model} floating`);
                assert.ok(one.y >= heightAt(one.x, one.z) - 0.08 - 1e-9, `${one.model} buried`);

                if (one.model === "estoc") {
                    assert.equal(one.pitch, -Math.PI / 2);
                }

                if (one.model === "sword") {
                    assert.equal(one.roll, Math.PI / 2);
                }
            }
        }
    });

    it("lays the blade by someone's remains down beside them, never on its end", () => {
        let blades = 0;

        for (let k = 0; k < 60; k++) {
            for (const one of remainsAt(5 + k, 5, { rough: k / 60 })) {
                if (one.model === "estoc") {
                    assert.equal(one.pitch, -Math.PI / 2);
                    blades++;
                }

                if (one.model === "sword") {
                    assert.equal(one.roll, Math.PI / 2);
                    blades++;
                }
            }
        }

        assert.ok(blades > 20);
    });

    it("tells what the fallen were doing when they fell: reaching for the stairs, digging a way out, or camped", () => {
        // (Face down towards the stairs (to the north), the skull foremost, the lantern fallen
        // ahead of it and the sword dropped behind)
        const reaching = fallenScene("reaching", 10, 10, { toward: [0, -1], rough: 0.4 });
        const ahead = (model) => 10 - reaching.find((one) => one.model === model).z;

        assert.ok(ahead("lantern") > ahead("ribcage") && ahead("ribcage") > ahead("pelvis") && ahead("pelvis") > ahead("sword"));
        assert.ok(["skull", "skull-worn", "skull-side"].includes(reaching[0].model) && 10 - reaching[0].z > ahead("ribcage"));

        // (Against the wall to the east: pick and spade leant on it, the earth they dug heaped by
        // them, their remains against it, their lantern)
        const digger = fallenScene("digger", 10, 10, { wall: [1, 0], rough: 0.4 });

        for (const model of ["pickaxe", "spade", "ribcage", "lantern"]) {
            assert.ok(digger.some((one) => one.model === model), model);
        }

        for (const tool of digger.filter(({ model }) => model === "pickaxe" || model === "spade")) {
            assert.ok(tool.x > 10 && tool.roll > 0, `${tool.model} leant on the wall`);
        }

        // (A ring of eight stones round a cold fire, a sheepskin laid flat by it, two dead)
        const camp = fallenScene("camp", 10, 10, { rough: 0.4 });
        const ring = camp.slice(0, 8);

        assert.ok(ring.every(({ x, z }) => Math.abs(Math.hypot(x - 10, z - 10) - 0.42) < 1e-9));
        assert.equal(camp.find(({ model }) => model === "pelt").pitch, -Math.PI / 2);
        assert.equal(camp.filter(({ model }) => ["skull", "skull-worn", "skull-side"].includes(model)).length, 2);
    });
});

describe("an ants' nest's level built (world/interiors3d.js)", () => {
    it("draws its brood, its heaps, its roots, its webs and their prey in a few meshes, and no fallen rock: heaps of dug earth", () => {
        const seen = new Set();

        for (const seed of [2, 7]) {
            for (const map of levelsOf(seed)) {
                const interior = buildInterior(map);
                const named = new Map();

                interior.object.traverse((node) => {
                    if (["eggs", "larvae", "pupae", "midden", "spoil", "roots", "rootlets", "webs", "cocoons"].includes(node.name)) {
                        assert.ok(!named.has(node.name), `two ${node.name}`);
                        named.set(node.name, node);
                        seen.add(node.name);
                    }
                });

                const has = (kind) => map.pieces.some((piece) => piece.kind === kind);

                assert.equal(named.has("eggs"), has("brood"), `${map.id}: eggs`);
                assert.equal(named.has("midden"), has("midden"), `${map.id}: midden`);
                assert.equal(named.has("spoil"), has("rubble"), `${map.id}: spoil`);
                assert.equal(named.has("webs"), map.dungeon.lurks.length > 0, `${map.id}: webs`);

                // (No boulders: what's fallen in a nest is earth they've dug, its clods round it)
                assert.ok(interior.props.every(({ model }) => !model.startsWith("boulder")), `${map.id}: a boulder`);

                // (The prey hung by the walls near where each widow waits, under the roof, their feet
                // clear of the floor)
                const cocoons = named.get("cocoons");

                for (let k = 0; k < (cocoons?.count ?? 0); k++) {
                    // (Where its head hangs, and how long it is: its matrix's)
                    const at = cocoons.instanceMatrix.array.slice(k * 16, k * 16 + 16);
                    const [x, y, z, long] = [at[12], at[13], at[14], at[5]];

                    assert.ok(map.dungeon.lurks.some(([lx, ly]) => Math.hypot(lx + 0.5 - x, ly + 0.5 - z) <= 4.5 * Math.SQRT2 + 1), `${map.id}: prey far from a widow`);
                    assert.ok(y - long >= 0.55, `${map.id}: prey on the floor`);
                }

                interior.dispose();
            }
        }

        for (const name of ["eggs", "larvae", "pupae", "midden", "spoil", "roots", "rootlets", "webs", "cocoons"]) {
            assert.ok(seen.has(name), `no ${name}`);
        }
    });
});
