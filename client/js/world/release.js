// The page's copies of what's been given to the graphics card and isn't read on the page again,
// let go of once it's there (three.js's onUpload and onUpdate, as its own examples do): a static
// mesh's attributes and index, a picture's pixels, a compressed picture's bytes (a model's, a
// scene's and a kit's, as they're read: art/engine/models.js). The graphics card's copy is the
// one drawn; the page's would only be read again to give it the same once more, were the drawing
// lost and given back (main.js: the game loads the page again then, where it was, rather than
// give back what's been let go of). Only for what nothing reads after it's made, or what's made
// again when it's wanted: not a mesh that's merged, cloned, posed or bent on the page. Of what
// characters wear, the kit keeps a garment's own picture, which outfits are put together from,
// only till it's been unused a while, and paints it again after; an outfit's pictures are let go
// of once they're sent, but the small copy of its colour a crowd's figure is made from
// (characters/wardrobe.js, world/crowd.js). A character's own skin is let go of in the game
// (character.js `release`: painted again whole whenever it changes, and held smaller while the
// body's seen small), the crowd's figures being made from characters of their own, before
// they're ever sent.

/** Whether anything's been let go of (the drawing, lost, can't be given it back: main.js). */
export const released = { any: false };

function dropArray() {
    this.array = null;
    released.any = true;
}

/** Let go of one attribute's numbers (or an index's) once it's on the graphics card. Returns it. */
export function releaseAttribute(attribute) {
    attribute?.onUpload(dropArray);

    return attribute;
}

/** Let go of a geometry's attributes and index once they're on the graphics card. Returns it. */
export function releaseGeometry(geometry) {
    // (Its bounds worked out first: culling's done by them, and they're read from its corners)
    geometry.boundingSphere ?? geometry.computeBoundingSphere();

    for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
        attribute?.onUpload(dropArray);
    }

    return geometry;
}

// A compressed picture's levels as they're left once it's let go of: their sizes, no bytes
const emptied = (level) => {
    const kept = { ...level };

    delete kept.data;

    return kept;
};

// Nothing to send again: a picture let go of takes being marked for it (needsUpdate) as nothing
const nothingToSend = { configurable: true, get: () => undefined, set: () => {} };

/**
 * Let go of a compressed picture's bytes (a CompressedTexture's `mipmaps`, each level's `data`: a
 * KTX2 picture as it's read, as compressed as the graphics card keeps it, or as plain pixels where
 * it takes none of the compressed kinds) once it's on the graphics card, and whatever else is
 * holding them (`also`, called once they're gone). Returns it. Its levels are left as new ones of
 * the same sizes with no bytes, not emptied where they are: a copy of the picture made before
 * (three.js's `clone` shares the levels) still has them to send for itself. From then on, marked
 * to be sent again (`needsUpdate`, by what sets it up for another use: world/dungeons3d.js
 * setKitPicture, for each of a keep's levels) it isn't, the graphics card's copy left as it is:
 * sent with no bytes, three.js would log an error for each level. Not for a picture that's let go
 * of off the graphics card (dispose) and drawn again, nor one whose wrapping, filtering or colour
 * space changes after it's first drawn (each a new picture on the graphics card, from its bytes),
 * nor one copied after it's drawn to be drawn another way: none of a model's, a scene's or a kit's
 * is.
 */
export function releaseCompressed(texture, also = null) {
    const was = texture.onUpdate;

    texture.onUpdate = (updated) => {
        was?.(updated);

        if (texture.mipmaps?.some((level) => level.data)) {
            texture.mipmaps = texture.mipmaps.map(emptied);
            Object.defineProperty(texture, "needsUpdate", nothingToSend);
            released.any = true;
            also?.();
        }
    };

    return texture;
}

/**
 * Let go of a picture's pixels (a DataTexture's or DataArrayTexture's `image.data`, or a
 * compressed picture's levels: releaseCompressed; and whatever else is holding them: `also`,
 * called once they're gone) once it's on the graphics card. Returns it.
 */
export function releaseTexture(texture, also = null) {
    // (A compressed picture has no `image.data`: its bytes are its levels')
    if (texture.isCompressedTexture) {
        return releaseCompressed(texture, also);
    }

    const was = texture.onUpdate;

    texture.onUpdate = (updated) => {
        was?.(updated);

        if (texture.image?.data) {
            texture.image.data = null;
            released.any = true;
            also?.();
        }
    };

    return texture;
}

// Which of a material's own properties hold pictures, as of its version (three.js counts it up as
// what it's drawn with changes: a picture put where there was none), looked for again only then,
// each picture read afresh from them every time. Looking through every property of every
// material on every body every time (seventy or so each) was most of what the debug log's notes
// cost: about 1 ms, up to 7, every 2 s
const PICTURE_KEYS = new WeakMap();

function pictureKeys(material) {
    const known = PICTURE_KEYS.get(material);

    if (known?.version === material.version) {
        return known.keys;
    }

    const keys = Object.keys(material).filter((key) => material[key]?.isTexture);

    PICTURE_KEYS.set(material, { version: material.version, keys });

    return keys;
}

/**
 * How many bytes of the page's own copies some objects (and all under them) hold: their meshes'
 * attributes, morphs and indices, and their pictures' pixels (a picture's data; a compressed
 * picture's levels' bytes, as compressed as they are; or a canvas's or a bitmap's four bytes a
 * pixel), each counted once however many share it, and none let go of. `materials`: more
 * materials whose pictures are counted with them (a model's skins', which no mesh of its own
 * wears). `seen`: what's been counted before (a Set, added to: what one count shares with
 * another, the bodies drawn from a model and the model, counted in the first alone). For the
 * debug log (app/game.js memoryNow): where the browser tells nothing of the page's heap (Safari),
 * the least of what's in it.
 */
export function heldOnPage(roots, materials = [], seen = new Set()) {
    let bytes = 0;
    const count = (thing, size) => {
        if (thing && !seen.has(thing)) {
            seen.add(thing);
            bytes += size;
        }
    };
    const picture = (texture) => {
        const image = texture?.isTexture ? texture.image : null;

        // (A compressed picture is its levels' bytes, none once they're let go of: counted as
        // four bytes a pixel, a 1024-pixel one of 0.67 MB was 4. A picture of data is its data,
        // none once it's let go of; a canvas or a bitmap, its size)
        if (texture?.isCompressedTexture) {
            for (const level of texture.mipmaps ?? []) {
                count(level.data, level.data?.byteLength ?? 0);
            }
        } else if (image && "data" in image) {
            count(image.data, image.data?.byteLength ?? 0);
        } else if (image?.width > 0 && image?.height > 0) {
            count(image, image.width * image.height * 4);
        }
    };
    const pictures = (material) => {
        if (material) {
            for (const key of pictureKeys(material)) {
                picture(material[key]);
            }
        }
    };

    for (const root of roots) {
        root?.traverse?.((node) => {
            const geometry = node.geometry;

            // (Most of a body's nodes are its bones: nothing to count, and nothing made to find so)
            if (!geometry && !node.material && !node.skeleton) {
                return;
            }

            if (geometry) {
                for (const attribute of [...Object.values(geometry.attributes ?? {}), ...Object.values(geometry.morphAttributes ?? {}).flat(), geometry.index]) {
                    count(attribute?.array, attribute?.array?.byteLength ?? 0);
                }
            }

            if (Array.isArray(node.material)) {
                node.material.forEach(pictures);
            } else {
                pictures(node.material);
            }

            picture(node.skeleton?.boneTexture);
        });
    }

    materials.forEach(pictures);

    return bytes;
}
