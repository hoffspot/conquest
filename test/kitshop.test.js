// The specialists' and the masters' shops built of the house kit (art/kits/kitshop.js): each in a
// look of its own, the same on every lot, its door on the game's entrance, its name board over the
// door and its sign hung from its corner post clear of everything else on its front and of the lots
// either side; what it sells set out under its awnings; each people's shops their own, the humans'
// of the kit
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (Textured materials and signs paint a canvas: enough of one for them to in Node)
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
const { entranceOf, entranceSpecOf, ENTRANCES, SHOP_DOORS } = await import("../client/js/core/insides.js");
const { layoutTown } = await import("../client/js/core/setpieces/town.js");
const { MASTER_SHOPS, PLOT, SHOP_LANDMARKS, SPECIALISTS } = await import("../client/js/core/setpieces/pieces.js");
const { MATERIALS, TINTS } = await import("../client/js/world/art/engine/materials.js");
const { Solid } = await import("../client/js/world/art/engine/solid.js");
const { STYLES } = await import("../client/js/world/art/kits/house.js");
const { HOLES, KIT, ROOFS, WINDOWS } = await import("../client/js/world/art/kits/kithouse.js");
const { AWNING, centredRun, kitShop, kitShopBuilt, kitShopPlan, SHOP_FRONT, SHOP_LOOKS, shopLookOf } = await import("../client/js/world/art/kits/kitshop.js");
const { dressShop } = await import("../client/js/world/art/kits/shopfront.js");
const { AWNINGS, LOOKS, SHOP_AWNINGS } = await import("../client/js/world/cloth.js");

const P = 5;
const EPSILON = 1e-6;

// The lots a shop's made over from: every house's size of a village's, a town's, a city's and a
// capital's (setpieces/town.js SETTLEMENT_KINDS' widths and depths: 6 to 11 m, 6.5 to 13 m)
const LOTS = [];

for (let w = 1.5; w <= 2.75 + EPSILON; w += 0.25) {
    for (let h = 1.625; h <= 3.25 + EPSILON; h += 0.125) {
        LOTS.push([w, h]);
    }
}

const shopOn = (name, [w, h], more = {}) => ({ kind: "landmark", key: `landmark-${name}`, name, w, h, x: 40 + w * 2, y: 30 + h * 2, facing: 0, ...more });

// Whether two boxes ([x0, x1, y0, y1, z0, z1]) overlap
const overlap = (a, b) => a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3] && a[4] < b[5] && b[4] < a[5];

// Points spread over a face (its corners, metres), a fan of triangles each sampled on a grid
function pointsOn(points, step = 0.05) {
    const out = [];

    for (let k = 1; k < points.length - 1; k++) {
        const [a, b, c] = [points[0], points[k], points[k + 1]];
        const size = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
        const n = Math.max(2, Math.ceil(size / step));

        for (let i = 0; i <= n; i++) {
            for (let j = 0; j <= n - i; j++) {
                const [u, v] = [i / n, j / n];

                out.push([0, 1, 2].map((d) => a[d] + (b[d] - a[d]) * u + (c[d] - a[d]) * v));
            }
        }
    }

    return out;
}

const inside = (box, [x, y, z], grow = 0) => x > box[0] - grow && x < box[1] + grow && y > box[2] - grow && y < box[3] + grow && z > box[4] - grow && z < box[5] + grow;

// An awning as it's hung (kithouses3d.js), its billow and valance: a box
function awningBox({ at: [x, z], width, y }) {
    return [x - width / 2 + 0.1 - 0.07, x + width / 2 - 0.1 + 0.07, y - AWNING.fall - AWNING.skirt - 0.07, y + 0.07, z + AWNING.back, z + AWNING.back + AWNING.depth + 0.07];
}

// The kit's front windows on a storey: their pieces' boxes ([x0, x1, y0, y1])
function windowsOf(built, s) {
    const [y0, y1] = [KIT.plinth + s * KIT.storey, KIT.plinth + (s + 1) * KIT.storey];
    const front = built.main[3] - built.jetty * (built.storeys - 1 - s);

    return built.pieces
        .filter(({ piece, at: [, y, z], turn }) => piece.startsWith("Window_Opaque_") && turn === 0 && y >= y0 - EPSILON && y < y1 && Math.abs(z - front) < 0.01)
        .map(({ piece, at: [x, y] }) => {
            const [wx0, wx1, wy0, wy1] = WINDOWS[piece.slice("Window_Opaque_".length)];

            return [x + wx0, x + wx1, y + wy0, y + wy1];
        });
}

