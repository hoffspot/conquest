// Each people's builders (their kits: peoples/*.js), for the pieces of their settlements: a
// piece whose `people` isn't human is built by its people's kit if it has a builder for that
// kind of piece (house, landmark, structure, wall, gate...), and by the human kits otherwise.

import * as catHouses from "./cat.js";
import * as catLandmarks from "./cat-landmarks.js";
import * as catPlaces from "./cat-places.js";
import * as orcHouses from "./orc.js";
import * as orcPlaces from "./orc-places.js";
import * as lizardHouses from "./lizard.js";
import * as lizardPlaces from "./lizard-places.js";

/** The kits, by people: each a builder for each kind of piece they build, and what the building lab shows. */
export const PEOPLE_KITS = Object.freeze({
    cat: { house: catHouses.house, landmark: catLandmarks.landmark, structure: catPlaces.structure, wall: catPlaces.wall, gatehouse: catPlaces.gatehouse, tower: catPlaces.bastion, GALLERY: { ...catHouses.GALLERY, structures: catPlaces.STRUCTURE_SIZES } },
    lizard: { house: lizardHouses.house, landmark: lizardPlaces.landmark, structure: lizardPlaces.structure, wall: lizardPlaces.wall, gatehouse: lizardPlaces.gatehouse, tower: lizardPlaces.lookout, GALLERY: { ...lizardHouses.GALLERY, structures: lizardPlaces.STRUCTURE_SIZES } },
    orc: { house: orcHouses.house, landmark: orcPlaces.landmark, structure: orcPlaces.structure, wall: orcPlaces.wall, gatehouse: orcPlaces.gatehouse, tower: orcPlaces.lookout, GALLERY: { ...orcHouses.GALLERY, structures: orcPlaces.STRUCTURE_SIZES } },
});

/** What builds a piece for its people (a function of the piece), or null for the human kits'. */
export function builderFor(piece) {
    return (piece.people && piece.people !== "human" && PEOPLE_KITS[piece.people]?.[piece.kind]) || null;
}
