// The world's summary (generated/multiplayer_scaling_plan.md 3-18): what a game sent views is
// told of the world beside those its hero can see: its own player's record, the war (the clock,
// the realms, who holds each town and works, the forces abroad), the parties and who's in the
// world, the invasions and what's burnt, the hell's rifts, the legends, the rules; and the
// director's props near its hero (what's on the ground, campfires, caches, finds, strangers,
// obstacles, treasures, ambushes); and where those of its party are, wherever that is, for its
// maps and its party's rows (`fellows`: the scaling plan's 3-24).
//
// It's in parts, each a table of small entries by key, so that what changes is told and nothing
// else: a town taken is that town's entry, not the war. A part's entries are the world's own
// kept forms (as a snapshot keeps them: core/host.js snapshot), each as JSON text. `Told` is what
// one player's been told so far, and says what's changed since (its patches); `Summary` is a
// game's side of it, the patches taken.
//
// The authority's side reads the world and writes nothing to it. Pure: no DOM, no network, no
// trigonometry.

import { decode, encode } from "./wire.js";

/**
 * How often a world's summary is looked at for what's changed (steps: once a second); how many
 * bytes of patches a frame takes at the most, beside its budget; and how near the hero a prop
 * must be to be told of (m, on the hero's map); and how many of the war's latest events are
 * told as its news (whole turns of them).
 */
export const SUMMARY = Object.freeze({ every: 20, frame: 6000, near: 512, news: 60 });

/** The parts that are every player's alike (worldParts), and those that are one player's (ownParts). */
export const WORLD_PARTS = Object.freeze(["rules", "clock", "realms", "towns", "works", "forces", "forts", "relations", "parties", "roster", "invasions", "burnt", "rifts", "done", "dungeons", "camps", "depots", "places", "news", "battles"]);
export const OWN_PARTS = Object.freeze(["own", "invites", "props", "fellows", "trades", "lore"]);

/** The director's props a player's told of when near: each a table of the host's, by its name there. */
export const PROPS = Object.freeze(["ground", "campfires", "caches", "finds", "strangers", "obstacles", "treasures", "ambushes"]);

// (As the wire writes it, core/wire.js: a time that's never, -Infinity, is kept as it is, where
// plain JSON would make it nothing)
const text = (value) => (value === undefined ? "null" : encode(value));

// An entry put in a table, unless it's nothing: a patch's null means an entry's gone, so one
// that's null is as one that isn't there, on both sides
function put(entries, key, value) {
    const told = text(value);

    if (told !== "null") {
        entries.set(String(key), told);
    }
}

// A list's entries by their ids (or their places in it, for one that has none)
function byId(list) {
    const entries = new Map();

    (list ?? []).forEach((one, k) => put(entries, one?.id ?? k, one));

    return entries;
}

// A table's entries by their keys
function byKey(pairs) {
    const entries = new Map();

    for (const [key, value] of pairs ?? []) {
        put(entries, key, value);
    }

    return entries;
}

const one = (value) => byKey([["", value]]);

/**
 * The parts of a world's summary that are the same for every player: { part: Map(key -> JSON
 * text) }. Made once for all who're told of it in a step.
 */
export function worldParts(host) {
    const war = host.war?.snapshot() ?? null;

    return {
        rules: one(host.rules),
        clock: one(war ? { turn: war.turn, clock: war.clock, stage: war.stage, might: war.might, victor: war.victor } : null),
        realms: byId(war?.realms),
        towns: byId(war?.towns),
        works: byId(war?.works),
        forces: byId(war?.forces),
        forts: byId(war?.forts),
        relations: one(war ? { relations: war.relations, known: war.known } : null),
        parties: byId([...host.parties.values()]),
        // (Who's in the world, as anyone may know them: not what each has and has done)
        roster: byId([...host.players.values()].map((player) => ({ id: player.id, name: player.hero?.name ?? null, race: player.hero?.race ?? null, realm: player.realm ?? null, role: player.role ?? null, away: Boolean(player.away) }))),
        invasions: byId(host.invasions),
        burnt: byId(host.burnt),
        rifts: one(host.hellRifts),
        done: one(host.done),
        dungeons: byKey(host.dungeons),
        // (The rest of the war a game shows, the plan's 3-25: the camps and depots on its maps,
        // the places cleared, its latest news, and the battles on that aren't an invasion's)
        camps: byId(war?.camps),
        depots: byId(war?.depots),
        places: one(war?.places ?? null),
        news: newsOf(war),
        battles: one([...(host.fields ?? []), ...(host.clashes?.values() ?? []), ...(host.leaders?.values() ?? [])].map(({ engagement }) => engagement).filter(Boolean)),
    };
}

