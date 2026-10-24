// Places seen from high ground (client/js/core/sighting.js; in play, core/host.js #spotting;
// docs/WILDS.md *Seen from high ground*): a player on a rise well above the land round them finds
// the places worth finding the land between doesn't hide, the further the higher they stand; kept
// with the character, found by their party too, and counted as found wherever being near would
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Explored } from "../client/js/core/explored.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { rumouredOf, rumoursNear } from "../client/js/core/rumours.js";
import { highGround, inSight, reachOver, SIGHTING, sightedFrom } from "../client/js/core/sighting.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// Land made up for the tests: flat at 10 m, but for a hill 60 m high at 1000, 1000 (falling away
// to the flat 300 m off) and a wall of a ridge 40 m high at x 1400 to 1420
function height(plan, x, y) {
    const far = Math.hypot(x - 1000, y - 1000);
    const hill = far < 300 ? 60 * (1 - far / 300) : 0;
    const ridge = x >= 1400 && x <= 1420 ? 40 : 0;

    return 10 + Math.max(hill, ridge);
}

describe("seeing from high ground (core/sighting.js)", () => {
    it("is only from a rise well above the land round about", () => {
        assert.equal(highGround(null, [1000, 1000], height), 70);
        assert.equal(highGround(null, [3000, 3000], height), null, "(the flat)");
        assert.equal(highGround(null, [1000 + 290, 1000], height), null, "(the hill's foot)");
    });

    it("sees further the higher the player stands over a place, within bounds", () => {
        assert.equal(reachOver(10, 10), SIGHTING.reach[0]);
        assert.equal(reachOver(70, 10), Math.min(SIGHTING.reach[1], SIGHTING.reach[0] + SIGHTING.per * 60));
        assert.equal(reachOver(500, 0), SIGHTING.reach[1]);
        assert.equal(reachOver(0, 50), SIGHTING.reach[0]);
    });

    it("sees what the land between doesn't hide, and nothing behind a ridge or past its reach", () => {
        assert.equal(inSight(null, [1000, 1000], 70, [1000, 1700], height), true, "(over the flat)");
        assert.equal(inSight(null, [1000, 1000], 70, [1600, 1000], height), false, "(behind the ridge)");
        assert.equal(inSight(null, [1000, 1000], 70, [1000, 2200], height), false, "(too far)");
    });

    it("finds of a list of places those in sight, the nearest first; none off high ground", () => {
        const places = [
            { id: "far", at: [1000, 1800] },
            { id: "near", at: [600, 1000] },
            { id: "hidden", at: [1700, 1000] },
            { id: "beyond", at: [1000, 2600] },
        ];

        assert.deepEqual(sightedFrom(null, [1000, 1000], places, height), ["near", "far"]);
        assert.deepEqual(sightedFrom(null, [3000, 3000], places, height), []);
    });
});

describe("places seen from high ground, in play (host.js #spotting)", () => {
    // A world (seed 2) with Ada and Bea in a party and Cy in none; and a rise in it with four
    // places in sight (found by scanning the world: none of them near where the players start)
    const RISE = [400, 1108];
    const SEEN = ["camp-25", "standing-stones-118", "ruins-37", "dungeon-6"];

    function together() {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
        host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });
        host.command(HOST_PLAYER, { type: "party", do: "invite", who: "bea" });
        host.command("bea", { type: "party", do: "accept" });
        run(host, 600);

        return host;
    }

    const climb = (host, id, [x, y]) => Object.assign(host.battle.actor(id), { map: "town", square: [Math.floor(x), Math.floor(y)], x, y, path: [], order: null, target: null });

    it("finds the places in sight from a rise, the nearest first, told; and for the rest of the party, as found by the player", () => {
        const host = together();
        const [ada, bea, cy] = [HOST_PLAYER, "bea", "cy"].map((id) => host.players.get(id).explored);

        assert.ok(SEEN.every((id) => !ada.spotted.has(id)));
        climb(host, HOST_PLAYER, RISE);

        const events = run(host, 1200);
        const told = events.find(({ type, id, spotted }) => type === "explored" && id === HOST_PLAYER && spotted);

        assert.deepEqual(told.spotted, SEEN);
        assert.ok(SEEN.every((id) => ada.spotted.has(id) && ada.finderOf(id) === null));
        assert.ok(SEEN.every((id) => bea.spotted.has(id) && bea.finderOf(id) === "Ada"), "(Bea finds them too, Ada's finds)");
        assert.ok(events.some(({ type, id, by, places }) => type === "explored" && id === "bea" && by === HOST_PLAYER && places?.length === SEEN.length));
        assert.ok(SEEN.every((id) => !cy.spotted.has(id)), "(not in the party)");

        // (Seen once: not told again)
        assert.ok(!run(host, 1200).some(({ type, id, spotted }) => type === "explored" && id === HOST_PLAYER && spotted));
    });

    it("counts a place spotted as found: no rumour of it, and kept with the character and in the world's snapshot", () => {
        const host = together();
        const explored = host.players.get(HOST_PLAYER).explored;
        const plan = host.world.plan;
        const told = rumouredOf(plan).find(({ id }) => id === "ruins-37");

        assert.ok(told, "(a place rumours are told of)");
        assert.ok(rumoursNear(plan, told.at, explored, { reach: 50 }).some(({ id }) => id === "ruins-37"));
        climb(host, HOST_PLAYER, RISE);
        run(host, 1200);
        assert.equal(explored.knows("ruins-37", ...told.at), true);
        assert.equal(explored.sighted(...told.at), false, "(not been near it)");
        assert.ok(!rumoursNear(plan, told.at, explored, { reach: 50 }).some(({ id }) => id === "ruins-37"));

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.ok(SEEN.every((id) => again.players.get(HOST_PLAYER).explored.spotted.has(id)));
        assert.deepEqual(new Explored(decode(encode(explored.toJSON()))).spotted, explored.spotted);
        assert.equal("spotted" in new Explored().toJSON(), false, "(none kept till something's seen)");
    });
});
