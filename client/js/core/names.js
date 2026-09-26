// Names for the world's people: a given name (a woman's or a man's, as the person is) and a
// byname (a trade, a place, a mark), such as "Maud Thatcher" or "Osric Blackwood". Each is drawn
// from the world's seed, so a saved world keeps its people's names; no two people in it share a
// given name or a byname. Pure data and a little shuffling, no DOM.

import { createRandom } from "./random.js";

/** Given names, by sex ("f" or "m"). */
export const GIVEN_NAMES = Object.freeze({
    f: Object.freeze([
        "Agnes", "Alys", "Amice", "Avice", "Beatrix", "Cecily", "Clemence", "Edith", "Elinor", "Elspeth", "Emma", "Gisela",
        "Gwen", "Hawise", "Isabel", "Isolde", "Joan", "Juliana", "Lettice", "Mabel", "Margery", "Matilda", "Maud", "Mirabel",
        "Muriel", "Nell", "Petronel", "Rohesia", "Rosamund", "Sybil", "Theophania", "Wymarc",
    ]),
    m: Object.freeze([
        "Aldous", "Alaric", "Baldwin", "Bertram", "Cuthbert", "Denys", "Dunstan", "Eustace", "Fulk", "Geoffrey", "Gilbert", "Godric",
        "Hamon", "Hob", "Hugh", "Jasper", "Jocelin", "Lambert", "Leofric", "Martin", "Nicol", "Osric", "Piers", "Ralf",
        "Ranulf", "Reynard", "Roger", "Simkin", "Tobias", "Wat", "Walter", "Wystan",
    ]),
});

/** Bynames: trades, places and marks. */
export const BYNAMES = Object.freeze([
    "Ashdown", "Barley", "Blackwood", "Brewer", "Brook", "Cooper", "Crane", "Dyer", "Fairfax", "Fletcher", "Glover", "Hale",
    "Hayward", "Holt", "Kemp", "Marsh", "Miller", "Nettle", "Oakes", "Pike", "Reeve", "Rowe", "Sayer", "Shepherd",
    "Stone", "Tanner", "Thatcher", "Underhill", "Wainwright", "Webb", "Wren", "Yardley",
]);

// Each world's names come from its own stream of random numbers, apart from everything else's
const NAMES_SEED = 104729;

/**
 * Name people for a world's seed: returns a copy of `people` ([{ sex: "f" or "m", ... }]), each
 * with a `name` ("Given Byname"), no given name or byname used twice.
 */
export function namePeople(people, seed) {
    const random = createRandom(seed * 31 + NAMES_SEED);
    const shuffled = (list) => {
        const copy = [...list];

        for (let k = copy.length - 1; k > 0; k--) {
            const j = random.int(0, k);

            [copy[k], copy[j]] = [copy[j], copy[k]];
        }

        return copy;
    };
    const given = { f: shuffled(GIVEN_NAMES.f), m: shuffled(GIVEN_NAMES.m) };
    const bynames = shuffled(BYNAMES);

    return people.map((person, k) => {
        const pool = given[person.sex === "m" ? "m" : "f"];

        return { ...person, name: `${pool[k % pool.length]} ${bynames[k % bynames.length]}` };
    });
}
