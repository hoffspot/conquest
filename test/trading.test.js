// Trading face to face (client/js/core/host.js; docs/WILDS.md): the only way anything passes
// between players. One asks another near them; once they say yes, each offers gold and things
// from their pack, and once both agree to what's offered, it all changes hands at once (or, if it
// can't all, none of it). Off when they part, or either calls it off; carried on from a snapshot,
// and the same in every copy of a world played together.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, TRADE } from "../client/js/core/host.js";
import { Hosting, Joining } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { PACK_SIZE } from "../client/js/core/progress.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// Two players side by side in the town: Ada (with 40 gold and three draughts) and Bryn (with 10
// gold and two wolf pelts)
function together() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 40, pack: [{ id: "potion", count: 3 }] } });

    const ada = host.battle.actor(HOST_PLAYER);

    host.join({ id: "bryn", hero: { ...HERO, name: "Bryn" }, progress: { gold: 10, pack: [{ id: "wolfPelt", count: 2 }] }, square: ada.square });

    return { host, ada, bryn: host.battle.actor("bryn"), progress: (id) => host.players.get(id).progress };
}

const trades = (events, id) => events.filter((event) => event.type === "trade" && event.id === id).map(({ change }) => change);

describe("trading face to face (host.js)", () => {
    it("asks, is said yes to, takes offers, and once both agree hands it all over at once", () => {
        const { host, progress } = together();

        assert.deepEqual(host.command(HOST_PLAYER, { type: "trade", with: "bryn" }), { ok: true, trade: "trade-1", open: false });

        let events = run(host, STEP_MS);

        assert.deepEqual(trades(events, "bryn"), ["asked"], "Bryn's asked");
        assert.equal(events.find((event) => event.type === "trade" && event.id === "bryn").name, "Ada");

        // (Nothing to offer till it's begun)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "offer", gold: 5, items: [] }), { ok: false, reason: "trade" });
        assert.deepEqual(host.command("bryn", { type: "trade", with: HOST_PLAYER }), { ok: true, trade: "trade-1", open: true });

        // Ada offers two draughts and 5 gold; Bryn a pelt, then (thinking better of it) both
        assert.deepEqual(host.command(HOST_PLAYER, { type: "offer", gold: 5, items: [{ id: "potion", quality: "common", count: 2 }] }), { ok: true });
        assert.deepEqual(host.command("bryn", { type: "offer", gold: 0, items: [{ id: "wolfPelt", count: 1 }] }), { ok: true });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "agree" }), { ok: true });
        assert.deepEqual(host.command("bryn", { type: "offer", gold: 0, items: [{ id: "wolfPelt", count: 2 }] }), { ok: true });
        assert.equal(host.trades.get("trade-1").agreed[HOST_PLAYER], false, "a changed offer's to be agreed to again");

        // (Neither can offer what they haven't)
        assert.deepEqual(host.command("bryn", { type: "offer", gold: 11, items: [] }), { ok: false, reason: "gold" });
        assert.deepEqual(host.command("bryn", { type: "offer", gold: 0, items: [{ id: "wolfPelt", count: 3 }] }), { ok: false, reason: "count" });
        assert.deepEqual(host.command("bryn", { type: "offer", gold: 0, items: [{ id: "wolfPelt", count: 1 }, { id: "wolfPelt", count: 2 }] }), { ok: false, reason: "count" });
        assert.deepEqual(host.command("bryn", { type: "offer", gold: 0, items: [{ id: "potion", quality: "fine", count: 1 }] }), { ok: false, reason: "count" });
        assert.deepEqual(host.command("bryn", { type: "offer", gold: -1, items: [] }), { ok: false, reason: "command" });
        assert.deepEqual(host.command("bryn", { type: "offer", items: [{ id: "nothing", count: 1 }] }), { ok: false, reason: "item" });
        assert.deepEqual(host.trades.get("trade-1").offers.bryn, { gold: 0, items: [{ id: "wolfPelt", quality: "common", count: 2 }] }, "their offer stands");

        run(host, STEP_MS);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "agree" }), { ok: true });
        assert.equal(progress(HOST_PLAYER).held("potion"), 3, "nothing's changed hands till both agree");
        assert.deepEqual(host.command("bryn", { type: "agree" }), { ok: true });

        assert.equal(host.trades.size, 0);
        assert.deepEqual([progress(HOST_PLAYER).gold, progress(HOST_PLAYER).held("potion"), progress(HOST_PLAYER).held("wolfPelt")], [35, 1, 2]);
        assert.deepEqual([progress("bryn").gold, progress("bryn").held("potion"), progress("bryn").held("wolfPelt")], [15, 2, 0]);

        events = run(host, STEP_MS);

        const done = events.find((event) => event.type === "trade" && event.id === "bryn" && event.change === "done");

        assert.deepEqual(done.got, { gold: 5, items: [{ id: "potion", quality: "common", count: 2 }] });
        assert.deepEqual(done.gave, { gold: 0, items: [{ id: "wolfPelt", quality: "common", count: 2 }] });
    });

    it("trades only with another player near, one trade at a time", () => {
        const { host, ada, bryn } = together();

        host.join({ id: "cai", hero: { ...HERO, name: "Cai" }, square: ada.square });

        assert.deepEqual(host.command(HOST_PLAYER, { type: "trade", with: HOST_PLAYER }), { ok: false, reason: "target" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "trade", with: "nobody" }), { ok: false, reason: "target" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "agree" }), { ok: false, reason: "trade" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cancel" }), { ok: false, reason: "trade" });

        // (Too far off to trade)
        const at = [...bryn.square];

        put(bryn, [ada.square[0] + 9, ada.square[1]]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "trade", with: "bryn" }), { ok: false, reason: "far" });
        put(bryn, at);

        // Ada and Bryn trading: Cai can't trade with either, and neither with Cai
        host.command(HOST_PLAYER, { type: "trade", with: "bryn" });
        host.command("bryn", { type: "trade", with: HOST_PLAYER });
        assert.deepEqual(host.command("cai", { type: "trade", with: "bryn" }), { ok: false, reason: "elsewhere" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "trade", with: "cai" }), { ok: false, reason: "trading" });

        // Asking another, then asking someone else: only the last's asked
        host.command("bryn", { type: "cancel" });
        host.command(HOST_PLAYER, { type: "trade", with: "bryn" });
        host.command(HOST_PLAYER, { type: "trade", with: "cai" });
        assert.deepEqual([...host.trades.values()].map(({ from, to }) => [from, to]), [[HOST_PLAYER, "cai"]]);

        // (Knocked down, no one asks anyone anything)
        ada.downUntil = host.battle.time + 1000;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "trade", with: "bryn" }), { ok: false, reason: "down" });
    });

    it("hands nothing over unless it can all change hands: each still has what they offered, and room for what they're given", () => {
        const { host, progress } = together();
        const open = () => {
            host.command(HOST_PLAYER, { type: "trade", with: "bryn" });
            host.command("bryn", { type: "trade", with: HOST_PLAYER });
        };

        open();
        host.command(HOST_PLAYER, { type: "offer", gold: 0, items: [{ id: "potion", count: 3 }] });
        host.command("bryn", { type: "offer", gold: 10, items: [] });
        host.command(HOST_PLAYER, { type: "agree" });

        // (Ada drinks one before Bryn agrees: it's not all there)
        progress(HOST_PLAYER).remove("potion", 1);
        assert.deepEqual(host.command("bryn", { type: "agree" }), { ok: false, reason: "changed" });
        assert.deepEqual([progress(HOST_PLAYER).gold, progress("bryn").gold, progress(HOST_PLAYER).held("potion")], [40, 10, 2], "nothing's changed hands");
        assert.deepEqual(host.trades.get("trade-1").agreed, { [HOST_PLAYER]: false, bryn: false }, "neither agrees now");
        assert.deepEqual(trades(run(host, STEP_MS), "bryn").at(-1), "failed");

        // Bryn's pack full to the brim: no room for the draughts; Ada's refused for them
        const pack = progress("bryn").pack;

        for (let slot = 0; slot < PACK_SIZE; slot++) {
            pack[slot] ??= { id: "meal", quality: slot % 2 ? "fine" : "masterwork", count: 1 };
        }

        host.command(HOST_PLAYER, { type: "offer", gold: 0, items: [{ id: "potion", count: 2 }] });
        host.command("bryn", { type: "agree" });

        const before = structuredClone([progress(HOST_PLAYER).toJSON(), progress("bryn").toJSON()]);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "agree" }), { ok: false, reason: "theirs" });
        assert.deepEqual([progress(HOST_PLAYER).toJSON(), progress("bryn").toJSON()], before, "each as they were");

        // With something of Bryn's going the other way, there's room
        host.command("bryn", { type: "offer", gold: 0, items: [{ id: "wolfPelt", count: 2 }] });
        host.command(HOST_PLAYER, { type: "agree" });
        assert.deepEqual(host.command("bryn", { type: "agree" }), { ok: true });
        assert.deepEqual([progress("bryn").held("potion"), progress(HOST_PLAYER).held("wolfPelt")], [2, 2]);
    });

    it("is off when the two part, either's fallen or gone, or either calls it off; asking's forgotten after a while", () => {
        const { host, ada, bryn } = together();
        const begin = () => {
            assert.equal(host.command(HOST_PLAYER, { type: "trade", with: "bryn" }).ok, true);
            assert.deepEqual(host.command("bryn", { type: "trade", with: HOST_PLAYER }).open, true);
        };
        const off = (events) => events.filter((event) => event.type === "trade" && event.change === "off").map(({ id, why, by }) => ({ id, why, by }));

        // Called off, by either
        begin();
        assert.deepEqual(host.command("bryn", { type: "cancel" }), { ok: true });
        assert.deepEqual(off(run(host, STEP_MS)), [{ id: HOST_PLAYER, why: "cancelled", by: "bryn" }, { id: "bryn", why: "cancelled", by: "bryn" }]);

        // Said no to
        host.command(HOST_PLAYER, { type: "trade", with: "bryn" });
        assert.deepEqual(host.command("bryn", { type: "cancel", with: HOST_PLAYER }), { ok: true });
        assert.equal(host.trades.size, 0);
        assert.deepEqual(off(run(host, STEP_MS)).map(({ why }) => why), ["cancelled", "cancelled"]);

        // Parted
        begin();
        put(bryn, [ada.square[0] + TRADE.apart + 2, ada.square[1]]);
        assert.deepEqual(off(run(host, STEP_MS)).map(({ why }) => why), ["apart", "apart"]);

        // Unanswered
        put(bryn, [ada.square[0] + 1, ada.square[1]]);
        host.command(HOST_PLAYER, { type: "trade", with: "bryn" });
        assert.equal(off(run(host, TRADE.asking - 1000)).length, 0);
        assert.deepEqual(off(run(host, 2000)).map(({ why }) => why), ["unanswered", "unanswered"]);

        // Fallen
        begin();
        Object.assign(bryn, { hp: 0, dead: true, respawnAt: host.battle.time + 5000 });
        assert.deepEqual(off(run(host, STEP_MS)).map(({ why }) => why), ["apart", "apart"]);
        Object.assign(bryn, { hp: bryn.maxHp, dead: false });

        // Gone
        begin();
        host.leave("bryn");
        assert.equal(host.trades.size, 0);
        assert.deepEqual(off(run(host, STEP_MS)), [{ id: HOST_PLAYER, why: "left", by: null }, { id: "bryn", why: "left", by: null }]);
    });

    it("carries a trade on from a snapshot", () => {
        const { host } = together();

        host.command(HOST_PLAYER, { type: "trade", with: "bryn" });
        host.command("bryn", { type: "trade", with: HOST_PLAYER });
        host.command(HOST_PLAYER, { type: "offer", gold: 12, items: [{ id: "potion", count: 1 }] });
        host.command(HOST_PLAYER, { type: "agree" });

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.trades.values()], [...host.trades.values()]);
        assert.deepEqual(again.command("bryn", { type: "agree" }), { ok: true });
        assert.deepEqual([again.players.get("bryn").progress.gold, again.players.get("bryn").progress.held("potion")], [22, 1]);
    });

    it("trades between a host's player and one who's joined, the same in both copies of the world", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 40 } });
        host.populate();

        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => post.push({ from: "p1", text }) });
        const deliver = () => {
            while (post.length) {
                const { to, from, text } = post.shift();

                if (from) {
                    hosting.hear(from, text);
                } else if (to === "p1") {
                    joining.hear(text);
                }
            }
        };
        const play = (steps) => {
            for (let k = 0; k < steps; k++) {
                host.advance(STEP_MS);
            }

            hosting.flush();
            deliver();

            while (joining.step()) {
                // (Their copy plays all it's been sent)
            }

            deliver();
        };

        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn" }, progress: { gold: 5, pack: [{ id: "boarTusk", count: 2 }] } });
        deliver();
        play(1);

        const guest = [...host.players.keys()].find((id) => id !== HOST_PLAYER);
        const [ada, bryn] = [host.battle.actor(HOST_PLAYER), host.battle.actor(guest)];

        // (Side by side)
        for (const world of [host, joining.host]) {
            put(world.battle.actor(guest), [ada.square[0] + 1, ada.square[1]]);
        }

        assert.ok(Math.hypot(ada.x - bryn.x, ada.y - bryn.y) <= TRADE.reach);

        const heard = [];

        joining.command({ type: "trade", with: HOST_PLAYER }, (result) => heard.push(result));
        deliver();
        play(1);
        assert.equal(host.command(HOST_PLAYER, { type: "trade", with: guest }).open, true);
        host.command(HOST_PLAYER, { type: "offer", gold: 20, items: [] });
        joining.command({ type: "offer", gold: 0, items: [{ id: "boarTusk", count: 2 }] }, (result) => heard.push(result));
        deliver();
        play(1);
        host.command(HOST_PLAYER, { type: "agree" });
        joining.command({ type: "agree" }, (result) => heard.push(result));
        deliver();
        play(2);

        assert.ok(heard.length === 3 && heard.every(({ ok }) => ok), JSON.stringify(heard));

        for (const world of [host, joining.host]) {
            const [mine, theirs] = [world.players.get(HOST_PLAYER).progress, world.players.get(guest).progress];

            assert.deepEqual([mine.gold, mine.held("boarTusk"), theirs.gold, theirs.held("boarTusk")], [20, 2, 25, 0]);
        }

        assert.equal(joining.host.checksum(), host.checksum());
    });
});
