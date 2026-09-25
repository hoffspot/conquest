// Everything characters are made from, loaded once and shared: the body (body.js) and the skin
// painter's map of the body's texture (skin.js).

import { HUMAN_URL, loadHumanData } from "./body.js";
import { loadMasks, SkinAtlas } from "./skin.js";

/**
 * Load the character kit. `textureSize` is the skin textures' size (1024 is sharp enough for
 * close-ups; 512 saves memory on small screens). `fetch` fetches its files (the game's loader
 * passes its own, which has them already).
 */
export async function loadCharacterKit({ base = HUMAN_URL, textureSize = 1024, fetch = globalThis.fetch.bind(globalThis) } = {}) {
    const human = await loadHumanData(base, fetch);
    const masks = await loadMasks(base, textureSize, fetch);
    const atlas = new SkinAtlas(human, masks, textureSize);

    return { human, atlas };
}
