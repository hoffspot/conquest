// Playing together (docs/WAR.md M11): a world opened to others by its host, and joined.
//
// The host's game is the world's one authority (core/host.js). Everything done to its world it
// records as it's done (host.recorder): each step it's moved on, each command a player gives, each
// player come or gone. One who joins is sent the world as it is (a snapshot), then all that's
// recorded after, and plays it again on their own copy of the world, step for step; which comes
// out the same, the engine being made so (core/random.js). Their own commands go to the host, and
// come back among the rest: what came of them is what came of them on their copy.
//
// Now and then the host says how the world should stand (Host.checksum). A copy that doesn't
// (a browser whose sums come out a hair different from the host's) asks for the world again, and
// carries on from it (Host.adopt). So does one whose link to the host dropped a moment and came
// back (what was sent meanwhile lost): the host's own link back, it sends everyone the world again.
//
// When the host can't move its world on (its page hidden: a phone's gone to another app), it says
// so, and those who've joined are shown why nothing's happening.
//
// Every few steps the host also sends where its characters near the players stand (core/motion.js):
// a copy plays the same steps and compares, and one that's gone astray knows it at once. Each of
// the host's sendings carries its step: a joined game keeps a few steps in hand behind it (more,
// the less evenly they come), playing a little slower or faster to keep them, so that it doesn't
// stop and start (Joining.pace). One that's fallen too far behind to catch up step by step (its
// page hidden a while, or a slow phone in a long fight) doesn't: it asks for the world as it now
// is, as one gone astray does, and plays on from that (PACE.tooFar). And it times how long a word
// takes to go to the host and back (ping, pong), for the debug overlay.
//
// The ways its characters find over the navigation meshes (core/battle.js) are recorded too, as
// the host found them, and taken by a joined copy rather than found again: what each copy has of
// the meshes (made as each has needed them) doesn't matter.
//
// A player who's given no command for a long while is sent out of it (core/host.js AFK: their
// copy, and everyone's, knows it at the same step; the host sends them out, and that's recorded
// as any leaving is: Hosting.kick).
//
// What's said in a party (party chat) isn't done to the world, and isn't for everyone in it: a
// line goes to the host, which sends it on to those in the sayer's party alone (Hosting.chat),
// so no one else's game ever has it. A direct message goes to one player and back to the sayer
// alone: a party one to someone in the sayer's party, a world one to anyone else; each player says
// which kinds they take (DMS_TAKEN, their "dms"), and one they don't is never sent, the sayer told
// so. Whom a player's blocked is theirs alone: their game lets go of a blocked player's messages
// as they come, and the host never knows.
//
// What's said, as text (core/wire.js), whichever way it goes (app/relay.js carries it):
//
//   joiner -> host   { kind: "hello", version, character, hero }   (character: who they are
//                                                    and what they carry, { hero, progress },
//                                                    as Host.join takes them: the world they
//                                                    come into keeps the rest of them; hero, on
//                                                    the world server: which of the player's
//                                                    kept heroes, a slot, "new", or "copy":
//                                                    the character copied in)
//                    { kind: "ready" }                         (its copy of the world made: playing)
//                    { kind: "away", hidden }                  (its page hidden, or shown again)
//                    { kind: "hold", held, everyone }          (its player's menu open, or shut: on a
//                                                    world server the world stopped for its one
//                                                    player; everyone: Pause for everyone, an
//                                                    owner's, the world stopped for all)
//                    { kind: "command", seq, command }
//                    { kind: "again" }                         (gone astray: the world again)
//                    { kind: "ping", t, rtt }                  (t: the joiner's clock, ms; rtt: how long
//                                                    a word to the host and back's taken it lately,
//                                                    ms, once it's timed one: Joining lately; the
//                                                    host's, to show)
//                    { kind: "chat", text, to }                (a line to their party; or, `to` a
//                                                    player's id, a direct message to them)
//                    { kind: "dms", party, world }             (which direct messages they take: from
//                                                    their party, from anyone else in the world)
//                    { kind: "own", own }                      (what its game keeps of its hero that
//                                                    isn't the world's, as it's changed: any of
//                                                    core/host.js OWN, kept with them)
//   host -> joiner   { kind: "welcome", version, id, seed, race, snapshot, took, paused }
//                                                    (took: their character was in the world
//                                                    already, on another link: theirs now;
//                                                    paused: { why, by } if the world's stopped;
//                                                    snapshot: with their own of their hero,
//                                                    no one else's: core/host.js OWN)
//                    { kind: "ops", step, ops }                (what's been done, in order, up to step)
//                    { kind: "motion", step, units }           (base64: core/motion.js)
//                    { kind: "pong", t, step }
//                    { kind: "state", snapshot, paused }       (the world again, and whether it's stopped)
//                    { kind: "paused", paused, why, by }       (the host's world stopped, why (PAUSES),
//                                                    and by whom; or going again)
//                    { kind: "refused", reason }
//                    { kind: "chat", from, name, text, to, toName, dm }
//                                                    (a line said in their party; or a direct
//                                                    message, to them or theirs heard back: `dm`
//                                                    "party" or "world", `to` whom it went to)
//                    { kind: "unsaid", reason, name }          (one of theirs not said: CHAT_REFUSED;
//                                                    `name`, whose direct messages are closed)
//                    { kind: "kicked", reason }                (sent out of the world: "afk", away too long;
//                                                    "elsewhere", their character taken over on
//                                                    another link: Hosting #takeOver)
//
// Pure: no DOM, no network. Hosting and Joining are given how to send, and told what's heard.

import { STEP_MS } from "./battle.js";
import { isGuid } from "./guid.js";
import { HIRES, HOST_PLAYER, OWN, ROLL_MOST } from "./host.js";
import { BANES, MENDING, MERCENARY, pickOf, RENOWN, wearable } from "./followers.js";
import { levelOf } from "./gear.js";
import { QUALITIES, thingOf } from "./progress.js";
import { compareMotion, MOTION, packMotion, unpackMotion } from "./motion.js";
import { selfOf } from "./selfstate.js";
import { STARTING_WEAPONS } from "./weapons.js";
import { decode, encode, fromBase64, toBase64 } from "./wire.js";
import { RACE, startFor } from "./worldplan/plan.js";
import { CREATURES, TIERS } from "./creatures.js";
import { WARY } from "./wary.js";

/** Bumped whenever what's said changes: a game of another version can't join. */
export const NET_VERSION = 193;

/** How many steps the host plays between telling how the world should stand. */
export const CHECK_EVERY = 100;

/** The most players in a world (its host too). */
export const MOST_PLAYERS = 8;

/**
 * How far behind the host a joined game lets itself get (steps waiting to be played) before it
 * plays faster to catch up, how many more steps it plays in a frame at most, catching up, and
 * for how long (ms of the frame: on a slow phone, fewer steps a frame, so that catching up
 * doesn't make the frame so long it falls further behind). And how far behind is too far to
 * catch up step by step (5 s of the host's): the world as it now is asked for instead, and none
 * of those steps played. (A step with a fight in it takes some 2 ms on a desktop and 10 on a
 * phone, playing one more a frame at most; the world again, some 120 KB and 20 ms to take in on a
 * desktop, 100 on a phone. So a phone 5 s behind would be fast-forwarding for 2 or 3 s more.)
 */
