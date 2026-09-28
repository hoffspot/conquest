// Each people's builders (their kits: peoples/*.js), for the pieces of their settlements: a
// piece whose `people` isn't human is built by its people's kit if it has a builder for that
// kind of piece (house, landmark, structure, wall, gate...), and by the human kits otherwise.

import * as cat from "./cat.js";

/** The kits, by people. */
export const PEOPLE_KITS = Object.freeze({ cat });

/** What builds a piece for its people (a function of the piece), or null for the human kits'. */
export function builderFor(piece) {
    return (piece.people && piece.people !== "human" && PEOPLE_KITS[piece.people]?.[piece.kind]) || null;
}
