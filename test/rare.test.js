// Rare encounters (client/js/core/rare.js; in play, core/host.js #rare...): each player's clocks,
// a chance at each of the director's cards that rises with every one dealt instead, certain by its
// cap (about an hour into a world's wilds, then about two hours apart, by a simulation of seeded
// walks); the world's deck, none dealt again before the rest; what may be dealt (a unique card not
// done in the world nor by any of those it'd be dealt to, a recurring one come round again, its
// gates holding or passed over long enough); its life (put, seen, taken up; passed, failed or done);
// where one was left not put again; owed rewards; the uniques made at a player's level, their own;
// and all of it kept
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIRECTOR } from "../client/js/core/director.js";
import { GEAR } from "../client/js/core/gear.js";
import { createRandom } from "../client/js/core/random.js";
import { cardOf, gatesHold, Legends, makeUnique, RARE, RARE_CARDS, SAMPLE, SHAPES, UNIQUES, VENUES } from "../client/js/core/rare.js";

const MINUTE = 60000;

// A few cards to deal from (none's in play yet)
const card = (id, more = {}) => ({ id, title: id, word: id, kind: "unique", venue: "wilds", where: "ahead", shape: { kind: "foe" }, reward: { unique: "sampleSignet" }, ...more });
const CARDS = Object.freeze({ a: card("a"), b: card("b"), c: card("c", { kind: "recurring" }), d: card("d", { gates: { hours: ["night"] } }), e: card("e", { where: "site" }), f: card("f", { venue: "inside" }) });
const DAY = { hour: "day", biome: "meadow", people: "human" };

