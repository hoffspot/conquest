// Rare encounters (docs/WILDS.md *Rare encounters*; generated/rare_encounters_plan.md): now and
// then, instead of one of the wilds director's cards (core/director.js), something that isn't one
// of them: a card of a world's own deck of rare encounters, dealt to a player by a clock of their
// own whose chance rises with each card dealt instead, certain by the time it's long enough since
// the last; one at a time in a world. A *unique* card comes once in a world and once to a
// character, in any world; a *recurring* one now and then, hours apart. One not taken up, or taken
// up and not finished, goes back in the deck to come again; one done pays each who took part their
// own reward, an item found nowhere else (UNIQUES), and starts its thread (THREADS): the world's,
// step after step (a follow-up card, a place to go, someone to talk to, a guild's contract), each
// step's reward to those who take part in it and each changing the world as it's done (CHANGES: a
// shop's stock, its prices, a festival, a place revealed). None's in play yet: the cards are
// designed one at a time, each with its thread, and till then only debug mode's sample (SAMPLE,
// its thread and the card that follows it) is dealt.
//
// Pure data and arithmetic, no DOM; a world's host keeps its Legends and drives it with its own
// random (host.js #rare...), every copy alike.

import { DAY, timeOfDay } from "./daytime.js";
import { shuffled } from "./director.js";
import { hypot } from "./exact.js";
import { rollGear } from "./gear.js";

const MINUTE = 60000;
const HOUR = 60 * MINUTE;

/**
 * - `wilds`: a player's clock as they cross the wilds (ms out there since their last rare card, or
 *   since they first came out in the world): none before `least`, then at each of the director's
 *   cards a chance of the rare one instead, `step` more for each one dealt instead, and certain
 *   once it's `most`; the `first` a player meets in a world, and those `after` it.
 * - `inside`: their clock inside, its time all their play since their last rare card inside: from
 *   `least`, a chance on going into a floor, `step` more for each floor gone into instead.
 * - `ahead`: how far ahead of a player one's put (metres, [least, most]); `seen`: how near it's
 *   seen; `far`: how far away everyone's gone from one for it to be left; `wait`: how long after
 *   it's first seen it's kept, left so (ms); `reach`: how near it a player takes part; `gap`: how
 *   long after one ends the next may come (ms); `recur`: how long a recurring one's away once it's
 *   done (ms, [least, most]); `pass`: how often a card's gates may pass it over before it's dealt
 *   anyway; `calm`: how long since a foe was after a player for one to be dealt to them (ms);
 *   `health`: how much of their health they must have; `kept`: how many of what's been met a
 *   world keeps told.
 */
export const RARE = Object.freeze({
    wilds: Object.freeze({ first: Object.freeze({ least: 40 * MINUTE, most: 90 * MINUTE }), after: Object.freeze({ least: 100 * MINUTE, most: 150 * MINUTE }), step: 0.007 }),
    inside: Object.freeze({ first: Object.freeze({ least: 20 * MINUTE }), after: Object.freeze({ least: 60 * MINUTE }), step: 0.1 }),
    ahead: Object.freeze([90, 140]),
    seen: 140,
    far: 220,
    wait: 10 * MINUTE,
    reach: 40,
    gap: 10 * MINUTE,
    recur: Object.freeze([4 * HOUR, 6 * HOUR]),
    pass: 3,
    calm: 5000,
    health: 0.5,
    kept: 40,
});

/** The venues a card's dealt in: out in the wilds, or inside (a dungeon's floor, a tower's). */
export const VENUES = Object.freeze(["wilds", "inside"]);

/**
 * The rare encounters in play, by id (none yet: each designed with its thread and its reward):
 * `{ id, title (as the journal has it), word (said as it's seen), kind ("unique" or "recurring"),
 * venue (VENUES), where ("ahead": dealt ahead of a player; "site": kept at a place the world picks),
 * gates? (when it's met: `hours`, `biomes`, `peoples`, each those it may be in), shape (what it is
 * in the world: SHAPES), reward ({ unique?, gold? }: UNIQUES), thread? (the thread it starts once
 * it's done: THREADS), requires? ({ thread, step }: a thread's follow-up, dealt only while the
 * thread's at that step, and before any other) }`.
 */
