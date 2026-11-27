// Asking another player to a party, a duel or a trade (client/js/core/host.js ASKING; the scaling
// plan's 2-34): one asking of a kind to a player at a time, and a minute from asking them before
// the same can be asked again, unless they said yes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { ASKING, DUEL, HOST_PLAYER, Host, PARTY, REFUSALS, TRADE } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    for (let t = 0; t < ms; t += STEP_MS) {
        host.advance(STEP_MS);
    }
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with its player (Ada), and Bea and Cy beside her
function together() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
    host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });

    const me = host.battle.actor(HOST_PLAYER);
    const [x, y] = me.square;

    put(host.battle.actor("bea"), me.map, [x + 2, y]);
    put(host.battle.actor("cy"), me.map, [x, y + 2]);

    return host;
}

const party = (host, id, what, more = {}) => host.command(id, { type: "party", do: what, ...more });
const duel = (host, id, what, more = {}) => host.command(id, { type: "duel", do: what, ...more });
const trade = (host, id, other) => host.command(id, { type: "trade", with: other });

describe("asking another player (host.js ASKING; the scaling plan's 2-34)", () => {
    it("holds one who's asked back from asking the same of the same player for a minute, said no to or unanswered; another player, and another kind of asking, not", () => {
        const host = together();

        assert.deepEqual(ASKING, { again: 60000, kinds: ["party", "duel", "trade"] });
        assert.ok(REFUSALS.askedLately);
        assert.ok(ASKING.again > Math.max(PARTY.askMs, DUEL.askMs, TRADE.asking), "(longer than any asking stands: one at a time to a pair)");

        // A party: asked, said no to, and asked again at once
        assert.ok(party(host, HOST_PLAYER, "invite", { who: "bea" }).ok);
        assert.equal(party(host, HOST_PLAYER, "invite", { who: "bea" }).reason, "asked", "(while it stands)");
        assert.ok(party(host, "bea", "decline").ok);
        assert.equal(party(host, HOST_PLAYER, "invite", { who: "bea" }).reason, "askedLately");
        assert.equal(host.invitation("bea"), null, "(nothing asked of her)");

        // Another may ask her, and she another; Ada may ask Cy, and ask Bea something else
        assert.ok(party(host, "cy", "invite", { who: "bea" }).ok);
        assert.ok(party(host, "bea", "decline").ok);
        assert.ok(party(host, HOST_PLAYER, "invite", { who: "cy" }).ok);
        assert.ok(party(host, "cy", "decline").ok);
        assert.ok(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok);
        assert.ok(duel(host, "bea", "decline").ok);
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).reason, "askedLately");

        // Kept with the world: a copy holds her back as long
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.equal(party(again, HOST_PLAYER, "invite", { who: "bea" }).reason, "askedLately");
        assert.equal(duel(again, HOST_PLAYER, "ask", { who: "bea" }).reason, "askedLately");

        // A minute from the asking, less a moment: still held; the minute up: asked
        run(host, ASKING.again - 1000);
        assert.equal(party(host, HOST_PLAYER, "invite", { who: "bea" }).reason, "askedLately");
        run(host, 1000);
        assert.ok(party(host, HOST_PLAYER, "invite", { who: "bea" }).ok);

        // Unanswered, it lapses after half a minute: held for the rest of the minute all the same
        run(host, PARTY.askMs + 1000);
        assert.equal(host.invitation("bea"), null);
        assert.equal(party(host, HOST_PLAYER, "invite", { who: "bea" }).reason, "askedLately");
        run(host, ASKING.again - PARTY.askMs);
        assert.ok(party(host, HOST_PLAYER, "invite", { who: "bea" }).ok);

        // (Nothing kept of what's too old to hold anyone back)
        assert.deepEqual(host.snapshot().askedLately.map(([key]) => key), ["party|player|bea"]);
        run(host, ASKING.again);
        assert.equal(host.snapshot().askedLately, undefined);
    });

    it("holds no one back who was said yes to: a party left, a duel yielded and a trade called off can each be asked again at once", () => {
        const host = together();

        // A party joined, then left
        assert.ok(party(host, HOST_PLAYER, "invite", { who: "bea" }).ok);
        assert.ok(party(host, "bea", "accept").ok);
        assert.ok(party(host, "bea", "leave").ok);
        assert.equal(host.partyFor("bea"), null);
        assert.ok(party(host, HOST_PLAYER, "invite", { who: "bea" }).ok);
        assert.ok(party(host, "bea", "decline").ok);

        // A duel fought, then yielded
        assert.ok(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok);
        assert.ok(duel(host, "bea", "accept").ok);
        run(host, DUEL.startMs + STEP_MS);
        assert.ok(duel(host, "bea", "yield").ok);
        run(host, STEP_MS);
        assert.ok(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok);
        assert.ok(duel(host, "bea", "decline").ok);
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).reason, "askedLately");

        // A trade begun (by asking back, which is no asking of its own), then called off
        assert.deepEqual(trade(host, HOST_PLAYER, "bea").open, false);
        assert.deepEqual(trade(host, "bea", HOST_PLAYER).open, true);
        assert.ok(host.command("bea", { type: "cancel" }).ok);
        assert.deepEqual(trade(host, HOST_PLAYER, "bea").open, false, "asked again at once");

        // Said no to (called off before it's begun): held; her asking back begins it all the same
        assert.ok(host.command("bea", { type: "cancel", with: HOST_PLAYER }).ok);
        assert.equal(trade(host, HOST_PLAYER, "bea").reason, "askedLately");
        assert.deepEqual(trade(host, "bea", HOST_PLAYER).open, false, "(hers to ask)");
        assert.deepEqual(trade(host, HOST_PLAYER, "bea").open, true, "(and Ada's yes is no asking)");
    });
});
