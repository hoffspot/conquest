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
// shop's stock, its prices, a festival, a place revealed). A thread may come before its card
// instead (`opens`: a rumour heard first, its steps leading to the card). The cards are designed
// one at a time, each with its thread: the first, the Stone Golem of Harrowstone (stoneGolem: its
// thread begun by a guild mage's rumour, harrowstone), besides debug mode's sample (SAMPLE, its
// thread and the card that follows it).
//
// Pure data and arithmetic, no DOM; a world's host keeps its Legends and drives it with its own
// random (host.js #rare...), every copy alike.

import { DAY, timeOfDay } from "./daytime.js";
import { shuffled } from "./director.js";
import { hypot, sin } from "./exact.js";
import { rollGear } from "./gear.js";
import { createRandom } from "./random.js";

const MINUTE = 60000;
const HOUR = 60 * MINUTE;

/**
 * - `wilds`: a player's clock as they cross the wilds (ms out there since their last rare card, or
 *   since they first came out in the world): none before `least`, then at each of the director's
 *   cards a chance of the rare one instead, `step` more for each one dealt instead, and certain
 *   once it's `most`; the `first` a player meets in a world, and those `after` it.
 * - `inside`: their clock inside, its time all their play since their last rare card inside: from
 *   `least`, a chance on going into a floor, `step` more for each floor gone into instead.
 * - `ahead`: how far ahead of a player one's put (metres, [least, most]); `site`: how near one
 *   kept at a site a player must come for it to be dealt there (its tracks followed); `seen`: how
 *   near it's seen; `far`: how far away everyone's gone from one for it to be left; `wait`: how long after
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
    site: 70,
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
 * The rare encounters in play, by id, each designed with its thread and its reward:
 * `{ id, title (as the journal has it), word (said as it's seen), kind ("unique" or "recurring"),
 * venue (VENUES), where ("ahead": dealt ahead of a player; "site": kept at a place its thread
 * picks, its card step's, dealt as someone who's not done it comes within RARE `site` of it),
 * gates? (when it's met: `hours`, `biomes`, `peoples`, each those it may be in), shape (what it is
 * in the world: SHAPES), reward ({ unique?, gold? }: UNIQUES), thread? (the thread it starts once
 * it's done: THREADS), requires? ({ thread, step }: a thread's follow-up, dealt only while the
 * thread's at that step, and before any other) }`.
 */
export const RARE_CARDS = Object.freeze({
    // (The Stone Golem of Harrowstone (creatures.js stoneGolem): a world's boss, once a world, kept
    // where its tracks lead from the Lantern Company's remains in the ruins of Harrowstone quarry
    // (its thread's card step), a rank above a dungeon's master, its bar across the top of the
    // screen; its reward the cleansed shard of its heart, and a purse of gold)
    stoneGolem: Object.freeze({
        id: "stoneGolem",
        title: "The Stone Golem",
        word: "The ground shakes underfoot. Up among the rocks something huge and grey turns towards you, a violet light flickering in its chest: the golem of Harrowstone.",
        kind: "unique",
        venue: "wilds",
        where: "site",
        shape: Object.freeze({ kind: "foe", creature: "stoneGolem", champion: "boss", up: 2, title: "the Stone Golem of Harrowstone" }),
        reward: Object.freeze({ unique: "heartOfHarrowstone", gold: 750 }),
        requires: Object.freeze({ thread: "harrowstone", step: 1 }),
    }),
});

/**
 * What a card is in the world (its `shape.kind`):
 * - `foe`: a foe of its own, ranked as a dungeon's are (`champion`: "mini" or "boss"), `up` tiers
 *   above the land, called by its `title`; of `creature`, or, none, what lives there; done once it
 *   falls.
 */
export const SHAPES = Object.freeze(["foe"]);

/**
 * The rewards found nowhere else, by id: `{ id, name, base (a piece of gear: gear.js GEAR), about
 * (what's said of it), effect? (its own: legendary.js EFFECTS, whatever it is, held or worn: a
 * weapon's blows let loose, or a ward the blows on its wearer do) }`; each made as a legendary of
 * its base at the level of who it's given to (makeUnique), at most one of each to a character.
 */