export const PACE = Object.freeze({ behind: 6, catchUp: 40, catchUpMs: 8, tooFar: 100 });

/**
 * A joined player's own hero told them (Hosting #selves) every `every` flushes while they're not
 * as they were (at once once a command of theirs is done), and every `again` ms anyway.
 */
export const SELF = Object.freeze({ every: 2, again: 1000 });

/**
 * A joined player not heard from for `ms` of the world's time (their game asks how long a word
 * takes every second, so a link that's well is never so quiet: theirs has dropped, their page has
 * gone, or their phone's been put away) is stopped where they stand, whatever they were told, so
 * their hero isn't carried on by a stick no one's holding or a tap they can't take back. Their
 * place is kept as before, to come back to.
 */
export const QUIET = Object.freeze({ ms: 4000 });

/**
 * Why a world's stopped, as those in it are told (Hosting.pause). Its host stopped it for everyone
 * ("host": Pause for everyone, from the menu; on a world server, one of its owners, `by` them,
 * till they let it go or their link drops). The host's page is hidden, so its world, on that
 * device, can't move on ("away"). A world server's one player has left it a while ("alone": their
 * page hidden, or their menu open). Or no one's game in a world server's world is ready yet
 * ("waiting"). Nothing else stops a world anyone else is in.
 */
export const PAUSES = Object.freeze(["host", "away", "alone", "waiting"]);

// Why the host's world is stopped, as it said (`said`: { why, by }), or null if it isn't
const pausedOf = (said) => (said ? { why: PAUSES.includes(said.why) ? said.why : null, by: typeof said.by === "string" ? said.by : null } : null);

/**
 * How many of the host's steps a joined game keeps in hand (the delay), made for a phone's link
 * (a mobile network's, the least even): each sending of the host's is timed as it comes, how much
 * later its first step comes than the quickest of the last `window` ms (ms, `late` at most: the
 * link dropped a moment), and the delay covers all but the latest `spare` of those of the last
 * `remember` ms: at least `least` steps, `most` at most. So a link that's held up often enough
 * keeps more in hand, till it's been steady a while. And how it keeps them: playing up to
 * `slower` slower or `faster` faster, `gain` for each step too few or too many, as it's had them
 * in hand over the last `settle` ms (slower sooner than faster: running out stops everyone,
 * having a few too many only shows them a little later).
 */
/**
 * How many of a joined game's latest round trips to the host its link's told by (Joining `lately`:
 * the middle one), so one held up by the page itself (busy, as the world's built) doesn't count.
 */
export const LATELY = 5;

export const PLAYOUT = Object.freeze({ least: 2, most: 8, window: 2000, remember: 20000, spare: 0.1, late: 1000, slower: 0.1, faster: 0.05, gain: 0.05, settle: 1000 });

/** Why a game can't join: shown to its player (a version's own words: versionWords). */
export const NET_REFUSALS = Object.freeze({
    version: "That world's being played in another version of the game.",
    full: "That world's full.",
    character: "Your character couldn't be brought into that world.",
    copied: "That character's been copied into this world already: play their copy there, or bring another.",
    here: "You're in that world already, on another device.",
});

/**
 * What a player's told when a world or a world server plays another version of the game than
 * theirs: which is the newer (by `other`, its NET_VERSION, where it's said: a refusal or a
 * listing from one made before it said can't tell), and what they can do about it. `server`: a
 * world server, whose own page always serves its version of the game, and whose owner updates it;
 * otherwise a player's own world, whose host reloads theirs.
 */
export function versionWords(other, { server = false } = {}) {
    const what = server ? "That server" : "That world";

    if (Number.isInteger(other) && other < NET_VERSION) {
        return `${what} plays an older version of the game than yours. ${server ? "Open the game from the server itself (it always matches), or ask its owner to update it." : "Ask whoever's hosting it to reload their game for the newest version."}`;
    }

    if (Number.isInteger(other) && other > NET_VERSION) {
        return `${what} plays a newer version of the game than yours. Reload this page for the newest version${server ? ", or open the game from the server itself (it always matches)" : ""}.`;
    }

    return `${what} plays another version of the game than yours. ${server ? "Open the game from the server itself: it always matches." : "Reload this page, and ask whoever's hosting it to reload theirs, for the newest version."}`;
}

/** The same in a few words, for a list: which is the newer, and (if it's this game that's older) to reload. */
export function versionShort(other) {
    if (Number.isInteger(other) && other < NET_VERSION) {
        return "An older version of the game";
    }

    return Number.isInteger(other) && other > NET_VERSION ? "A newer version of the game: reload this page" : "Another version of the game";
}

/** Why a player was sent out of a world (Hosting.kick), as they're told it. */
export const NET_KICKS = Object.freeze({
    afk: "Disconnected for being away.",
    elsewhere: "You went into this world on another device, so this one has let go.",
});

/**
 * Party chat: the longest line (characters), how many lines one player can say in a while (`burst`
 * in `burstMs` of the world's time: more is held back), and how many lines a game keeps to show.
 */
export const CHAT = Object.freeze({ most: 200, burst: 5, burstMs: 10000, kept: 50 });

/**
 * Why a line wasn't said (as host.js REFUSALS names them): nothing to say, in no party, too many too
 * quickly; a direct message to no one in the world, or to one not taking that kind ("closed").
 */
export const CHAT_REFUSED = Object.freeze(["empty", "unpartied", "chatty", "nobody", "closed"]);

/** Which direct messages a player takes till they say otherwise: from their party, and from anyone else in the world. */
export const DMS_TAKEN = Object.freeze({ party: true, world: true });

/**
 * A line as it's said: whatever's not to be seen (control characters) and runs of spaces made one
 * space, trimmed, and CHAT.most characters at most (whole characters: an emoji's never halved).
 * Nothing to say: "".
 */
