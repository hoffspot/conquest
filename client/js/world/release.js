// The page's copies of what's been given to the graphics card and isn't read on the page again,
// let go of once it's there (three.js's onUpload and onUpdate, as its own examples do): a static
// mesh's attributes and index, a picture's pixels. The graphics card's copy is the one drawn; the
// page's would only be read again to give it the same once more, were the drawing lost and given
// back (main.js: the game loads the page again then, where it was, rather than give back what's
// been let go of). Only for what nothing reads after it's made: not a character's pictures
// (composited and sampled again: characters/character.js, world/crowd.js), nor a mesh that's
// merged, cloned, posed or bent on the page.

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
