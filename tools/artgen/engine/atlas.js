// Packs many small images into one sheet (an atlas), so the game loads one image per kit.

const PADDING = 1;

/**
 * Pack images ([{ id, image }]) into rows on one canvas at most `maxWidth` wide, tallest first.
 * Returns the canvas and where each image went: rects.get(id) = [x, y, width, height].
 */
export function packAtlas(images, maxWidth = 2048) {
    const order = [...images].sort((a, b) => b.image.height - a.image.height || b.image.width - a.image.width);
    const rects = new Map();
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let width = 0;

    for (const { id, image } of order) {
        if (x + image.width > maxWidth && x > 0) {
            x = 0;
            y += rowHeight + PADDING;
            rowHeight = 0;
        }

        rects.set(id, [x, y, image.width, image.height]);
        x += image.width + PADDING;
        rowHeight = Math.max(rowHeight, image.height);
        width = Math.max(width, x);
    }

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, y + rowHeight);

    const context = canvas.getContext("2d");

    for (const { id, image } of images) {
        const [ix, iy] = rects.get(id);

        context.drawImage(image, ix, iy);
    }

    return { canvas, rects };
}
