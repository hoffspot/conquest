// The world outside drawn round the player (client/js/world/chunks3d.js): each chunk drawn, its
// undergrowth grown and its settlements' buildings built a step at a time within each frame's
// budget, so walking never stalls a frame; and the settlements a little further off laid out
// ahead, off the page's thread (layouts.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
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

const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { Chunks, DETAIL_NEAR, REACH } = await import("../client/js/world/chunks3d.js");
const { BUILDERS, merge, PIXEL, placed } = await import("../client/js/world/town3d.js");
const { builderFor } = await import("../client/js/world/art/peoples/index.js");
const THREE = await import("three");
const { AHEAD, Layouts } = await import("../client/js/world/layouts.js");
const { splatOf, splatting } = await import("../client/js/world/ground.js");
const { sowing, undergrowthMesh, undergrowthOf } = await import("../client/js/world/art/kits/wilds.js");

let world;

describe("the world outside, drawn round the player (chunks3d.js)", () => {
    before(() => {
        world = buildWorld({ seed: 1 });
    });

    it("draws a chunk a step at a time, hidden until it's all drawn, and begins no more than one a frame", () => {
        const chunks = new Chunks(world, { undergrowth: 0 });
        const [x, z] = world.spawns.player.map((v) => v + 0.5);
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

        // (No time at all: a step a frame)
        chunks.update(x, z, { budget: 0 });

        const [first] = chunks.drawn.values();

        assert.equal(chunks.drawn.size, 1);
        assert.deepEqual([first.cx, first.cy], [cx, cy], "the player's own chunk first");
        assert.ok(first.drawing && !first.object.visible);
        assert.ok(chunks.busy);

        let frames = 1;

        while (first.drawing) {
            chunks.update(x, z, { budget: 0 });
            frames++;
            assert.equal(chunks.drawn.size, 1, "the next begun only once this one's drawn");
        }

        assert.ok(frames > 3, `${frames} frames`);
        assert.ok(first.object.visible && first.lot);
        assert.ok(first.object.children.some(({ name }) => name === "ground"));

        // (Then the rest, nearest first, each whole in the end, and their settlements' buildings)
        while (chunks.busy) {
            chunks.update(x, z);
        }

        assert.equal(chunks.drawn.size, (2 * REACH.drawn + 1) ** 2);
        assert.ok([...chunks.drawn.values()].every(({ drawing, object }) => !drawing && object.visible));
        chunks.dispose();
    });

    it("throws a chunk away half drawn if the player's gone, and draws at once what it's asked to fill", () => {
        const chunks = new Chunks(world, { undergrowth: 0 });
        const [x, z] = world.spawns.player.map((v) => v + 0.5);

        chunks.update(x, z, { budget: 0 });
        chunks.update(x, z, { budget: 0 });

        const half = [...chunks.drawn.values()][0];

        assert.ok(half.drawing);

        // (Far off: it's let go, nothing of it left)
        const far = x + CHUNK * (REACH.kept + 2);

        chunks.update(far, z, { budget: 0 });
        assert.ok(![...chunks.drawn.values()].includes(half));
        assert.equal(half.object.parent, null);

        // (Filled: every chunk near at once, the one being drawn finished first)
        chunks.fill(far, z, 1);

        const near = [...chunks.drawn.values()];

        assert.equal(near.length, 9);
        assert.ok(near.every(({ drawing, object }) => !drawing && object.visible));
        assert.equal(chunks.drawing, null);
        chunks.dispose();
    });

    it("builds a settlement's buildings a piece at a time, each made ready to merge in a step of its own, merged the same as all at once", async () => {
        const chunks = new Chunks(world, { undergrowth: 0 });
        const place = world.maps.town.settlements.places.find(({ kind, id }) => kind === "village" && id !== world.start.id);
        const [x, z] = place.at;

        chunks.fill(x, z, 0);

        const drawn = [...chunks.drawn.values()][0];
        const pieces = drawn.job.pieces;
        let [frames, between] = [0, 0];

        // (Between frames, the page's events: a sign's lettering waits for its font)
        while (drawn.job && frames < 5000) {
            chunks.update(x, z, { budget: 1 });
            frames++;

            // (A piece built, its meshes not yet made ready: that's a step of its own)
            between += drawn.job?.built ? 1 : 0;
            await new Promise((resolve) => setImmediate(resolve));
        }

        assert.equal(drawn.job, null);

        assert.ok(pieces.length > 2 && frames > 1, `${frames} frames for ${pieces.length} pieces`);
        assert.ok(between > 0);

        const group = new THREE.Group();

        group.scale.setScalar(PIXEL);

        for (const piece of pieces) {
            const build = builderFor(piece) ?? BUILDERS[piece.kind];

            if (build) {
                group.add(placed(await build(piece), piece));
            }
        }

        group.updateMatrixWorld(true);

        const arrays = (meshes) => meshes.map(({ material, geometry }) => [material.name, ...Object.entries(geometry.attributes).map(([name, { array }]) => `${name}:${[...array].join()}`)].join("|"));

        assert.deepEqual(arrays(drawn.object.getObjectByName("buildings").children), arrays(merge(group, { atlas: true }).children));

        // Drawn whole while the player's near, and from further off without what's only worth
        // drawing near (a timber's sides): those corners last, left undrawn (DETAIL_NEAR)
        const atlas = drawn.object.getObjectByName("buildings").children.find(({ material }) => material.name === "atlas");
        const corners = atlas.geometry.attributes.position.count;
        const drawing = () => Math.min(atlas.geometry.drawRange.count, corners);

        assert.equal(drawing(), corners);
        assert.ok(atlas.userData.far > corners * 0.4 && atlas.userData.far < corners * 0.9, `${atlas.userData.far} of ${corners}`);

        chunks.update(x + DETAIL_NEAR + CHUNK, z, { budget: 0 });
        assert.equal(drawing(), atlas.userData.far);

        chunks.update(x, z, { budget: 0 });
        assert.equal(drawing(), corners);
        chunks.dispose();
    });

    it("grows the undergrowth over several frames, the same as all at once", () => {
        const chunks = new Chunks(world, { undergrowth: 1 });
        const [x, z] = world.spawns.player.map((v) => v + 0.5);

        chunks.fill(x, z);

        const drawn = [...chunks.drawn.values()].find(({ cx, cy }) => cx === Math.floor(x / CHUNK) && cy === Math.floor(z / CHUNK));
        let frames = 0;

        while (!drawn.undergrowth) {
            chunks.update(x, z, { budget: 1 });
            frames++;
        }

        const chunk = world.maps.town.chunk(drawn.cx, drawn.cy);
        const whole = undergrowthMesh(undergrowthOf(world.maps.town, chunk), [chunk.x0, chunk.y0]).children;
        const count = (meshes) => meshes.reduce((sum, { geometry }) => sum + geometry.attributes.position.count, 0);

        assert.ok(frames > 2, `${frames} frames`);
        assert.ok(drawn.undergrowth.length >= 1 && drawn.undergrowth.every((mesh) => mesh.parent === drawn.object));
        assert.equal(drawn.undergrowth.length, whole.length);
        assert.equal(count(drawn.undergrowth), count(whole));
        chunks.dispose();
    });

    it("makes the ground's splat and the undergrowth's places the same a step at a time as all at once", () => {
        const overworld = world.maps.town;
        const [cx, cy] = world.spawns.player.map((v) => Math.floor(v / CHUNK));
        const chunk = overworld.chunk(cx, cy);
        const area = [chunk.x0 - 1, chunk.y0 - 1, CHUNK + 2, CHUNK + 2];
        const kindAt = (x, y) => overworld.squares.ground(x, y);
        const count = (steps) => {
            let n = 0;
            let step = steps.next();

            while (!step.done) {
                n++;
                step = steps.next();
            }

            return [n, step.value];
        };
        const [splatSteps, splat] = count(splatting(kindAt, area));
        const [sowSteps, items] = count(sowing(overworld, chunk));

        assert.ok(splatSteps > 4 && sowSteps > 4, `${splatSteps}, ${sowSteps} steps`);
        assert.deepEqual(splat.data, splatOf(kindAt, area).data);
        assert.deepEqual(items, undergrowthOf(overworld, chunk));
    });
});