describe("a shop of the house kit's look (art/kits/kitshop.js)", () => {
    it("has a look of its own for every shop of the humans', and none yet for any other people's: theirs their own kits'", () => {
        assert.deepEqual(Object.keys(SHOP_LOOKS), ["human"]);
        assert.deepEqual(Object.keys(SHOP_LOOKS.human).sort(), [...SHOP_LANDMARKS].sort());

        for (const name of SHOP_LANDMARKS) {
            assert.ok(kitShopBuilt(shopOn(name, [2, 2.5])), name);
            assert.equal(shopLookOf(shopOn(name, [2, 2.5])), SHOP_LOOKS.human[name]);

            for (const people of ["elf", "darkElf", "cat", "lizard", "orc"]) {
                assert.equal(shopLookOf(shopOn(name, [2, 2.5], { people })), null, `${people} ${name}`);
                assert.ok(!kitShopBuilt(shopOn(name, [2, 2.5], { people })), `${people} ${name}`);
            }
        }

        assert.ok(!kitShopBuilt({ kind: "landmark", name: "tavern", w: 3, h: 3, x: 0, y: 0 }));
        assert.ok(!kitShopBuilt({ kind: "house", name: "swordsmith", w: 2, h: 2, x: 0, y: 0 }));
    });

    it("is told from any house and any other shop by its walls and its awning, of colours no house has", () => {
        const houses = new Set(Object.values(STYLES).flatMap(({ walls }) => walls));
        const trades = Object.entries(SHOP_LOOKS.human).filter(([name]) => !MASTER_SHOPS.includes(name) || name === "emporium");
        const walls = trades.map(([, look]) => look.walls);
        const awnings = trades.map(([, look]) => look.awning);

        assert.equal(new Set(walls).size, walls.length, "each trade its own walls");
        assert.equal(new Set(awnings).size, awnings.length, "each trade its own awning");

        for (const [name, look] of Object.entries(SHOP_LOOKS.human)) {
            assert.ok(!houses.has(look.walls), `${name}: no house's walls`);
            assert.ok(TINTS[look.walls] || MATERIALS[look.walls], `${name}: ${look.walls} drawn`);
            assert.ok(SHOP_AWNINGS[look.awning] && !AWNINGS[look.awning] && LOOKS.includes(look.awning), `${name}: its own awning`);
            assert.ok(ROOFS[look.roof], `${name}: ${look.roof}`);
        }

        // (A master's shop its trade's look, grander: more storeys, banners, a finial or a gable)
        for (const [master, trade] of [["masterSwordsmith", "swordsmith"], ["masterArmorer", "armorer"]]) {
            const [a, b] = [SHOP_LOOKS.human[master], SHOP_LOOKS.human[trade]];

            assert.deepEqual([a.walls, a.roof, a.kind, a.style, a.awning, a.stone], [b.walls, b.roof, b.kind, b.style, b.awning, b.stone], master);
            assert.ok(a.storeys > b.storeys && (a.finial || a.cross), master);
        }
    });

    it("is built the same on every lot: its storeys, walls, roof, fill and stripes, wherever it stands", () => {
        for (const name of SHOP_LANDMARKS) {
            const look = SHOP_LOOKS.human[name];
            const seen = new Set();

            for (const lot of LOTS) {
                const { built, plan } = kitShop(shopOn(name, lot));

                assert.equal(built.storeys, look.storeys, `${name} ${lot}`);
                assert.equal(built.look.plaster, look.walls);
                assert.equal(built.look.roof, look.roof);
                assert.equal(built.look.fill, look.style === "brick" ? "Brick" : "Stone");
                assert.equal(built.look.stone, look.stone);
                assert.ok(built.extras.awnings.every((awning) => awning.look === look.awning), `${name} ${lot}: its awnings`);
                assert.equal(built.jetty, look.jetty);
                assert.equal(plan.wing, false);
                seen.add(built.kind === "gable" && look.kind === "half-hip" ? "half-hip" : built.kind);

                // (Its timbers' figure its own, every module of it)
                for (const { piece } of built.pieces.filter(({ look: kind }) => kind === "pattern")) {
                    const figure = piece.replace(/^WallPattern_(2m|1m)_(Roof[LR]_)?/, "");

                    assert.ok(["DoorCenter", "WindowHorizontal", "DiagonalLeft", "DiagonalRight", ...Object.values(look.braces)].includes(figure), `${name} ${lot}: ${piece}`);
                }
            }

            assert.deepEqual([...seen], [look.kind], name);
        }

        // (A scriptorium's gable to the street, wherever it's room for its span)
        for (const lot of LOTS) {
            assert.equal(kitShop(shopOn("scriptorium", lot)).built.ridge, "z", `${lot}`);
        }
    });
});

