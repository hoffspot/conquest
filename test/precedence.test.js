// The one order of precedence (client/js/app/precedence.js): who comes first where not everyone
// can be held in full, drawn in full, or have their bar shown. The player; their party; whoever
// they're set on; whoever's attacking them; whoever's fighting their party; whoever they're
// talking or trading with; then the tallest on the screen; other maps last. And that the game
// ranks by it in each place that ranks, with no order of its own left
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { first, inOrder, Order, STANDING, standingOf, viewerOf } from "../client/js/app/precedence.js";

// A viewer: "me" in the town, in a party with Bryn and Cai, set on a goblin, talking to an innkeeper
function viewer(more = {}) {
    const one = viewerOf();

    Object.assign(one, { id: "me", map: "town", target: "goblin", striking: null });

    for (const id of more.party ?? ["bryn", "cai"]) {
        one.party.add(id);
    }

    for (const id of more.partyFoes ?? ["wolf"]) {
        one.partyFoes.add(id);
    }

    for (const id of more.engaged ?? ["innkeeper"]) {
        one.engaged.add(id);
    }

    return Object.assign(one, more.as ?? {});
}

const actor = (id, more = {}) => ({ id, map: "town", target: null, attack: null, ...more });
const ids = (ranked) => ranked.map((entry) => entry.actor.id);

// Ranked with each one's height on the screen and distance as the actor itself says (`tall`, `away`)
const measured = (entry) => {
    entry.tall = entry.actor.tall ?? 0;
    entry.away = entry.actor.away ?? Infinity;
};

describe("how someone stands with the viewer (standingOf)", () => {
    it("is the first of them that's true", () => {
        const me = viewer();

        assert.equal(standingOf(me, actor("me")), STANDING.self);
        assert.equal(standingOf(me, actor("bryn")), STANDING.party);
        assert.equal(standingOf(me, actor("goblin")), STANDING.target);
        assert.equal(standingOf(me, actor("bandit", { target: "me" })), STANDING.attacker);
        assert.equal(standingOf(me, actor("archer", { attack: { target: "me" } })), STANDING.attacker);
        assert.equal(standingOf(me, actor("wolf")), STANDING.partyFoe);
        assert.equal(standingOf(me, actor("troll", { target: "cai" })), STANDING.partyFoe);
        assert.equal(standingOf(me, actor("ogre", { attack: { target: "bryn" } })), STANDING.partyFoe);
        assert.equal(standingOf(me, actor("innkeeper")), STANDING.engaged);
        assert.equal(standingOf(me, actor("farmer")), STANDING.rest);
        assert.equal(standingOf(me, actor("farmer", { target: "someone else" })), STANDING.rest);
    });

    it("counts whoever the viewer's blow is at as the one they're set on", () => {
        assert.equal(standingOf(viewer({ as: { target: null, striking: "boar" } }), actor("boar")), STANDING.target);
    });

    it("counts whoever the viewer's chosen to fight as the one they're set on, set on them yet or not", () => {
        assert.equal(standingOf(viewer({ as: { target: null, locked: "ogre" } }), actor("ogre")), STANDING.target);
        assert.equal(standingOf(viewer({ as: { target: "goblin", locked: "ogre" } }), actor("goblin")), STANDING.target);
    });

    it("puts each before the next where two are true", () => {
        // (One of the party the viewer's set on, to heal, say: the party's; set on the viewer too)
        assert.equal(standingOf(viewer({ as: { target: "bryn" } }), actor("bryn", { target: "me" })), STANDING.party);
        // (The viewer's target that's attacking them: their target)
        assert.equal(standingOf(viewer(), actor("goblin", { target: "me" })), STANDING.target);
        // (One attacking the viewer and fought by the party: an attacker)
        assert.equal(standingOf(viewer(), actor("wolf", { target: "me" })), STANDING.attacker);
        // (One fighting the party the viewer's also talking to: the party's foe)
        assert.equal(standingOf(viewer(), actor("innkeeper", { target: "cai" })), STANDING.partyFoe);
    });

    it("has no party, foes or talk with none said", () => {
        const alone = viewerOf();

        Object.assign(alone, { id: "me", map: "town" });
        assert.equal(standingOf(alone, actor("anyone")), STANDING.rest);
        assert.equal(standingOf(alone, actor("me")), STANDING.self);
        // (No one's target: none set on no one is no one's)
        assert.equal(standingOf(alone, actor("idle", { target: null })), STANDING.rest);
    });

    it("is in the order the order's said in", () => {
        assert.deepEqual(Object.keys(STANDING), ["self", "party", "target", "attacker", "partyFoe", "engaged", "kept", "rest"]);
        assert.deepEqual(Object.values(STANDING), [0, 1, 2, 3, 4, 5, 6, 7]);
    });
});

