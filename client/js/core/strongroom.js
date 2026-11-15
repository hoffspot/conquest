// The stash's chest (docs/GAME.md *The stash*): in every adventurers' guild's hall, the great
// chest against the east wall on the hearth's other side from the portal (insides.js GUILD, its
// `+`), which opens on the hero's own stash wherever they are (core/progress.js STRONGROOM: kept
// with their gold and pack, carried wherever they go). Every guild's chest opens the same stash.
//
// Pure data and arithmetic, no DOM: the game opens the stash beside the chest (app/game.js), and
// the host does what's asked of it only for a hero standing there (Host #strongroom).

import { hypot } from "./exact.js";

/** How near the chest (squares, from its middle) a hero must stand to use their stash. */
export const STRONGROOM_REACH = 2.5;

/** The stash's chest on a guild's hall (its map), or null. */
export function strongroomOn(map) {
    return map?.pieces?.find(({ kind }) => kind === "strongroom") ?? null;
}

/** Where one walks up to the chest to open it: the square before the middle of it ([x, y]). It stands on an east wall. */
export function beforeStrongroom(chest) {
    return [chest.x - 1, chest.y + Math.floor(chest.h / 2)];
}

/** Whether a point (squares, on the chest's map) is near enough the chest to use the stash. */
export function atStrongroom(chest, x, y) {
    return Boolean(chest) && hypot(x - (chest.x + chest.w / 2), y - (chest.y + chest.h / 2)) <= STRONGROOM_REACH;
}