// How long into its wilds a player's first rare card comes, and the next (ms), crossing them at
// `speed` m/s, the director's cards every 250-450 m (DIRECTOR.every)
function walk(seed, { speed = 3.5 } = {}) {
    const random = createRandom(seed);
    const legends = new Legends();
    const times = [];
    let at = 0;

    while (times.length < 2) {
        const metres = DIRECTOR.every[0] + random.next() * (DIRECTOR.every[1] - DIRECTOR.every[0]);
        const ms = (metres / speed) * 1000;

        at += ms;
        legends.count("ada", "wilds", ms);

        if (legends.due("ada", "wilds", random)) {
            times.push(at);
            at = 0;
            Object.assign(legends.clock("ada").wilds, { since: 0, misses: 0, due: false, had: true });
        }
    }

    return times;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe("rare encounters (rare.js)", () => {
    it("deals a player's first rare card about an hour into a world's wilds, and the next about two hours on, never past the cap", () => {
        const walks = Array.from({ length: 400 }, (_, k) => walk(k + 1));
        const firsts = walks.map(([first]) => first / MINUTE);
        const afters = walks.map(([, after]) => after / MINUTE);
        // (A card's gap at the slowest: one more card past the cap at most)
        const card = DIRECTOR.every[1] / 3.5 / 60;

        assert.ok(median(firsts) >= 50 && median(firsts) <= 70, `first: ${median(firsts)} min`);
        assert.ok(median(afters) >= 110 && median(afters) <= 130, `after: ${median(afters)} min`);
        assert.ok(Math.min(...firsts) >= RARE.wilds.first.least / MINUTE);
        assert.ok(Math.max(...firsts) <= RARE.wilds.first.most / MINUTE + card, `${Math.max(...firsts)}`);
        assert.ok(Math.max(...afters) <= RARE.wilds.after.most / MINUTE + card, `${Math.max(...afters)}`);

        // (Faster, more cards a minute: about as soon, for the chance rises with the cards)
        const quick = Array.from({ length: 200 }, (_, k) => walk(k + 1, { speed: 6 })[0] / MINUTE);

        assert.ok(median(quick) >= 45 && median(quick) <= 70, `quick: ${median(quick)} min`);
    });

    it("keeps a clock's chance come up due till it's dealt; and inside, a chance on each floor gone into, certain by the tenth", () => {
        const legends = new Legends();
        const random = createRandom(3);

        assert.equal(legends.due("ada", "wilds", random), false, "too soon");
        legends.count("ada", "wilds", RARE.wilds.first.most);
        assert.equal(legends.due("ada", "wilds", random), true, "certain at the cap");
        assert.equal(legends.due("ada", "wilds", random), true, "still due");

        // (Inside: none before its least, then rising floor by floor)
        legends.count("ada", "inside", RARE.inside.first.least);

        let floors = 0;

        while (!legends.due("ada", "inside", random)) {
            floors += 1;
        }

        assert.ok(floors < 10, `${floors} floors`);
        assert.equal(Math.round(1 / RARE.inside.step), 10);
    });

    it("deals from the world's deck without repeats, a unique once in the world and never to those who've done it, a recurring one again once it's come round", () => {
        const random = createRandom(5);
        const cards = { a: CARDS.a, b: CARDS.b, c: CARDS.c, e: CARDS.e, f: CARDS.f };
        const legends = new Legends(null, { cards });
        const deal = (met = new Set()) => {
            const id = legends.pick("wilds", { met, at: DAY, random });

            if (id) {
                legends.deal(id, { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
                legends.end("failed");
                legends.last = -Infinity;
            }

            return id;
        };

        // (Each of the wilds' dealt ahead once before any comes again: not the one kept at its
        // site, nor the inside's)
        const first = [deal(), deal(), deal()];

        assert.deepEqual([...first].sort(), ["a", "b", "c"]);
        assert.deepEqual(legends.decks.wilds.filter((id) => ["a", "b", "c"].includes(id)), first);

        // (Done: a unique gone from the world; a recurring one away till it comes round)
        legends.deal("a", { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
        legends.end("done");
        legends.deal("c", { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
        legends.end("done", { random });
        legends.last = -Infinity;

        const later = new Set(Array.from({ length: 6 }, () => deal()));

        assert.ok(!later.has("a") && !later.has("c"), [...later].join());
        legends.played = legends.recurs.c;
        assert.ok(Array.from({ length: 6 }, () => deal()).includes("c"));

        // (Never to those who've done it in another world)
        assert.equal(legends.pick("wilds", { met: new Set(["b", "c"]), at: DAY, random }), null);
        assert.equal(legends.pick("wilds", { met: new Set(["c"]), at: DAY, random }), "b");
    });

    it("passes a card over while its gates don't hold, and deals it anyway once they've passed it over enough", () => {
        const random = createRandom(7);
        const legends = new Legends(null, { cards: { d: CARDS.d } });

        for (let k = 0; k < RARE.pass; k++) {
            assert.equal(legends.pick("wilds", { at: DAY, random }), null);
        }

        assert.equal(legends.pick("wilds", { at: DAY, random }), "d");
        legends.deal("d", { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
        assert.equal(legends.passes.d, undefined, "forgotten once dealt");
        assert.equal(legends.pick("wilds", { at: { ...DAY, hour: "night" }, random }), "d", "its hour");
        assert.ok(gatesHold(CARDS.d, { ...DAY, hour: "night" }));
        assert.ok(!gatesHold(card("g", { gates: { biomes: ["heath"] } }), DAY));
    });

    it("follows one's life: put, seen (the clocks of those who see it begun again), taken up; left unseen or passed once everyone's far and long enough, failed once those taking part have gone", () => {
        const legends = new Legends();
        const random = createRandom(9);

        legends.count("ada", "wilds", RARE.wilds.first.most);
        assert.ok(legends.due("ada", "wilds", random));

        const active = legends.deal("a", { venue: "wilds", at: [10, 20], map: "town", to: "ada", ids: ["wild-1"] });

        assert.equal(active.stage, "put");
        assert.equal(legends.free(), false, "one at a time");
        assert.equal(legends.clock("ada").wilds.due, false);

        // (Seen by no one, everyone far: back in the deck at once, not put there again)
        assert.equal(legends.left({ near: false }), "passed");
        legends.end("passed");
        assert.ok(legends.spent("a", [15, 20]));
        assert.ok(!legends.spent("a", [500, 20]));
        assert.equal(legends.free(), false, "the gap since");
        legends.pass(RARE.gap);
        assert.equal(legends.free(), true);

        // (Seen: told, their clocks begun again; left, it's passed once RARE wait's gone by)
        legends.deal("b", { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
        assert.deepEqual(legends.sees(["ada", "bryn"]), ["ada", "bryn"]);
        assert.deepEqual(legends.sees(["ada"]), []);
        assert.equal(legends.active.stage, "seen");
        assert.equal(legends.clock("bryn").wilds.had, true);
        assert.equal(legends.left({ near: false }), null, "not yet");
        legends.pass(RARE.wait);
        assert.equal(legends.left({ near: false }), "passed");
        assert.equal(legends.left({ near: true, over: true }), "passed", "its hour past");

        // (Taken up: failed once everyone's left it as long)
        legends.end("passed");
        legends.pass(RARE.gap);
        legends.deal("a", { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
        legends.sees(["ada"]);
        assert.deepEqual(legends.takes(["ada"]), ["ada"]);
        assert.equal(legends.active.stage, "taken");
        legends.pass(RARE.wait - 1);
        assert.equal(legends.left({ near: false }), null);
        legends.pass(1);
        assert.equal(legends.left({ near: false }), "failed");

        const ended = legends.end("done", { by: ["Ada"] });

        assert.deepEqual({ card: ended.card, how: ended.how, by: ended.by }, { card: "a", how: "done", by: ["Ada"] });
        assert.ok(legends.gone.has("a"));
        assert.equal(legends.done.at(-1).how, "done");
    });

    it("keeps the rewards owed to someone gone before they were given, given once", () => {
        const legends = new Legends();

        legends.owe("bryn", "sample");
        legends.owe("bryn", "a");
        assert.deepEqual(legends.owedTo("bryn"), ["sample", "a"]);
        assert.deepEqual(legends.owedTo("bryn"), []);
    });

    it("makes a unique at the level of who it's given to: a legendary of its base with its own name, its id, its effect if it has one", () => {
        for (const [id, def] of Object.entries(UNIQUES)) {
            assert.equal(def.id, id);
            assert.ok(GEAR[def.base], `${id}: ${def.base}`);
            assert.ok(def.name.length > 2 && def.about.length > 2);
        }

        const low = makeUnique("sampleSignet", 1, createRandom(1));
        const high = makeUnique("sampleSignet", 60, createRandom(1));

        assert.deepEqual({ id: low.id, quality: low.quality, name: low.name, unique: low.unique }, { id: "ring", quality: "legendary", name: "Signet of the Sample", unique: "sampleSignet" });
        assert.equal(high.level, 60);
        assert.ok(Object.values(high.bonuses).reduce((a, b) => a + b, 0) > Object.values(low.bonuses).reduce((a, b) => a + b, 0));
    });

    it("has no card in play yet, only the sample debug mode deals: a foe of what lives there, a unique its reward", () => {
        assert.deepEqual(Object.keys(RARE_CARDS), []);
        assert.equal(cardOf("sample"), SAMPLE);
        assert.equal(cardOf("nothing"), null);
        assert.ok(SAMPLE.debug && SHAPES.includes(SAMPLE.shape.kind) && UNIQUES[SAMPLE.reward.unique]);
        assert.equal(new Legends().pick("wilds", { at: DAY, random: createRandom(1) }), null, "never in a deck");
    });

    it("keeps all of it: a world's legends the same after a round trip through JSON", () => {
        const random = createRandom(11);
        const legends = new Legends(null, { cards: CARDS });

        legends.pass(5 * MINUTE);
        legends.count("ada", "wilds", RARE.wilds.first.most);
        legends.due("ada", "wilds", random);
        legends.pick("wilds", { at: DAY, random });
        legends.deal("b", { venue: "wilds", at: [3, 4], map: "town", to: "ada", ids: ["wild-7"] });
        legends.sees(["ada"]);
        legends.owe("bryn", "a");

        const again = new Legends(JSON.parse(JSON.stringify(legends)), { cards: CARDS });

        assert.deepEqual(again.toJSON(), legends.toJSON());
        assert.deepEqual(new Legends(null).toJSON(), new Legends().toJSON());
        assert.deepEqual(Object.keys(new Legends().clock("x")), VENUES);
    });
});
