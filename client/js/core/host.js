// The host: the one authority over a running world (docs/WAR.md).
//
// Whatever changes the world happens here, and nowhere else: the battle (battle.js) and who's in
// it; the players, however many there are, each by an id of their own; which buildings' insides
// are made and peopled, for whoever's near them; and the war between the realms (war/war.js),
// moving on as they play.
// A player's game (app/game.js) only shows the world and sends what its player does as a command
// (`command(playerId, command)`), checked here before anything's done: so a player on another
// machine can later do just the same, their commands coming over the wire (core/wire.js).
//
// Everything here is plain data and seeded random numbers, and it can all be kept and made again
// (`snapshot`, `Host.restore`) to carry on exactly as it would have: a saved world, or the world
// sent to a player joining.
//
// Pure JavaScript, no DOM: it runs in the browser of the player who's hosting, or in Node.

import { Battle, FOE_MS, KINDS, TALK_REACH } from "./battle.js";
import { Explored } from "./explored.js";
import { nearestFree, squareKey, squaresOf } from "./grid.js";
import { ABILITIES, alike, ITEMS, priceOf, Progress, QUALITIES, rollBoost, rollLoot, wares, weaponOf, WITH_SHIELD } from "./progress.js";
import { SPELL_XP, SPELLS, tomeOf } from "./spells.js";
import { createRandom } from "./random.js";
import { SETTLEMENT_KINDS } from "./setpieces/town.js";
import { CAMP_FOLK, campFolk, clearOfSettlements, CREATURES, encounterAt, LAIRS, menaces, packOf, tierPower, WILD } from "./creatures.js";
import { rollSpoils } from "./spoils.js";
import { campTier, CHUNK, landAt, RACE, startFor } from "./worldplan/plan.js";
import { armouryGift, COUNSEL, FAILED, MOST_REQUESTS, offerContract, offerRequest, OPENS, REQUEST_REACH, Standing, TITHE_RATE } from "./standing.js";
import { bannersOf, campOf, CAMP, PATROL_SIZE, POSTED, postsOf, roundsOf, sortieOf } from "./war/muster.js";
import { ADJECTIVES } from "./war/peoples.js";
import { HOLDINGS, RISING, War } from "./war/war.js";
import { distanceBetween, WEAPONS } from "./weapons.js";

/** The id of the player whose game the world runs in (the only one, playing alone). */
export const HOST_PLAYER = "player";

/**
 * How often (battle ms) the buildings near the players are looked over: those within `near`
 * metres of a player out in the world (or a player's heading into) got ready to go into, their
 * folk about their business inside; those `far` from every player let go.
 */
export const RELEVANCE = Object.freeze({ every: 500, near: 22, far: 90 });

/** The orc's weapon (the town's one enemy, for now). */
export const ORC_WEAPON = "cleaver";

/**
 * When a town's soldiers come to life (docs/WAR.md M2): once a player's this near its edge
 * (metres, out in the world); let go once every player's this far.
 */
export const MUSTER = Object.freeze({ near: 120, far: 250 });

/** How far from its post a guard goes after an enemy (metres). */
export const LEASH = 14;

/**
 * When a camp comes to life (docs/WAR.md M6): once a player's this near it (metres, out in the
 * world); struck once every player's this far.
 */
export const CAMP_NEAR = Object.freeze({ near: 150, far: 300 });

/**
 * A camp's sortie against a town a player's near, played out (docs/WAR.md M6): how many raiders,
 * or attackers in an assault, come at most; how near their mark they must come to have reached it
 * (metres); how long raiders stay at the fields once there, and a sortie goes on at most (battle
 * ms).
 */
export const SORTIE = Object.freeze({ raiders: 6, attackers: 16, reach: 10, stay: 30000, most: 150000 });

/**
 * An envoy on the road near a player (docs/WAR.md M7): met once a player's this near (metres),
 * let go once every player's this far; how many ride with them as their escort; how far ahead
 * along their road they make for at a time, and how near a point on it counts as passing it.
 */
export const ENVOY = Object.freeze({ near: 150, far: 300, escort: 2, ahead: 24, past: 6 });

/**
 * An adventurer hired to follow a player (docs/WAR.md M9), by their calling: what they fight
 * with, and what it costs to hire them (gold). How many a player can lead: one, and more as
 * their Command grows (progress.js TREES).
 */
export const HIRES = Object.freeze({
    warrior: { weapon: "sword", price: 40 },
    ranger: { weapon: "bow", price: 40 },
    rogue: { weapon: "sword", price: 30 },
    mage: { weapon: "staff", price: 60 },
    cleric: { weapon: "hammer", price: 60 },
});

/** How near (metres) a people's soldiers must be to see a player bring down their enemy, and owe them for it (M7). */
export const FAVOUR_SIGHT = 25;

/**
 * How a player stirs their people towards rising (docs/WAR.md M10), while they serve another or
 * have fallen: each request done for their own people's rulers (a tithe the more), each contract
 * from a guild's board, and each of their oppressors' soldiers they bring down.
 */
export const STIR = Object.freeze({ request: 10, tithe: 15, contract: 4, soldier: 3 });

/** The standing a player's given when their people bring every other under them (M10). */
export const HONOURS = 200;

/** How long the fallen soldiers lie before they're taken away (battle ms). */
const FALLEN_MS = 10000;

/**
 * The wild's creatures about the players (docs/WILDS.md): how many are kept about each player out
 * in the world (within `about` metres), put out `from` to `to` metres away (out of sight), clear
 * of the settlements by `clear` metres; let go once every player's `far` away (not while
 * fighting). A wild camp's folk come out once a player's `camp` metres from it (a few more than
 * its patrols roam), and are let go `campFar` away.
 */
export const WILDS = Object.freeze({ count: 8, about: 60, from: 30, to: 44, clear: 25, far: 90, camp: 60, campFar: 140 });

/**
 * How near (m) a player has to be to a creature when it falls to find their own bundle on it (its
 * spoils: spoils.js).
 */
export const SPOILS_REACH = 30;

/** How long something dropped lies on the ground before it's gone (ms), and how near (m) it's picked up from. */
export const GROUND_MS = 5 * 60 * 1000;
export const PICK_REACH = 1.6;

/**
 * Trading face to face (docs/WILDS.md): how near (m) two players must be to begin, and how far
 * apart they can get before it's off; how long (ms) asking to trade waits for an answer.
 */
export const TRADE = Object.freeze({ reach: 4, apart: 7, asking: 30000 });

/** How long something thrown away can be taken back (ms). */
export const UNDO_MS = 8000;

/** What each people's soldiers fight with: guards the first, patrols each in turn (characters/soldiers.js dresses them to match). */
export const SOLDIERS_ARMS = Object.freeze({
    human: ["sword", "bow"],
    elf: ["bow", "sword"],
    darkElf: ["sword", "wand"],
    cat: ["gauntlets", "bow"],
    lizard: ["staff", "bow"],
    orc: ["cleaver", "cleaver"],
});

/**
 * Who sits where in their people's rule (by role: docs/WAR.md M4), and what each does: gives work
 * (`work`), takes word of it done (`report`), hands out the armoury's gifts (`armoury`), hears
 * counsel (`counsel`). A town hall's reeve and clerk; a keep's ruler, steward and councillors.
 */
export const OFFICIALS = Object.freeze({
    reeve: { post: "hall", work: true, report: true },
    clerk: { post: "hall", report: true },
    ruler: { post: "keep", work: true, report: true, counsel: true },
    steward: { post: "keep", work: true, report: true, armoury: true },
    councillor: { post: "keep" },
    // (An adventurers' guild's: its board's contracts, for anyone: docs/WAR.md M8)
    receptionist: { post: "guild", work: true, report: true },
});

/** What's kept of the things done by talking (the last so many). */
const KEEP_DONE = 50;

/** Bumped whenever what a snapshot holds changes, so an old one isn't read wrong. */
export const SNAPSHOT_VERSION = 4;

/** Which shop each of the folk keeps (by their role): what they sell (core/progress.js SHOPS). */
export const SHOPKEEPERS = Object.freeze({ smith: "smith", apprentice: "smith", barkeep: "tavern", barmaid: "tavern", innkeeper: "tavern", priest: "temple", acolyte: "temple", receptionist: "guild" });

/**
 * How near a shopkeeper a player trades with them (squares): a talk's reach across a counter,
 * and a few steps more, as they go about behind it.
 */
export const SHOP_REACH = TALK_REACH.across + 3;

/**
 * What the things bought by talking do (their `buy` or `rent`): mend hurts, fill stamina, or a
 * boon for a while (the share more a player's blows, heals and armour are: ms).
 */
export const BOUGHT = Object.freeze({
    ale: { stamina: 1000 },
    stew: { hp: 15 },
    room: { hp: 1000, stamina: 1000 },
    sharpening: { boon: { id: "sharpening", label: "A keen edge", melee: 0.1, ms: 600000 } },
    blessing: { boon: { id: "blessing", label: "Blessed", melee: 0.05, ranged: 0.05, heal: 0.1, armor: 0.03, ms: 600000 } },
});

/** The skills' experience for each thing done, besides the damage done or taken, or healed. */
const XP = Object.freeze({ stun: 15, exhausted: 5, talk: 3, effect: 5, trade: 0.5, command: 0.5 });

/** Why a command wasn't carried out (a command's { ok: false, reason }). */
export const REFUSALS = Object.freeze({
    player: "No such player.",
    dead: "The dead can't do that.",
    command: "Nothing that can be done.",
    target: "No one there to do that to.",
    link: "No way through there.",
    far: "Too far away.",
    talking: "Not talking to them.",
    gold: "Not enough gold.",
    hire: "They're not for hire.",
    company: "You can't lead any more than you have.",
    follower: "They don't follow you.",
    shop: "They've nothing like that to sell.",
    full: "Your pack is full.",
    unknown: "You haven't learnt that.",
    item: "You can't do that with it.",
    shield: "Not with that weapon.",
    cooldown: "Not ready yet.",
    official: "They're not the one to ask.",
    stranger: "They've nothing for a stranger.",
    rank: "They won't hear that from you. Not yet.",
    work: "They've nothing for you just now.",
    requests: "You've enough to be getting on with.",
    due: "You've nothing to tell them.",
    claimed: "The armoury's given you all it will, for now.",
    counsel: "That counsel can't be taken.",
    unready: "Not yet: your people aren't ready to rise.",
    request: "No such request.",
    count: "There aren't so many as that.",
    gone: "It isn't there any more.",
    undo: "Too late to take that back.",
    down: "You're down: get up first.",
    wanted: "They've no use for that: the adventurers' guild buys such things.",
    trade: "You're not trading with anyone.",
    trading: "You're trading with someone already.",
    elsewhere: "They're trading with someone else.",
    changed: "Something offered isn't there any more: look again.",
    theirs: "They haven't room for all that.",
    unafflicted: "There's nothing for that to cure.",
    known: "You know that spell already.",
});

// What can't be done while knocked off one's feet (battle.js: a knockdown)
const DOWN_HELD = new Set(["move", "ahead", "engage", "approach", "enter", "cast", "ability", "use", "talk", "trade"]);

// A whole number, and a square [x, y] of whole numbers
const whole = (value) => Number.isFinite(value) && Math.floor(value) === value;
const isSquare = (value) => Array.isArray(value) && value.length === 2 && value.every(whole);
const refuse = (reason) => ({ ok: false, reason });
const OK = Object.freeze({ ok: true });

export class Host {
    /**
     * @param {object} world - From buildWorld (overworld.js) or generateWorld (world.js).
     * @param {object} [options]
     * @param {number} [options.seed] - Seeds the battle (the world's own seed to start with).
     * @param {boolean} [options.populate] - Whether the world's own people (the orc, the
     *     tavern's folk) are put in now; else by `populate()`, after whoever joins first.
     * @param {object} [options.war] - The war as it was kept (War snapshot), to carry on from;
     *     else it starts afresh (in a world with a plan: buildWorld's).
     */
    constructor(world, { seed = world.seed ?? 1, populate = true, war = null } = {}) {
        this.world = world;

        /**
         * Told of everything done to the world, as it's done (docs/WAR.md M11: a world opened to
         * others records it, for those who've joined to do again: core/netplay.js), or null:
         * ["a", ms] moved on, ["c", playerId, command], ["j", options] a player come, ["l", id]
         * gone, ["p"] its own people put in.
         */
        this.recorder = null;
        this.#reset({ seed, war });

        if (populate) {
            this.populate();
        }
    }

    // Everything that changes in the world, as it is before anything's happened in it
    #reset({ seed, war }) {
        const world = this.world;

