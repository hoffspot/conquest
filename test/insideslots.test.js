// Where a building's floors are drawn is its own by what it is in the world's plan, not by which
// buildings were made before it (client/js/core/insides.js INSIDE_SLOTS, placeSlot, siteSlot;
// generated/multiplayer_scaling_plan.md 3-11): the same in a world made again and in any copy,
// so a game told of a world by its server can make an inside as its hero goes in.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { INSIDE_SLOTS, placeSlot, siteSlot } from "../client/js/core/insides.js";
import { buildWorld } from "../client/js/core/overworld.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// A world's buildings that take a slot (not a dungeon's or a scene's, drawn in blocks of their own; nor the home tavern, made with the town)
const slotted = (world) => [...world.interiors.buildings.values()].filter(({ kind, key }) => kind !== "dungeon" && kind !== "scenery" && key !== "home:tavern");

// Each building made, in the order given: where each one's floors are drawn, by its key
function made(seed, order) {
    const world = buildWorld({ seed });

    for (const site of world.plan.sites) {
        world.maps.town.sites.heartOf(site);
    }

    const keys = order(slotted(world).map(({ key }) => key));

    for (const key of keys) {
        world.interiors.make(key);
    }

    return { world, origins: Object.fromEntries(keys.map((key) => [key, world.interiors.buildings.get(key).maps.map((id) => world.maps[id].origin)])) };
}

describe("where a building's inside is drawn (core/insides.js INSIDE_SLOTS, plan 3-11)", () => {
    it("gives a place's buildings and a site's a slot each, none shared, and none past what there's room for", () => {
        assert.equal(INSIDE_SLOTS.most, INSIDE_SLOTS.each * INSIDE_SLOTS.places + INSIDE_SLOTS.sites);
        assert.equal(placeSlot(0, 0), 0);
        assert.equal(placeSlot(3, 5), 3 * INSIDE_SLOTS.each + 5);
        assert.equal(placeSlot(INSIDE_SLOTS.places - 1, INSIDE_SLOTS.each - 1), INSIDE_SLOTS.each * INSIDE_SLOTS.places - 1);
        assert.equal(siteSlot(0), INSIDE_SLOTS.each * INSIDE_SLOTS.places);
        assert.equal(siteSlot(INSIDE_SLOTS.sites - 1), INSIDE_SLOTS.most - 1);

        for (const none of [placeSlot(-1, 0), placeSlot(0, INSIDE_SLOTS.each), placeSlot(INSIDE_SLOTS.places, 0), placeSlot(0.5, 0), siteSlot(-1), siteSlot(INSIDE_SLOTS.sites)]) {
            assert.equal(none, null);
        }
    });

    it("has room for every place and site of a world, and every building of it a slot of its own", () => {
        const { world } = made(1, () => []);
        const buildings = slotted(world);
        const slots = buildings.map(({ slot }) => slot);

        assert.ok(world.plan.places.length <= INSIDE_SLOTS.places, `${world.plan.places.length} places`);
        assert.ok(world.plan.sites.length <= INSIDE_SLOTS.sites, `${world.plan.sites.length} sites`);
        assert.ok(buildings.length > 100, `${buildings.length} buildings`);
        assert.deepEqual(buildings.filter(({ slot }) => !Number.isInteger(slot)).map(({ key }) => key), []);
        assert.equal(new Set(slots).size, slots.length);
        assert.ok(Math.max(...slots) < INSIDE_SLOTS.most);
        // (The home town's by its place in the plan, the sites' in their block)
        assert.ok(buildings.filter(({ place }) => place === "home").every(({ slot }) => Math.floor(slot / INSIDE_SLOTS.each) === world.plan.places.findIndex(({ id }) => id === world.start.id)));
        assert.ok(buildings.filter(({ place }) => place === "site").every(({ slot }) => slot >= INSIDE_SLOTS.each * INSIDE_SLOTS.places));
    });

    it("draws each building's floors in the same place whichever were made before it: forwards, backwards, or alone", () => {
        const forwards = made(1, (keys) => keys);
        const backwards = made(1, (keys) => [...keys].reverse());

        assert.ok(Object.keys(forwards.origins).length > 100);
        assert.deepEqual(backwards.origins, forwards.origins);

        const [one] = Object.keys(forwards.origins).slice(40);

        assert.deepEqual(made(1, () => [one]).origins[one], forwards.origins[one]);

        // (And no two buildings' floors in one place)
        const places = Object.values(forwards.origins).flat().map(([x, y]) => `${x},${y}`);

        assert.equal(new Set(places).size, places.length);
    });

    it("draws a settlement's buildings so too, as the settlement's laid out: a hero's walk in a world played, and the same world made again", () => {
        const origins = () => {
            const world = buildWorld({ seed: 2 });
            const host = new Host(world, { populate: false });

            host.join({ id: HOST_PLAYER, hero: HERO });
            host.populate();

            for (let t = 0; t < 500; t += STEP_MS) {
                host.advance(STEP_MS);
            }

            const buildings = slotted(world).filter(({ place }) => place !== "site");

            assert.ok(buildings.length > 5);
            assert.ok(buildings.every(({ slot }) => Number.isInteger(slot)), "each a slot");

            return buildings.map(({ key, slot }) => [key, slot]);
        };

        assert.deepEqual(origins(), origins());
    });

    it("draws a building with no slot after them all, in the order such are made, as every building was", () => {
        const { world } = made(1, () => []);
        const [first, second] = slotted(world).filter(({ place }) => place === "site");

        first.slot = null;
        second.slot = null;
        world.interiors.make(second.key);
        world.interiors.make(first.key);

        const column = ({ maps }) => (world.maps[maps[0]].origin[0] - 10200) / 100 + (world.maps[maps[0]].origin[1] / 200) * 60;

        assert.equal(column(second), INSIDE_SLOTS.most);
        assert.equal(column(first), INSIDE_SLOTS.most + 1);
    });
});
