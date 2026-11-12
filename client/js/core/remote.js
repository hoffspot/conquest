// The link seam (generated/multiplayer_scaling_plan.md 3-2): all a game played in someone else's
// world asks of its link to that world, in one place. app/game.js knows the link as `remote` and
// reaches it through nothing but the members below; app/main.js and the debug overlay likewise.
// So a second way of being linked to a world can stand where the first does, with the game none
// the wiser.
//
// There is one implementation: netplay.js's Joining, lockstep, which holds a copy of the whole
// world and plays the host's steps (`step` plays one of them into that copy). What's its own and
// not the seam's stays off this list, for its tests and the debug overlay's line alone: how often
// the copy's been checked, found astray and sent again (checks, desyncs, resyncs, skips, resync),
// and the link's own timings (rtt, jitter, trips). A link that keeps no copy has none of those.
//
// A member added here is added to every implementation; test/remote.test.js fails for one the
// game uses that isn't here, and for one here the game doesn't use.

/** What the game asks of its link, by what kind of thing each is, each with what it's for. */
export const REMOTE = Object.freeze({
    /** Called by the game. */
    does: Object.freeze({
        step: "The world moved on one step, if the next is due: the events it made, or null if there's none to play yet",
        pace: "How fast to play, as a share of the clock's time, over `ms` of it: a little slower with too few steps in hand, quicker with too many",
        command: "The player's command sent to the world (`then` told what came of it): { seq }, its number",
        ping: "The link timed: a word there and back",
        hold: "The player's game stopped or going again (and, an owner's, the world for everyone)",
        chat: "A line said to the player's party, or a direct message (`to`): { ok } or { ok: false, reason }",
        takeDms: "Which direct messages the player takes ({ party, world })",
        clock: "The time (ms), as the link times things by it",
    }),
    /** Read by the game. */
    tells: Object.freeze({
        self: "The player's own hero as the world last told of them ({ time, seq, hero, at }), or null",
        behind: "How many of the world's steps are waiting to be played",
        delay: "How many steps it means to keep in hand",
        inHand: "How many it's had in hand lately",
        lately: "A word there and back, as lately timed (ms), or null",
        paused: "Why the world's stopped ({ why, by }), or null while it's going",
        farBehind: "Whether it's fallen too far behind and is being brought up to date",
        received: "How many bytes it's heard, by kind (for the debug overlay)",
    }),
    /** Set by the game, to be told. */
    hears: Object.freeze({
        onSelf: "The world's word of the player's own hero, as it's heard",
        onWay: "A way the world found for someone (id, way), as it's heard, before it's played; or null for none",
        onChat: "A line said in the player's party, or a direct message",
        onUnsaid: "Why a line of the player's wasn't said",
    }),
});

/** Every member of the seam, by name. */
export const REMOTE_MEMBERS = Object.freeze(Object.values(REMOTE).flatMap((group) => Object.keys(group)));

/**
 * `link` as a game's `remote`: itself, if it has every member of the seam (what's called can be
 * called, the rest are there to read or set); else an error naming what it lacks, where the game
 * would otherwise fail later and further off.
 */
export function asRemote(link) {
    const lacks = [...Object.keys(REMOTE.does).filter((name) => typeof link?.[name] !== "function"), ...[...Object.keys(REMOTE.tells), ...Object.keys(REMOTE.hears)].filter((name) => link === null || typeof link !== "object" || !(name in link))];

    if (lacks.length) {
        throw new TypeError(`Not a link a game can play over (core/remote.js REMOTE): it has no ${lacks.join(", ")}.`);
    }

    return link;
}