export const RARE_CARDS = Object.freeze({});

/**
 * What a card is in the world (its `shape.kind`):
 * - `foe`: a foe of its own, ranked as a dungeon's are (`champion`: "mini" or "boss"), `up` tiers
 *   above the land, called by its `title`; of `creature`, or, none, what lives there; done once it
 *   falls.
 */
export const SHAPES = Object.freeze(["foe"]);

/**
 * The rewards found nowhere else, by id: `{ id, name, base (a piece of gear: gear.js GEAR), about
 * (what's said of it), effect? (a legendary weapon's own: legendary.js EFFECTS) }`; each made as a
 * legendary of its base at the level of who it's given to (makeUnique), at most one of each to a
 * character.
 */
export const UNIQUES = Object.freeze({
    sampleSignet: Object.freeze({ id: "sampleSignet", name: "Signet of the Sample", base: "ring", about: "Made to try the rare encounters with, in debug mode. Found nowhere else." }),
});

/** The one card debug mode deals (never in a deck): a foe of what lives there, its reward a unique. */
export const SAMPLE = Object.freeze({
    id: "sample",
    title: "The Sample",
    word: "Something waits ahead that has no business being there.",
    kind: "unique",
    venue: "wilds",
    where: "ahead",
    shape: Object.freeze({ kind: "foe", creature: null, champion: "mini", up: 2, title: "the Sample" }),
    reward: Object.freeze({ unique: "sampleSignet" }),
    thread: "sampleTrail",
    debug: true,
});

/** The card that follows the sample, its thread's fourth step: debug mode's too. */
export const SAMPLE_KIN = Object.freeze({
    id: "sampleKin",
    title: "The Sample's Kin",
    word: "Something waits ahead that has the Sample's look about it.",
    kind: "unique",
    venue: "wilds",
    where: "ahead",
    shape: Object.freeze({ kind: "foe", creature: null, champion: "mini", up: 2, title: "the Sample's kin" }),
    reward: Object.freeze({ gold: 40 }),
    requires: Object.freeze({ thread: "sampleTrail", step: 3 }),
    debug: true,
});

/** Debug mode's cards, by id: never in a deck, dealt by its Rare encounter button. */
export const DEBUG_CARDS = Object.freeze({ [SAMPLE.id]: SAMPLE, [SAMPLE_KIN.id]: SAMPLE_KIN });

/** A card by its id: one in play, or one of debug mode's. */
export function cardOf(id) {
    return RARE_CARDS[id] ?? DEBUG_CARDS[id] ?? null;
}

/**
 * The kinds of step a thread has (THREADS `steps`):
 * - `card`: a follow-up card (`card`: one whose `requires` is this step), dealt before any other
 *   while the thread's at it; done once it's done.
 * - `place`: somewhere to go, `far` ([least, most] metres) from where the thread was last (its
 *   encounter, or the place of the step before), on open ground, marked on every player's maps;
 *   done once someone comes within `reach` of it.
 * - `talk`: one of the folk (`role`: roles.js ROLES, a barkeep, a priest...) in the settlement
 *   nearest where it was last: a word of the thread's (`ask`, and their `reply`) added to their
 *   talk; done once it's asked.
 * - `contract`: a contract on the board of that settlement's adventurers' guild: `need` beasts
 *   brought down near where it was last; done once it's reported done.
 * - `lock`: a lock opened (stage 3).
 */
export const STEPS = Object.freeze(["card", "place", "talk", "contract", "lock"]);