        /** The war between the peoples (war/war.js), in a world laid out from a plan. */
        this.war = world.plan ? Host.#war(world.plan, war) : null;
        this.battle = new Battle(world, { seed, relations: (a, b) => this.#against(a, b) });

        /**
         * The towns whose soldiers are out, near a player (by the town's id): { people (who
         * holds it), ids (its soldiers'), share (how many of its garrison each stands for),
         * banners ([{ at, facing }]) }; and each soldier (by id): { town, people, weapon, sex,
         * seed } (how they look), and the fallen, to be taken away ([{ id, at }]).
         */
        this.mustered = new Map();
        this.soldiers = new Map();
        this.fallen = [];

        /**
         * The war's camps near a player, pitched (by the camp's id): { people, ids (its
         * sentries'), share (how many of the camp each stands for), fire, tents }; and each camp's
         * sortie out against a town a player's near (by the camp's id): { kind ("raid" or
         * "assault"), town, people, ids, to (the square they make for), at (when they set out),
         * reached, reachedAt }.
         */
        this.camps = new Map();
        this.sorties = new Map();

        /**
         * The envoys met on the road near a player (by the envoy's id): { people, to (whose seat
         * they're bound for), mission, ids (the envoy's, then their escort's), leg (the point on
         * their road they've passed), mark (the square they're making for), at (where the envoy
         * was last), over (null; or "arrived" or "waylaid", once they're gone from the war) }.
         */
        this.envoys = new Map();

        /**
         * The adventurers following the players (by id): { leader (a player's id), name, calling,
         * sex, seed, people, from (the one of the folk they were, by id), waiting (standing where
         * they were told to) }. A player's go with their character (characterOf).
         */
        this.followers = new Map();
        this.nextFollower = 1;

        /** The folk hired (their ids): never among the folk again, wherever they were. */
        this.hired = new Set();

        /**
         * The wild's creatures out near the players (by id): { creature, tier, pack (its pack's
         * id), camp (the wild camp it's of), lair (the perilous site it's of) }; the wild camps
         * whose folk are out, and the perilous sites whose master and guards are there (by id:
         * { ids }); when each site's master, slain, is back (battle ms, by site id).
         */
        this.wild = new Map();
        this.nextWild = 1;
        this.wildCamps = new Map();
        this.lairs = new Map();
        this.slain = {};


        /**
         * What's been dropped on the ground (by id): { id, item ({ id, quality, count }), map,
         * square, until (when it's gone), by (the player who dropped it) }.
         */
        this.ground = new Map();
        this.nextGround = 1;

        /**
         * The players' trades, face to face (by id): { id, from (the player who asked), to (who
         * they asked), open (once the other's said yes; till then, `until`: when the asking's
         * forgotten), offers (by player: { gold, items: [{ id, quality, count }] }), agreed (by
         * player: whether they'll take the other's offer for theirs) }.
         */
        this.trades = new Map();
        this.nextTrade = 1;

        /**
         * The players, by id: { id, hero (their character: { name, shape, look, weapon, boots,
         * race }), realm (the people they're of), talks (what the folk remember of them, what
         * they've learnt: { memory, knowledge }), explored (core/explored.js), progress
         * (core/progress.js), standing (core/standing.js), boons, readyAt, offers (the work
         * each official last offered them: { turn, request }) }.
         */
        this.players = new Map();

        /** The folk in the battle, by id: how each looks and talks (world.folk's, a building's). */
        this.folk = new Map();

        /** The buildings got ready to go into (by key): the ids of their folk. */
        this.open = new Map();

        /** When (battle ms) the buildings near the players are next looked over. */
        this.lookAt = 0;

        /** What's been done in the world by talking (buying, renting...): the last few. */
        this.done = [];

        // The host's own chances (what's found on the fallen)
        this.random = createRandom(((world.seed ?? 1) * 2654435761) >>> 0);

        // What's happened besides the battle's own (given out with them by advance)
        this.events = [];
    }

    // The war, carried on from how it was kept if it can be (a save from another version, or
    // another world, starts afresh)
    static #war(plan, kept) {
        try {
            return kept?.seed === (plan.seed ?? 1) ? War.restore(plan, kept) : new War(plan);
        } catch {
            return new War(plan);
        }
    }

    /** Can the world be paused? Only with no one else in it. */
    get pausable() {
        return this.players.size <= 1;
    }

    /** The world's own people: the orc on its patrol, and the tavern's folk. */
    populate() {
        this.recorder?.(["p"]);

        const { spawns, patrol } = this.world;

        if (spawns?.orc && !this.battle.actor("orc")) {
            this.battle.add({ id: "orc", kind: "orc", name: "Orc", weapon: ORC_WEAPON, team: "orcs", square: spawns.orc, ai: "patrol", patrol });
        }

        for (const one of this.world.folk ?? []) {
            this.#addFolk(one);
        }
    }