export function chatLine(text) {
    if (typeof text !== "string") {
        return "";
    }

    return [...text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()].slice(0, CHAT.most).join("").trim();
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A whole number from 0 to `most` (anything else, 0)
const whole = (value, most) => (Number.isInteger(value) && value >= 0 ? Math.min(value, most) : 0);

/**
 * A hired adventurer as a character brings them (core/host.js characterOf's followers: who they
 * are, and what they've grown into: docs/WAR.md *Mercenaries that grow*), made safe to bring in:
 * their level, experience, wounds and record kept only as they could be (core/followers.js), what
 * they wear only if they could wear it (wearable), what's wrong left off. One whose calling the
 * game hasn't (host.js HIRES), or with no name, null.
 */
export function followerFrom(one) {
    if (!isObject(one) || typeof one.name !== "string" || !one.name.trim() || !HIRES[one.calling]) {
        return null;
    }

    const level = Number.isInteger(one.level) ? Math.max(1, Math.min(MERCENARY.most, one.level)) : 1;
    const record = isObject(one.record) ? one.record : {};
    const piece = (item, slot) => (isObject(item) && typeof item.id === "string" && (item.quality === undefined || QUALITIES[item.quality]) && !wearable({ ...item, level: levelOf(item.level) }, { weapon: HIRES[one.calling].weapon, level }) && (slot === "mainHand") === (item.id === HIRES[one.calling].weapon) ? thingOf(item) : null);
    const best = isObject(record.best) && typeof record.best.name === "string" && Number.isFinite(record.best.power) ? { name: record.best.name.slice(0, 40), power: Math.max(0, Math.min(100, Math.round(record.best.power))) } : null;
    const banes = new Set(Object.values(BANES));

    return {
        name: one.name.trim().slice(0, 40),
        calling: one.calling,
        sex: one.sex === "f" ? "f" : "m",
        seed: Number.isInteger(one.seed) ? one.seed : 1,
        people: RACE[one.people] ? one.people : "human",
        from: typeof one.from === "string" ? one.from.slice(0, 120) : null,
        level,
        xp: whole(one.xp, 10_000_000),
        wounds: whole(one.wounds, MENDING.most - 1),
        owed: whole(one.owed, 9999),
        gear: { mainHand: piece(one.gear?.mainHand, "mainHand"), body: piece(one.gear?.body, "body") },
        record: {
            kills: whole(record.kills, 10_000_000),
            damage: whole(record.damage, 1_000_000_000),
            falls: whole(record.falls, 10_000_000),
            rises: whole(record.rises, 10_000_000),
            together: whole(record.together, 10_000_000),
            earned: whole(record.earned, 1_000_000_000),
            best,
            slain: Object.fromEntries(Object.entries(isObject(record.slain) ? record.slain : {}).filter(([bane, count]) => banes.has(bane) && Number.isInteger(count) && count > 0).map(([bane, count]) => [bane, Math.min(count, 10_000_000)])),
            nemesis: CREATURES[record.nemesis] ? record.nemesis : null,
        },
        called: typeof one.called === "string" && one.called.trim() ? one.called.trim().slice(0, 20) : null,
        picks: Array.isArray(one.picks) ? [...new Set(one.picks.filter((pick) => typeof pick === "string" && pickOf(pick)))].slice(0, 3) : [],
        renowned: typeof one.renowned === "string" && RENOWN.traits[one.renowned] ? one.renowned : null,
        ...(one.away === true ? { away: true } : {}),
    };
}

/**
 * A character's roll of the hired adventurers who've parted from them (core/host.js #rollCall),
 * made safe to bring in: [{ name, calling, level, byname, gone, kills, day }], ROLL_MOST at most.
 */
export function rollFrom(roll) {
    return (Array.isArray(roll) ? roll : [])
        .filter((one) => isObject(one) && typeof one.name === "string" && HIRES[one.calling] && ["fallen", "dismissed"].includes(one.gone))
        .slice(0, ROLL_MOST)
        .map((one) => ({ name: one.name.slice(0, 40), calling: one.calling, level: Number.isInteger(one.level) ? Math.max(1, Math.min(MERCENARY.most, one.level)) : 1, byname: typeof one.byname === "string" ? one.byname.slice(0, 40) : null, gone: one.gone, kills: whole(one.kills, 10_000_000), day: whole(one.day, 1_000_000) }));
}

/**
 * A character as one who's joining brings it (as Host.join takes it: { hero, talks, explored,
 * progress, standing, followers }), made safe to bring in: or null if it isn't one. Their hero's
 * own id and whose copy they are (`guid`, `origin`: core/guid.js) kept only if they're ids.
 */
export function characterFrom(character) {
    const hero = character?.hero;

    if (!isObject(hero) || typeof hero.name !== "string" || !hero.name.trim() || !isObject(hero.shape) || !isObject(hero.look) || !STARTING_WEAPONS.includes(hero.weapon)) {
        return null;
    }

    const race = RACE[hero.race] ? hero.race : "human";
    const talks = isObject(character.talks) ? character.talks : {};
    const brought = Array.isArray(character.followers) ? character.followers.filter(isObject) : [];
    // (Their hired followers, and a beast they've tamed, one: core/wary.js)
    const tamed = brought.find((one) => one.tamed === true && WARY[one.creature]?.tames && Number.isInteger(one.tier) && one.tier >= 1 && one.tier <= TIERS);
    const followers = [
        ...brought.map(followerFrom).filter(Boolean).slice(0, 8),
        ...(tamed ? [{ tamed: true, creature: tamed.creature, tier: tamed.tier, name: typeof tamed.name === "string" && tamed.name.trim() ? tamed.name.trim().slice(0, 20) : CREATURES[tamed.creature].name }] : []),
    ];

    const kept = { ...structuredClone(hero), name: hero.name.trim().slice(0, 20).trim(), race, parts: Array.isArray(hero.parts) ? hero.parts.filter((part) => typeof part === "string").slice(0, 4) : [] };

    // (Their own id, and whose copy they are, only if they're ids: core/guid.js)
    for (const key of ["guid", "origin"]) {
        if (!isGuid(kept[key])) {
            delete kept[key];
        }
    }

    return {
        hero: kept,
        talks: { memory: isObject(talks.memory) ? structuredClone(talks.memory) : {}, knowledge: Array.isArray(talks.knowledge) ? talks.knowledge.filter((each) => typeof each === "string") : [] },
        explored: {},
        progress: isObject(character.progress) ? structuredClone(character.progress) : {},
        standing: isObject(character.standing) ? structuredClone(character.standing) : {},
        followers: structuredClone(followers),
        roll: rollFrom(character.roll),
    };
}

/**
 * Where a player of a people comes into a world (as Host.join takes it: { square, map }): by the
 * world's start if it's their people's (the host's), else by the town their people's players
 * start in, out in the world.
 */
export function spawnFor(world, race) {
    if (!world.plan || !RACE[race] || race === world.start?.race) {
        return {};
    }

    const { at } = startFor(world.plan, race);

    return { square: [Math.round(at[0]), Math.round(at[1])], map: "town" };
}

/**
 * A world opened to others, by its host: those who join brought in and kept up with what's done.
 * The game playing it calls `hear` with what's come from each (by their `peer`: the relay's), and
 * `gone` when one's left, and `flush` after it's moved the world on; what's to be sent goes by
 * `send(peer, text)`.
 */
export class Hosting {
    constructor(host, { send }) {
        this.host = host;
        this.send = send;

        /** Those who've joined (by peer): their player's id in the world. */
        this.players = new Map();

        /** How long a word to each who's joined and back takes, as they've said (by peer: ms, their pings'). */
        this.rtts = new Map();

        /** The last of each one's commands done (by peer: its seq), told them with their hero (#selves). */
        this.done = new Map();

        /** What each was last told of their hero (by peer: { seq, hero (as sent), time }: #selves). */
        this.toldSelf = new Map();

        /**
         * When each was last heard from (by peer: the world's time), and those stopped for being
         * quiet since (#quiet).
         */
        this.heardAt = new Map();
        this.quieted = new Set();

        /** What's been done since it was last sent, and whether it's time to say how the world stands. */
        this.ops = [];
        this.steps = 0;
        this.checkDue = false;
        this.motionDue = false;
        this.seq = null;
        this.nextGuest = 1;

        /** What's been sent (characters of text, to everyone together), by kind. */
        this.sent = {};

        /** Whether the host's world is stopped, and why ({ why: PAUSES, by }), as those who've joined have been told; or null. */
        this.paused = null;

        /** Told when a player comes (id, peer) or goes (id, peer, their character as it's to be kept). */
        this.onJoin = () => {};
        this.onLeave = () => {};

        /** Told when one's sent out (peer, and why: "afk", "elsewhere"), once they've been told why: to close their link. */
        this.onKick = () => {};

        /** The most players in the world at once (on the world server: its owner's setting). */
        this.most = MOST_PLAYERS;

        /**
         * The id each who joins plays under (peer): a guest's, unless whoever runs it says
         * otherwise (the world server: the player its tickets know, and which of their heroes).
         */
        this.idOf = () => `guest-${this.nextGuest++}`;

        /**
         * Whether one joining is known by the character they bring (a player's own world, each who
         * joins a new guest), the same character coming in again on another link taking theirs
         * over (#takeOver); or not (the world server's, false: known by the player its tickets
         * know, idOf, theirs taken over only under the same id: never another player's by a copy
         * of their character).
         */
        this.byCharacter = true;

        /**
         * The character each who joins brings into the world (peer, and the character they sent:
         * as Host.join takes it), made safe (characterFrom); or null if it can't come in. Unless
         * whoever runs it says otherwise (the world server: a hero it keeps, where they left it,
         * as they were).
         */
        this.characterOf = (_peer, character) => characterFrom(character);

        /**
         * Told when one who's joined has made their copy of the world and is playing (peer); when
         * their page is hidden or shown again (peer, hidden); and when their menu's opened or shut
         * (peer, held, and everyone: Pause for everyone), as they say.
         */
        this.onReady = () => {};
        this.onAway = () => {};
        this.onHold = () => {};

        /**
         * The part each who joins plays in the world (peer: core/host.js PLAYER_ROLES): a player,
         * unless whoever runs it says otherwise (the world server, by the key they came with).
         */
        this.roleOf = () => "player";

        /**
         * Told each line said in the host's own player's party, and each direct message to them or
         * theirs: { from, name, text, to, toName, dm }.
         */
        this.onChat = () => {};

        // When each player's lines were said lately (the world's time), to hold back one who says too much
        this.said = new Map();

        // Which direct messages each player takes, as they've said (DMS_TAKEN till they have)
        this.dms = new Map();

        host.recorder = (op) => this.#record(op);
    }

    #record(op) {
        // (A joined player's command: which of theirs it was, so they hear what came of it)
        if (op[0] === "c" && this.seq !== null) {
            op.push(this.seq);
        }

        const last = this.ops.at(-1);

        if (op[0] === "a" && last?.[0] === "a" && last[1] === op[1]) {
            last[2] = (last[2] ?? 1) + 1;
        } else {
            this.ops.push(op);
        }

        if (op[0] === "a") {
            this.steps++;
            this.checkDue ||= this.steps % CHECK_EVERY === 0;
            this.motionDue ||= this.steps % MOTION.every === 0;
        }
    }

    // The host's step, as its sendings carry it
    #step() {
        return Math.floor(this.host.battle.time / STEP_MS);
    }

    #send(peer, kind, text) {
        this.sent[kind] = (this.sent[kind] ?? 0) + text.length;
        this.send(peer, text);
    }

    #sendAll(kind, text) {
        for (const peer of this.players.keys()) {
            this.#send(peer, kind, text);
        }
    }

    /**
     * Send what's been done to everyone who's joined; and, now and then, how the world should
     * stand, and where those near the players are (after what's been done: compared there).
     */
    flush() {
        this.#quiet();

        if (this.checkDue) {
            this.ops.push(["k", this.host.checksum()]);
            this.checkDue = false;
        }

        const step = this.#step();

        if (this.ops.length) {
            const text = encode({ kind: "ops", step, ops: this.ops });

            this.ops = [];
            this.#sendAll("ops", text);
        }

        if (this.motionDue) {
            this.motionDue = false;

            if (this.players.size) {
                this.#sendAll("motion", encode({ kind: "motion", step, units: toBase64(packMotion(this.host)) }));
            }
        }

        this.#selves(step);
    }

    // Each who's joined not heard from for QUIET.ms stopped where they stand (once, till they're
    // heard from again), if they were going anywhere or after anyone: as a command of theirs, so
    // every copy stops them in the same step
    #quiet() {
        const now = this.host.battle.time;

        for (const [peer, id] of this.players) {
            const actor = this.host.battle.actor(id);

            if (!this.heardAt.has(peer)) {
                this.heardAt.set(peer, now);
            }

            if (this.quieted.has(peer) || now - this.heardAt.get(peer) < QUIET.ms || !actor || actor.dead || !actor.order) {
                continue;
            }

            this.quieted.add(peer);
            this.host.command(id, { type: "stop" });
        }
    }

    // Each who's joined told where their own hero is now, as the host has them, and the last of
    // their commands done (core/selfstate.js): their game looks ahead from it (app/forecast.js).
    // At once, a command of theirs having been done since; else every SELF.every flushes, if
    // they're not as they were, or every SELF.again ms anyway
    #selves(step) {
        for (const [peer, id] of this.players) {
            const actor = this.host.battle.actor(id);

            if (!actor) {
                continue;
            }

            const seq = this.done.get(peer) ?? 0;
            const hero = encode(selfOf(actor));
            const last = this.toldSelf.get(peer);
            const due = !last || seq !== last.seq || this.host.battle.time - last.time >= SELF.again || (step % SELF.every === 0 && hero !== last.hero);

            if (due) {
                this.toldSelf.set(peer, { seq, hero, time: this.host.battle.time });
                this.#send(peer, "self", `{"kind":"self","step":${step},"time":${encode(this.host.battle.time)},"seq":${seq},"hero":${hero}}`);
            }
        }
    }

    /** What one who's joined (or is joining) said. */
    hear(peer, text) {
        let message;

        try {
            message = decode(text);
        } catch {
            return;
        }

        // (Heard from: not quiet)
        this.heardAt.set(peer, this.host.battle.time);
        this.quieted.delete(peer);

        switch (message?.kind) {
            case "hello":
                this.#hello(peer, message);
                break;
            case "command":
                this.#command(peer, message);
                break;
            case "again":
                this.#again(peer);
                break;
            case "ready":
                if (this.players.has(peer)) {
                    this.onReady(peer);
                }

                break;
            case "away":
                if (this.players.has(peer)) {
                    this.onAway(peer, message.hidden === true);
                }

                break;
            case "hold":
                if (this.players.has(peer)) {
                    this.onHold(peer, message.held === true, message.held === true && message.everyone === true);
                }

                break;
            case "ping":
                // (At once: how long a word takes to come and go, not how long till the next flush;
                // and how long it's been taking them, as they say)
                if (this.players.has(peer) && Number.isFinite(message.t)) {
                    this.#send(peer, "pong", encode({ kind: "pong", t: message.t, step: this.#step() }));

                    if (Number.isFinite(message.rtt) && message.rtt >= 0) {
                        this.rtts.set(peer, message.rtt);
                    }
                }

                break;
            case "own":
                // (What their game keeps of their hero, not the world's: kept with them)
                if (this.players.has(peer)) {
                    this.host.own(this.players.get(peer), message.own);
                }

                break;
            case "chat": {
                const id = this.players.get(peer);
                const said = id ? this.#say(id, message.text, typeof message.to === "string" ? message.to : null) : null;

                if (said && !said.ok) {
                    this.#send(peer, "unsaid", encode({ kind: "unsaid", reason: said.reason, ...(said.name ? { name: said.name } : {}) }));
                }

                break;
            }
            case "dms":
                if (this.players.has(peer)) {
                    this.takeDms(this.players.get(peer), message);
                }

                break;
            default:
                break;
        }
    }

    /**
     * A line the host's own player says to their party, sent to those in it alone; or, `to` a
     * player's id, a direct message to them. Returns { ok: true }, or { ok: false, reason, name }
     * (CHAT_REFUSED: nothing to say, in no party, too many lines too quickly, no such player, or
     * one not taking that kind of message: `name`, theirs).
     */
    chat(text, { to = null } = {}) {
        return this.#say(HOST_PLAYER, text, to);
    }

    /** Which direct messages a player takes (`party`, `world`: DMS_TAKEN), as they say (the host's own player's, as the game says). */
    takeDms(id, { party = true, world = true } = {}) {
        this.dms.set(id, { party: party !== false, world: world !== false });
    }

    // A line said by a player to their party: to each in it (the host's own player told here, the
    // others sent it, the sayer too), and to no one else. Or a direct message (`to` a player's
    // id): "party" to one in the sayer's party, "world" to anyone else, to them and back to the
    // sayer alone, if they take that kind (#dms), else the sayer told whose aren't
    #say(id, said, to = null) {
        const text = chatLine(said);
        const party = this.host.partyFor(id);
        const other = to === null ? null : this.host.players.get(to);

        if (!text) {
            return { ok: false, reason: "empty" };
        }

        if (to !== null && (!other || to === id)) {
            return { ok: false, reason: "nobody" };
        }

        const dm = to === null ? null : party && this.host.partyFor(to) === party ? "party" : "world";

        if (dm && !(this.dms.get(to) ?? DMS_TAKEN)[dm]) {
            return { ok: false, reason: "closed", name: other.hero.name };
        }

        if (!dm && !party) {
            return { ok: false, reason: "unpartied" };
        }

        const now = this.host.battle.time;
        const lately = (this.said.get(id) ?? []).filter((at) => at > now - CHAT.burstMs);

        if (lately.length >= CHAT.burst) {
            this.said.set(id, lately);

            return { ok: false, reason: "chatty" };
        }

        this.said.set(id, [...lately, now]);

        const line = { from: id, name: this.host.players.get(id)?.hero.name ?? "", text, ...(dm ? { to, toName: other.hero.name, dm } : {}) };
        const sent = encode({ kind: "chat", ...line });

        for (const member of dm ? [id, to] : party.members) {
            if (member === HOST_PLAYER) {
                this.onChat(line);
            } else {
                const peer = [...this.players].find(([, player]) => player === member)?.[0];

                if (peer !== undefined) {
                    this.#send(peer, "chat", sent);
                }
            }
        }

        return { ok: true };
    }

    // Someone joining, with their character: into the world (by their people's town, if it isn't
    // the host's people's), and sent it as it is
    #hello(peer, { version, character }) {
        if (this.players.has(peer)) {
            return;
        }

        const refuse = (reason, more = {}) => this.#send(peer, "refused", encode({ kind: "refused", reason, ...more }));

        // (With this version, for the joiner to say which is the newer: versionWords. A refusal's
        // words are read by games of every version, so they only ever gain what can be left out)
        if (version !== NET_VERSION) {
            refuse("version", { net: NET_VERSION });

            return;
        }

        // (Or refused saying why, if it can say: a world server's, a character copied in already)
        const brought = this.characterOf(peer, character);

        if (!brought || brought.refused) {
            refuse(NET_REFUSALS[brought?.refused] ? brought.refused : "character");

            return;
        }

        // (The same character in the world already, through another link: another device, or one
        // gone dead without a word, its place still kept: taken over, as they stand. The same
        // player with another, where a player plays one at a time: that one goes, kept as it goes,
        // and this one comes)
        const same = this.#playing(peer, brought);

        if (same) {
            this.#takeOver(peer, same);

            return;
        }

        const id = this.idOf(peer);

        if (this.host.players.has(id)) {
            this.#sendOff(id, "elsewhere");
        } else if (this.host.players.size >= this.most) {
            refuse("full");

            return;
        }

        const { world } = this.host;

        // (What's been done so far, to those already in; then their coming)
        this.flush();
        this.host.join({ id, ...brought, ...spawnFor(world, brought.hero.race), role: this.roleOf(peer) });
        this.flush();
        this.#fresh(peer);
        this.players.set(peer, id);
        this.#send(peer, "welcome", encode({ kind: "welcome", version: NET_VERSION, id, seed: world.seed, race: world.start?.race ?? "human", snapshot: this.#snapshotFor(id), paused: this.paused }));
        this.onJoin(id, peer);
    }

    // The player in the world already whose link one joining (`peer`, with the character they
    // bring, `brought`: made safe, characterFrom) is to take over: where each who joins is known by
    // their character (byCharacter: a player's own world), whichever of those joined plays the same
    // one, by its own id (core/guid.js); else (the world server's) the one under the id they'd play
    // as (idOf: the player's, or their hero's), unless it's plainly another character (both with
    // their own ids, and those differ). Never the host's own player. Or null
    #playing(peer, brought) {
        const guid = brought.hero?.guid;
        const theirs = (player) => this.host.players.get(player)?.hero?.guid;

        if (this.byCharacter) {
            return isGuid(guid) ? ([...this.players.values()].find((player) => player !== HOST_PLAYER && theirs(player) === guid) ?? null) : null;
        }

        const id = this.idOf(peer);

        return id !== HOST_PLAYER && this.host.players.has(id) && !(isGuid(guid) && isGuid(theirs(id)) && theirs(id) !== guid) ? id : null;
    }

    // One joining taking over their character in the world (`id`), from the link they were on
    // (`peer`'s now): that one told why ("elsewhere") and let go of, its link closed by whoever runs
    // it (onKick), its character left as it stands, not gone and come again; and this one sent the
    // world as it is, told it took them over
    #takeOver(peer, id) {
        const old = [...this.players].find(([, player]) => player === id)?.[0];
        const { world } = this.host;

        this.flush();

        if (old !== undefined) {
            this.#send(old, "kicked", encode({ kind: "kicked", reason: "elsewhere" }));
            this.players.delete(old);
            this.rtts.delete(old);
            this.#fresh(old);
            this.onKick(old, "elsewhere");
        }

        this.#fresh(peer);
        this.players.set(peer, id);
        this.#send(peer, "welcome", encode({ kind: "welcome", version: NET_VERSION, id, seed: world.seed, race: world.start?.race ?? "human", snapshot: this.#snapshotFor(id), took: true, paused: this.paused }));
        this.onJoin(id, peer);
    }

    // One in the world sent out for another of the same player's coming in (`reason`): told why,
    // gone as one who leaves is (kept as they go), their link closed by whoever runs it
    #sendOff(id, reason) {
        const peer = [...this.players].find(([, player]) => player === id)?.[0];

        this.flush();

        if (peer === undefined) {
            this.#left(id);

            return;
        }

        this.#send(peer, "kicked", encode({ kind: "kicked", reason }));
        this.gone(peer);
        this.onKick(peer, reason);
    }

    // A joined player's command, done as the host's own are
    #command(peer, { seq, command }) {
        const id = this.players.get(peer);

        if (!id || !Number.isInteger(seq)) {
            return;
        }

        this.seq = seq;

        try {
            this.host.command(id, command);
        } finally {
            this.seq = null;
            this.done.set(peer, seq);
        }
    }

    // One whose world's gone astray: the world again (after all that's been done till now)
    #again(peer) {
        if (!this.players.has(peer)) {
            return;
        }

        this.flush();
        this.#send(peer, "state", encode({ kind: "state", snapshot: this.#snapshotFor(this.players.get(peer)), paused: this.paused }));
    }

    // The world as it is, for one who's joined (by their id: their own of their hero in it, what
    // their game keeps of them, core/host.js OWN), or for all of them at once (no one's): no one's
    // own told anyone else
    #snapshotFor(id = null) {
        const snapshot = this.host.snapshot();

        for (const player of snapshot.players) {
            if (player.id !== id) {
                for (const key of OWN.keys) {
                    delete player[key];
                }
            }
        }

        return snapshot;
    }

    /**
     * The host's world stopped, and why (`why`: PAUSES; `by`, the name of whoever stopped it for
     * everyone), or going again (null): everyone who's joined told, as it changes. Whoever joins
     * meanwhile is told with their welcome, and whoever's sent the world again with it, so a word
     * of its going again lost on a link that dropped can't leave them thinking it's stopped.
     */
    pause(why = null, by = null) {
        const paused = PAUSES.includes(why) ? { why, by: typeof by === "string" ? by : null } : null;

        if (paused?.why === this.paused?.why && paused?.by === this.paused?.by) {
            return;
        }

        this.paused = paused;
        this.#sendAll("paused", encode({ kind: "paused", paused: Boolean(paused), ...paused }));
    }

    /**
     * The host's link back after it dropped (what was sent meanwhile lost): everyone who's joined
     * sent the world as it now is (one snapshot for them all).
     */
    resync() {
        this.flush();

        if (!this.players.size) {
            return;
        }

        const text = encode({ kind: "state", snapshot: this.#snapshotFor(), paused: this.paused });

        for (const peer of this.players.keys()) {
            this.#send(peer, "state", text);
        }
    }

    /** Who's still here (the relay's word, the host's link back): anyone else who'd joined, gone. */
    still(peers) {
        const here = new Set(peers);

        for (const peer of [...this.players.keys()]) {
            if (!here.has(peer)) {
                this.gone(peer);
            }
        }
    }

    /**
     * One who'd joined (by their player's id) sent out of the world, told why (`reason`: "afk",
     * away too long: core/host.js AFK), after all that's been done till now; then gone, as if
     * they'd left. Returns whether they were here.
     */
    kick(id, reason) {
        const peer = [...this.players].find(([, player]) => player === id)?.[0];

        if (peer === undefined) {
            return false;
        }

        this.flush();
        this.#send(peer, "kicked", encode({ kind: "kicked", reason }));
        this.gone(peer);
        this.onKick(peer, reason);

        return true;
    }

    /**
     * One who'd joined has gone: out of the world. Whoever runs it is told, with their character
     * as it's to be kept, where they were and as they were (Host.placeOf, vitalsOf: to come back to).
     */
    gone(peer) {
        const id = this.players.get(peer);

        if (!id) {
            return;
        }

        this.players.delete(peer);
        this.rtts.delete(peer);
        this.#fresh(peer);
        this.#left(id, peer);
    }

    // Nothing kept of what a peer was told of their hero, of their commands done, or of when they
    // were last heard from: one joining (again) counts its commands from the first
    #fresh(peer) {
        this.done.delete(peer);
        this.toldSelf.delete(peer);
        this.heardAt.delete(peer);
        this.quieted.delete(peer);
    }

    /** The slowest of the links to those who've joined, as they've said (ms), or null if none's said yet. */
    slowest() {
        const said = [...this.players.keys()].map((peer) => this.rtts.get(peer)).filter(Number.isFinite);

        return said.length ? Math.max(...said) : null;
    }

    // A player out of the world (`id`, and the link they were on, if any): whoever runs it told,
    // with their character as it's to be kept, where they were and as they were
    #left(id, peer) {
        this.said.delete(id);

        const place = this.host.placeOf(id);
        const vitals = this.host.vitalsOf(id);
        const character = this.host.leave(id);

        this.flush();
        this.onLeave(id, peer, character && { ...character, place, vitals });
    }

    /** The world closed to others again: everyone who'd joined out of it, and nothing more recorded. */
    stop() {
        for (const peer of [...this.players.keys()]) {
            this.gone(peer);
        }

        this.host.recorder = null;
    }
}

