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
const { LAYOUTS, SHOP_INSIDES, barracksRooms, guildRooms, hallRooms, keepRooms, smithyRooms, taproomPlan, templeRooms } = await import("../client/js/core/insides.js");
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

// Every people's halls' floors (core/insides.js): a guild's, a town hall's, a town's keep's, a
// castle's keep's great hall and its undercroft, and a barracks', as the game reads them
function hallsOf(people) {
    const floors = [];

    for (const [rooms, siteKind] of [[guildRooms], [hallRooms], [keepRooms, "town"], [keepRooms, "castle"], [barracksRooms]]) {
        for (const floor of rooms({ seed: 3, name: "Inside", people, siteKind })) {
            floors.push(Object.assign(readPlan(`halls-${floor.style}-${siteKind ?? ""}`, floor.name, floor.rows, { ground: floor.ground }), { origin: [0, 0], style: floor.style, castle: siteKind === "castle", people }));
        }
    }

    return floors;
}

// The halls kit's placements of a role's pieces in a built inside
const halls = (built, role) => kitProps(built).filter(({ model }) => model.startsWith("medieval-hall-") && PROP_KITS["medieval-hall"].pieces[model.slice("medieval-hall-".length)].role === role);

// A people's temple (a town's, or an abbey's: a site's), smithy and shops of every kind, as the
// game reads them
function townOf(people) {
    const floors = [];

    for (const [rooms, building] of [[templeRooms, { place: "town", patron: "aurelia" }], [templeRooms, { place: "site", patron: "aurelia" }], [smithyRooms, {}]]) {
        for (const floor of rooms({ name: "Inside", ...building })) {
            floors.push(Object.assign(readPlan(`town-${floor.style}-${building.place ?? ""}`, floor.name, floor.rows, { ground: floor.ground }), { origin: [0, 0], style: floor.style, patron: floor.patron, abbey: building.place === "site", people }));
        }
    }

    return [...floors, ...Object.keys(SHOP_INSIDES).map((kind) => shopOf(kind, people))];
}

// The town kit's placements of a role's pieces in a built inside
const town = (built, role) => kitProps(built).filter(({ model }) => model.startsWith("medieval-town-") && PROP_KITS["medieval-town"].pieces[model.slice("medieval-town-".length)].role === role);

// A kit's piece placed, by its model's name
function pieceOf(model) {
    const kit = Object.keys(PROP_KITS).find((name) => model.startsWith(`${name}-`));

    return PROP_KITS[kit].pieces[model.slice(kit.length + 1)];
}