/**
 * How a thread's step changes the world as it's done (a step's `change`), in the settlement it
 * was at (or nearest where it was last):
 * - `stock`: a ware (`ware`: { id, quality, count }) on a shop's shelves there (`shop`: progress.js
 *   SHOPS), each day;
 * - `price`: a shop's prices there (`shop`, or every shop's) times `times`;
 * - `festival`: a festival there (`name`), its shops' prices times `times`, cried as it begins;
 * - `reveal`: the place of the plan's nearest where it was last (`site`, a kind: "ruins") shown on
 *   every player's maps.
 * Each for `lasts` ms of the world's play, or, none, for good.
 */
export const CHANGES = Object.freeze(["stock", "price", "festival", "reveal"]);

/**
 * The threads, by id: what comes of a rare encounter once it's done, the world's, step by step:
 * `{ id, title (as the journal has it), steps: [{ kind (STEPS), word (what's known of it, as it
 * begins and in the journal: {town} its settlement's name, {way} which way it is from where it
 * was last), reward? ({ gold?, unique? (UNIQUES), writing? (writings.js WRITINGS) }: each who takes
 * part in it given their own), change? (CHANGES), and its kind's own }] }`. None's in play yet but
 * the sample's, debug mode's, which has one of each kind.
 */
export const THREADS = Object.freeze({
    sampleTrail: Object.freeze({
        id: "sampleTrail",
        title: "The Sample's trail",
        steps: Object.freeze([
            Object.freeze({ kind: "place", far: Object.freeze([150, 250]), reach: 15, word: "The Sample came from somewhere {way} of where it fell. Its trail leads there.", reward: Object.freeze({ gold: 20 }), change: Object.freeze({ kind: "reveal", site: "ruins" }) }),
            Object.freeze({ kind: "talk", role: "barkeep", word: "The barkeep in {town} may have heard where the Sample came from.", ask: "Have you heard tell of the Sample?", reply: "The Sample? Aye, it's all anyone talks of. Out of the old places it came, they say, and its kin with it. The town's feasting that it's gone.", reward: Object.freeze({ gold: 15 }), change: Object.freeze({ kind: "festival", name: "the Feast of the Sample", times: 0.8, lasts: DAY.length }) }),
            Object.freeze({ kind: "contract", need: 2, word: "The guild in {town} wants the beasts the Sample stirred up brought down, out {way}.", reward: Object.freeze({ gold: 10 }), change: Object.freeze({ kind: "stock", shop: "tavern", ware: Object.freeze({ id: "potion", quality: "common", count: 3 }) }) }),
            Object.freeze({ kind: "card", card: "sampleKin", word: "The Sample's kin is out in the wilds somewhere. It will come to you." }),
        ]),
    }),
});

/** A thread step's words (`word`) filled in: {town}, the settlement's name; {way}, which way it is from where the thread was last. */
export const threadWords = (text, { town = "the nearest town", way = "near" } = {}) => text.replace(/\{town\}/g, town).replace(/\{way\}/g, way);

/**
 * How much the world's changes (Legends `changes`, as they are now: `played`) put a shop's prices
 * up or down in a settlement (`town`, a plan place's id; `shop`, progress.js SHOPS): its prices
 * times this.
 */
export function priceTimes(changes, { town, shop, played }) {
    return changes.filter((change) => (change.kind === "price" || change.kind === "festival") && change.town === town && (!change.shop || change.shop === shop) && lasting(change, played)).reduce((times, change) => times * change.times, 1);
}

/** The wares the world's changes put on a shop's shelves in a settlement: [{ id, quality, count }]. */
export function threadWares(changes, { town, shop, played }) {
    return changes.filter((change) => change.kind === "stock" && change.town === town && change.shop === shop && lasting(change, played)).map(({ ware }) => ({ id: ware.id, quality: ware.quality ?? "common", count: ware.count ?? 1 }));
}

// Whether a change is still in the world, `played` ms in
const lasting = (change, played) => change.until === null || change.until === undefined || played < change.until;

