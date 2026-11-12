// The size a body's pictures are held at, by how big it's seen: its skin (and its bumps), its
// outfit's two pictures and its wounds'.
//
// A body 120 pixels tall on the screen shows about 72 pixels of each metre of it. Its skin's
// picture at 512 has 205 texels a metre or more over 95% of the skin (measured the sparser way
// across each of the body's triangles), so the graphics card, drawing it, reads the picture's
// second level (256) and smaller ones, never its first: under 2 texels a pixel, where some of the
// first level is mixed in, is 0.5% of the skin. A picture 256 across is that second level
// exactly, so held at 256 the body's drawn the same, with a quarter of the picture on the
// graphics card and on the page. Past 190 pixels tall the first level begins to show (17% of
// the skin under 2 texels a pixel), so there's a second or so between asking for the bigger
// picture and anyone being able to see it's missing.

/**
 * `least`: the size (texels a side) pictures are held at while a body's small on the screen.
 * `up`: how tall (drawing buffer pixels) it's seen before pictures of that size are swapped for
 * ones twice as big (and at twice as tall, for ones twice as big again, as far as they're
 * painted); `down`: how tall it's seen before they're swapped back, once it's been under that
 * `after` seconds on end (so one walking about at the edge of it doesn't have them swapped back
 * and forth). `held`: how long (seconds) one asked for whole (Character.whole: for a likeness of
 * it) keeps them so. `garments`: how long (seconds) a garment's own picture is kept on the page
 * after it was last used (wardrobe.js); `budget`: how much of a frame (ms) goes on making
 * outfits' pictures whole again for wearers seen bigger, at most once every `every` ms.
 */
export const PICTURES = Object.freeze({ least: 256, up: 120, down: 100, after: 3, held: 5, garments: 30, budget: 3, every: 8 });

/**
 * The size (texels a side) to hold the pictures of a body `tall` pixels tall on the screen at,
 * when they're held at `held` now and painted at `full`: bigger at once as it passes `up`
 * (PICTURES), smaller only once it's under `down`.
 */
export function pictureSize(tall, held, full) {
    const least = Math.min(PICTURES.least, full);
    let size = Math.min(full, Math.max(least, held));

    while (size < full && tall >= (PICTURES.up * size) / least) {
        size *= 2;
    }

    while (size > least && tall < (PICTURES.down * size) / 2 / least) {
        size /= 2;
    }

    return size;
}

// sRGB bytes to linear light (0 to 1) and back, as the graphics card makes a colour picture's
// smaller levels: `ENCODE` by `SHADES`ths of linear light, fine enough that every byte comes back
// as itself (four texels alike make one the same)
const SHADES = 65535;
const DECODE = Float64Array.from({ length: 256 }, (_, k) => (k <= 10 ? k / 255 / 12.92 : ((k / 255 + 0.055) / 1.055) ** 2.4));
const ENCODE = Uint8Array.from({ length: SHADES + 1 }, (_, k) => Math.round(255 * (k / SHADES <= 0.0031308 ? (k / SHADES) * 12.92 : 1.055 * (k / SHADES) ** (1 / 2.4) - 0.055)));

// How many rows of the smaller picture are made a step
const ROWS_A_STEP = 32;

/**
 * A square picture (`data`: RGBA, or a byte a texel; `size` a side) at half the size, each texel
 * the mean of the four it's made from, as the graphics card makes a picture's next level; a
 * `colour` picture's red, green and blue (sRGB) in linear light, its alpha plainly (a skin's is
 * its roughness). Bytes (a Uint8Array).
 */
export function halved(data, size, colour = false) {
    const steps = halving(data, size, colour);
    let step = steps.next();

    while (!step.done) {
        step = steps.next();
    }

    return step.value;
}

/** The same (halved), a step at a time (each a yield: a few rows), returning it. */
export function* halving(data, size, colour = false) {
    const half = size >> 1;
    const channels = data.length === size * size ? 1 : 4;
    const out = new Uint8Array(half * half * channels);
    const row = size * channels;

    for (let y = 0; y < half; y++) {
        if (y > 0 && y % ROWS_A_STEP === 0) {
            yield;
        }

        for (let x = 0; x < half; x++) {
            const from = (y * 2 * size + x * 2) * channels;
            const to = (y * half + x) * channels;

            for (let k = 0; k < channels; k++) {
                const a = data[from + k];
                const b = data[from + channels + k];
                const c = data[from + row + k];
                const d = data[from + row + channels + k];

                out[to + k] = colour && k < 3 ? ENCODE[Math.round((DECODE[a] + DECODE[b] + DECODE[c] + DECODE[d]) * (SHADES / 4))] : (a + b + c + d + 2) >> 2;
            }
        }
    }

    return out;
}

/**
 * A square picture at a smaller size (`to` a side: `size` halved once or more), a step at a time
 * (halving's), returning it; itself, if it's that size already.
 */
export function* reducing(data, size, to, colour = false) {
    let [picture, side] = [data, size];

    while (side > to) {
        picture = yield* halving(picture, side, colour);
        side >>= 1;
        yield;
    }

    return picture;
}

/**
 * A painted skin (skin.js paintSkin's: { width, height, data, bump }) at `size` a side (as it's
 * painted, or smaller), a step at a time, returning it; and with it, as `small`, the same at
 * `least` a side, if that's wanted (not 0) and smaller: what's kept on the page to go back to
 * while the bigger one's drawn (Character.fitPictures).
 */
export function* sizingSkin(skin, size = skin.width, least = 0) {
    const side = Math.min(skin.width, size || skin.width);
    const sized = side === skin.width ? skin : { width: side, height: side, data: yield* reducing(skin.data, skin.width, side, true), bump: yield* reducing(skin.bump, skin.width, side, false) };
    const small = least > 0 && least < side ? { width: least, height: least, data: yield* reducing(sized.data, side, least, true), bump: yield* reducing(sized.bump, side, least, false) } : null;

    return { width: sized.width, height: sized.height, data: sized.data, bump: sized.bump, small };
}

/** The same (sizingSkin), at once. */
export function sizedSkin(skin, size = skin.width, least = 0) {
    const steps = sizingSkin(skin, size, least);
    let step = steps.next();

    while (!step.done) {
        step = steps.next();
    }

    return step.value;
}

/** The same (reducing), at once. */
export function reduced(data, size, to, colour = false) {
    let [picture, side] = [data, size];

    while (side > to) {
        picture = halved(picture, side, colour);
        side >>= 1;
    }

    return picture;
}
