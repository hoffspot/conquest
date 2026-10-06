// The fingerposts by the towns' roads (client/js/core/signposts.js, core/overworld.js; drawn by
// world/art/kits/props.js; docs/WORLD.md): one by the main road out of each town, city and
// capital, outside every settlement's ground, beside the road, on squares it blocks; a board for
// each of the nearest three towns, cities and capitals, the nearest first, each with its name and
// how far it is, pointing straight at it; the same whichever order the world's made in
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

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

const { buildWorld } = await import("../client/js/core/overworld.js");
const { squareOf } = await import("../client/js/core/settlements.js");
const { BOARDS, boardsFor, byRank, SIGNED, signpostBeside, SIGNPOST } = await import("../client/js/core/signposts.js");
const { PROPS } = await import("../client/js/core/setpieces/pieces.js");
const { prop } = await import("../client/js/world/art/kits/props.js");

const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("the fingerposts by the towns' roads (signposts.js, overworld.js)", () => {
    let world;
    let posts;

    before(() => {
        world = buildWorld({ seed: 2 });

        // Every settlement laid out, and its fingerpost (if any) in the world's metres
        const { settlements } = world.maps.town;

        posts = world.plan.places
            .filter((place) => place !== world.start && settlements.places.includes(place))
            .map((place) => {
                const settlement = settlements.of(place);
                const found = settlement.town.pieces.filter(({ name }) => name === "signpost");

                return { place, found, at: found[0] && [found[0].x + settlement.at[0], found[0].y + settlement.at[1]] };
            });

        const home = world.town.pieces.filter(({ name }) => name === "signpost");

        posts.push({ place: world.start, found: home, at: home[0] && [home[0].x + world.origin[0], home[0].y + world.origin[1]] });
    });

    it("stands one by each town, city and capital, and none by a village or smaller", () => {
        for (const { place, found } of posts) {
            assert.equal(found.length, SIGNED.includes(place.kind) ? 1 : 0, `${place.id}: ${found.length}`);
        }

        assert.ok(posts.filter(({ found }) => found.length).length > 40);
        assert.deepEqual(SIGNED, ["town", "city", "capital"]);
    });

    it("stands outside every settlement's ground, beside a road out of its town, on squares it blocks, and walked round", () => {
        const map = world.maps.town;
        const boxes = world.plan.places.filter((place) => place !== world.start).map(squareOf);
        const stamp = world.stamp;

        for (const { place, at } of posts.filter(({ found }) => found.length)) {
            const [x, y] = at;
            const squares = [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]];

            assert.ok(Number.isInteger(x) && Number.isInteger(y), "(on a corner of four squares)");

            for (const [i, j] of squares) {
                assert.ok(boxes.every(({ at: [bx, by], size }) => i < bx || j < by || i >= bx + size || j >= by + size), `${place.id}: in a settlement`);
                assert.ok(i < stamp.at[0] || j < stamp.at[1] || i >= stamp.at[0] + stamp.width || j >= stamp.at[1] + stamp.height, `${place.id}: in the town`);
                assert.equal(map.squares.blocked(i, j), true, `${place.id}: ${i}, ${j} blocked`);
                assert.equal(map.landAt(i, j).road, null, `${place.id}: on a road`);
            }

            // (Beside a road: off its side, near enough to read from it)
            const beside = [];

            for (let j = y - 9; j <= y + 9; j++) {
                for (let i = x - 9; i <= x + 9; i++) {
                    if (Math.hypot(i + 0.5 - x, j + 0.5 - y) <= 9 && map.landAt(i, j).road) {
                        beside.push([i, j]);
                    }
                }
            }

            assert.ok(beside.length > 5, `${place.id}: no road beside it`);

            // (The navigation mesh walks round its foot, as it's drawn)
            assert.ok(map.standingNear(x - 2, y - 2, x + 2, y + 2).some((corners) => corners.every(([cx, cy]) => apart([cx, cy], [x, y]) < 0.5)), `${place.id}: walked round`);
        }
    });

    it("has a board for each of the nearest three towns, cities and capitals, the nearest first, saying how far, pointing straight at it", () => {
        for (const { place, found, at } of posts.filter(({ found }) => found.length)) {
            const { boards } = found[0];
            const nearest = world.plan.places
                .filter((other) => other !== place && SIGNED.includes(other.kind))
                .sort((a, b) => apart(a.at, at) - apart(b.at, at))
                .slice(0, BOARDS);

            assert.equal(boards.length, BOARDS);
            assert.deepEqual(boards.map(({ name }) => name), nearest.map(({ name }) => name));

            for (const [k, board] of boards.entries()) {
                const other = nearest[k];

                assert.equal(board.km, Math.round(apart(other.at, at) / 100) / 10);
                assert.ok(Math.abs(Math.cos(board.angle) - (other.at[0] - at[0]) / apart(other.at, at)) < 1e-9);
                assert.ok(Math.abs(Math.sin(board.angle) - (other.at[1] - at[1]) / apart(other.at, at)) < 1e-9);
                assert.ok(k === 0 || board.km >= boards[k - 1].km);
            }
        }

        assert.deepEqual(boardsFor(world.plan, world.start, posts.at(-1).at), posts.at(-1).found[0].boards);
    });

    it("is the same whichever order the settlements are laid out in", () => {
        const again = buildWorld({ seed: 2 });
        const { settlements } = again.maps.town;
        const places = [...settlements.places].reverse();

        for (const place of places) {
            settlements.of(place);
        }

        for (const { place, found } of posts.filter(({ place }) => place !== world.start)) {
            assert.deepEqual(settlements.of(place).town.pieces.filter(({ name }) => name === "signpost"), found, place.id);
        }

        assert.deepEqual(again.town.pieces.filter(({ name }) => name === "signpost"), posts.at(-1).found);
    });

    it("stands by the main road, past the edge of its town's ground, the right of it going out first", () => {
        // (Along a road east from x = 0: 6 m along, to its right, which is south: y down)
        const road = { kind: "road", points: [[0, 0], [100, 0]] };
        const anywhere = () => true;

        assert.deepEqual(signpostBeside(road.points, 2, anywhere).at, [SIGNPOST.past[0], Math.round(2 + SIGNPOST.aside[0] + 1)]);

        // (No room there: its left; then further along)
        const left = signpostBeside(road.points, 2, (i, j) => j < 0);

        assert.deepEqual(left.at, [SIGNPOST.past[0], -Math.round(2 + SIGNPOST.aside[0] + 1)]);
        assert.ok(signpostBeside(road.points, 2, (i) => i > 20).at[0] > 20);
        assert.equal(signpostBeside(road.points, 2, () => false), null);

        // (The biggest road out first)
        assert.deepEqual(byRank([{ kind: "track" }, { kind: "road" }, { kind: "trade" }, { kind: "road", second: true }]).map(({ kind }) => kind), ["trade", "road", "road", "track"]);
    });
});