/**
 * One of the folk's talk (`tree`: dialogue.js TREES) with a thread's word added (`thread`'s, at
 * its `step`: `ask`, their `reply`): asked from their first choices, its doing `{ thread }` sent on
 * (host.js #threadTalk), back to those choices after.
 */
export function threadTalk(tree, { thread, step }) {
    const def = THREADS[thread]?.steps[step];

    if (!def || def.kind !== "talk") {
        return tree;
    }

    const start = tree.start ?? "greet";
    const first = tree.nodes[start];
    const choices = typeof first.choices === "string" ? (tree.nodes[first.choices]?.choices ?? []) : (first.choices ?? []);
    const node = `thread:${thread}`;

    return {
        ...tree,
        nodes: {
            ...tree.nodes,
            [start]: { ...first, choices: [{ say: def.ask, next: node, do: [{ thread, step }] }, ...choices] },
            [node]: { say: [def.reply], choices: [{ say: "Thank you.", next: start }, { say: "Farewell.", next: null }] },
        },
    };
}

/** The hour it is when the world's been going `elapsed` ms: "dawn", "day", "dusk" or "night" (daytime.js DAY). */
export function hourOf(elapsed) {
    const time = timeOfDay(elapsed);

    return time >= DAY.dawn && time < DAY.day ? "dawn" : time >= DAY.day && time < DAY.dusk ? "day" : time >= DAY.dusk && time < DAY.night ? "dusk" : "night";
}

/**
 * Whether a card's gates hold (`gates`: `hours`, `biomes`, `peoples`, each those it may be met in;
 * none, it may be met anywhere, any time) where and when it'd be dealt (`at`: { hour ("dawn",
 * "day", "dusk" or "night"), biome, people }).
 */
export function gatesHold(card, at) {
    const { hours = null, biomes = null, peoples = null } = card.gates ?? {};

    return (!hours || hours.includes(at.hour)) && (!biomes || biomes.includes(at.biome)) && (!peoples || peoples.includes(at.people));
}

/**
 * A unique (UNIQUES) made for a player at `level` (gear.js levelOf: their might's): a legendary of
 * its base, with its own name, its own effect if it has one, and its id (`unique`): bound to them.
 */
export function makeUnique(id, level, random) {
    const def = UNIQUES[id];
    const item = { ...rollGear(def.base, "legendary", random, { level }), name: def.name, unique: def.id };

    if (def.effect) {
        item.effect = def.effect;
    }

    return item;
}

/**
 * A world's rare encounters: what's been met there and what's to come.
 * - `played`: how long the world's been played (ms): what every time here's counted by.
 * - `clocks`: each player's (by id), for each venue: { since (ms of it since their last), misses
 *   (chances of it gone by since), due (its chance come up, not dealt yet), had (one met) }.
 * - `decks`: for each venue, the cards still to come, the next first: those in play shuffled once,
 *   a card dealt put to the back.
 * - `active`: the one out, or null: { n, card, venue, at ([x, y]), map, to (who it was dealt to),
 *   dealt (when), stage ("put", "seen" or "taken"), seen (when first), near (when someone last
 *   was), told (who's seen it), took (who's taken part), ids (what of it's in the world) }.
 * - `done`: what's been met, newest last (RARE kept): { n, card, at, map, when, how ("done",
 *   "failed" or "passed"), by (who took part) }.
 * - `gone`: the unique cards done in this world, never to come again in it.
 * - `recurs`: when each recurring card done may come again (`played`).
 * - `spots`: where each was left unseen or passed over ([[x, y]]), not put there again.
 * - `passes`: how often each's gates have passed it over since it was last dealt.
 * - `owed`: by player id, the cards whose rewards they're owed, gone before they were given.
 * - `last`: when the last ended (`played`), or null; `next`: the next one's number.
 * - `threads`: the threads begun, by id (THREADS): { id, step (the step it's at; past the last,
 *   it's done), at (where it was last: [x, y]), town (the settlement of a talk or contract step),
 *   place (a place step's: [x, y]), began (when), by (the names of those who've taken part),
 *   took (their ids), done }.
 * - `changes`: the world's changes (CHANGES), each { kind, thread, town, ..., from, until }.
 *
 * `cards`, by id, those it deals from: those in play and debug mode's (or a test's own).
 */
