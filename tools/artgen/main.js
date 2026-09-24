// The art generator, running in a browser page (tools/artgen/index.html) that the build script
// (scripts/build-art.js) opens in headless Chromium. It draws every piece in the catalogue
// (client/js/core/setpieces/pieces.js) and packs the results into sheets for the game.

import * as THREE from "three";
import { facingRotation, recolour } from "../../client/js/app/units3d.js";
import { MODELS } from "../../client/js/app/models.js";
import { createRandom } from "../../client/js/core/random.js";
import { layoutCastle } from "../../client/js/core/setpieces/castle.js";
import { GROUND, pieceCatalog } from "../../client/js/core/setpieces/pieces.js";
import { layoutTown } from "../../client/js/core/setpieces/town.js";
import { compose } from "./compose.js";
import { packAtlas } from "./engine/atlas.js";
import { loadModel } from "./engine/models.js";
import { nearestColour, pixelate, pixelateShadow } from "./engine/pixel.js";
import { PieceRenderer } from "./engine/render.js";
import { gatehouse, keep, tower, wall } from "./kits/castle.js";
import { house } from "./kits/house.js";
import { landmark, prop, tree } from "./kits/town.js";

// The styles the art comes in: image pixels per world pixel, and how each piece is finished
//   scale        image pixels per world pixel
//   shadowScale  ground shadows are stored at this fraction of the sprites' resolution
//   finish       what is done to each sprite and shadow after rendering
//   quality      how the sheet is saved (WebP; 1 is lossless)
export const STYLES = {
    // Smooth shading, twice the map's resolution (40 pixels per grid square). The soft shadows
    // keep their look at half that.
    smooth: { scale: 2, shadowScale: 0.5, quality: 0.9 },
    // Pixel art in the LPC palette, at LPC's 32 pixels per grid square
    pixel: { scale: 1.6, shadowScale: 1, finish: pixelate, finishShadow: pixelateShadow, quality: 1 },
};

// A copy of an image at a fraction of its size
function shrink(image, fraction) {
    if (fraction === 1) {
        return image;
    }

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(image.width * fraction));
    canvas.height = Math.max(1, Math.round(image.height * fraction));

    const context = canvas.getContext("2d");

    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas;
}

// The part of an image that isn't clear, and how far in from the top-left it starts
function trim(image) {
    const { width, height } = image;
    const data = image.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
    let [left, top, right, bottom] = [width, height, -1, -1];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 0) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
    }

    if (right < 0) {
        [left, top, right, bottom] = [0, 0, 0, 0];
    }

    const canvas = document.createElement("canvas");

    canvas.width = right - left + 1;
    canvas.height = bottom - top + 1;
    canvas.getContext("2d").drawImage(image, -left, -top);

    return { image: canvas, left, top };
}

// Finish a rendering in a style, trimmed to what can be seen. Returns the sprite and the shadow,
// each with where its top-left corner goes (in world pixels from the piece's origin).
function finished(result, style) {
    const { scale, finish, finishShadow, shadowScale } = STYLES[style];
    const sprite = trim(finish ? finish(result.sprite) : result.sprite);
    const shadow = trim(shrink(finishShadow ? finishShadow(result.shadow) : result.shadow, shadowScale));

    return {
        sprite: sprite.image,
        x: result.x + sprite.left / scale,
        y: result.y + sprite.top / scale,
        shadow: shadow.image,
        shadowX: result.x + shadow.left / (scale * shadowScale),
        shadowY: result.y + shadow.top / (scale * shadowScale),
        shadowScale,
    };
}

const BUILDERS = { wall, tower, gatehouse, keep, house, landmark, prop, tree };

let renderer;

