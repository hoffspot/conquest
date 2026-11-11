// A character of the battle as a snapshot keeps it (core/host.js snapshot, SNAPSHOT_VERSION 53):
// only what isn't as a character just added has it. A character has some 120 fields, and at any
// moment most of them say nothing: no target, no order, no spell being cast, never yet in a fight.
// Kept whole, each took about 2 KB of a snapshot's text, half of it those; and its "never yet"s
// (-Infinity, which JSON can't carry: core/wire.js) were the only marks in most snapshots, which
// is what whoever reads one has to go through it for.
//
// So a field in ACTOR_DEFAULTS is left out while it has that value, and put back when the snapshot
// is read; and a character's attacks (`arms`) are left out while they're its weapon's own, as the
// battle makes them (battle.js armsIn), and made again from its weapon. Anything else is kept as
// it is, so a field this file has never heard of is kept whole: nothing is lost by its being
// out of date, only bytes. A snapshot kept whole (an older version's) reads the same way.
//
// What must hold, and test/keptactor.test.js checks: every field in ACTOR_DEFAULTS is one every
// character has from the moment it's added (battle.js add). One that only some had would come
// back on those that never had it.
//
// Pure: no DOM, no network.

import { armsOf, KNIFE } from "./weapons.js";

/**
 * A character's fields in the order the battle makes one with them (battle.js add), those only
 * some have (`wards`, `tactic`, `keep`, `lone`, `sight`) among them where they'd come: a character
 * read back from a snapshot has its fields in this order, then any others as they were kept, so
 * it's laid out as the one it was kept from is.
 */
export const ACTOR_FIELDS = Object.freeze([
    "id",
    "kind",
    "name",
    "weapon",
    "boots",
    "arms",
    "armed",
    "drawing",
    "foughtAt",
    "team",
    "ai",
    "patrol",
    "leash",
    "leader",
    "assist",
    "post",
    "foes",
    "struckBy",
    "enmity",
    "taunted",
    "power",
    "armor",
    "wards",
    "empowered",
    "shield",
    "map",
    "spawnMap",
    "crossed",
    "hp",
    "maxHp",
    "stamina",
    "maxStamina",
    "speed",
    "chaseSpeed",
    "respawnMs",
    "spawn",
    "x",
    "y",
    "square",
    "path",
    "offPath",
    "aside",
    "progress",
    "squeezeUntil",
    "pace",
    "walkPace",
    "running",
    "facing",
    "neutral",
    "routine",
    "role",
    "side",
    "afraid",
    "calmAt",
    "lookAt",
    "reseat",
    "stop",
    "arrived",
    "stopSince",
    "restAt",
    "restingUntil",
    "restVariety",
    "chance",
    "beckoned",
    "sawPlayerAt",
    "beckoningUntil",
    "talkingTo",
    "order",
    "lock",
    "striking",
    "attack",
    "readyAt",
    "staggeredUntil",
    "stunnedUntil",
    "downUntil",
    "casting",
    "spellReadyAt",
    "spellsReadyAt",
    "prism",
    "dead",
    "respawnAt",
    "rises",
    "downed",
    "dodge",
    "afflictions",
    "footprint",
    "engine",
    "buffs",
    "spared",
    "feared",
    "seeing",
    "target",
    "lastSeen",
    "lastPathAt",
    "pathGoal",
    "blockedSince",
    "patrolIndex",
    "waitUntil",
    "wild",
    "waryUntil",
    "aloft",
    "hoverAt",
    "mount",
    "lurking",
    "droppedAt",
    "formation",
    "rethinkAt",
    "casts",
    "heals",
    "tactic",
    "keep",
    "lone",
    "sight",
]);

/**
 * What a character just added has in each field left out of a snapshot while it has it (battle.js
 * add: what it's made with, given nothing else). Every one of them a field every character has.
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

// Whether a field's value is its default (an empty list or table, for those whose default is one)
function unchanged(value, usual) {
    if (value === usual) {
        return true;
    }

    if (usual === null || typeof usual !== "object" || value === null || typeof value !== "object") {
        return false;
    }

    return Array.isArray(usual) ? Array.isArray(value) && value.length === 0 : !Array.isArray(value) && alike(value, usual);
}

// A default of a character's own (a list or a table isn't shared between them)
const fresh = (usual) => (usual === null || typeof usual !== "object" ? usual : Array.isArray(usual) ? [] : { ...usual });

/** A character's attacks as the battle makes them from its weapon (battle.js armsIn): an archer's or a caster's in a line, its knife first. */
export function armsFor({ weapon, boots, formation }) {
    const arms = armsOf(weapon, boots);

    return formation?.role === "archer" || formation?.role === "caster" ? [KNIFE, ...arms] : arms;
}

/**
 * A character as a snapshot has it whole (battle.js snapshot's), as it's kept: without each
 * field that's at its default, and without its attacks if they're its weapon's own. A new object;
 * what it holds is the character's own.
 */
export function spareActor(actor) {
    const kept = {};

    for (const key in actor) {
        const value = actor[key];

        if (Object.hasOwn(ACTOR_DEFAULTS, key) ? !unchanged(value, ACTOR_DEFAULTS[key]) : key !== "arms" || !alike(value, armsFor(actor))) {
            kept[key] = value;
        }
    }

    return kept;
}

/**
 * A character as it's kept (spareActor's, or one kept whole), whole again: each field left out
 * back at its default, its attacks made from its weapon if they were left out, its fields in the
 * order the battle makes a character with them (ACTOR_FIELDS).
 */
export function wholeActor(kept) {
    const actor = {};
    const armed = Object.hasOwn(kept, "arms");

    for (const key of ACTOR_FIELDS) {
        if (Object.hasOwn(kept, key)) {
            actor[key] = kept[key];
        } else if (Object.hasOwn(ACTOR_DEFAULTS, key)) {
            actor[key] = fresh(ACTOR_DEFAULTS[key]);
        } else if (key === "arms") {
            // (Its place among its fields held, till its weapon, boots and place in a line are read: below)
            actor.arms = null;
        }
    }

    for (const key in kept) {
        if (!Object.hasOwn(actor, key)) {
            actor[key] = kept[key];
        }
    }

    if (!armed) {
        actor.arms = structuredClone(armsFor(actor));
    }

    return actor;
}

/** A battle's snapshot (battle.js snapshot's) with each of its characters as it's kept (spareActor). */
export function spareBattle(battle) {
    return { ...battle, actors: battle.actors.map(spareActor) };
}

/** A battle's snapshot as it's kept, whole again for the battle to carry on from (Battle.restore). */
export function wholeBattle(battle) {
    return { ...battle, actors: battle.actors.map(wholeActor) };
}
