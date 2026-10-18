// A place's crier calling out (docs/GAME.md *The crier*): as a player comes near him, out of a
// fight and out of a talk, he cries "Oyez! Oyez! Oyez!" and then the latest of the war's news they
// haven't heard yet, or, with none, one of the town's own cries (something lost or found, a
// bylaw, the market; by night, the hour and the watch). He never cries the same news to them again
// within a while, nor calls again sooner than his last call's wait (CALLING); the town's cries go
// round each once before any's said again. Pure data, no DOM: the game keeps what each crier's
// called to its player (app/game.js #cryOut), and shows his words over his head (app/hud.js say).

/**
 * How a crier calls out: how near the player comes (metres) before he calls; how long he waits
 * between his calls to them (ms: from and to); how long before he'll cry the same news to them
 * again (ms); and the call before his words.
 */
export const CALLING = Object.freeze({ near: 25, every: Object.freeze([45000, 60000]), again: 180000, oyez: "Oyez! Oyez! Oyez!" });

/** The town's own cries, by day and by night, between the news. */
export const CRIES = Object.freeze({
    day: Object.freeze([
        "Lost: a grey mare, white of foot, from the stables by the gate. A reward for her!",
        "Found by the well: a purse of coin. Its owner may claim it, if they can say how much!",
        "By order of the council: no swine to be let loose in the streets!",
        "The market's open! Fresh bread at the bakers', and fish come up from the river!",
        "None to throw slops from a window without crying warning three times first!",
        "Wanted at the smithy: a strong pair of hands. Good wages, and a bed!",
        "Lost: a child's wooden horse, painted red. If you've seen it, tell me!",
        "The guild wants hands against the beasts on the roads. Ask within!",
        "Strange doings out in the country! Stop and ask, and I'll tell you what's said.",
    ]),
    night: Object.freeze(["The torches are lit, and all's well!", "Lock your doors and bank your fires, good folk! All's well!", "Keep to the light after dark, good folk!", "The watch is set, and all's well!"]),
});

/**
 * How long a crier's words are shown (seconds), by how long they are: a second and a fifth, and
 * one more for each 14 characters (as subtitles are read), from 2.5 to 6.
 */
export const bubbleSeconds = (text) => Math.min(6, Math.max(2.5, 1.2 + text.length / 14));

/**
 * What a crier calls to a player now (`now`, ms), or null, too soon after his last call to them.
 * `state` is what he's called to them so far, kept by the game and changed here: { next (when he
 * may call again), said ({ words: when he last cried them }), day, night (the town's cries still
 * to go round, by their places in CRIES) }. His "Oyez!", then the latest news they haven't heard
 * (`headline`) unless he's cried it them within CALLING.again, else one of the town's own cries
 * (by day, or by `night`), taken in turn from a shuffle of them (`random`: core/random.js).
 * { lines: [the oyez, his words], news (whether it's the war's news) }.
 */
export function callOf({ now, state, headline = null, night = false, random }) {
    if (now < (state.next ?? -Infinity)) {
        return null;
    }

    const [from, to] = CALLING.every;

    state.said ??= {};
    state.next = now + from + random.next() * (to - from);

    if (headline && !(now - (state.said[headline] ?? -Infinity) < CALLING.again)) {
        state.said[headline] = now;

        return { lines: [CALLING.oyez, headline], news: true };
    }

    const when = night ? "night" : "day";
    const cries = CRIES[when];

    if (!state[when]?.length) {
        state[when] = random.shuffle([...cries.keys()]);
    }

    return { lines: [CALLING.oyez, cries[state[when].pop()]], news: false };
}
