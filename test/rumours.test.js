// Rumours of places nearby (client/js/core/rumours.js): of the places round a town still to be
// found, the nearest first; which way each is from the town always true, what stands by it, and a
// tall tale; the same said every time; and the circle each draws on the world map, the place
// always inside it
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Explored } from "../client/js/core/explored.js";
import { circleOf, landmarkOf, RUMOURED, rumouredBy, rumouredOf, RUMOURS, rumoursNear, rumourWord } from "../client/js/core/rumours.js";
import { compass } from "../client/js/core/ways.js";
import { CHUNK, planWorld } from "../client/js/core/worldplan/plan.js";

const plans = [1, 2].map((seed) => planWorld(seed));
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const towns = (plan) => plan.places.filter(({ kind }) => ["capital", "city", "town", "village"].includes(kind));

describe("rumours of places nearby (rumours.js)", () => {
    it("tells of the places worth finding (dungeons but the hells, ruins, caves, lairs, shrines, stones, the wild's watchtowers and camps), each by its kind", () => {
        for (const plan of plans) {
            const told = rumouredOf(plan);
            const ids = new Set(told.map(({ id }) => id));

            assert.ok(told.every(({ kind }) => RUMOURED.includes(kind)));
            assert.ok(plan.sites.filter(({ theme }) => theme === "hell").every(({ id }) => !ids.has(id)), "not the hells");
            assert.ok(plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell").every(({ id }) => ids.has(id)), "every other dungeon");
            assert.ok(plan.sites.filter(({ kind }) => ["ruins", "cave", "shrine", "standing stones", "ruined castle"].includes(kind)).every(({ id }) => ids.has(id)));
            assert.ok(plan.sites.filter(({ kind, race }) => kind === "watchtower" && race).every(({ id }) => !ids.has(id)), "not a people's own watchtowers");
            assert.ok(plan.camps.every(({ id }) => ids.has(id)), "every wild camp");
            assert.ok(plan.sites.filter(({ kind }) => ["castle", "manor", "graveyard", "mine"].includes(kind)).every(({ id }) => !ids.has(id)));
            assert.ok(told.every((one) => rumouredBy(plan, one.id) === one));
            assert.equal(rumouredBy(plan, "no-such-place"), null);
        }
    });

    it("gives the nearest places round a town still to be found, within reach, the nearest first; none the player's found", () => {
        const [plan] = plans;
        const explored = new Explored();

        for (const town of towns(plan)) {
            const near = rumoursNear(plan, town.at, explored);
            const all = rumouredOf(plan).filter(({ at }) => far(at, town.at) <= RUMOURS.reach);

            assert.deepEqual(new Set(near.map(({ id }) => id)), new Set(all.map(({ id }) => id)), town.id);
            assert.ok(near.every((one, k) => k === 0 || near[k - 1].far <= one.far), "nearest first");
        }

        // (Found: gone from them, as its icon comes on the maps)
        const town = towns(plan)[0];
        const [first, second] = rumoursNear(plan, town.at, explored);

        explored.visit(first.at[0] + CHUNK, first.at[1]);
        assert.ok(explored.sighted(...first.at));
        assert.equal(rumoursNear(plan, town.at, explored).find(({ id }) => id === first.id), undefined);
        assert.ok(rumoursNear(plan, town.at, explored).some(({ id }) => id === second.id) || explored.sighted(...second.at));
    });

    it("says which way it is from the town, always true, and what stands by it, nearer it than the town: a farm by its farmer, else how far on foot; the same every time", () => {
        let farms = 0;

        for (const plan of plans) {
            for (const town of towns(plan)) {
                for (const place of rumoursNear(plan, town.at, new Explored()).slice(0, 6)) {
                    const words = rumourWord(plan, place, town);
                    const by = landmarkOf(plan, place, town);

                    assert.ok(words.includes(` ${compass(town.at, place.at)} of town`), words);
                    assert.doesNotMatch(words, /[{}]|undefined|null/, words);
                    assert.equal(rumourWord(plan, place, town), words, "the same every time");

                    if (by) {
                        const landmark = plan.places.find(({ name }) => name === by.name);

                        assert.ok(far(landmark.at, place.at) <= RUMOURS.landmark && far(landmark.at, place.at) < far(town.at, place.at), words);
                        assert.notEqual(landmark.id, town.id);
                        assert.ok(words.includes(by.farmer ? `out by old ${by.farmer}'s farm at ${by.name}` : `out by ${by.name}`), words);
                        assert.equal(Boolean(by.farmer), landmark.kind === "farmstead");
                        farms += by.farmer ? 1 : 0;
                    } else {
                        assert.ok(words.includes(far(place.at, town.at) <= RUMOURS.walk ? "not an hour's walk" : "an hour or two on foot"), words);
                    }
                }
            }
        }

        assert.ok(farms > 20, `farms named: ${farms}`);
    });

    it("draws a circle round about each place on the world map, the place always inside it, never at its middle; the same for everyone", () => {
        for (const place of rumouredOf(plans[0])) {
            const { at, radius } = circleOf(place.id, place.at);
            const off = far(at, place.at);

            assert.equal(radius, RUMOURS.radius);
            assert.ok(off >= RUMOURS.off[0] * radius - 1e-9 && off <= RUMOURS.off[1] * radius + 1e-9, `${place.id}: ${off}`);
            assert.deepEqual(circleOf(place.id, place.at), { at, radius });
        }
    });
});
