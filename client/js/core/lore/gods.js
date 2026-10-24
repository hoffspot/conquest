// The gods of Pellagos: the Six of the Hearth, worshipped together in every temple, each temple
// under one of them as its patron; and the six gods of the wide world, the Wild Six, worshipped
// at the wayside shrines with the Six (core/shrines.js), never in a temple.
//
// In the beginning there was only the Silence, and in it one ember: the Hearth. It burned alone
// for an age of ages, and in its loneliness it broke into six sparks, and each spark woke as a god.

export const GODS = Object.freeze({
    aurelia: {
        name: "Aurelia",
        title: "the Dawnmother",
        domain: "life, health and vigour",
        colours: ["#e2b64a", "#5f8f3a"],
        symbol: "a golden sun rising over a green bough",
        story: "Aurelia was first to wake, and she breathed on the cold world until it greened. Every heartbeat is a spark of her dawn; the sick are healed in her name, fields bless the harvest with her, and the strong give thanks to her for their strength.",
        festival: "Midsummer, the Longest Light",
        sayings: ["May your dawn be long.", "Aurelia keep your blood warm."],
    },
    brannoc: {
        name: "Brannoc",
        title: "the Red Horn",
        domain: "battle and the hunt",
        colours: ["#9a2b22", "#b58a4a"],
        symbol: "a stag's antlers over a crossed spear and bow",
        story: "Brannoc woke hungry, and ran the whole world in a night, horn to his lips. He taught the first people to hunt, and when the Hollow One came against the Hearth he stood before its door. Soldiers swear by his horn; hunters leave him the first cut of every kill.",
        festival: "The First Frost, when the herds come down",
        sayings: ["Brannoc guide your aim.", "Horn and blood, friend."],
    },
    ithriel: {
        name: "Ithriel",
        title: "the Veiled Star",
        domain: "magic and the arcane",
        colours: ["#6b4a9a", "#b8c0d0"],
        symbol: "an eye within a seven-pointed star",
        story: "Ithriel woke looking up, and in the stars she read how the world was made. She wove those laws into a veil and hid it, for they are too sharp for most hands; those who find a thread of it are mages. Scholars light a candle to her before they open a book.",
        festival: "The Night of Falling Stars, in late summer",
        sayings: ["May Ithriel lift the veil.", "Mind the thread you pull."],
    },
    morvaine: {
        name: "Morvaine",
        title: "the Keeper of the Last Gate",
        domain: "death and what lies after",
        colours: ["#2a2a30", "#c8c8c0"],
        symbol: "a lantern hanging from a key",
        story: "Morvaine woke last, and saw that everything the others made would one day end. Grieving, he built the Last Gate at the edge of the world and waits there with his lantern, so no soul need cross in the dark. He is gentle, and patient, and never late.",
        festival: "The Long Night, at midwinter",
        sayings: ["Morvaine keep your lantern lit.", "The Gate is patient."],
    },
    seliane: {
        name: "Seliane",
        title: "the Rose of Evening",
        domain: "love and romance",
        colours: ["#b8465a", "#f0e4d8"],
        symbol: "a red rose twined through two rings",
        story: "Seliane woke to find the others busy and cold, and she laughed, and the laugh made them turn and see each other. She taught hearts to find one another across a crowded room; lovers leave roses at her shrine, and weddings are made before her.",
        festival: "The Feast of Roses, in spring",
        sayings: ["Seliane smile on you.", "May your roses never wilt."],
    },
    dunmar: {
        name: "Dunmar",
        title: "Anvilhand",
        domain: "skills, crafts and trades",
        colours: ["#3c5a7a", "#b07a3a"],
        symbol: "a hammer crossed with a chisel over an anvil",
        story: "Dunmar woke with his hands already moving, and he built the hills and hollowed the rivers. He taught people every craft there is: the smith's, the mason's, the weaver's and the baker's. Every guild keeps his mark over its door, and apprentices swear their oaths to him.",
        festival: "Hammerday, the first day of autumn",
        sayings: ["Steady hands, by Dunmar.", "Measure twice, as Dunmar taught."],
    },
});

/** The seventh spark, which went out: the enemy of the Six, whose shadow made the orcs. */
export const HOLLOW_ONE = Object.freeze({
    name: "the Hollow One",
    story: "When the Hearth broke there was a seventh spark, and it would not wake; it only wanted, and fed on the others' light. The Six drove it into the dark under the world, but its hunger seeps out still, and the orcs are what it made of the first hunters it caught.",
});

/** The gods' ids, in the order they woke. */
export const GOD_IDS = Object.freeze(Object.keys(GODS));