export class Legends {
    constructor(was = null, { cards = { ...RARE_CARDS, ...DEBUG_CARDS } } = {}) {
        // (As it was kept, on a device or a server: anything that isn't as it should be let go)
        const json = was && typeof was === "object" ? was : {};

        this.cards = cards;
        this.played = Number.isFinite(json.played) ? json.played : 0;
        this.clocks = new Map(Object.entries(json.clocks ?? {}).map(([id, clock]) => [id, Object.fromEntries(VENUES.map((venue) => [venue, { since: 0, misses: 0, due: false, had: false, ...clock?.[venue] }]))]));
        this.decks = Object.fromEntries(VENUES.map((venue) => [venue, [...(json.decks?.[venue] ?? [])]]));
        this.active = json.active ? structuredClone(json.active) : null;
        this.done = [...(json.done ?? [])];
        this.gone = new Set(json.gone ?? []);
        this.recurs = { ...json.recurs };
        this.spots = structuredClone(json.spots ?? {});
        this.passes = { ...json.passes };
        this.owed = structuredClone(json.owed ?? {});
        this.last = json.last ?? null;
        this.next = json.next ?? 1;
        this.threads = structuredClone(json.threads ?? {});
        this.changes = structuredClone(json.changes ?? []);
    }

    toJSON() {
        return {
            played: this.played,
            clocks: Object.fromEntries(this.clocks),
            decks: this.decks,
            active: this.active,
            done: this.done,
            gone: [...this.gone],
            recurs: this.recurs,
            spots: this.spots,
            passes: this.passes,
            owed: this.owed,
            last: this.last,
            next: this.next,
            threads: this.threads,
            changes: this.changes,
        };
    }

    /** The world played on `ms`. */
    pass(ms) {
        this.played += ms;
    }

    /** A player's clocks (made, the first time), by venue. */
    clock(id) {
        if (!this.clocks.has(id)) {
            this.clocks.set(id, Object.fromEntries(VENUES.map((venue) => [venue, { since: 0, misses: 0, due: false, had: false }])));
        }

        return this.clocks.get(id);
    }

    /** A player's time counted towards their next in `venue` (ms). */
    count(id, venue, ms) {
        this.clock(id)[venue].since += ms;
    }

    /**
     * Whether a player's due a rare card in `venue` now, at one of its chances (one of the
     * director's cards, or a floor gone into): from RARE `least`, its chance rolled with `random`,
     * a `step` more for each that's gone by; certain once it's `most`; once come up, due till it's
     * dealt.
     */
    due(id, venue, random) {
        const clock = this.clock(id)[venue];
        const { least, most = Infinity } = RARE[venue][clock.had ? "after" : "first"];

        if (clock.due) {
            return true;
        }

        if (clock.since < least) {
            return false;
        }

        clock.misses += 1;
        clock.due = clock.since >= most || random.next() < Math.min(1, clock.misses * RARE[venue].step);

        return clock.due;
    }

    /** Whether one may be dealt now: none out, and the gap since the last ended gone by. */
    free() {
        return !this.active && (this.last === null || this.played - this.last >= RARE.gap);
    }

