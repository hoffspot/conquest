// Who hears of what (generated/multiplayer_scaling_plan.md 3-15): for each kind of event the
// battle and the host tell of (core/battle.js #emit, core/host.js #event), an audience and a
// class. A lockstep copy plays the whole world and so makes every event itself; a game that's
// sent views plays none of it, and is told only the events that are its player's to hear. This
// is the table that says which those are, and the one filter both will use: the view feed for a
// player's frames (core/viewfeed.js), and a copy checked against them.
//
// An audience:
//
//   near    whoever knows of anyone the event's about (its `id`, `ids`, `target`, `by`, `from`),
//           or whose hero is within NEAR.near metres of where it is (`at`, or `x` and `y`)
//   one     the player it's about (its `id`), and no one else
//   party   that player and their party
//   place   as near, but from NEAR.place metres: what's made, moved or changed about a place,
//           whose folk a player may not know of yet
//   world   everyone
//
// A class: `must` is told whatever it costs, in order, and waits for the next frame sooner than
// be left out; `may` is told while there's room and let go of when there isn't (a miss, a
// swing, an emote: a crowded fight loses flourishes before it loses anything that matters).
//
// **It errs wide, never narrow.** An event that hasn't what its audience goes by is told to more
// players, not fewer: one about no player goes to those near it; one with no one and nowhere
// named goes to everyone. A kind with no scope at all goes to everyone as `must`, and
// test/eventscope.test.js fails for any kind the battle or the host tells of that's not here.
//
// Pure: no DOM, no network, no trigonometry.

/** The audiences and the classes there are. */
export const AUDIENCES = Object.freeze(["near", "one", "party", "place", "world"]);
export const CLASSES = Object.freeze(["must", "may"]);

/** How far off a hero hears of what's near, and of what's about a place (m). */
export const NEAR = Object.freeze({ near: 192, place: 512 });

/** Each kind's audience and class, as "audience class". */
export const SCOPES = Object.freeze({
    ability: "one must",
    act: "near may",
    afflicted: "near must",
    afk: "world must",
    ail: "near may",
    aloft: "near must",
    ambush: "place must",
    army: "place must",
    arrived: "near may",
    ate: "near may",
    attack: "near may",
    attracted: "place must",
    away: "world must",
    bait: "near may",
    barracks: "world must",
    bestiary: "one must",
    blast: "near may",
    blocked: "near may",
    bomb: "near may",
    boon: "one must",
    bought: "one must",
    breach: "world must",
    breath: "near must",
    brimstone: "one must",
    brokenDown: "one must",
    buffed: "near must",
    burnt: "world must",
    cache: "place must",
    call: "near may",
    called: "place must",
    camp: "place must",
    carried: "near must",
    cast: "near may",
    caught: "near must",
    charge: "near may",
    charged: "near may",
    cleared: "world must",
    close: "place must",
    companion: "one must",
    convoy: "place must",
    convoyed: "world must",
    counsel: "one must",
    covered: "near may",
    crafted: "one must",
    cried: "near may",
    cross: "near must",
    cured: "one must",
    curious: "near may",
    death: "near must",
    discarded: "one must",
    disguise: "near must",
    dismiss: "place must",
    dodged: "near may",
    draw: "near may",
    drop: "near must",
    dropped: "near must",
    duel: "one must",
    dungeon: "world must",
    eat: "near may",
    effect: "near may",
    emote: "near may",
    engagement: "world must",
    envoy: "place must",
    envoyed: "world must",
    exhausted: "near may",
    explored: "one must",
    farewell: "place must",
    fate: "world must",
    fieldBattle: "place must",
    find: "place must",
    fizzle: "near may",
    fled: "near may",
    follower: "one must",
    fortDown: "world must",
    fortOut: "world must",
    gear: "near must",
    gift: "one must",
    gone: "near must",
    grown: "one must",
    guard: "near must",
    guild: "one must",
    hacking: "place must",
    hazard: "near must",
    healed: "near may",
    hellRift: "world must",
    hit: "near may",
    horse: "one must",
    horseFell: "near must",
    invasion: "world must",
    join: "world must",
    junkSold: "one must",
    knockdown: "near must",
    leaders: "world must",
    leap: "near may",
    learnt: "one must",
    leave: "world must",
    loot: "one must",
    messenger: "place must",
    miss: "near may",
    mission: "one must",
    mood: "near may",
    mount: "near must",
    muster: "place must",
    obstacle: "place must",
    obstacles: "place must",
    open: "place must",
    order: "world must",
    pace: "place must",
    pacified: "near must",
    parted: "place must",
    party: "party must",
    patrol: "place must",
    peopled: "place must",
    phase: "near must",
    picked: "near must",
    polymorphed: "near must",
    prayed: "one must",
    prism: "near may",
    projectile: "near may",
    quartered: "place must",
    rank: "one must",
    rare: "place must",
    reinforced: "place must",
    relieved: "world must",
    request: "one must",
    reshaped: "near must",
    resisted: "near may",
    respawn: "near must",
    rest: "near may",
    ring: "one must",
    rose: "near must",
    roused: "place must",
    rules: "world must",
    safety: "one must",
    seen: "near may",
    share: "one must",
    sign: "one must",
    skirmishers: "place must",
    slept: "one must",
    slipped: "near may",
    sold: "one must",
    spared: "near must",
    spell: "near may",
    spoils: "near must",
    squadsOut: "place must",
    standard: "near must",
    standing: "one must",
    stockades: "place must",
    stormed: "world must",
    stranger: "place must",
    strike: "place must",
    strongroom: "one must",
    stunned: "near must",
    summons: "one must",
    supply: "world must",
    taken: "world must",
    talk: "one must",
    tamed: "near must",
    taunted: "near must",
    telegraph: "near must",
    thread: "place must",
    thrown: "near must",
    tier: "one must",
    townsfolk: "place must",
    tracks: "place must",
    trade: "one must",
    treasure: "party must",
    trial: "place must",
    turn: "world must",
    unbuffed: "near must",
    unitAbility: "one must",
    unleashed: "near may",
    unquartered: "place must",
    unrest: "world must",
    unstruck: "near may",
    used: "near may",
    vacated: "place must",
    vault: "place must",
    war: "world must",
    warning: "near may",
    whistle: "near may",
    works: "world must",
    worksDown: "world must",
    worksOut: "place must",
});