/**
 * A game joining a world someone else hosts: says who's coming (`hello`), hears the world
 * (`onWelcome`, to make its copy and `attach` it), then plays it on as the host did (`step`),
 * its player's commands going to the host (`command`). What's to be sent goes by `send(text)`;
 * `clock` tells the time (ms: only to time the link, never in the world).
 */
export class Joining {
    #last = null;

    // The host's sendings timed lately (#arrived): the quickest, and how late each came
    #quickest = [];
    #lateness = [];

    // How many of the host's steps are waiting to be played (in the queue)
    #waiting = 0;

    constructor({ send, clock = () => 0 }) {
        this.send = send;
        this.clock = clock;

        /** Its copy of the world (a Host, as the host's was), once it's made; its player's id in it. */
        this.host = null;
        this.me = null;

        /** Whether its character was in the world already when it came, on another link, and it took them over (Hosting #takeOver). */
        this.took = false;

        /** What's been done in the host's world, not yet done in this copy. */
        this.queue = [];

        /** Its player's commands sent, waiting to hear what came of them (by seq). */
        this.pending = new Map();
        this.seq = 1;

        /**
         * Its own hero as the host last told it they were ({ time (the host's battle's), seq (the
         * last of its commands done then), hero (core/selfstate.js), at (its clock's, when heard) }),
         * or null; and who's told of it as it's heard (app/forecast.js).
         */
        this.self = null;
        this.onSelf = null;

        /** Whether it's gone astray from the host's, and asked for the world again. */
        this.astray = false;
        this.resyncs = 0;

        /**
         * Whether it fell too far behind the host to catch up step by step (PACE.tooFar), and
         * asked for the world as it now is (none of its steps played till it's come); and how
         * often it has.
         */
        this.farBehind = false;
        this.skips = 0;

        /**
         * How often it's compared where the host's characters stood with its own (the motion
         * stream), and the world with how the host said it should stand (the checksum); and how
         * often it found it had gone astray, either way.
         */
        this.motionChecks = 0;
        this.checks = 0;
        this.desyncs = 0;

        /**
         * The host's latest step heard; how late its steps come (ms: all but the latest few,
         * PLAYOUT); how many of them to keep in hand, and how many it's had in hand lately; and
         * how long a word takes to the host and back (ms: null till it's known).
         */
        this.hostStep = null;
        this.jitter = 0;
        this.delay = PLAYOUT.least;
        this.held = 0;
        this.rtt = null;

        /** The latest round trips to the host (ms, at most LATELY of them, as they came: `lately`). */
        this.trips = [];

        /** What's been heard (characters of text), by kind. */
        this.received = {};

        /** Whether the host's world is stopped, and why ({ why: PAUSES, by }), as the host's said; or null. */
        this.paused = null;

        /**
         * As it's told the host: whether its page is hidden (away), and whether its player's
         * holding the world (hold: their menu open), and for everyone.
         */
        this.hidden = false;
        this.held = false;
        this.everyone = false;

        /** What its game keeps of its hero that isn't the world's (core/host.js OWN), as it's told the host. */
        this.mine = {};

        /** Which direct messages its player takes (DMS_TAKEN), as it's told the host; null till it has. */
        this.dms = null;

        /**
         * Told when the world's come (the welcome), come again (the state), or they're turned away
         * (a reason); and when they're sent out of it (a reason: "afk").
         */
        this.onWelcome = () => {};
        this.onState = () => {};
        this.onRefused = () => {};
        this.onKicked = () => {};

        /** Told each round trip to the host as it's heard (ms, as it was: not smoothed as rtt is). */
        this.onPong = () => {};

        /**
         * Told each line said in its player's party, and each direct message to them or theirs
         * ({ from, name, text, to, toName, dm }); and why one of theirs wasn't said (CHAT_REFUSED,
         * and { name }: whose direct messages are closed).
         */
        this.onChat = () => {};
        this.onUnsaid = () => {};
    }