describe("the settlements ahead of the player, laid out off the page's thread (layouts.js)", () => {
    // A worker that lays out as the game's (layout-worker.js) does, a message at a time when told
    class FakeWorker {
        static made = [];

        constructor() {
            this.posted = [];
            FakeWorker.made.push(this);
        }

        postMessage(message) {
            this.posted.push(message);
        }

        async reply() {
            const { layoutTown } = await import("../client/js/core/setpieces/town.js");

            for (const { id, spec } of this.posted.splice(0)) {
                this.onmessage({ data: { id, spec, town: layoutTown(spec) } });
            }
        }

        terminate() {
            this.terminated = true;
        }
    }

    it("asks for the settlements near, nearest first and once each, and gives the world each as it's laid out", async () => {
        const fresh = buildWorld({ seed: 1 });
        const { settlements } = fresh.maps.town;
        const place = settlements.places.find((each) => each.kind === "town");
        const [cx, cy] = place.at.map((v) => Math.floor(v / CHUNK));

        globalThis.Worker = FakeWorker;

        try {
            const layouts = new Layouts(settlements);
            const [worker] = FakeWorker.made.splice(0);

            layouts.ahead(cx, cy);

            const asked = worker.posted.map(({ id }) => id);

            assert.ok(asked.includes(place.id));
            assert.equal(new Set(asked).size, asked.length);
            assert.equal(asked[0], settlements.near(cx, cy)[0].id, "the nearest first");
            assert.ok(asked.every((id) => {
                const { at } = settlements.places.find((each) => each.id === id);

                return Math.abs(Math.floor(at[0] / CHUNK) - cx) <= AHEAD + 2 && Math.abs(Math.floor(at[1] / CHUNK) - cy) <= AHEAD + 2;
            }));

            // (Asked again from nearby: none twice)
            layouts.ahead(cx + 1, cy);
            assert.ok(worker.posted.slice(asked.length).every(({ id }) => !asked.includes(id)));

            await worker.reply();

            const given = settlements.given.get(place.id).town;
            const laid = settlements.of(place);

            assert.equal(laid.town, given, "taken as it was laid out");
            assert.ok(!settlements.given.has(place.id));

            layouts.dispose();
            assert.ok(worker.terminated);
        } finally {
            delete globalThis.Worker;
        }
    });

    it("lays a place out the same in another thread, and only takes one laid out from what it is", async () => {
        const { Worker } = await import("node:worker_threads");
        const { layoutTown } = await import("../client/js/core/setpieces/town.js");
        const { settlements } = world.maps.town;
        const place = settlements.places.find((each) => each.kind === "city" && !settlements.laid.has(each.id));
        const spec = settlements.specOf(place);
        const town = new URL("../client/js/core/setpieces/town.js", import.meta.url).href;
        const code = `import { parentPort, workerData } from "node:worker_threads"; import { layoutTown } from ${JSON.stringify(town)}; parentPort.postMessage(layoutTown(workerData));`;
        const elsewhere = await new Promise((resolve, reject) => {
            const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(code)}`), { workerData: spec });

            worker.once("message", (message) => {
                worker.terminate();
                resolve(message);
            });
            worker.once("error", reject);
        });

        assert.deepEqual(elsewhere, layoutTown(spec));

        // (One laid out from something else isn't taken: laid out here instead)
        settlements.give(place, { ...spec, exits: [] }, elsewhere);

        const laid = settlements.of(place);

        assert.notEqual(laid.town, elsewhere);
        assert.equal(JSON.stringify(laid.town.pieces), JSON.stringify(elsewhere.pieces));
    });
});
