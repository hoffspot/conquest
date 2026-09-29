// Each people's builders (their kits: peoples/*.js), for the pieces of their settlements: a
// piece whose `people` isn't human is built by its people's kit if it has a builder for that
// kind of piece (house, landmark, structure, wall, gate...), and by the human kits otherwise.

import * as catHouses from "./cat.js";
import * as catLandmarks from "./cat-landmarks.js";
import * as catPlaces from "./cat-places.js";
import * as orcHouses from "./orc.js";
import * as orcPlaces from "./orc-places.js";
import * as darkElf from "./darkelf.js";
import * as elf from "./elf.js";
import * as lizardHouses from "./lizard.js";
import * as lizardPlaces from "./lizard-places.js";
import { peopleProp } from "./props.js";

/** The kits, by people: each a builder for each kind of piece they build, and what the building lab shows. */
export const PEOPLE_KITS = Object.freeze({
    cat: { prop: (piece) => peopleProp("cat", piece), house: catHouses.house, landmark: catLandmarks.landmark, structure: catPlaces.structure, wall: catPlaces.wall, gatehouse: catPlaces.gatehouse, tower: catPlaces.bastion, GALLERY: { ...catHouses.GALLERY, structures: catPlaces.STRUCTURE_SIZES } },
    darkElf: { prop: (piece) => peopleProp("darkElf", piece), house: darkElf.house, landmark: darkElf.landmark, structure: darkElf.structure, wall: darkElf.wall, gatehouse: darkElf.gatehouse, tower: darkElf.tower, GALLERY: { ...darkElf.GALLERY, structures: darkElf.STRUCTURE_SIZES } },
    elf: { prop: (piece) => peopleProp("elf", piece), house: elf.house, landmark: elf.landmark, structure: elf.structure, wall: elf.wall, gatehouse: elf.gatehouse, tower: elf.tower, GALLERY: { ...elf.GALLERY, structures: elf.STRUCTURE_SIZES } },
    lizard: { prop: (piece) => peopleProp("lizard", piece), house: lizardHouses.house, landmark: lizardPlaces.landmark, structure: lizardPlaces.structure, wall: lizardPlaces.wall, gatehouse: lizardPlaces.gatehouse, tower: lizardPlaces.lookout, GALLERY: { ...lizardHouses.GALLERY, structures: lizardPlaces.STRUCTURE_SIZES } },
    orc: { prop: (piece) => peopleProp("orc", piece), house: orcHouses.house, landmark: orcPlaces.landmark, structure: orcPlaces.structure, wall: orcPlaces.wall, gatehouse: orcPlaces.gatehouse, tower: orcPlaces.lookout, GALLERY: { ...orcHouses.GALLERY, structures: orcPlaces.STRUCTURE_SIZES } },
});

/** What builds a piece for its people (a function of the piece), or null for the human kits'. */
export function builderFor(piece) {
    return (piece.people && piece.people !== "human" && PEOPLE_KITS[piece.people]?.[piece.kind]) || null;
}
