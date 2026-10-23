// The player's markers on the world map (docs/GAME.md *The world map*): up to ten of their own,
// put anywhere on it, fog or no, each an icon of what it marks and a few words of their own; kept
// with the character in each world they play in (app/save.js loadMarkers), as the pin is. Each can
// be shared with their party (core/host.js, the "party" command's "mark"): every other member is
// given it, said to be from them, to keep as one of their own (if they've room for it).
//
// Pure data, no DOM.

/** How many a player may have at once (`most`), and how many letters their words may run to (`words`). */
export const MARKERS = Object.freeze({ most: 10, words: 24 });

/**
 * What a marker can mark: its icon (app/mapicons.js drawMarker), in order on the chooser: a flag,
 * a star, danger (a skull), loot (a chest), a camp (a tent), something to see (an eye), herbs (a
 * sprig) and a mystery (a question mark).
 */
export const MARKER_ICONS = Object.freeze(["flag", "star", "danger", "loot", "camp", "sight", "herbs", "mystery"]);

/** What each is called, on the chooser and in what's said. */
export const MARKER_NAMES = Object.freeze({ flag: "Flag", star: "Star", danger: "Danger", loot: "Loot", camp: "Camp", sight: "Sight", herbs: "Herbs", mystery: "Mystery" });

/**
 * A marker's words as they're kept, as a line said in a party is (core/netplay.js chatLine):
 * control characters and runs of spaces made one space, trimmed, MARKERS.words at most (an emoji
 * never halved); none (empty) if they're not words.
 */
export function markerWords(words) {
    if (typeof words !== "string") {
        return "";
    }

    return [...words.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()].slice(0, MARKERS.words).join("").trim();
}

/**
 * One marker as it's kept, or null if it isn't one: { id, x, z (metres, the world's), icon
 * (MARKER_ICONS'), words, from (who shared it with the player, or null: their own) }.
 */
export function markerOf(kept) {
    if (!kept || typeof kept !== "object" || typeof kept.id !== "string" || !Number.isFinite(kept.x) || !Number.isFinite(kept.z) || !MARKER_ICONS.includes(kept.icon)) {
        return null;
    }

    return { id: kept.id, x: kept.x, z: kept.z, icon: kept.icon, words: markerWords(kept.words), from: typeof kept.from === "string" && kept.from ? kept.from : null };
}

/** The player's markers as they were kept (each markerOf's, ids unique, MARKERS.most at most), or none. */
export function markersOf(kept) {
    const seen = new Set();

    return (Array.isArray(kept) ? kept : [])
        .map(markerOf)
        .filter((marker) => marker && !seen.has(marker.id) && seen.add(marker.id))
        .slice(0, MARKERS.most);
}

/**
 * The player's markers with another put down (`at`: [x, z] metres; its `icon`, `words`, and who
 * shared it, `from`): a new list, the new one last with an id none of the rest has; or null if
 * they've MARKERS.most already, or it isn't one (an icon there isn't, or not on the map).
 */
export function withMarker(markers, { at, icon, words = "", from = null }) {
    if (markers.length >= MARKERS.most || !Array.isArray(at) || !at.every(Number.isFinite) || !MARKER_ICONS.includes(icon)) {
        return null;
    }

    const ids = new Set(markers.map(({ id }) => id));
    let n = markers.length + 1;

    while (ids.has(`marker-${n}`)) {
        n++;
    }

    return [...markers, markerOf({ id: `marker-${n}`, x: at[0], z: at[1], icon, words, from })];
}