    /**
     * A player comes into the world: { id, hero, talks, explored } (their character, as kept:
     * app/save.js), at `square` on `map` (the world's start, to begin with; the nearest free
     * square to it). Returns their record (players).
     */
    join({ id = HOST_PLAYER, hero, talks = {}, explored = {}, progress = {}, standing = {}, followers = [], square = this.world.spawns?.player, map = "town" }) {
        const plain = (value) => (typeof value?.toJSON === "function" ? value.toJSON() : structuredClone(value));

        this.recorder?.(["j", { id, hero: structuredClone(hero), talks: { memory: structuredClone(talks.memory ?? {}), knowledge: [...(talks.knowledge ?? [])] }, explored: plain(explored), progress: plain(progress), standing: plain(standing), followers: structuredClone(followers), square: square && [...square], map }]);

        if (this.players.has(id)) {
            return this.players.get(id);
        }

        const player = {
            id,
            hero: { ...hero },
            realm: hero.race ?? "human",
            talks: { memory: talks.memory ?? {}, knowledge: new Set(talks.knowledge ?? []) },
            explored: explored instanceof Explored ? explored : new Explored(explored),
            progress: progress instanceof Progress ? progress : new Progress(progress, hero),
            standing: standing instanceof Standing ? standing : new Standing(standing),
            // Boons for a while ([{ id, label, until, melee...}]), and when each ability's ready again
            boons: [],
            readyAt: {},
            discarded: null,
            offers: {},
        };
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === map).map(({ square: [x, y] }) => squareKey(x, y)));
        const at = taken.size ? nearestFree(squaresOf(this.world.maps?.[map] ?? this.world), square, { taken }) : square;

        this.players.set(id, player);
        this.battle.add({ id, kind: "player", name: hero.name, weapon: hero.weapon, boots: Boolean(hero.boots), team: player.realm, square: at, map });
        this.#outfit(player);

        // (Their followers, with them)
        for (const one of followers) {
            this.#follow(player, one);
        }

        this.#event("join", { id, name: hero.name, realm: player.realm });

        return player;
    }

    /**
     * A player leaves: out of the battle, and their character as it's to be kept (as join takes
     * it), or null if they weren't here.
     */
    leave(id) {
        this.recorder?.(["l", id]);

        const player = this.players.get(id);

        if (!player) {
            return null;
        }

        const character = this.characterOf(player);

        for (const trade of [...this.trades.values()]) {
            if (trade.from === id || trade.to === id) {
                this.#endTrade(trade, "left");
            }
        }

        for (const follower of this.#company(id)) {
            this.battle.remove(follower);
            this.followers.delete(follower);
        }

        this.battle.remove(id);
        this.players.delete(id);
        this.#event("leave", { id, name: player.hero.name });

        return character;
    }

    /** A player's character, as it's kept (as join takes it). */
    characterOf({ id, hero, talks, explored, progress, standing }) {
        const followers = this.#company(id).map((each) => {
            const { name, calling, sex, seed, people } = this.followers.get(each);

            return { name, calling, sex, seed, people };
        });

        return { hero: { ...hero }, talks: { memory: structuredClone(talks.memory), knowledge: [...talks.knowledge] }, explored: explored.toJSON(), progress: progress.toJSON(), standing: standing.toJSON(), followers };
    }

    /** How many followers a player can lead: one, and more as their Command grows. */
    mostFollowers(playerId) {
        const player = this.players.get(playerId);

        return player ? 1 + player.progress.bonuses().followers : 0;
    }

    /**
     * Do what a player asks, if it can be done. A command is one of:
     *  - { type: "move", to: [x, y] }, { type: "ahead", facing }, { type: "engage", target },
     *    { type: "approach", target }, { type: "enter", link }, { type: "stop" }: orders for
     *    their character in the battle (battle.js command), with run: true to run;
     *  - { type: "cast", spell, target }: cast a spell (target: an id, or none for themselves);
     *  - { type: "talk", with }: start talking to one of the folk (an id), or stop (null);
     *  - { type: "effect", effect }: something done by talking (buying, paying, renting...), to
     *    whoever they're talking to (paid for in gold, if it has a price);
     *  - { type: "buy", item, from }: buy something ({ id, quality }) from a shopkeeper near them
     *    (an id); { type: "sell", index, to, count }: sell things (one, with no count) from the
     *    stack at `index` in their pack to one;
     *  - { type: "equip", index }, { type: "unequip", slot }: put on (or take up) gear from their
     *    pack, or take armour off; { type: "use", index }: use something in their pack (or
     *    { type: "use", item }: the first of a kind of thing in it, by its id);
     *  - { type: "arrange", from, to }: move what's in one slot of their pack to another (put
     *    together with things alike, or swapped); { type: "split", index, count, to }: split
     *    some off a stack (into slot `to`, or the first empty one);
     *  - { type: "discard", index }: throw away a stack, for good once a moment's passed;
     *    { type: "undiscard" }: take back what was just thrown away;
     *  - { type: "drop", index, count }: drop things from a stack (all of it, with no count) on
     *    the ground where they stand; { type: "pickUp", ground }: pick up something dropped
     *    (by its id), from near it;
     *  - { type: "ability", ability, target }: use an ability they've learnt (core/progress.js
     *    ABILITIES), on a target for a stronger blow (fighting it);
     *  - { type: "abandon", request }: give up a request they carry (by its id), for a little
     *    standing lost;
     *  - { type: "trade", with }: ask another player near them to trade (by id), or say yes to
     *    their asking; { type: "offer", gold, items: [{ id, quality, count }] }: what they'll
     *    give (all of it, each time); { type: "agree" }: take the other's offer for theirs (once
     *    both have, it's done); { type: "cancel", with }: call off the trade (or say no to a
     *    player's asking, or stop asking).
     * Returns { ok: true } (with what came of it, for some: an offer of work, what was handed
     * in) or { ok: false, reason } (a REFUSALS key; a spell's own reasons: spells.js
     * CAST_FAILURES).
     */
    command(playerId, command) {
        this.recorder?.(["c", playerId, structuredClone(command)]);

        const player = this.players.get(playerId);
        const actor = this.battle.actor(playerId);

        if (!player || !actor) {
            return refuse("player");
        }

        if (!command || typeof command.type !== "string") {
            return refuse("command");
        }

        // (Knocked off their feet: nothing but getting up, till they're up)
        if (DOWN_HELD.has(command.type) && this.battle.time < (actor.downUntil ?? 0)) {
            return refuse("down");
        }

        const run = Boolean(command.run);

        switch (command.type) {
            case "move":
                if (!isSquare(command.to)) {
                    return refuse("command");
                }

                return this.#order(actor, { type: "move", to: [...command.to], run });
            case "ahead":
                if (!Number.isFinite(command.facing)) {
                    return refuse("command");
                }

                return this.#order(actor, { type: "ahead", facing: command.facing, run });
            case "engage":
            case "approach": {
                const target = this.battle.actor(command.target);

                if (!target || target === actor || (command.type === "engage" && !this.canFight(actor, target))) {
                    return refuse("target");
                }

                // (Picking a fight with someone who's no enemy: the player holds it against them)
                if (command.type === "engage" && !this.battle.hostile(actor, target)) {
                    actor.foes[target.id] = this.battle.time + FOE_MS;
                }

                return this.#order(actor, { type: command.type, target: target.id, run });
            }
            case "enter": {
                const link = this.battle.links.find(({ id }) => id === command.link);

                if (!link?.ends.some((end) => end.map === actor.map)) {
                    return refuse("link");
                }

                // (Heading into a building: it's got ready now)
                if (link.building) {
                    this.#openBuilding(link.building);
                }

                return this.#order(actor, { type: "enter", link: link.id, run });
            }
            case "stop":
                return this.#order(actor, { type: "stop" });
            case "cast":
                // (Only the spells they know: their schools' up to their tiers, and those learnt)
                if (!player.progress.knows(command.spell)) {
                    return refuse("unknown");
                }

                return this.battle.cast(actor.id, command.spell, command.target ?? null);
            case "buy":
                return this.#buy(player, actor, command);
            case "sell":
                return this.#sell(player, actor, command);
            case "equip":
                return this.#gear(player, player.progress.equip(command.index));
            case "unequip":
                return this.#gear(player, player.progress.unequip(command.slot));
            case "use":
                return this.#use(player, actor, Number.isInteger(command.index) ? command.index : player.progress.slotOf(command.item));
            case "arrange":
                return this.#packed(player.progress.move(command.from, command.to));
            case "split":
                return this.#packed(player.progress.split(command.index, command.count, Number.isInteger(command.to) ? command.to : undefined));
            case "discard":
                return this.#discard(player, command.index);
            case "undiscard":
                return this.#undiscard(player);
            case "drop":
                return this.#drop(player, actor, command.index, command.count);
            case "pickUp":
                return this.#pickUp(player, actor, command.ground);
            case "ability":
                return this.#ability(player, actor, command.ability, command.target ?? null);
            case "abandon":
                return this.#abandon(player, command.request);
            case "talk":
                return this.#talk(actor, command.with ?? null);
            case "effect":
                return this.#effect(player, actor, command.effect);
            case "trade":
                return this.#trade(player, actor, command.with);
            case "offer":
                return this.#offer(player, command);
            case "agree":
                return this.#agree(player);
            case "cancel":
                return this.#cancel(player, command.with ?? null);
            default:
                return refuse("command");
        }
    }

    /**
     * Can one fight another? An enemy, or a soldier of a people not friendly to theirs (a guard of
     * a neutral town: picking a fight with one turns its fellows against them). Never one of the
     * folk, or anyone of their own people or its allies.
     */
    canFight(actor, target) {
        if (target.neutral || target === actor) {
            return false;
        }

        if (this.battle.hostile(actor, target)) {
            return true;
        }

        return target.kind === "soldier" && target.team !== actor.team && !this.war?.friendly(actor.team, target.team);
    }

    /**
     * Advance the world by `ms` (the battle's whole steps: battle.js advance; the war's turns).
     * Returns what happened: the battle's events, and the host's own ("join", "leave", "open",
     * "close", "explored", "talk", "effect", "roused" (the wild's creatures put out), "trade"; "war", with each of the war's events, and "turn",
     * once each of its turns is over).
     */
    advance(ms) {
        this.recorder?.(["a", ms]);

        const events = this.battle.advance(ms);

        // What the players did: their skills grow by it, and they find what's on the fallen
        for (const event of events) {
            this.#learn(event);
        }

        // Things left lying on the ground: gone after a while
        for (const [id, dropped] of this.ground) {
            if (dropped.until <= this.battle.time) {
                this.ground.delete(id);
            }
        }

        // Trades off once the two are apart (or either's fallen), and asking forgotten after a while
        for (const trade of [...this.trades.values()]) {
            const [a, b] = [this.battle.actor(trade.from), this.battle.actor(trade.to)];

            if (!a || !b || a.dead || b.dead || !Host.#near(a, b, TRADE.apart)) {
                this.#endTrade(trade, "apart");
            } else if (!trade.open && trade.until <= this.battle.time) {
                this.#endTrade(trade, "unanswered");
            }
        }

        // Boons worn off
        for (const player of this.players.values()) {
            if (player.boons.some(({ until }) => until <= this.battle.time)) {
                player.boons = player.boons.filter(({ until }) => until > this.battle.time);
                this.#outfit(player);
            }
        }

        // The fallen soldiers: their garrison the fewer; taken away a while after (and the wild's
        // creatures, a perilous site's master gone a long while)
        for (const event of events) {
            const beast = event.type === "death" ? this.wild.get(event.id) : null;

            if (beast) {
                this.fallen.push({ id: event.id, at: this.battle.time + FALLEN_MS });
                this.#spoils(event.id, beast);

                if (beast.lair && beast.master) {
                    this.slain[beast.lair] = this.battle.time + LAIRS[this.#siteOf(beast.lair).kind].back;
                }
            }

            const soldier = event.type === "death" ? this.soldiers.get(event.id) : null;

            if (soldier) {
                if (soldier.envoy) {
                    if (soldier.part === "envoy") {
                        this.#envoyFell(soldier.envoy, event.by);
                    }
                } else {
                    this.war?.loss(soldier.camp ?? soldier.town, soldier.share ?? this.mustered.get(soldier.town)?.share ?? 1);
                }

                this.fallen.push({ id: event.id, at: this.battle.time + FALLEN_MS });
            }

            // (A people's enemy brought down by a player, before their soldiers' eyes)
            if (event.type === "death") {
                this.#owed(event);
            }

            // (A follower fallen: gone from their company, and taken away a while after)
            if (event.type === "death" && this.followers.has(event.id)) {
                const { leader, name } = this.followers.get(event.id);

                this.followers.delete(event.id);
                this.fallen.push({ id: event.id, at: this.battle.time + FALLEN_MS });
                this.#event("follower", { id: leader, follower: event.id, name, change: "fallen" });
            }

            // (A player through a door or up the stairs: their followers with them, unless told to wait)
            if (event.type === "cross" && this.players.has(event.id)) {
                this.#bring(event.id);
            }

            // A soldier struck by someone whose people aren't at war with theirs: a grudge
            // between the peoples (and the soldier's fellows fight back: battle.js foes)
            if (event.type === "hit" && event.by && this.soldiers.has(event.id)) {
                const [struck, by] = [this.battle.actor(event.id), this.battle.actor(event.by)];

                if (struck && by && this.war?.realm(by.team) && !this.war.hostile(struck.team, by.team)) {
                    this.war.remember(struck.team, by.team, -2);
                }
            }
        }

        while (this.fallen.length && this.fallen[0].at <= this.battle.time) {
            this.#gone(this.fallen.shift().id);
        }

        if (this.war) {
            const turn = this.war.turn;

            // (A fallen people restless enough rises where a player of theirs is)
            for (const player of this.players.values()) {
                const realm = this.war.realm(player.realm);

                if (realm && !realm.alive && (realm.unrest ?? 0) >= RISING.ready) {
                    this.war.rise(realm.id, { near: this.#whereIs(player) });
                }
            }

            for (const event of this.war.advance(ms)) {
                this.#event("war", { event });
                this.#fate(event);

                // (A camp's sortie against a town a player's near: out into the world)
                if (event.type === "sortie") {
                    this.#setOut(event);
                }
            }

            if (this.war.turn !== turn) {
                this.#event("turn", { turn: this.war.turn });
            }
        }

        for (const event of events) {
            // A player into a building: it's ready (if it wasn't), and the first time in, it's
            // marked on their maps
            if (event.type === "cross" && this.players.has(event.id)) {
                const building = this.world.interiors?.of(event.to);

                if (building?.entrance) {
                    this.#openBuilding(building.key);
                }

                if (building && this.players.get(event.id).explored.enter(building.key)) {
                    this.#event("explored", { id: event.id, building: building.key });
                }
            }
        }

        // Out in the world, the chunk each player's in is visited: the fog lifts off it
        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (actor?.map === "town" && player.explored.visit(actor.x, actor.y)) {
                this.#event("explored", { id: player.id });
            }
        }

        if (this.battle.time >= this.lookAt) {
            this.lookAt = this.battle.time + RELEVANCE.every;
            this.#lookAround();
            this.#muster();
            this.#wilds();
            this.#watchRequests();
        }

        const own = this.events;

        this.events = [];

        return own.length ? [...events, ...own] : events;
    }

    /**
     * Everything the world is just now, as plain data (core/wire.js carries it): to keep, or send
     * to a player joining, and carry on from (Host.restore). The world itself isn't in it: that's
     * made again from its seed.
     */
    snapshot() {
        return {
            version: SNAPSHOT_VERSION,
            seed: this.world.seed ?? null,
            made: [...(this.world.interiors?.order ?? [])],
            open: [...this.open.keys()],
            lookAt: this.lookAt,
            battle: this.battle.snapshot(),
            war: this.war?.snapshot() ?? null,
            random: this.random.state,
            mustered: [...this.mustered.entries()],
            camps: [...this.camps.entries()],
            sorties: [...this.sorties.entries()],
            envoys: [...this.envoys.entries()],
            followers: [...this.followers.entries()],
            nextFollower: this.nextFollower,
            hired: [...this.hired],
            wild: [...this.wild.entries()],
            nextWild: this.nextWild,
            wildCamps: [...this.wildCamps.entries()],
            lairs: [...this.lairs.entries()],
            slain: { ...this.slain },
            ground: structuredClone([...this.ground.values()]),
            nextGround: this.nextGround,
            trades: structuredClone([...this.trades.values()]),
            nextTrade: this.nextTrade,
            soldiers: [...this.soldiers.entries()],
            fallen: structuredClone(this.fallen),
            players: [...this.players.values()].map((player) => ({ id: player.id, realm: player.realm, boons: structuredClone(player.boons), readyAt: { ...player.readyAt }, discarded: structuredClone(player.discarded ?? null), ...this.characterOf(player), followers: undefined })),
            done: structuredClone(this.done),
        };
    }

    /**
     * The world `world` (made again from the snapshot's seed) carrying on from a snapshot: its
     * buildings' insides made again in the same order, and everyone where they were.
     */
    static restore(world, snapshot) {
        Host.#readable(snapshot);

        const host = new Host(world, { seed: snapshot.battle.seed, populate: false, war: snapshot.war });

        host.#load(snapshot);

        return host;
    }

    /**
     * This world carried on from a snapshot of it instead, in place (docs/WAR.md M11: a copy
     * that's gone astray from its host's, set right). What it's told of is told of still.
     */
    adopt(snapshot) {
        Host.#readable(snapshot);
        this.#reset({ seed: snapshot.battle.seed, war: snapshot.war });
        this.#load(snapshot);
    }

    static #readable(snapshot) {
        if (snapshot?.version !== SNAPSHOT_VERSION) {
            throw new Error(`A world kept by another version of the game (${snapshot?.version})`);
        }
    }

    // Everything as a snapshot has it (the world made again from its seed, or this one)
    #load(snapshot) {
        const host = this;
        const world = this.world;

        for (const key of snapshot.made) {
            if (host.#building(key)) {
                world.interiors.make(key);
            }
        }

        host.battle = Battle.restore(world, snapshot.battle, { relations: (a, b) => host.#against(a, b) });
        host.lookAt = snapshot.lookAt;
        host.mustered = new Map(structuredClone(snapshot.mustered ?? []));
        host.camps = new Map(structuredClone(snapshot.camps ?? []));
        host.sorties = new Map(structuredClone(snapshot.sorties ?? []));
        host.envoys = new Map(structuredClone(snapshot.envoys ?? []));
        host.followers = new Map(structuredClone(snapshot.followers ?? []));
        host.nextFollower = snapshot.nextFollower ?? 1;
        host.hired = new Set(snapshot.hired ?? []);
        host.wild = new Map(structuredClone(snapshot.wild ?? []));
        host.nextWild = snapshot.nextWild ?? 1;
        host.wildCamps = new Map(structuredClone(snapshot.wildCamps ?? []));
        host.lairs = new Map(structuredClone(snapshot.lairs ?? []));
        host.slain = { ...(snapshot.slain ?? {}) };
        host.ground = new Map((snapshot.ground ?? []).map((dropped) => [dropped.id, structuredClone(dropped)]));
        host.nextGround = snapshot.nextGround ?? 1;
        host.trades = new Map((snapshot.trades ?? []).map((trade) => [trade.id, structuredClone(trade)]));
        host.nextTrade = snapshot.nextTrade ?? 1;
        host.soldiers = new Map(structuredClone(snapshot.soldiers ?? []));
        host.fallen = structuredClone(snapshot.fallen ?? []);
        host.done = structuredClone(snapshot.done);

        for (const one of world.folk ?? []) {
            host.folk.set(one.id, one);
        }

        for (const key of snapshot.open) {
            const building = world.interiors.buildings.get(key);

            host.#enthrone(building);
            host.open.set(key, building.folk.filter(({ id }) => !host.hired.has(id)).map(({ id }) => id));

            for (const one of building.folk.filter(({ id }) => !host.hired.has(id))) {
                host.folk.set(one.id, one);
            }
        }

        for (const { id, realm, hero, talks, explored, progress, standing, boons, readyAt, discarded } of snapshot.players) {
            host.players.set(id, { id, realm, hero, talks: { memory: talks.memory, knowledge: new Set(talks.knowledge) }, explored: new Explored(explored), progress: new Progress(progress, hero), standing: new Standing(standing), boons: structuredClone(boons ?? []), readyAt: { ...readyAt }, discarded: structuredClone(discarded ?? null), offers: {} });
        }

        host.random.state = snapshot.random ?? host.random.state;
    }

    /**
     * A number that tells two copies of a world apart (docs/WAR.md M11: whether one that's
     * joined has gone astray from its host's): the battle's time, and everyone in it, where they
     * are and how they are; the war's turn and clock; what's on the ground, and in each pack.
     */
    checksum() {
        let sum = 2166136261;

        const mix = (value) => {
            sum = Math.imul(sum ^ (value | 0), 16777619) >>> 0;
        };

        mix(this.battle.time);
        mix(this.battle.actors.length);

        for (const actor of this.battle.actors) {
            for (let k = 0; k < actor.id.length; k++) {
                mix(actor.id.charCodeAt(k));
            }

            mix(Math.round(actor.x * 1000));
            mix(Math.round(actor.y * 1000));
            mix(Math.round(actor.hp * 100));
            mix(actor.dead ? 1 : 0);
        }

        mix(this.war?.turn ?? 0);
        mix(Math.round(this.war?.clock ?? 0));
        mix(this.players.size);
        mix(this.ground.size);

        mix(this.trades.size);

        for (const player of this.players.values()) {
            mix(player.progress.gold);

            for (const stack of player.progress.pack) {
                mix(stack?.count ?? 0);
            }
        }

        return sum;
    }

    // --- Growing stronger (core/progress.js) ---

    // A player's skill grows: each rank it comes to told of ("rank"), and what it brings put on
    #gain(player, tree, amount) {
        if (!player || !(amount > 0)) {
            return;
        }

        const ups = player.progress.gain(tree, amount);

        for (const up of ups) {
            this.#event("rank", { id: player.id, ...up });
        }

        if (ups.length) {
            this.#outfit(player);
        }
    }

    // A school of magic grows (by `amount`): each tier it comes to, its spell told of ("tier")
    #school(player, school, amount) {
        for (const spell of player.progress.growSchool(school, amount)) {
            this.#event("tier", { id: player.id, school, spell, tier: SPELLS[spell].tier });
        }
    }

    // What happened in the battle, for the players' skills: blows landed (up close, from afar)
    // and taken, heals, stuns, running out of breath; and what's on those they fell
    #learn(event) {
        // (What a player's followers do, their leader's: their Command grows by it, and what they
        // bring down counts for them)
        const leads = this.followers.get(event.by);

        if (leads && (event.type === "hit" || event.type === "death")) {
            const leader = this.players.get(leads.leader);

            if (event.type === "hit") {
                this.#gain(leader, "command", event.damage * XP.command);
            }

            if (event.type === "death") {
                const fallen = this.battle.actor(event.id);

                if (leader && fallen && !this.players.has(fallen.id) && fallen.kind !== "follower") {
                    this.#loot(leader, fallen);
                    this.#felled(leader, fallen);
                }
            }

            return;
        }

        const by = this.players.get(event.by);
        const own = this.players.get(event.id);

        switch (event.type) {
            case "hit":
                // (A spell's: its school grows by it landing, below)
                if (!event.spell) {
                    this.#gain(by, event.projectile === null ? "blade" : "marksman", event.damage);
                }

                this.#gain(own, "endurance", event.damage);
                break;
            case "spell": {
                // A spell of a school landing (healing someone, or striking): the school grows,
                // the more for a spell of a higher tier
                const spell = SPELLS[event.spell];
                const caster = this.players.get(event.id);

                if (caster && spell?.school && event.landed > 0) {
                    this.#school(caster, spell.school, SPELL_XP * spell.tier);
                }

                break;
            }
            case "stunned":
                // (Stunning with a hex: not a spell of the air's that stuns as it strikes)
                if (!SPELLS[event.spell]?.school) {
                    this.#gain(by, "hexes", XP.stun);
                }

                break;
            case "exhausted":
                this.#gain(own, "endurance", XP.exhausted);
                break;
            case "death": {
                const fallen = this.battle.actor(event.id);

                if (by && fallen && !this.players.has(fallen.id)) {
                    this.#loot(by, fallen);
                    this.#felled(by, fallen);
                }

                break;
            }
            default:
                break;
        }
    }

    // What a player finds on a foe they've felled: gold, and things (into their pack, while there's room)
    #loot(player, fallen) {
        const { gold, items } = rollLoot(fallen.kind, this.random);
        const kept = items.filter((item) => player.progress.stow(item));

        if (!gold && !kept.length) {
            return;
        }

        player.progress.gold += gold;
        this.#event("loot", { id: player.id, from: fallen.id, gold, items: kept });
    }

    // A player's character in the battle as their skills, gear and boons have them: the weapon
    // they wield, how strong their blows, heals and stuns are, their armour, their hit points and
    // stamina; and the war as mighty as the mightiest player
    #outfit(player) {
        const actor = this.battle.actor(player.id);

        if (!actor) {
            return;
        }

        const bonus = player.progress.bonuses();

        for (const boon of player.boons) {
            for (const key of ["melee", "ranged", "heal", "stun", "spell", "armor"]) {
                bonus[key] += boon[key] ?? 0;
            }
        }

        const weapon = weaponOf(player.progress);

        if (actor.weapon !== weapon) {
            this.battle.rearm(actor.id, weapon, Boolean(player.hero.boots) && weapon !== "boots");
            player.hero.weapon = weapon;
        }

        actor.power = { melee: 1 + bonus.melee, ranged: 1 + bonus.ranged, heal: 1 + bonus.heal, stun: 1 + bonus.stun, spell: 1 + bonus.spell };
        actor.armor = Math.min(0.6, bonus.armor);

        const [hp, stamina] = [KINDS.player.hp + bonus.hp, KINDS.player.hp + bonus.stamina];

        if (actor.maxHp !== hp) {
            actor.hp = actor.dead ? 0 : Math.max(1, Math.round((actor.hp * hp) / actor.maxHp));
            actor.maxHp = hp;
        }

        if (actor.maxStamina !== stamina) {
            actor.stamina = Math.round((actor.stamina * stamina) / actor.maxStamina);
            actor.maxStamina = stamina;
        }

        this.war?.setMight(Math.max(0, ...[...this.players.values()].map((each) => each.progress.might())));
    }

    // The shopkeeper a player's trading with (an id): one of the folk who keeps a shop, near them
    #shopkeeper(actor, id) {
        const keeper = this.battle.actor(id);
        const shop = keeper && SHOPKEEPERS[keeper.role];

        if (!shop || keeper.dead || keeper.map !== actor.map || distanceBetween(actor.square, keeper.square) > SHOP_REACH) {
            return null;
        }

        return { keeper, shop };
    }

    #buy(player, actor, { item, from }) {
        const trading = this.#shopkeeper(actor, from);

        if (!trading) {
            return refuse("far");
        }

        if (!item || !wares(trading.shop).some(({ id, quality }) => id === item.id && quality === (item.quality ?? "common"))) {
            return refuse("shop");
        }

        const price = priceOf(item, { haggle: player.progress.bonuses().haggle });

        if (price > player.progress.gold) {
            return refuse("gold");
        }

        // (A wand or a grimoire: how much it boosts spells is rolled as it's bought, rarely high)
        const bought = { id: item.id, quality: item.quality ?? "common", ...(ITEMS[item.id].magic ? { boost: rollBoost(this.random) } : {}) };

        if (!player.progress.stow(bought)) {
            return refuse("full");
        }

        player.progress.gold -= price;
        this.#gain(player, "trade", price * XP.trade);
        this.#event("bought", { id: player.id, item: bought, price, from: trading.keeper.id });

        return OK;
    }

    #sell(player, actor, { index, to, count = 1 }) {
        const trading = this.#shopkeeper(actor, to);
        const stack = player.progress.pack[index];

        if (!trading) {
            return refuse("far");
        }

        if (!stack) {
            return refuse("item");
        }

        // (The creatures' parts, and tomes: only the adventurers' guild buys those)
        if ((ITEMS[stack.id]?.part || ITEMS[stack.id]?.tome) && trading.shop !== "guild") {
            return refuse("wanted");
        }

        const price = priceOf(stack, { haggle: player.progress.bonuses().haggle, selling: true }) * count;
        const item = player.progress.take(index, count);

        if (!item) {
            return refuse("count");
        }

        player.progress.gold += price;
        this.#gain(player, "trade", price * XP.trade);
        this.#event("sold", { id: player.id, item: { id: item.id, quality: item.quality }, count, price, to: trading.keeper.id });

        return OK;
    }

    // Things in the pack moved or split (the reason they couldn't be: progress.js move, split)
    #packed(why) {
        return why ? refuse(why) : OK;
    }

    // A stack thrown away: gone, but kept a moment to take back
    #discard(player, index) {
        const item = player.progress.take(index);

        if (!item) {
            return refuse("item");
        }

        player.discarded = { item, index, until: this.battle.time + UNDO_MS };
        this.#event("discarded", { id: player.id, item });

        return { ok: true, item };
    }

    // What was just thrown away, taken back: where it was, if that's free (or has things alike),
    // or wherever there's room
    #undiscard(player) {
        const kept = player.discarded;
        const pack = player.progress.pack;

        if (!kept || kept.until < this.battle.time) {
            return refuse("undo");
        }

        if (!pack[kept.index] || alike(pack[kept.index], kept.item)) {
            pack[kept.index] = { ...kept.item, count: kept.item.count + (pack[kept.index]?.count ?? 0) };
        } else if (!player.progress.stow(kept.item, kept.item.count)) {
            return refuse("full");
        }

        player.discarded = null;

        return OK;
    }

    // Things dropped on the ground where the player stands, for anyone to pick up a while
    #drop(player, actor, index, count) {
        const stack = player.progress.pack[index];

        if (actor.dead) {
            return refuse("dead");
        }

        if (!stack) {
            return refuse("item");
        }

        const item = player.progress.take(index, count ?? stack.count);

        if (!item) {
            return refuse("count");
        }

        const id = `ground-${this.nextGround++}`;

        this.ground.set(id, { id, item, map: actor.map, square: [...actor.square], until: this.battle.time + GROUND_MS, by: player.id });
        this.#event("dropped", { id: player.id, ground: id, item });

        return { ok: true, ground: id };
    }

    // Something on the ground picked up, from near it, into the pack (if there's room)
    #pickUp(player, actor, id) {
        const dropped = this.ground.get(id);

        // (Someone else's spoils: not there, for them)
        if (!dropped || (dropped.for && dropped.for !== player.id)) {
            return refuse("gone");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if (dropped.map !== actor.map || Math.hypot(actor.x - dropped.square[0] - 0.5, actor.y - dropped.square[1] - 0.5) > PICK_REACH) {
            return refuse("far");
        }

        // (A bundle of a creature's spoils: its gold, and each thing there's room for; what
        // there isn't stays in it)
        if (dropped.bundle) {
            const { gold, items } = dropped.bundle;
            const got = items.filter((item) => player.progress.stow(item, item.count));
            const left = items.filter((item) => !got.includes(item));

            if (!gold && !got.length) {
                return refuse("full");
            }

            player.progress.gold += gold;
            dropped.bundle = { gold: 0, items: left };

            if (!left.length) {
                this.ground.delete(id);
            }

            this.#event("picked", { id: player.id, ground: id, bundle: { gold, items: got }, left: left.length });

            return left.length ? { ok: true, left: left.length } : OK;
        }

        if (!player.progress.stow(dropped.item, dropped.item.count)) {
            return refuse("full");
        }

        this.ground.delete(id);
        this.#event("picked", { id: player.id, ground: id, item: dropped.item });

        return OK;
    }

    // --- Trading face to face ---

    // Two in the battle within `reach` of each other, on the same map
    static #near(a, b, reach) {
        return a.map === b.map && Math.hypot(a.x - b.x, a.y - b.y) <= reach;
    }

    // The trade a player's in (said yes to by both), if any
    #tradeOf(playerId) {
        return [...this.trades.values()].find((trade) => trade.open && (trade.from === playerId || trade.to === playerId)) ?? null;
    }

    // Tell both players in a trade how it's going (a "trade" event each: its `change`)
    #tellTrade(trade, change, details = {}) {
        for (const [one, other] of [[trade.from, trade.to], [trade.to, trade.from]]) {
            this.#event("trade", { id: one, with: other, name: this.players.get(other)?.hero.name ?? null, trade: trade.id, from: trade.from, change, ...details });
        }
    }

    // Ask another player to trade: or, if they've asked already, it's begun
    #trade(player, actor, withId) {
        const other = this.players.get(withId);
        const them = other && this.battle.actor(other.id);

        if (!them || other === player) {
            return refuse("target");
        }

        if (actor.dead || them.dead) {
            return refuse("dead");
        }

        if (!Host.#near(actor, them, TRADE.reach)) {
            return refuse("far");
        }

        if (this.#tradeOf(player.id)) {
            return refuse("trading");
        }

        if (this.#tradeOf(other.id)) {
            return refuse("elsewhere");
        }

        const asked = [...this.trades.values()].find((trade) => trade.from === other.id && trade.to === player.id);

        // (They'd asked: it's begun, with nothing offered yet, and neither's asking anyone else)
        if (asked) {
            for (const trade of [...this.trades.values()]) {
                if (trade !== asked && (trade.from === player.id || trade.from === other.id)) {
                    this.trades.delete(trade.id);
                }
            }

            Object.assign(asked, { open: true, until: null, offers: { [other.id]: { gold: 0, items: [] }, [player.id]: { gold: 0, items: [] } }, agreed: { [other.id]: false, [player.id]: false } });
            this.#tellTrade(asked, "open");

            return { ok: true, trade: asked.id, open: true };
        }

        // (Asking: whoever they'd asked before is asked no longer)
        for (const trade of [...this.trades.values()]) {
            if (trade.from === player.id) {
                this.trades.delete(trade.id);
            }
        }

        const trade = { id: `trade-${this.nextTrade++}`, from: player.id, to: other.id, open: false, until: this.battle.time + TRADE.asking, offers: {}, agreed: {} };

        this.trades.set(trade.id, trade);
        this.#tellTrade(trade, "asked");

        return { ok: true, trade: trade.id, open: false };
    }

    // What a player will give, in place of what they offered before: gold, and things from their
    // pack (as many as they have of each, of each make). Neither's agreed to it yet.
    #offer(player, { gold = 0, items = [] }) {
        const trade = this.#tradeOf(player.id);

        if (!trade) {
            return refuse("trade");
        }

        if (!whole(gold) || gold < 0 || !Array.isArray(items)) {
            return refuse("command");
        }

        if (gold > player.progress.gold) {
            return refuse("gold");
        }

        const offered = [];

        for (const each of items) {
            const { id, quality = "common", count, boost = null } = each ?? {};

            if (!ITEMS[id] || !QUALITIES[quality] || !whole(count) || count < 1 || (boost !== null && !Number.isFinite(boost))) {
                return refuse("item");
            }

            // (A wand or a grimoire: that very one, by its boost)
            const same = offered.find((item) => item.id === id && item.quality === quality && (item.boost ?? null) === boost);

            if (same) {
                same.count += count;
            } else {
                offered.push({ id, quality, count, ...(boost === null ? {} : { boost }) });
            }
        }

        if (offered.some(({ id, quality, count, boost = null }) => player.progress.held(id, quality, boost) < count)) {
            return refuse("count");
        }

        trade.offers[player.id] = { gold, items: offered };
        trade.agreed = { [trade.from]: false, [trade.to]: false };
        this.#tellTrade(trade, "offer", { by: player.id });

        return OK;
    }

    // A player takes the other's offer for theirs: once both have, what's offered changes hands
    #agree(player) {
        const trade = this.#tradeOf(player.id);

        if (!trade) {
            return refuse("trade");
        }

        const other = trade.from === player.id ? trade.to : trade.from;

        trade.agreed[player.id] = true;

        if (!trade.agreed[other]) {
            this.#tellTrade(trade, "agreed", { by: player.id });

            return OK;
        }

        const swapped = this.#swap(trade);

        // (It couldn't be done: neither's agreed now, and why's said)
        if (!swapped.given) {
            trade.agreed = { [trade.from]: false, [trade.to]: false };
            this.#tellTrade(trade, "failed", { reason: swapped.reason, short: swapped.short });

            return refuse(swapped.reason === "full" && swapped.short !== player.id ? "theirs" : swapped.reason);
        }

        this.trades.delete(trade.id);

        for (const [one, from] of [[trade.from, trade.to], [trade.to, trade.from]]) {
            this.#event("trade", { id: one, with: from, name: this.players.get(from)?.hero.name ?? null, trade: trade.id, from: trade.from, change: "done", got: swapped.given[from], gave: swapped.given[one] });
        }

        return OK;
    }

    // What each offered, changing hands at once: or, if either hasn't it all now or hasn't room
    // for what they're given, nothing at all. Returns { given (by player: { gold, items }) }, or
    // { reason, short (whose pack it was) }.
    #swap(trade) {
        const both = [this.players.get(trade.from), this.players.get(trade.to)];
        const before = both.map(({ progress }) => ({ gold: progress.gold, pack: progress.pack.map((stack) => stack && { ...stack }) }));
        const undo = (reason, short) => {
            both.forEach(({ progress }, index) => Object.assign(progress, before[index]));

            return { reason, short };
        };
        const given = {};

        for (const { id, progress } of both) {
            const { gold, items } = trade.offers[id] ?? { gold: 0, items: [] };

            if (progress.gold < gold || !items.every((item) => progress.remove(item.id, item.count, item.quality, item.boost ?? null))) {
                return undo("changed", id);
            }

            progress.gold -= gold;
            given[id] = { gold, items: items.map((item) => ({ ...item })) };
        }

        for (const [{ id, progress }, { id: from }] of [both, [...both].reverse()]) {
            progress.gold += given[from].gold;

            if (!given[from].items.every((item) => progress.stow(item, item.count))) {
                return undo("full", id);
            }
        }

        return { given };
    }

    // A player calls off their trade, or stops asking, or says no to another's asking (`with`)
    #cancel(player, withId) {
        const theirs = (trade) => trade.from === player.id || trade.to === player.id;
        const trade = [...this.trades.values()].find((each) => theirs(each) && (withId === null ? each.open || each.from === player.id : each.from === withId || each.to === withId));

        if (!trade) {
            return refuse("trade");
        }

        this.#endTrade(trade, "cancelled", player.id);

        return OK;
    }

    // A trade (or the asking) at an end, nothing changing hands: why ("cancelled", `by` whom;
    // "apart", "unanswered", "left")
    #endTrade(trade, why, by = null) {
        this.trades.delete(trade.id);
        this.#tellTrade(trade, "off", { why, by, open: trade.open });
    }

    // What each player near a creature when it fell finds on it (spoils.js): their own bundle,
    // rolled for them alone and seen by them alone (the ground's `for`), there to pick up a while
    #spoils(id, beast) {
        const fallen = this.battle.actor(id);

        if (!fallen) {
            return;
        }

        const least = CREATURES[beast.creature]?.tiers[0] ?? beast.tier;

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || actor.dead || actor.map !== fallen.map || Math.hypot(actor.x - fallen.x, actor.y - fallen.y) > SPOILS_REACH) {
                continue;
            }

            const bundle = rollSpoils(beast.creature, beast.tier, this.random, least);

            if (!bundle.gold && !bundle.items.length) {
                continue;
            }

            const ground = `ground-${this.nextGround++}`;

            this.ground.set(ground, { id: ground, bundle, for: player.id, from: beast.creature, map: fallen.map, square: [...fallen.square], until: this.battle.time + GROUND_MS });
            this.#event("spoils", { id: player.id, ground, from: id, creature: beast.creature });
        }
    }

    // Gear put on or taken off (the reason it couldn't be: progress.js equip, unequip)
    #gear(player, why) {
        if (why) {
            return refuse(why);
        }

        this.#outfit(player);
        this.#event("gear", { id: player.id, weapon: player.hero.weapon, worn: player.progress.worn() });

        return OK;
    }

    // Something from the pack used (drunk, eaten; a tome read): one off its stack
    #use(player, actor, index) {
        const stack = player.progress.pack[index];
        const use = stack && ITEMS[stack.id].use;

        if (!use) {
            return refuse("item");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        // (A tome: its spell learnt at once, and the tome gone; unless it's known already)
        if (use.learn) {
            if (player.progress.knows(use.learn)) {
                return refuse("known");
            }

            const item = player.progress.take(index, 1);

            player.progress.learn(use.learn);
            this.#event("used", { id: player.id, item });
            this.#event("learnt", { id: player.id, spell: use.learn });

            return OK;
        }

        // (A cure: only for what's on them)
        if (use.cure && !actor.afflictions.some(({ kind }) => kind === use.cure)) {
            return refuse("unafflicted");
        }

        const item = player.progress.take(index, 1);

        if (use.cure) {
            this.battle.cure(actor.id, use.cure);
        }

        this.battle.mend(actor.id, { hp: use.heal ?? 0, stamina: use.stamina ?? 0 });
        this.#event("used", { id: player.id, item });

        return OK;
    }

    // An ability learnt: a greater spell cast, or the next blow made stronger (and a target
    // fought, if one's given); each blow's ability ready again only after a while
    #ability(player, actor, id, target) {
        const ability = ABILITIES[id];

        if (!ability || !player.progress.abilities().includes(id)) {
            return refuse("unknown");
        }

        if (ability.spell) {
            return this.battle.cast(actor.id, ability.spell, target);
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if ((player.readyAt[id] ?? 0) > this.battle.time) {
            return refuse("cooldown");
        }

        // (A blow up close with a weapon for it; a shot from afar with one for that)
        if (!WEAPONS[actor.weapon]?.attacks.some(({ kind }) => (kind === "ranged" ? "ranged" : "melee") === ability.blow)) {
            return refuse("item");
        }

        const foe = target === null ? null : this.battle.actor(target);

        if (foe && !this.canFight(actor, foe)) {
            return refuse("target");
        }

        this.battle.empower(actor.id, ability.blow, ability.factor);
        player.readyAt[id] = this.battle.time + ability.cooldown;
        this.#event("ability", { id: actor.id, ability: id });

        if (foe) {
            return this.command(actor.id, { type: "engage", target: foe.id });
        }

        return OK;
    }

    // --- Who fights whom ---

    // Two characters on different teams (battle.js hostile asks, the folk and foes aside): as their
    // peoples stand in the war; the wild (the orc, the camps' foes: no people's) set against the
    // players, and not the peoples' soldiers; anyone, without a war. The wild's creatures
    // (creatures.js) are every player's enemies, and the soldiers' and followers' when they're a
    // menace or fighting; no one else's (the orc's)
    #against(a, b) {
        if (a.team === WILD || b.team === WILD) {
            const [beast, other] = a.team === WILD ? [a, b] : [b, a];

            if (other.kind === "player") {
                return true;
            }

            return (other.kind === "soldier" || other.kind === "follower") && Boolean(beast.wild?.menace || beast.target !== null);
        }

        const war = this.war;
        const [ra, rb] = [war?.realm(a.team), war?.realm(b.team)];

        if (ra && rb) {
            return war.hostile(a.team, b.team);
        }

        if (ra || rb) {
            return a.kind === "player" || b.kind === "player" || a.kind === "follower" || b.kind === "follower";
        }

        return true;
    }

    // --- The war come to life ---

    // Where the players are out in the world (and those in buildings, at their doors)
    #whereabouts() {
        return [...this.players.values()].map((player) => this.#whereIs(player)).filter(Boolean);
    }

    // Where a player is in the world ([x, y] metres): out in it, or in a building (at its door)
    #whereIs(player) {
        const actor = this.battle.actor(player.id);

        if (actor?.map === "town") {
            return [actor.x, actor.y];
        }

        const door = actor ? (this.world.interiors?.of(actor.map)?.entrance?.door ?? this.world.tavern?.door) : null;

        return door ? [door.x, door.z] : null;
    }

    // Each town the war's fought over, near a player: its soldiers out (again, if it's changed
    // hands); and those far from every player let go
    #muster() {
        const war = this.war;

        if (!war || !this.world.maps?.town?.chunk) {
            return;
        }

        const places = this.#whereabouts();

        for (const town of war.towns) {
            const place = this.#placeOf(town.id);
            const middle = this.#middleOf(place);
            const edge = SETTLEMENT_KINDS[place.kind].radius;
            const distances = places.map(([x, y]) => Math.hypot(x - middle[0], y - middle[1]) - edge);
            const mustered = this.mustered.get(town.id);

            if (mustered && (mustered.people !== town.owner || distances.every((distance) => distance > MUSTER.far))) {
                this.#dismiss(town.id);
            }

            if (!this.mustered.has(town.id) && distances.some((distance) => distance < MUSTER.near)) {
                this.#raise(town, place, middle);
            }
        }

        // The camps near a player pitched, and those far from every player (or gone) struck
        const near = (camp, within) => places.some(([x, y]) => Math.hypot(x - camp.at[0], y - camp.at[1]) < within);

        for (const id of [...this.camps.keys()]) {
            const camp = war.force(id);

            if (camp?.kind !== "camp" || !near(camp, CAMP_NEAR.far)) {
                this.#strike(id);
            }
        }

        for (const camp of war.forces) {
            if (camp.kind === "camp" && !this.camps.has(camp.id) && near(camp, CAMP_NEAR.near)) {
                this.#pitch(camp);
            }
        }

        this.#watchSorties();

        // The envoys near a player met on the road, and let go once they're far (or gone, and far)
        for (const [id, met] of [...this.envoys]) {
            if (!near({ at: met.at }, ENVOY.far) || (!met.over && war.force(id)?.kind !== "envoy")) {
                this.#farewell(id);
            }
        }

        for (const envoy of war.forces) {
            if (envoy.kind === "envoy" && !this.envoys.has(envoy.id) && near(envoy, ENVOY.near)) {
                this.#meet(envoy);
            }
        }

        this.#watchEnvoys();

        // (What a camp does against a town with its soldiers out is played out here, and the
        // envoys met go at their own pace)
        war.watch([...this.mustered.keys(), ...[...this.envoys].filter(([, met]) => !met.over).map(([id]) => id)]);
    }

    #placeOf(id) {
        return this.world.plan.places.find((place) => place.id === id);
    }

    // Where a place's middle is: the town the player starts in is set in a little off its place
    #middleOf(place) {
        return place.id === this.world.start?.id && this.world.stamp?.middle ? this.world.stamp.middle : place.at;
    }

    // A town's soldiers out: its guards at their posts, as many as its garrison has (up to its
    // posts), and its patrols on their rounds (as many as it has, while its garrison's half full)
    #raise(town, place, middle) {
        const map = this.world.maps.town;
        const squares = squaresOf(map);
        const full = HOLDINGS[town.kind].garrison;
        const posts = postsOf(this.world.plan, place, { middle });
        const guards = Math.min(posts.length, Math.ceil((town.garrison / full) * POSTED[town.kind]));
        const rounds = roundsOf(this.world.plan, place, { middle }).slice(0, town.garrison * 2 >= full ? undefined : 0);
        const shown = guards + rounds.length * PATROL_SIZE;
        const [guardArms, patrolArms] = SOLDIERS_ARMS[town.owner] ?? SOLDIERS_ARMS.human;
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === "town").map(({ square: [x, y] }) => squareKey(x, y)));
        const free = ([x, y]) => {
            const square = nearestFree(squares, [Math.floor(x), Math.floor(y)], { taken, within: 24 });

            taken.add(squareKey(...square));

            return square;
        };
        const ids = [];
        const enlist = (id, weapon, square, orders) => {
            this.#enlist(id, { people: town.owner, weapon, square, name: `${orders.patrol.length > 1 ? "patrol" : "guard"}`, record: { town: town.id }, ...orders });
            ids.push(id);
        };

        if (!shown) {
            return;
        }

        try {
            for (const [k, post] of posts.slice(0, guards).entries()) {
                const square = free(post.at);

                enlist(`${town.id}/guard-${k}`, guardArms, square, { patrol: [square], leash: LEASH, facing: post.facing });
            }

            for (const [k, round] of rounds.entries()) {
                const points = round.map((point) => nearestFree(squares, [Math.floor(point[0]), Math.floor(point[1])], { within: 24 }));

                for (let m = 0; m < PATROL_SIZE; m++) {
                    enlist(`${town.id}/patrol-${k}-${m}`, m % 2 ? patrolArms : guardArms, free(points[0]), { patrol: points, leash: LEASH * 2 });
                }
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        const banners = bannersOf(this.world.plan, place, { middle }).slice(0, Math.ceil(guards / 2));

        this.mustered.set(town.id, { people: town.owner, ids, share: town.garrison / Math.max(1, ids.length), banners });
        this.#event("muster", { town: town.id, people: town.owner, ids, banners });
    }

    // One of a people's soldiers, out in the world: how they look (from their id, the same every
    // time), and what they're doing (their orders: patrol, leash, facing), named for their people
    // and their part ("Orcish raider"); `record` says whose they are ({ town }, or { camp, share })
    #enlist(id, { people, weapon, square, name, record, ...orders }) {
        const seed = [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, this.world.seed ?? 1) >>> 0;
        const sex = seed % 4 === 0 ? "f" : "m";
        const adjective = ADJECTIVES[people] ?? people;

        this.soldiers.set(id, { ...record, people, weapon, sex, seed });
        this.battle.add({ id, kind: "soldier", name: `${adjective[0].toUpperCase()}${adjective.slice(1)} ${name}`, weapon, team: people, square, ai: "patrol", role: "guard", ...orders });
    }

    // Free squares near spots in the world, one each (none taken twice, nor anyone's)
    #spots() {
        const squares = squaresOf(this.world.maps.town);
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === "town").map(({ square: [x, y] }) => squareKey(x, y)));

        return ([x, y]) => {
            const square = nearestFree(squares, [Math.floor(x), Math.floor(y)], { taken, within: 24 });

            taken.add(squareKey(...square));

            return square;
        };
    }

    // A camp near a player pitched (docs/WAR.md M6): its tents round its fire, and its sentries
    // round them, facing out, as many as it has (a third of it, up to CAMP.sentries)
    #pitch(camp) {
        const count = Math.min(CAMP.sentries, Math.max(1, Math.ceil(camp.size / 3)));
        const { fire, tents, posts } = campOf(camp, { sentries: count });
        const [guardArms, patrolArms] = SOLDIERS_ARMS[camp.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];
        const share = camp.size / count;

        try {
            for (const [k, post] of posts.entries()) {
                const id = `${camp.id}/sentry-${k}`;
                const square = free(post.at);

                this.#enlist(id, { people: camp.realm, weapon: k % 2 ? patrolArms : guardArms, square, name: "sentry", record: { camp: camp.id, share }, patrol: [square], leash: LEASH + 4, facing: post.facing });
                ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.camps.set(camp.id, { people: camp.realm, ids, share, fire, tents });
        this.#event("camp", { camp: camp.id, people: camp.realm, town: camp.target, ids, fire, tents });
    }

    // A camp struck: its sentries gone from the world (still with it, in the war), its tents down
    #strike(id) {
        const { ids } = this.camps.get(id);

        this.camps.delete(id);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("strike", { camp: id, ids });
    }

    // --- The wild (docs/WILDS.md) ---

    // The wild's creatures about the players: those far from every player let go; the wild camps
    // and perilous sites near a player come to life (and those far, let go); and each player out
    // in the world with fewer than WILDS.count about them, one more pack put out, out of sight
    #wilds() {
        const plan = this.world.plan;

        if (!plan || !this.world.maps?.town?.chunk) {
            return;
        }

        const places = this.#whereabouts();
        const distanceTo = (actor) => Math.min(...places.map(([x, y]) => Math.hypot(actor.x - x, actor.y - y)));
        const homes = [...this.players.values()].map((player) => ({ at: this.#whereIs(player), home: this.#homeOf(player) })).filter(({ at }) => at);

        for (const [id, one] of [...this.wild]) {
            const actor = this.battle.actor(id);

            if (!actor) {
                this.#unwild(id);
            } else if (!actor.dead && !one.camp && !one.lair && actor.target === null && distanceTo(actor) > WILDS.far) {
                this.#release(id);
            }
        }

        this.#wildCamps(homes);
        this.#lairs(places);

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || actor.dead || actor.map !== "town") {
                continue;
            }

            const about = [...this.wild].filter(([id, one]) => {
                const beast = !one.camp && !one.lair ? this.battle.actor(id) : null;

                return beast && !beast.dead && Math.hypot(beast.x - actor.x, beast.y - actor.y) < WILDS.about;
            }).length;

            if (about < WILDS.count) {
                this.#putOut([actor.x, actor.y], this.#homeOf(player), WILDS.count - about);
            }
        }
    }

    // Where a player's home is: the town their people's players start in (the wild's tamest near
    // it: creatures.js tierAt)
    #homeOf(player) {
        const plan = this.world.plan;

        return RACE[player.realm] ? startFor(plan, player.realm).at : (this.world.start?.at ?? [0, 0]);
    }

    // A pack of what lives there put out near a place (out of sight of it, as strong as its
    // distance from `home` has it), clear of the settlements and the water, no bigger than `room`
    #putOut([x, y], home, room) {
        const plan = this.world.plan;

        for (let tries = 0; tries < 6; tries++) {
            const angle = this.random.next() * Math.PI * 2;
            const reach = WILDS.from + this.random.next() * (WILDS.to - WILDS.from);
            const at = [x + Math.cos(angle) * reach, y + Math.sin(angle) * reach];

            if (!clearOfSettlements(plan, at, WILDS.clear) || landAt(plan, ...at).water) {
                continue;
            }

            const encounter = encounterAt(plan, at, [home], this.random);

            if (encounter) {
                this.#pack({ ...encounter, count: Math.max(1, Math.min(room, encounter.count)) }, at);

                return;
            }
        }
    }

    // A pack of creatures put out at a place (`count` of `creature` at `tier`), the first its
    // leader; what they're of (`camp`, `lair`) and how they keep (`roam`, `temper`): their ids
    #pack({ creature, tier, count }, [x, y], { master = false, ...more } = {}) {
        const free = this.#spots();
        const pack = `pack-${this.nextWild}`;
        const ids = [];

        try {
            for (let k = 0; k < count; k++) {
                const id = `wild-${this.nextWild++}`;

                this.#rouse(id, creature, tier, free([x + (k % 3) - 1, y + Math.floor(k / 3)]), { pack, leader: ids[0] ?? null, master: master && k === 0, ...more });
                ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        if (ids.length) {
            this.#event("roused", { ids, creature });
        }

        return ids;
    }

    // One of the wild's creatures into the world: as strong as its tier has it (creatures.js)
    #rouse(id, creature, tier, square, { pack, leader, master = false, camp = null, lair = null, roam = null, temper = null }) {
        const spec = CREATURES[creature];
        const power = tierPower(tier);

        this.wild.set(id, { creature, tier, pack, camp, lair, master });
        this.battle.add({
            id,
            kind: "beast",
            name: spec.name,
            weapon: spec.weapon,
            team: WILD,
            square,
            ai: "wild",
            hp: Math.round(spec.hp * power),
            speed: spec.speed,
            chase: spec.chase,
            power: { melee: power, ranged: power },
            armor: spec.armor ?? 0,
            wild: { creature, tier, temper: temper ?? spec.temper, guard: spec.guard ?? 0, roam: roam ?? spec.roam, leash: spec.leash + (roam ?? 0), pack, leader, menace: menaces(creature) },
        });
    }

    // A creature let go (wandered off, far from every player)
    #release(id) {
        this.battle.remove(id);
        this.#unwild(id);
        this.#event("gone", { id });
    }

    // A creature no longer about: out of its camp's or site's too
    #unwild(id) {
        const one = this.wild.get(id);

        if (!one) {
            return;
        }

        this.wild.delete(id);

        for (const held of [one.camp && this.wildCamps.get(one.camp), one.lair && this.lairs.get(one.lair)]) {
            if (held) {
                held.ids = held.ids.filter((each) => each !== id);
            }
        }
    }

    // The wild camps (the world plan's) near a player: their folk out, round the camp and on its
    // patrols, as strong as its tier (from the home of the player nearest it: few, near home);
    // let go once every player's far
    #wildCamps(homes) {
        const near = (at, within) => homes.some(({ at: [x, y] }) => Math.hypot(x - at[0], y - at[1]) < within);

        for (const [id, held] of [...this.wildCamps]) {
            const camp = this.world.plan.camps.find((each) => each.id === id);

            if (!near(camp.at, camp.roam + WILDS.campFar)) {
                for (const each of [...held.ids]) {
                    if (!this.battle.actor(each)?.dead) {
                        this.#release(each);
                    }
                }

                this.wildCamps.delete(id);
            }
        }

        for (const camp of this.world.plan.camps) {
            if (this.wildCamps.has(camp.id) || !near(camp.at, camp.roam + WILDS.camp) || !CAMP_FOLK[camp.faction]) {
                continue;
            }

            const nearest = homes.reduce((best, each) => (Math.hypot(each.at[0] - camp.at[0], each.at[1] - camp.at[1]) < Math.hypot(best.at[0] - camp.at[0], best.at[1] - camp.at[1]) ? each : best));
            const tier = campTier(camp, nearest.home);
            const creature = campFolk(camp.faction, tier);
            const patrols = Math.min(camp.patrols, 1 + Math.floor(tier / 3));
            const ids = this.#pack({ creature, tier, count: Math.min(5, 1 + Math.floor(tier / 2)) }, camp.at, { camp: camp.id, roam: 4, temper: "territorial" });

            // (Its patrols, roaming out from it: as many as it has, fewer near home)
            for (let k = 0; k < patrols; k++) {
                const angle = ((k + 0.5) / patrols) * Math.PI * 2;
                const out = camp.roam * 0.5;

                ids.push(...this.#pack({ creature, tier, count: Math.max(1, packOf(creature, tier) - (tier <= 2 ? 1 : 0)) }, [camp.at[0] + Math.cos(angle) * out, camp.at[1] + Math.sin(angle) * out], { camp: camp.id, roam: camp.roam * 0.4 }));
            }

            this.wildCamps.set(camp.id, { ids });
        }
    }

    // The perilous sites (a dragon's lair, the ruined castles) near a player: their master (unless
    // slain lately) and its guards there; let go once every player's far
    #lairs(places) {
        const near = (at, within) => places.some(([x, y]) => Math.hypot(x - at[0], y - at[1]) < within);

        for (const [id, held] of [...this.lairs]) {
            const site = this.#siteOf(id);

            if (!near(site.at, LAIRS[site.kind].near * 2)) {
                for (const each of [...held.ids]) {
                    if (!this.battle.actor(each)?.dead) {
                        this.#release(each);
                    }
                }

                this.lairs.delete(id);
            }
        }

        for (const site of this.world.plan.sites) {
            const lair = LAIRS[site.kind];

            if (!lair || this.lairs.has(site.id) || !near(site.at, lair.near)) {
                continue;
            }

            const ids = [];
            const [master, tier] = lair.master;

            if ((this.slain[site.id] ?? -Infinity) <= this.battle.time) {
                ids.push(...this.#pack({ creature: master, tier, count: 1 }, site.at, { lair: site.id, master: true, roam: 3 }));
            }

            lair.guards.forEach(([creature, count, guardTier], k) => {
                const angle = (k / lair.guards.length) * Math.PI * 2;

                ids.push(...this.#pack({ creature, tier: guardTier, count }, [site.at[0] + Math.cos(angle) * 6, site.at[1] + Math.sin(angle) * 6], { lair: site.id, roam: 6 }));
            });

            this.lairs.set(site.id, { ids });
        }
    }

    #siteOf(id) {
        return this.world.plan.sites.find((site) => site.id === id);
    }

    // A camp's sortie against a town a player's near (the war's "sortie"): its raiders, or
    // attackers, out from the town's edge on the camp's side, making for its fields (a raid) or
    // into it (an assault), each standing for a share of those the camp sent. If the town's no
    // longer near anyone, it's reckoned in the war instead
    #setOut({ force: id, town: townId, kind, party }) {
        const camp = this.war.force(id);
        const town = this.war.town(townId);

        if (!camp || !town || !this.mustered.has(townId)) {
            this.war.settle(id, { reckon: true });

            return;
        }

        const place = this.#placeOf(townId);
        const { from, to } = sortieOf(place, camp, kind, { middle: this.#middleOf(place) });
        const count = Math.max(1, Math.min(kind === "raid" ? SORTIE.raiders : SORTIE.attackers, party));
        const [guardArms, patrolArms] = SOLDIERS_ARMS[camp.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];
        let mark = null;

        try {
            mark = nearestFree(squaresOf(this.world.maps.town), [Math.floor(to[0]), Math.floor(to[1])], { within: 24 });

            for (let k = 0; k < count; k++) {
                const each = `${id}/${kind}-${this.war.turn}-${k}`;

                this.#enlist(each, { people: camp.realm, weapon: k % 2 ? patrolArms : guardArms, square: free(from), name: kind === "raid" ? "raider" : "attacker", record: { camp: id, share: party / count, sortie: true }, patrol: [mark] });
                ids.push(each);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        if (!ids.length) {
            this.war.settle(id, { reckon: true });

            return;
        }

        this.sorties.set(id, { kind, town: townId, people: camp.realm, ids, to: mark, at: this.battle.time, reached: false, reachedAt: null });
        this.#event("sortie", { camp: id, town: townId, name: town.name, kind, people: camp.realm, owner: town.owner, ids });
    }

    // Each sortie out, watched: whether its raiders have reached the town's fields, and whether
    // it's over (all of them down; the town's defenders all down, in an assault; the raiders done
    // with the fields; too long out; the camp gone; no one near the town any more)
    #watchSorties() {
        for (const [id, sortie] of [...this.sorties]) {
            const camp = this.war.force(id);
            const standing = (ids) => ids.map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead);
            const out = standing(sortie.ids);
            const mustered = this.mustered.get(sortie.town);
            const time = this.battle.time;

            if (!sortie.reached && out.some(({ square }) => distanceBetween(square, sortie.to) <= SORTIE.reach)) {
                Object.assign(sortie, { reached: true, reachedAt: time });
            }

            let end = null;

            if (camp?.kind !== "camp" || !camp.sortie) {
                end = "gone";
            } else if (!mustered) {
                end = "left";
            } else if (!out.length) {
                end = "beaten";
            } else if (sortie.kind === "assault" && !standing(mustered.ids).length) {
                end = "won";
            } else if ((sortie.kind === "raid" && sortie.reached && time - sortie.reachedAt >= SORTIE.stay) || time - sortie.at >= SORTIE.most) {
                end = "done";
            }

            if (end) {
                this.#comeBack(id, end);
            }
        }
    }

    // A sortie over: those still standing back to their camp (out of the world), and the war told
    // how it went (settle): an assault that's left no one standing in the town takes it; the rest
    // of one whose town no one's near any more is reckoned there
    #comeBack(id, end) {
        const sortie = this.sorties.get(id);
        const town = this.war.town(sortie.town);

        this.sorties.delete(id);

        if (end === "won" && town) {
            this.war.loss(town.id, town.garrison);
        }

        const back = sortie.ids.filter((each) => this.battle.actor(each) && !this.battle.actor(each).dead);

        for (const each of back) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        const result = end === "gone" ? null : this.war.settle(id, { reached: sortie.reached, reckon: end === "left" });

        this.#event("sortied", { camp: id, town: sortie.town, name: town?.name ?? null, kind: sortie.kind, people: sortie.people, result, back });
    }

    // An envoy on the road near a player met (docs/WAR.md M7): them, and their escort, where the
    // war has them, making for a point a little further along their road
    #meet(envoy) {
        const [guardArms, patrolArms] = SOLDIERS_ARMS[envoy.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];
        const met = { people: envoy.realm, to: envoy.target, mission: envoy.mission, ids, leg: envoy.leg, mark: null, at: [...envoy.at], over: null };

        try {
            met.mark = this.#ahead(envoy, envoy.at, envoy.leg);

            for (let k = 0; k <= ENVOY.escort; k++) {
                const id = k ? `${envoy.id}/escort-${k}` : `${envoy.id}/envoy`;

                this.#enlist(id, { people: envoy.realm, weapon: k ? (k % 2 ? patrolArms : guardArms) : "staff", square: free(envoy.at), name: k ? "escort" : "envoy", record: { envoy: envoy.id, share: 0, part: k ? "escort" : "envoy" }, patrol: [free(met.mark)] });
                ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.envoys.set(envoy.id, met);
        this.#event("envoy", { envoy: envoy.id, people: envoy.realm, to: envoy.target, mission: envoy.mission, ids });
    }

    // The square `ENVOY.ahead` metres further along an envoy's road from `at` (past its point `leg`)
    #ahead(envoy, at, leg) {
        let [x, y] = at;
        let left = ENVOY.ahead;

        for (let k = leg + 1; k < envoy.path.length && left > 0; k++) {
            const [nx, ny] = envoy.path[k];
            const distance = Math.hypot(nx - x, ny - y);

            if (distance <= left) {
                [x, y, left] = [nx, ny, left - distance];
            } else {
                [x, y, left] = [x + ((nx - x) / distance) * left, y + ((ny - y) / distance) * left, 0];
            }
        }

        return nearestFree(squaresOf(this.world.maps.town), [Math.floor(x), Math.floor(y)], { within: 24 });
    }

    // Each envoy met, on their way: where they've got to told to the war (which hears them, at
    // their road's end), and, once they're at the point they were making for, the next
    #watchEnvoys() {
        for (const [id, met] of this.envoys) {
            const envoy = this.war.force(id);
            const leader = this.battle.actor(met.ids[0]);

            if (met.over || envoy?.kind !== "envoy" || !leader || leader.dead) {
                continue;
            }

            met.at = [leader.x, leader.y];

            let leg = met.leg;

            while (leg < envoy.path.length - 1 && Math.hypot(envoy.path[leg + 1][0] - leader.x, envoy.path[leg + 1][1] - leader.y) <= ENVOY.past) {
                leg++;
            }

            if (this.war.move(id, met.at, leg)) {
                met.over = "arrived";
                this.#event("envoyed", { envoy: id, people: met.people, to: met.to, over: "arrived" });
                continue;
            }

            met.leg = leg;

            // (There, or nearly: on to the next point along)
            if (distanceBetween(leader.square, met.mark) <= 2 || (!leader.path.length && !leader.to && !leader.target)) {
                try {
                    const free = this.#spots();

                    met.mark = this.#ahead(envoy, met.at, leg);

                    for (const [k, each] of met.ids.entries()) {
                        const actor = this.battle.actor(each);

                        if (actor && !actor.dead) {
                            Object.assign(actor, { patrol: [k ? free(met.mark) : met.mark], patrolIndex: 0 });
                        }
                    }
                } catch {
                    // (Nowhere free ahead just now: tried again next time)
                }
            }
        }
    }

    // An envoy struck down: waylaid, by whoever did it (their people, or no one's)
    #envoyFell(id, byId) {
        const met = this.envoys.get(id);
        const by = byId ? this.battle.actor(byId) : null;
        const realm = by ? (this.players.get(by.id)?.realm ?? by.team) : null;

        this.war?.waylaid(id, realm);

        if (met && !met.over) {
            met.over = "waylaid";
            this.#event("envoyed", { envoy: id, people: met.people, to: met.to, over: "waylaid", by: realm });
        }
    }

    // An envoy's party let go: out of the world
    #farewell(id) {
        const { ids } = this.envoys.get(id);

        this.envoys.delete(id);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("farewell", { envoy: id, ids });
    }

    // A people's enemy brought down by a player, before their soldiers' eyes: they owe the
    // player's people a favour for it (docs/WAR.md M7). Their own people owe them nothing more
    #owed({ id, by }) {
        const player = by && this.players.get(by);
        const fallen = this.battle.actor(id);

        if (!player || !fallen || !this.war?.realm(fallen.team)) {
            return;
        }

        const seen = new Set();

        for (const other of this.battle.actors) {
            const people = other.team;

            if (other.kind !== "soldier" || other.dead || other.map !== fallen.map || people === player.realm || seen.has(people) || !this.war.realm(people)) {
                continue;
            }

            if (this.war.hostile(people, fallen.team) && distanceBetween(other.square, fallen.square) <= FAVOUR_SIGHT) {
                seen.add(people);
                this.war.remember(people, player.realm, 2);
            }
        }
    }

    // --- Followers (docs/WAR.md M9) ---

    // A player's followers (their ids)
    #company(playerId) {
        return [...this.followers].filter(([, one]) => one.leader === playerId).map(([id]) => id);
    }

    // One of the adventurers at a guild (or drinking at its tables) hired: out of the folk, and
    // following the player, for their price
    #hire(player, actor) {
        const one = this.folk.get(actor.talkingTo);
        const calling = one?.look;

        if (!one || !(one.role === "adventurer" || one.talk === "adventurer") || !HIRES[calling]) {
            return refuse("hire");
        }

        if (this.#company(player.id).length >= this.mostFollowers(player.id)) {
            return refuse("company");
        }

        const { price } = HIRES[calling];

        if (player.progress.gold < price) {
            return refuse("gold");
        }

        player.progress.gold -= price;

        // (Gone from where they sat or read the board, for good)
        const npc = this.battle.actor(one.id);
        const at = { square: [...npc.square], map: npc.map };

        this.battle.remove(one.id);
        this.folk.delete(one.id);
        this.hired.add(one.id);

        const id = this.#follow(player, { name: one.name, calling, sex: one.sex, seed: one.seed, people: one.people ?? "human", from: one.id }, at);

        actor.talkingTo = null;
        this.#event("gone", { id: one.id });

        return { ok: true, follower: id, price };
    }

    // A follower of a player's, into the world by them (or where `at` says): { name, calling,
    // sex, seed, people }. Returns their id
    #follow(player, one, at = null) {
        const leader = this.battle.actor(player.id);
        const map = at?.map ?? leader.map;
        const taken = new Set(this.battle.actors.filter((each) => each.map === map).map(({ square: [x, y] }) => squareKey(x, y)));
        const square = nearestFree(squaresOf(this.world.maps?.[map] ?? this.world), at?.square ?? leader.square, { taken });
        const id = `follower-${this.nextFollower++}`;
        const { weapon } = HIRES[one.calling] ?? HIRES.warrior;

        this.followers.set(id, { leader: player.id, name: one.name, calling: one.calling, sex: one.sex ?? "m", seed: one.seed ?? 1, people: one.people ?? "human", from: one.from ?? null, waiting: false });
        this.battle.add({ id, kind: "follower", name: one.name, weapon, team: player.realm, square, map, ai: "follow", leader: player.id, role: "guard" });
        this.#event("follower", { id: player.id, follower: id, name: one.name, change: "joined" });

        return id;
    }

    // A player's followers brought along with them (through a door, up the stairs): by them where
    // they've come out, unless they were told to wait
    #bring(playerId) {
        const leader = this.battle.actor(playerId);
        const squares = squaresOf(this.world.maps?.[leader.map] ?? this.world);
        const taken = new Set(this.battle.actors.filter((each) => each.map === leader.map).map(({ square: [x, y] }) => squareKey(x, y)));

        for (const id of this.#company(playerId)) {
            const follower = this.battle.actor(id);

            if (!follower || follower.dead || follower.map === leader.map || this.followers.get(id).waiting) {
                continue;
            }

            try {
                const square = nearestFree(squares, leader.square, { taken, within: 12 });

                taken.add(squareKey(...square));
                Object.assign(follower, { map: leader.map, spawnMap: leader.map, square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], target: null });
            } catch {
                // (No room by them: they'll catch up another time)
            }
        }
    }

    // A follower told what to do, by the player they follow: to wait where they stand, to follow
    // again, or to go their own way (gone)
    #tell(player, actor, order) {
        const id = actor.talkingTo;
        const one = this.followers.get(id);
        const follower = this.battle.actor(id);

        if (!one || one.leader !== player.id || !follower) {
            return refuse("follower");
        }

        if (order === "wait") {
            one.waiting = true;
            Object.assign(follower, { ai: "patrol", patrol: [[...follower.square]], patrolIndex: 0, leash: LEASH, post: follower.facing, spawnMap: follower.map });
        } else if (order === "follow") {
            one.waiting = false;
            Object.assign(follower, { ai: "follow", patrol: null, leash: null });
        } else if (order === "dismiss") {
            this.followers.delete(id);
            this.battle.remove(id);
            actor.talkingTo = null;
            this.#event("follower", { id: player.id, follower: id, name: one.name, change: "dismissed" });
            this.#event("gone", { id });
        } else {
            return refuse("command");
        }

        return OK;
    }

    // A town's soldiers let go (its garrison's as the war has it)
    #dismiss(townId) {
        const { ids } = this.mustered.get(townId);

        this.mustered.delete(townId);

        for (const id of ids) {
            this.battle.remove(id);
            this.soldiers.delete(id);
        }

        this.fallen = this.fallen.filter(({ id }) => !ids.includes(id));
        this.#event("dismiss", { town: townId, ids });
    }

    // A fallen soldier taken away
    #gone(id) {
        const soldier = this.soldiers.get(id);

        this.battle.remove(id);
        this.soldiers.delete(id);
        this.#unwild(id);

        const mustered = soldier && (soldier.envoy ? null : soldier.camp ? this.camps.get(soldier.camp) : this.mustered.get(soldier.town));

        if (mustered) {
            mustered.ids = mustered.ids.filter((each) => each !== id);
        }

        this.#event("gone", { id });
    }

    // --- Commands ---

    #order(actor, order) {
        if (actor.dead) {
            return refuse("dead");
        }

        this.battle.command(actor.id, order);

        return OK;
    }

    // Start talking to one of the folk (near enough, on the same map, alive), or stop: each faces
    // the other until it's over
    #talk(actor, withId) {
        const was = actor.talkingTo;

        if (withId === null) {
            this.battle.talk(actor.id, null);

            // (They go back to what they were doing, unless they're talking to someone else now)
            if (was !== null && this.battle.actor(was)?.talkingTo === actor.id) {
                this.battle.talk(was, null);
            }

            if (was !== null) {
                this.#event("talk", { id: actor.id, with: null, was });
            }

            return OK;
        }

        const npc = this.battle.actor(withId);

        // (One of the folk, a soldier who isn't an enemy, or one of their own followers)
        const theirs = npc?.kind === "follower" && this.followers.get(npc.id)?.leader === actor.id;

        if (!npc || npc.dead || npc === actor || !(npc.neutral || theirs || (npc.kind === "soldier" && !this.battle.hostile(npc, actor)))) {
            return refuse("target");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if (npc.map !== actor.map || distanceBetween(actor.square, npc.square) > TALK_REACH.across + 1) {
            return refuse("far");
        }

        this.battle.talk(npc.id, actor.id);
        this.battle.talk(actor.id, npc.id);
        this.#event("talk", { id: actor.id, with: npc.id });
        this.#gain(this.players.get(actor.id), "talk", XP.talk);

        return OK;
    }

    // Something done by talking, to whoever the player's talking to: paid for (if it has a
    // price, and they can), done (what's bought: BOUGHT), kept (the last few), and told of (an
    // "effect" event), for the world to act on
    #effect(player, actor, effect) {
        if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
            return refuse("command");
        }

        if (actor.talkingTo === null) {
            return refuse("talking");
        }

        // (Work asked for or taken on, word of it brought, the armoury, counsel: an official's)
        if (effect.work || effect.report || effect.armoury || effect.counsel) {
            return this.#official(player, actor, effect);
        }

        // (An adventurer hired; a follower told what to do: M9)
        if (effect.hire) {
            return this.#hire(player, actor);
        }

        if (effect.follower) {
            return this.#tell(player, actor, effect.follower);
        }

        const price = Math.max(0, Math.floor(Number(effect.price ?? effect.pay) || 0));

        if (price > player.progress.gold) {
            return refuse("gold");
        }

        if (price) {
            player.progress.gold -= price;
            this.#gain(player, "trade", price * XP.trade);
        }

        // (What's bought for themselves: drunk, eaten, slept on, or a boon)
        const bought = effect.for === "them" ? null : BOUGHT[effect.buy ?? effect.rent];

        if (bought?.boon) {
            player.boons = [...player.boons.filter(({ id }) => id !== bought.boon.id), { ...bought.boon, until: this.battle.time + bought.boon.ms }];
            this.#outfit(player);
        } else if (bought) {
            this.battle.mend(actor.id, { hp: bought.hp ?? 0, stamina: bought.stamina ?? 0 });
        }

        this.#gain(player, "talk", XP.effect);

        const done = { ...structuredClone(effect), by: actor.talkingTo, player: actor.id, at: this.battle.time };

        this.done.push(done);
        this.done.splice(0, Math.max(0, this.done.length - KEEP_DONE));
        this.#event("effect", { id: actor.id, effect: done });

        return OK;
    }

    // --- Standing in their people (core/standing.js) ---

    /**
     * Where one of the folk sits in their people's rule, if they do (by id): { id, role, name,
     * title, town (a war town's id), owner (who holds it), post ("hall" or "keep"), and what they
     * do (OFFICIALS) }; or null.
     */
    postOf(id) {
        const one = this.folk.get(id);
        const official = OFFICIALS[one?.role];
        const actor = this.battle.actor(id);

        if (!official || !actor || !this.war) {
            return null;
        }

        const building = this.world.interiors?.of(actor.map);
        const town = this.war.town(building?.place === "home" ? this.world.start?.id : building?.place);

        return town ? { id, role: one.role, name: one.name, title: one.title ?? "", town: town.id, owner: town.owner, ...official } : null;
    }

    /**
     * What a player can tell one of the folk (by id) of: letters for them, and what's been done
     * of what they asked (or a tithe to be paid them). Their requests, as the player carries them.
     */
    dueTo(playerId, id) {
        const player = this.players.get(playerId);
        const post = this.postOf(id);

        if (!player || !post?.report) {
            return [];
        }

        return player.standing.requests.filter((request) => {
            if (request.kind === "message") {
                return request.target.town === post.town && request.target.post === post.post;
            }

            // (Creatures' parts wanted at the guild: due once they're all in the pack)
            const brought = request.kind === "parts" && player.progress.held(request.target.part) >= request.target.need;

            return request.from.town === post.town && request.from.post === post.post && (request.state === "done" || request.kind === "tithe" || brought);
        });
    }

    // Something asked of an official the player's talking to: work (offered, then taken on), word
    // of what's done (rewarded), the armoury's gift for their rank, or counsel to their rulers
    #official(player, actor, effect) {
        const post = this.postOf(actor.talkingTo);

        if (!post) {
            return refuse("official");
        }

        const { standing } = player;
        const rank = standing.rank();
        const own = this.war.liege(post.owner) === this.war.liege(player.realm);

        if (effect.work === "ask" || effect.work === "accept") {
            if (!post.work) {
                return refuse("official");
            }

            // (The guild's board is for anyone, of any people)
            if (!own && post.post !== "guild") {
                return refuse("stranger");
            }

            if (post.post === "keep" && rank < OPENS.keep) {
                return refuse("rank");
            }

            if (standing.requests.length >= MOST_REQUESTS) {
                return refuse("requests");
            }

            // (What they offer holds for the turn: asking again doesn't change it)
            const kept = player.offers[post.id];

            if (effect.work === "ask") {
                const offer = post.post === "guild" ? offerContract : offerRequest;
                const request = kept?.turn === this.war.turn ? kept.request : offer({ war: this.war, realm: player.realm, town: post.town, post: post.post, giver: post, rank, held: standing.requests, random: this.random });

                player.offers[post.id] = { turn: this.war.turn, request };

                return request ? { ok: true, request: structuredClone(request) } : refuse("work");
            }

            if (!kept?.request) {
                return refuse("work");
            }

            const taken = standing.take(kept.request);

            delete player.offers[post.id];
            this.#event("request", { id: player.id, change: "taken", request: structuredClone(taken) });

            return { ok: true, request: structuredClone(taken) };
        }

        if (effect.report) {
            if (!post.report) {
                return refuse("official");
            }

            const due = this.dueTo(player.id, post.id);

            if (!due.length) {
                return refuse("due");
            }

            const handed = [];

            for (const request of due) {
                // (A tithe paid, if they've the gold: into their people's treasury)
                if (request.kind === "tithe") {
                    if (player.progress.gold < request.target.gold) {
                        continue;
                    }

                    player.progress.gold -= request.target.gold;
                    this.war.give(player.realm, request.target.gold * TITHE_RATE);
                }

                // (Creatures' parts handed over, out of the pack)
                if (request.kind === "parts" && !player.progress.remove(request.target.part, request.target.need)) {
                    continue;
                }

                handed.push(this.#rewarded(player, request));
            }

            return handed.length ? { ok: true, reported: handed } : refuse("gold");
        }

        if (effect.armoury) {
            if (!post.armoury) {
                return refuse("official");
            }

            if (!own) {
                return refuse("stranger");
            }

            if (rank < OPENS.armoury) {
                return refuse("rank");
            }

            // (The first rank's gift not had yet: something for the weapon they carry)
            const due = Array.from({ length: rank - OPENS.armoury + 1 }, (_, k) => OPENS.armoury + k).find((each) => !standing.claimed.includes(each));

            if (due === undefined) {
                return refuse("claimed");
            }

            const weapon = weaponOf(player.progress);
            const gift = armouryGift(due, ITEMS[weapon]?.slot === "weapon" ? weapon : "sword", WITH_SHIELD.includes(weapon));

            if (!player.progress.stow(gift)) {
                return refuse("full");
            }

            standing.claimed.push(due);
            this.#event("gift", { id: player.id, item: gift, rank: due });

            return { ok: true, item: gift };
        }

        if (effect.counsel) {
            const [kind] = Object.keys(effect.counsel);

            if (!post.counsel) {
                return refuse("official");
            }

            if (!own) {
                return refuse("stranger");
            }

            if (!(rank >= (OPENS[kind] ?? Infinity))) {
                return refuse("rank");
            }

            // (A rising, counselled in their own people's keep, not their overlord's)
            if (kind === "rise") {
                if (post.owner !== player.realm) {
                    return refuse("stranger");
                }

                if (!this.war.rise(player.realm, { weight: COUNSEL[rank] })) {
                    return refuse("unready");
                }

                this.#event("counsel", { id: player.id, advice: { rise: true } });

                return OK;
            }

            if (!this.war.counsel(player.realm, effect.counsel, COUNSEL[rank])) {
                return refuse("counsel");
            }

            this.#event("counsel", { id: player.id, advice: { ...effect.counsel } });

            return OK;
        }

        return refuse("command");
    }

    // A request done and told of: set down, its reward paid (gold, standing: any rank it brings told of)
    #rewarded(player, request) {
        const { standing } = player;
        const { reward } = request;

        standing.close(request.id, "done");
        player.progress.gold += reward.gold;

        // (A tome from the guild's library besides: in the pack, or at their feet if there's no room)
        if (reward.tome) {
            this.#give(player, { id: tomeOf(reward.tome), quality: "common", count: 1 });
        }

        this.#event("request", { id: player.id, change: "done", request: structuredClone(request), reward: { ...reward } });

        for (const up of standing.gain(reward.standing)) {
            this.#event("standing", { id: player.id, ...up });
        }

        // (Done for their own people while they serve another, or from a guild's board: their people stirred)
        const own = this.war?.town(request.from.town)?.owner === player.realm;

        this.#stir(player, request.from.post === "guild" ? STIR.contract : !own ? 0 : request.kind === "tithe" ? STIR.tithe : STIR.request);

        return structuredClone(request);
    }

    // Something given to a player: into their pack, or, with no room there, at their feet (for
    // them alone, as spoils are)
    #give(player, item) {
        const actor = this.battle.actor(player.id);

        if (player.progress.stow(item, item.count) || !actor) {
            return;
        }

        const ground = `ground-${this.nextGround++}`;

        this.ground.set(ground, { id: ground, bundle: { gold: 0, items: [item] }, for: player.id, map: actor.map, square: [...actor.square], until: this.battle.time + GROUND_MS });
        this.#event("spoils", { id: player.id, ground, from: player.id, given: true });
    }

    // A player's people, serving another or fallen, stirred towards rising (M10) by what they've done
    #stir(player, amount) {
        if (!this.war?.oppressor(player.realm) || !(amount > 0)) {
            return;
        }

        const unrest = this.war.stir(player.realm, amount);

        this.#event("unrest", { id: player.id, realm: player.realm, unrest, amount });
    }

    // What the war's turns mean for each player's people (M10): won (honoured), brought under
    // another, fallen, risen again, or their rule undone; restless enough to rise
    #fate(event) {
        const war = this.war;

        for (const player of this.players.values()) {
            const mine = event.realm === player.realm;
            const fate =
                event.type === "victory"
                    ? mine
                        ? "victory"
                        : war.liege(player.realm) === event.realm
                          ? "serving"
                          : "defeat"
                    : !mine
                      ? null
                      : { subjugated: "subjugated", fallen: "fallen", rebelled: "risen", risen: "risen", undone: "undone", restless: "restless" }[event.type];

            if (!fate) {
                continue;
            }

            this.#event("fate", { id: player.id, fate, realm: player.realm, by: event.by ?? event.against ?? event.from ?? event.realm, town: event.town ?? null });

            // (Their people's victory: honours for them)
            if (fate === "victory") {
                for (const up of player.standing.gain(HONOURS)) {
                    this.#event("standing", { id: player.id, ...up });
                }
            }
        }
    }

    // A request given up: a little standing lost
    #abandon(player, id) {
        const request = player.standing.close(id, "abandoned");

        if (!request) {
            return refuse("request");
        }

        player.standing.gain(-FAILED);
        this.#event("request", { id: player.id, change: "abandoned", request: structuredClone(request) });

        return OK;
    }

    // A foe a player's brought down, for the requests they carry: an enemy's soldier, or one of the
    // wild. One of their oppressors' soldiers stirs their people (M10)
    #felled(player, fallen) {
        if (fallen.kind === "soldier" && this.war?.oppressor(player.realm) && this.war.liege(fallen.team) === this.war.oppressor(player.realm)) {
            this.#stir(player, STIR.soldier);
        }

        for (const request of [...player.standing.requests]) {
            if (request.state !== "open") {
                continue;
            }

            const counts =
                request.kind === "bounty" || request.kind === "hunt"
                    ? fallen.kind === "soldier" && this.war?.liege(fallen.team) === request.target.realm
                    : (request.kind === "wild" || request.kind === "beasts") && !fallen.neutral && fallen.kind !== "soldier" && fallen.kind !== "player" && !this.war?.realm(fallen.team);

            if (counts) {
                request.count += 1;
                this.#settle(player, request, request.count >= request.target.need ? "ready" : "count");
            }
        }
    }

    // How the players' requests stand, as the war goes on and they go about the world: run out
    // of time; seen what they were to scout; there when their town needed holding (and it held);
    // come to nothing (their target gone, or gone over to their own)
    #watchRequests() {
        const war = this.war;

        if (!war) {
            return;
        }

        for (const player of this.players.values()) {
            const at = this.#whereIs(player);

            for (const request of [...player.standing.requests]) {
                const change = this.#check(player, request, at);

                if (change) {
                    this.#settle(player, request, change);
                }
            }
        }
    }

    #check(player, request, at) {
        const war = this.war;
        const liege = war.liege(player.realm);

        if (request.until !== null && war.turn > request.until) {
            return "failed";
        }

        if (request.state === "done") {
            return null;
        }

        // (How near a place a player is: from a town's middle, less its reach)
        const near = (point, reach) => Boolean(at && point) && Math.hypot(at[0] - point[0], at[1] - point[1]) <= reach;
        const townAt = (town) => {
            const place = this.#placeOf(town.id);

            return { middle: place ? this.#middleOf(place) : town.at, radius: SETTLEMENT_KINDS[place?.kind]?.radius ?? 0 };
        };

        switch (request.kind) {
            case "message": {
                const to = war.town(request.target.town);

                return to && war.liege(to.owner) === liege ? null : "void";
            }
            case "scout": {
                if (request.target.force) {
                    const force = war.force(request.target.force);

                    return !force ? "void" : near(force.at, REQUEST_REACH.scout) ? "ready" : null;
                }

                const town = war.town(request.target.town);

                if (!town || !war.hostile(liege, war.liege(town.owner))) {
                    return "void";
                }

                const { middle, radius } = townAt(town);

                return near(middle, radius + REQUEST_REACH.scout) ? "ready" : null;
            }
            case "defend": {
                const town = war.town(request.target.town);

                if (!town || war.liege(town.owner) !== liege) {
                    return "failed";
                }

                const { middle, radius } = townAt(town);

                if (!request.there && near(middle, radius + REQUEST_REACH.defend)) {
                    request.there = true;
                    this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                }

                return war.force(request.target.camp) ? null : request.there ? "ready" : "void";
            }
            case "rout":
            case "camp": {
                const camp = war.force(request.target.force);

                if (camp && !request.there && near(camp.at, REQUEST_REACH.rout)) {
                    request.there = true;
                    this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                }

                if (camp) {
                    return null;
                }

                // (Gone: broken, or gone home; or it took the town, and the request's failed)
                return war.town(request.target.town)?.owner === request.target.realm ? "failed" : request.there ? "ready" : "void";
            }
            case "escort":
            case "waylay": {
                const envoy = war.force(request.target.force);

                if (envoy) {
                    if (request.kind === "escort" && !request.there && near(envoy.at, REQUEST_REACH.escort)) {
                        request.there = true;
                        this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                    }

                    return null;
                }

                // (Gone: heard at the end of the road, or waylaid on it, and by whom)
                const end = war.log.findLast(({ force }) => force === request.target.force);

                if (request.kind === "escort") {
                    return end?.type === "treaty" ? (request.there ? "ready" : "void") : "failed";
                }

                return end?.type === "waylaid" && end.by && war.liege(end.by) === liege ? "ready" : end?.type === "waylaid" ? "void" : "failed";
            }
            default:
                return null;
        }
    }

    // A request moved on: counted, done (to be told of), failed (standing lost) or come to nothing
    #settle(player, request, change) {
        if (change === "ready") {
            request.state = "done";
        } else if (change === "failed" || change === "void") {
            player.standing.close(request.id, change);

            if (change === "failed") {
                player.standing.gain(-FAILED);
            }
        }

        this.#event("request", { id: player.id, change, request: structuredClone(request) });
    }

    // --- The buildings near the players ---

    // The buildings near a player out in the world (or one a player's heading into) got ready to
    // go into; those far from every player let go (their plans are kept)
    #lookAround() {
        const interiors = this.world.interiors;

        if (!interiors) {
            return;
        }

        // Where each player is in the world: out in it, or in a building (as if at its door); and
        // the buildings they're in, or heading into (kept ready whatever)
        const places = [];
        const wanted = new Set();

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor) {
                continue;
            }

            if (actor.map === "town") {
                places.push({ x: actor.x, y: actor.y, out: true });
            } else {
                const building = interiors.of(actor.map);
                const door = building?.entrance?.door ?? this.world.tavern?.door;

                places.push(door ? { x: door.x, y: door.z, out: false } : null);
                wanted.add(building?.key);
            }

            if (actor.order?.type === "enter") {
                wanted.add(this.battle.links.find(({ id }) => id === actor.order.link)?.building);
            }
        }

        // (The settlements round each player laid out by the world itself, and its buildings
        // looked over in the order of their keys: so what's got ready, and when, doesn't hang on
        // what any game's drawn of the world, and every copy of it (docs/WAR.md M11) gets the same)
        const settlements = this.world.maps?.town?.settlements;

        if (settlements) {
            for (const place of places) {
                if (place?.out) {
                    const [cx, cy] = [Math.floor(place.x / CHUNK), Math.floor(place.y / CHUNK)];

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            settlements.settle(cx + dx, cy + dy);
                        }
                    }
                }
            }
        }

        for (const building of [...interiors.buildings.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
            if (!building.entrance) {
                continue;
            }

            const { x, z } = building.entrance.door;
            const near = wanted.has(building.key) || places.some((place) => place?.out && Math.hypot(x - place.x, z - place.y) < RELEVANCE.near);
            const far = !wanted.has(building.key) && places.every((place) => place && Math.hypot(x - place.x, z - place.y) > RELEVANCE.far);

            if (!this.open.has(building.key) && near) {
                this.#openBuilding(building.key);
            } else if (this.open.has(building.key) && far) {
                this.#closeBuilding(building.key);
            }
        }
    }

    // A building (by key), added to the world's if it's in a settlement not laid out yet
    #building(key) {
        const interiors = this.world.interiors;

        if (!interiors) {
            return null;
        }

        if (!interiors.buildings.has(key)) {
            const place = this.world.plan?.places.find(({ id }) => id === key.slice(0, key.indexOf(":")));

            if (place) {
                this.world.maps?.town?.settlements?.of(place);
            }
        }

        return interiors.buildings.get(key) ?? null;
    }

    // Get a building ready to go into: its floors and folk made (once), and its folk about their
    // business inside
    #openBuilding(key) {
        const building = this.#building(key);

        if (!building?.entrance || this.open.has(key)) {
            return;
        }

        this.world.interiors.make(key);
        this.#enthrone(building);

        const folk = building.folk.filter((one) => this.#addFolk(one)).map(({ id }) => id);

        this.open.set(key, folk);
        this.#event("open", { key, folk });
    }

    // Who sits on a keep's throne, as the war has it: the ruler of the people who hold it, if
    // it's their seat (their name, and their title: "Queen"); else a governor for them (one of
    // them, whoever's town it was)
    #enthrone(building) {
        const one = building.kind === "keep" ? building.folk.find(({ role }) => role === "ruler") : null;
        const town = one && this.war?.town(building.place === "home" ? this.world.start?.id : building.place);

        if (!town) {
            return;
        }

        const realm = this.war.realm(town.owner);

        one.born ??= { name: one.name, sex: one.sex, people: one.people };

        if (realm?.seat === town.id) {
            Object.assign(one, { name: realm.leader.name, title: realm.leader.title, sex: realm.leader.woman ? "f" : "m", people: realm.race ?? town.owner });
        } else {
            Object.assign(one, { name: one.born.name, title: `Governor of ${town.name}`, sex: one.born.sex, people: realm?.race ?? town.owner ?? one.born.people });
        }
    }

    // Let a building go: its folk out of the battle (its plans are kept, and anyone can still go
    // in: its folk come back when it's got ready again)
    #closeBuilding(key) {
        const folk = this.open.get(key);

        this.open.delete(key);

        for (const id of folk) {
            this.battle.remove(id);
            this.folk.delete(id);
        }

        this.#event("close", { key, folk });
    }

    // One of the folk, going about their business in the battle (no one fights them)
    #addFolk(one) {
        if (this.battle.actor(one.id) || this.hired.has(one.id)) {
            return false;
        }

        this.folk.set(one.id, one);
        this.battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing });

        return true;
    }

    #event(type, details) {
        this.events.push({ type, time: this.battle.time, ...details });
    }
}
