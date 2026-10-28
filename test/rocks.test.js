// Rocks as stone breaks and weathers (client/js/world/art/kits/rocks.js), drawn in the wilds
// (kits/wilds.js: their own mesh, by ring and quality), on the ground round them (world/ground.js
// contactOf) and where the world lays them (core/wilds.js ROCKFALL); and the rest of what's stony
// drawn with them: the cliffs' scree, the fords' stepping stones, the rockslides
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { quickEnough } from "./helpers.js";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { buildWorld } = await import("../client/js/core/overworld.js");
const { featuresOf, FEATURES, ROCKFALL } = await import("../client/js/core/wilds.js");
const { createRandom } = await import("../client/js/core/random.js");
const { contactOf, ROCK_CONTACT } = await import("../client/js/world/ground.js");
const { LAYERS, ROCKS_HIGH } = await import("../client/js/world/art/engine/atlas.js");
const { familyOf, LAND_ROCKS, LICHEN_KINDS, lookBytes, pileLook, randomOf, ROCK_DETAIL, ROCK_FAMILIES, rockLook, sphereOf, StoneMesher } = await import("../client/js/world/art/kits/rocks.js");
const { CHIPS, featureLooks, featureMesh, keptLooks, LOOKS, LOOKS_KEPT, lookGeometry, ROCK_TIERS, stoneLookOf, stoneMesh, STONY } = await import("../client/js/world/art/kits/wilds.js");
const { allAtOnce } = await import("../client/js/core/steps.js");
const THREE = await import("three");
const { chip } = await import("../client/js/world/art/kits/cliffs.js");
const { fordsMesh } = await import("../client/js/world/art/kits/fords.js");
const { Mesher } = await import("../client/js/world/art/kits/wilds.js");
const { ObstacleProps } = await import("../client/js/world/obstacles3d.js");

const FAMILIES = Object.keys(ROCK_FAMILIES);
const pointsOf = (look) => Array.from({ length: look.count }, (_, i) => [look.position[i * 3], look.position[i * 3 + 1], look.position[i * 3 + 2]]);
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

