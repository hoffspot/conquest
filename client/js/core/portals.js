// The adventurers' guilds' portals: in every branch's hall, on the wall across the room from the
// quest board (insides.js GUILD), an arch whose veil opens on any other branch the player's been
// into. A character kept from before there were portals has every branch in country they'd
// uncovered open to them, as if they'd been in (Host join); after that, only those they go into.
//
// A member of the guild steps through for gold: PORTAL's so much, and so much more a kilometre
// between the two branches as the crow flies, less the higher their rank (standing.js
// GUILD_RANKS `fare`: a fifth off at Iron, and so on up to Mithril, who go free). They come out
// of the other branch's portal, their followers with them.
//
// Pure data and arithmetic, no DOM: the host charges what it says (Host #travel), and the game
// shows it (the travel map, the receptionist's words).

import { COME_IN, FACING } from "./interiors.js";
import { GUILD_RANKS } from "./standing.js";
import { guilds } from "./worldplan/plan.js";
import { hypot } from "./exact.js";

/** A step through a portal: gold, and gold more a kilometre between the branches (at Copper). */
export const PORTAL = Object.freeze({ base: 5, perKm: 7 });

/** How near the portal (squares, from its middle) a player must stand to step through it. */
export const PORTAL_REACH = 2.5;

/**
 * What a step through costs a member of `rank` (a GUILD_RANKS index; null, as for one who isn't,
 * Copper's) between two branches `metres` apart: whole gold, at least one, nothing at all for a
 * rank that goes free.
 */
export function fareOf(metres, rank) {
    const share = GUILD_RANKS[rank ?? 0]?.fare ?? 1;

    if (share <= 0) {
        return 0;
    }

    return Math.max(1, Math.round((PORTAL.base + (PORTAL.perKm * Math.max(0, metres)) / 1000) * share));
}

/** How much a rank (a GUILD_RANKS index) takes off a step through: 0 to 1. */
export function fareOff(rank) {
    return 1 - (GUILD_RANKS[rank ?? 0]?.fare ?? 1);
}

/**
 * The branch a guild's building is (a plan place's id): where the player started (its `place`
 * "home": the world's `start`), or its own; null for a building that isn't a guild's.
 */
export function branchOf(building, start) {
    if (building?.kind !== "guild") {
        return null;
    }

    return building.place === "home" ? (start?.id ?? null) : building.place;
}

/** The portal on a guild's hall (its map), or null. */
export function portalOn(map) {
    return map?.pieces?.find(({ kind }) => kind === "portal") ?? null;
}

/** Where one walks up to a portal to step through it: the square before the middle of it ([x, y]). */
export function beforePortal(portal) {
    return [portal.x - 1, portal.y + Math.floor(portal.h / 2)];
}

/**
 * Where one comes out of a portal on its map: from the square before the middle of it, on into
 * the room as far as the floor's clear, up to as far as one comes in at a door (interiors.js
 * comeIn: for the camera to look across the room from behind them), facing away from it ({
 * square, facing }). The portals stand on an east wall (insides.js GUILD).
 */
export function outOf(portal, map) {
    const [x0, y] = beforePortal(portal);
    let x = x0;

    while (x0 - x < COME_IN - 1 && x > 0 && !map.blocked[y][x - 1]) {
        x--;
    }

    return { square: [x, y], facing: FACING.w };
}

/** Whether a point (squares, on the portal's map) is near enough the portal to step through it. */
export function atPortal(portal, x, y) {
    return Boolean(portal) && hypot(x - (portal.x + portal.w / 2), y - (portal.y + portal.h / 2)) <= PORTAL_REACH;
}

/**
 * The branches a character can step through to, from `from` (a branch: plan place id), as the
 * travel map shows them: each open to them (`open`: a Set of place ids), with its place's name,
 * where it is (the place's middle: metres), how far it is from `from`, and its fare at `rank`
 * (GUILD_RANKS index); `from` among them, marked `here`. Nearest first.
 */
export function branchesFrom(plan, open, from, rank) {
    const places = guilds(plan);
    const origin = places.find(({ id }) => id === from) ?? null;

    return places
        .filter(({ id }) => open.has(id) || id === from)
        .map(({ id, name, at }) => {
            const metres = origin ? hypot(at[0] - origin.at[0], at[1] - origin.at[1]) : 0;

            return { id, name, x: at[0], z: at[1], metres, fare: fareOf(metres, rank), here: id === from };
        })
        .sort((a, b) => a.metres - b.metres);
}

/**
 * The branches open to a character kept from before there were portals: every one whose
 * settlement's middle is in country they'd uncovered (`explored`: core/explored.js), or whose hall
 * they'd been in (by its building's key, `${place}:guild-…`, or the home town's `home:guild-…`).
 */
export function branchesFound(plan, explored, start) {
    const entered = [...explored.entered].filter((key) => /:guild-/.test(key)).map((key) => key.slice(0, key.indexOf(":")));
    const been = new Set(entered.map((place) => (place === "home" ? start?.id : place)));

    return guilds(plan)
        .filter(({ id, at }) => been.has(id) || explored.visitedAt(at[0], at[1]))
        .map(({ id }) => id);
}