    /**
     * The card to deal in `venue` to those met it'd be dealt to (`met`: the cards their characters
     * have done, in any world) where and when it'd be (`at`: gatesHold), the first in the deck that
     * may be (a thread's follow-up first, only while the thread's at it): a unique card not done in
     * this world nor by any of them; a recurring one come round again; dealt ahead of a player (one
     * kept at a site comes as it's come to); its gates holding, or they've passed it over RARE
     * `pass` times; or none. The deck made (shuffled with `random`)
     * from the cards in play the first time, any new since put in at the back; none of debug mode's.
     */
    pick(venue, { met = new Set(), at, random }) {
        const cards = this.cards;
        const playing = Object.values(cards).filter((card) => card.venue === venue && !card.debug);
        const deck = this.decks[venue].filter((id) => cards[id]);
        const fresh = playing.map(({ id }) => id).filter((id) => !deck.includes(id));

        this.decks[venue] = [...deck, ...(fresh.length ? shuffled(random, null, fresh) : [])];

        // (A thread's follow-up first, while the thread's at it: any other card only when none's
        // wanting; one wanted by none, never)
        const wanted = this.decks[venue].filter((id) => cards[id].requires && this.wants(cards[id]));
        const rest = this.decks[venue].filter((id) => !cards[id].requires);

        for (const id of [...wanted, ...rest]) {
            const card = cards[id];
            const may = card.where === "ahead" && !met.has(id) && (card.kind === "unique" ? !this.gone.has(id) : this.played >= (this.recurs[id] ?? 0));

            if (!may) {
                continue;
            }

            if (gatesHold(card, at) || (this.passes[id] ?? 0) >= RARE.pass) {
                return id;
            }

            this.passes[id] = (this.passes[id] ?? 0) + 1;
        }

        return null;
    }

    /**
     * A card dealt (`card`: its id) in `venue`, put at `at` on `map` for player `to`, what of it's
     * in the world `ids`: out now, to the back of its deck, its gates' passes forgotten, and the
     * clock that dealt it no longer due. The one out.
     */
    deal(card, { venue, at, map, to, ids = [] }) {
        const deck = this.decks[venue];

        this.decks[venue] = [...deck.filter((id) => id !== card), ...(deck.includes(card) ? [card] : [])];
        delete this.passes[card];
        this.clock(to)[venue].due = false;
        this.active = { n: this.next++, card, venue, at: [...at], map, to, dealt: this.played, stage: "put", seen: null, near: this.played, told: [], took: [], ids: [...ids] };

        return this.active;
    }

    /**
     * Those who've seen the one out now (`ids`: players within RARE `seen` of it): told, their clocks
     * for its venue begun again; the first time, it's seen. Those newly told.
     */
    sees(ids) {
        const active = this.active;
        const fresh = ids.filter((id) => !active.told.includes(id));

        for (const id of fresh) {
            const clock = this.clock(id)[active.venue];

            active.told.push(id);
            Object.assign(clock, { since: 0, misses: 0, due: false, had: true });
        }

        if (fresh.length && active.stage === "put") {
            active.stage = "seen";
            active.seen = this.played;
        }

        return fresh;
    }

    /** Those taking part in the one out now (`ids`: players within RARE `reach` of it, or fighting it): it's taken up. Those newly taking part. */
    takes(ids) {
        const active = this.active;
        const fresh = ids.filter((id) => !active.took.includes(id));

        active.took.push(...fresh);

        if (ids.length) {
            active.stage = "taken";
            active.near = this.played;
        }

        return fresh;
    }

    /**
     * Whether the one out's to be left now (`near`: whether anyone's within RARE `far` of it; `over`:
     * whether its hour's past, a night one's at dawn): "passed" (seen by no one, everyone far; or
     * seen and not taken up, everyone far and RARE `wait` since it was seen, or its hour past),
     * "failed" (taken up, then everyone far, `wait` since anyone last was), or null.
     */
    left({ near, over = false }) {
        const active = this.active;

        if (near) {
            active.near = this.played;
        }

        if (active.stage === "put") {
            return near ? null : "passed";
        }

        if (active.stage === "seen") {
            return over || (!near && this.played - active.seen >= RARE.wait) ? "passed" : null;
        }

        return !near && this.played - active.near >= RARE.wait ? "failed" : null;
    }

