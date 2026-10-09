// What sort of person each character is: their class (a role), such as the barkeep, a serving
// wench, a patron at the tables, the innkeeper, the madam or a courtesan upstairs, the smith and
// the apprentice, the priest, an acolyte and the worshippers, a guild's receptionist, or an
// adventurer (the player, or one of the guild's); a town hall's reeve, clerk and petitioners; a
// keep's ruler, steward, councillors and sentries; a castle's quartermaster and arcanist; an
// abbey's herbalist.
//
// A role says what the character is called (its `title`, under its name in a talk: dialogue.js),
// whether it beckons the player over when they come into sight (`beckons`: the courtesans
// upstairs, BECKON), whether its part is to fight (`fights`: a keep's sentries and a watchtower's,
// the guild's adventurers; they stand their ground when danger comes near, where the rest of the
// folk run from it: battle.js #afraid), its face at rest (`mood`: a face of characters/expressions.js FACES, as
// "smiling"; none, its face at ease), and how it passes the time: five resting animations of its own, and for many
// some of an animator's clips after them (`rests`), one of which it plays every several seconds
// while the player can see it (battle.js #rest; the player, after standing a while with nothing
// going on: game.js). It picks any of them at first, then any but the last (variety.js). Everyone
// of a role shares its rests. Each rest is named, and timed like an attack (actions.js): `hitAt`
// seconds to the moment that matters (the top of a toast, a slap on the table), `duration`
// seconds in all (a clip's, `clip`: its timing in characters/clip-keys.js); the poses are
// actions.js's RESTS. A rest can make a sound (`sound`: sound.js SOUNDS, at hitAt, `volume` times
// as loud as it is).
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
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    barmaid: {
        title: "Serving wench",
        mood: "smiling",
        rests: [
            { name: "wiping her brow", hitAt: 1, duration: 2.4 },
            { name: "hand on her hip", hitAt: 1, duration: 3.2 },
            { name: "tucking back her hair", hitAt: 1, duration: 2.2 },
            { name: "a curtsy", hitAt: 0.8, duration: 1.9 },
            { name: "stretching her back", hitAt: 1, duration: 2.6 },
        ],
    },
    innkeeper: {
        title: "Innkeeper",
        rests: [
            { name: "wiping the counter", hitAt: 1.4, duration: 3.6 },
            { name: "a hand to the chin", hitAt: 1, duration: 2.8 },
            { name: "leaning on the counter", hitAt: 1.2, duration: 3.4 },
            { name: "arms folded", hitAt: 1.2, duration: 3.6 },
            { name: "rubbing the neck", hitAt: 1, duration: 2.8 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
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
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talkingSeated" },
        ],
    },
    madam: {
        title: "Madam",
        mood: "smiling",
        rests: [
            { name: "fanning herself", hitAt: 1, duration: 3 },
            { name: "hands on her hips", hitAt: 1, duration: 3.4 },
            { name: "touching her necklace", hitAt: 1, duration: 2.6 },
            { name: "drumming her fingers", hitAt: 1, duration: 2.8 },
            { name: "smoothing her gown", hitAt: 1, duration: 2.4 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    courtesan: {
        title: "Courtesan",
        mood: "smiling",
        // Seeing the player come into sight, she turns to them and beckons them into her room
        beckons: true,
        rests: [
            { name: "twirling her hair", hitAt: 1, duration: 3 },
            { name: "a slow stretch", hitAt: 1.2, duration: 3.6 },
            { name: "a hand on her hip", hitAt: 1, duration: 3.4 },
            { name: "blowing a kiss", hitAt: 1, duration: 2.8 },
            { name: "smoothing down her sides", hitAt: 1, duration: 3 },
        ],
    },
    // The smithy's: the smith, a hammer in one hand and tongs in the other, and the apprentice
    smith: {
        title: "Blacksmith",
        rests: [
            { name: "wiping the brow", hitAt: 1, duration: 2.4 },
            { name: "looking over the work", hitAt: 1, duration: 3 },
            { name: "rolling the shoulders", hitAt: 1, duration: 2.8 },
            { name: "stretching the back", hitAt: 1, duration: 2.6 },
            { name: "shifting the weight", hitAt: 1, duration: 3.2 },
        ],
    },
    apprentice: {
        title: "Apprentice",
        rests: [
            { name: "wiping the brow", hitAt: 1, duration: 2.4 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "rolling the shoulders", hitAt: 1, duration: 2.8 },
            { name: "a yawn", hitAt: 1, duration: 2.8 },
            { name: "stretching", hitAt: 1.2, duration: 3.2 },
            { name: "scratching the head", hitAt: 1, duration: 2.933, clip: "headScratch" },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    // A temple's: the priest (in white), an acolyte, and worshippers praying in the pews
    priest: {
        title: "Priest",
        rests: [
            { name: "hands folded in prayer", hitAt: 1, duration: 3.2 },
            { name: "arms raised in praise", hitAt: 1, duration: 3 },
            { name: "a bow of the head", hitAt: 0.9, duration: 2.4 },
            { name: "the sign of the Hearth", hitAt: 1, duration: 2.6 },
            { name: "hands clasped behind", hitAt: 1, duration: 3 },
        ],
    },
    acolyte: {
        title: "Acolyte",
        rests: [
            { name: "hands folded in prayer", hitAt: 1, duration: 3.2 },
            { name: "a bow of the head", hitAt: 0.9, duration: 2.4 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "the sign of the Hearth", hitAt: 1, duration: 2.6 },
            { name: "a yawn", hitAt: 1, duration: 2.8 },
        ],
    },
    worshipper: {
        title: "Worshipper",
        seated: true,
        rests: [
            { name: "praying", hitAt: 1, duration: 3.4 },
            { name: "head bowed", hitAt: 1, duration: 3 },
            { name: "looking up", hitAt: 1, duration: 2.6 },
            { name: "the sign of the Hearth", hitAt: 1, duration: 2.6 },
            { name: "hands in the lap", hitAt: 1, duration: 3 },
        ],
    },
    // An adventurers' guild's receptionist, behind her counter
    receptionist: {
        title: "Guild receptionist",
        rests: [
            { name: "a cheerful wave", hitAt: 0.9, duration: 2.4 },
            { name: "chin in her hands", hitAt: 1.2, duration: 3.6 },
            { name: "a little bow", hitAt: 0.8, duration: 1.9 },
            { name: "tidying the papers", hitAt: 1.4, duration: 3.6 },
            { name: "tucking back her hair", hitAt: 1, duration: 2.2 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    adventurer: {
        title: "Adventurer",
        fights: true,
        rests: [
            { name: "stretching", hitAt: 1.2, duration: 3.2 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "rolling the shoulders", hitAt: 1, duration: 2.8 },
            { name: "a yawn", hitAt: 1, duration: 2.8 },
            { name: "shifting the weight", hitAt: 1, duration: 3.2 },
            { name: "a cheer", hitAt: 1, duration: 2.167, clip: "cheer" },
            { name: "waving someone over", hitAt: 1, duration: 2.667, clip: "hailing" },
        ],
    },
    // A town hall's: the reeve who runs the town for its people's rulers, their clerk, and
    // petitioners waiting to be heard
    reeve: {
        title: "Reeve",
        rests: [
            { name: "arms folded", hitAt: 1.2, duration: 3.6 },
            { name: "looking over the work", hitAt: 1, duration: 3 },
            { name: "a hand to the chin", hitAt: 1, duration: 2.8 },
            { name: "hands clasped behind", hitAt: 1, duration: 3 },
            { name: "rubbing the neck", hitAt: 1, duration: 2.8 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
            { name: "listening, a hand on the hip", hitAt: 0.8, duration: 1.7, clip: "listening" },
        ],
    },
    clerk: {
        title: "Clerk",
        rests: [
            { name: "wiping the brow", hitAt: 1, duration: 2.6 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "a yawn", hitAt: 1, duration: 2.8 },
            { name: "rubbing the neck", hitAt: 1, duration: 2.8 },
            { name: "shifting the weight", hitAt: 1, duration: 3.2 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
            { name: "scratching the head", hitAt: 1, duration: 2.933, clip: "headScratch" },
        ],
    },
    petitioner: {
        title: "Petitioner",
        seated: true,
        rests: [
            { name: "waiting, head bowed", hitAt: 1, duration: 3 },
            { name: "looking about", hitAt: 1, duration: 3.2 },
            { name: "hands in the lap", hitAt: 1, duration: 3 },
            { name: "rubbing the neck", hitAt: 1, duration: 2.8 },
            { name: "looking up", hitAt: 1, duration: 2.6 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talkingSeated" },
        ],
    },
    // A keep's: the ruler on the throne (their title their people's: war/peoples.js), their
    // steward, the councillors at the table, and sentries at the door and the throne
    ruler: {
        title: "Ruler",
        seated: true,
        rests: [
            { name: "hands on the knees", hitAt: 1, duration: 3 },
            { name: "gazing over the hall", hitAt: 1, duration: 2.6 },
            { name: "looking about the hall", hitAt: 1, duration: 3.2 },
            { name: "brooding", hitAt: 1, duration: 3 },
            { name: "stroking the chin", hitAt: 1, duration: 2.8 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talkingSeated" },
        ],
    },
    steward: {
        title: "Steward",
        rests: [
            { name: "arms folded", hitAt: 1.2, duration: 3.6 },
            { name: "hands clasped behind", hitAt: 1, duration: 3 },
            { name: "a hand to the chin", hitAt: 1, duration: 2.8 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "a bow of the head", hitAt: 0.9, duration: 2.4 },
            { name: "listening, a hand on the hip", hitAt: 0.8, duration: 1.7, clip: "listening" },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    councillor: {
        title: "Councillor",
        seated: true,
        rests: [
            { name: "hands folded", hitAt: 1, duration: 3.4 },
            { name: "deep in thought", hitAt: 1, duration: 3 },
            { name: "looking about", hitAt: 1, duration: 3.2 },
            { name: "hands in the lap", hitAt: 1, duration: 3 },
            { name: "stroking the chin", hitAt: 1, duration: 2.8 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talkingSeated" },
        ],
    },
    // The townsfolk out about their business in the streets (core/townsfolk.js: their calling's
    // title theirs), at their ease a moment between errands: whatever they carry kept in their
    // right hand, the left free
    townsfolk: {
        title: "Townsfolk",
        rests: [
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "stretching the back", hitAt: 1, duration: 2.6 },
            { name: "a yawn", hitAt: 1, duration: 2.8 },
            { name: "shifting the weight", hitAt: 1, duration: 3.2 },
            { name: "a glance back", hitAt: 1, duration: 2.2 },
        ],
    },
    sentry: {
        title: "Sentry",
        fights: true,
        rests: [
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "rolling the shoulders", hitAt: 1, duration: 2.8 },
            { name: "shifting the weight", hitAt: 1, duration: 3.2 },
            { name: "arms folded", hitAt: 1.2, duration: 3.6 },
            { name: "hands clasped behind", hitAt: 1, duration: 3 },
        ],
    },
    // A people's castle's undercroft's traders (its smith and their apprentice besides): the
    // quartermaster, keeping its armoury, and the arcanist, selling what's arcane
    quartermaster: {
        title: "Quartermaster",
        rests: [
            { name: "arms folded", hitAt: 1.2, duration: 3.6 },
            { name: "looking over a blade", hitAt: 1, duration: 3 },
            { name: "wiping the counter", hitAt: 1.4, duration: 3.6 },
            { name: "rolling the shoulders", hitAt: 1, duration: 2.8 },
            { name: "rubbing the neck", hitAt: 1, duration: 2.8 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    // An abbey's herbalist, a brother or sister of its order, behind their counter
    herbalist: {
        title: "Herbalist",
        rests: [
            { name: "hands folded in prayer", hitAt: 1, duration: 3.2 },
            { name: "holding a phial to the light", hitAt: 1, duration: 3 },
            { name: "a bow of the head", hitAt: 0.9, duration: 2.4 },
            { name: "hands clasped behind", hitAt: 1, duration: 3 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
    arcanist: {
        title: "Arcanist",
        rests: [
            { name: "hands clasped behind", hitAt: 1, duration: 3 },
            { name: "holding a phial to the light", hitAt: 1, duration: 3 },
            { name: "stroking the chin", hitAt: 1, duration: 2.8 },
            { name: "a bow of the head", hitAt: 0.9, duration: 2.4 },
            { name: "looking about", hitAt: 1, duration: 3.4 },
            { name: "talking", hitAt: 1.2, duration: 3.667, clip: "talking" },
        ],
    },
});

/**
 * Beckoning (a role that `beckons`): its timing (s, as a rest's), and how long (ms) the player has
 * to have been out of sight before it beckons them again.
 */
export const BECKON = Object.freeze({ hitAt: 0.9, duration: 3.4, again: 6000 });

/**
 * What each of the folk's acts takes (s, as a rest's: its key moment and how long it all is), and
 * who does it (`by`, the role): a patron's toast, a barmaid serving and the barkeep pouring, a
 * courtesan beckoning; the smith's blows at the anvil, the work heated in the coals and quenched,
 * the apprentice's bellows and grindstone; a priest's blessing and an acolyte's candles; a notice
 * stamped and filed, and the quest board read (app/game.js ACTS, with their sounds and sparks).
 */
export const ACT_TIMES = Object.freeze({
    toast: { hitAt: 1, duration: 3.2, by: "patron" },
    serve: { hitAt: 0.8, duration: 1.8, by: "barmaid" },
    pour: { hitAt: 1, duration: 2.8, by: "barkeep" },
    beckon: { hitAt: BECKON.hitAt, duration: BECKON.duration, by: "courtesan" },
    forge: { hitAt: 0.9, duration: 2.6, by: "smith" },
    heat: { hitAt: 0.9, duration: 2.4, by: "smith" },
    quench: { hitAt: 0.8, duration: 2.2, by: "smith" },
    pump: { hitAt: 0.7, duration: 2.1, by: "apprentice" },
    crank: { hitAt: 0.9, duration: 2.6, by: "apprentice" },
    bless: { hitAt: 1, duration: 2.8, by: "priest" },
    light: { hitAt: 1, duration: 2.4, by: "acolyte" },
    stamp: { hitAt: 0.8, duration: 2.2, by: "receptionist" },
    file: { hitAt: 0.9, duration: 2, by: "clerk" },
    read: { hitAt: 0.9, duration: 2, by: "adventurer" },
});

/** How often someone rests while seen: every this many ms, give or take (at random between). */
export const REST_EVERY = Object.freeze([4000, 9000]);

/** The player rests after standing this long (ms) with nothing going on and no one to fight. */
export const PLAYER_RESTS_AFTER = 15000;
