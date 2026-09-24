// Which maps the campaign is played on: a newly generated map for each mission (the default), or
// the book's map. The choice is remembered between visits.
//
// The page's address can also choose: ?map=classic plays on the book's map, and ?seed=123 plays
// generated map 123 (handy for playing a map again, or for reporting a problem with one).

const STORAGE_KEY = "last-colony-maps";

const params = new URLSearchParams(globalThis.location?.search ?? "");

function read() {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY);
    } catch {
        return undefined;
    }
}

/** Should missions be played on the book's map? */
export function usesClassicMaps() {
    return params.has("map") ? params.get("map") === "classic" : read() === "classic";
}

export function setClassicMaps(classic) {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, classic ? "classic" : "generated");
    } catch {
        // Not remembered (private browsing, for example), but still used for this visit
    }

    if (params.has("map")) {
        params.set("map", classic ? "classic" : "generated");
    }
}

/** The map number asked for in the page's address, if any. */
export function seedFromAddress() {
    const seed = Number.parseInt(params.get("seed"), 10);

    return Number.isFinite(seed) && seed >= 0 ? seed : undefined;
}