export const UNIQUES = Object.freeze({
    sampleSignet: Object.freeze({ id: "sampleSignet", name: "Signet of the Sample", base: "ring", about: "Made to try the rare encounters with, in debug mode. Found nowhere else." }),
    // (The Stone Golem's reward: an amulet, its effect a ward, legendary.js stoneheart)
    heartOfHarrowstone: Object.freeze({
        id: "heartOfHarrowstone",
        name: "Heart of Harrowstone",
        base: "amulet",
        effect: "stoneheart",
        about: "A shard of the crystal that was the Stone Golem's heart, the blight that drove it mad burnt out of it as it fell, set in old silver. It is warm to the touch, and steady as a heartbeat. Blows land lighter on whoever wears it, and now and then their skin turns to stone. Found nowhere else.",
    }),
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

/**
 * Debug mode's inside card: a foe of the floor's own on the floor gone into, its fall breaking the
 * ward on the door it brings (VAULT), its unique in the room behind.
 */
export const SAMPLE_DEEP = Object.freeze({
    id: "sampleDeep",
    title: "The Sample Below",
    word: "Something waits on this floor that has no business being here.",
    kind: "unique",
    venue: "inside",
    where: "ahead",
    shape: Object.freeze({ kind: "foe", creature: null, champion: "mini", up: 2, title: "the Sample below" }),
    vault: Object.freeze({ opens: "ward", foes: 3, up: 1 }),
    reward: Object.freeze({ unique: "sampleSignet" }),
    debug: true,
});

/** Debug mode's cards, by id: never in a deck, dealt by its Rare encounter buttons. */
export const DEBUG_CARDS = Object.freeze({ [SAMPLE.id]: SAMPLE, [SAMPLE_KIN.id]: SAMPLE_KIN, [SAMPLE_DEEP.id]: SAMPLE_DEEP });

/**
 * An inside card's sealed room (a card's `vault`: { opens ("ward": its foe's fall breaks the ward on
 * its door; "key": its foe drops the key that opens it, spent going through), foes (how many keep
 * it), up (tiers above the floor's) }): its door added to the floor its foe fell on, against the
 * rock within `near` metres of where it fell and at least `clear` from the floor's ways in; the room
 * itself a map of its own (`rows`: rock, floor, its chest `h` at the back, its keepers `g`, its way
 * out `^`, a flight up into the rock, and its foot `<`), at origins of its own (`origins`: east of the hells', a row of `across`, `step` apart),
 * its torches on its walls (`lights`).
 */
export const VAULT = Object.freeze({
    near: 14,
    clear: 6,
    origins: Object.freeze({ x: 30000, step: 40, across: 50 }),
    rows: Object.freeze([
        "#############",
        "#...........#",
        "#...........#",
        "#.....h.....#",
        "#..g.....g..#",
        "#...........#",
        "#.....g.....#",
        "#...........#",
        "#...........#",
        "#.....<<....#",
        "######^^#####",
        "######^^#####",
    ]),
    lights: Object.freeze([Object.freeze({ at: [1, 4], kind: "torch", wall: [-1, 0] }), Object.freeze({ at: [11, 4], kind: "torch", wall: [1, 0] }), Object.freeze({ at: [1, 8], kind: "torch", wall: [-1, 0] }), Object.freeze({ at: [11, 8], kind: "torch", wall: [1, 0] })]),
});

/** Where a world's `n`th sealed room is drawn ([x, y] metres: VAULT `origins`). */
export const vaultOrigin = (n) => [VAULT.origins.x + ((n - 1) % VAULT.origins.across) * VAULT.origins.step, Math.floor((n - 1) / VAULT.origins.across) * VAULT.origins.step];

/** A card by its id: one in play, or one of debug mode's. */
export function cardOf(id) {
    return RARE_CARDS[id] ?? DEBUG_CARDS[id] ?? null;
}

/**
 * The kinds of step a thread has (THREADS `steps`):
 * - `card`: a follow-up card (`card`: one whose `requires` is this step), dealt before any other
 *   while the thread's at it; done once it's done. One kept at a site (its `where`) is kept `far`
 *   ([least, most] metres) from where the thread was last, up on the highest open ground there
 *   (its place: not marked on the maps, its foe's prints leading there from where it was last:
 *   threadTracks, said as they're come upon in its words, `spoor`).
 * - `place`: somewhere to go, `far` ([least, most] metres) from where the thread was last (its
 *   encounter, or the place of the step before), on open ground, or the plan's place of a kind
 *   (`site`: "ruined quarry", the nearest), marked on every player's maps; done once someone comes
 *   within `reach` of it. What's found there is its kind's (core/places.js PLACE_KINDS `scene`:
 *   setpieces/scenes.js, laid out at its heart), its writing given (`reward.writing`).
 * - `talk`: one of the folk (`role`: roles.js ROLES, a barkeep, a priest...; an adventurer of a
 *   `calling`, at its guild, or, none of that calling left there, any of them) in the settlement
 *   nearest where it was last (`home`: the one the thread was begun in, its rumour's): a word of
 *   the thread's (`ask`, and their `reply`) added to their talk; done once it's asked.
 * - `contract`: a contract on the board of that settlement's adventurers' guild: `need` beasts
 *   brought down near where it was last; done once it's reported done.
 * - `lock`: a lock opened (`lock`: LOCKS), as the thread comes to it, its way in marked on every
 *   player's maps; done once someone goes in by it.
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
 * `{ id, title (as the journal has it), opens? (a thread that comes before its card, begun by a
 * rumour: OPENERS), steps: [{ kind (STEPS), word (what's known of it, as it begins and in the
 * journal: {town} its settlement's name, {way} which way it is from where it was last), reward? ({
 * gold?, unique? (UNIQUES), writing? (writings.js WRITINGS) }: each who takes part in it given
 * their own), change? (CHANGES), and its kind's own }] }`. The sample's, debug mode's, has one of
 * each kind; the Golem of Harrowstone's is begun by a rumour, and its card's its second step.
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
            Object.freeze({ kind: "lock", lock: "sampleDoor", word: "The Sample's kin bore the mark that opens the sealed way into {place}, {way} of where it fell. It's open now.", reward: Object.freeze({ gold: 25 }) }),
        ]),
    }),
    // (The Golem of Harrowstone (docs/WILDS.md *The Stone Golem*): begun by a guild mage's rumour in
    // the settlement nearest the ruins of Harrowstone quarry; the Lantern Company's remains found
    // there, Tamsin's note on them, the golem's prints leading away up into the hills; the golem
    // (RARE_CARDS stoneGolem); and word of it all taken back to the mage, who pays the guild's old
    // bounty on it)
    harrowstone: Object.freeze({
        id: "harrowstone",
        title: "The Golem of Harrowstone",
        opens: Object.freeze({
            kind: "talk",
            role: "adventurer",
            calling: "mage",
            near: "ruined quarry",
            ask: "Heard anything worth knowing?",
            tale: Object.freeze([
                Object.freeze({ say: "You've not heard of Harrowstone? Sit, then. Twenty years back the quarry up in the hills {way} of here was the richest in the land, and its master wanted it richer. He paid Magister Aldric Venn to make it so: a mage with more power in his little finger than this whole guild has, and less will to use it than a cat in the sun.", ask: "Go on." }),
                Object.freeze({ say: "Venn wasn't going to stand in a pit raising stone with his own two hands. He shut himself in his tower a winter and made a golem to do it for him: four metres of cut stone, his runes up its arms. For its heart he bought a crystal off a pedlar, cheap. There was a hair of black in it. He never looked closely enough to see it.", ask: "What happened?" }),
                Object.freeze({ say: "It worked a season, day and night, and never tired. Then one morning it stopped in the middle of the pit, and turned round. It broke the cranes like kindling. It went through the cutters, then the guards who came running, and when Venn came down to put it right, it took him too. There was no one left to bury them.", ask: "And the golem?" }),
                Object.freeze({ say: "Still up there. It's wandered those hills twenty years, round and round the ruins, as if it's looking for work. Drovers go miles out of their way. Ten days ago the Lantern Company went up after it: Bram, Ilsa, old Corwin, and Tamsin, who learnt her first spells beside me. They swore they'd bring back its heart. They haven't come back at all." }),
            ]),
            take: "I'll find out what became of them.",
            taken: "Then go with care, and keep your eyes on the hills. If there's anything of them left to find, bring me word. Tamsin was the best I ever taught; she'd not have run from it.",
            leave: "Not for me.",
            back: Object.freeze({ ask: "About the Lantern Company: I'll see it through after all.", reply: "Good. I didn't think you'd leave them up there. The ruins are where they were, and so is the golem. Go carefully." }),
        }),
        steps: Object.freeze([
            Object.freeze({ kind: "place", site: "ruined quarry", reach: 18, word: "The Lantern Company went up to the ruins of Harrowstone quarry, {way} of {town}, after its golem, and never came back. Find out what became of them.", reward: Object.freeze({ gold: 30, writing: "tamsin" }) }),
            Object.freeze({ kind: "card", card: "stoneGolem", far: Object.freeze([110, 170]), spoor: "Great footprints of stone, sunk deep in the ground", word: "What's left of the Lantern Company lies crushed in the ruins of Harrowstone. Great round footprints lead away from them, {way} up into the hills: the golem's. Follow them, and finish what the Company began." }),
            Object.freeze({
                kind: "talk",
                role: "adventurer",
                calling: "mage",
                home: true,
                word: "The golem of Harrowstone is rubble. Take word of the Lantern Company, and Tamsin's note, to the mage at the guild in {town}.",
                ask: "I found the Lantern Company. And the golem.",
                reply: "Then they're... no. I knew, really, when the days went by. Thank you for finding them, and for the note. So the crystal was flawed, and Venn never knew. Twenty years, and he's only now buried. Here: the guild posted a bounty on that golem the year it went mad, and no one ever thought to take it down.",
                reward: Object.freeze({ gold: 150 }),
            }),
        ]),
    }),
});

/**
 * How a thread that comes before its card is begun (THREADS `opens`): a rumour told by one of the
 * folk (`kind` "talk": an adventurer of a `calling`, `role`'s, at the guild in the settlement
 * nearest the plan's place of a kind, `near`: openerTown; none of that calling left there, any of
 * its adventurers), asked of them (`ask`), the tale told a piece at a time (`tale`: each piece's
 * words, {way} which way the place is from there, and what's asked for the next), then taken up
 * (`take`: the thread begun, its home that settlement; their parting words `taken`, the talk over)
 * or left (`leave`). Only while the card it leads to is in play and not done in the world, and the
 * thread not begun. Given up by a player since (Legends `giveUp`), the one who told it takes them
 * back on it (`back`: what they ask, and the reply; keeperOf, TAKE_BACK).
 */
export const OPENERS = Object.freeze(["talk"]);

/**
 * The callings the threads' talk asks for of a guild's adventurers (THREADS `opens` and steps of
 * `kind` "talk", their `calling`): every guild has one of each (core/insides.js guildFolkOf).
 */
export const TALK_CALLINGS = Object.freeze(
    [...new Set(Object.values(THREADS).flatMap(({ opens = null, steps }) => [opens, ...steps].filter((def) => def?.kind === "talk" && def.calling).map(({ calling }) => calling)))].sort(),
);

/**
 * Who takes a player back on a thread they gave up (Legends `giveUp`), as they'd be talked to
 * (talksFor): the one who told its rumour, if it's begun by one (THREADS `opens`: an adventurer of
 * its `calling` at the guild in its home settlement, `home`), else the receptionist at any guild.
 * { role, calling, home }.
 */
export function keeperOf(id) {
    const opens = THREADS[id]?.opens;

    return opens?.kind === "talk" ? { role: opens.role, calling: opens.calling ?? null, home: true } : { role: "receptionist", calling: null, home: false };
}

/** What a player asks to take a thread they gave up back up, and the reply, if its opener says nothing of its own (`opens.back`): {title} its title. */
export const TAKE_BACK = Object.freeze({ ask: "About {title}: I'd take it up again.", reply: "Then it's yours again, as it stood when you left it." });

/** The kinds of settlement with an adventurers' guild (setpieces/town.js: a village or bigger). */
export const GUILD_KINDS = Object.freeze(["village", "town", "city", "capital"]);

/**
 * The plan's place of a kind a thread's opener's near (`opens.near`): the first of them (`plan`'s
 * sites), or null; and the settlement with a guild nearest it (GUILD_KINDS), the rumour's. The same
 * on every copy: { site, town } (the plan's), or null.
 */
export function openerOf(plan, thread) {
    const opens = THREADS[thread]?.opens;
    const site = opens ? ((plan?.sites ?? []).filter((one) => one.kind === opens.near).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null) : null;

    if (!site) {
        return null;
    }

    const towns = (plan.places ?? []).filter((place) => GUILD_KINDS.includes(place.kind));
    const town = towns.reduce((best, place) => (!best || hypot(place.at[0] - site.at[0], place.at[1] - site.at[1]) < hypot(best.at[0] - site.at[0], best.at[1] - site.at[1]) ? place : best), null);

    return town ? { site, town } : null;
}

/**
 * Whether one of the folk (`folk`: { role, talk, look }; `hall`, the rest at their guild) is one
 * a thread's talk (`def`: a step's, or an opener's) is for: of its role (an adventurer's talk, at
 * a guild's table, as an adventurer's), and, it wanting one of a calling, of it, or none of it left
 * there.
 */
export function talksFor(def, folk, hall = []) {
    const adventurer = (one) => one.role === "adventurer" || one.talk === "adventurer";
    const role = def.role === "adventurer" ? adventurer(folk) : folk.role === def.role;

    return role && (!def.calling || folk.look === def.calling || !hall.some((one) => adventurer(one) && one.look === def.calling));
}

/**
 * The world's locks, by id: a way in kept shut, a thread's (`thread`), till the thread comes to it
 * (a `lock` step): `{ id, thread, on (the kinds of place, the plan's sites, one of which it's put
 * on, chosen from the world's seed: lockSite), hint (said as its door's chosen, of what might open
 * it) }`. One's shut from the world's making while its thread's a card's in play, else (a debug
 * thread's) once its thread's begun: none in a world nothing's been dealt in. None's in play yet
 * but the sample's.
 */
export const LOCKS = Object.freeze({
    sampleDoor: Object.freeze({ id: "sampleDoor", thread: "sampleTrail", on: Object.freeze(["ruins", "cave"]), hint: "Its way in is sealed, a mark like the Sample's pressed into the seal. Whatever opens it, the Sample's kin will have it." }),
});

/**
 * The place a lock's put on in a world (`plan`: its sites; `seed`, the world's): one of its kinds
 * (`on`), the same on every copy and every time it's asked; or null, the world having none.
 */
export function lockSite(plan, lock, seed = 1) {
    const sites = (plan?.sites ?? []).filter((site) => lock.on.includes(site.kind)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const random = createRandom([...`${lock.id}:lock`].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, seed) >>> 0);

    return sites.length ? sites[Math.floor(random.next() * sites.length)] : null;
}

/** The door of a site's building (insides.js addSite): its link's id. */
export const siteDoor = (site) => `site:${site.id}/door`;

/**
 * A thread step's words (`word`) filled in: {town}, the settlement's name; {way}, which way it is
 * from where the thread was last; {place}, the name of the place it leads to.
 */
export const threadWords = (text, { town = "the nearest town", way = "near", place = "the place" } = {}) => text.replace(/\{town\}/g, town).replace(/\{way\}/g, way).replace(/\{place\}/g, place);

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
 * (host.js #threadTalk), back to those choices after. Or, `step` null, its opener's rumour (OPENERS:
 * its `tale` told a piece at a time, each piece's question asked for the next, then taken up, its
 * doing `{ thread, step: null }` sent on, or left), its words filled in (`fill`: {way}).
 */
export function threadTalk(tree, { thread, step, back = false }, fill = (text) => text) {
    const def = back ? { kind: "talk" } : step === null ? THREADS[thread]?.opens : THREADS[thread]?.steps[step];

    if (!def || def.kind !== "talk" || !THREADS[thread]) {
        return tree;
    }

    const start = tree.start ?? "greet";
    const first = tree.nodes[start];
    const choices = typeof first.choices === "string" ? (tree.nodes[first.choices]?.choices ?? []) : (first.choices ?? []);
    const node = `thread:${thread}`;

    // (A thread they gave up, taken back up: asked of the one who'd take them back on it, keeperOf)
    if (back) {
        const words = THREADS[thread].opens?.back ?? TAKE_BACK;
        const titled = (text) => fill(text.replace(/\{title\}/g, THREADS[thread].title));

        return {
            ...tree,
            nodes: {
                ...tree.nodes,
                [start]: { ...first, choices: [{ say: titled(words.ask), next: `${node}:back`, do: [{ thread, back: true }] }, ...choices] },
                [`${node}:back`]: { say: [titled(words.reply)], choices: [{ say: "Thank you.", next: start }, { say: "Farewell.", next: null }] },
            },
        };
    }

    if (step === null) {
        const pieces = def.tale.map(({ say, ask }, k) => {
            const last = k === def.tale.length - 1;
            const next = last ? [{ say: def.take, next: def.taken ? `${node}:taken` : start, do: [{ thread, step: null }] }, { say: def.leave, next: start }] : [{ say: ask, next: `${node}:${k + 1}` }, { say: "Another time.", next: start }];

            return [`${node}:${k}`, { say: [fill(say)], choices: next }];
        });

        // (Taken up, their parting words, if they've any, and the talk's over: talked to again, it's
        // not offered)
        const taken = def.taken ? [[`${node}:taken`, { say: [fill(def.taken)], choices: [{ say: "Farewell.", next: null }] }]] : [];

        return { ...tree, nodes: { ...tree.nodes, [start]: { ...first, choices: [{ say: def.ask, next: `${node}:0` }, ...choices] }, ...Object.fromEntries([...pieces, ...taken]) } };
    }

    return {
        ...tree,
        nodes: {
            ...tree.nodes,
            [start]: { ...first, choices: [{ say: def.ask, next: node, do: [{ thread, step }] }, ...choices] },
            [node]: { say: [fill(def.reply)], choices: [{ say: "Thank you.", next: start }, { say: "Farewell.", next: null }] },
        },
    };
}

/**
 * The tracks a card kept at a site leaves (STEPS `card`, its `where` "site": the Stone Golem's),
 * while its thread's at its step: from where the thread was last (the Lantern Company's remains)
 * to the card's place, wandering a little either side of the way (`wander` metres, every `every`),
 * the same on every copy. [{ id, creature (its shape's), spoor (its step's words for them, or
 * null), points ([[x, y]]) }]. `legends`: the world's (Legends, or as it's kept).
 */
export function threadTracks(legends) {
    return Object.entries(legends?.threads ?? {}).flatMap(([id, thread]) => {
        const def = !thread.done ? THREADS[id]?.steps[thread.step] : null;
        const card = def?.kind === "card" ? cardOf(def.card) : null;

        if (card?.where !== "site" || !thread.place || !card.shape?.creature) {
            return [];
        }

        const [[ax, ay], [bx, by]] = [thread.at, thread.place];
        const length = hypot(bx - ax, by - ay);
        const count = Math.max(2, Math.round(length / TRACKS_WANDER.every));
        const [nx, ny] = length > 0 ? [-(by - ay) / length, (bx - ax) / length] : [0, 0];
        const phase = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 7;
        const points = Array.from({ length: count + 1 }, (_, k) => {
            const u = k / count;
            const off = sin(u * Math.PI) * TRACKS_WANDER.wander * sin(u * 5.3 + phase);

            return [ax + (bx - ax) * u + nx * off, ay + (by - ay) * u + ny * off];
        });

        return [{ id: `thread:${id}`, creature: card.shape.creature, spoor: def.spoor ?? null, points }];
    });
}

// How far a card's tracks wander either side of the way to its place, and how often they turn
// (threadTracks: metres)
const TRACKS_WANDER = Object.freeze({ wander: 9, every: 14 });

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
 *   it's done), at (where it was last: [x, y]), town (the settlement of a talk or contract step,
 *   or a place step's nearest), place (a place step's: [x, y]; a card's kept at a site), home (the
 *   settlement its rumour was told in, an opener's), began (when), by (the names of those who've
 *   taken part), took (their ids), left (the players who've given it up: giveUp), fell (those
 *   fallen to its card where it's kept: fellTo), done }.
 * - `changes`: the world's changes (CHANGES), each { kind, thread, town, ..., from, until }.
 * - `opened`: the locks opened (LOCKS).
 * - `vaults`: the sealed rooms inside cards have brought, by their number (VAULT): { n, card,
 *   building (the dungeon's key), generation (its), level, floor (the map its door's on), door ({
 *   square, arrive, facing }), opens, open (its ward broken, or its key gone through), took (those
 *   who took part, theirs its rewards), woken (its keepers roused), keepers (their ids), cleared
 *   (they've fallen), given (its chest opened) }.
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
        this.opened = new Set(json.opened ?? []);
        this.vaults = structuredClone(json.vaults ?? {});
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
            opened: [...this.opened],
            vaults: this.vaults,
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

    /** Whether one may be dealt now: none out, and the gap since the last ended gone by (one kept at a site, `site`, whenever none's out). */
    free({ site = false } = {}) {
        return !this.active && (site || this.last === null || this.played - this.last >= RARE.gap);
    }

    /**
     * Whether a thread's opener's rumour may be told now (THREADS `opens`): the thread not begun,
     * and the card it leads to (one that `requires` it) among those dealt from, none of debug
     * mode's, and not done in this world.
     */
    opening(id) {
        return Boolean(THREADS[id]?.opens) && !this.threads[id] && Object.values(this.cards).some((card) => card.requires?.thread === id && !card.debug && !this.gone.has(card.id));
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
     * A thread begun (THREADS: `id`), at `at` (where its encounter was done, or its rumour told), by
     * those who took part in it (`ids`, and their names `by`), its `home` the settlement its rumour
     * was told in (a plan place's id, or null): at its first step. It, or null (no such thread, or
     * begun already: a world's thread begins once).
     */
    begin(id, { at, ids = [], by = [], home = null }) {
        if (!THREADS[id] || this.threads[id]) {
            return null;
        }

        this.threads[id] = { id, step: 0, at: [...at], town: null, place: null, home, began: this.played, by: [...new Set(by)], took: [...new Set(ids)], done: false };

        return this.threads[id];
    }

    /**
     * A thread given up by a player (`who`: their id): not theirs to follow (its steps done by
     * others, its card not dealt them, its rewards not theirs) till they take it back up
     * (`takeBack`), where it stands then; it goes on for anyone else. Whether it was now (begun, not
     * done, not given up by them already).
     */
    giveUp(id, who) {
        const thread = this.threads[id];

        if (!thread || thread.done || (thread.left ?? []).includes(who)) {
            return false;
        }

        thread.left = [...(thread.left ?? []), who];
        thread.fell = (thread.fell ?? []).filter((one) => one !== who);

        return true;
    }

    /** A thread a player gave up taken back up by them: theirs to follow again, at the step it's at. Whether it was now. */
    takeBack(id, who) {
        const thread = this.threads[id];

        if (!thread || thread.done || !(thread.left ?? []).includes(who)) {
            return false;
        }

        thread.left = thread.left.filter((one) => one !== who);

        return true;
    }

    /** Whether a player's given a thread up (and not taken it back up). */
    gaveUp(id, who) {
        return Boolean(this.threads[id]?.left?.includes(who));
    }

    /**
     * A player fallen to the card a thread's at, kept at its site (STEPS `card`, its `where` "site":
     * the Stone Golem): where it's kept known to them from then (on their maps, in their journal)
     * while the thread's at that step. Whether it was now.
     */
    fellTo(id, who) {
        const thread = this.threads[id];

        if (!thread || thread.done || !thread.place || (thread.fell ?? []).includes(who) || (thread.left ?? []).includes(who)) {
            return false;
        }

        thread.fell = [...(thread.fell ?? []), who];

        return true;
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
        thread.fell = [];
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

    /**
     * Whether a lock (LOCKS) keeps its way in shut now: not opened, and its thread a card's in play
     * (`cards`: those dealt from) or begun.
     */
    shut(id) {
        const lock = LOCKS[id];

        return Boolean(lock) && !this.opened.has(id) && (Boolean(this.threads[lock.thread]) || Object.values(this.cards).some((card) => card.thread === lock.thread && !card.debug));
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
