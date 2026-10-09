// The war table in each keep's great hall (insides.js KEEP), the map of the war spread over it for
// the council to read (docs/WAR.md *The war table*, M21). A Knight or above of the people whose keep
// it is, or of a people under the same liege, reads it there: the battle map (app/battlemap.js),
// with what their people and their friends see now (war.js sight) shown as it is, live.
//
// Pure data and arithmetic, no DOM.

import { hypot } from "./exact.js";
import { OPENS } from "./standing.js";

/** How near the war table (squares, from its nearest edge) a player must stand to read it. */
export const TABLE_REACH = 1.5;

/** The war table in a keep's great hall (its map), or null. */
export function warTableOn(map) {
    return map?.pieces?.find(({ kind }) => kind === "war-table") ?? null;
}

/** Where one walks up to the war table to read it: the square before the middle of its south side ([x, y]). */
export function beforeWarTable(table) {
    return [table.x + Math.floor(table.w / 2), table.y + table.h];
}

/** Whether a point (squares, on the war table's map) is near enough it to read it. */
export function atWarTable(table, x, y) {
    if (!table) {
        return false;
    }

    const dx = Math.max(table.x - x, 0, x - (table.x + table.w));
    const dy = Math.max(table.y - y, 0, y - (table.y + table.h));

    return hypot(dx, dy) <= TABLE_REACH;
}

/**
 * Whether a player of the people `realm`, of rank `rank` (standing.js STANDINGS' index), may read
 * the war table in a keep of a town held by `owner` (`war`: the war): "ok"; or why not: "stranger"
 * (it isn't their people's, nor a people's under the same liege), or "rank" (they're not a Knight).
 */
export function mayRead(war, realm, owner, rank) {
    if (war.liege(owner) !== war.liege(realm)) {
        return "stranger";
    }

    return rank >= OPENS.table ? "ok" : "rank";
}
