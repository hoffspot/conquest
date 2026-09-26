// What sort of person each character is: their class (a role), such as the barkeep, a serving
// wench, a patron at the tables, the madam upstairs, or the player's adventurer.
//
// A role says what the character is called (its `title`, under its name in a talk: dialogue.js)
// and how it passes the time: five resting animations (`rests`), one of which it plays every
// several seconds while the player can see it (battle.js #rest; the player, after standing a
// while with nothing going on: game.js). It picks any of the five at first, then any but the
// last (variety.js). Everyone of a role shares its rests. Each rest is named, and timed like an
// attack (actions.js): `hitAt` seconds to the moment that matters (the top of a toast, a slap on
// the table), `duration` seconds in all; the poses are actions.js's RESTS. A rest can make a
// sound (`sound`: sound.js SOUNDS, at hitAt, `volume` times as loud as it is).
//
// Pure data, no DOM.

/** Every role, by id. */
export const ROLES = Object.freeze({
    barkeep: {
        title: "Barkeep",
        rests: [
            { name: "wiping the bar", hitAt: 1.4, duration: 3.6 },
            { name: "stroking his beard", hitAt: 1, duration: 2.8 },
            { name: "leaning on the bar", hitAt: 1.2, duration: 3.4 },
            { name: "arms folded", hitAt: 1.2, duration: 3.6 },
            { name: "rubbing his neck", hitAt: 1, duration: 2.8 },
        ],
    },
    barmaid: {
        title: "Serving wench",
        rests: [
            { name: "wiping her brow", hitAt: 1, duration: 2.4 },
            { name: "hand on her hip", hitAt: 1, duration: 3.2 },
            { name: "tucking back her hair", hitAt: 1, duration: 2.2 },
            { name: "a curtsy", hitAt: 0.8, duration: 1.9 },
            { name: "stretching her back", hitAt: 1, duration: 2.6 },
        ],
    },
    patron: {
        title: "Patron",
        seated: true,
        rests: [
            { name: "a toast", hitAt: 1, duration: 3.2, sound: "clink" },
            { name: "a long drink", hitAt: 1.2, duration: 3.6 },
            { name: "a belly laugh", hitAt: 1, duration: 2.8 },
            { name: "thumping the table", hitAt: 0.7, duration: 2.2, sound: "stepWood", volume: 2.5 },
            { name: "looking about", hitAt: 1, duration: 3.2 },
        ],
    },
    madam: {
        title: "Madam",
        rests: [
            { name: "fanning herself", hitAt: 1, duration: 3 },
            { name: "hands on her hips", hitAt: 1, duration: 3.4 },
            { name: "touching her necklace", hitAt: 1, duration: 2.6 },
            { name: "drumming her fingers", hitAt: 1, duration: 2.8 },
            { name: "smoothing her gown", hitAt: 1, duration: 2.4 },
        ],
    },
    adventurer: {
        title: "Adventurer",
        rests: [
            { name: "stretching", hitAt: 1.2, duration: 3.2 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "rolling the shoulders", hitAt: 1, duration: 2.8 },
            { name: "a yawn", hitAt: 1, duration: 2.8 },
            { name: "shifting the weight", hitAt: 1, duration: 3.2 },
        ],
    },
});

/** How often someone rests while seen: every this many ms, give or take (at random between). */
export const REST_EVERY = Object.freeze([4000, 9000]);

/** The player rests after standing this long (ms) with nothing going on and no one to fight. */
export const PLAYER_RESTS_AFTER = 15000;
