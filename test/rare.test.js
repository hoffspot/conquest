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
import { cardOf, gatesHold, hourOf, Legends, makeUnique, RARE, RARE_CARDS, SAMPLE, SHAPES, UNIQUES, VENUES } from "../client/js/core/rare.js";
import { decode, encode } from "../client/js/core/wire.js";
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

            // (Bound: not sold, dropped, thrown away nor traded)
            assert.deepEqual(host.command(id, { type: "drop", index }), { ok: false, reason: "bound" });
            assert.deepEqual(host.command(id, { type: "discard", index }), { ok: false, reason: "bound" });
        }

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
        assert.equal(SNAPSHOT_VERSION, 46);

        // (A world kept before: none met, none out; its players' progress none either)
        const old = { ...host.snapshot(), version: 45 };

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
