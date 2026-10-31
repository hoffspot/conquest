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
import { CAMP, campOf, cardOf, CHANGES, DEBUG_CARDS, gatesHold, GUILD_KINDS, hourOf, keeperOf, Legends, LOCKS, lockSite, makeUnique, openerOf, priceTimes, RARE, RARE_CARDS, SAMPLE, SAMPLE_DEEP, SAMPLE_KIN, SHAPES, siteDoor, STEPS, TAKE_BACK, threadTalk, threadTracks, threadWares, threadWords, THREADS, UNIQUES, VAULT, VENUES } from "../client/js/core/rare.js";
import { decode, encode } from "../client/js/core/wire.js";
import { squaresOf } from "../client/js/core/grid.js";
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

    it("has two cards in play, the Stone Golem's and the Orc King's, each kept at a site and never dealt from a deck; and the sample debug mode deals: a foe of what lives there, a unique its reward", () => {
        assert.deepEqual(Object.keys(RARE_CARDS), ["stoneGolem", "orcKing"]);

        // (The Orc King: a world's boss, kept at his war camp where his war band's tracks lead, his
        // thread's second step; his reward his great axe, its cleave its own, and gold; his last
        // words said as he falls)
        const king = RARE_CARDS.orcKing;

        assert.equal(king.where, "site");
        assert.deepEqual(king.requires, { thread: "ironcrown", step: 1 });
        assert.equal(THREADS.ironcrown.steps[1].card, "orcKing");
        assert.equal(king.shape.creature, "orcKing");
        assert.deepEqual([UNIQUES[king.reward.unique].base, UNIQUES[king.reward.unique].effect], ["axe", "cleave"]);
        assert.ok(king.reward.gold > RARE_CARDS.stoneGolem.reward.gold && king.last.includes("Urzag"));

        // (The golem: a world's boss, kept where its thread's tracks lead, its thread's second step;
        // its reward the cleansed shard of its heart, an amulet with a ward of its own, and gold)
        const golem = RARE_CARDS.stoneGolem;

        assert.equal(golem.kind, "unique");
        assert.equal(golem.where, "site");
        assert.deepEqual(golem.requires, { thread: "harrowstone", step: 1 });
        assert.equal(THREADS.harrowstone.steps[1].card, "stoneGolem");
        assert.equal(golem.shape.creature, "stoneGolem");
        assert.equal(UNIQUES[golem.reward.unique].base, "amulet");
        assert.ok(golem.reward.gold >= 500);
        assert.equal(cardOf("stoneGolem"), golem);
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
        assert.deepEqual(STEPS, ["card", "place", "talk", "contract", "lock", "fight"]);
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
        assert.equal(SNAPSHOT_VERSION, 48);

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

// Into a building of the settlement (`place`) of a kind, the player put at its door and gone in
function into(host, kind, place) {
    // (Laid out now, as it would be as the world near it's made: its buildings added)
    host.world.maps.town.settlements.of(host.world.plan.places.find(({ id }) => id === place));

    const building = [...host.world.interiors.buildings.values()].find((one) => one.kind === kind && one.place === place);
    const me = host.battle.actor(HOST_PLAYER);

    put(me, building.door.ends[0].squares[0]);
    Object.assign(me, { map: "town" });
    assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);
    run(host, STEP_MS * 4);

    return building;
}

// A foe felled by `actor`, beside it, kept alive the while
function felled(host, actor, id) {
    const foe = host.battle.actor(id);
    const events = [];

    put(actor, foe.square.map((v, k) => v + (k ? 0 : 1)));
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

// Talking to one of a building's folk (`folk`: its record), stood before them
function talkTo(host, folk) {
    const me = host.battle.actor(HOST_PLAYER);
    const them = host.battle.actor(folk.id);

    put(me, [them.square[0], them.square[1] + 1]);
    Object.assign(me, { map: them.map });

    return host.command(HOST_PLAYER, { type: "talk", with: them.id }).ok;
}

describe("the Golem of Harrowstone (rare.js harrowstone, RARE_CARDS stoneGolem)", () => {
    it("deals a card in play by its id before someone in debug mode, its thread brought to it, begun at the settlement nearest its place; refused while another's out, and for one there isn't", () => {
        const { host, ada } = hosted({ party: false });

        const squares = squaresOf(host.world.maps.town);
        const open = ([cx, cy]) => [...Array(11).keys()].every((j) => [...Array(11).keys()].every((i) => !squares.blocked(cx - 15 + i * 3, cy - 15 + j * 3)));
        const [sx, sy] = host.world.start.at;
        const field = Array.from({ length: 400 }, (_, k) => [Math.floor(sx + 300 + (k % 20) * 40), Math.floor(sy + 300 + Math.floor(k / 20) * 40)]).find(open);

        // (Out in an open field, facing north: debug mode on)
        host.debugs = () => true;
        put(ada, field);
        Object.assign(ada, { map: "town", facing: 0 });
        host.travel.set(HOST_PLAYER, { at: [ada.x, ada.y], walked: 0, next: null, heading: [0, 1], deck: [] });

        assert.deepEqual(host.command(HOST_PLAYER, { type: "rare", card: "nothing" }), { ok: false, reason: "rareOut" });

        const dealt = host.command(HOST_PLAYER, { type: "rare", card: "stoneGolem" });
        const thread = host.legends.threads.harrowstone;
        const golem = host.battle.actor(host.legends.active.ids[0]);

        assert.equal(dealt.ok, true);
        assert.equal(dealt.card, "stoneGolem");
        assert.equal(thread.step, RARE_CARDS.stoneGolem.requires.step);
        assert.equal(thread.home, openerOf(host.world.plan, "harrowstone").town.id);
        assert.ok(golem.wild.worldBoss && Math.hypot(golem.x - ada.x, golem.y - ada.y) < 30, "(a little ahead of them)");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "rare", card: "stoneGolem" }), { ok: false, reason: "rareOut" }, "(one out already)");
    });

    it("is given up by a player alone, and taken back up from whoever told it, where it stood: nothing of it theirs meanwhile, while it goes on for the rest; and where its golem's kept is theirs to find again once they fall to it", () => {
        const { host, ada, bram } = hosted();
        const opener = openerOf(host.world.plan, "harrowstone");
        const told = (events) => events.filter(({ type }) => type === "thread");
        const goldOf = (id) => host.players.get(id).progress.gold;

        // (Begun by Ada, of the guild's mage)
        const guild = into(host, "guild", opener.town.id);
        const mage = guild.folk.find(({ look, role, talk }) => look === "mage" && (role === "adventurer" || talk === "adventurer"));
        const other = guild.folk.find(({ look, role, talk }) => look !== "mage" && (role === "adventurer" || talk === "adventurer"));

        assert.ok(talkTo(host, mage));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", step: null } }).ok, true);
        host.command(HOST_PLAYER, { type: "talk", with: null });

        const thread = host.legends.threads.harrowstone;

        // Given up: hers alone, once
        assert.deepEqual(host.command(HOST_PLAYER, { type: "abandon", thread: "harrowstone" }), { ok: true });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "abandon", thread: "harrowstone" }), { ok: false, reason: "thread" }, "(given up already)");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "abandon", thread: "nothing" }), { ok: false, reason: "thread" });
        assert.ok(host.legends.gaveUp("harrowstone", HOST_PLAYER) && !host.legends.gaveUp("harrowstone", "bram"));

        // (Ada at the ruins alone: nothing done, nothing hers)
        const quarry = host.world.maps.town.sites.heartOf(opener.site);
        const before = { ada: goldOf(HOST_PLAYER), bram: goldOf("bram") };

        Object.assign(ada, { map: "town" });
        put(ada, [Math.floor(quarry[0]), Math.floor(quarry[1])]);
        put(bram, [Math.floor(quarry[0]) + 80, Math.floor(quarry[1])]);
        run(host, 2500);
        assert.equal(thread.step, 0, "(not done by one who's given it up)");

        // (It goes on for the rest: Bram comes, and it's his, Ada beside him getting nothing of it)
        put(bram, [Math.floor(quarry[0]) + 2, Math.floor(quarry[1])]);
        run(host, 2500);
        assert.equal(thread.step, 1);
        assert.equal(goldOf("bram"), before.bram + 30);
        assert.equal(goldOf(HOST_PLAYER), before.ada, "(none of its rewards hers)");

        // (Its golem not dealt for her alone at its haunt)
        const haunt = thread.place;

        put(bram, [Math.floor(haunt[0]) + 400, Math.floor(haunt[1])]);
        put(ada, [Math.floor(haunt[0]) + 30, Math.floor(haunt[1])]);
        run(host, 1500);
        assert.equal(host.legends.active, null, "(not hers while she's given it up)");

        // Taken back up: not of any adventurer, but of the mage who told it, at her guild, as it stands
        assert.deepEqual(keeperOf("harrowstone"), { role: "adventurer", calling: "mage", home: true });
        assert.equal(keeperOf("sampleTrail").role, "receptionist");

        const tree = threadTalk({ start: "greet", nodes: { greet: { say: "Well met.", choices: [] } } }, { thread: "harrowstone", back: true });

        assert.equal(tree.nodes.greet.choices[0].say, THREADS.harrowstone.opens.back.ask);
        assert.deepEqual(tree.nodes.greet.choices[0].do, [{ thread: "harrowstone", back: true }]);
        assert.deepEqual(tree.nodes["thread:harrowstone:back"].say, [THREADS.harrowstone.opens.back.reply]);
        assert.ok(TAKE_BACK.ask.includes("{title}"));

        into(host, "guild", opener.town.id);
        assert.ok(talkTo(host, other));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", back: true } }), { ok: false, reason: "thread" }, "(not one of the others)");
        assert.ok(talkTo(host, mage));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", back: true } }), { ok: true });
        assert.ok(!host.legends.gaveUp("harrowstone", HOST_PLAYER));
        assert.equal(thread.step, 1, "(where it stood)");
        assert.ok(told(run(host, 200)).some(({ change, id, thread: one }) => change === "back" && id === HOST_PLAYER && one === "harrowstone"));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", back: true } }), { ok: false, reason: "thread" }, "(hers already)");

        // Falling to its golem: where it's kept hers to find again (on her maps, in her journal)
        host.command(HOST_PLAYER, { type: "talk", with: null });
        Object.assign(ada, { map: "town" });
        put(ada, [Math.floor(haunt[0]) + 30, Math.floor(haunt[1])]);
        run(host, 1500);

        const golem = host.battle.actor(host.legends.active.ids[0]);
        const fell = [];

        assert.equal(host.legends.active.card, "stoneGolem");
        put(ada, [Math.floor(golem.x) + 2, Math.floor(golem.y)]);
        Object.assign(ada, { hp: 5, maxHp: 5 });
        golem.hp = Math.round(golem.maxHp / 2);

        for (let t = 0; t < 30000 && !ada.dead; t += 250) {
            fell.push(...told(run(host, 250)));
        }

        fell.push(...told(run(host, 1000)));
        assert.ok(ada.dead, "(fallen to it)");
        assert.deepEqual(thread.fell, [HOST_PLAYER]);
        assert.ok(fell.some(({ change, id, at }) => change === "fell" && id === HOST_PLAYER && at[0] === haunt[0] && at[1] === haunt[1]));
        assert.equal(thread.step, 1, "(still at its golem)");

        // (Its golem, left alone, whole again for when she comes back)
        run(host, 1000);
        assert.equal(host.legends.active?.card, "stoneGolem");
        assert.equal(golem.hp, golem.maxHp);

        // (Its step done, the mark let go of)
        host.legends.advance("harrowstone", { ids: ["bram"] });
        assert.deepEqual(thread.fell, []);
    });

    it("begins with a guild mage's rumour in the settlement nearest Harrowstone's ruins; the Lantern Company found crushed there, Tamsin's note on them; the golem dealt where its tracks lead, a world's boss; felled, its heart and a purse for each who fought it; word taken back to the mage, the guild's bounty paid", () => {
        const { host, ada, bram } = hosted();
        const opener = openerOf(host.world.plan, "harrowstone");
        const told = (events) => events.filter(({ type }) => type === "thread");

        // (Its rumour's there to be told: the card's in play, the thread not begun; never dealt from
        // a deck, nor near anyone before it's come to)
        assert.ok(opener && GUILD_KINDS.includes(opener.town.kind) && opener.site.kind === "ruined quarry");
        assert.ok(host.legends.opening("harrowstone"));
        assert.equal(host.legends.threads.harrowstone, undefined);

        // The rumour: told by a mage of the guild there (every guild has one), not by another of
        // them while a mage is there; its tale told a piece at a time, then taken up
        const guild = into(host, "guild", opener.town.id);
        const mage = guild.folk.find(({ look, role, talk }) => look === "mage" && (role === "adventurer" || talk === "adventurer"));
        const other = guild.folk.find(({ look, role, talk }) => look !== "mage" && (role === "adventurer" || talk === "adventurer"));

        assert.ok(mage, "a mage at its guild");
        assert.ok(talkTo(host, other));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", step: null } }), { ok: false, reason: "thread" }, "(not one of them while a mage is there)");
        assert.ok(talkTo(host, mage));

        const tree = threadTalk({ start: "greet", nodes: { greet: { say: "Well met.", choices: [] } } }, { thread: "harrowstone", step: null }, (text) => text.replace(/\{way\}/g, "north"));
        const pieces = Object.keys(tree.nodes).filter((node) => /^thread:harrowstone:\d+$/.test(node));

        assert.equal(pieces.length, THREADS.harrowstone.opens.tale.length);
        assert.ok(tree.nodes["thread:harrowstone:0"].say[0].includes("north of here"));
        assert.deepEqual(tree.nodes[pieces.at(-1)].choices[0].do, [{ thread: "harrowstone", step: null }]);

        // (Taken up, their parting words, and the talk over: talked to again, it's not offered)
        assert.equal(tree.nodes[pieces.at(-1)].choices[0].next, "thread:harrowstone:taken");
        assert.deepEqual(tree.nodes["thread:harrowstone:taken"], { say: [THREADS.harrowstone.opens.taken], choices: [{ say: "Farewell.", next: null }] });
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", step: null } }).ok, true);

        const thread = host.legends.threads.harrowstone;
        const quarry = host.world.maps.town.sites.heartOf(opener.site);

        assert.equal(thread.step, 0);
        assert.equal(thread.home, opener.town.id);
        assert.deepEqual(thread.place, [...quarry], "(the ruins' heart, where the Company lies)");
        assert.equal(host.legends.opening("harrowstone"), false, "(told once)");

        // The ruins reached: the Lantern Company found, Tamsin's note and what they had on them
        host.command(HOST_PLAYER, { type: "talk", with: null });
        Object.assign(ada, { map: "town" });
        put(ada, [Math.floor(quarry[0]), Math.floor(quarry[1])]);
        put(bram, [Math.floor(quarry[0]) + 60, Math.floor(quarry[1])]);

        const found = told(run(host, 2500));

        assert.ok(found.some(({ change, id, gold, writing }) => change === "given" && id === HOST_PLAYER && gold === 30 && writing === "tamsin"), JSON.stringify(found));
        assert.equal(thread.step, 1);

        // Its tracks, from the Company's remains to where the golem is, up in the hills
        const haunt = thread.place;
        const [tracks] = threadTracks(host.legends);
        const far = Math.hypot(haunt[0] - quarry[0], haunt[1] - quarry[1]);

        assert.ok(far >= 109 && far <= 171, `${far} m`);
        assert.equal(tracks.creature, "stoneGolem");
        assert.equal(tracks.spoor, THREADS.harrowstone.steps[1].spoor, "(said as its step has it, as they're come upon)");
        assert.deepEqual(tracks.points[0], thread.at);
        assert.deepEqual(tracks.points.at(-1), haunt);
        assert.equal(host.legends.active, null, "(not dealt till it's come to)");

        // The golem dealt as Ada comes near where its tracks lead: a world's boss, a dungeon master's
        // rank, named
        put(ada, [Math.floor(haunt[0]) + 30, Math.floor(haunt[1])]);
        run(host, 1000);

        const active = host.legends.active;
        const golem = host.battle.actor(active.ids[0]);

        assert.equal(active.card, "stoneGolem");
        assert.deepEqual(active.at, haunt);
        assert.ok(golem.wild.worldBoss && golem.wild.steady && golem.wild.champion === "boss");
        assert.equal(golem.name, RARE_CARDS.stoneGolem.shape.title);

        // Felled, Ada and Bram beside it: each given the heart of Harrowstone and a purse, and the
        // card gone from the world for good
        const gold = { ada: host.players.get(HOST_PLAYER).progress.gold, bram: host.players.get("bram").progress.gold };

        put(bram, [Math.floor(golem.x) - 2, Math.floor(golem.y)]);

        const events = felled(host, ada, golem.id);
        const given = events.filter(({ type, change }) => type === "rare" && change === "given");

        assert.deepEqual(given.map(({ id }) => id).sort(), [HOST_PLAYER, "bram"].sort());
        assert.ok(given.every(({ item, gold: purse }) => item?.unique === "heartOfHarrowstone" && item.effect === "stoneheart" && purse === RARE_CARDS.stoneGolem.reward.gold));
        assert.equal(host.players.get("bram").progress.gold, gold.bram + RARE_CARDS.stoneGolem.reward.gold);
        assert.ok(host.legends.gone.has("stoneGolem"));
        assert.equal(thread.step, 2);
        assert.equal(thread.town, opener.town.id, "(word taken back to its home)");
        assert.deepEqual(threadTracks(host.legends), [], "(its tracks gone with it)");

        // Word of it taken back to the mage: the guild's old bounty paid, the thread at its end
        into(host, "guild", opener.town.id);
        assert.ok(talkTo(host, mage));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "harrowstone", step: 2 } }).ok, true);

        const ended = told(run(host, 200));

        assert.ok(ended.some(({ change, gold: bounty }) => change === "given" && bounty === 150));
        assert.ok(ended.some(({ change }) => change === "done"));
        assert.ok(thread.done);
    });
});