describe("a fingerpost as it's drawn (world/art/kits/props.js signpost)", () => {
    it("is a post with a board for each town, higher than anyone's head, each pointing its own way, painted on both faces", () => {
        const boards = [
            { name: "Ashby", km: 0.6, angle: -2.4 },
            { name: "Oakford", km: 1.4, angle: 0.5 },
            { name: "Gorgash", km: 2.3, angle: Math.PI / 2 },
        ];
        const object = prop({ kind: "prop", name: "signpost", w: 1, h: 1, x: 0, y: 0, facing: 0, boards });
        const meshes = [];

        object.traverse((node) => node.isMesh && meshes.push(node));

        // Each board: both faces, each its own picture (the town's name, how far, and which side
        // it's seen from); its far end pointing the way it says, from the post's middle (10, 10 in
        // the art's pixels)
        for (const { name, km, angle } of boards) {
            const faces = meshes.filter(({ material }) => material.name === `finger ${name}` || material.name === `finger ${name} back`);

            assert.equal(faces.length, 2, name);
            assert.deepEqual(faces.map(({ material }) => material.map.userData.sign).sort(), [`finger|${name}|${km}|left`, `finger|${name}|${km}|right`]);

            for (const { geometry } of faces) {
                const position = geometry.attributes.position;
                let far = null;

                for (let k = 0; k < position.count; k++) {
                    const [x, y, z] = [position.getX(k) - 10, position.getY(k), position.getZ(k) - 10];

                    assert.ok(y / 5 > 1.75, `${name}: over anyone's head`);

                    if (!far || Math.hypot(x, z) > Math.hypot(far[0], far[1])) {
                        far = [x, z];
                    }
                }

                const long = Math.hypot(...far);

                assert.ok(Math.abs(far[0] / long - Math.cos(angle)) < 0.02 && Math.abs(far[1] / long - Math.sin(angle)) < 0.02, `${name} points ${Math.atan2(far[1], far[0])}, not ${angle}`);
            }
        }

        assert.deepEqual(PROPS.signpost, [1, 1]);
    });
});
