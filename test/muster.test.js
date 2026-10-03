// The war come to life near a player (client/js/core/war/muster.js): where a town's guards stand
// (in pairs either side of each road out, facing out, past its edge) and the rounds its patrols
// walk (just outside its edge), the same every time for a place
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { bannersOf, braziersOf, PATROL_SIZE, POSTED, postsOf, roundsOf } from "../client/js/core/war/muster.js";
import { HOLDINGS } from "../client/js/core/war/war.js";
import { waysOut } from "../client/js/core/settlements.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

describe("mustering a town (muster.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    it("posts as many guards as a place of its kind does, just past its edge, facing out", () => {
        for (const place of plan.places.filter(({ kind }) => kind in POSTED)) {
            const posts = postsOf(plan, place);
            const radius = SETTLEMENT_KINDS[place.kind].radius;

            assert.equal(posts.length, POSTED[place.kind], place.id);

            for (const { at, facing } of posts) {
                const out = apart(at, place.at);

                assert.ok(out > radius && out < radius + 10, `${place.id} ${out}`);

                // (Facing out: the way it faces points away from the middle)
                const [dx, dy] = [Math.sin(facing), Math.cos(facing)];

                assert.ok(dx * (at[0] - place.at[0]) + dy * (at[1] - place.at[1]) > 0, place.id);
            }
        }

        assert.deepEqual(postsOf(plan, plan.places.find(({ kind }) => kind === "hamlet")), []);
    });

    it("stands the guards in pairs either side of each road out", () => {
        const place = plan.places.find((each) => each.kind === "town" && waysOut(plan, each).length >= 2);
        const roads = waysOut(plan, place);
        const posts = postsOf(plan, place);

        for (const [k, angle] of roads.slice(0, POSTED.town / 2).entries()) {
            const [a, b] = posts.slice(k * 2, k * 2 + 2);
            const middle = [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2];
            const along = Math.atan2(middle[1] - place.at[1], middle[0] - place.at[0]);

            assert.ok(Math.abs(Math.atan2(Math.sin(along - angle), Math.cos(along - angle))) < 1e-6);
            assert.ok(Math.abs(apart(a.at, b.at) - 5) < 1e-6, "(5 m apart, across the road)");
        }
    });

    it("sends each town's patrols round it, just outside its edge, each round the other way", () => {
        for (const place of plan.places.filter(({ kind }) => kind in HOLDINGS)) {
            const rounds = roundsOf(plan, place);
            const radius = SETTLEMENT_KINDS[place.kind].radius;

            assert.equal(rounds.length, HOLDINGS[place.kind].patrols, place.id);

            for (const round of rounds) {
                assert.equal(round.length, 6);

                for (const point of round) {
                    assert.ok(Math.abs(apart(point, place.at) - radius - 10) < 1e-6);
                }
            }
        }

        assert.equal(PATROL_SIZE, 2);
    });

    it("stands a banner beside each road out with guards at it, a little further out, at the road's side", () => {
        for (const place of plan.places.filter(({ kind }) => kind in POSTED)) {
            const posts = postsOf(plan, place);
            const banners = bannersOf(plan, place);

            assert.equal(banners.length, Math.floor(posts.length / 2), place.id);

            for (const [k, banner] of banners.entries()) {
                const [a, b] = [posts[k * 2], posts[k * 2 + 1]];

                // (3 m further out than them, just beyond the one on its side)
                const middle = [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2];

                assert.ok(Math.abs(apart(banner.at, place.at) - apart(middle, place.at) - 3) < 0.2, place.id);
                assert.ok(apart(banner.at, a.at) < apart(banner.at, b.at));
                assert.equal(banner.facing, a.facing);
            }
        }
    });

    it("burns a brazier by each pair of guards, on the other side of the road from their banner, a step out past them", () => {
        for (const place of plan.places.filter(({ kind }) => kind in POSTED)) {
            const posts = postsOf(plan, place);
            const [banners, braziers] = [bannersOf(plan, place), braziersOf(plan, place)];

            assert.equal(braziers.length, banners.length, place.id);

            for (const [k, brazier] of braziers.entries()) {
                const [a, b] = [posts[k * 2], posts[k * 2 + 1]];

                assert.ok(apart(brazier.at, b.at) < apart(brazier.at, a.at), `${place.id}: by the other guard`);
                assert.ok(apart(brazier.at, b.at) > 1 && apart(brazier.at, b.at) < 2.5, `${place.id}: a step or so from them`);
                assert.ok(apart(brazier.at, banners[k].at) > 3, `${place.id}: across the road from the banner`);
            }
        }
    });

    it("follows the town where it's set in (the player's town, a little off its place)", () => {
        const place = plan.places.find(({ kind }) => kind === "town");
        const middle = [place.at[0] + 7, place.at[1] - 3];
        const [moved, still] = [postsOf(plan, place, { middle }), postsOf(plan, place)];

        for (const [k, { at }] of moved.entries()) {
            assert.ok(Math.abs(at[0] - still[k].at[0] - 7) < 1e-6 && Math.abs(at[1] - still[k].at[1] + 3) < 1e-6);
        }

        assert.deepEqual(postsOf(plan, place), still, "(the same every time)");
    });
});