    /**
     * Ask to join, as a character (as Host.join takes it); in a world server's world that keeps its
     * players' heroes, as one of theirs (`hero`: its slot) or a new one ("new", the character's
     * looks taken alone: server/world-worker.js).
     */
    hello(character, { hero } = {}) {
        this.send(encode({ kind: "hello", version: NET_VERSION, character, ...(hero !== undefined ? { hero } : {}) }));
    }

    /** What the host said. */
    hear(text) {
        let message;

        try {
            message = decode(text);
        } catch {
            return;
        }

        if (typeof message?.kind === "string") {
            this.received[message.kind] = (this.received[message.kind] ?? 0) + text.length;
        }

        switch (message?.kind) {
            case "welcome":
                this.me = message.id;
                // (Their character was in the world already, on another link: taken over, as it stood)
                this.took = message.took === true;
                this.paused = pausedOf(message.paused);
                this.queue = [];
                this.#waiting = 0;
                this.#last = null;
                this.onWelcome(message);
                break;
            case "ops":
                if (Array.isArray(message.ops)) {
                    let steps = 0;

                    for (const op of message.ops) {
                        this.queue.push(op);
                        steps += Array.isArray(op) && op[0] === "a" ? (op[2] ?? 1) : 0;
                    }

                    this.#waiting += steps;
                    this.#arrived(message.step, steps);
                }

                break;
            case "self":
                // (Its own hero as the host has them now: looked ahead from, app/forecast.js)
                if (message.hero && Number.isFinite(message.time) && Number.isInteger(message.seq)) {
                    this.self = { time: message.time, seq: message.seq, hero: message.hero, at: this.clock() };
                    this.onSelf?.(this.self);
                }

                break;
            case "motion":
                // (Compared once what came before it's been played: just where the host packed it)
                if (typeof message.units === "string" && Number.isInteger(message.step)) {
                    this.queue.push(["m", message.step, message.units]);
                }

                break;
            case "pong":
                if (Number.isFinite(message.t)) {
                    const took = Math.max(0, this.clock() - message.t);

                    this.rtt = this.rtt === null ? took : this.rtt + (took - this.rtt) / 8;
                    this.trips.push(took);

                    if (this.trips.length > LATELY) {
                        this.trips.shift();
                    }

                    this.onPong(took);
                }

                break;
            case "state":
                // (Everything waiting was done before it: in it already)
                this.queue = [];
                this.#waiting = 0;
                this.#last = null;
                this.host?.adopt(message.snapshot);
                this.paused = pausedOf(message.paused);
                this.astray = false;
                this.farBehind = false;
                this.resyncs++;

                for (const then of this.pending.values()) {
                    then({ ok: true, again: true });
                }

                this.pending.clear();
                this.onState(message);
                break;
            case "paused":
                // (Its steps stopped coming for a reason: no measure of how evenly they come)
                this.paused = pausedOf(message.paused === true ? message : null);
                this.#last = null;
                break;
            case "refused":
                this.onRefused(message.reason, message);
                break;
            case "kicked":
                this.onKicked(message.reason);
                break;
            case "chat": {
                const text = chatLine(message.text);
                const dm = (message.dm === "party" || message.dm === "world") && typeof message.to === "string" ? { to: message.to, toName: typeof message.toName === "string" ? message.toName : "", dm: message.dm } : {};

                if (text && typeof message.from === "string") {
                    this.onChat({ from: message.from, name: typeof message.name === "string" ? message.name : "", text, ...dm });
                }

                break;
            }
            case "unsaid":
                if (CHAT_REFUSED.includes(message.reason)) {
                    this.onUnsaid(message.reason, { name: typeof message.name === "string" ? message.name : "" });
                }

                break;
            default:
                break;
        }
    }