describe("rocks' shapes (world/art/kits/rocks.js)", () => {
    it("are each a closed skin of triangles, its corners shared but where its edges are sharp, lit outward, the same every time for the same seed", () => {
        for (const family of FAMILIES) {
            for (const detail of [ROCK_DETAIL.big.near, ROCK_DETAIL.big.far, ROCK_DETAIL.pebble.far]) {
                const look = rockLook(randomOf(41), { family, detail });
                const again = rockLook(randomOf(41), { family, detail });

                assert.deepEqual([...again.position], [...look.position], `${family} ${detail}: the same`);
                assert.deepEqual([...again.color], [...look.color]);
                assert.equal(look.index.length / 3, sphereOf(detail).triangles.length / 3, `${family} ${detail}: its ball's triangles`);

                // (Every edge, by where its ends are, between two triangles: no holes, however
                // its corners are split)
                const key = (i) => look.position.slice(i * 3, i * 3 + 3).map((v) => v.toFixed(5)).join();
                const edges = new Map();

                for (let t = 0; t < look.index.length; t += 3) {
                    for (let k = 0; k < 3; k++) {
                        const [a, b] = [key(look.index[t + k]), key(look.index[t + ((k + 1) % 3)])].sort();

                        edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
                    }
                }

                assert.ok([...edges.values()].every((n) => n === 2), `${family} ${detail}: closed`);

                // (Its normals of length 1, facing out from its middle, but under its flat foot)
                const points = pointsOf(look);
                const middle = [0, 1, 2].map((k) => mean(points.map((p) => p[k])));
                let outward = 0;

                for (const [i, p] of points.entries()) {
                    const n = look.normal.slice(i * 3, i * 3 + 3);

                    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-4, `${family}: its normals`);
                    outward += (p[0] - middle[0]) * n[0] + (p[1] - middle[1]) * n[1] + (p[2] - middle[2]) * n[2] > 0 ? 1 : 0;
                }

                assert.ok(outward / points.length > 0.9, `${family} ${detail}: ${outward} of ${points.length} lit outward`);
                assert.ok(look.color.every((v) => v >= 0 && v <= 1.3), `${family}: its colours`);
            }
        }
    });

    it("are about a metre across, standing on the ground (as the wilds' looks are), within the few hundred triangles near and a hundred far", () => {
        for (const family of FAMILIES) {
            for (let k = 0; k < 6; k++) {
                const near = rockLook(randomOf(100 + k), { family, detail: ROCK_DETAIL.big.near });
                const xs = pointsOf(near).map((p) => p[0]);
                const ys = pointsOf(near).map((p) => p[1]);

                assert.ok(Math.max(...xs) - Math.min(...xs) > 0.5 && Math.max(...xs) - Math.min(...xs) <= 1.05, `${family}: ${Math.max(...xs) - Math.min(...xs)} across`);
                assert.ok(Math.min(...ys) > -0.2 && near.top > 0.15 && near.top < 1, `${family}: ${Math.min(...ys)} to ${near.top}`);
                assert.ok(Math.abs(near.top - Math.max(...ys)) < 0.06, `${family}: as tall as it's drawn`);
                assert.ok(near.index.length / 3 <= 340, `${family}: near`);
                assert.ok(rockLook(randomOf(100 + k), { family, detail: ROCK_DETAIL.big.far }).index.length / 3 <= 80, `${family}: far`);
            }
        }
    });

    it("keep the same rock far off as near, its far corners among its near ones, lit and coloured the same where its faces are worn round", () => {
        for (const family of FAMILIES) {
            const near = rockLook(randomOf(7), { family, detail: 3 });
            const far = rockLook(randomOf(7), { family, detail: 1 });
            const at = new Map(pointsOf(near).map((p, i) => [p.map((v) => v.toFixed(5)).join(), i]));

            for (const [i, p] of pointsOf(far).entries()) {
                const j = at.get(p.map((v) => v.toFixed(5)).join());

                assert.ok(j !== undefined, `${family}: a far corner on the near rock`);
                assert.ok(Math.abs(far.data[i * 4] - near.data[j * 4]) < 1e-6, `${family}: its moss's noise`);
            }

            assert.equal(far.top, near.top, `${family}: as tall`);
        }
    });

    it("break as their stone does: a cobble smooth all over, granite talus and basalt keeping sharp edges, a sandstone slab flatter than it's long", () => {
        const splits = (family) => mean(Array.from({ length: 6 }, (_, k) => rockLook(randomOf(300 + k), { family, detail: 3 }).count - sphereOf(3).positions.length / 3));

        assert.equal(splits("cobble"), 0, "a cobble: never split");
        assert.ok(splits("talus") > 60 && splits("basalt") > 60, `sharp: ${splits("talus")}, ${splits("basalt")}`);
        assert.ok(splits("corestone") < splits("talus") / 2, `worn round: ${splits("corestone")}`);

        for (let k = 0; k < 6; k++) {
            const slab = rockLook(randomOf(400 + k), { family: "slab", detail: 3 });
            const ys = pointsOf(slab).map((p) => p[1]);
            const xs = pointsOf(slab).map((p) => Math.hypot(p[0], p[2]));

            assert.ok(Math.max(...ys) - Math.min(...ys) < Math.max(...xs) * 2 * 0.75, "a slab: flat");
        }

        // (Each land its stone's, every land one)
        assert.deepEqual(Object.keys(LAND_ROCKS).sort(), Object.keys(LOOKS).sort());
        assert.equal(familyOf("mountain"), "talus");
        assert.equal(familyOf("nowhere"), "corestone");
    });

    it("are darker at their foot and in their hollows, lighter on their worn edges, their lichen in colonies a few corners wide", () => {
        for (const family of ["corestone", "talus", "block"]) {
            const look = rockLook(randomOf(77), { family, detail: 3, layer: "rock-pale" });
            const brightness = (i) => look.color[i * 3] + look.color[i * 3 + 1] + look.color[i * 3 + 2];
            const points = pointsOf(look);
            const foot = points.flatMap((p, i) => (p[1] < look.ground + 0.03 ? [brightness(i)] : []));
            const top = points.flatMap((p, i) => (p[1] > look.top * 0.8 ? [brightness(i)] : []));
            const edges = points.flatMap((p, i) => (look.data[i * 4 + 3] < -0.6 ? [brightness(i)] : []));
            const flat = points.flatMap((p, i) => (Math.abs(look.data[i * 4 + 3]) < 0.1 && p[1] > look.ground + 0.1 ? [brightness(i)] : []));

            assert.ok(mean(foot) < mean(top) * 0.85, `${family}: its foot ${mean(foot)}, its top ${mean(top)}`);

            if (edges.length && flat.length) {
                assert.ok(mean(edges) > mean(flat), `${family}: its worn edges ${mean(edges)}, ${mean(flat)}`);
            }

            // (Its lichen: corners in colonies, most of each more than one corner)
            const lichened = points.filter((_, i) => look.data[i * 4 + 2] > 0.5).length;

            assert.ok(lichened >= 3, `${family}: ${lichened} corners lichened`);
            assert.ok([...look.lichen].every((kind) => kind < LICHEN_KINDS.length));
        }

        assert.deepEqual(LICHEN_KINDS.map(({ colour }) => colour), ROCKS_HIGH.kinds, "the same lichens as High paints");
    });

    it("pile into one look where they touch, hiding each other's sky", () => {
        const members = [0, 1].map((k) => ({ family: "corestone", detail: 2, layer: "rock", at: [k * 0.42, 0, 0], scale: [0.5, 0.5, 0.5] }));
        const pile = pileLook(randomOf(5), members);
        const alone = rockLook(randomOf(9), { family: "corestone", detail: 2, layer: "rock" });
        const points = pointsOf(pile);

        // (Where they meet, between them, less of the sky seen than a rock on its own sees)
        const between = points.flatMap((p, i) => (Math.abs(p[0] - 0.21) < 0.08 && p[1] > 0.05 ? [pile.data[i * 4 + 1]] : []));

        assert.ok(between.length > 0);
        assert.ok(mean(between) < mean(Array.from({ length: alone.count }, (_, i) => alone.data[i * 4 + 1])) - 0.1, `${mean(between)}`);
        assert.ok(lookBytes(pile) > lookBytes(alone), "both of them");
    });

    it("are made quickly enough to make a few a frame, near and far", () => {
        quickEnough(14, () => {
            const start = performance.now();

            for (const family of FAMILIES) {
                rockLook(randomOf(11), { family, detail: 3 });
            }

            return (performance.now() - start) / FAMILIES.length;
        });
        quickEnough(4, () => {
            const start = performance.now();

            for (const family of FAMILIES) {
                rockLook(randomOf(12), { family, detail: 1 });
            }

            return (performance.now() - start) / FAMILIES.length;
        });
    });
});

