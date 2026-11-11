// A character of the battle as a snapshot keeps it (core/host.js snapshot, SNAPSHOT_VERSION 53):
// only what isn't as a character just made has it. A character has some 120 fields it's always
// made with, and at any moment most of them say nothing: no target, no order, no spell being
// cast, never yet in a fight. Kept whole, each took about 2 KB of a snapshot's text, half of it
// those; and its "never yet"s (-Infinity, which JSON can't carry: core/wire.js) were the only
// marks in most snapshots, which is what whoever reads one has to go through it for.
//
// So a field in ACTOR_DEFAULTS is left out while it has that value; and a character's attacks
// (`arms`) are left out while they're its weapon's own, as the battle makes them (battle.js
// armsIn). Anything else it's been given is kept as it is, so a field this file has never heard
// of is kept whole: nothing is lost by its being out of date, only bytes. (What a character's
// only made with and never was given, the battle's OPTIONAL, undefined, isn't kept at all: text
// can't hold it.)
//
// The battle makes a character whole again, not this file: Battle.restore makes each as add makes
// one (#made), which is every field at just these defaults, and puts what was kept on it; one
// whose attacks weren't kept has its weapon's. So a snapshot kept whole (an older version's)
// reads the same way, and every character carried on is of the one shape every character is.
//
// What must hold, and test/snapshot-fields.test.js checks: every field in ACTOR_DEFAULTS is one
// the battle makes every character with, at that value given nothing else (battle.js #made). One
// it made otherwise would come back as it makes it, not as it was.
//
// Pure: no DOM, no network.

import { armsIn } from "./battle.js";

/**
 * What a character just made has in each field left out of a snapshot while it has it (battle.js
 * #made: what it's made with, given nothing else).
 */
export const ACTOR_DEFAULTS = Object.freeze({
    weapon: null,
    boots: false,
    armed: false,
    drawing: null,
    foughtAt: -Infinity,
    ai: null,
    patrol: null,
    leash: null,
    leader: null,
    assist: null,
    post: 0,
    foes: Object.freeze({}),
    struckBy: Object.freeze({}),
    enmity: Object.freeze({}),
    taunted: null,
    power: Object.freeze({ melee: 1, ranged: 1, heal: 1, stun: 1 }),
    armor: 0,
    empowered: null,
    shield: null,
    crossed: null,
    path: Object.freeze([]),
    offPath: false,
    aside: null,
    progress: null,
    squeezeUntil: 0,
    running: false,
    facing: 0,
    neutral: false,
    routine: null,
    role: null,
    side: null,
    afraid: null,
    calmAt: 0,
    lookAt: 0,
    reseat: false,
    stop: 0,
    arrived: false,
    stopSince: 0,
    restAt: 0,
    restingUntil: 0,
    beckoned: false,
    sawPlayerAt: -Infinity,
    beckoningUntil: 0,
    talkingTo: null,
    order: null,
    lock: null,
    striking: null,
    attack: null,
    readyAt: 0,
    staggeredUntil: 0,
    stunnedUntil: 0,
    downUntil: 0,
    casting: null,
    spellReadyAt: 0,
    spellsReadyAt: Object.freeze({}),
    prism: null,
    dead: false,
    respawnAt: 0,
    rises: null,
    downed: false,
    dodge: 0,
    afflictions: Object.freeze([]),
    footprint: null,
    engine: null,
    buffs: Object.freeze([]),
    spared: Object.freeze({}),
    feared: null,
    seeing: Object.freeze({}),
    target: null,
    lastSeen: -Infinity,
    lastPathAt: -Infinity,
    pathGoal: null,
    blockedSince: null,
    patrolIndex: 0,
    waitUntil: 0,
    wild: null,
    waryUntil: 0,
    aloft: null,
    hoverAt: 0,
    mount: null,
    lurking: false,
    droppedAt: null,
    formation: null,
    rethinkAt: 0,
    casts: null,
    heals: null,
});

// Whether two pieces of plain data are alike (numbers, strings, null, arrays and plain objects)
function alike(a, b) {
    if (a === b) {
        return true;
    }

    if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }

    if (Array.isArray(a)) {
        return a.length === b.length && a.every((each, k) => alike(each, b[k]));
    }

    const keys = Object.keys(a);

    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && alike(a[key], b[key]));
}

// Each default by its field's name (none of them undefined: no default, by that), for looking up
// quickly: a snapshot's taken on the world's own thread, of every character in it
const USUAL = new Map(Object.entries(ACTOR_DEFAULTS));

// Whether a field's value is its default, where that's a list or a table (an empty one, or the
// same in every part)
function unchanged(value, usual) {
    if (value === null || typeof value !== "object") {
        return false;
    }

    return Array.isArray(usual) ? Array.isArray(value) && value.length === 0 : !Array.isArray(value) && alike(value, usual);
}

/**
 * A character as a snapshot has it whole (battle.js snapshot's: all it's been given), as it's
 * kept: without each field that's at its default, and without its attacks if they're its
 * weapon's own. A new object; what it holds is the character's own.
 */
export function spareActor(actor) {
    const kept = {};

    for (const key in actor) {
        const value = actor[key];
        const usual = USUAL.get(key);

        if (value === undefined) {
            continue;
        }

        if (usual === undefined) {
            if (key !== "arms" || !alike(value, armsIn(actor.weapon, actor.boots, actor.formation))) {
                kept[key] = value;
            }
        } else if (value !== usual && (usual === null || typeof usual !== "object" || !unchanged(value, usual))) {
            kept[key] = value;
        }
    }

    return kept;
}

// Plain data copied (numbers, strings, lists and tables, however deep); anything else, as the
// battle's own snapshot copies it
function copied(value) {
    if (value === null || typeof value !== "object") {
        return value;
    }

    if (Array.isArray(value)) {
        const out = new Array(value.length);

        for (let k = 0; k < value.length; k++) {
            out[k] = copied(value[k]);
        }

        return out;
    }

    const proto = Object.getPrototypeOf(value);

    if (proto !== Object.prototype && proto !== null) {
        return structuredClone(value);
    }

    const out = {};

    for (const key in value) {
        out[key] = copied(value[key]);
    }

    return out;
}

/**
 * One of the battle's own characters as a snapshot keeps it: what spareActor makes of the battle's
 * own snapshot of it (a copy of all it's been given, its dice as their state and its rests'
 * variety as what it remembers), made straight from the character, so only what's kept is copied
 * (Battle.snapshot's `keep`, as the host takes a snapshot). Two thirds of what a character's been
 * given is left out: copied whole first, a snapshot of the battle took four times as long.
 */
export function keptOf(actor) {
    const kept = {};

    for (const key in actor) {
        const value = actor[key];

        if (value === undefined || key === "chance" || key === "restVariety") {
            continue;
        }

        const usual = USUAL.get(key);

        if (usual === undefined) {
            if (key !== "arms" || !alike(value, armsIn(actor.weapon, actor.boots, actor.formation))) {
                kept[key] = copied(value);
            }
        } else if (value !== usual && (usual === null || typeof usual !== "object" || !unchanged(value, usual))) {
            kept[key] = copied(value);
        }
    }

    kept.chance = actor.chance.state;
    kept.restVariety = actor.restVariety.toJSON();

    return kept;
}

/**
 * A battle's snapshot kept whole (battle.js snapshot's, or an older version's) with each of its
 * characters as it's kept now (spareActor).
 */
export function spareBattle(battle) {
    return { ...battle, actors: battle.actors.map(spareActor) };
}
