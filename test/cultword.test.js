// What's said of the hells' cults where the player's talking (client/js/core/cultword.js): of the
// nearest one to the town, which way it is always true, more of it the nearer; never what it is.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CULT_WORD, cultNear, cultWays, cultWord } from "../client/js/core/cultword.js";
import { compass } from "../client/js/core/standing.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const plans = [1, 2, 3].map((seed) => planWorld(seed));
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("word of the hells' cults (cultword.js)", () => {
    it("tells of the nearest hell to a town, which way it is from there, more of it the nearer: near, what stands by it", () => {
        for (const plan of plans) {
            const hells = plan.sites.filter(({ theme }) => theme === "hell");

            for (const place of plan.places) {
                const near = cultNear(plan, place.at);
                const nearest = Math.min(...hells.map(({ at }) => far(at, place.at)));

                assert.equal(far(near.site.at, place.at), nearest, place.id);
                assert.equal(near.dir, compass(place.at, near.site.at));
                // (Near as far out as its closest settlements, if they're farther)
                const reach = Math.max(CULT_WORD.near, plan.places.map(({ at }) => far(at, near.site.at)).sort((a, b) => a - b)[CULT_WORD.closest - 1]);

                assert.equal(near.band, nearest <= reach ? "near" : nearest <= Math.max(CULT_WORD.middle, reach) ? "middle" : "far");

                // (What stands by it named only near, and only if something does)
                const by = plan.sites.filter((site) => site !== near.site && site.theme !== "hell" && far(site.at, near.site.at) <= CULT_WORD.landmark);

                assert.ok(near.landmark === null || (near.band === "near" && by.length > 0), `${place.id}: ${near.landmark}`);
            }

            // (Each hell heard of as near in some settlement or other)
            for (const hell of hells) {
                assert.ok(
                    plan.places.some((place) => cultNear(plan, place.at).site === hell && cultNear(plan, place.at).band === "near"),
                    hell.id,
                );
            }
        }
    });

    it("says which way, and near, after dark; never what it is", () => {
        const [plan] = plans;

        for (const place of plan.places) {
            const near = cultNear(plan, place.at);

            for (let which = 0; which < cultWays(near.band); which++) {
                const said = cultWord(near, place.name, which);

                assert.ok(said.includes(near.dir), said);
                assert.doesNotMatch(said, /[{}]/, said);
                assert.doesNotMatch(said, /\b(hells?|portals?|demons?|gates?)\b/i, said);

                if (near.band === "near") {
                    assert.match(said, /night|dark/i, said);
                }
            }
        }

        // (None in a world with no hell)
        assert.equal(cultNear({ sites: plan.sites.filter(({ theme }) => theme !== "hell") }, plan.places[0].at), null);
    });
});