describe("a shop's door (art/kits/kitshop.js, core/insides.js SHOP_DOORS)", () => {
    it("is the kit's door in the middle of its front, its leaf where the game has the shop's door, as big as the glow round it is drawn", () => {
        const [hx0, hx1, , hy1] = HOLES["2m_DoorCenter"][0];

        assert.ok(Math.abs(SHOP_DOORS.human.width - (hx1 - hx0)) < 0.01);
        assert.ok(Math.abs(SHOP_DOORS.human.height - (KIT.sill + hy1)) < 0.01);
        assert.equal(SHOP_DOORS.human.floor, KIT.plinth);
        assert.equal(SHOP_DOORS.human.depth, ENTRANCES.swordsmith.depth);

        for (const name of SHOP_LANDMARKS) {
            assert.equal(entranceSpecOf(shopOn(name, [2, 2.5])), SHOP_DOORS.human);
            assert.equal(entranceOf(shopOn(name, [2, 2.5])).door.width, SHOP_DOORS.human.width);
            // (Any other people's as ever, till theirs are built of a kit)
            assert.equal(entranceSpecOf(shopOn(name, [2, 2.5], { people: "elf" })), ENTRANCES[name]);

            for (const lot of LOTS) {
                const piece = shopOn(name, lot);
                const shop = kitShop(piece);
                const { built } = shop;
                const [width, depth] = [lot[0] * PLOT, lot[1] * PLOT];
                // (Its front door: one at the back maybe too)
                const doors = built.pieces.filter(({ look, turn }) => look === "door" && turn === 0);
                const frame = doors.find(({ piece: kind }) => kind === "DoorFrame");
                const leaf = doors.find(({ piece: kind }) => kind !== "DoorFrame");

                assert.equal(doors.length, 2, `${name} ${lot}: one door`);
                assert.ok(Math.abs(frame.at[0] - width / 2) < EPSILON, `${name} ${lot}: in the middle`);
                // (A leaf hangs from its left, 0.98 m wide: kithouse.js DOOR)
                assert.ok(Math.abs(leaf.at[0] + 0.48 - width / 2) < EPSILON, `${name} ${lot}: its leaf in the middle`);
                assert.ok(Math.abs(frame.at[2] - (depth - SHOP_DOORS.human.depth)) < EPSILON, `${name} ${lot}: its leaf ${depth - frame.at[2]} m in`);
                assert.equal(frame.at[1], KIT.plinth);
                assert.ok(built.pieces.some(({ piece: kind, at: [x] }) => kind === "WallFrame_2m_DoorCenter" && Math.abs(x - width / 2) < EPSILON));
                // (Within its lot, its back wall clear of the lot's back)
                assert.ok(built.box[0] >= SHOP_FRONT.margin - EPSILON && built.box[1] <= width - SHOP_FRONT.margin + EPSILON, `${name} ${lot}: across`);
                assert.ok(built.box[2] >= SHOP_FRONT.back - EPSILON, `${name} ${lot}: its back`);
            }
        }
    });

    it("has its front laid out about its door: shop windows either side under their awnings, its name board's wall over it", () => {
        for (const length of [4, 4.4, 4.8, 6, 6.8, 8, 8.8, 9.6, 10]) {
            const run = centredRun(length);
            const middle = (run.length - 1) / 2;

            assert.ok(Math.abs(run.at(-1).at + run.at(-1).width - length) < EPSILON, `${length}`);
            assert.ok(run.every(({ at }, k) => k === 0 || Math.abs(run[k - 1].at + run[k - 1].width - at) < EPSILON));
            assert.equal(run[middle].width, 2);
            assert.ok(Math.abs(run[middle].at + 1 - length / 2) < EPSILON);
            assert.deepEqual(run.map(({ width }) => width), run.map(({ width }) => width).reverse(), `${length}: the same either side`);
        }

        for (const name of SHOP_LANDMARKS) {
            for (const lot of LOTS) {
                const plan = kitShopPlan(shopOn(name, lot));
                const [ground, first] = plan.front.kinds;
                const middle = (ground.length - 1) / 2;

                assert.equal(ground[middle], "door");
                assert.equal(first[middle], "board");
                assert.equal(ground.filter((kind) => kind === "door").length, 1);
                assert.ok(ground.filter((kind) => kind === "shop").length <= 2);
            }
        }
    });
});

