// Files known by a hash of their bytes: everything the manifest lists (the code, the engine, the
// body, its skin, the fonts: what the game downloads before it starts), what main.js loads itself
// (named by the page's import map), and the catalog's models (assets.js, downloaded only as they're
// wanted). Each is fetched as path?h=hash, so each version is a different address to every cache,
// and the service worker (sw.js) keeps it for good, never checking it again. What no release in use
// lists any more, it lets go of: each page tells it its release (releaseOf), on starting.
//
// generated/asset_streaming_plan.md, sections 2 and 5; generated/game_delivery_plan.md.
//
// No Three.js here: this runs before it has downloaded.

/** A file's address with its hash (paths from the page). */
export function hashed(path, hash) {
    return `${path}?h=${hash}`;
}

/**
 * A catalog entry's files, each by its name, at its full address with its hash ({ name: URL }):
 * none if the catalog hasn't the entry.
 *
 * @param {object} assets - The catalog (assets.js).
 * @param {string} entry - The entry's name.
 * @param {string} base - What the paths are relative to (the page).
 */
export function filesOf(assets, entry, base) {
    return Object.fromEntries((assets.models[entry]?.files ?? []).map(({ path, hash }) => [path.slice(path.lastIndexOf("/") + 1), new URL(hashed(path, hash), base).href]));
}

/**
 * The addresses with a hash an import map names (its text: the page's, index.html), each in full:
 * the modules main.js loads itself, and every other (none if it can't be read).
 */
export function mappedOf(text, base) {
    let imports = {};

    try {
        imports = JSON.parse(text ?? "{}").imports ?? {};
    } catch {
        // (None)
    }

    return [...new Set(Object.values(imports).filter((target) => /\?h=[0-9a-f]{10}$/.test(target)).map((target) => new URL(target, base).href))];
}

/**
 * What this page's release keeps, as the service worker hears it: its name, and the full URLs of
 * the files it keeps by hash, the manifest's and the page's own modules' (`boot`: needed to start,
 * so never let go of to make room) and the catalog's (`assets`).
 *
 * @param {Array} manifest - The manifest's groups (manifest.js).
 * @param {object} assets - The catalog (assets.js).
 * @param {string} base - What the paths are relative to (the page).
 * @param {Array<string>} [modules] - The page's modules at their hashed addresses, in full (mappedOf).
 */
export function releaseOf(manifest, assets, base, modules = []) {
    const url = (path, hash) => new URL(hashed(path, hash), base).href;

    return {
        kind: "release",
        release: assets.release,
        boot: [...new Set([...manifest.flatMap(({ files }) => files.filter(([, , hash]) => hash).map(([path, , hash]) => url(path, hash))), ...modules])],
        assets: Object.values(assets.models).flatMap(({ files }) => files.map(({ path, hash }) => url(path, hash))),
    };
}
