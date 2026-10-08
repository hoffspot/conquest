// What a dungeon's rooms are dressed with (client/js/world/dungeondressing.js): each theme's things
// left against a wall, set out on a table, drawn up to it, kept on shelves; a workbench's tools, a
// stand of arms, an offering's vessels, the small things strewn by the walls. Every one a scanned
// model the catalog has, set down in its own square, by the wall it's against, and the same every
// time
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { DUNGEON_PROPS } = await import("../client/js/world/dungeons3d.js");
const { blockAt, CLUTTER, CLUTTER_KINDS, clutterAt, onTable, seatsAt, shelvesAt, sideTableAt, standAt, strewnAt, vesselsAt, workbenchAt } = await import("../client/js/world/dungeondressing.js");
const { THEMES } = await import("../client/js/core/dungeons/themes.js");

const WALLS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Placements are sound: known models, sized, about where they're asked (within `reach` metres of
// the square's middle), and on whatever they're said to be on among them
function sound(placed, { x, z, reach, why }) {
    assert.ok(placed.length > 0, `${why}: nothing`);

    for (const each of placed) {
        assert.ok(DUNGEON_PROPS[each.model], `${why}: ${each.model} isn't in the catalog`);
        assert.ok([each.size, each.scale, each.fit].filter(Boolean).length === 1, `${why}: ${each.model} has one size`);
        assert.ok(Math.hypot(each.x - x, each.z - z) <= reach, `${why}: ${each.model} at ${each.x.toFixed(2)}, ${each.z.toFixed(2)}`);
        assert.ok(!each.on || placed.indexOf(each.on) >= 0, `${why}: ${each.model} is on something not placed`);
    }
}

describe("a dungeon's rooms dressed (world/dungeondressing.js)", () => {
    it("leaves each theme's own things against a wall, for every look a theme has, each kind of them by every wall", () => {
        for (const [theme, looks] of Object.entries(CLUTTER)) {
            assert.ok(THEMES[theme], theme);
            assert.ok(looks.any, `${theme} has things for any room`);

            for (const kinds of Object.values(looks)) {
                for (const [kind] of kinds) {
                    assert.ok(CLUTTER_KINDS[kind], `${theme}: ${kind}`);
                }
            }
        }

        for (const [kind, make] of Object.entries(CLUTTER_KINDS)) {
            for (const [n, wall] of WALLS.entries()) {
                for (const rough of [0.05, 0.5, 0.95]) {
                    sound(make({ x: 10.5, z: 20.5, wall, turn: Math.atan2(-wall[0], -wall[1]), rough, r: (k) => (rough * 7 + k * 0.37 + n * 0.11) % 1 }), { x: 10.5, z: 20.5, reach: 0.9, why: `${kind} by ${wall}` });
                }
            }
        }
    });

    it("dresses the same square the same way every time, and squares differently", () => {
        const at = (x, z) => clutterAt(x, z, { theme: "hideout", look: "store", wall: [0, -1], rough: 0.3 });

        assert.deepEqual(at(10.5, 4.5), at(10.5, 4.5));

        const seen = new Set();

        for (let x = 0; x < 40; x++) {
            seen.add(at(x + 0.5, 4.5).map(({ model }) => model).join());
        }

        assert.ok(seen.size > 8, `${seen.size} ways`);
    });

    it("sets out a table and draws up stools, shelves stocked, a side table lit, a workbench's tools, a stand of arms, an offering's vessels and a chopping block", () => {
        const table = { along: true, length: 1.4, depth: 0.8, top: 0.8, rough: 0.4 };
        const things = onTable(5, 5, table);

        sound(things, { x: 5, z: 5, reach: 0.8, why: "on the table" });
        assert.ok(things.every(({ y }) => y === 0.8), "on its top");
        assert.ok(new Set([0.1, 0.3, 0.6, 0.9].flatMap((rough) => onTable(5, 5, { ...table, rough }).map(({ model }) => model))).size >= 5);

        const seats = [0, 0.2, 0.5, 0.8].flatMap((rough) => seatsAt(5, 5, { ...table, rough }));

        assert.ok(seats.length > 0);
        sound(seats, { x: 5, z: 5, reach: 1.2, why: "stools" });

        for (const [name, make, w, reach] of [["shelves", shelvesAt, 2, 1.3], ["a side table", sideTableAt, 1, 0.7], ["a workbench", workbenchAt, 2, 1.2], ["a stand", standAt, 1, 0.8], ["vessels", vesselsAt, 1, 0.8], ["a block", blockAt, 1, 0.5]]) {
            for (const wall of WALLS) {
                sound(make(8, 8, { w, h: 1, wall, rough: 0.37 }), { x: 8, z: 8, reach, why: `${name} by ${wall}` });
            }
        }
    });

    it("strews small things by the walls that cast no shadow, its theme's own", () => {
        for (const theme of Object.keys(CLUTTER)) {
            for (let x = 0; x < 12; x++) {
                const placed = strewnAt(x + 0.5, 2.5, { theme, wall: [0, -1], rough: x / 12 });

                sound(placed, { x: x + 0.5, z: 2.5, reach: 0.6, why: `${theme} strewn` });
                assert.ok(placed.every(({ shadow }) => shadow === false));
            }
        }
    });
});
