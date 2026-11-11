// Everything characters are made from, loaded once and shared: the body (body.js) and the skin
// painter's map of the body's texture (skin.js).

import { GAME_BODY, HumanData, HUMAN_URL, loadHumanFiles } from "./body.js";
import { expressionData } from "./expressions.js";
import { lashUVs } from "./lashes.js";
import { loadPictures } from "./mouth.js";
import { loadMasks, SkinAtlas } from "./skin.js";
import { Lods } from "./lod.js";
import { Skins } from "./skins.js";
import { heldInWardrobe, letGoOfUnused, letGoOfWardrobe } from "./wardrobe.js";

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
    const [masks, pictures] = await Promise.all([loadMasks(base, textureSize, fetch, files.manifest.masks, files.manifest.skin), loadPictures(base, fetch, files.manifest.pictures)]);

    // (Its own pictures: the mouth's inside's, mouth.js)
    human.pictures = pictures;

    // (The face's expressions and the lashes' strands laid out now, as it loads, rather than as
    // the first character's built: some tens of milliseconds)
    expressionData(human);
    lashUVs(human);

    if (!elsewhere) {
        const atlas = new SkinAtlas(human, masks, textureSize);

        return { human, atlas, ready: Promise.resolve(atlas) };
    }

    const kit = { human, atlas: null, skins: new Skins(), lods: new Lods() };

    kit.ready = kit.skins.analyse(files, human, masks, textureSize).then((atlas) => (kit.atlas = atlas));

    return kit;
}

/**
 * Everything of a kit's that's idle let go of now, all of it made again when it's next wanted:
 * the pictures of outfits no one's wearing and of looks of eye no one has (two of each are kept
 * else), each garment's own picture that no one's drawing with (kept 30 seconds after its last
 * use else), and what's kept for painting garments faster (wardrobe.js). For when the page is
 * short of memory (app/game.js: the memory guard, as it goes up a level).
 */
export function letGoOfIdle(kit) {
    letGoOfWardrobe(kit);
    letGoOfUnused(kit.eyes, 0, (texture) => texture.dispose());
}

/**
 * How many bytes a kit holds on the page (for the game's count of its memory: app/game.js
 * memoryNow): its wardrobe's pictures (each garment's own, each outfit's, the painters' own:
 * wardrobe.js), its looks of eye's, and the body's and the skin atlas's own data. Each buffer's
 * counted once. What's on the graphics card isn't counted (world/gpumemory.js counts that), nor
 * what its characters hold themselves (world/release.js heldOnPage).
 */
export function heldByKit(kit) {
    const seen = new Set();
    let bytes = heldInWardrobe(kit, seen);
    const count = (data) => {
        if (ArrayBuffer.isView(data) && !seen.has(data.buffer)) {
            seen.add(data.buffer);
            bytes += data.buffer.byteLength;
        }
    };

    // (A look of eye's picture is a canvas: four bytes a pixel)
    for (const { value } of kit.eyes?.values() ?? []) {
        bytes += (value.image?.width ?? 0) * (value.image?.height ?? 0) * 4;
    }

    // (The body's data and the skin atlas's: whatever they keep in buffers, and in lists of them)
    for (const part of [kit.human, kit.atlas, kit.atlas?.fields]) {
        for (const value of Object.values(part ?? {})) {
            for (const data of Array.isArray(value) ? value : [value]) {
                count(data);
            }
        }
    }

    // (The atlas's gutter is a list of numbers)
    bytes += (Array.isArray(kit.atlas?.gutter) ? kit.atlas.gutter.length : 0) * 8;

    return bytes;
}
