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
import { STEP_MS } from "../client/js/core/battle.js";
import { DIRECTOR } from "../client/js/core/director.js";
import { GEAR } from "../client/js/core/gear.js";
import { HOST_PLAYER, Host, REFUSALS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { Progress } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { cardOf, CHANGES, DEBUG_CARDS, gatesHold, hourOf, Legends, LOCKS, lockSite, makeUnique, priceTimes, RARE, RARE_CARDS, SAMPLE, SAMPLE_DEEP, SAMPLE_KIN, SHAPES, siteDoor, STEPS, threadTalk, threadWares, threadWords, THREADS, UNIQUES, VAULT, VENUES } from "../client/js/core/rare.js";
import { decode, encode } from "../client/js/core/wire.js";
import { Conversation, TREES } from "../client/js/core/dialogue.js";
import { describe as describeGear, MAKES, rarityOf } from "../client/js/app/gearinfo.js";

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

    it("follows a world's thread step by step, begun once; a follow-up card dealt only while the thread's at it, and before any other", () => {
        const cards = { ...CARDS, kin: card("kin", { requires: { thread: "sampleTrail", step: 3 } }) };
        const legends = new Legends(null, { cards });

        assert.equal(legends.stepOf("sampleTrail"), null, "(not begun)");
        assert.ok(legends.begin("sampleTrail", { at: [10, 20], ids: ["ada"], by: ["Ada"] }));
        assert.equal(legends.begin("sampleTrail", { at: [0, 0] }), null, "begun once");
        assert.equal(legends.stepOf("sampleTrail").kind, "place");
        assert.equal(legends.wants(cards.kin), false);

        // (Never dealt while it's not wanted: the rest first)
        const random = createRandom(3);
        const dealt = new Set();

        for (let k = 0; k < 12; k++) {
            const id = legends.pick("wilds", { at: DAY, random });

            dealt.add(id);
            legends.deal(id, { venue: "wilds", at: [0, 0], map: "town", to: "ada" });
            legends.active = null;
        }

        assert.ok(!dealt.has("kin"), [...dealt].join());

        // (Its steps, each by those who took part, where it was last moved on)
        const steps = [];

        for (let k = 0; k < 3; k++) {
            const done = legends.advance("sampleTrail", { ids: [k ? "bram" : "ada"], by: [k ? "Bram" : "Ada"], at: [k, k] });

            steps.push(done.def.kind);
        }

        assert.deepEqual(steps, ["place", "talk", "contract"]);
        assert.deepEqual(legends.threads.sampleTrail.by, ["Ada", "Bram"]);
        assert.deepEqual(legends.threads.sampleTrail.at, [2, 2]);
        assert.equal(legends.wants(cards.kin), true);
        assert.equal(legends.pick("wilds", { at: DAY, random }), "kin", "the follow-up first");

        const kin = legends.advance("sampleTrail", { ids: ["ada"] });

        assert.equal(kin.next.kind, "lock");
        assert.equal(legends.wants(cards.kin), false, "(past it)");

        const last = legends.advance("sampleTrail", { ids: ["ada"] });

        assert.equal(last.next, null);
        assert.equal(legends.threads.sampleTrail.done, true);
        assert.equal(legends.advance("sampleTrail"), null, "done");
        assert.deepEqual(STEPS, ["card", "place", "talk", "contract", "lock"]);
        assert.ok(THREADS.sampleTrail.steps.every((step) => STEPS.includes(step.kind) && (!step.change || CHANGES.includes(step.change.kind))));
    });

    it("changes the world as a thread's steps have it: a shop's prices and a festival's for as long as they last, wares on its shelves", () => {
        const legends = new Legends();

        legends.change({ kind: "festival", thread: "t", town: "oakford", name: "the Feast", times: 0.8, lasts: 10 * MINUTE });
        legends.change({ kind: "price", thread: "t", town: "oakford", shop: "alchemist", times: 1.5 });
        legends.change({ kind: "stock", thread: "t", town: "oakford", shop: "tavern", ware: { id: "potion", count: 3 } });

        const at = (shop, town = "oakford") => priceTimes(legends.changes, { town, shop, played: legends.played });

        assert.equal(at("tavern"), 0.8);
        assert.ok(Math.abs(at("alchemist") - 1.2) < 1e-9);
        assert.equal(at("tavern", "elsewhere"), 1);
        assert.deepEqual(threadWares(legends.changes, { town: "oakford", shop: "tavern", played: 0 }), [{ id: "potion", quality: "common", count: 3 }]);
        assert.deepEqual(threadWares(legends.changes, { town: "oakford", shop: "smith", played: 0 }), []);

        // (The festival over: its prices with it)
        legends.pass(11 * MINUTE);
        assert.equal(at("tavern"), 1);
        assert.equal(at("alchemist"), 1.5, "a change for good stays");
        assert.equal(legends.lasting().length, 2);
        assert.equal(threadWords("The barkeep in {town}, {way} of here.", { town: "Oakford", way: "north" }), "The barkeep in Oakford, north of here.");
    });

    it("adds a thread's word to one of the folk's talk, asked from their first choices, its doing sent on, back to their talk after", () => {
        const tree = threadTalk(TREES.barkeep, { thread: "sampleTrail", step: 1 });
        const step = THREADS.sampleTrail.steps[1];
        const effects = [];
        const talk = new Conversation(tree, { speaker: { id: "b", name: "Hal Brewer", title: "Barkeep" }, onEffect: (effect) => effects.push(effect) });
        const asked = talk.choices.findIndex(({ text }) => text === step.ask);

        assert.ok(asked >= 0, talk.choices.map(({ text }) => text).join(" | "));
        talk.choose(asked);
        assert.equal(talk.line, step.reply);
        assert.deepEqual(effects, [{ thread: "sampleTrail", step: 1 }]);
        talk.choose(0);
        assert.ok(!talk.ended && talk.choices.some(({ text }) => text === step.ask), "back to their talk");
        assert.equal(threadTalk(TREES.barkeep, { thread: "sampleTrail", step: 0 }), TREES.barkeep, "(only a talk step)");
        assert.ok(!TREES.barkeep.nodes["thread:sampleTrail"], "(their own talk untouched)");
    });

    it("puts a lock on one of the world's places of its kinds, chosen from its seed; shut once its thread's begun (a debug thread's) or from the first (a card's in play), till it's opened", () => {
        const plan = buildWorld({ seed: 2 }).plan;
        const site = lockSite(plan, LOCKS.sampleDoor, 2);

        assert.ok(LOCKS.sampleDoor.on.includes(site.kind));
        assert.equal(lockSite(plan, LOCKS.sampleDoor, 2).id, site.id, "the same every time");
        assert.equal(lockSite({ sites: [] }, LOCKS.sampleDoor, 2), null);
        assert.equal(siteDoor(site), `site:${site.id}/door`);

        const legends = new Legends();

        assert.equal(legends.shut("sampleDoor"), false, "(a debug thread's: not in a world it's not begun in)");
        legends.begin("sampleTrail", { at: [0, 0] });
        assert.equal(legends.shut("sampleDoor"), true);
        legends.opened.add("sampleDoor");
        assert.equal(legends.shut("sampleDoor"), false);
        assert.deepEqual(new Legends(JSON.parse(JSON.stringify(legends))).opened, new Set(["sampleDoor"]));

        // (A card in play whose thread it is: shut from the world's making)
        const playing = new Legends(null, { cards: { real: card("real", { thread: "sampleTrail" }) } });

        assert.equal(playing.shut("sampleDoor"), true);
        assert.equal(playing.shut("nothing"), false);
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

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world (seed 2) with Ada in it, hard to kill, the orc gone, out in the wilds north-east of the
// start town, and Bram beside her (in her party, `party`)
function hosted({ party = true } = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.join({ id: "bram", hero: { ...HERO, name: "Bram" } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const [sx, sy] = world.start.at;
    const at = [Math.floor(sx + 600), Math.floor(sy + 600)];
    const [ada, bram] = [host.battle.actor(HOST_PLAYER), host.battle.actor("bram")];

    for (const [actor, [dx, dy]] of [[ada, [0, 0]], [bram, [2, 0]]]) {
        Object.assign(actor, { hp: 1e6, maxHp: 1e6 });
        put(actor, [at[0] + dx, at[1] + dy]);
    }

    if (party) {
        host.command(HOST_PLAYER, { type: "party", action: "invite", who: "bram" });
        host.command("bram", { type: "party", action: "accept" });
    }

    host.travel.set(HOST_PLAYER, { at: [ada.x, ada.y], walked: 0, next: null, heading: [Math.SQRT1_2, Math.SQRT1_2], deck: ["remains"] });
    run(host, 200);

    return { host, world, ada, bram };
}

describe("rare encounters in play (host.js)", () => {
    it("deals debug mode's sample ahead of a player, one at a time: a foe of what lives there, ranked and named, its spot seen from where they are", () => {
        const { host, ada } = hosted();
        const dealt = host.command(HOST_PLAYER, { type: "rare" });

        assert.equal(dealt.ok, true, JSON.stringify(dealt));

        const active = host.legends.active;
        const foe = host.battle.actor(active.ids[0]);
        const far = Math.hypot(active.at[0] - ada.x, active.at[1] - ada.y);

        assert.equal(active.card, "sample");
        assert.ok(far >= RARE.ahead[0] - 2 && far <= RARE.ahead[1] + 2, `${far} m`);
        assert.equal(foe.name, SAMPLE.shape.title);
        assert.equal(foe.wild.champion, "mini");
        assert.equal(host.wild.get(foe.id).rare, active.n);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "rare" }), { ok: false, reason: "rareOut" });
        assert.ok(REFUSALS.rareOut && REFUSALS.rareRoom && REFUSALS.bound);

        // (Not for one who isn't allowed debug mode's commands)
        assert.deepEqual(host.command("bram", { type: "rare" }), { ok: false, reason: "command" });
    });

    it("tells those who come near it, starts their clocks again; done once its foe falls, each of the party who took part given their own unique, bound to them, the card kept as done by their characters", () => {
        const { host, ada, bram } = hosted();

        host.legends.count(HOST_PLAYER, "wilds", 30 * MINUTE);
        host.command(HOST_PLAYER, { type: "rare" });

        const active = host.legends.active;
        const foe = host.battle.actor(active.ids[0]);

        put(ada, [Math.floor(foe.x) - 8, Math.floor(foe.y)]);
        put(bram, [Math.floor(foe.x) - 9, Math.floor(foe.y) + 1]);

        const seen = run(host, 2500).filter(({ type, change }) => type === "rare" && change === "seen");

        assert.deepEqual(seen.map(({ id }) => id).sort(), [HOST_PLAYER, "bram"].sort());
        assert.ok(host.legends.clock(HOST_PLAYER).wilds.since < 5000, "(begun again)");
        assert.equal(host.legends.clock(HOST_PLAYER).wilds.had, true);

        // (Felled by Ada, Bram beside her)
        Object.assign(foe, { hp: 1 });
        Object.assign(ada, { power: { melee: 1e4, ranged: 1e4 } });
        host.command(HOST_PLAYER, { type: "engage", target: foe.id });

        const events = run(host, 8000);
        const done = events.find(({ type, change }) => type === "rare" && change === "done");
        const given = events.filter(({ type, change }) => type === "rare" && change === "given");

        assert.ok(done, events.filter(({ type }) => type === "rare").map(({ change }) => change).join());
        assert.deepEqual(done.took.sort(), [HOST_PLAYER, "bram"].sort());
        assert.equal(host.legends.active, null);
        assert.ok(host.legends.gone.has("sample"));
        assert.deepEqual(given.map(({ id }) => id).sort(), [HOST_PLAYER, "bram"].sort());

        for (const id of [HOST_PLAYER, "bram"]) {
            const progress = host.players.get(id).progress;
            const index = progress.pack.findIndex((stack) => stack?.unique === "sampleSignet");

            assert.ok(index >= 0, `${id}: in their pack`);
            assert.deepEqual(progress.legends, { met: ["sample"], uniques: ["sampleSignet"] });
            assert.equal(progress.pack[index].name, UNIQUES.sampleSignet.name);

            // (Bound: not dropped, sold nor traded)
            assert.deepEqual(host.command(id, { type: "drop", index }), { ok: false, reason: "bound" });
        }

        // (Only thrown away, for good: Bram's, his character never given it again)
        const brams = host.players.get("bram").progress;
        const thrown = host.command("bram", { type: "discard", index: brams.pack.findIndex((stack) => stack?.unique === "sampleSignet") });

        assert.equal(thrown.ok, true);
        assert.equal(thrown.item.unique, "sampleSignet");
        assert.ok(!brams.pack.some((stack) => stack?.unique));
        assert.deepEqual(brams.legends.uniques, ["sampleSignet"], "(kept as had: never given again)");

        // (Never given twice: dealt again by debug mode, its unique's had already)
        host.legends.last = -Infinity;
        host.command(HOST_PLAYER, { type: "rare" });

        const again = host.battle.actor(host.legends.active.ids[0]);

        put(ada, [Math.floor(again.x) - 2, Math.floor(again.y)]);
        Object.assign(again, { hp: 1 });
        host.command(HOST_PLAYER, { type: "engage", target: again.id });

        const twice = run(host, 8000).filter(({ type }) => type === "rare");

        assert.ok(twice.some(({ change, id }) => change === "had" && id === HOST_PLAYER), twice.map(({ change }) => change).join());
        assert.equal(host.players.get(HOST_PLAYER).progress.pack.filter((stack) => stack?.unique).length, 1);
    });

    it("leaves one no one took up once everyone's far, its foe let go, its spot not used again; and keeps owed a reward for one who left before it was given", () => {
        const { host, ada } = hosted({ party: false });

        host.command(HOST_PLAYER, { type: "rare" });

        const active = host.legends.active;
        const foe = active.ids[0];

        // (Never seen: everyone far, back in the deck at once)
        put(ada, [Math.floor(active.at[0]) + RARE.far + 20, Math.floor(active.at[1])]);
        put(host.battle.actor("bram"), [Math.floor(active.at[0]) + RARE.far + 22, Math.floor(active.at[1])]);

        const events = run(host, 2500).filter(({ type }) => type === "rare");

        assert.deepEqual(events.map(({ change }) => change), ["put", "passed"], JSON.stringify(events));
        assert.equal(host.legends.active, null);
        assert.ok(!host.battle.actor(foe) || host.battle.actor(foe).dead || !host.wild.has(foe), "(its foe let go)");
        assert.ok(host.legends.spent("sample", active.at));
        assert.equal(host.legends.done.at(-1).how, "passed");

        // (Owed: given once they're back)
        host.legends.owe("cy", "sample");
        host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });

        const cy = host.players.get("cy").progress;

        assert.ok(cy.pack.some((stack) => stack?.unique === "sampleSignet"));
        assert.deepEqual(host.legends.owedTo("cy"), []);
    });

    it("keeps a world's legends in its snapshot, the one out as it was, and each character's in their progress; an old world's brought forward with none", () => {
        const { host } = hosted();

        host.legends.count(HOST_PLAYER, "wilds", 12 * MINUTE);
        host.command(HOST_PLAYER, { type: "rare" });

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.legends.toJSON(), host.legends.toJSON());
        assert.equal(SNAPSHOT_VERSION, 47);

        // (A world kept before: none met, none out; its players' progress none either)
        const old = { ...host.snapshot(), version: 46 };

        delete old.legends;
        old.players = old.players.map((player) => ({ ...player, progress: Object.fromEntries(Object.entries(player.progress).filter(([key]) => key !== "legends")) }));

        const forward = Host.forward(structuredClone(old));

        assert.equal(forward.legends, null);
        assert.ok(forward.players.every((player) => Array.isArray(player.progress.legends.met) && Array.isArray(player.progress.legends.uniques)));

        // (The character's, round a save)
        const progress = new Progress({ legends: { met: ["sample", 3, "sample"], uniques: ["sampleSignet"] } });

        assert.deepEqual(new Progress(progress.toJSON()).legends, { met: ["sample"], uniques: ["sampleSignet"] });
        assert.deepEqual(new Progress().legends, { met: [], uniques: [] });
    });

    it("begins the sample's thread as it's done and follows it, the world's, step by step: a place gone to, the barkeep asked, the guild's contract reported, the card that follows it felled, the way it kept shut gone in by; each step's reward and the world changed", () => {
        const { host, ada, bram } = hosted();
        const fell = () => {
            const foe = host.battle.actor(host.legends.active.ids[0]);

            put(ada, [Math.floor(foe.x) - 2, Math.floor(foe.y)]);
            put(bram, [Math.floor(foe.x) - 3, Math.floor(foe.y) + 1]);
            Object.assign(foe, { hp: 1 });
            Object.assign(ada, { power: { melee: 1e4, ranged: 1e4 } });
            host.command(HOST_PLAYER, { type: "engage", target: foe.id });

            return run(host, 8000);
        };
        const told = (events) => events.filter(({ type }) => type === "thread");

        host.command(HOST_PLAYER, { type: "rare" });

        const begun = told(fell()).find(({ change }) => change === "begun");
        const thread = host.legends.threads.sampleTrail;
        const at = host.legends.done.at(-1).at;

        assert.ok(begun, "(begun as it's done)");
        assert.deepEqual(begun.ids.sort(), [HOST_PLAYER, "bram"].sort());
        assert.equal(thread.step, 0);

        // (Its lock shut now: its way in refused, and why said before anyone walks to it)
        const site = lockSite(host.world.plan, LOCKS.sampleDoor, host.world.seed);

        host.world.maps.town.sites.heartOf(site);

        const way = host.battle.links.find(({ id }) => id === siteDoor(site));
        const outside = way.ends.find((end) => end.map === "town");

        assert.equal(host.shutOf(way.id, "town").hint, LOCKS.sampleDoor.hint);
        assert.equal(host.shutOf(way.id, way.ends.find((end) => end.map !== "town").map), null, "(not from inside)");
        put(bram, outside.squares[0]);
        assert.deepEqual(host.command("bram", { type: "enter", link: way.id }), { ok: false, reason: "sealedWay" });
        assert.ok(REFUSALS.sealedWay);
        put(bram, [Math.floor(ada.x) - 1, Math.floor(ada.y)]);

        // A place: somewhere 150 to 250 m from where it fell (or there, at worst), reached
        const far = Math.hypot(thread.place[0] - at[0], thread.place[1] - at[1]);

        assert.ok(far === 0 || (far >= 145 && far <= 255), `${far} m`);

        const gold = host.players.get(HOST_PLAYER).progress.gold;

        put(ada, [Math.floor(thread.place[0]), Math.floor(thread.place[1])]);

        const reached = told(run(host, 2500));

        assert.ok(reached.some(({ change, id, gold: given }) => change === "given" && id === HOST_PLAYER && given === 20), JSON.stringify(reached));
        assert.ok(reached.some(({ change }) => change === "step"));
        assert.equal(host.players.get(HOST_PLAYER).progress.gold, gold + 20);
        assert.equal(thread.step, 1);
        assert.ok(thread.town, "(the talk's settlement: the nearest)");
        assert.ok(host.legends.changes.every(({ kind }) => kind === "reveal"));

        // The barkeep asked, in the tavern of the settlement it's at (put at home, here)
        thread.town = host.world.start.id;

        const tavern = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "tavern" && place === "home");
        const me = host.battle.actor(HOST_PLAYER);

        put(me, tavern.door.ends[0].squares[0]);
        Object.assign(me, { map: "town" });
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: tavern.door.id }).ok, true);
        run(host, STEP_MS * 4);

        const barkeep = host.battle.actor(tavern.folk.find(({ role }) => role === "barkeep").id);

        put(me, [barkeep.square[0], barkeep.square[1] + 2]);
        Object.assign(me, { map: barkeep.map });
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: barkeep.id }).ok, true);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "sampleTrail", step: 0 } }), { ok: false, reason: "thread" }, "(not the step it's at)");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "sampleTrail", step: 1 } }).ok, true);

        const asked = told(run(host, 200));

        assert.ok(asked.some(({ change }) => change === "festival"), JSON.stringify(asked));
        assert.equal(thread.step, 2);
        assert.equal(host.shopTimes(barkeep.id), 0.8, "the feast's prices");

        // The guild's contract, on its board in that settlement, taken and reported
        thread.town = host.world.start.id;

        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        host.command(HOST_PLAYER, { type: "talk", with: null });
        put(me, tavern.door.ends[0].squares[0]);
        Object.assign(me, { map: "town" });
        put(me, guild.door.ends[0].squares[0]);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: guild.door.id }).ok, true);
        run(host, STEP_MS * 4);

        const receptionist = host.battle.actor(guild.folk.find(({ role }) => role === "receptionist").id);

        put(me, [receptionist.square[0], receptionist.square[1] + 2]);
        Object.assign(me, { map: receptionist.map });
        host.players.get(HOST_PLAYER).standing.guild = { merit: 0 };
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: receptionist.id }).ok, true);

        const board = host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).board;
        const notice = board.find((request) => request.thread?.id === "sampleTrail");

        assert.ok(notice, board.map(({ title }) => title).join());
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept", which: `${notice.kind}:${notice.key}` } }).ok, true);

        const contract = host.players.get(HOST_PLAYER).standing.requests.find((request) => request.thread);

        contract.count = contract.target.need;
        contract.state = "done";
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).ok, true);
        assert.equal(thread.step, 3);
        assert.deepEqual(host.threadWaresOf(barkeep.id), [{ id: "potion", quality: "common", count: 3 }], "the barkeep keeps potions now");

        // The card that follows it, dealt (debug mode: its thread's at it), felled: the thread's end
        host.command(HOST_PLAYER, { type: "talk", with: null });
        put(me, [Math.floor(at[0]), Math.floor(at[1])]);
        Object.assign(me, { map: "town" });
        run(host, 200);
        host.legends.last = -Infinity;
        assert.equal(host.command(HOST_PLAYER, { type: "rare" }).card, SAMPLE_KIN.id);

        const opened = told(fell());

        assert.ok(opened.some(({ change, lock }) => change === "unlocked" && lock === "sampleDoor"), JSON.stringify(opened));
        assert.equal(thread.step, 4);
        assert.deepEqual(thread.place, site.at, "(its way in marked)");
        assert.equal(host.shutOf(way.id, "town"), null);

        // Its way in, open now, gone in by: the thread's end
        put(ada, outside.squares[0]);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: way.id }).ok, true);

        const end = told(run(host, 4000));

        assert.ok(end.some(({ change }) => change === "done"), JSON.stringify(end));
        assert.equal(thread.done, true);
        assert.deepEqual(DEBUG_CARDS, { sample: SAMPLE, sampleKin: SAMPLE_KIN, sampleDeep: SAMPLE_DEEP });

        // (Kept: in its snapshot, as it was)
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot()))).legends.threads, host.legends.threads);
    });

    it("lets go one out as a world played alone is loaded again (its foe not kept with it): back in the deck, not gone, never on that spot", () => {
        const { host, ada } = hosted({ party: false });

        host.command(HOST_PLAYER, { type: "rare" });

        const active = structuredClone(host.legends.active);
        const kept = JSON.parse(JSON.stringify(host.legends.toJSON()));
        // (As the game makes one again from what a device keeps: save.js loadLegends)
        const again = new Host(buildWorld({ seed: 2 }), { populate: false, legends: kept });

        again.join({ id: HOST_PLAYER, hero: HERO });
        again.populate();
        Object.assign(again.battle.actor(HOST_PLAYER), { hp: 1e6, maxHp: 1e6 });
        put(again.battle.actor(HOST_PLAYER), ada.square);

        const events = run(again, 1000).filter(({ type }) => type === "rare");

        assert.deepEqual(events.map(({ change }) => change), ["failed"]);
        assert.equal(again.legends.active, null);
        assert.ok(!again.legends.gone.has("sample"), "it may come again");
        assert.ok(again.legends.spent("sample", active.at));
    });

    it("shows a unique as nothing else: its own make and colour, found nowhere else and bound, its tale; worth nothing to a shop (app/gearinfo.js, world/drops3d.js)", () => {
        const item = makeUnique("sampleSignet", 30, createRandom(5));
        const shown = describeGear(item, new Progress());

        assert.equal(rarityOf(item), "unique");
        assert.equal(rarityOf({ ...item, unique: undefined }), "legendary");
        assert.equal(shown.rarity, "unique");
        assert.equal(shown.price, 0);
        assert.ok(shown.lines.some(({ text, tone }) => tone === "unique" && /found nowhere else, and bound to you/.test(text)));
        assert.ok(shown.lines.some(({ text }) => text === UNIQUES.sampleSignet.about));
        assert.equal(MAKES.unique, "Unique");
    });

    it("tells the hour of the day as the world's dawn, day, dusk and night (daytime.js DAY: a new world's begun at 18 minutes into its first day)", () => {
        // (18 minutes in: day; 48, dusk; 54, night; 8 of the next, dawn)
        assert.deepEqual([0, 30, 36, 50].map((minutes) => hourOf(minutes * MINUTE)), ["day", "dusk", "night", "dawn"]);
        assert.ok(["dawn", "day", "dusk", "night"].every((hour) => Array.from({ length: 60 }, (_, k) => hourOf(k * MINUTE)).includes(hour)));
    });
});

