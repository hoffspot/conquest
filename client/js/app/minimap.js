// The minimap: the whole world from above, north up, in the top right of the game. It shows the
// ground (grass, roads, cobbles, soil), the buildings' roofs, props and trees, what the camera
// can see, where the player is going, the enemies (the one the player is set to fight ringed),
// and the player, pointing the way they face. Tapping it walks there, or fights the enemy
// tapped; a double tap runs.
//
// The ground, buildings and trees don't change, so they're painted once into an image four
// pixels to the metre; each frame draws that, scaled to fit, and the markers over it.

import { GROUND } from "../core/setpieces/pieces.js";

// Colours (RGB) of the ground and of what stands on it
const GROUND_COLOURS = {
    [GROUND.grass]: [98, 126, 60],
    [GROUND.road]: [178, 152, 106],
    [GROUND.cobbles]: [152, 146, 136],
    [GROUND.soil]: [130, 102, 68],
    [GROUND.courtyard]: [164, 154, 136],
};
const ROOFS = [[146, 76, 50], [126, 90, 60], [112, 98, 88]];
const LANDMARK_ROOF = [96, 104, 118];
const PROP = [86, 72, 58];
const TREE = [48, 78, 36];

// Pixels to the metre of the painted map
const SCALE = 4;

// At most this many redraws a second
const FRAME_RATE = 30;

// A tap that moves less than this (pixels) is a tap, not a drag
const TAP_SLOP = 10;

// How far from an enemy's dot (pixels) a tap picks it
const PICK = 12;

// A little variation from square to square, the same every time (-1 to 1)
const jitter = (x, y) => {
    const n = Math.imul(x * 374761393 + y * 668265263, 1274126177);

    return (((n ^ (n >>> 13)) & 0xff) / 127.5) - 1;
};

/** The buildings' footprints (in squares): { x, y, w, h, landmark } for every house and landmark. */
export function buildingsOf(world) {
    const { town, origin, plot } = world;

    return town.pieces.filter(({ key }) => /^(house|landmark)-/.test(key)).map(({ key, x, y, w, h }) => ({ x: origin + x * plot, y: origin + y * plot, w: w * plot, h: h * plot, landmark: key.startsWith("landmark-") }));
}

/** The trees: { x, y, r } (their middles and how far their crowns spread, in metres). */
export function treesOf(world) {
    const { town, origin, plot } = world;
    const inTown = town.pieces.filter(({ key }) => key.startsWith("tree-")).map(({ x, y, w, h }) => ({ x: origin + (x + w / 2) * plot, y: origin + (y + h / 2) * plot, r: 0.55 * Math.min(w, h) * plot }));

    return [...world.trees.map(({ x, y }) => ({ x, y, r: 1.8 })), ...inTown];
}

/**
 * Each square's colour on the map, as RGBA bytes row by row: its ground, a roof over buildings,
 * or a prop or tree where one stands.
 */
export function mapColours(world) {
    const { width, height, ground, blocked, town, origin, plot } = world;
    const data = new Uint8ClampedArray(width * height * 4);
    const roofs = new Int16Array(width * height).fill(-1);
    const props = new Uint8Array(width * height);

    buildingsOf(world).forEach(({ x, y, w, h, landmark }, k) => {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                roofs[j * width + i] = landmark ? ROOFS.length : k % ROOFS.length;
            }
        }
    });

    for (const { x, y, w, h } of town.pieces.filter(({ key }) => key.startsWith("prop-"))) {
        for (let j = origin + y * plot; j < origin + (y + h) * plot; j++) {
            for (let i = origin + x * plot; i < origin + (x + w) * plot; i++) {
                props[j * width + i] = 1;
            }
        }
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const at = y * width + x;
            const roof = roofs[at];
            let colour;

            if (roof >= 0) {
                colour = roof === ROOFS.length ? LANDMARK_ROOF : ROOFS[roof];
            } else if (blocked[y][x]) {
                colour = props[at] ? PROP : TREE;
            } else {
                colour = GROUND_COLOURS[ground[y][x]] ?? GROUND_COLOURS[GROUND.grass];
            }

            const shade = 1 + 0.05 * jitter(x, y);

            data.set([colour[0] * shade, colour[1] * shade, colour[2] * shade, 255], at * 4);
        }
    }

    return data;
}

