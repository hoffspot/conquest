// Sprite sheet bookkeeping shared by every entity type.
//
// Every entity sprite sheet is a single horizontal strip of frames (one row per team colour).
// buildSpriteIndex() works out where each named animation starts inside that strip, so that
// entities can simply ask for spriteArray["healthy"] or spriteArray["stand-3"].

/**
 * @param {Array<{name: string, count: number, directions?: number}>} spriteImages
 * @returns {{spriteArray: Record<string, {name: string, count: number, offset: number}>, spriteCount: number}}
 */
export function buildSpriteIndex(spriteImages) {
    const spriteArray = Object.create(null);
    let spriteCount = 0;

    for (const { name, count, directions } of spriteImages) {
        // Animations with directions are stored once per direction, e.g. "stand-0" ... "stand-7"
        const names = directions
            ? Array.from({ length: directions }, (_, direction) => `${name}-${direction}`)
            : [name];

        for (const spriteName of names) {
            spriteArray[spriteName] = { name: spriteName, count, offset: spriteCount };
            spriteCount += count;
        }
    }

    return { spriteArray, spriteCount };
}

// Loaded sprite sheet images, keyed by "type/name". Filled in by the browser asset loader;
// the simulation itself never needs the images, which keeps it runnable under Node.
const spriteSheets = new Map();

export function spriteSheetUrl(type, name) {
    return `images/${type}/${name}.png`;
}

export function setSpriteSheet(type, name, image) {
    spriteSheets.set(`${type}/${name}`, image);
}

export function getSpriteSheet(type, name) {
    return spriteSheets.get(`${type}/${name}`);
}