describe("rocks placed (rocks.js StoneMesher)", () => {
    const look = rockLook(randomOf(3), { family: "corestone", detail: 3, layer: "rock" });

    it("share their corners, packed small: normals in bytes, colours, texture coordinates and layers in half floats", () => {
        const stones = new StoneMesher(8);

        stones.place(look, { at: [0, 0, 0], perMetre: () => 0.4 });
        stones.place(look, { at: [3, 0, 0], turn: 1, scale: [2, 1.5, 2] });

        const geometry = stones.geometry();

        assert.equal(geometry.attributes.position.count, look.count * 2);
        assert.equal(geometry.index.count, look.index.length * 2);
        assert.ok(geometry.index.array instanceof Uint16Array);
        assert.ok(geometry.attributes.normal.array instanceof Int8Array && geometry.attributes.normal.normalized);
        assert.ok(geometry.attributes.color.array instanceof Uint16Array && geometry.attributes.color.itemSize === 3, "three a corner: the cliffs' material's program");
        assert.ok(Math.abs(geometry.attributes.uv.getX(0) - 0.4) < 1e-3, "its picture's copies to a metre");
        assert.equal(geometry.attributes.rock, undefined, "only for High");
        assert.ok(stones.geometry({ crisp: true }).attributes.rock);
    });

    it("wear moss on their tops and snow, take the ground's colour at their foot, and leave their lichen to High's material when it paints it", () => {
        const colourOf = (growth, options = {}) => {
            const stones = new StoneMesher();

            stones.place(look, { at: [0, 0, 0], growth, groundAt: () => 0.05, ...options });

            return stones.arrays;
        };
        const bare = colourOf({});
        const mossy = colourOf({ moss: 1 });
        const snowy = colourOf({ snow: 1 });
        const grounded = colourOf({}, { ground: [2, 2, 2] });
        const tops = pointsOf(look).flatMap((p, i) => (look.normal[i * 3 + 1] > 0.8 ? [i] : []));
        const feet = pointsOf(look).flatMap((p, i) => (p[1] < 0.1 ? [i] : []));
        const green = (arrays, i) => arrays.color[i * 3 + 1] / (arrays.color[i * 3] + 1e-6);

        assert.ok(tops.length && feet.length);
        assert.ok(mean(tops.map((i) => green(mossy, i))) > mean(tops.map((i) => green(bare, i))) * 1.3, "moss on its top");
        assert.ok(mean(tops.map((i) => snowy.color[i * 3 + 2])) > 1.5, "white with snow, brighter than any look's colour");
        assert.ok(mean(feet.map((i) => grounded.color[i * 3])) > mean(feet.map((i) => bare.color[i * 3])), "the ground's colour at its foot");

        // (Its lichen painted on Medium; on High left to the material, how much there is told it)
        const lichened = colourOf({ lichen: 1 });
        const crisp = colourOf({ lichen: 1 }, { crisp: true });

        assert.ok(lichened.color.some((v, k) => Math.abs(v - bare.color[k]) > 0.02));
        assert.ok(crisp.color.every((v, k) => Math.abs(v - bare.color[k]) < 1e-6));
        assert.ok(crisp.rock.some((v, k) => k % 4 === 2 && v > 100), "how much lichen, for the material");
    });
});

