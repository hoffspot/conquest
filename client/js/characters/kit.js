// Everything characters are made from, loaded once and shared: the body (body.js) and the skin
// painter's map of the body's texture (skin.js).

import { GAME_BODY, HumanData, HUMAN_URL, loadHumanFiles } from "./body.js";
import { loadMasks, SkinAtlas } from "./skin.js";
import { Lods } from "./lod.js";
import { Skins } from "./skins.js";

/**
 * Load the character kit. `textureSize` is the skin textures' size (1024 is sharp enough for
 * close-ups; 512 saves memory on small screens). `fetch` fetches its files (the game's loader
 * passes its own, which has them already).
 *
 * `elsewhere`: the skin atlas worked out off the page's thread (a second or more on a phone), and
 * skins painted there too (`skins`: skins.js): the kit comes back without its atlas, which it has
 * once `ready` resolves; nothing that paints a skin is to be made before then. Characters seen from
 * afar are drawn with fewer triangles, made there too (`lods`: lod.js).
 *
 * `body`: which body (body.js BODIES; the game's, GAME_BODY, else).
 */
export async function loadCharacterKit({ base = HUMAN_URL, textureSize = 1024, fetch = globalThis.fetch.bind(globalThis), elsewhere = false, body = GAME_BODY } = {}) {
    const files = await loadHumanFiles(base, fetch, body);
    const human = new HumanData(files.manifest, files.data);
    const masks = await loadMasks(base, textureSize, fetch, files.manifest.masks);

    if (!elsewhere) {
        const atlas = new SkinAtlas(human, masks, textureSize);

        return { human, atlas, ready: Promise.resolve(atlas) };
    }

    const kit = { human, atlas: null, skins: new Skins(), lods: new Lods() };

    kit.ready = kit.skins.analyse(files, human, masks, textureSize).then((atlas) => (kit.atlas = atlas));

    return kit;
}