describe("rare encounters inside (host.js)", () => {
    // A world (seed 1) with Ada in it, hard to kill, at the way in of the dungeon nearest where
    // she starts (made as she comes to it), an inside card in play there (the sample's, as `opens`
    // has it) and her inside clock come up
    function below({ opens = "ward" } = {}) {
        const world = buildWorld({ seed: 1 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const [sx, sy] = world.start.at;
        const site = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell").sort((a, b) => Math.hypot(a.at[0] - sx, a.at[1] - sy) - Math.hypot(b.at[0] - sx, b.at[1] - sy))[0];

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        world.maps.town.sites.heartOf(site);
        put(me, world.maps.town.sites.set.get(site.id).entrance.outside);
        run(host, 1500);

        const building = world.interiors.buildings.get(`site:${site.id}`);

        host.legends.cards = { deep: { ...SAMPLE_DEEP, id: "deep", debug: false, vault: { ...SAMPLE_DEEP.vault, opens } } };
        host.legends.clock(HOST_PLAYER).inside.due = true;

        return { world, host, me, site, building };
    }

    // Through a link from where `actor` is: stood where one comes off it, told to go, played on
    // till they've crossed; the events on the way
    function through(host, actor, link) {
        const events = [];

        put(actor, link.ends.find(({ map }) => map === actor.map).arrive);
        host.command(actor.id, { type: "enter", link: link.id });

        for (let t = 0; t < 30000 && !events.some(({ type, id }) => type === "cross" && id === actor.id); t += 250) {
            events.push(...run(host, 250));
        }

        return events;
    }

    // A foe felled by `actor`, beside it, kept alive the while
    function fell(host, actor, id) {
        const foe = host.battle.actor(id);
        const events = [];

        put(actor, host.battle.actor(id).square.map((v, k) => v + (k ? 0 : 1)));
        Object.assign(foe, { hp: 1 });
        Object.assign(actor, { power: { melee: 1e4, ranged: 1e4 } });
        host.command(actor.id, { type: "engage", target: id });

        for (let t = 0; t < 8000 && !foe.dead; t += 250) {
            Object.assign(actor, { hp: 1e6, maxHp: 1e6 });
            events.push(...run(host, 250));
        }

        events.push(...run(host, 500));

        return events;
    }

    it("deals an inside card on a floor as it's gone into, a player's clock come up: its foe of the floor's own, ranked, as far from them as it can be", () => {
        const { host, me, building } = below();
        const events = through(host, me, building.door).filter(({ type }) => type === "rare");
        const active = host.legends.active;

        assert.ok(events.some(({ change, map }) => change === "put" && map === building.maps[0]), JSON.stringify(events));
        assert.equal(active.venue, "inside");
        assert.equal(active.map, building.maps[0]);

        const foe = host.battle.actor(active.ids[0]);

        assert.equal(foe.map, building.maps[0]);
        assert.equal(foe.wild.champion, "mini");
        assert.ok(Math.hypot(foe.x - me.x, foe.y - me.y) >= 12);
        assert.equal(host.legends.clock(HOST_PLAYER).inside.due, false);
    });

    it("breaks a ward as its foe falls: a door added to that floor, to a sealed room of its own, its keepers woken as it's gone into, its chest each one's own reward once they've fallen; made again from the world's record", () => {
        const { host, me, building } = below();

        through(host, me, building.door);

        const active = host.legends.active;
        const events = fell(host, me, active.ids[0]);
        const warded = events.find(({ type, change }) => type === "vault" && change === "warded");

        assert.ok(warded, events.filter(({ type }) => type === "rare" || type === "vault").map(({ type, change }) => `${type}:${change}`).join());

        const vault = host.legends.vaults[warded.n];
        const link = host.battle.links.find((one) => one.vault === vault.n);
        const room = host.world.maps[`${vault.floor}/vault-${vault.n}`];

        assert.equal(vault.open, true);
        assert.equal(vault.floor, building.maps[0]);
        assert.equal(room.plan.length, VAULT.rows.length);
        assert.ok(room.origin[0] >= VAULT.origins.x && room.dungeon.vault === vault.n);
        assert.equal(host.world.maps[vault.floor].plan[vault.door.square[1]][vault.door.square[0]], "#", "(against the rock)");
        assert.ok(Math.hypot(vault.door.square[0] - active.at[0], vault.door.square[1] - active.at[1]) <= VAULT.near + 1);
        assert.equal(host.world.interiors.of(room.id), building);
        assert.equal(host.players.get(HOST_PLAYER).progress.legends.met.includes("deep") || SAMPLE_DEEP.kind !== "unique", true, "(kept as met)");
        assert.ok(!host.players.get(HOST_PLAYER).progress.pack.some((stack) => stack?.unique), "(its reward's in the chest)");

        // Gone into: its keepers woken, its chest shut till they fall
        const woken = through(host, me, link);

        assert.equal(me.map, room.id);
        assert.ok(vault.keepers.length > 0 && vault.keepers.every((id) => host.battle.actor(id)?.map === room.id), JSON.stringify(vault));
        assert.ok(woken.some(({ type }) => type === "roused"));

        const chest = host.ground.get(`vault-chest-${vault.n}`);

        assert.equal(chest.locked, true);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }).ok, false);

        for (const id of vault.keepers) {
            fell(host, me, id);
        }

        assert.equal(vault.cleared, true);
        assert.equal(chest.locked, false);

        // Opened: hers in it, theirs alone, till she takes it up
        put(me, chest.square);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }).ok, true);

        const hers = [...host.ground.values()].find((one) => one.for === HOST_PLAYER && one.map === room.id && one.bundle?.items.some((item) => item.unique === "sampleSignet"));

        assert.ok(hers, "her unique in it");
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: hers.id }).ok, true);
        assert.ok(host.players.get(HOST_PLAYER).progress.pack.some((stack) => stack?.unique === "sampleSignet"));
        assert.equal(vault.given, true);

        // (Kept: in the snapshot, and made again from it as its floor's made)
        const again = Host.restore(buildWorld({ seed: 1 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.legends.vaults[vault.n].door, vault.door);
        put(again.battle.actor(HOST_PLAYER), host.world.maps.town.sites.set.get(building.site).entrance.outside);
        Object.assign(again.battle.actor(HOST_PLAYER), { map: "town", hp: 1e6, maxHp: 1e6 });
        run(again, 1500);
        assert.ok(again.world.maps[room.id], "the room made again");
        assert.ok(again.battle.links.some((one) => one.vault === vault.n));
    });

    it("drops the key that opens it, where its foe falls: its door refused to those without it, said why as it's chosen, and the key spent going through", () => {
        const { host, me, building } = below({ opens: "key" });

        through(host, me, building.door);

        const active = host.legends.active;
        const events = fell(host, me, active.ids[0]);
        const keyed = events.find(({ type, change }) => type === "vault" && change === "keyed");

        assert.ok(keyed, events.filter(({ type }) => type === "vault").map(({ change }) => change).join());

        const vault = host.legends.vaults[keyed.n];
        const link = host.battle.links.find((one) => one.vault === vault.n);
        const key = [...host.ground.values()].find((one) => one.bundle?.items.some(({ id }) => id === "vaultKey"));

        assert.equal(vault.open, false);
        assert.ok(key && key.map === vault.floor);
        assert.equal(host.shutOf(link.id, vault.floor, HOST_PLAYER).hint, REFUSALS.vaultKey);
        put(me, link.ends.find(({ map }) => map === vault.floor).arrive);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: link.id }), { ok: false, reason: "vaultKey" });

        // (The key taken up: the way open to her, and spent as she goes through)
        put(me, key.square);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: key.id }).ok, true);
        assert.equal(host.shutOf(link.id, vault.floor, HOST_PLAYER), null);

        const went = through(host, me, link);

        assert.ok(went.some(({ type, change }) => type === "vault" && change === "opened"));
        assert.equal(vault.open, true);
        assert.equal(host.players.get(HOST_PLAYER).progress.count("vaultKey"), 0);
    });

    it("puts debug mode's inside sample on the floor the player's on, and only on one of a dungeon's floors", () => {
        const { host, me, building } = below();

        assert.deepEqual(host.command(HOST_PLAYER, { type: "rare", inside: true }), { ok: false, reason: "rareFloor" });
        host.legends.clock(HOST_PLAYER).inside.due = false;
        through(host, me, building.door);
        assert.equal(host.command(HOST_PLAYER, { type: "rare", inside: true }).card, SAMPLE_DEEP.id);
        assert.equal(host.legends.active.map, building.maps[0]);
        assert.ok(REFUSALS.rareFloor);
    });
});
