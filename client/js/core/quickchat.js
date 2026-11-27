// The quick chat's phrases (the scaling plan's 2-36; Nanny Mode N-1): one table, each phrase by
// an id, for the party menu's quick buttons and the lines over a controller's keyboard.
//
// A phrase travels as its id beside its words ({ kind: "chat", text, quick: id }): the host
// looks the id up and says the table's words, whatever came with it, and marks the line `quick`
// as it's passed on. So the host can tell a phrase chosen from words typed, which sent as text
// alone it couldn't: a line typed to say the same isn't `quick`. The words still travel, so a
// game that knows nothing of ids shows the line as ever.
//
// The table's rules:
//
//   - An id is a phrase's for good: never given to another, nor its words changed in meaning.
//     One that's no longer offered keeps its place here (and is still said if it's sent), with
//     `retired: true`. New phrases take the next id.
//   - No slots. A phrase with a place or a name in it would carry words the host didn't write:
//     a closed table is what lets it be the only thing a player kept from typing may say.
//   - Short enough for a chip on a phone (QUICK_MOST characters), and none a way to say what a
//     typed line is kept from saying: no numbers, no names, nothing that asks for either.

/** The longest a phrase may be (characters). */
export const QUICK_MOST = 16;

/** The phrases, by id (1 and up, none skipped). */
export const QUICK_CHAT = Object.freeze(
    [
        "On my way!",
        "Wait for me.",
        "Follow me!",
        "Help!",
        "Ready.",
        "Thanks!",
        "Well fought!",
        "Back to town.",
        "Over here!",
        "Let's go!",
        "Yes.",
        "No.",
        "Hello!",
        "Goodbye!",
        "Sorry!",
        "Not ready.",
        "Heal me!",
        "Good idea.",
    ].map((text, k) => Object.freeze({ id: k + 1, text })),
);

/**
 * Which phrases each place offers, by id, in the order shown: the party menu's quick buttons
 * (`panel`), and the lines over a controller's keyboard (`pad`).
 */
export const QUICK_SHOWN = Object.freeze({
    panel: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]),
    pad: Object.freeze([1, 2, 4, 9, 5, 6, 7, 10]),
});

/** A phrase's words, by its id; null for anything that isn't one. */
export function quickText(id) {
    return Number.isInteger(id) && id >= 1 && id <= QUICK_CHAT.length ? QUICK_CHAT[id - 1].text : null;
}

/** The phrases a place offers (QUICK_SHOWN's `where`): [{ id, text }], in its order. */
export function quickShown(where) {
    return (QUICK_SHOWN[where] ?? []).map((id) => QUICK_CHAT[id - 1]).filter((phrase) => phrase && !phrase.retired);
}