/** Render one piece: { sprite, shadow, x, y } (see PieceRenderer.render). */
export async function renderPiece(piece, style = "smooth") {
    renderer ??= new PieceRenderer();

    const object = await BUILDERS[piece.kind](piece);

    return finished(renderer.render(object, { scale: STYLES[style].scale }), style);
}

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Draw every piece (or those whose keys are given) and pack them into one sheet. Returns the
 * sheet as a WebP data URL and its manifest: the sheet's scale (image pixels per world pixel)
 * and shadowScale (the shadows' resolution, as a fraction of that), and for each piece where
 * its sprite and shadow are on the sheet ([x, y, width, height] in sheet pixels) and where their
 * top-left corners go on the map.
 */
export async function buildSheet({ style = "smooth", keys } = {}) {
    const pieces = pieceCatalog().filter((piece) => !keys || keys.includes(piece.key));
    const images = [];
    const placed = [];

    for (const piece of pieces) {
        const art = await renderPiece(piece, style);

        images.push({ id: `${piece.key}`, image: art.sprite }, { id: `${piece.key}:shadow`, image: art.shadow });
        placed.push({ piece, art });
    }

    const { canvas, rects } = packAtlas(images);
    const manifest = {
        style,
        scale: STYLES[style].scale,
        shadowScale: STYLES[style].shadowScale,
        pieces: Object.fromEntries(placed.map(({ piece, art }) => [piece.key, {
            w: piece.w,
            h: piece.h,
            sprite: rects.get(piece.key),
            shadow: rects.get(`${piece.key}:shadow`),
            // Where the sprite's and the shadow's top-left corners go, in world pixels from the
            // north-west corner of the piece's first square
            at: [round(art.x), round(art.y)],
            shadowAt: [round(art.shadowX), round(art.shadowY)],
        }])),
    };

    return { image: canvas.toDataURL("image/webp", STYLES[style].quality), manifest };
}

const pieceArtCache = new Map();

/** A piece's art in a style (drawn once, then remembered). */
function pieceArt(key, style) {
    const id = `${style}:${key}`;

    if (!pieceArtCache.has(id)) {
        pieceArtCache.set(id, renderPiece(pieceCatalog().find((piece) => piece.key === key), style));
    }

    return pieceArtCache.get(id);
}

/** One of the game's units (from client/models, as units3d.js draws it), for comparing sizes. */
async function unitArt(name, heading, style) {
    const model = MODELS[name];
    const object = await loadModel(`/client/models/${model.file}`);

    object.traverse((node) => {
        if (node.isMesh && model.recolour?.includes(node.material.name)) {
            node.material.color.setHex(recolour(node.material.color, "blue"));
        }
    });

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const turned = new THREE.Group();
    const holder = new THREE.Group();

    object.position.set(-centre.x, -box.min.y, -centre.z);
    turned.add(object);
    turned.rotation.y = facingRotation(model.facing);
    turned.scale.setScalar(model.footprint / Math.max(size.x, size.z));
    holder.add(turned);
    holder.rotation.y = -heading;

    renderer ??= new PieceRenderer();

    return finished(renderer.render(holder, { scale: STYLES[style].scale }), style);
}

/**
 * A picture of a generated castle or town, with a few of the game's tanks on its roads for scale.
 * Returns { image (a WebP data URL), layout }.
 */
export async function preview({ kind, width, height, seed, gate, approaches, style = "smooth", tanks = 3 }) {
    const layout = kind === "castle" ? layoutCastle({ width, height, gate, seed }) : layoutTown({ width, height, approaches, seed });
    const art = new Map();

    for (const { key } of layout.pieces) {
        art.set(key, await pieceArt(key, style));
    }

    // Tanks parked on open road and cobbles
    const random = createRandom(seed);
    const spots = [];

    for (let y = 1; y < layout.height - 1; y++) {
        for (let x = 1; x < layout.width - 1; x++) {
            const ground = layout.ground[y][x];

            if ((ground === GROUND.road || ground === GROUND.cobbles) && !layout.obstructed[y][x] && !layout.obstructed[y][x + 1]) {
                spots.push([x, y]);
            }
        }
    }

    const units = [];

    for (const [x, y] of random.shuffle(spots).slice(0, tanks)) {
        const heading = random.pick([0, 0.5, 1, 1.5]) * Math.PI;

        units.push({ x: (x + 1) * 20, y: (y + 0.5) * 20, art: await unitArt("vehicles/heavy-tank", heading, style) });
    }

    const finishGround = style === "pixel" ? pixelateGround : undefined;
    const canvas = await compose(layout, (key) => art.get(key), { scale: STYLES[style].scale, units, finishGround });

    return { image: canvas.toDataURL("image/webp", 0.9), layout };
}

// A selection of pieces for looking over: towers, gatehouses, keeps, a house of each style,
// landmarks, props and trees
const BOARD = [
    "tower-round-battlements", "tower-round-roof", "tower-square-battlements", "tower-square-roof",
    "gatehouse-s", "gatehouse-e", "gatehouse-n", "keep-5x4-door", "keep-4x5-plain",
    "house-3x2-cottage-0", "house-3x2-cottage-1", "house-2x3-cottage-2",
    "house-3x2-timber-0", "house-3x3-timber-1", "house-2x3-timber-2",
    "house-3x2-brick-0", "house-3x3-brick-1", "house-2x3-brick-2",
    "house-3x2-stone-0", "house-4x3-stone-1", "house-2x3-stone-2",
    "landmark-tavern", "landmark-church", "landmark-blacksmith", "landmark-market", "landmark-windmill",
    "prop-well", "prop-tent", "prop-barrels", "prop-crates", "prop-sacks", "prop-cart", "prop-lumber", "prop-weaponrack", "prop-target",
    "tree-0", "tree-1", "tree-2", "tree-3", "tree-4", "tree-5",
];

/** A picture of a selection of pieces on grass, each with its ground shadow, and labelled. */
export async function board({ style = "smooth", keys = BOARD, columns = 7 } = {}) {
    const catalog = pieceCatalog();
    const cell = 6;
    const pieces = keys.map((key) => catalog.find((entry) => entry.key === key));
    const rows = [];

    // Each row is as tall as its tallest piece needs, with room above it for the piece's height
    for (let i = 0; i < pieces.length; i += columns) {
        const row = pieces.slice(i, i + columns);

        rows.push({ row, height: Math.max(...row.map((piece) => piece.h)) + 4, top: rows.reduce((sum, { height }) => sum + height, 0) });
    }

    const layout = { width: columns * cell, height: rows.reduce((sum, { height }) => sum + height, 0), pieces: [] };

    layout.ground = Array.from({ length: layout.height }, () => new Array(layout.width).fill(GROUND.grass));
    layout.obstructed = layout.ground.map((row) => row.map(() => 0));

    const labels = [];

    rows.forEach(({ row, height, top }) => {
        row.forEach((piece, column) => {
            const x = column * cell + ((cell - piece.w) >> 1);
            const y = top + height - piece.h - 1;

            layout.pieces.push({ key: piece.key, x, y, w: piece.w, h: piece.h });
            labels.push({ key: piece.key, x: (column + 0.5) * cell * 20, y: (top + height) * 20 - 3 });
        });
    });

    const art = new Map();

    for (const key of keys) {
        art.set(key, await pieceArt(key, style));
    }

    const scale = STYLES[style].scale;
    const finishGround = style === "pixel" ? pixelateGround : undefined;
    const canvas = await compose(layout, (key) => art.get(key), { scale, finishGround });
    const context = canvas.getContext("2d");

    context.font = `${Math.round(7 * scale)}px sans-serif`;
    context.textAlign = "center";

    for (const { key, x, y } of labels) {
        const [px, py] = [(40 + x) * scale, (90 + y) * scale];

        context.fillStyle = "rgba(0, 0, 0, 0.6)";
        context.fillText(key, px + scale, py + scale);
        context.fillStyle = "#fff";
        context.fillText(key, px, py);
    }

    return { image: canvas.toDataURL("image/webp", 0.9) };
}

// Pixel-art ground: every pixel in the LPC palette
function pixelateGround(canvas) {
    const context = canvas.getContext("2d");
    const image = context.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < image.data.length; i += 4) {
        image.data.set(nearestColour([image.data[i], image.data[i + 1], image.data[i + 2]]), i);
    }

    context.putImageData(image, 0, 0);
}

window.artgen = { pieceCatalog, renderPiece, buildSheet, preview, board, STYLES };
window.artgenReady = true;
