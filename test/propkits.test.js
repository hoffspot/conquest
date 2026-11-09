// Licensed prop kits (world/propkits.js; docs/LICENSED_MODELS.md, *Prop kits*): a bought pack's
// furniture standing in for the game's own where it suits, each piece by its role; in the catalog,
// licensed, a node each in its file; chosen the same for the same place; set out in the humans'
// shops, and every people's taverns, fitted to their furnishings' squares and toned to the people,
// lights' flames where their candles are, the game's own furnishing drawn meanwhile (its stand-in);
// and read out of their file whole, however far from its middle they were made
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// (Textured materials and signs paint a canvas: enough of one for them to in Node)
const noop = () => {};
const context = () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), measureText: (text) => ({ width: String(text).length * 10 }) }, { get: (target, key) => (key in target ? target[key] : noop) });

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { PROP_KITS, TONES, flamesOf, kitPiece, kitsFor, pieceName } = await import("../client/js/world/propkits.js");
const { DUNGEON_PROPS, partsOf } = await import("../client/js/world/dungeons3d.js");
const { buildInterior, STOREY } = await import("../client/js/world/interiors3d.js");
const { readPlan, UPSTAIRS_PLAN } = await import("../client/js/core/interiors.js");
const { LAYOUTS, SHOP_INSIDES, taproomPlan } = await import("../client/js/core/insides.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

const CATALOG = JSON.parse(readFileSync(new URL("../client/models/assets.json", import.meta.url))).models;

// A shop's floor (core/insides.js SHOP_INSIDES) or the tavern's upstairs, as the game reads it, of a people's
function shopOf(kind, people) {
    return Object.assign(readPlan(`${kind}/shop`, "A shop", SHOP_INSIDES[kind].rows), { origin: [0, 0], style: "shop", look: kind, people });
}

const upstairsOf = (people, look = "inn") => Object.assign(readPlan("upstairs", "Upstairs", UPSTAIRS_PLAN), { origin: [0, 0], style: "upstairs", look, people });

// A tavern's taproom of a people's, its tables set out `layout`'s way, stairs up along its north wall or not
const taproomOf = (people, layout, stairs) => Object.assign(readPlan(`taproom-${layout}`, "A taproom", taproomPlan(layout, stairs)), { origin: [0, 0], style: "taproom", layout, people });

// The peoples (world/propkits.js TONES has each's)
const PEOPLES = Object.keys(TONES);

// A tavern kit's placements of a role's pieces in a built inside
const tavern = (built, role) => kitProps(built).filter(({ model }) => model.startsWith("medieval-tavern-") && PROP_KITS["medieval-tavern"].pieces[model.slice("medieval-tavern-".length)].role === role);

// Each placed light's flames (world/propkits.js flamesOf), where it stands: its foot on what it's on
// or at its height
function flamesIn(built) {
    const tops = new Map();
    const out = [];

    for (const each of kitProps(built)) {
        const piece = PROP_KITS["medieval-tavern"].pieces[each.model.slice("medieval-tavern-".length)];

        if (!piece) {
            continue;
        }

        const y = each.on ? tops.get(each.on) : (each.y ?? 0);

        tops.set(each, y + (each.fit ?? piece.size)[1]);

        if (piece.candles) {
            out.push(...flamesOf(piece, each, y));
        }
    }

    return out;
}

// What a built inside (buildInterior's) sets out of a kit's (its props whose models are a kit's pieces)
const kitProps = (built) => (built.object.userData.props ?? []).filter(({ model }) => Object.keys(PROP_KITS).some((kit) => model.startsWith(`${kit}-`)));

describe("licensed prop kits (world/propkits.js)", () => {
    it("are each a licensed model in the catalog, fetched only where it's wanted, each of its pieces a node of its file and a prop of its own", () => {
        for (const [name, kit] of Object.entries(PROP_KITS)) {
            const entry = CATALOG[kit.asset];

            assert.ok(entry, `${kit.asset} isn't in the catalog`);
            assert.equal(entry.licensed, true);
            assert.equal(entry.tier, "demand");
            assert.ok(entry.files[0].path.endsWith(".bin") && entry.files[0].hash && entry.files[0].bytes > 1e5);
            assert.match(entry.label, new RegExp(kit.by));
            assert.deepEqual(Object.keys(entry.pieces).sort(), Object.keys(kit.pieces).map((piece) => pieceName(name, piece)).sort());

            for (const [piece, { role, size }] of Object.entries(kit.pieces)) {
                assert.deepEqual(DUNGEON_PROPS[pieceName(name, piece)], { asset: kit.asset, nodes: entry.pieces[pieceName(name, piece)] });
                assert.ok(typeof role === "string" && size.length === 3 && size.every((metres) => metres > 0 && metres < 4), `${piece}: ${size}`);
            }
        }
    });

    it("gives the piece for a role in a people's place, the same for the same seed, and none where no kit's for it", () => {
        assert.deepEqual(kitsFor({ people: "human", place: "shop" }).map(([name]) => name), ["wind-ways-shop"]);
        assert.equal(kitPiece("counter", { people: "human", place: "shop" }).model, "wind-ways-shop-counter");
        assert.deepEqual(kitPiece("chest", { people: "human", place: "upstairs", seed: 5 }), kitPiece("chest", { people: "human", place: "upstairs", seed: 5 }));
        assert.equal(kitPiece("counter", { people: "orc", place: "shop" }), null);
        assert.equal(kitPiece("counter", { people: "human", place: "guild" }), null);
        assert.equal(kitPiece("throne", { people: "human", place: "shop" }), null);

        // (The tavern kit's in every people's taverns, toned to theirs; the humans' as it's made)
        for (const people of PEOPLES) {
            assert.deepEqual(kitsFor({ people, place: "taproom" }).map(([name]) => name), ["medieval-tavern"], people);
            assert.deepEqual(kitPiece("chandelier", { people, place: "upstairs" }).tone, TONES[people], people);
        }

        assert.equal(TONES.human, null);
        assert.equal(kitPiece("counter", { people: "human", place: "shop" }).tone, null);
    });

    it("puts a light's flames where its candles are, sized and turned as it's set", () => {
        const sconce = kitPiece("sconce", { place: "upstairs" });
        const [left, right] = flamesOf(sconce, { x: 2, z: 3, turn: Math.PI / 2 }, 1.4);

        // (Facing east, its two candles either side along z, out from the wall along x)
        assert.ok(Math.abs(left[0] - (2 + sconce.candles[0][2])) < 1e-9 && Math.abs(left[2] - (3 - sconce.candles[0][0])) < 1e-9);
        assert.ok(Math.abs(left[1] - (1.4 + sconce.candles[0][1])) < 1e-9 && Math.abs(right[1] - left[1]) < 1e-9);

        // (A chandelier hung at 0.7 of its size: its eight flames as much nearer its middle)
        const lamp = kitPiece("chandelier", { place: "taproom" });
        const flames = flamesOf(lamp, { x: 0, z: 0, fit: lamp.size.map((metres) => metres * 0.7) }, 2);

        assert.equal(flames.length, 8);
        flames.forEach(([x, y, z], k) => assert.ok(Math.abs(Math.hypot(x, z) - 0.7 * Math.hypot(lamp.candles[k][0], lamp.candles[k][2])) < 1e-9 && Math.abs(y - (2 + 0.7 * lamp.candles[k][1])) < 1e-9));
    });

    it("sets a human shop's counter out of the kit's counters end to end along its run, its chests and cabinets each on its square against its wall, a basket or a lantern on each; the shop's own drawn apart till they're read", () => {
        for (const kind of Object.keys(SHOP_INSIDES)) {
            const map = shopOf(kind, "human");
            const built = buildInterior(map);
            const set = kitProps(built);
            const [counter] = map.pieces.filter((piece) => piece.kind === "counter");
            const counters = set.filter(({ model }) => model === "wind-ways-shop-counter");

            assert.ok(counters.length >= 1, kind);
            assert.ok(Math.abs(counters.reduce((sum, { fit }) => sum + fit[0], 0) - counter.w) < 1e-9, `${kind}: the counter's whole run`);
            assert.ok(counters.every(({ x, z }) => x > counter.x && x < counter.x + counter.w && Math.floor(z) === counter.y));

            for (const each of set.filter(({ on, y }) => !on && y === undefined)) {
                assert.ok(map.blocked[Math.floor(each.z)][Math.floor(each.x)], `${kind}: ${each.model} on an open square`);
            }

            // (A basket on each chest, a lantern on each cabinet)
            for (const each of set.filter(({ model }) => ["wind-ways-shop-basket", "wind-ways-shop-lantern"].includes(model))) {
                assert.ok(set.includes(each.on) && ["wind-ways-shop-chest-low", "wind-ways-shop-cabinet"].includes(each.on.model), `${kind}: ${each.model} on a chest or cabinet`);
            }
            assert.ok(built.object.getObjectByName("kit-stand-ins")?.visible, `${kind}: its own counter drawn till the kit's read`);
        }
    });

    it("sets every people's taproom out from the tavern kit, toned to theirs: tables end to end along each table, benches along each bench, the casks on their stillage, mugs, plates and candlesticks on the tables, chandeliers, antlers and the hearth's logs, pictures on the walls", () => {
        for (const people of PEOPLES) {
            for (const [k, layout] of LAYOUTS.entries()) {
                const map = taproomOf(people, layout, k % 2 === 0);
                const built = buildInterior(map);
                const set = kitProps(built);
                const tables = map.pieces.filter((piece) => piece.kind === "table");
                const boards = tavern(built, "table");

                assert.ok(set.length > 30, `${people} ${layout}: ${set.length}`);
                assert.ok(set.every(({ tone }) => (tone ?? null) === TONES[people]), `${people}: toned to theirs`);

                // (Each table's run covered by the kit's tables end to end, inside its squares)
                for (const table of tables) {
                    const on = boards.filter(({ x, z }) => x > table.x && x < table.x + table.w && Math.floor(z) === table.y);

                    assert.ok(on.length >= 1 && Math.abs(on.reduce((sum, { fit }) => sum + fit[0] + 0.06, 0) - table.w) < 1e-9, `${people} ${layout}: a table's run`);
                }

                assert.equal(boards.length, tables.reduce((sum, table) => sum + Math.max(1, Math.round(table.w / 2.4)), 0));
                assert.ok(tavern(built, "bench").length >= 2 * tables.length);
                assert.ok(tavern(built, "cask").length >= 10);
                assert.equal(tavern(built, "chandelier").length, 2);
                assert.equal(tavern(built, "antlers").length, 1);
                assert.equal(tavern(built, "firewood").length, 2);
                assert.equal(tavern(built, "picture").length, 4);
                assert.equal(tavern(built, "trophy").length, 2);

                // (What's on a table stands on one of the kit's tables, a candlestick on each)
                for (const each of set.filter(({ on }) => on)) {
                    assert.ok(boards.includes(each.on), `${people} ${layout}: ${each.model} on a table`);
                }

                assert.equal(tavern(built, "candlestick").filter(({ on }) => on).length, tables.length);

                // (Standing pieces in their furnishing's squares; what hangs on a wall up off the floor, under the ceiling)
                for (const each of set.filter(({ on, y }) => !on && y === undefined)) {
                    assert.ok(map.blocked[Math.floor(each.z)][Math.floor(each.x)], `${people} ${layout}: ${each.model} on an open square`);
                }

                for (const each of [...tavern(built, "picture"), ...tavern(built, "trophy"), ...tavern(built, "antlers")]) {
                    assert.ok(each.y >= 1.4 && each.y + each.fit[1] <= STOREY, `${each.model}: ${each.y}`);
                }

                assert.ok(built.object.getObjectByName("kit-stand-ins")?.visible, `${people}: its own drawn till the kit's read`);
            }
        }
    });

    it("lights each of the tavern kit's chandeliers, sconces, candlesticks and candelabra where its candles are", () => {
        for (const built of [buildInterior(taproomOf("human", "four", true)), buildInterior(upstairsOf("orc", "bordello")), buildInterior(upstairsOf("elf"))]) {
            const flames = flamesIn(built);

            assert.ok(flames.length >= 20, `${flames.length} flames`);

            for (const [x, y, z] of flames) {
                assert.ok(built.candles.some((candle) => Math.hypot(candle[0] - x, candle[1] - y, candle[2] - z) < 1e-6), `a flame at ${[x, y, z].map((v) => v.toFixed(2))}`);
            }
        }
    });

    it("sets every people's rooms upstairs from the tavern kit: its counter, settle, side table and candelabrum, beds (a madam's canopied, an inn's plain), chests with candlesticks, sconces, a chandelier, carpets and seven pictures; and no Wind Ways' there", () => {
        for (const people of PEOPLES) {
            for (const look of ["inn", "bordello"]) {
                const map = upstairsOf(people, look);
                const built = buildInterior(map);
                const set = kitProps(built);

                assert.ok(set.every(({ model, tone }) => model.startsWith("medieval-tavern-") && (tone ?? null) === TONES[people]), `${people} ${look}`);
                assert.equal(tavern(built, "counter").length, 1);
                assert.equal(tavern(built, "settle").length, 1);
                assert.equal(tavern(built, "side-table").length, 1);
                assert.equal(tavern(built, "candelabrum").length, 1);
                assert.equal(tavern(built, look === "inn" ? "bed-plain" : "bed").length, 4);
                assert.equal(tavern(built, "chest").length, 4);
                assert.equal(tavern(built, "candlestick").length, 5);
                assert.equal(tavern(built, "sconce").length, 5);
                assert.equal(tavern(built, "chandelier").length, 1);
                assert.equal(tavern(built, "carpet").length, 1);
                assert.equal(tavern(built, "runner").length, 3);
                assert.equal(tavern(built, "picture").length, 7);

                // (Carpets lie on the open floor: walked over)
                const lying = (placement) => ["carpet", "runner"].includes(PROP_KITS["medieval-tavern"].pieces[placement.model.slice("medieval-tavern-".length)].role);

                for (const each of set.filter((placement) => !placement.on && placement.y === undefined && !lying(placement))) {
                    assert.ok(map.blocked[Math.floor(each.z)][Math.floor(each.x)], `${people}: ${each.model} on an open square`);
                }
            }
        }

        // (Another people's shops have no kit)
        for (const people of ["orc", "elf"]) {
            assert.equal(kitProps(buildInterior(shopOf("swordsmith", people))).length, 0, people);
            assert.equal(buildInterior(shopOf("swordsmith", people)).object.getObjectByName("kit-stand-ins"), undefined, people);
        }
    });

    it("reads a quantized model's piece whole, however far from the file's middle it was made (KHR_mesh_quantization: no point wrapped round past a metre)", () => {
        // (A piece 1.3 m tall, its points 16-bit whole numbers, its node 20 m across and set 10 m off)
        const points = [[0, 0, 0], [0.065, 0.065, 0], [0, 0.065, 0.065]].map((point) => point.map((v) => Math.round(v * 32767)));
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(new Int16Array(points.flat()), 3, true));
        geometry.setIndex([0, 1, 2]);

        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
        const node = new THREE.Group();

        node.name = "kit@0,0";
        node.scale.setScalar(20);
        node.position.set(10, 0, 10);
        node.add(mesh);

        const scene = new THREE.Group();

        scene.add(node);

        const { box } = partsOf(scene, ["kit@0,0"]);

        assert.ok(Math.abs(box.min.y) < 1e-3 && Math.abs(box.max.y - 1.3) < 1e-3, `${box.min.y} to ${box.max.y}`);
        assert.ok(Math.abs(box.min.x - 10) < 1e-3 && Math.abs(box.max.x - 11.3) < 1e-3, `${box.min.x} to ${box.max.x}`);
    });

    it("has each piece its node in the licensed file, a mesh of it, all drawn with one material", { skip: licensedModelsHere() ? false : LEFT_OUT }, () => {
        for (const kit of Object.values(PROP_KITS)) {
            const raw = new Uint8Array(readFileSync(new URL(`../client/${CATALOG[kit.asset].files[0].path}`, import.meta.url)));
            const bytes = isScrambled(raw) ? unscramble(raw) : raw;
            const view = new DataView(bytes.buffer, bytes.byteOffset);
            const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
            const named = Object.fromEntries(json.nodes.map((node) => [node.name, node]));
            const materials = new Set();

            for (const [piece, nodes] of Object.entries(CATALOG[kit.asset].pieces)) {
                const node = named[nodes[0]];

                assert.ok(node && node.mesh !== undefined, `${piece}: ${nodes[0]}`);
                json.meshes[node.mesh].primitives.forEach(({ material }) => materials.add(material));
            }

            assert.equal(materials.size, 1, `one material, not ${materials.size}`);
        }
    });
});
