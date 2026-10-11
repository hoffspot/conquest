// The page's copies of what's been given to the graphics card and isn't read on the page again,
// let go of once it's there (three.js's onUpload and onUpdate, as its own examples do): a static
// mesh's attributes and index, a picture's pixels. The graphics card's copy is the one drawn; the
// page's would only be read again to give it the same once more, were the drawing lost and given
// back (main.js: the game loads the page again then, where it was, rather than give back what's
// been let go of). Only for what nothing reads after it's made: not the pictures of what
// characters wear (composited and sampled again: characters/character.js, world/crowd.js), nor a
// mesh that's merged, cloned, posed or bent on the page. A character's own skin is let go of in
// the game (character.js `release`), the crowd's figures being made from characters of their own,
// before they're ever sent.

/** Whether anything's been let go of (the drawing, lost, can't be given it back: main.js). */
export const released = { any: false };

function dropArray() {
    this.array = null;
    released.any = true;
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

/**
 * Let go of a picture's pixels (a DataTexture's or DataArrayTexture's `image.data`, and whatever
 * else is holding them: `also`, called once they're gone) once it's on the graphics card. Returns
 * it.
 */
export function releaseTexture(texture, also = null) {
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

/**
 * How many bytes of the page's own copies some objects (and all under them) hold: their meshes'
 * attributes, morphs and indices, and their pictures' pixels (a picture's data, or a canvas's or a
 * bitmap's four bytes a pixel), each counted once however many share it, and none let go of. For
 * the debug log (app/game.js memoryNow): where the browser tells nothing of the page's heap
 * (Safari), the least of what's in it.
 */
export function heldOnPage(roots) {
    const seen = new Set();
    let bytes = 0;
    const count = (thing, size) => {
        if (thing && !seen.has(thing)) {
            seen.add(thing);
            bytes += size;
        }
    };
    const picture = (texture) => {
        const image = texture?.isTexture ? texture.image : null;

        // (A picture of data is its data, none once it's let go of; a canvas or a bitmap, its size)
        if (image && "data" in image) {
            count(image.data, image.data?.byteLength ?? 0);
        } else if (image?.width > 0 && image?.height > 0) {
            count(image, image.width * image.height * 4);
        }
    };

    for (const root of roots) {
        root?.traverse?.((node) => {
            const geometry = node.geometry;

            if (geometry) {
                for (const attribute of [...Object.values(geometry.attributes ?? {}), ...Object.values(geometry.morphAttributes ?? {}).flat(), geometry.index]) {
                    count(attribute?.array, attribute?.array?.byteLength ?? 0);
                }
            }

            for (const material of [node.material].flat()) {
                for (const value of Object.values(material ?? {})) {
                    picture(value);
                }
            }

            picture(node.skeleton?.boneTexture);
        });
    }

    return bytes;
}