const WIDE = Object.freeze({ audience: "world", class: "must" });
const parsed = new Map(Object.entries(SCOPES).map(([kind, scope]) => {
    const [audience, sort] = scope.split(" ");

    return [kind, Object.freeze({ audience, class: sort })];
}));

/** A kind's scope: { audience, class }. One that has none is everyone's, and must be told. */
export const scopeOf = (kind) => parsed.get(kind) ?? WIDE;

// The fields of an event that may name those it's about
const ABOUT = ["id", "ids", "target", "by", "from", "to"];

// Whether a viewer is near an event, within `reach`: they know of anyone it names, or their hero
// stands that near where it is. Null if it names no one and nowhere (so it can't be said)
function nearby(event, viewer, reach) {
    let named = false;

    for (const field of ABOUT) {
        const value = event[field];

        for (const id of Array.isArray(value) ? value : [value]) {
            if (typeof id === "string") {
                named = true;

                if (id === viewer.id || viewer.knows(id)) {
                    return true;
                }
            }
        }
    }

    const at = Array.isArray(event.at) && event.at.length === 2 ? event.at : typeof event.x === "number" && typeof event.y === "number" ? [event.x, event.y] : null;

    if (at && typeof at[0] === "number" && typeof at[1] === "number") {
        // (On another map than the hero's, where it says which: not near, however the numbers fall)
        if (typeof event.map === "string" && event.map !== viewer.hero.map) {
            return false;
        }

        const [dx, dy] = [at[0] - viewer.hero.x, at[1] - viewer.hero.y];

        return dx * dx + dy * dy <= reach * reach;
    }

    return named ? false : null;
}

/**
 * Whether a player hears of an event.
 *
 * @param {object} event - The event ({ type, ... }).
 * @param {object} viewer - The player: { id, hero ({ map, x, y }), knows(id) (whether their game
 *     knows of that character) }.
 * @param {object} world - { players (has(id): whether an id is a player's), partyOf(id) (the
 *     ids of that player's party, themself among them; nothing if they've none) }.
 */
export function hears(event, viewer, world) {
    const { audience } = scopeOf(event.type);

    if (audience === "world") {
        return true;
    }

    if (audience === "one" || audience === "party") {
        const who = typeof event.id === "string" && world.players.has(event.id) ? event.id : null;

        if (who !== null) {
            if (who === viewer.id) {
                return true;
            }

            if (audience === "one") {
                return false;
            }

            for (const id of world.partyOf(who) ?? []) {
                if (id === viewer.id) {
                    return true;
                }
            }

            return false;
        }
    }

    // (Near it or about its place; or, about no player after all, those near it; and with no
    // one and nowhere named, everyone)
    return nearby(event, viewer, audience === "place" ? NEAR.place : NEAR.near) ?? true;
}

/**
 * A step's events as one player hears them: { must, may }, each in the order they were told.
 */
export function sift(events, viewer, world) {
    const heard = { must: [], may: [] };

    for (const event of events) {
        if (hears(event, viewer, world)) {
            heard[scopeOf(event.type).class].push(event);
        }
    }

    return heard;
}