// Each placed light's flames (world/propkits.js flamesOf), where it stands: its foot on what it's on
// or at its height
function flamesIn(built) {
    const tops = new Map();
    const out = [];

    for (const each of kitProps(built)) {
        const piece = pieceOf(each.model);

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
        assert.deepEqual(kitsFor({ people: "human", place: "shop" }).map(([name]) => name), ["wind-ways-shop", "medieval-town"]);
        assert.equal(kitPiece("counter", { people: "human", place: "shop" }).model, "wind-ways-shop-counter");
        assert.equal(kitPiece("torch", { people: "human", place: "shop" }).model, "medieval-town-torch");
        assert.deepEqual(kitPiece("chest", { people: "human", place: "upstairs", seed: 5 }), kitPiece("chest", { people: "human", place: "upstairs", seed: 5 }));
        assert.equal(kitPiece("counter", { people: "orc", place: "shop" }).model, "medieval-town-cabinet");
        assert.equal(kitPiece("counter", { people: "human", place: "temple" }).model, "medieval-town-cabinet");
        assert.equal(kitPiece("counter", { people: "human", place: "guild" }).model, "medieval-hall-cabinet");
        assert.equal(kitPiece("throne", { people: "human", place: "shop" }), null);
        assert.equal(kitPiece("counter", { people: "human", place: "crypt" }), null);

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

        // (Another people's shops have no Wind Ways' there either: the town kit's alone)
        for (const people of ["orc", "elf"]) {
            const set = kitProps(buildInterior(shopOf("swordsmith", people)));

            assert.ok(set.length > 0 && set.every(({ model }) => model.startsWith("medieval-town-")), people);
        }
    });

    it("sets every people's halls out from the halls kit, toned to theirs: a guild's, a town hall's, a keep's great hall and a castle's undercroft, and a barracks'", () => {
        // (Of each kind of hall, how many of a role's pieces stand in it)
        const COUNTS = {
            guild: { counter: 4, table: 4, bench: 8, candlestick: 4, mug: 8, scroll: 4, skull: 1, barrel: 2, chandelier: 1, map: 5, shield: 4, sword: 1 },
            hall: { counter: 5, "council-table": 3, bench: 10, candlestick: 4, strongbox: 2, antlers: 1, chandelier: 1, map: 3, picture: 3, shield: 4 },
            keep: { throne: 2, runner: 4, "council-table": 4, bench: 8, candlestick: 2, goblet: 4, counter: 2, strongbox: 2, antlers: 2, chandelier: 2, shield: 6, sword: 2, picture: 3, map: 2 },
            undercroft: { counter: 5, table: 2, bench: 4, mug: 2, candlestick: 1, cask: 3, strongbox: 2, torch: 4 },
            barracks: { table: 3, bench: 6, candlestick: 1, mug: 2, barrel: 2, counter: 3, chest: 2, torch: 3, map: 2, shield: 3 },
        };

        for (const people of PEOPLES) {
            for (const map of hallsOf(people)) {
                const built = buildInterior(map);
                const set = kitProps(built);
                const name = `${people} ${map.style}${map.castle ? " (a castle's)" : ""}`;
                const counts = { ...COUNTS[map.style], ...(map.style === "keep" && !map.castle ? { map: 3 } : {}) };

                assert.ok(set.length > 15, `${name}: ${set.length}`);
                assert.ok(set.every(({ model, tone }) => model.startsWith("medieval-hall-") && (tone ?? null) === TONES[people]), `${name}: the halls kit's, toned to theirs`);

                for (const [role, count] of Object.entries(counts)) {
                    assert.equal(halls(built, role).length, count, `${name}: ${role}`);
                }

                // (What's on a table stands on one of the kit's tables; standing pieces in their
                // furnishing's squares, carpets aside; what hangs on a wall off the floor, under
                // the frieze, in the room)
                const boards = [...halls(built, "table"), ...halls(built, "council-table"), ...halls(built, "counter")];
                const lying = ({ model }) => ["runner", "carpet"].includes(pieceOf(model).role);
                const standing = set.filter((placement) => !placement.on && placement.y === undefined && !lying(placement));

                for (const each of set.filter(({ on }) => on)) {
                    assert.ok(boards.includes(each.on), `${name}: ${each.model} on a table`);
                }

                for (const each of standing) {
                    assert.ok(map.blocked[Math.floor(each.z)][Math.floor(each.x)], `${name}: ${each.model} on an open square at ${each.x}, ${each.z}`);
                }

                for (const each of set.filter(({ model }) => ["map", "picture", "shield", "sword"].includes(pieceOf(model).role))) {
                    assert.ok(each.y >= 0.85 && each.y + each.fit[1] <= 2.4, `${name}: ${each.model} from ${each.y} to ${each.y + each.fit[1]}`);
                    assert.ok(each.x >= 0 && each.x <= map.width && each.z >= 0 && each.z <= map.height, `${name}: ${each.model} in the room`);
                }

                assert.ok(built.object.getObjectByName("kit-stand-ins")?.visible, `${name}: its own drawn till the kit's read`);
            }
        }
    });

    it("lights the halls kit's chandeliers, candlesticks and torches where their candles and cages are", () => {
        for (const map of hallsOf("orc")) {
            const built = buildInterior(map);
            const flames = flamesIn(built);
            const torches = halls(built, "torch");

            assert.ok(flames.length >= 4, `${map.style}: ${flames.length} flames`);

            for (const [x, y, z] of flames.slice(0, flames.length - torches.length)) {
                assert.ok(built.candles.some((candle) => Math.hypot(candle[0] - x, candle[1] - y, candle[2] - z) < 1e-6), `${map.style}: a flame at ${[x, y, z].map((v) => v.toFixed(2))}`);
            }

            // (A torch's flame where its light is, in its cage)
            for (const torch of torches) {
                const [[x, y, z]] = flamesOf(pieceOf(torch.model), torch, torch.y);

                assert.ok(Math.abs(y - 2.05) < 1e-9, `${map.style}: a torch's flame ${y} up`);
                assert.ok(built.lights.some((light) => Math.hypot(light.x - x, light.z - z) < 1e-6), `${map.style}: a torch's light at its flame`);
            }
        }
    });

    it("sets every people's temples, smithies and shops out from the town kit, toned to theirs (the humans' shops their own kit's counters and chests first)", () => {
        for (const people of PEOPLES) {
            for (const map of townOf(people)) {
                const built = buildInterior(map);
                const set = kitProps(built);
                const own = set.filter(({ model }) => model.startsWith("medieval-town-"));
                const name = `${people} ${map.style}${map.look ? ` (${map.look})` : ""}${map.abbey ? " (an abbey)" : ""}`;
                const count = (kind) => map.pieces.filter((piece) => piece.kind === kind).length;
                const counts = {
                    temple: { candelabrum: 2, "altar-book": 1, "candle-stand": 2, candle: 15, chandelier: 1, runner: 4, pew: 20, counter: map.abbey ? 2 : 0 },
                    smithy: { "anvil-block": 1, sack: 1, workbench: 1, candlestick: 1, shield: 1 },
                    shop: {
                        torch: 4,
                        counter: people === "human" ? 0 : 3,
                        chest: people === "human" ? 0 : count("chest"),
                        "candle-stand": count("votive"),
                        lectern: count("side-table"),
                        workbench: count("workbench"),
                        table: map.look === "alchemist" ? count("table") : 0,
                        cask: map.pieces.filter((piece) => piece.kind === "barrels").reduce((sum, { h }) => sum + h, 0),
                        rug: map.look === "alchemist" ? 0 : 2 * count("carpet"),
                    },
                }[map.style];

                assert.ok(own.length >= 4, `${name}: ${own.length}`);
                assert.ok(own.every(({ tone }) => (tone ?? null) === TONES[people]), `${name}: the town kit's, toned to theirs`);
                assert.ok(set.every(({ model }) => model.startsWith("medieval-town-") || (people === "human" && model.startsWith("wind-ways-shop-"))), `${name}: no other kit's`);

                for (const [role, many] of Object.entries(counts)) {
                    assert.equal(town(built, role).length, many, `${name}: ${role}`);
                }

                // (What stands on something stands on one of the kits' pieces; standing pieces
                // in their furnishing's squares, rugs and runners aside; what hangs on a wall or
                // stands raised off the floor, in the room)
                const lying = ({ model }) => ["runner", "rug"].includes(pieceOf(model).role);

                for (const each of set.filter(({ on }) => on)) {
                    assert.ok(set.includes(each.on), `${name}: ${each.model} on one of the kit's`);
                }

                for (const each of set.filter((placement) => !placement.on && placement.y === undefined && !lying(placement))) {
                    assert.ok(map.blocked[Math.floor(each.z)][Math.floor(each.x)], `${name}: ${each.model} on an open square at ${each.x}, ${each.z}`);
                }

                for (const each of set) {
                    assert.ok(each.x >= 0 && each.x <= map.width && each.z >= 0 && each.z <= map.height, `${name}: ${each.model} in the room`);
                }

                assert.ok(built.object.getObjectByName("kit-stand-ins")?.visible, `${name}: its own drawn till the kit's read`);
            }
        }
    });

    it("lights the town kit's candelabra, candles, chandelier and torches where their candles and cages are", () => {
        for (const map of townOf("lizard")) {
            const built = buildInterior(map);
            const flames = flamesIn(built);
            const torches = town(built, "torch");

            assert.ok(flames.length >= 1, `${map.style}: ${flames.length} flames`);

            for (const [x, y, z] of flames.slice(0, flames.length - torches.length)) {
                assert.ok(built.candles.some((candle) => Math.hypot(candle[0] - x, candle[1] - y, candle[2] - z) < 1e-6), `${map.style}: a flame at ${[x, y, z].map((v) => v.toFixed(2))}`);
            }

            for (const torch of torches) {
                const [[x, y, z]] = flamesOf(pieceOf(torch.model), torch, torch.y);

                assert.ok(Math.abs(y - 2.05) < 1e-9, `${map.style}: a torch's flame ${y} up`);
                assert.ok(built.lights.some((light) => Math.hypot(light.x - x, light.z - z) < 1e-6), `${map.style}: a torch's light at its flame`);
            }
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
