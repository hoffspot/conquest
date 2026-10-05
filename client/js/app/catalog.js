// Files known by a hash of their bytes: the manifest's data (the body, its skin, the models it
// downloads before the game starts) and the catalog's models (assets.js, downloaded only as
// they're wanted). Each is fetched as path?h=hash, so each version is a different address to every
// cache, and the service worker (sw.js) keeps it for good, never checking it again. What no release
// in use lists any more, it lets go of: each page tells it its release (releaseOf), on starting.
//
// generated/asset_streaming_plan.md, sections 2 and 5.
//
// No Three.js here: this runs before it has downloaded.

/** A file's address with its hash (paths from the page). */
export function hashed(path, hash) {
    return `${path}?h=${hash}`;
}

/**
 * What this page's release keeps, as the service worker hears it: its name, and the full URLs of
 * the files it keeps by hash, the manifest's (`boot`: needed to start, so never let go of to make
 * room) and the catalog's (`assets`).
 *
 * @param {Array} manifest - The manifest's groups (manifest.js).
 * @param {object} assets - The catalog (assets.js).
 * @param {string} base - What the paths are relative to (the page).
 */
export function releaseOf(manifest, assets, base) {
    const url = (path, hash) => new URL(hashed(path, hash), base).href;

    return {
        kind: "release",
        release: assets.release,
        boot: manifest.flatMap(({ files }) => files.filter(([, , hash]) => hash).map(([path, , hash]) => url(path, hash))),
        assets: Object.values(assets.models).flatMap(({ files }) => files.map(({ path, hash }) => url(path, hash))),
    };
}