// The war's latest events (SUMMARY.news of them, from the start of a turn), each by its turn
// and its place among that turn's: so what's new is told, and what's told stays as it was
function newsOf(war) {
    const log = war?.log ?? [];
    const counts = new Map();
    const keyed = log.map((event) => {
        const seen = (counts.get(event.turn) ?? 0) + 1;

        counts.set(event.turn, seen);

        return [`${event.turn}:${seen}`, event, seen];
    });
    let from = Math.max(0, keyed.length - SUMMARY.news);

    while (from < keyed.length && from > 0 && keyed[from][2] !== 1) {
        from++;
    }

    return byKey(keyed.slice(from));
}

// Where something is, as far as it says: { map, x, y }, or null
function placeOf(thing) {
    if (!thing || typeof thing !== "object") {
        return null;
    }

    // (A campfire's is its fire's, an ambush's its heart's)
    const at = Array.isArray(thing.at) ? thing.at : Array.isArray(thing.square) ? thing.square : Array.isArray(thing.fire) ? thing.fire : Array.isArray(thing.heart) ? thing.heart : typeof thing.x === "number" && typeof thing.y === "number" ? [thing.x, thing.y] : null;

    return at && typeof at[0] === "number" && typeof at[1] === "number" ? { map: typeof thing.map === "string" ? thing.map : null, x: at[0], y: at[1] } : null;
}

/**
 * The world's rare encounters (core/rare.js Legends, as kept: toJSON) as one player may know
 * them (the scaling plan's 3-29). The legends keep a good deal by player: each one's clocks
 * (how long they've been indoors and out), what each is owed, what each is marked with, who
 * the encounter out now was dealt to, who's seen it and where it is, and who's taken part in
 * each thread and vault. Told whole to everyone, as they were, each game had all of that of
 * every player. Here: their own clocks, dues and marks; the one out now only if it's theirs to
 * know of (dealt to them, seen by them or taken part in by them), and of the others in it none;
 * and of what's done, of the threads and of the vaults, no one's id but their own. What the
 * world's story is, where its threads stand and whose names are on them, is everyone's.
 */
export function loreOf(legends, me) {
    const mine = (ids) => (Array.isArray(ids) ? ids.filter((id) => id === me) : ids);
    const own = (byId) => (byId && Object.hasOwn(byId, me) ? { [me]: byId[me] } : {});
    const { active } = legends;
    const theirs = active && (active.to === me || active.told?.includes(me) || active.took?.includes(me));

    return {
        ...legends,
        clocks: own(legends.clocks),
        owed: own(legends.owed),
        marks: own(legends.marks),
        active: theirs ? { ...active, to: active.to === me ? me : null, told: mine(active.told), took: mine(active.took) } : null,
        done: (legends.done ?? []).map((one) => ({ ...one, by: mine(one.by) })),
        threads: Object.fromEntries(Object.entries(legends.threads ?? {}).map(([id, thread]) => [id, { ...thread, took: mine(thread.took), left: mine(thread.left), fell: mine(thread.fell) }])),
        vaults: Object.fromEntries(Object.entries(legends.vaults ?? {}).map(([n, vault]) => [n, { ...vault, took: mine(vault.took) }])),
    };
}

/**
 * The parts that are one player's: their own record as the world keeps it (by its fields), the
 * invitations that are theirs, and the props near their hero (within SUMMARY.near, on its map;
 * one that doesn't say where it is is told of wherever the hero is: wide, never narrow). Null if
 * they're no player of the world's.
 */