export class Minimap {
    /**
     * @param {HTMLCanvasElement} canvas - Where to draw it (sized by the page's styles).
     * @param {object} world - From generateWorld (core/world.js).
     * @param {object} [options]
     * @param {(tap: object) => void} [options.onTap] - Hears taps on it: { x, z (metres), reach
     *     (metres: how close to an enemy picks it), clientX, clientY, time }.
     */
    constructor(canvas, world, { onTap = () => {} } = {}) {
        this.canvas = canvas;
        this.world = world;
        this.context = canvas.getContext("2d");
        this.base = paint(world);
        this.drawn = -Infinity;
        this.pointer = null;
        canvas.style.aspectRatio = `${world.width} / ${world.height}`;

        const down = (event) => {
            this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        };
        const up = (event) => {
            const pointer = this.pointer;

            this.pointer = null;

            if (!pointer || pointer.id !== event.pointerId || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP) {
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const metres = world.width / rect.width;

            onTap({ x: (event.clientX - rect.left) * metres, z: (event.clientY - rect.top) * metres, reach: PICK * metres, clientX: event.clientX, clientY: event.clientY, time: event.timeStamp });
        };

        this.listeners = [["pointerdown", down], ["pointerup", up]];

        for (const [type, listener] of this.listeners) {
            canvas.addEventListener(type, listener);
        }
    }

    /** Show it or not. */
    show(on) {
        this.canvas.hidden = !on;
        this.drawn = -Infinity;
    }

    /** Is it shown, and time to draw it again (at most FRAME_RATE times a second)? */
    due(now = performance.now()) {
        return !this.canvas.hidden && now - this.drawn >= 1000 / FRAME_RATE;
    }

    /**
     * Draw it: `player` { x, z, facing } (metres, radians), `others` [{ x, z, hostile,
     * targeted }], `destination` [x, z] or null, `view` the corners of what the camera sees
     * ([[x, z] ×4], null where it sees no ground) or null.
     */
    draw({ player, others = [], destination = null, view = null }, now = performance.now()) {
        const { canvas, context, world } = this;

        this.drawn = now;

        // Keep the drawing buffer the size it's shown at, in device pixels
        const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (!width || !height) {
            return;
        }

        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
        }

        const scale = width / world.width;
        const at = (x, z) => [x * scale, z * scale];

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(this.base, 0, 0, width, height);

        // What the camera sees
        if (view?.every(Boolean)) {
            context.beginPath();
            view.forEach(([x, z], k) => context[k ? "lineTo" : "moveTo"](...at(x, z)));
            context.closePath();
            context.fillStyle = "rgba(255, 248, 225, 0.12)";
            context.fill();
            context.strokeStyle = "rgba(255, 248, 225, 0.6)";
            context.lineWidth = 1;
            context.stroke();
        }

        // Where the player is going
        if (destination) {
            const [x, y] = at(destination[0], destination[1]);

            context.beginPath();
            context.arc(x, y, 3.5, 0, 2 * Math.PI);
            context.strokeStyle = "#ffe6a0";
            context.lineWidth = 1.5;
            context.stroke();
        }

        // Everyone else: enemies red, the one the player is set to fight ringed
        for (const other of others) {
            const [x, y] = at(other.x, other.z);

            if (other.targeted) {
                context.beginPath();
                context.arc(x, y, 7 + Math.sin(now / 160), 0, 2 * Math.PI);
                context.strokeStyle = "#ff4a2e";
                context.lineWidth = 2;
                context.stroke();
            }

            context.beginPath();
            context.arc(x, y, 3.6, 0, 2 * Math.PI);
            context.fillStyle = other.hostile ? "#ff4a2e" : "#8fd0ff";
            context.fill();
            context.strokeStyle = "rgba(20, 8, 4, 0.9)";
            context.lineWidth = 1.2;
            context.stroke();
        }

        // The player: an arrowhead pointing the way they face (0 is south, towards east positive)
        if (player) {
            const [x, y] = at(player.x, player.z);

            context.save();
            context.translate(x, y);
            context.rotate(-player.facing);
            context.beginPath();
            context.moveTo(0, 6.5);
            context.lineTo(4.6, -4.5);
            context.lineTo(0, -2.2);
            context.lineTo(-4.6, -4.5);
            context.closePath();
            context.fillStyle = "#fff1c4";
            context.fill();
            context.strokeStyle = "rgba(30, 20, 8, 0.95)";
            context.lineWidth = 1.3;
            context.stroke();
            context.restore();
        }
    }

    /** Stop listening for taps. */
    dispose() {
        for (const [type, listener] of this.listeners) {
            this.canvas.removeEventListener(type, listener);
        }

        this.canvas.hidden = true;
    }
}

// A canvas to draw on that isn't on the page
function offscreen(width, height) {
    return globalThis.OffscreenCanvas ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
}

// The map's image: a colour for every square, the buildings' edges and ridges, and round trees
function paint(world) {
    const { width, height } = world;
    const squares = offscreen(width, height);

    squares.getContext("2d").putImageData(new ImageData(mapColours(world), width, height), 0, 0);

    const image = offscreen(width * SCALE, height * SCALE);
    const context = image.getContext("2d");

    context.imageSmoothingEnabled = false;
    context.drawImage(squares, 0, 0, width * SCALE, height * SCALE);
    context.scale(SCALE, SCALE);

    // Buildings: a dark edge, and a light ridge along the roof
    for (const { x, y, w, h } of buildingsOf(world)) {
        context.strokeStyle = "rgba(34, 22, 16, 0.85)";
        context.lineWidth = 0.6;
        context.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
        context.beginPath();

        if (w >= h) {
            context.moveTo(x + 1, y + h / 2);
            context.lineTo(x + w - 1, y + h / 2);
        } else {
            context.moveTo(x + w / 2, y + 1);
            context.lineTo(x + w / 2, y + h - 1);
        }

        context.strokeStyle = "rgba(255, 230, 200, 0.35)";
        context.lineWidth = 0.5;
        context.stroke();
    }

    // Trees: round crowns, lit from the top left
    for (const { x, y, r } of treesOf(world)) {
        context.beginPath();
        context.arc(x, y, r, 0, 2 * Math.PI);
        context.fillStyle = `rgb(${TREE.join(",")})`;
        context.fill();
        context.beginPath();
        context.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 2 * Math.PI);
        context.fillStyle = "rgba(140, 180, 90, 0.35)";
        context.fill();
    }

    return image;
}