describe("the wilds' rocks (kits/wilds.js)", () => {
    let world;
    let overworld;
    let stony;

    before(() => {
        world = buildWorld({ seed: 3 });
        overworld = world.maps.town;
        stony = [];

        for (let cy = 10; cy < 118 && stony.length < 6; cy += 5) {
            for (let cx = 10; cx < 118 && stony.length < 6; cx += 5) {
                const chunk = overworld.chunk(cx, cy);

                if (chunk.features.filter(({ kind }) => STONY.includes(kind)).length >= 3) {
                    stony.push(chunk);
                }
            }
        }
    });

    const landAt = (x, y) => overworld.biomeAt(x, y);

    it("are drawn on Low with the rest of a chunk's features, coarsely; on Medium and High in a mesh of their own, finer near, with the cliffs' material or High's", () => {
        assert.ok(stony.length >= 3, `${stony.length} stony chunks`);

        for (const chunk of stony) {
            const groundAt = (x, z) => overworld.heightAt(x, z);
            const make = (rocks) => {
                allAtOnce(featureLooks(chunk.features, landAt, { rocks }));

                return featureMesh(chunk.features, landAt, [chunk.x0, chunk.y0], groundAt, { rocks });
            };
            const low = make(ROCK_TIERS.low);
            const medium = make(ROCK_TIERS.medium);
            const near = make(ROCK_TIERS.near);
            const high = make(ROCK_TIERS.high);

            assert.equal(low.stones, null);
            assert.equal(low.mesh.material.name, "atlas");
            assert.ok(low.mesh.geometry.attributes.position.count > medium.mesh.geometry.attributes.position.count, "its rocks with the rest on Low only");
            assert.equal(medium.stones.material.name, "cliffs");
            assert.equal(high.stones.material.name, "rocks");
            assert.ok(high.stones.geometry.attributes.rock, "how worn, hollow and lichened, for High's material");
            assert.ok(near.stones.geometry.index.count > medium.stones.geometry.index.count * 2, `near ${near.stones.geometry.index.count / 3}, far ${medium.stones.geometry.index.count / 3}`);
            assert.deepEqual(medium.boxes, near.boxes, "as tall on its squares however finely drawn");
            assert.deepEqual(low.boxes, medium.boxes);
            assert.ok(near.stones.castShadow && near.stones.receiveShadow);
        }

        // (None, where there's nothing stony)
        assert.equal(stoneMesh([{ kind: "log", x: 10, y: 10, size: 6, height: 0.1, turn: 0, variant: 0.2, squares: [[10, 10]] }], landAt, [0, 0], () => 0), null);
    });

    it("lie on the ground as rock does: sunk as deep as their family, leaning with the slope, a bigger boulder with chips strewn round it", () => {
        const slope = (x, z) => x * 0.3;
        const boulder = { kind: "boulder", x: 20, y: 20, size: 1.2, height: 1.2, turn: 0, variant: 0.1, squares: [[20, 20]] };
        const land = landAt(20, 20);
        const level = stoneMesh([boulder], () => land, [0, 0], () => 0, { rocks: ROCK_TIERS.near });
        const leaning = stoneMesh([boulder], () => land, [0, 0], slope, { rocks: ROCK_TIERS.near });
        const own = stoneLookOf("boulder", land, Math.floor(0.1 * 8) % 8, true).stone;

        // (Chips round it: more corners than the boulder's own)
        assert.ok(level.geometry.attributes.position.count > own.count, "chips strewn round it");
        assert.ok(boulder.size >= CHIPS.size);

        // (Its lowest a little into the ground, as its family has it)
        level.geometry.computeBoundingBox();
        assert.ok(level.geometry.boundingBox.min.y < -0.1, "sunk into the ground");

        // (On a slope, its top leant downhill-over: its highest point further uphill than on the level)
        const highest = (mesh) => {
            const position = mesh.geometry.attributes.position;
            let best = 0;

            for (let i = 1; i < own.count; i++) {
                best = position.getY(i) - slope(position.getX(i), 0) > position.getY(best) - slope(position.getX(best), 0) ? i : best;
            }

            return position.getX(best);
        };

        assert.notEqual(highest(leaning), highest(level));
    });

    it("keep no more of their looks than LOOKS_KEPT has room for, the least lately wanted let go of", () => {
        for (const land of Object.keys(LOOKS)) {
            for (let index = 0; index < 8; index++) {
                for (const kind of STONY) {
                    stoneLookOf(kind, land, index, true);
                    stoneLookOf(kind, land, index, false);
                }

                lookGeometry("boulder", land, index).dispose();
            }
        }

        const { bytes, count } = keptLooks();

        assert.ok(bytes <= LOOKS_KEPT.bytes, `${bytes} bytes kept`);
        assert.ok(count > 50);
        assert.ok(stoneLookOf("boulder", "meadow", 0, true).stone.count > 0, "made again when wanted");
    });

    it("are made a chunk's at a time quickly enough", () => {
        const chunk = stony[0];

        quickEnough(400, () => {
            const start = performance.now();

            stoneMesh(chunk.features, landAt, [chunk.x0, chunk.y0], (x, z) => overworld.heightAt(x, z), { rocks: ROCK_TIERS.near });

            return performance.now() - start;
        });
    });
});

