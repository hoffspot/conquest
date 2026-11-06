// Licensed prop kits (world/propkits.js; docs/LICENSED_MODELS.md, *Prop kits*): a bought pack's
// furniture standing in for the game's own where it suits, each piece by its role; in the catalog,
// licensed, a node each in its file; chosen the same for the same place; set out in the humans'
// shops and upstairs rooms fitted to their furnishings' squares, the game's own furnishing drawn
// meanwhile (its stand-in), and none of it for another people's
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// (Textured materials and signs paint a canvas: enough of one for them to in Node)
const noop = () => {};
const context = () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), measureText: (text) => ({ width: String(text).length * 10 }) }, { get: (target, key) => (key in target ? target[key] : noop) });

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { PROP_KITS, kitPiece, kitsFor, pieceName } = await import("../client/js/world/propkits.js");
const { DUNGEON_PROPS } = await import("../client/js/world/dungeons3d.js");
const { buildInterior } = await import("../client/js/world/interiors3d.js");
const { readPlan, UPSTAIRS_PLAN } = await import("../client/js/core/interiors.js");
const { SHOP_INSIDES } = await import("../client/js/core/insides.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

const CATALOG = JSON.parse(readFileSync(new URL("../client/models/assets.json", import.meta.url))).models;

// A shop's floor (core/insides.js SHOP_INSIDES) or the tavern's upstairs, as the game reads it, of a people's
function shopOf(kind, people) {
    return Object.assign(readPlan(`${kind}/shop`, "A shop", SHOP_INSIDES[kind].rows), { origin: [0, 0], style: "shop", look: kind, people });
}

const upstairsOf = (people) => Object.assign(readPlan("upstairs", "Upstairs", UPSTAIRS_PLAN), { origin: [0, 0], style: "upstairs", look: "inn", people });

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
        assert.equal(kitPiece("counter", { people: "human", place: "taproom" }), null);
        assert.equal(kitPiece("throne", { people: "human", place: "shop" }), null);
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

    it("sets upstairs' side table and its chests from the kit for the humans, and none of it for another people", () => {
        const human = buildInterior(upstairsOf("human"));
        const set = kitProps(human);

        assert.equal(set.filter(({ model }) => model === "wind-ways-shop-table").length, 1);
        assert.equal(set.filter(({ model }) => model === "wind-ways-shop-chest-low").length, 4);
        assert.ok(human.object.getObjectByName("kit-stand-ins"));

        for (const people of ["orc", "elf"]) {
            assert.equal(kitProps(buildInterior(upstairsOf(people))).length, 0, people);
            assert.equal(kitProps(buildInterior(shopOf("swordsmith", people))).length, 0, people);
            assert.equal(buildInterior(shopOf("swordsmith", people)).object.getObjectByName("kit-stand-ins"), undefined, people);
        }
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
