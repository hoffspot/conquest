// Places worth finding (client/js/core/places.js; the terrain plan's M7.5): every site and wild camp
// a place on the maps, who holds each (mixed by the war, a world at a time), cleared and retaken
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ICON_KINDS, PLACE_RIMS } from "../client/js/app/mapicons.js";
import { heldAtStart, HOLDERS, holderOf, PLACE_KINDS, PLACE_TIMES, placeOf, placesOf } from "../client/js/core/places.js";
import { War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

describe("places worth finding (places.js)", () => {
    let plans;

    before(() => {
        plans = [1, 2, 3].map((seed) => planWorld(seed));
    });

    it("are every site and wild camp in a world, each with its icon on the maps and who may hold it", () => {
        for (const plan of plans) {
            const places = placesOf(plan);

            assert.equal(places.length, plan.sites.length + plan.camps.length, "every site and camp a place");
            assert.equal(placesOf(plan), places, "worked out once");

            for (const place of places) {
                assert.ok(PLACE_KINDS[place.kind], place.kind);
                assert.ok(ICON_KINDS.includes(place.icon), `${place.kind}'s icon ${place.icon}`);
                assert.ok(["small", "medium", "large"].includes(place.size));
                assert.ok(place.holds.every((holder) => HOLDERS.includes(holder)));
            }
        }

        // (A kind not a place's: none)
        assert.equal(placeOf({ id: "x", kind: "nothing", at: [0, 0] }), null);
        assert.ok(Object.values(PLACE_RIMS).length === HOLDERS.length + 1);
    });

    it("are held at the start as the war has it: castles by their people, the ruins by the dead, caves and wild towers by outlaws, the lair by the dragon, holy stones by no one", () => {
        for (const plan of plans) {
            for (const place of placesOf(plan)) {
                const held = heldAtStart(plan, place);

                assert.equal(heldAtStart(plan, place), held, "the same every time");

                if (place.kind === "castle") {
                    assert.equal(held, "friendly");
                } else if (place.kind === "ruins" || place.kind === "ruined castle") {
                    assert.equal(held, "dead");
                } else if (place.kind === "cave" || (place.kind === "watchtower" && !place.race)) {
                    assert.equal(held, "bandits");
                } else if (place.kind === "dragon's lair") {
                    assert.equal(held, "beast");
                } else if (place.kind === "shrine" || place.kind === "standing stones" || place.kind === "camp") {
                    assert.equal(held, null);
                } else {
                    assert.ok(place.holds.includes(held), `${place.kind}: ${held}`);
                }
            }
        }

        // A people's places that may be taken: bandits hold about PLACE_TIMES.taken of them
        const takeable = plans.flatMap((plan) => placesOf(plan).filter((place) => place.race && place.holds.length > 1).map((place) => heldAtStart(plan, place)));
        const taken = takeable.filter((held) => held === "bandits").length / takeable.length;

        assert.ok(takeable.length > 60, `${takeable.length}`);
        assert.ok(Math.abs(taken - PLACE_TIMES.taken) < 0.12, `${taken} taken`);
    });

    it("empty a while once cleared, then held again; a people's own never cleared", () => {
        const [plan] = plans;
        const places = placesOf(plan);
        const ruins = places.find((place) => place.kind === "ruins");
        const castle = places.find((place) => place.kind === "castle");
        const kept = { cleared: 100, times: 1 };

        assert.equal(holderOf(plan, ruins, undefined, 100), "dead");
        assert.equal(holderOf(plan, ruins, kept, 100), "cleared");
        assert.equal(holderOf(plan, ruins, kept, 100 + PLACE_TIMES.retake - 1), "cleared");
        assert.equal(holderOf(plan, ruins, kept, 100 + PLACE_TIMES.retake), "dead", "the dead rise again");
        assert.equal(holderOf(plan, castle, kept, 100), "friendly");
    });

    it("cleared as the war keeps it, kept with the war and carried on from its snapshot", () => {
        const [plan] = plans;
        const war = new War(plan);

        war.turn = 7;
        war.clearPlace("ruins-3");
        war.turn = 300;
        war.clearPlace("ruins-3");
        assert.deepEqual(war.places["ruins-3"], { cleared: 300, times: 2 });

        const again = War.restore(plan, war.snapshot());

        assert.deepEqual(again.places, war.places);

        // (A war kept before places were cleared carries on with none cleared)
        const old = war.snapshot();

        delete old.places;
        assert.deepEqual(War.restore(plan, old).places, {});
    });
});