describe("the ground round the rocks (world/ground.js contactOf)", () => {
    it("darkens round every rock, as much as it stands tall, not only round what's taller than eyes", () => {
        const darkness = (amount) => {
            const { texture } = contactOf((x, y) => (x === 8 && y === 8 ? amount : 0), [0, 0, 16]);
            const across = Math.sqrt(texture.image.data.length);

            return texture.image.data[(8 + 7) * across + 8 + 7];
        };

        assert.ok(darkness(1) > darkness(0.5) && darkness(0.5) > darkness(0.2) && darkness(0.2) > 0);
        assert.equal(darkness(true), darkness(1), "what can't be seen through, as ever");
        assert.ok(ROCK_CONTACT.kinds.every((kind) => STONY.includes(kind)));
    });
});

describe("where the world lays its rocks (core/wilds.js ROCKFALL)", () => {
    const lay = (options) => {
        const features = [];

        for (let k = 0; k < 40; k++) {
            features.push(...featuresOf({ x0: k * 64, y0: 0, size: 64, seed: 3, random: createRandom(1000 + k), landAt: () => "mountain", free: () => true, ...options }));
        }

        return features;
    };
    const rocky = (features) => features.filter(({ kind }) => ["boulder", "outcrop", "cairn", "menhir"].includes(kind));

    it("has many more small rocks than big ones, their sizes falling off as an exponential does", () => {
        const boulders = lay({}).filter(({ kind }) => kind === "boulder");
        const [least, most] = FEATURES.boulder.size;
        const small = boulders.filter(({ size }) => size < least + (most - least) / 3).length;
        const big = boulders.filter(({ size }) => size > least + ((most - least) * 2) / 3).length;

        assert.ok(boulders.length > 40);
        assert.ok(small > big * 2, `${small} small, ${big} big`);
    });

    it("strews the talus below a cliff with more of them, smaller near its foot and bigger as they've rolled", () => {
        const plain = rocky(lay({}));
        const foot = rocky(lay({ cliffOff: () => 1 }));
        const out = rocky(lay({ cliffOff: () => ROCKFALL.talus - 1 }));

        assert.ok(foot.length > plain.length, `${foot.length} at a cliff's foot, ${plain.length} with none`);
        assert.ok(mean(out.filter(({ kind }) => kind === "boulder").map(({ size }) => size)) > mean(foot.filter(({ kind }) => kind === "boulder").map(({ size }) => size)), "bigger further out");
        assert.ok(rocky(lay({ steepAt: () => true })).length > plain.length, "rockier on steep ground");
    });
});

