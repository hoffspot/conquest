// The gods of Pellagos: the Six of the Hearth, worshipped together in every temple, each temple
// under one of them as its patron.
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