describe("a shop's name board and sign (art/kits/kitshop.js)", () => {
    it("has its name over the door on the first floor's wall: in front of its frame, clear of the windows, the corners and the door", () => {
        for (const name of SHOP_LANDMARKS) {
            for (const lot of LOTS) {
                const shop = kitShop(shopOn(name, lot));
                const { board, built, door } = shop;
                const [gx0, gx1] = built.main;
                const inner = door.z + built.jetty;
                // (Its frame 0.12 m round it)
                const [x0, x1, y0, y1] = [board.x0 - 0.12, board.x1 + 0.12, board.y0 - 0.12, board.y1 + 0.12];

                assert.ok(Math.abs((board.x0 + board.x1) / 2 - door.x) < EPSILON, `${name} ${lot}: over the door`);
                assert.ok(board.x1 - board.x0 >= 2.4, `${name} ${lot}: ${board.x1 - board.x0} m wide`);
                // (Over the first floor's sill, under its windows)
                assert.ok(y0 > KIT.plinth + KIT.storey + KIT.sill + EPSILON, `${name} ${lot}: over the sill`);
                assert.ok(y0 > door.floor + door.height + 0.5, `${name} ${lot}: over the door`);

                for (const [wx0, wx1, wy0] of windowsOf(built, 1)) {
                    assert.ok(wx1 < x0 || wx0 > x1 || wy0 > y1 + 0.02, `${name} ${lot}: clear of the window at ${wx0}..${wx1}, ${wy0}`);
                }

                // (Clear of the corners' posts, 0.33 m out from the walls' inner faces)
                assert.ok(x0 > gx0 + 0.2 && x1 < gx1 - 0.2, `${name} ${lot}: clear of the corners`);
                // (Its back in front of the plaster, posts and braces; its face in front of the frame)
                assert.ok(board.z >= inner + 0.19 - EPSILON, `${name} ${lot}: in front of the plaster`);
                assert.ok(board.z + board.depth > inner + KIT.out + 0.05, `${name} ${lot}: in front of the frame`);
            }
        }
    });

    it("hangs its sign from the first floor's front corner post, out over the street, clear of the eaves and jetties over it, the awnings, banners and lanterns under it, its name board and the windows beside it", () => {
        for (const name of SHOP_LANDMARKS) {
            for (const lot of LOTS) {
                const shop = kitShop(shopOn(name, lot));
                const { board, built, door, goods, sign } = shop;
                const [gx0, gx1] = built.main;
                const first = KIT.plinth + KIT.storey;
                const [width, depth] = [lot[0] * PLOT, lot[1] * PLOT];

                // (On the corner post, the one nearest the door either side, and on the first floor)
                assert.ok(Math.abs(sign.x - (sign.side > 0 ? gx1 + KIT.out / 2 : gx0 - KIT.out / 2)) < EPSILON, `${name} ${lot}: on the post`);
                assert.ok(Math.abs(sign.z - (door.z + built.jetty + KIT.out)) < EPSILON, `${name} ${lot}: on its face`);
                assert.ok(sign.box[2] > first + KIT.sill && sign.box[3] < first + KIT.band, `${name} ${lot}: on the first floor, ${sign.box[2]}..${sign.box[3]}`);
                // (Within its lot across, out over the street no further than a sign's reach)
                assert.ok(sign.box[0] > 0.35 && sign.box[1] < width - 0.35, `${name} ${lot}: within its lot`);
                assert.ok(sign.box[5] < depth + 0.6, `${name} ${lot}: ${sign.box[5] - depth} m past the lot`);

                // (Clear of every roof, eaves, soffit and jetty: the faces that reach it, point by point)
                const near = [...built.slopes, ...built.trims].filter(({ points }) => {
                    const box = [0, 1, 2].flatMap((d) => [Math.min(...points.map((p) => p[d])), Math.max(...points.map((p) => p[d]))]);

                    return overlap([box[0], box[1], box[2], box[3], box[4], box[5]], [sign.box[0] - 0.1, sign.box[1] + 0.1, sign.box[2] - 0.1, sign.box[3] + 0.1, sign.box[4] - 0.1, sign.box[5] + 0.1]);
                });

                for (const { points } of near) {
                    for (const point of pointsOn(points)) {
                        assert.ok(!inside(sign.box, point, 0.03), `${name} ${lot}: the roof at ${point.map((v) => v.toFixed(2))}`);
                    }
                }

                // (Of the awnings, the banners, the lanterns, the name board)
                for (const awning of built.extras.awnings) {
                    assert.ok(!overlap(sign.box, awningBox(awning)), `${name} ${lot}: an awning`);
                }

                const face = goods.z;

                for (const side of [-1, 1]) {
                    if (goods.banners) {
                        const x = goods.x0 + side * goods.banners.aside;

                        assert.ok(!overlap(sign.box, [x - 0.45, x + 0.45, 0, 3.4, face + goods.banners.out - 0.1, face + goods.banners.out + 0.1]), `${name} ${lot}: a banner`);
                    }

                    if (goods.lanterns) {
                        const x = goods.x0 + side * goods.lanterns.aside;

                        assert.ok(!overlap(sign.box, [x - 0.2, x + 0.2, 0, 2.5, face + goods.lanterns.out - 0.2, face + goods.lanterns.out + 0.2]), `${name} ${lot}: a lantern`);
                    }
                }

                assert.ok(!overlap(sign.box, [board.x0 - 0.12, board.x1 + 0.12, board.y0 - 0.12, board.y1 + 0.12, board.z, board.z + board.depth + 0.02]), `${name} ${lot}: its name board`);

                // (Out from the wall, past the windows and the frame: none of the front's pieces
                // stands further out than its frame, 0.33 m)
                assert.ok(sign.box[4] >= door.z + built.jetty + KIT.out - EPSILON);
            }
        }
    });

    it("keeps its awnings off its door and under its name board, over the shop windows", () => {
        for (const name of SHOP_LANDMARKS) {
            for (const lot of LOTS) {
                const { board, built, door } = kitShop(shopOn(name, lot));

                for (const awning of built.extras.awnings) {
                    const box = awningBox(awning);

                    assert.ok(box[1] < door.x - 0.55 || box[0] > door.x + 0.55, `${name} ${lot}: off the door`);
                    assert.ok(box[3] < board.y0 - 0.12, `${name} ${lot}: under the board`);
                    assert.ok(box[3] < KIT.plinth + KIT.band, `${name} ${lot}: under the band`);
                }
            }
        }
    });

    it("sets out what it sells under its awnings, and a master's banners and the Emporium's lanterns clear of them and of its door", () => {
        for (const name of SHOP_LANDMARKS) {
            for (const lot of LOTS.filter((_, k) => k % 3 === 0)) {
                const shop = kitShop(shopOn(name, lot));
                const { built, door, goods } = shop;
                const solid = new Solid();

                dressShop(solid, name, { x0: goods.x0 * P, z: goods.z * P, seed: 7, aside: goods.aside, under: goods.under, banners: goods.banners ?? false, lanterns: goods.lanterns });

                const object = solid.toObject();
                const point = new THREE.Vector3();
                const awnings = built.extras.awnings;
                let points = 0;

                object.updateMatrixWorld(true);
                object.traverse((node) => {
                    if (!node.isMesh) {
                        return;
                    }

                    const { position } = node.geometry.attributes;

                    for (let k = 0; k < position.count; k++) {
                        point.fromBufferAttribute(position, k).applyMatrix4(node.matrixWorld).divideScalar(P);
                        points++;

                        // (Under each awning, lower than it is there)
                        for (const { at: [ax, az], width, y } of awnings) {
                            const back = az + AWNING.back;

                            if (Math.abs(point.x - ax) < width / 2 && point.z > back - 0.4 && point.z < back + AWNING.depth) {
                                const over = y - (AWNING.fall * Math.max(0, point.z - back)) / AWNING.depth;

                                assert.ok(point.y < over - 0.05, `${name} ${lot}: ${point.toArray().map((v) => v.toFixed(2))} under an awning ${over.toFixed(2)} m up`);
                            }
                        }

                        // (None of it in the doorway, nor in the wall)
                        assert.ok(!(Math.abs(point.x - door.x) < 0.55 && point.y < door.floor + door.height && point.z < door.z + 1.1), `${name} ${lot}: in the doorway at ${point.toArray().map((v) => v.toFixed(2))}`);
                        assert.ok(point.z > door.z + KIT.out - 0.01, `${name} ${lot}: in the wall at ${point.toArray().map((v) => v.toFixed(2))}`);
                        // (Nor in the jetty over it)
                        assert.ok(!(built.jetty && point.y > KIT.plinth + KIT.storey - 0.15 && point.z < door.z + built.jetty + KIT.out + 0.05), `${name} ${lot}: in the jetty`);
                    }
                });

                assert.ok(points > 100, `${name}: set out`);
            }
        }
    });
});

