// What's written down and left where it was, to be found and read there (docs/WILDS.md *The
// Tower of Sar Mordal*): the wizard Sinclair's journal, open on his lectern in his study at the
// top of the Tower of Sar Mordal (core/insides.js RIFT_STUDY, its floor's `writing`). Read there
// (app/game.js: tapped, walked up to), it's kept with the character in their world (talks'
// memory.writings), and to be read again from their journal (app/journal.js *Writings*). Only the
// player's own game shows it: nothing of it is the host's.
//
// Pure data and arithmetic, no DOM.

import { hypot } from "./exact.js";

/**
 * Each writing: its title, whose it was (`by`), where it's found (`found`), and its entries, each
 * a page: its heading (a date, or how it's written where there's none), how it's written if
 * that's to be said (`hand`), its paragraphs (`text`), and who signed it (`signed`).
 */
export const WRITINGS = Object.freeze({
    sinclair: Object.freeze({
        title: "The journal of Sinclair of Sar Mordal",
        by: "Sinclair, the wizard of Sar Mordal",
        found: "On the lectern in Sinclair's study, at the top of the Tower of Sar Mordal",
        entries: Object.freeze([
            {
                heading: "The 3rd of Thawmonth, the Year of the Pale Comet",
                text: [
                    "Sar Mordal: “the High Watch”, in the old tongue. It was a ruin when Maren and I came here, and the shepherds crossed themselves when we asked the way. Now it is a home. My study is at the top of it, where the wind can't reach my candles, and Maren has the hall below for her loom and her lute.",
                    "She says I have married the tower and taken her as a mistress. She is half right. I have found what I came for. The world is thin here. There are places where its skin wears thin, as a cloak wears thin at the elbow, and through them, I am sure of it, other worlds press close against ours, as close as the pages of a shut book.",
                ],
            },
            {
                heading: "The 19th of Thawmonth",
                text: [
                    "The Oculus is finished: a lens of black glass I have ground for a year, set in a ring of silver and cold iron. Tonight I chalked a circle in the grass at the tower's foot, where the thin place is, and looked through it.",
                    "I saw a red sky. Under it, things moved, as big as hills and as slow as tides, glowing along their backs like coals that are blown on. I watched until the candles guttered and the dew soaked through my knees. I have never been so happy, nor so afraid.",
                ],
            },
            {
                heading: "The 2nd of Seedmonth",
                text: [
                    "Maren hears scratching in the walls at night. Rats, I told her. She says rats don't scratch in time with her heart.",
                    "She is planting rosemary and rue round the door, “for keeping out what wants in”. I humour her. I have seen the other side, and nothing there knows we exist. The Oculus only looks.",
                ],
            },
            {
                heading: "The 30th of Seedmonth",
                text: [
                    "It no longer only looks. When I turn the ring, the glass grows warm in my hands, and the air in the circle smells of storms and of the sea. Something on the other side presses back against it, the way a hand presses back against a door.",
                    "I have written to no one of this. Who would believe me? Who would stop me?",
                ],
            },
            {
                heading: "The 11th of Highsun",
                text: [
                    "The great working. I drew the circle three times over in silver, lit the nine candles, and spoke the opening backwards, as the old books say it must be spoken. I meant to tear the thin place wide enough to put my hand through.",
                    "The circle flared, and went dark. The lens cracked from rim to rim. Nothing. A year's work, and nothing.",
                    "I am going to sleep here at my desk. Maren will laugh at me in the morning, and I will deserve it.",
                ],
            },
            {
                heading: "Undated",
                hand: "The ink is blotted, the hand shaking.",
                text: [
                    "There was no morning. I woke to cold, and to the door below standing open.",
                    "The circle wasn't dark. It was open: from their side. A seam of green light stood in the air over it, and they came through it, and in at our door, while I slept over my failure. She called for me. I know she called for me, and I slept.",
                    "The walls of the hall are scored with claws no wider than a man's hand. Those were not the great ones from the red sky. They were small, and quick, and hungry. The tower stinks of lightning and the sea.",
                ],
            },
            {
                heading: "The 14th of Highsun",
                text: [
                    "I understand now. When I looked through the Oculus, they looked back. Every night I spent at that glass, I was showing them the way. My working didn't fail. It knocked on a door, and they opened it.",
                    "I buried her among her rosemary, by the door she planted it to keep. I cannot write her name again.",
                ],
            },
            {
                heading: "The 20th of Highsun",
                text: [
                    "The rift breathes. It is wider at dusk and narrower at noon, but it never closes now, and its light is the green of deep water. I have barred the door. The bar won't hold forever.",
                    "If I close it from this side, they will only find another thin place, somewhere I can't watch it. So I won't close it. I'll go through.",
                ],
            },
            {
                heading: "The 21st of Highsun",
                text: [
                    "To whoever finds this: the rift isn't my door any more. It's theirs. Don't go near it after dusk. Don't look into the green. Small things come through it, and sometimes, when it yawns wide, something else: a thing the size of a hill, walking out of the red sky and into ours. Warn the towns.",
                    "I have taken my staff, my lamp and the last of the silver. Maren, I am coming. Whatever they are, they will learn what it costs to take what is mine.",
                ],
            },
            {
                heading: "Years later",
                hand: "Another hand, in pencil.",
                text: ["Found this on the lectern, under the dust. No sign of the wizard. Something big came out of the light by the old tower last night and went down toward the road, as big as the tower itself. I'm telling the guild. I'm not staying."],
                signed: "A scout of the Adventurers' Guild",
            },
        ]),
    }),
    // (Tamsin's last note, found on what's left of the Lantern Company in the ruins of Harrowstone
    // quarry: core/rare.js THREADS harrowstone, given as its first step's done)
    tamsin: Object.freeze({
        title: "A note in Tamsin's hand",
        by: "Tamsin of the Lantern Company",
        found: "Folded in a belt pouch among the Lantern Company's remains, in the ruins of Harrowstone quarry",
        entries: Object.freeze([
            {
                heading: "At dusk",
                hand: "Pencil, pressed hard.",
                text: [
                    "We found it at dusk, standing in the old pit as if it was waiting for the morning shift. Bram went in first with his shield up. The shield lasted one blow.",
                    "It doesn't tire. It doesn't bleed. Corwin's light only makes the crystal in its chest flicker, violet, like a bad tooth. Ilsa's arrows break on it. When we keep back it tears rocks out of the hillside and throws them: watch the ground, the shadow comes before the rock does.",
                ],
            },
            {
                heading: "Later",
                hand: "The same pencil, the lines running downhill.",
                text: [
                    "Venn's runes are still cut along its arms. If I could read them I could stop it. I can't. Corwin can't walk. We're going to try to get out by the cutting on the far side while it's at the cranes.",
                    "If you find this, take it to my teacher at the guild, and say I'm sorry. Say the crystal was flawed. Venn never knew. Someone should know.",
                ],
                signed: "T.",
            },
        ]),
    }),
    // (The Orc King's orders, found on his raid leader among the ashes of the border village his
    // raiders burned: core/rare.js THREADS ironcrown, given as its first step's done. A word in it of
    // the brother he cast out, the Orc Reaver, never named as such)
    ironcrown: Object.freeze({
        title: "The Orc King's orders",
        by: "Vorgash, the Orc King, by his scribe's hand",
        found: "Rolled tight in a leather case on Grukk of the Gravemaw, the raid leader, among the ashes of the border village",
        entries: Object.freeze([
            {
                heading: "To Grukk of the Gravemaw",
                hand: "A careful scribe's hand in the common tongue, the Iron Crown pressed into black wax beneath.",
                text: [
                    "The King sends this to Grukk. Burn the village by the marches as you burned the last. Take the grain, drive off the herds, leave the well. Let them see the smoke from their walls and know whose land this is now.",
                    "Do not wait for whoever comes after. Fall back to the war camp by the second night. Ironjaw and Bloodtusk hold it with me, and any chief who wants his share of the plunder can come to my fire and ask for it.",
                ],
            },
            {
                heading: "Below, in another hand",
                hand: "Scratched with a knife's point, in the orcs' own tongue.",
                text: [
                    "If you meet Urzag's outlaws on the hill roads, kill them. If he comes himself, send him to me. My brother chose the hills and the company of thieves over his own blood. He wears my mark on his back still. I would see it once more before I take his head.",
                ],
                signed: "V.",
            },
        ]),
    }),
    // (The knight Maelis's last note, found on her at the Sundered Ring, where Vharzul the Greenflame
    // burnt the three who came at midsummer: core/rare.js THREADS exile, given as its first step's done)
    maelis: Object.freeze({
        title: "A note in Maelis's hand",
        by: "Maelis, a knight of the Red Horn",
        found: "Folded in the gauntlet of a knight burnt where she fell at the heart of the Sundered Ring",
        entries: Object.freeze([
            {
                heading: "Midsummer, by day",
                text: [
                    "The stones are split as the priest said, every one of them, and burnt black on the side that faces in. Where the flat stone should be there is only glass: green, cracked, warm to the hand at noon. Tobin found sheep's bones round it and would not stay near it. Wynn says the world is thin here, thin as paper, and that the glass is where it tore.",
                    "We will wait for the dusk. Brannoc, guide my aim.",
                ],
            },
            {
                heading: "The same night",
                hand: "The hand is shaking, the ink spattered.",
                text: [
                    "It came up out of the glass as the sun went down: a lord of the Pit, as the old tales draw them, but its fire green, not red. It did not strike at once. It asked us our names, and gave us its own: Vharzul, who sat the Pit's throne before his brother threw him down and cast him up through this place.",
                    "Every gate below is keyed to the Choir's song, it said, and the Choir sing for his brother now, so the gates will not open to him. It wants a champion to go down for it. It tests whoever comes. Wynn did not last the first breath of its fire. Tobin ran, and it let him run, and then it did not.",
                ],
            },
            {
                heading: "Later",
                hand: "Barely legible, written lying down.",
                text: [
                    "It says I was nearly strong enough. It says the next may be. If you are reading this, you are the next. It will come at dusk. Do not fight it by day; you will only find stones. And whatever it promises you, remember that it was the Pit's lord before it was an exile.",
                ],
                signed: "Maelis",
            },
        ]),
    }),
    // (Hollis's notes: the guild's tracker, who went out to the Hollow Choir's camp at a hell's way
    // in after the hound that broke loose there, Ashmaw (core/rare.js THREADS unchained), found
    // where she'd been there, her dogs gone home without her)
    hollis: Object.freeze({
        title: "Hollis's tracking notes",
        by: "Hollis, a ranger of the adventurers' guild",
        found: "In a satchel, scorched, caught on a broken stake of the Hollow Choir's camp at a hell's way in",
        entries: Object.freeze([
            {
                heading: "The first morning",
                text: [
                    "The camp's as the drover said: tents in rags, the fire scattered, the Choir's robes everywhere and too few of them with anyone in them. No other beast leaves bites like these. Three mouths to every kill, side by side, as if three dogs shared one meal and never fought over it.",
                    "The chain lies across the way in, forty links of it at least, each as thick as my wrist. Not broken. Bitten. I can see the teeth marks in the iron, and the last links are gone. It wears them still.",
                ],
            },
            {
                heading: "The same day, later",
                text: [
                    "Prints as wide as a shield, four toes and the claws, sunk deep. Wherever it set a foot down the grass is burnt black, as if the ground were a hearth it walked over. Bran and Tess won't go near them. Grip went a little way and came back whining. I've never known him turn from a scent.",
                    "It goes the way a hunting dog goes, nose down, wide circles, back on itself. Looking for something. The old tale says the hound keeps the dead down. I wonder what it does when there is no way down to keep.",
                ],
            },
            {
                heading: "Dusk",
                hand: "Written fast, the last lines running off the page.",
                text: [
                    "Smoke on the rise to the north of the trail, and a sound like three bloodhounds giving tongue at once, only deeper than any hound. The dogs have bolted. Good. Let them go home.",
                    "If this is found: it is not a dumb beast. It doubled back. It was waiting for me where its prints ran out. Follow them anyway. It can be hurt; I saw it limp where it was burnt by its own chain. Keep off its jaws and out of the way of its fire, and never stand where the ground smoulders before it.",
                ],
                signed: "Hollis",
            },
        ]),
    }),
    // (Corbin's confession, given at the shrine on the moor: core/rare.js THREADS bellbound)
    corbin: Object.freeze({
        title: "Corbin's confession",
        by: "Corbin, once of the Magpies",
        found: "Folded under the silver bell, hung again over the empty pit of the shrine on the moor",
        entries: Object.freeze([
            {
                heading: "The night we came back",
                text: [
                    "We took it all. Forty fathoms of silver chain, the candlesticks, the bell off its beam. Aldous was dead, and the Order of the Bell has been dead longer, and who was going to miss it? Wren said she heard something breathing down in the pit as we drew the last of the chain up. We laughed at her.",
                    "That night the frost came. In high summer, over the whole moor, so thick the cart's wheels froze to the track. We left it there and ran, every one a different way.",
                ],
            },
            {
                heading: "The morning after",
                text: [
                    "Wren, Hob, Tam and little Jory are in the bog below the shrine. I saw them from the ridge. They are white all over, and they all face the same way, towards the shrine, as if something called them back. I didn't go down to them. My fingers have been white since that night, and they won't warm.",
                ],
            },
            {
                heading: "At the shrine",
                hand: "In a shaking hand, the ink half frozen on the page.",
                text: [
                    "I've brought back what silver I had left, and I've hung the bell again. I don't know the prayers. I don't think they'd matter now: the pit is empty, the chains I didn't sell lie broken at the bottom of it, and the frost goes off across the moor in prints as long as my arm.",
                    "Aldous would say its name when he'd had a drink. Ashkhar. The Bellbound. He said it was fire once, and the silver's cold put the fire out of it, and it hates the cold now worse than it hates us. If whoever finds this goes after it: it leaps on whoever keeps off, so keep moving, and when the ground whitens round it, get clear. Tell the guild I'm sorry.",
                ],
                signed: "Corbin",
            },
        ]),
    }),
    // (The Prior's writ, given as the Order of the Bell's cleansers are driven off the farmstead
    // they were burning: core/rare.js THREADS bellhaven)
    writ: Object.freeze({
        title: "The Prior's writ",
        by: "Osric Vane, Prior of the Order of the Bell",
        found: "Sealed in a scroll case on Brother Anselm the Cleanser, by the burning farmstead",
        entries: Object.freeze([
            {
                heading: "To Brother Anselm of the Bell, captain of the cleansing",
                hand: "A fine clerk's hand, the Great Bell pressed into blue wax beneath.",
                text: [
                    "In the name of the Six, and by the Voice of the Bell, which is their voice. The farms of the lower valley have been rung for three times, and have not come up to Bellhaven to kneel. The unrung shall not stand in the bell's hearing.",
                    "Go down with the initiates and cleanse them. Burn the shrines they keep to the old saints, and the houses round them. Leave the wells. Whoever kneels at the last may be spared, and brought up to the courts to learn the Rule.",
                ],
            },
            {
                heading: "At the foot",
                hand: "In another hand, the ink pressed so hard it has torn the page.",
                text: [
                    "The Black Choir shall see it done. Any who lift a hand against a brother of the Bell are unrung, every one, and are to be brought up to Bellhaven in chains, or cleansed where they stand.",
                ],
                signed: "Osric Vane, Prior, the Voice of the Bell",
            },
        ]),
    }),
    // (The Prior's own book, given as he falls at the top of the Keep of Bellhaven, by the Great
    // Bell: core/rare.js THREADS bellhaven; what the old Order sealed in the bell's silver)
    bell: Object.freeze({
        title: "The Prior's book",
        by: "Osric Vane, Prior of the Order of the Bell",
        found: "Beside the Great Bell, in the belfry at the top of the Keep of Bellhaven",
        entries: Object.freeze([
            {
                heading: "The first night",
                text: [
                    "I found the Rule of the Order in the ashes of the chapter-house at Wenford, half of it burned. I read what was left by the fire of its own beams, and in the spring I came up to Bellhaven alone. Not a soul in it, not a bird. Snow on the altar.",
                    "The Great Bell hung in the belfry, its clapper bound to the frame with silver chain, every link stamped with a little bell. Why would anyone chain a bell? I cut the chain, and I rang it, three times, for the Six. And it answered me.",
                ],
            },
            {
                heading: "Midsummer",
                text: [
                    "It speaks when it is still now. Not in words at first: a warmth, a certainty, like a hand on the back of my neck. Then in words. It says the Six are weary of a world grown unclean. It says the unrung must be put out as a fire is put out, before it spreads.",
                    "The Black Choir hear it too, the brothers who sleep in the belfry beneath it. They no longer sleep. They tell me it speaks to each of them in the voice he most loved: a mother, a dead wife, a master long buried. To me it speaks with the voice of the Six. Of course it does.",
                ],
            },
            {
                heading: "From the Rule of the Order",
                hand: "Copied in an older hand, on a page sewn into the back of the book, its edges burned.",
                text: [
                    "What we drew up out of the thin place under Bellhaven we could not bind in chain, for it had no body, only a voice. So we cast it into the silver of the Great Bell as the bell was made, and hung the bell over our own heads, that we might keep it, and it keep silent.",
                    "Let no brother ring it. Let the clapper stay chained. If it is rung it will speak, and it will speak with whatever voice its hearer most wishes to hear, and it will ask only to be fed.",
                ],
            },
            {
                heading: "The last page",
                hand: "In the Prior's hand again, the letters ragged.",
                text: [
                    "I read that page my first winter here, and I tore it out, and I could not burn it. I have sewn it back in. It speaks with the voice of the Six. It must. Because if it does not, then I have fed it a valley, and it is still hungry.",
                ],
                signed: "O. V.",
            },
        ]),
    }),
});