    /**
     * The one out ended, `how` ("done", "failed" or "passed"), by those who took part (`by`, their
     * names as told); `random` for when a recurring one comes again. Done: a unique gone from this
     * world, a recurring one away a while (RARE `recur`). Failed or passed: where it was not put
     * again, and it comes again in its turn. Kept as met. What ended.
     */
    end(how, { by = [], random = null } = {}) {
        const active = this.active;
        const card = this.cards[active.card];
        const ended = { n: active.n, card: active.card, at: active.at, map: active.map, when: this.played, how, by: [...by] };

        if (how === "done" && card?.kind === "recurring") {
            const [least, most] = RARE.recur;

            this.recurs[active.card] = this.played + least + (random ? random.next() : 0.5) * (most - least);
        } else if (how === "done") {
            this.gone.add(active.card);
        } else {
            (this.spots[active.card] ??= []).push([...active.at]);
        }

        this.done = [...this.done, ended].slice(-RARE.kept);
        this.active = null;
        this.last = this.played;

        return ended;
    }

    /** A player owed the rewards of `card`, gone before it was given. */
    owe(id, card) {
        (this.owed[id] ??= []).push(card);
    }

    /** The cards whose rewards a player's owed, forgotten as they're given. */
    owedTo(id) {
        const owed = this.owed[id] ?? [];

        delete this.owed[id];

        return owed;
    }

    /** Whether a card's wanted now: one that follows a thread (`requires`), while the thread's at that step; any other, always. */
    wants(card) {
        const thread = card.requires ? this.threads[card.requires.thread] : null;

        return !card.requires || Boolean(thread && !thread.done && thread.step === card.requires.step);
    }

    /**
     * A thread begun (THREADS: `id`), at `at` (where its encounter was done), by those who took part
     * in it (`ids`, and their names `by`): at its first step. It, or null (no such thread, or begun
     * already: a world's thread begins once).
     */
    begin(id, { at, ids = [], by = [] }) {
        if (!THREADS[id] || this.threads[id]) {
            return null;
        }

        this.threads[id] = { id, step: 0, at: [...at], town: null, place: null, began: this.played, by: [...new Set(by)], took: [...new Set(ids)], done: false };

        return this.threads[id];
    }

    /** The step a thread's at (THREADS), or null (not begun, or done). */
    stepOf(id) {
        const thread = this.threads[id];

        return thread && !thread.done ? (THREADS[id]?.steps[thread.step] ?? null) : null;
    }

    /**
     * A thread's step done, by those who took part in it (`ids`, their names `by`), where it was
     * done (`at`; else its place, or where it was last): on to the next, or done with the last.
     * What was done: { thread, step (its index), def (THREADS'), next (the next's def, or null) }.
     */
    advance(id, { ids = [], by = [], at = null } = {}) {
        const thread = this.threads[id];
        const def = this.stepOf(id);

        if (!def) {
            return null;
        }

        const step = thread.step;

        thread.at = [...(at ?? thread.place ?? thread.at)];
        thread.by = [...new Set([...thread.by, ...by])];
        thread.took = [...new Set([...thread.took, ...ids])];
        thread.step += 1;
        thread.town = null;
        thread.place = null;
        thread.done = thread.step >= THREADS[id].steps.length;

        return { thread: id, step, def, next: this.stepOf(id) };
    }

    /** A change to the world (CHANGES) made now: lasting its `lasts` ms, or for good; those past let go. The change. */
    change(change) {
        const { lasts = null, ...rest } = change;
        const made = { ...rest, from: this.played, until: lasts === null ? null : this.played + lasts };

        this.changes = [...this.changes.filter((each) => lasting(each, this.played)), made];

        return made;
    }

    /** The world's changes still in it. */
    lasting() {
        return this.changes.filter((change) => lasting(change, this.played));
    }

    /** Whether `at` is where `card` was left unseen or passed over before (within RARE `seen`). */
    spent(card, [x, y]) {
        return (this.spots[card] ?? []).some(([sx, sy]) => hypot(sx - x, sy - y) < RARE.seen);
    }
}
