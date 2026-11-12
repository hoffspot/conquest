// Loader hooks (never touching the repository's files): the game's modules as they are, but for
// how many chunks the overworld and its ground keep (KEEP) and how many navigation tiles
// (KEEP_TILES), set from the environment, to measure what keeping more would do.
export async function load(url, context, nextLoad) {
    const result = await nextLoad(url, context);
    const keep = process.env.KEEP_CHUNKS;
    const tiles = process.env.KEEP_TILES;

    if (keep && (url.endsWith("/client/js/core/overworld.js") || url.endsWith("/client/js/core/terrain/ground.js"))) {
        const source = result.source.toString();

        if (!source.includes("const KEEP = 256;")) {
            throw new Error(`KEEP not found in ${url}`);
        }

        return { ...result, source: source.replace("const KEEP = 256;", `const KEEP = ${Number(keep)};`) };
    }

    if (tiles && url.endsWith("/client/js/core/navigation.js")) {
        const source = result.source.toString();

        if (!source.includes("export const KEEP_TILES = 1024;")) {
            throw new Error(`KEEP_TILES not found in ${url}`);
        }

        return { ...result, source: source.replace("export const KEEP_TILES = 1024;", `export const KEEP_TILES = ${Number(tiles)};`) };
    }

    return result;
}