describe("the rest of what's stony, drawn as rock", () => {
    // (Whether a geometry's lit smooth: most of its triangles' corners lit each its own way)
    const smooth = (geometry) => {
        const normal = geometry.attributes.normal;
        const triangles = geometry.index ? geometry.index.count / 3 : normal.count / 3;
        const corner = (t, k) => (geometry.index ? geometry.index.getX(t * 3 + k) : t * 3 + k);
        let rounded = 0;

        for (let t = 0; t < triangles; t++) {
            const [a, b] = [corner(t, 0), corner(t, 1)];

            rounded += Math.abs(normal.getX(a) - normal.getX(b)) + Math.abs(normal.getY(a) - normal.getY(b)) + Math.abs(normal.getZ(a) - normal.getZ(b)) > 0.01 ? 1 : 0;
        }

        return rounded / triangles;
    };

    it("lies as rock does at the cliffs' feet and round the arches: freshly broken chips, lit smooth", () => {
        const mesher = new Mesher();

        chip(mesher, [0, 0, 0], 0.3, 0.42, { layer: LAYERS.indexOf("rock"), uvs: [[0.5, 0]], look: LOOKS.mountain });

        const geometry = mesher.geometry();

        assert.ok(smooth(geometry) > 0.5);
        assert.ok(geometry.attributes.uv.array.every((v, k) => (k % 2 ? v === 0 : v === 0.5)), "for the cliffs' material");
    });

    it("steps across the fords on cobbles the water's worn smooth, their tops where the stones' are", () => {
        const stones = [0, 1, 2].map((k) => ({ x: k, y: 0, radius: 0.28, top: 0.2, bottom: -0.3, rock: "rock", seed: k / 3 }));
        const mesh = fordsMesh({ stones, trunks: [] }, [0, 0]);

        mesh.geometry.computeBoundingBox();
        assert.ok(smooth(mesh.geometry) > 0.9);
        assert.ok(Math.abs(mesh.geometry.boundingBox.max.y - 0.2) < 0.02 && Math.abs(mesh.geometry.boundingBox.min.y + 0.3) < 0.02, `${mesh.geometry.boundingBox.min.y} to ${mesh.geometry.boundingBox.max.y}`);
    });

    it("heaps a rockslide with freshly broken rock, drawn as the rocks are, and lets it go with it", () => {
        const scene = new THREE.Scene();
        const props = new ObstacleProps(scene);

        props.set([{ id: "slide", kind: "rocks", x: 0, z: 0, width: 4, depth: 2 }], () => 0);

        const rocks = props.shown.get("slide").getObjectByName("rocks");

        assert.equal(rocks.material.name, "cliffs");
        assert.ok(smooth(rocks.geometry) > 0.5);
        props.set([], () => 0);
        assert.equal(props.shown.size, 0);
    });
});