    /**
     * A line its player says to their party: to the host, which sends it on to those in it (this
     * game too, so it's heard back as everyone hears it); or, `to` a player's id, a direct message
     * to them (heard back too). Returns { ok: true, pending: true }, or, with nothing to say,
     * { ok: false, reason: "empty" }.
     */
    chat(text, { to = null } = {}) {
        const line = chatLine(text);

        if (!line) {
            return { ok: false, reason: "empty" };
        }

        this.send(encode({ kind: "chat", text: line, ...(typeof to === "string" ? { to } : {}) }));

        return { ok: true, pending: true };
    }

    /** Tell the host which direct messages its player takes (`party`, `world`: DMS_TAKEN); said again as its link comes back (resync). */
    takeDms({ party = true, world = true } = {}) {
        this.dms = { party: party !== false, world: world !== false };
        this.send(encode({ kind: "dms", ...this.dms }));
    }

    /**
     * Ask for the world again: its link to the host dropped a moment, and what was sent meanwhile
     * was lost. (Asked even if it's asked already: that ask may have been lost too.)
     */
    resync() {
        this.astray = true;
        this.send(encode({ kind: "again" }));

        // (And how its player is, said again, as what it said meanwhile may have been lost too:
        // its page shown again, their menu shut. Their pause for everyone ended with the link,
        // server/world-worker.js: not asked for again)
        this.everyone = false;
        this.send(encode({ kind: "away", hidden: this.hidden }));
        this.send(encode({ kind: "hold", held: this.held, everyone: false }));

        if (Object.keys(this.mine).length) {
            this.send(encode({ kind: "own", own: this.mine }));
        }

        if (this.dms) {
            this.send(encode({ kind: "dms", ...this.dms }));
        }
    }