export function ownParts(host, me) {
    const player = host.players.get(me);

    if (!player) {
        return null;
    }

    const hero = host.battle.actor(me);
    const props = new Map();
    const near = SUMMARY.near * SUMMARY.near;

    for (const name of PROPS) {
        const table = host[name];
        const each = table instanceof Map ? table.entries() : (table ?? []).entries();

        for (const [key, thing] of each) {
            const place = placeOf(thing);

            if (place && hero) {
                const [dx, dy] = [place.x - hero.x, place.y - hero.y];

                if ((place.map !== null && place.map !== hero.map) || dx * dx + dy * dy > near) {
                    continue;
                }
            }

            put(props, `${name}:${thing?.id ?? key}`, thing);
        }
    }

    // (Those of their party, wherever in the world they are: where, and how they fare, to the
    // metre and the point; one in sight is told of far finer by the frames)
    const fellows = new Map();

    for (const id of host.fellows?.(me) ?? []) {
        const actor = host.battle.actor(id);

        if (actor) {
            // (One inside: where that is out in the world, and its name, which a game that hasn't
            // the building can't tell)
            const building = actor.map === "town" ? null : host.world.interiors?.of(actor.map);
            const out = building ? (building.at ?? building.door?.ends[0].arrive ?? null) : null;

            put(fellows, id, { map: actor.map, x: Math.round(actor.x), y: Math.round(actor.y), ...(actor.map === "town" ? {} : { out: out ? [Math.round(out[0]), Math.round(out[1])] : null, inside: building?.name ?? host.world.maps?.[actor.map]?.name ?? null }), hp: Math.max(0, Math.round(actor.hp)), maxHp: actor.maxHp, dead: Boolean(actor.dead) });
        }
    }

    return {
        own: byKey(Object.entries(host.keptPlayer(player, (value) => value))),
        invites: byKey([...host.invites.entries()].filter(([to, invite]) => to === me || invite?.from === me || invite?.to === me)),
        props,
        fellows,
        // (The trades they're in, asked or open, as they stand: a view told again has them,
        // which the events that told of them wouldn't be heard again to say; the plan's 3-26)
        trades: byKey([...(host.trades?.entries() ?? [])].filter(([, trade]) => trade?.from === me || trade?.to === me)),
        // (The world's rare encounters, as much of them as is this player's to know: loreOf. A
        // field an entry, so a second's telling is of their clocks and no more)
        lore: byKey(Object.entries(loreOf(host.legends.toJSON(), me))),
    };
}

/** A player's whole summary: the world's parts and their own. Null if they're no player of the world's. */
export function summaryOf(host, me, world = worldParts(host)) {
    const own = ownParts(host, me);

    return own ? { ...world, ...own } : null;
}

/**
 * What one player's been told of the summary so far. `diff(parts)` gives what's changed since
 * as patches, [[part, key, text or null (gone)]], and takes them as told.
 */
export class Told {
    #parts = new Map();

    diff(parts) {
        const patches = [];

        for (const [part, entries] of Object.entries(parts)) {
            let told = this.#parts.get(part);

            if (!told) {
                this.#parts.set(part, (told = new Map()));
            }

            for (const [key, value] of entries) {
                if (told.get(key) !== value) {
                    told.set(key, value);
                    patches.push([part, key, value]);
                }
            }

            if (told.size > entries.size) {
                for (const key of told.keys()) {
                    if (!entries.has(key)) {
                        told.delete(key);
                        patches.push([part, key, null]);
                    }
                }
            }
        }

        return patches;
    }
}

/** Patches as the JSON text a frame's section carries: [[part, key, value], ...], each value as it is. */
export const patchesText = (patches) => `[${patches.map(([part, key, value]) => `[${JSON.stringify(part)},${JSON.stringify(key)},${value ?? "null"}]`).join(",")}]`;

/**
 * A game's side of the summary: the patches it's been sent, taken. `parts` is Map(part ->
 * Map(key -> value)); `at` the last step the world said it had told everything as of.
 */
export class Summary {
    constructor() {
        this.parts = new Map();
        this.at = null;
    }

    /** Patches taken ([[part, key, value or null]]). */
    take(patches) {
        for (const [part, key, value] of patches) {
            let entries = this.parts.get(part);

            if (!entries) {
                this.parts.set(part, (entries = new Map()));
            }

            if (value === null) {
                entries.delete(key);
            } else {
                entries.set(key, value);
            }
        }
    }

    /** A part's one value (rules, clock, rifts...), or an entry of a part by its key; undefined if it's not been told. */
    get(part, key = "") {
        return this.parts.get(part)?.get(key);
    }

    /** As { part: { key: JSON text } }, the parts and keys in order: to hold to another's (textsOf). */
    texts() {
        return Object.fromEntries([...this.parts].filter(([, entries]) => entries.size).sort(([a], [b]) => (a < b ? -1 : 1)).map(([part, entries]) => [part, Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => [key, encode(value)]))]));
    }
}

/** A frame's patches (a section's text: core/wire.js), read: [[part, key, value or null]] or [[key, value or null]]. */
export const readPatches = (text) => decode(text);

/** A summary's parts (summaryOf) as { part: { key: JSON text } }, in order: what a game told all of it holds (Summary.texts). */
export function textsOf(parts) {
    return Object.fromEntries(Object.entries(parts).filter(([, entries]) => entries.size).sort(([a], [b]) => (a < b ? -1 : 1)).map(([part, entries]) => [part, Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)))]));
}