describe("the Iron Crown (rare.js ironcrown, RARE_CARDS orcKing)", () => {
    it("begins with a guild warrior's rumour of a border village the orcs' raiders burned; the raiders left there driven out, their leader's orders on him; the Orc King dealt at his war camp towards the orcs' lands; felled, Kingsplitter and a purse for each who fought him; word taken back, the guild's bounty paid", () => {
        const { host, ada, bram } = hosted();
        const plan = host.world.plan;
        const opener = openerOf(plan, "ironcrown");
        const told = (events) => events.filter(({ type }) => type === "thread");
        const near = (place) => Math.min(...plan.places.filter(({ race }) => race === "orc").map(({ at }) => Math.hypot(at[0] - place.at[0], at[1] - place.at[1])));

        // (The orcs' border village: the village of another people's nearest any settlement of
        // theirs, and the guild nearest it, not theirs either, where it's talked of)
        assert.ok(opener && opener.site.kind === "village" && opener.site.race !== "orc" && opener.town.race !== "orc" && opener.town.id !== opener.site.id && GUILD_KINDS.includes(opener.town.kind));
        assert.ok(plan.places.filter(({ kind, race }) => kind === "village" && race && race !== "orc").every((place) => near(place) >= near(opener.site)));
        assert.ok(host.legends.opening("ironcrown"));

        // The rumour: told by a warrior at the guild there (or, none there, any of its adventurers),
        // the village's name and which way it is in it; taken up, the village set burning
        const guild = into(host, "guild", opener.town.id);
        const adventurer = (one) => one.role === "adventurer" || one.talk === "adventurer";
        const teller = guild.folk.find((one) => adventurer(one) && one.look === "warrior") ?? guild.folk.find(adventurer);
        const tree = threadTalk({ start: "greet", nodes: { greet: { say: "Well met.", choices: [] } } }, { thread: "ironcrown", step: null }, (text) => text.replace(/\{way\}/g, "east").replace(/\{place\}/g, opener.site.name));

        assert.ok(tree.nodes["thread:ironcrown:0"].say[0].includes(`${opener.site.name} burned`) && tree.nodes["thread:ironcrown:0"].say[0].includes("east of here"));
        assert.ok(talkTo(host, teller));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "ironcrown", step: null } }).ok, true);

        const thread = host.legends.threads.ironcrown;
        const village = host.world.maps.town.settlements.of(opener.site);

        assert.equal(thread.step, 0);
        assert.equal(thread.town, opener.site.id);
        assert.ok(Math.hypot(thread.place[0] - opener.site.at[0], thread.place[1] - opener.site.at[1]) < 60, "(the village's middle)");
        assert.ok(village);

        const burning = host.burnt.find(({ place }) => place === opener.site.id);

        assert.ok(burning && burning.pieces.length >= 1 && burning.pieces.length <= 6, JSON.stringify(burning));
        assert.equal(thread.foes, null, "(the raiders not out till someone comes)");

        // The village reached: the raiders there, their leader by name; everyone gone far off, let
        // go, to be there again when they come back
        host.command(HOST_PLAYER, { type: "talk", with: null });
        Object.assign(ada, { map: "town" });

        const [vx, vy] = thread.place.map(Math.floor);

        put(ada, [vx, vy]);
        put(bram, [vx + 3, vy]);
        run(host, 1200);

        const raiders = () => thread.foes.map((id) => host.battle.actor(id)).filter(Boolean);

        assert.ok(thread.foes?.length >= 5 && thread.foes.length <= 6, JSON.stringify(thread.foes));
        assert.ok(raiders().every((one) => one.wild.creature === "orcRaider" && host.wild.get(one.id).thread === "ironcrown"));
        assert.equal(raiders().filter((one) => one.name === "Grukk of the Gravemaw").length, 1);

        put(ada, [vx + 400, vy]);
        put(bram, [vx + 402, vy]);
        run(host, 1200);
        assert.equal(thread.foes, null, "(let go)");
        put(ada, [vx, vy]);
        put(bram, [vx + 3, vy]);
        run(host, 1200);
        assert.ok(thread.foes?.length >= 5);

        // Driven out: their leader's orders, and a purse, for each there
        for (const id of thread.foes) {
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        }

        const driven = told(run(host, 2500));

        assert.ok(["ada", "bram"].every((who) => driven.some(({ change, id, gold, writing }) => change === "given" && id === (who === "ada" ? HOST_PLAYER : who) && gold === 60 && writing === "ironcrown")), JSON.stringify(driven));
        assert.equal(thread.step, 1);

        // His war band's tracks, out of the village towards the orcs' lands, to his war camp
        const camp = thread.place;
        const far = Math.hypot(camp[0] - thread.at[0], camp[1] - thread.at[1]);
        const orcs = plan.places.filter(({ race, kind }) => race === "orc" && kind !== "farmstead");
        const [tracks] = threadTracks(host.legends);

        assert.ok(far >= 219 && far <= 321, `${far} m`);
        assert.ok(orcs.length > 0);
        assert.equal(thread.town, opener.site.id);
        assert.equal(tracks.creature, "orcKing");
        assert.ok(tracks.spoor.includes("{way}") && tracks.spoor.includes("war camp"));
        assert.equal(host.legends.active, null);

        // The King dealt as Ada comes near his camp: a world's boss, named, his own moves, guard and
        // rally his
        put(ada, [Math.floor(camp[0]) + 30, Math.floor(camp[1])]);
        put(bram, [Math.floor(camp[0]) + 32, Math.floor(camp[1])]);
        run(host, 1000);

        const active = host.legends.active;
        const king = host.battle.actor(active.ids[0]);

        assert.equal(active.card, "orcKing");
        assert.equal(king.name, RARE_CARDS.orcKing.shape.title);
        assert.ok(king.wild.worldBoss && king.wild.champion === "boss" && king.wild.moves.length === 2 && king.wild.stance && king.wild.rally.length === 2);

        // Felled, Ada and Bram beside him: each given Kingsplitter, its cleave its own, and a purse
        put(bram, [Math.floor(king.x) - 2, Math.floor(king.y)]);

        const events = felled(host, ada, king.id);
        const given = events.filter(({ type, change }) => type === "rare" && change === "given");

        assert.deepEqual(given.map(({ id }) => id).sort(), [HOST_PLAYER, "bram"].sort());
        assert.ok(given.every(({ item, gold: purse }) => item?.unique === "kingsplitter" && item.id === "axe" && item.effect === "cleave" && item.name === "Kingsplitter" && purse === RARE_CARDS.orcKing.reward.gold));
        assert.ok(host.legends.gone.has("orcKing"));
        assert.equal(thread.step, 2);
        assert.equal(thread.town, opener.town.id, "(word taken back to its home)");

        // Word taken back to the guild: its bounty paid, the thread at its end
        into(host, "guild", opener.town.id);
        assert.ok(talkTo(host, teller));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "ironcrown", step: 2 } }).ok, true);

        const ended = told(run(host, 200));

        assert.ok(ended.some(({ change, gold: bounty }) => change === "given" && bounty === 200));
        assert.ok(thread.done);
    });

    it("pitches his war camp about where he's kept: its fire before him, its tents in a ring round it, each facing it", () => {
        const { fire, tents } = campOf([100, 200], 7);

        assert.deepEqual(fire, [100, 200 - CAMP.fire]);
        assert.equal(tents.length, 7);

        for (const { at, facing } of tents) {
            assert.ok(Math.abs(Math.hypot(at[0] - fire[0], at[1] - fire[1]) - CAMP.ring) < 1e-6);
            assert.ok(Math.abs(Math.atan2(fire[0] - at[0], fire[1] - at[1]) - facing) < 1e-9);
        }
    });

    it("brings his champions as he's worn down: Ironjaw at two thirds, by name, a tier under him, of his pack, from behind him; Bloodtusk at one third", () => {
        const { host, ada } = hosted();
        const [x, y] = ada.square;
        let dealt = null;

        for (let k = 0; k < 12 && !dealt?.ok; k++) {
            put(ada, [x + k * 40, y - k * 25]);
            dealt = host.command(HOST_PLAYER, { type: "rare", card: "orcKing" });
        }

        const id = host.legends.active.ids[0];
        const king = host.battle.actor(id);
        const one = host.wild.get(id);
        const champions = () => [...host.wild].filter(([, each]) => each.called === id).map(([who, each]) => ({ ...each, name: host.battle.actor(who)?.name }));

        Object.assign(king, { movesAt: { leap: Infinity, spin: Infinity }, guardAt: Infinity });
        put(ada, [Math.floor(king.x) + 2, Math.floor(king.y)]);
        run(host, 2000);
        assert.deepEqual(champions(), []);

        king.hp = Math.floor(king.maxHp * 0.6);
        run(host, 6000);
        assert.deepEqual(
            champions().map(({ creature, tier, pack, name }) => [creature, tier, pack, name]),
            [["orcIronjaw", Math.max(1, one.tier - 1), one.pack, "Ironjaw"]],
        );

        king.hp = Math.floor(king.maxHp * 0.3);
        run(host, 6000);
        assert.deepEqual(
            champions().map(({ creature, name }) => [creature, name]),
            [
                ["orcIronjaw", "Ironjaw"],
                ["orcBloodtusk", "Bloodtusk"],
            ],
        );
    });

    it("deals the King at once in debug mode, his thread brought to him; never another while one's out", () => {
        const { host, ada } = hosted();
        const [x, y] = ada.square;
        let dealt = null;

        // (Where there's open ground ahead of Ada for him)
        for (let k = 0; k < 12 && !dealt?.ok; k++) {
            put(ada, [x + k * 40, y - k * 25]);
            dealt = host.command(HOST_PLAYER, { type: "rare", card: "orcKing" });
        }

        assert.equal(dealt.card, "orcKing", JSON.stringify(dealt));
        assert.equal(host.legends.threads.ironcrown.step, 1);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "rare", card: "stoneGolem" }), { ok: false, reason: "rareOut" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "rare", card: "sample" }), { ok: false, reason: "rareOut" });
    });

    it("given up, its raiders aren't brought out by her alone, nor is she among those who drive them out; taken back up of the warrior who told it, in her own words, where it stood", () => {
        const { host, ada, bram } = hosted();
        const opener = openerOf(host.world.plan, "ironcrown");
        const guild = into(host, "guild", opener.town.id);
        const adventurer = (one) => one.role === "adventurer" || one.talk === "adventurer";
        const teller = guild.folk.find((one) => adventurer(one) && one.look === "warrior") ?? guild.folk.find(adventurer);
        const told = (events) => events.filter(({ type }) => type === "thread");

        assert.ok(talkTo(host, teller));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "ironcrown", step: null } }).ok, true);
        host.command(HOST_PLAYER, { type: "talk", with: null });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "abandon", thread: "ironcrown" }), { ok: true });

        // (Ada in the burned village alone: no raiders for her)
        const thread = host.legends.threads.ironcrown;
        const [vx, vy] = thread.place.map(Math.floor);

        Object.assign(ada, { map: "town" });
        put(ada, [vx, vy]);
        put(bram, [vx + 400, vy]);
        run(host, 1200);
        assert.equal(thread.foes, null, "(not hers to bring out)");

        // (Bram comes: out for him, and driven out by him alone, Ada beside him)
        put(bram, [vx + 3, vy]);
        run(host, 1200);
        assert.ok(thread.foes?.length >= 5);

        for (const id of thread.foes) {
            host.battle.afflict(id, "poison", { by: "bram", damage: 1e7 });
        }

        const driven = told(run(host, 2500));

        assert.equal(thread.step, 1);
        assert.ok(driven.some(({ change, id }) => change === "given" && id === "bram"));
        assert.ok(!driven.some(({ change, id }) => change === "given" && id === HOST_PLAYER), "(none of it hers)");

        // Taken back up: the warrior who told it, at the guild there, in the opener's own words
        const tree = threadTalk({ start: "greet", nodes: { greet: { say: "Well met.", choices: [] } } }, { thread: "ironcrown", back: true });

        assert.equal(keeperOf("ironcrown").calling, "warrior");
        assert.equal(tree.nodes.greet.choices[0].say, "About the Orc King: I'll go after him after all.");
        into(host, "guild", opener.town.id);
        assert.ok(talkTo(host, teller));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "ironcrown", back: true } }), { ok: true });
        assert.ok(!host.legends.gaveUp("ironcrown", HOST_PLAYER));
        assert.equal(thread.step, 1, "(where it stood)");
    });
});
