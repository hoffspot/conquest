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