/** How near a writing's lectern (squares, from its edge) a player must stand to read it. */
export const READ_REACH = 1.5;

/**
 * The writing left on a floor (`map`: its `writing`, insides.js), and the lectern it lies on:
 * { id, piece }, or null.
 */
export function writingOn(map) {
    const piece = map?.writing && WRITINGS[map.writing] ? map.pieces?.find(({ kind }) => kind === "side-table") : null;

    return piece ? { id: map.writing, piece } : null;
}

/** Where one walks up to a lectern to read what's on it: the square before it, south ([x, y]). */
export function beforeWriting(piece) {
    return [piece.x, piece.y + piece.h];
}

/** Whether a point (squares, on its floor) is near enough a lectern to read what's on it. */
export function atWriting(piece, x, y) {
    if (!piece) {
        return false;
    }

    const dx = Math.max(piece.x - x, 0, x - (piece.x + piece.w));
    const dy = Math.max(piece.y - y, 0, y - (piece.y + piece.h));

    return hypot(dx, dy) <= READ_REACH;
}

/** The writings read (memory.writings: their ids, the first read first), with another read: each kept once. */
export function keepRead(read, id) {
    const kept = Array.isArray(read) ? read.filter((one) => WRITINGS[one]) : [];

    return WRITINGS[id] && !kept.includes(id) ? [...kept, id] : kept;
}
