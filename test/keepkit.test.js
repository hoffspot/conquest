// Bellhaven's keep drawn with its castle's own pieces (world/keepkit.js, docs/DUNGEONS.md *Bellhaven's
// keep*): along every run of its walls a cornice under the vault and pilasters between, tracery
// windows in its longer walls, the castle's column in each pillar's place and its bell over the
// bell chamber's altar, all from its kit, the licensed model the catalog has (its pieces), each set
// on its open floor, cut away with the rock while the camera's over the roof; the same wherever it's
// drawn.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { readPlan } from "../client/js/core/interiors.js";
import { CAVERNS } from "../client/js/world/caverns.js";
import { KEEP_KIT, KIT, KIT_PICTURES, kitPlacements, wallRuns } from "../client/js/world/keepkit.js";

const CATALOG = JSON.parse(readFileSync(new URL("../client/models/assets.json", import.meta.url))).models;
const TALL = 6;

// A keep's floors as maps, as core/insides.js reads them (its plan, pieces, marks, and what the art
// wants of its dungeon: its lights and rooms)
function floorsOf(seed) {
    const dungeon = buildDungeon({ seed, theme: "keep", tier: 5 });

    return dungeon.levels.map((level, k) => Object.assign(readPlan(`keep/level-${k + 1}`, "a floor", level.rows), { dungeon: { level: k, lights: level.lights, rooms: level.rooms } }));
}

const rock = (map, x, z) => (map.plan[Math.floor(z)]?.[Math.floor(x)] ?? "#") === "#";
// (Or the open air round its walls, or a balcony's parapet: core/dungeons/air.js)
const air = (map, x, z) => ["_", "="].includes(map.plan[Math.floor(z)]?.[Math.floor(x)]);

describe("Bellhaven's keep's castle's pieces (world/keepkit.js)", () => {
    it("is a kit in the catalog, licensed, fetched only where it's wanted, its pieces each a node of it, its wall's and floor's pictures measured from the pack's own", () => {
        const entry = CATALOG[KEEP_KIT.asset];

        assert.equal(entry.licensed, true);
        assert.equal(entry.tier, "demand");
        assert.ok(entry.files[0].path.endsWith(".bin") && entry.files[0].hash && entry.files[0].bytes > 1e6);

        for (const [key, name] of Object.entries(KEEP_KIT).filter(([key]) => key !== "asset")) {
            assert.deepEqual(entry.pieces[name], [key], name);
        }

        assert.ok(KIT_PICTURES.wall.mean.every((c) => c > 0.3 && c < 0.6), "a white wall");
        assert.ok(KIT_PICTURES.floor.mean.every((c) => c > 0 && c < 0.2), "a dark floor");
    });

    it("sets a cornice along every run of wall under the vault, the whole run's length, pilasters between, windows in the longer walls, all on its open floor, cut with the rock", () => {
        for (const seed of [3, 7, 19]) {
            floorsOf(seed).forEach((map, k) => {
                const placements = kitPlacements(map, { tall: TALL });
                const runs = wallRuns(map);
                const cornices = placements.filter(({ model }) => model === KEEP_KIT.cornice);
                const pilasters = placements.filter(({ model }) => model === KEEP_KIT.pilaster);
                const windows = placements.filter(({ model }) => model === KEEP_KIT.window);

                assert.ok(runs.length > 20, `${seed}/${k}: ${runs.length} runs`);
                // (Every run's whole length cornices, none longer than a piece's stretched)
                assert.ok(Math.abs(cornices.reduce((sum, { fit }) => sum + fit[0], 0) - runs.reduce((sum, { from, to }) => sum + to - from, 0)) < 1e-6);
                assert.ok(cornices.every(({ fit, y }) => fit[0] <= KIT.stretch + 1e-9 && Math.abs(y - (TALL - KIT.cornice)) < 1e-9));
                assert.ok(pilasters.length > runs.length / 2, `${seed}/${k}: ${pilasters.length} pilasters`);
                assert.ok(windows.length > 0, `${seed}/${k}: some windows`);
                assert.ok(pilasters.every(({ fit }) => Math.abs(fit[1] - (TALL - KIT.cornice)) < 1e-9), "as high as under the cornice");
                // (What lies flat on the wall casts no shadow: a draw into each of a torch's six for none to see)
                assert.ok([...cornices, ...pilasters, ...windows].every(({ shadow }) => shadow === false));
                // (Its pieces drawn a kind at once in squares wider than the rock's)
                assert.ok(KIT.lot > CAVERNS.tile && placements.filter(({ model }) => model !== KEEP_KIT.bell).every(({ lot }) => lot === KIT.lot));

                for (const each of placements) {
                    assert.ok(!rock(map, each.x, each.z), `${seed}/${k}: ${each.model} at ${each.x.toFixed(2)}, ${each.z.toFixed(2)} on the rock`);
                    assert.ok(!air(map, each.x, each.z), `${seed}/${k}: ${each.model} at ${each.x.toFixed(2)}, ${each.z.toFixed(2)} in the air`);
                    assert.equal(each.cut, each.model === KEEP_KIT.column ? "solid" : true);
                    assert.ok(Object.values(KEEP_KIT).includes(each.model));
                }

                // (No pilaster or window on a torch)
                const torches = map.dungeon.lights.filter(({ kind }) => kind === "torch").map(({ at: [x, y] }) => [x + 0.5, y + 0.5]);

                for (const { x, z } of [...pilasters, ...windows]) {
                    assert.ok(torches.every(([tx, tz]) => Math.hypot(tx - x, tz - z) >= KIT.torch + 0.5 - 1e-9));
                }
            });
        }
    });

    it("stands the castle's column in each pillar's place, as tall as the hall, and hangs its bell over the bell chamber's altar", () => {
        const floors = floorsOf(7);

        floors.forEach((map, k) => {
            const placements = kitPlacements(map, { tall: TALL });
            const pillars = map.pieces.filter(({ kind }) => kind === "pillar");
            const columns = placements.filter(({ model }) => model === KEEP_KIT.column);

            assert.equal(columns.length, pillars.length);
            assert.ok(columns.every(({ fit }) => fit[1] === TALL));
            // (In the Bell Chamber, the Prior's arena over the belfry's floor)
            assert.equal(placements.filter(({ model }) => model === KEEP_KIT.bell).length, k === 4 ? 1 : 0, `floor ${k + 1}'s bell`);
        });

        const [bell] = kitPlacements(floors[4], { tall: TALL }).filter(({ model }) => model === KEEP_KIT.bell);
        const altar = floors[4].pieces.find(({ kind, x, y, w, h }) => kind === "altar" && Math.abs(x + w / 2 - bell.x) < 1e-9 && Math.abs(y + h / 2 - bell.z) < 1e-9);

        assert.ok(altar, "over the altar");
        assert.ok(bell.y + KIT.bell <= TALL);
    });

    it("is the same wherever it's drawn", () => {
        const [a, b] = [floorsOf(11), floorsOf(11)];

        assert.deepEqual(a.map((map) => kitPlacements(map, { tall: TALL })), b.map((map) => kitPlacements(map, { tall: TALL })));
    });
});