    /** Its copy of the world, made from the welcome (Host.restore): taking the host's ways. */
    attach(host) {
        this.host = host;
        host.replaying();
    }

    /** How many of the host's steps are waiting to be played. */
    get behind() {
        return this.#waiting;
    }

    /** Tell the host its copy of the world is made, and it's playing (on the world server: the world's clock starts, if it's stopped). */
    ready() {
        this.send(encode({ kind: "ready" }));
    }

    /** Tell the host its page is hidden (`hidden`), or shown again (on the world server: its world stops for its one player while theirs is). */
    away(hidden) {
        this.hidden = Boolean(hidden);
        this.send(encode({ kind: "away", hidden: this.hidden }));
    }

    /**
     * Tell the host what its game keeps of its hero that isn't the world's has changed (`changes`:
     * any of core/host.js OWN: their wheels, pin, markers, messages, what they've been told once,
     * their settings), for it to keep with them; said again as its link comes back (resync).
     */
    own(changes) {
        Object.assign(this.mine, structuredClone(changes));
        this.send(encode({ kind: "own", own: changes }));
    }

    /**
     * Tell the host its player's holding the world (`held`: their menu open; on the world server,
     * the world stops for its one player while they do), and if for `everyone` (Pause for
     * everyone: an owner's, on the world server, the world stopped for all), or letting it go.
     * Said only as it changes.
     */
    hold(held, { everyone = false } = {}) {
        const all = Boolean(held && everyone);

        if (Boolean(held) === this.held && all === this.everyone) {
            return;
        }

        this.held = Boolean(held);
        this.everyone = all;
        this.send(encode({ kind: "hold", held: this.held, everyone: all }));
    }

