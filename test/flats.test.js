// Camps pitched on the flattest ground near where the plan puts them (core/terrain/flats.js), and
// the sites that would rather lie high or low set down where they do, on a mound or in a hollow
// (core/sites.js LIE)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildWorld, CAMP_FARTHER, CHUNK } from "../client/js/core/overworld.js";
import { isNeutral, LIE } from "../client/js/core/sites.js";
import { FLATS, flatSpot } from "../client/js/core/terrain/flats.js";
import { heightAt } from "../client/js/core/terrain/height.js";

// How far the land at the edge of a disc ([x, y], radius) stands from a level, at most (metres)
const offLevel = (plan, [x, y], radius, level) =>
    Math.max(...Array.from({ length: 16 }, (_, k) => Math.abs(heightAt(plan, x + Math.cos((k * Math.PI) / 8) * radius, y + Math.sin((k * Math.PI) / 8) * radius) - level)));

describe("level ground for what stands on it (terrain/flats.js, sites.js)", () => {
    let overworld;

    before(() => {
        overworld = buildWorld({ seed: 1 }).maps.town;
    });

    it("pitches every camp on the flattest ground near its cell, clear of the places, its pad never far out of the land or into it", () => {
        const { plan } = overworld;
        let [moved, farther] = [0, 0];

        for (const camp of plan.camps) {
            const at = overworld.campAt(camp);
            const level = overworld.ground.levelOf({ id: `camp ${camp.id}`, at, radius: 10 });
            const off = Math.hypot(at[0] - camp.at[0], at[1] - camp.at[1]);

            // (Near its cell; further only where all near it is a place's ground, a citadel's)
            assert.ok(off <= FLATS.reach * CAMP_FARTHER + 1e-9, camp.id);
            farther += off > FLATS.reach + 1e-9 ? 1 : 0;
            // (Never on a site's, a settlement's, an arch's or a pier's ground)
            assert.ok(overworld.clearings.every(({ at: [x, y], radius }) => Math.hypot(at[0] - x, at[1] - y) >= radius), `${camp.id} on a place's ground`);
            assert.ok(offLevel(plan, at, 10, level) < 6, `${camp.id}: ${offLevel(plan, at, 10, level).toFixed(1)} m`);
            // (The same whenever it's asked for)
            assert.deepEqual(overworld.campAt(camp), at);
            moved += at[0] !== camp.at[0] || at[1] !== camp.at[1] ? 1 : 0;
        }

        assert.ok(moved > 10, `${moved} of ${plan.camps.length} moved`);
        assert.ok(farther <= 2, `${farther} further`);
    });

    it("finds the flattest spot on a slope, and stays put where it's flat already", () => {
        const { plan } = overworld;
        // (Somewhere a camp of seed 1's stood on a mountain's side, its pad 35 m out of the land)
        const camp = plan.camps.find(({ id }) => id === "camp-32");
        const spot = flatSpot(plan, camp.at, { size: 8192 });
        const range = ([x, y]) => {
            const heights = [-16, -8, 0, 8, 16].flatMap((dy) => [-16, -8, 0, 8, 16].map((dx) => heightAt(plan, x + dx, y + dy)));

            return Math.max(...heights) - Math.min(...heights);
        };

        assert.ok(range(spot) < range(camp.at) / 3, `${range(spot).toFixed(1)} m against ${range(camp.at).toFixed(1)}`);

        // (The start town's middle: farmland, flat)
        const town = buildWorld({ seed: 1 }).stamp.middle.map(Math.round);
        const near = flatSpot(plan, town, { size: 8192 });

        assert.ok(Math.hypot(near[0] - town[0], near[1] - town[1]) <= FLATS.reach);
        assert.ok(range(near) <= range(town));
    });

    it("sets each castle and high place on a rise, on its mound; and the pools in a hollow", () => {
        const { plan } = overworld;
        let [high, low] = [0, 0];

        // (Those on pads: not the watchtowers no one keeps, broken and lying with the land)
        for (const site of plan.sites.filter((each) => LIE[each.kind] && !isNeutral(each))) {
            overworld.sites.settle(Math.floor(site.at[0] / CHUNK), Math.floor(site.at[1] / CHUNK));

            const set = overworld.sites.set.get(site.id);

            if (!set) {
                continue;
            }

            const { raise } = LIE[site.kind];

            // (The humans' castle a hill citadel: its middle on its inner ward's terrace, each ward
            // a terrace higher than the one round it, the outer on its hill over the land, its
            // moat's bed dug down into the hill: its pads the glacis, the moat's bed, then the wards)
            if (set.citadel) {
                const [glacis, bed, ...wards] = set.pads;

                assert.ok(Math.abs(overworld.heightAt(set.x, set.y) - set.pads.at(-1).level) < 0.01, `${site.id} on its inner ward`);
                assert.ok(
                    wards.every((pad, k) => !k || pad.level > wards[k - 1].level),
                    site.id,
                );
                assert.ok(bed.level < glacis.level && wards[0].level === glacis.level, site.id);
                high++;
                continue;
            }

            const pad ={ id: `site ${site.id}`, at: [set.x, set.y], radius: set.radius, raise };
            const level = overworld.ground.levelOf(pad);
            const under = overworld.ground.levelOf({ ...pad, id: `${pad.id} as it lay`, raise: 0 });

            // (Its ground stands above (or below) the land's under it as far as it's raised)
            assert.ok(Math.abs(level - under - raise) < 0.01, site.id);
            // (And stands there: what's built is on it)
            assert.ok(Math.abs(overworld.heightAt(set.x, set.y) - level) < 0.01, `${site.id} on its pad`);

            high += raise > 0 ? 1 : 0;
            low += raise < 0 ? 1 : 0;
        }

        assert.ok(high >= 6 && low >= 2, `${high} high, ${low} low`);
    });
});
