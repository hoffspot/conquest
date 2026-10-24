// How the world's linked, as the HUD shows it in the minimap's corner (docs/GAME.md *The world's
// link*; hud.js worldLink): at home, the player's own world on this device alone, a lantern, lit;
// away, a scrying orb on its brass stand, its glow how well the link holds by how long a word
// takes there and back (LINK_QUALITY): green, amber or red, flickering once it's dropped. Away is
// in another's world (a friend's, through a world server's broker; or one on a world server), or
// in their own opened to friends who've come into it, by the slowest of their links. Tapped, it
// says so in words.
//
// Pure: the game works it out (game.js #worldLink), the HUD draws it.

/**
 * How long a word to the world and back may take for the link to be called good (`good`, ms) or
 * fair (`fair`); longer, it's poor.
 */
export const LINK_QUALITY = Object.freeze({ good: 150, fair: 400 });

// How each is said, at the end of what the orb says
const SAID = Object.freeze({ good: "The link's strong.", fair: "The link's fair.", poor: "The link's weak: expect delays.", lost: "The link's dropped: reconnecting…", timing: "Timing the link…" });

/** How well a link holds: "good", "fair" or "poor" by its round trip (`rtt`, ms; null, not timed yet: "fair"), or "lost" once it's dropped. */
export function linkQuality(rtt, { lost = false } = {}) {
    if (lost) {
        return "lost";
    }

    if (!Number.isFinite(rtt)) {
        return "fair";
    }

    return rtt < LINK_QUALITY.good ? "good" : rtt < LINK_QUALITY.fair ? "fair" : "poor";
}

/**
 * What the HUD shows of how the world's linked: { away (an orb, or the lantern at home), quality
 * (linkQuality's: away alone, else null), words (said when it's tapped, and to a screen reader) }.
 * From `joined` ({ rtt, host: the name of the one whose world it is } while in another's), or
 * `hosting` ({ guests: how many have come, slowest: the slowest of their round trips, ms } while
 * friends are in theirs); whether the link's dropped (`lost`); and who it's with and how (`about`:
 * { kind: "server", world, server } on a world server; { kind: "friend", how: "direct" or
 * "relayed" } in a friend's). Round trips said to the nearest 10 ms.
 */
export function worldLinkOf({ joined = null, hosting = null, lost = false, about = {} } = {}) {
    if (!joined && !hosting) {
        return { away: false, quality: null, words: "Your own world, here on this device." };
    }

    const rtt = joined ? joined.rtt : hosting.slowest;
    const quality = linkQuality(rtt, { lost });
    const ms = Number.isFinite(rtt) ? `${Math.max(10, Math.round(rtt / 10) * 10)} ms` : null;
    const said = lost ? SAID.lost : ms ? SAID[quality] : SAID.timing;

    if (hosting && !joined) {
        const many = hosting.guests === 1 ? "1 friend" : `${hosting.guests} friends`;

        return { away: true, quality, words: `Your world, open to friends: ${many} in it.${ms ? ` The slowest link: a word there and back in ${ms}.` : ""} ${said}` };
    }

    const where =
        about.kind === "server"
            ? `In ${about.world ?? "a world"}${about.server ? ` on ${about.server}` : ""}`
            : `In ${joined.host ? `${joined.host}'s world` : "a friend's world"}${about.how === "direct" ? ", linked directly" : about.how === "relayed" ? ", linked through the server" : ""}`;

    return { away: true, quality, words: `${where}.${ms ? ` A word there and back: ${ms}.` : ""} ${said}` };
}