    /**
     * How long a word to the host and back's taken lately (ms), as the HUD's orb shows it: the
     * middle of the latest LATELY round trips (of an even few, the quicker), or null till one's
     * timed. (Not `rtt`, which is smoothed over many, and so slow to forget the first, often held
     * up as the world's built.)
     */
    get lately() {
        if (!this.trips.length) {
            return null;
        }

        const sorted = [...this.trips].sort((a, b) => a - b);

        return sorted[Math.floor((sorted.length - 1) / 2)];
    }

    /** Ask the host how long a word takes to it and back (rtt, once its pong comes), telling it how long it's been taking lately. */
    ping() {
        const lately = this.lately;

        this.send(encode({ kind: "ping", t: this.clock(), ...(lately === null ? {} : { rtt: Math.round(lately) }) }));
    }

    // The host's sending of what's been done up to `step` heard, `steps` of its steps in it: how
    // late they came (its first step, against the quickest of late: the steps sent together
    // waiting for the last), as a jitter buffer reckons it (WebRTC's NetEq, by how late each
    // comes against the quickest), and so how many steps to keep in hand. (Over a pause, or once
    // the world's come again, timed afresh: the host's steps stopped, not late)
    #arrived(step, steps) {
        if (!Number.isInteger(step)) {
            return;
        }

        const at = this.clock();

        if (!this.#last) {
            this.#quickest = [];
        }

        if (steps > 0 && (!this.#last || step > this.#last.step)) {
            const took = at - step * STEP_MS;

            // (The quickest of the last `window` ms, first: each kept till a quicker one comes)
            while (this.#quickest.length && this.#quickest.at(-1).took >= took) {
                this.#quickest.pop();
            }

            this.#quickest.push({ at, took });

            while (this.#quickest[0].at < at - PLAYOUT.window) {
                this.#quickest.shift();
            }

            this.#lateness.push({ at, late: Math.min(PLAYOUT.late, took - this.#quickest[0].took + (steps - 1) * STEP_MS) });

            while (this.#lateness[0].at < at - PLAYOUT.remember) {
                this.#lateness.shift();
            }

            const lates = this.#lateness.map(({ late }) => late).sort((a, b) => a - b);

            this.jitter = lates[Math.min(lates.length - 1, Math.floor(lates.length * (1 - PLAYOUT.spare)))];
            this.delay = Math.max(PLAYOUT.least, Math.min(PLAYOUT.most, Math.ceil(this.jitter / STEP_MS)));
        }

        this.#last = { step, at };
        this.hostStep = step;
    }

    /**
     * How fast to play the host's steps for the next `ms` of the game's time (1: as they were
     * played): a little slower while there are fewer than `delay` in hand (lately), so that
     * there are; a little faster while there are more, so that they're played sooner.
     */
    pace(ms) {
        this.held += (this.behind - this.held) * Math.min(1, ms / PLAYOUT.settle);

        return 1 + Math.max(-PLAYOUT.slower, Math.min(PLAYOUT.faster, (this.held - this.delay) * PLAYOUT.gain));
    }

    /**
     * Play what the host did, up to and including its next step: the events it made (as
     * Host.advance gives them), or null if there's no step to play yet. Or, fallen too far behind
     * to catch up (PACE.tooFar), none: the world as it now is asked for, and played on from once
     * it's come.
     */
    step() {
        if (!this.host) {
            return null;
        }

        if (this.#waiting > PACE.tooFar && !this.farBehind) {
            this.farBehind = true;
            this.skips++;

            // (Gone astray as well: the world's asked for already)
            if (!this.astray) {
                this.send(encode({ kind: "again" }));
            }
        }

        if (this.farBehind) {
            return null;
        }

        while (this.queue.length) {
            const op = this.queue[0];

            // (The ways the host found doing it come just after: ready for the battle first)
            for (let k = 1; k < this.queue.length && this.queue[k][0] === "v"; ) {
                this.host.replay?.push(this.queue.splice(k, 1)[0].slice(1));
            }

            switch (op[0]) {
                case "a": {
                    if ((op[2] ?? 1) > 1) {
                        op[2]--;
                    } else {
                        this.queue.shift();
                    }

                    this.#waiting--;

                    return this.host.advance(op[1]);
                }
                case "c": {
                    const [, id, command, seq] = this.queue.shift();
                    const result = this.host.command(id, command);

                    if (id === this.me && seq !== undefined && this.pending.has(seq)) {
                        const then = this.pending.get(seq);

                        this.pending.delete(seq);
                        then(result);
                    }

                    break;
                }
                case "j":
                    this.host.join(this.queue.shift()[1]);
                    break;
                case "l":
                    this.host.leave(this.queue.shift()[1]);
                    break;
                case "p":
                    this.queue.shift();
                    this.host.populate();
                    break;
                case "v":
                    this.host.replay?.push(this.queue.shift().slice(1));
                    break;
                case "k": {
                    const [, sum] = this.queue.shift();

                    if (!this.astray) {
                        this.checks++;

                        if (this.host.checksum() !== sum) {
                            this.#astray();
                        }
                    }

                    break;
                }
                case "m": {
                    const [, step, units] = this.queue.shift();

                    // (At another step than the host packed it at: its world's not the host's)
                    if (!this.astray) {
                        this.motionChecks++;

                        if (Math.floor(this.host.battle.time / STEP_MS) !== step || compareMotion(this.host.battle, unpackMotion(fromBase64(units))).length) {
                            this.#astray();
                        }
                    }

                    break;
                }
                default:
                    this.queue.shift();
            }
        }

        return null;
    }

    // Gone astray from the host's world: the world again
    #astray() {
        this.astray = true;
        this.desyncs++;
        this.send(encode({ kind: "again" }));
    }

    /**
     * A command of its player's, to the host: `then` hears what came of it, once the host's done it
     * and it's been done here too. Returns at once: { ok: true, pending: true }.
     */
    command(command, then = null) {
        const seq = this.seq++;

        if (then) {
            this.pending.set(seq, then);
        }

        this.send(encode({ kind: "command", seq, command }));

        return { ok: true, pending: true, seq };
    }
}
