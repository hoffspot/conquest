// Promise-based asset loading with a progress callback.
import { hideScreen, showLoadingProgress, showScreen } from "./ui.js";

const imageCache = new Map();

/** Load an image once; later calls for the same URL share the same promise. */
/**
 * The picture of a map: the book's map image, or a generated map drawn from the tiles it is made
 * of (see core/mapgen.js).
 */
export async function drawMap(map) {
    if (!map.tiles) {
        return loadImage(`images/maps/${map.mapImage}`);
    }

    const tiles = await loadImage(`images/maps/${map.tileImage}`);
    const size = map.tileSize;
    const canvas = document.createElement("canvas");

    canvas.width = map.mapGridWidth * size;
    canvas.height = map.mapGridHeight * size;

    const context = canvas.getContext("2d");

    for (const [y, row] of map.tiles.entries()) {
        for (const [x, [tileX, tileY]] of row.entries()) {
            context.drawImage(tiles, tileX * size, tileY * size, size, size, x * size, y * size, size, size);
        }
    }

    return canvas;
}

export function loadImage(url) {
    if (!imageCache.has(url)) {
        const promise = new Promise((resolve, reject) => {
            const image = new Image();

            image.addEventListener("load", () => resolve(image), { once: true });
            image.addEventListener("error", () => reject(new Error(`Could not load image ${url}`)), { once: true });
            image.src = url;
        });

        // Forget failed loads so that they can be retried
        promise.catch(() => imageCache.delete(url));
        imageCache.set(url, promise);
    }

    return imageCache.get(url);
}

/**
 * Wait for a set of loading promises while showing the loading screen with a progress count.
 * @param {Promise[]} promises
 * @returns {Promise<any[]>} the results, in the same order
 */
export async function loadWithProgress(promises) {
    let loaded = 0;

    showLoadingProgress(0, promises.length);
    showScreen("loadingscreen");

    try {
        return await Promise.all(promises.map(async (promise) => {
            const result = await promise;

            showLoadingProgress(++loaded, promises.length);

            return result;
        }));
    } finally {
        hideScreen("loadingscreen");
    }
}
