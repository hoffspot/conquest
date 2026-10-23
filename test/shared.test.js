// Shared finds and pings (docs/GAME.md *Playing in a party*; client/js/core/host.js #share, the
// "party" command's "ping"): what one of a party finds out in the world is found by the rest of it
// too, kept by them for good, the places worth finding with who found them; and a ping, somewhere
// on the map shown the whole party for a while, nothing of it kept
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Explored } from "../client/js/core/explored.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { placesOf } from "../client/js/core/places.js";
import { decode, encode } from "../client/js/core/wire.js";
import { CHUNK, WORLD_SIZE } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { map: "town", square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });
const party = (host, id, what, rest = {}) => host.command(id, { type: "party", do: what, ...rest });

// A world (seed 2) with its player (Ada) and two guests in it, Bea in a party with Ada and Cy not
// in it; and, of the places worth finding, two none of them has found
function together() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
    host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });
    party(host, HOST_PLAYER, "invite", { who: "bea" });
    party(host, "bea", "accept");

    const players = [HOST_PLAYER, "bea", "cy"].map((id) => host.players.get(id));
    const unfound = placesOf(host.world.plan).filter(({ at: [x, y] }) => x > 300 && y > 300 && x < WORLD_SIZE - 300 && y < WORLD_SIZE - 300 && players.every(({ explored }) => !explored.sighted(x, y)));
    const [first, second] = [unfound[0], unfound.find(({ at }) => Math.hypot(at[0] - unfound[0].at[0], at[1] - unfound[0].at[1]) > 600)];

    return { host, first, second, ada: players[0], bea: players[1], cy: players[2] };
}

// A player taken to stand at a place (its square), and the world on a moment
function goTo(host, id, place) {
    put(host.battle.actor(id), [Math.floor(place.at[0]), Math.floor(place.at[1])]);

    return run(host, 200);
}

describe("shared finds (host.js #share)", () => {
    it("finds where one of a party goes for the rest of it too: the chunk, and the places round it, kept as theirs, who found them said", () => {
        const { host, first, ada, bea, cy } = together();
        const events = goTo(host, HOST_PLAYER, first);

        assert.equal(ada.explored.sighted(...first.at), true);
        assert.equal(bea.explored.visitedAt(...first.at), true, "(the chunk Ada's in, Bea's found too)");
        assert.equal(bea.explored.sighted(...first.at), true);
        assert.equal(cy.explored.sighted(...first.at), false, "(not in the party)");

        // (Ada found it: Bea told, and it's kept by her as Ada's find; Ada's own find is just hers)
        assert.equal(bea.explored.finderOf(first.id), "Ada");
        assert.equal(ada.explored.finderOf(first.id), null);

        const told = events.find(({ type, id, places }) => type === "explored" && id === "bea" && places?.includes(first.id));

        assert.deepEqual({ by: told.by, name: told.name }, { by: HOST_PLAYER, name: "Ada" });
        assert.ok(!events.some(({ type, id, by }) => type === "explored" && id === "cy" && by));
    });

    it("never credits a place to another that the player had found already: seen from a chunk next to it, before they were in the party", () => {
        const { host, first, ada, bea } = together();
        const beside = { at: [first.at[0] + CHUNK, first.at[1]] };

        party(host, "bea", "leave");
        goTo(host, "bea", beside);
        assert.equal(bea.explored.sighted(...first.at), true);
        assert.equal(bea.explored.visitedAt(...first.at), false);
        assert.equal(ada.explored.sighted(...first.at), false, "(not in a party: nothing shared)");
        party(host, HOST_PLAYER, "invite", { who: "bea" });
        party(host, "bea", "accept");

        const events = goTo(host, HOST_PLAYER, first);

        assert.equal(bea.explored.visitedAt(...first.at), true, "(the chunk's hers now)");
        assert.equal(bea.explored.finderOf(first.id), null, "(but she'd found the place herself)");
        assert.ok(!events.some(({ type, id, places }) => type === "explored" && id === "bea" && places), "(nothing new to tell her)");
    });

    it("finds a building one of a party goes into for the rest of it too", () => {
        const { host, bea, cy } = together();
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        assert.equal(bea.explored.hasEntered(guild.key), false);
        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });

        // (A walk to its door)
        const events = run(host, 20000);

        assert.equal(host.players.get(HOST_PLAYER).explored.hasEntered(guild.key), true);
        assert.equal(bea.explored.hasEntered(guild.key), true);
        assert.equal(cy.explored.hasEntered(guild.key), false);
        assert.ok(events.some(({ type, id, building, by }) => type === "explored" && id === "bea" && building === guild.key && by === HOST_PLAYER));
        assert.equal(bea.explored.canTravelTo(guild.key), false, "(a branch's portal opens only to those who've been in it)");
    });

    it("keeps what's been found for good: after leaving the party, and in the world's snapshot and the saved character; nothing more after", () => {
        const { host, first, second, bea } = together();

        goTo(host, HOST_PLAYER, first);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.equal(again.players.get("bea").explored.finderOf(first.id), "Ada");
        assert.equal(new Explored(decode(encode(bea.explored.toJSON()))).finderOf(first.id), "Ada", "(kept with the character)");
        assert.equal(party(host, "bea", "leave").ok, true);
        goTo(host, HOST_PLAYER, second);
        assert.equal(bea.explored.sighted(...first.at), true);
        assert.equal(bea.explored.finderOf(first.id), "Ada");
        assert.equal(bea.explored.sighted(...second.at), false, "(out of the party, nothing more's shared)");
    });

    it("keeps nothing of who found what till another's found something for them (Explored's toJSON)", () => {
        const explored = new Explored();

        assert.equal("found" in explored.toJSON(), false);
        explored.foundBy("site-1", "Ada");
        explored.foundBy("site-1", "Bea");
        assert.deepEqual(explored.toJSON().found, { "site-1": "Ada" }, "(the first to find it for them)");
        assert.deepEqual(new Explored({ found: { "site-2": "Cy", "site-3": 4 } }).found, new Map([["site-2", "Cy"]]));
    });
});

describe("pings (host.js, the party command's ping)", () => {
    const pings = (events) => events.filter(({ type, change }) => type === "party" && change === "ping");

    it("shows somewhere on the map to the whole party, the one who pinged too, and no one else; nothing of it kept", () => {
        const { host } = together();
        const at = [CHUNK * 40.5, CHUNK * 60.25];

        assert.deepEqual(party(host, HOST_PLAYER, "ping", { at }), { ok: true });

        const told = pings(run(host, 100));

        assert.deepEqual(
            told.map(({ id, who, name, at }) => ({ id, who, name, at })),
            [HOST_PLAYER, "bea"].map((id) => ({ id, who: HOST_PLAYER, name: "Ada", at })),
        );
        assert.equal(JSON.stringify(host.snapshot()).includes(String(at[0])), false);
    });

    it("is refused out of a party, and anywhere off the world's map", () => {
        const { host } = together();

        assert.equal(party(host, "cy", "ping", { at: [100, 100] }).reason, "unpartied");

        for (const at of [null, [100], [-1, 100], [100, WORLD_SIZE + 1], [Number.NaN, 5], ["100", 100]]) {
            assert.equal(party(host, HOST_PLAYER, "ping", { at }).reason, "command", JSON.stringify(at));
        }

        assert.equal(pings(run(host, 100)).length, 0);
    });
});