describe("the order (Order.rank)", () => {
    it("is self, party, target, attackers, the party's foes, whoever's talked to, then the tallest on the screen", () => {
        const order = new Order();
        const actors = [
            actor("tall farmer", { tall: 400, away: 4 }),
            actor("innkeeper", { tall: 10, away: 60 }),
            actor("troll", { target: "cai", tall: 9, away: 70 }),
            actor("bandit", { target: "me", tall: 8, away: 80 }),
            actor("small farmer", { tall: 50, away: 30 }),
            actor("goblin", { tall: 7, away: 90 }),
            actor("cai", { tall: 6, away: 100 }),
            actor("me", { tall: 300, away: 5 }),
            actor("farmer", { tall: 120, away: 12 }),
        ];

        assert.deepEqual(ids(order.rank(viewer(), actors, measured)), ["me", "cai", "goblin", "bandit", "troll", "innkeeper", "tall farmer", "farmer", "small farmer"]);
    });

    it("puts the nearer first of two as tall, and leaves two alike as they were given", () => {
        const order = new Order();
        const actors = [actor("far", { tall: 80, away: 20 }), actor("b", { tall: 0, away: 9 }), actor("near", { tall: 80, away: 10 }), actor("a", { tall: 0, away: 9 }), actor("unseen near", { tall: 0, away: 3 })];

        assert.deepEqual(ids(order.rank(viewer(), actors, measured)), ["near", "far", "unseen near", "b", "a"]);
    });

    it("puts those on another map after everyone on the viewer's, in the same order among themselves", () => {
        const order = new Order();
        const actors = [
            actor("upstairs farmer", { map: "inn", tall: 900, away: 1 }),
            actor("bryn", { map: "inn", tall: 0 }),
            actor("upstairs bandit", { map: "inn", target: "me" }),
            actor("farmer", { tall: 1, away: 99 }),
            actor("me"),
        ];

        assert.deepEqual(ids(order.rank(viewer(), actors, measured)), ["me", "farmer", "bryn", "upstairs bandit", "upstairs farmer"]);

        // (The viewer themself is never elsewhere)
        assert.equal(order.ranked[0].elsewhere, false);
        assert.deepEqual(order.ranked.map(({ elsewhere }) => elsewhere), [false, false, true, true, true]);
    });

    it("lets whoever ranks keep some before the rest for reasons of its own, after everyone the order names", () => {
        const order = new Order();
        const actors = [actor("farmer", { tall: 500 }), actor("thrown", { tall: 1 }), actor("innkeeper", { tall: 1 }), actor("bandit", { target: "me", tall: 2 })];
        const ranked = order.rank(viewer(), actors, (entry) => {
            measured(entry);

            if (entry.actor.id === "thrown" || entry.actor.id === "bandit") {
                entry.standing = Math.min(entry.standing, STANDING.kept);
            }
        });

        assert.deepEqual(ids(ranked), ["bandit", "innkeeper", "thrown", "farmer"]);
        assert.deepEqual(ranked.map(first), [true, true, true, false]);
        assert.equal(ranked[0].standing, STANDING.attacker);
    });

    it("leaves out those its measure says to", () => {
        const order = new Order();
        const actors = [actor("a", { tall: 1 }), actor("gone", { tall: 9 }), actor("b", { tall: 2 }), actor("gone too", { tall: 9 })];

        assert.deepEqual(ids(order.rank(viewer(), actors, (entry) => (entry.actor.id.startsWith("gone") ? false : measured(entry)))), ["b", "a"]);
        assert.deepEqual(ids(order.rank(viewer(), [], measured)), []);
    });

    it("ranks any iterable, and with nothing measured keeps them as they stand with the viewer", () => {
        const order = new Order();
        const actors = new Map([["farmer", actor("farmer")], ["goblin", actor("goblin")], ["me", actor("me")]]);

        assert.deepEqual(ids(order.rank(viewer(), actors.values())), ["me", "goblin", "farmer"]);
    });

    it("makes nothing new once it's ranked as many: the same array, the same entries filled in again", () => {
        const order = new Order();
        const crowd = Array.from({ length: 40 }, (_, k) => actor(`one-${k}`, { tall: (k * 37) % 23, away: k }));
        const ranked = order.rank(viewer(), crowd, measured);
        const entries = new Set(ranked);

        assert.equal(entries.size, 40);

        // (Others, fewer, then as many again, in another order: no entry but those)
        const fewer = order.rank(viewer(), crowd.slice(0, 12).reverse(), measured);

        assert.equal(fewer, ranked);
        assert.equal(fewer.length, 12);
        assert.ok(fewer.every((entry) => entries.has(entry)));

        const again = order.rank(viewer(), [...crowd].reverse(), (entry) => (entry.actor.id === "one-7" ? false : measured(entry)));

        assert.equal(again, ranked);
        assert.equal(again.length, 39);
        assert.ok(again.every((entry) => entries.has(entry)));
        assert.equal(new Set(again).size, 39);
        // (And each says what it's ranked for now, nothing left of the time before)
        assert.deepEqual(new Set(ids(again)), new Set(crowd.filter(({ id }) => id !== "one-7").map(({ id }) => id)));
        assert.ok(again.every((entry) => entry.tall === entry.actor.tall && entry.away === entry.actor.away && entry.standing === STANDING.rest));

        // (What its measure kept on an entry is the measure's to set again: the order's own are)
        const kept = order.rank(viewer(), crowd, (entry) => {
            entry.standing = STANDING.kept;
        });

        assert.ok(kept.every((entry) => entry.standing === STANDING.kept));
        assert.ok(order.rank(viewer(), crowd).every((entry) => entry.standing === STANDING.rest && entry.tall === 0 && entry.away === Infinity));
    });

    it("sorts by the same rule on its own (inOrder)", () => {
        const entry = (standing, tall, away, elsewhere = false) => ({ standing, tall, away, elsewhere });

        assert.ok(inOrder(entry(STANDING.party, 0, 99), entry(STANDING.target, 900, 1)) < 0);
        assert.ok(inOrder(entry(STANDING.rest, 10, 5), entry(STANDING.rest, 20, 50)) > 0);
        assert.ok(inOrder(entry(STANDING.rest, 10, 5), entry(STANDING.rest, 10, 50)) < 0);
        assert.equal(inOrder(entry(STANDING.rest, 10, 5), entry(STANDING.rest, 10, 5)), 0);
        assert.equal(inOrder(entry(STANDING.rest, 0, Infinity), entry(STANDING.rest, 0, Infinity)), 0);
        assert.ok(inOrder(entry(STANDING.party, 900, 1, true), entry(STANDING.rest, 0, 99)) > 0);
    });
});

describe("the game ranks by the one order", () => {
    const game = readFileSync(new URL("../client/js/app/game.js", import.meta.url), "utf8");

    it("in each place that ranks: the soldiers, the wild's creatures, the folk, those who stand in, and the bars over heads", () => {
        for (const place of ["soldiers", "creatures", "folk", "throng", "plates"]) {
            assert.ok(game.includes(`this.orders.${place}.rank(`), place);
        }
    });

    it("with no copy of who's fighting the player, nor a sort of its own, left in them", () => {
        assert.ok(!/const fighting = \(actor\) => actor\.target === me\.id/.test(game));
        assert.ok(!game.includes("- (fighting(actor) ? DRAW_REACH : 0)"));
        assert.ok(!game.includes("Number(b.first) - Number(a.first)"));
        assert.ok(!game.includes("kept(actor) ? -Infinity"));
    });
});
