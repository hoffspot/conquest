// Rare encounters (docs/WILDS.md *Rare encounters*; generated/rare_encounters_plan.md): now and
// then, instead of one of the wilds director's cards (core/director.js), something that isn't one
// of them: a card of a world's own deck of rare encounters, dealt to a player by a clock of their
// own whose chance rises with each card dealt instead, certain by the time it's long enough since
// the last; one at a time in a world. A *unique* card comes once in a world and once to a
// character, in any world; a *recurring* one now and then, hours apart. One not taken up, or taken
// up and not finished, goes back in the deck to come again; one done pays each who took part their
// own reward, an item found nowhere else (UNIQUES), and starts its thread (stage 2). None's in play
// yet: the cards are designed one at a time, and till then only the debug sample (SAMPLE) is dealt.
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
 * in the world: SHAPES), reward ({ unique }: UNIQUES), thread? (stage 2) }`.
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
    debug: true,
});

/** A card by its id: one in play, or the sample. */
export function cardOf(id) {
    return RARE_CARDS[id] ?? (id === SAMPLE.id ? SAMPLE : null);
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
 *
 * `cards`, by id, those it deals from: those in play and the sample (or a test's own).
 */
export class Legends {
    constructor(was = null, { cards = { ...RARE_CARDS, [SAMPLE.id]: SAMPLE } } = {}) {
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
     * may be: a unique card not done in this world nor by any of them; a recurring one come round
     * again; dealt ahead of a player (one kept at a site comes as it's come to); its gates holding,
     * or they've passed it over RARE `pass` times; or none. The deck made (shuffled with `random`)
     * from the cards in play the first time, any new since put in at the back; none of debug mode's.
     */
    pick(venue, { met = new Set(), at, random }) {
        const cards = this.cards;
        const playing = Object.values(cards).filter((card) => card.venue === venue && !card.debug);
        const deck = this.decks[venue].filter((id) => cards[id]);
        const fresh = playing.map(({ id }) => id).filter((id) => !deck.includes(id));

        this.decks[venue] = [...deck, ...(fresh.length ? shuffled(random, null, fresh) : [])];

        for (const id of this.decks[venue]) {
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

    /** Whether `at` is where `card` was left unseen or passed over before (within RARE `seen`). */
    spent(card, [x, y]) {
        return (this.spots[card] ?? []).some(([sx, sy]) => hypot(sx - x, sy - y) < RARE.seen);
    }
}