/**
 * Which of the Six a temple is under (its patron: its main altar is theirs, the others' shrines
 * round it), from a random of the place's own; a big place's temple more likely to Aurelia or
 * Dunmar, a small one's to anyone.
 */
export function patronOf(random) {
    return random.pick(GOD_IDS);
}

/**
 * The gods of the wide world, the Wild Six: not the Hearth's sparks but the world's own, worshipped
 * at the wayside shrines out in the land (core/shrines.js), each shrine to one of them or to one
 * of the Six; never in a temple. Lunara's are the rings of standing stones.
 */
export const WILD_GODS = Object.freeze({
    tharos: {
        name: "Tharos",
        title: "the Thunderlord",
        domain: "the sky, storms and kings",
        colours: ["#3a5a8a", "#e8e0b0"],
        symbol: "a crown of three lightning bolts",
        story: "Tharos was born of the first storm that broke over the Hearth's smoke, and he has ruled the sky since. Kings swear by his crown, and when thunder rolls over the hills the old folk say he is counting his lightning. He favours the bold and strikes down the oathbreaker.",
        festival: "The Day of Thunders, when the summer storms come",
        sayings: ["By the Thunderlord's crown.", "May Tharos hold his hand."],
    },
    nerreth: {
        name: "Nerreth",
        title: "the Deep-Caller",
        domain: "the sea, the rivers and all deep water",
        colours: ["#1f5a6a", "#9ad0c8"],
        symbol: "a trident wound with kelp",
        story: "Nerreth lay down in the Hearth's tears and became the sea. He keeps every river that runs to him and every drowned thing they carry. Fishers leave him the first of the catch, and sailors pour wine over the side before they sail out of sight of land.",
        festival: "The Turning Tide, at the spring equinox",
        sayings: ["Nerreth keep you afloat.", "The Deep remembers."],
    },
    ceryn: {
        name: "Ceryn",
        title: "the Harvest Mother",
        domain: "fields, flocks and plenty",
        colours: ["#c89a3a", "#7a5a2a"],
        symbol: "a sheaf of wheat bound with a red ribbon",
        story: "Ceryn walked behind Aurelia's dawn and planted where it fell. Every furrow is hers and every full barn a gift of hers; the last sheaf of each harvest is plaited into her likeness and kept over the door till spring.",
        festival: "Harvest Home, when the last sheaf is cut",
        sayings: ["Ceryn fill your barn.", "May your bread rise."],
    },
    lunara: {
        name: "Lunara",
        title: "the Silver Lady",
        domain: "the moon, the night and the old stones",
        colours: ["#c8d0e0", "#3a3a6a"],
        symbol: "a crescent moon over a ring of stones",
        story: "Lunara is the Hearth's reflection in the dark water, and she watches over all that walks by night. The rings of standing stones are her roads: on the right night, under the right moon, they carry those who step into them from one ring to another. Wolves sing to her and hunters by night pray she lights their way.",
        festival: "The Silver Night, the first full moon of autumn",
        sayings: ["Lunara light your road.", "By the Silver Lady."],
    },
    wick: {
        name: "Wick",
        title: "the Wayfarer",
        domain: "roads, luck and clever hands",
        colours: ["#6a7a3a", "#d8b060"],
        symbol: "a coin with a door on each face",
        story: "Wick was a spark that would not settle; it ran off down the first road the world had and has never stopped. He is the god of travellers and traders, of the lucky throw and the light-fingered. Coins left at his shrines are gone by morning, and no one minds.",
        festival: "Fools' Day, at the turn of the year",
        sayings: ["Wick turn your coin.", "Luck on your road."],
    },
    bacchar: {
        name: "Bacchar",
        title: "the Merry Lord",
        domain: "wine, feasts and revels",
        colours: ["#7a2a5a", "#d0a040"],
        symbol: "a cup wreathed in vines",
        story: "Bacchar found the first grapes rotting on the vine, and laughed, and made wine of them. He loosens tongues and mends quarrels, and makes cowards brave for an evening; every tavern keeps a cup for him on the high shelf, filled and never drunk.",
        festival: "The Pressing, when the grapes come in",
        sayings: ["Bacchar fill your cup.", "To the Merry Lord."],
    },
});

/** Every god there is, the Six of the Hearth and the Wild Six: those the shrines are to. */
export const PANTHEON = Object.freeze({ ...GODS, ...WILD_GODS });

/** The twelve's ids: the Six in the order they woke, then the Wild Six. */
export const PANTHEON_IDS = Object.freeze(Object.keys(PANTHEON));