describe("a shop among its neighbours (art/kits/kitshop.js, setpieces/town.js)", () => {
    it("hangs its sign within its own lot, clear of every other building's and its eaves, in every human settlement it stands in", () => {
        let shops = 0;

        for (const [kind, masters] of [["village", MASTER_SHOPS], ["town", [null, ...MASTER_SHOPS]], ["city", [null]], ["capital", [null]]]) {
            for (const master of masters) {
                for (const seed of [1, 2, 3, 4, 5, 6]) {
                    const town = layoutTown({ seed, kind, master });
                    const pieces = town.pieces.filter(({ kind: k }) => k === "house" || k === "landmark");

                    for (const piece of pieces.filter(kitShopBuilt)) {
                        const { sign } = kitShop(piece);
                        const [width, depth] = [piece.w * PLOT, piece.h * PLOT];
                        const [c, s] = [Math.cos(piece.facing), Math.sin(piece.facing)];
                        // (A point of its lot's frame in the town's, as the town turns it about its middle)
                        const world = (u, v) => [piece.x + (u - width / 2) * c + (v - depth / 2) * s, piece.y - (u - width / 2) * s + (v - depth / 2) * c];
                        const corners = [[sign.box[0], sign.box[4]], [sign.box[1], sign.box[4]], [sign.box[1], sign.box[5]], [sign.box[0], sign.box[5]]].map(([u, v]) => world(u, v));

                        shops++;
                        assert.ok(SPECIALISTS.includes(piece.name) || MASTER_SHOPS.includes(piece.name));

                        for (const other of pieces.filter((one) => one !== piece)) {
                            // (Its lot, and its eaves out past it, 0.35 m at most)
                            const [ow, od] = [other.w * PLOT, other.h * PLOT];
                            const [oc, os] = [Math.cos(other.facing ?? 0), Math.sin(other.facing ?? 0)];

                            for (const [x, y] of corners) {
                                const [du, dv] = [(x - other.x) * oc - (y - other.y) * os, (x - other.x) * os + (y - other.y) * oc];

                                assert.ok(Math.abs(du) > ow / 2 + 0.35 || Math.abs(dv) > od / 2 + 0.35, `${kind} ${seed} ${piece.name}: its sign over the ${other.name ?? other.kind} by it`);
                            }
                        }
                    }
                }
            }
        }

        assert.ok(shops > 40, `${shops} shops`);
    });
});
