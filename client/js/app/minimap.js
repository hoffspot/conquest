// The minimap: the map the player is on from above, north up, in the top right of the game. In
// the town and the world round it, the ground (grass in each land's colours, roads, cobbles,
// soil, water), the buildings' roofs, props and trees, the 128 metres or so round the player;
// inside the tavern, the whole floor: the walls, the furniture and the stairs. Over that, what
// the camera can see, where the player is going, the enemies (the one the player is set to fight
// ringed), an icon over each building the player has gone into (app/mapicons.js), and the player,
// pointing the way they face. Tapping it walks there, or fights the enemy tapped; a double tap
// runs; holding it opens the world map (app/worldmap.js).
//
// What's shown is painted into an image four pixels to the metre: each floor inside once, the
// world round the player a patch at a time (the next painted a step at a time, ahead of them,
// while they're still well inside this one). Each frame draws that, scaled to fit, and the
// markers over it.

import { ARCHES, legsOf } from "../core/arches.js";
import { PLAN_KEY } from "../core/interiors.js";
import { CHUNK, WET } from "../core/overworld.js";
import { allAtOnce, Steps } from "../core/steps.js";
import { GROUND, HOUSE_STYLES, PLOT } from "../core/setpieces/pieces.js";
import { footprint } from "../core/setpieces/town.js";
import { LAND_COLOURS } from "../world/ground.js";
import { drawBuildingIcon } from "./mapicons.js";

// Colours (RGB) of the ground and of what stands on it
const GROUND_COLOURS = {
    [GROUND.grass]: [98, 126, 60],
    [GROUND.road]: [178, 152, 106],
    [GROUND.cobbles]: [152, 146, 136],
    [GROUND.soil]: [130, 102, 68],
    [GROUND.courtyard]: [164, 154, 136],
    [GROUND.planks]: [132, 94, 58],
};
// Roofs, by the house's style (thatch, clay tiles, brick-red tiles, slate)
const ROOFS = [[176, 150, 92], [146, 76, 50], [126, 90, 60], [110, 106, 108]];
const LANDMARK_ROOF = [96, 104, 118];
const PROP = [86, 72, 58];
const TREE = [48, 78, 36];

// Colours (RGB) of what stands inside (core/interiors.js's PLAN_KEY kinds), on the floor's
const INSIDE = {
    wall: [46, 36, 30],
    hearth: [96, 84, 76],
    stairs: [150, 116, 74],
    table: [112, 76, 42],
    bench: [88, 60, 34],
    bar: [98, 60, 32],
    barrels: [124, 88, 48],
    counter: [104, 36, 50],
    bed: [150, 38, 56],
    washstand: [182, 180, 170],
    chest: [96, 66, 38],
    chaise: [118, 40, 74],
    "side-table": [78, 44, 30],
    forge: [92, 80, 74],
    bellows: [96, 64, 40],
    anvil: [60, 60, 66],
    trough: [74, 96, 110],
    grindstone: [128, 124, 116],
    rack: [84, 60, 38],
    workbench: [112, 76, 42],
    coal: [34, 30, 28],
    statue: [226, 222, 212],
    altar: [236, 230, 214],
    shrine: [196, 164, 92],
    votive: [70, 66, 62],
    pew: [98, 66, 40],
    basin: [120, 150, 164],
    board: [206, 190, 146],
    shelves: [84, 60, 38],
};

// Pixels to the metre of the painted map
const SCALE = 4;

/**
 * The wedge showing which way the player's looking: how far it reaches (a share of the minimap's
 * width, so it's the same size inside and out, however the camera's tilted or zoomed), how wide
 * it opens (radians), and how far out (a share of its reach) it starts to fade, to nothing at its
 * tip.
 */
export const LOOK = Object.freeze({ reach: 0.3, spread: 1.1, fade: 0.35 });

// Out in the world: how much of it the minimap shows round the player (metres across), and how
// much is painted at a time (the player can go a quarter of the difference before it's painted
// again: metres)
const SPAN = 128;
const PAINTED = 192;

// The next patch is begun once the view's middle is this far (metres) from this one's, centred as
// far ahead of it again, and painted a step at a time (at most PAINTING ms a drawing), so it's
// ready before the view would go past this one's edge
const AHEAD = 16;
const PAINTING = 2;

// Water, and bridges over it (RGB)
export const WATER_COLOURS = { [WET.still]: [58, 104, 130], [WET.river]: [70, 120, 146] };
const BRIDGE = [150, 112, 70];

// At most this many redraws a second
const FRAME_RATE = 30;

// A tap that moves less than this (pixels) is a tap, not a drag
const TAP_SLOP = 10;

// How far from an enemy's dot (pixels) a tap picks it
const PICK = 12;

// Held this long (ms) without moving, it's held, not tapped
const HOLD_MS = 550;

// How big the icons over the buildings gone into are (pixels)
const ICON_SIZE = 22;

// A little variation from square to square, the same every time (-1 to 1)
const jitter = (x, y) => {
    const n = Math.imul(x * 374761393 + y * 668265263, 1274126177);

    return (((n ^ (n >>> 13)) & 0xff) / 127.5) - 1;
};

/**
 * Each square's colour on a map inside (core/interiors.js), as RGBA bytes row by row: the floor,
 * or whatever stands on it.
 */
export function interiorColours(map) {
    const { width, height, plan, ground } = map;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const kind = PLAN_KEY[plan[y][x]].kind;
            const colour = INSIDE[kind] ?? GROUND_COLOURS[ground[y][x]] ?? GROUND_COLOURS[GROUND.courtyard];
            const shade = 1 + 0.05 * jitter(x, y);

            data.set([colour[0] * shade, colour[1] * shade, colour[2] * shade, 255], (y * width + x) * 4);
        }
    }

    return data;
}

// Where the town's layout starts ([x, y] metres: a world's origin is a number for both, or a pair)
const cornerOf = ({ origin }) => (Array.isArray(origin) ? origin : [origin, origin]);

// Is a point inside a polygon ([[x, y]...])?
function within(corners, px, py) {
    let inside = false;

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [[ax, ay], [bx, by]] = [corners[k], corners[last]];

        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * The buildings, as they stand: { corners ([x, y] ×4, metres, each turned the way it faces),
 * ridge ([from, to]: along the longer way), landmark, style } for every house and landmark.
 */
export function buildingsOf(world) {
    const [ox, oy] = cornerOf(world);

    return world.town.pieces.filter(({ kind }) => kind === "house" || kind === "landmark").map((piece) => {
        const corners = footprint(piece, -0.3).map(([x, y]) => [ox + x, oy + y]);
        const [a, b, c, d] = corners;
        const middle = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

        return { corners, ridge: piece.w >= piece.h ? [middle(a, d), middle(b, c)] : [middle(a, b), middle(d, c)], landmark: piece.kind === "landmark", style: piece.style };
    });
}

/** The town's trees: { x, y, r } (their trunks and how far their crowns spread, in metres). */
export function treesOf(world) {
    const [ox, oy] = cornerOf(world);
    const inTown = world.town.pieces.filter(({ kind }) => kind === "tree").map(({ x, y }) => ({ x: ox + x, y: oy + y, r: 2 }));

    return [...world.trees.map(({ x, y }) => ({ x, y, r: 1.8 })), ...inTown];
}

/**
 * Each square's colour on the map, as RGBA bytes row by row: its ground, a roof over buildings,
 * or a prop or tree where one stands.
 */
export function mapColours(world) {
    const { width, height, ground, blocked, town } = world;
    const [ox, oy] = cornerOf(world);
    const data = new Uint8ClampedArray(width * height * 4);
    const roofs = new Int16Array(width * height).fill(-1);
    const props = new Uint8Array(width * height);

    // Every square under each thing (its middle inside it)
    const under = (corners, visit) => {
        const xs = corners.map(([x]) => x);
        const ys = corners.map(([, y]) => y);

        for (let j = Math.max(0, Math.floor(Math.min(...ys))); j < Math.min(height, Math.ceil(Math.max(...ys))); j++) {
            for (let i = Math.max(0, Math.floor(Math.min(...xs))); i < Math.min(width, Math.ceil(Math.max(...xs))); i++) {
                if (within(corners, i + 0.5, j + 0.5)) {
                    visit(j * width + i);
                }
            }
        }
    };

    buildingsOf(world).forEach(({ corners, landmark, style }) => {
        under(corners, (at) => {
            roofs[at] = landmark ? ROOFS.length : Math.max(0, HOUSE_STYLES.indexOf(style));
        });
    });

    for (const piece of town.pieces.filter(({ kind }) => kind === "prop")) {
        under(footprint(piece, -(piece.w * PLOT) / 4).map(([x, y]) => [ox + x, oy + y]), (at) => {
            props[at] = 1;
        });
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
     * @param {object} world - From buildWorld (core/overworld.js), or generateWorld (core/world.js).
     * @param {object} [options]
     * @param {(tap: object) => void} [options.onTap] - Hears taps on it: { x, z (metres), reach
     *     (metres: how close to an enemy picks it), clientX, clientY, time }.
     * @param {() => void} [options.onHold] - Hears it held (a finger, or the mouse, kept down on it).
     */
    constructor(canvas, world, { onTap = () => {}, onHold = () => {} } = {}) {
        this.canvas = canvas;
        this.world = world;
        this.context = canvas.getContext("2d");
        this.bases = new Map();
        this.drawn = -Infinity;
        this.pointer = null;

        /** The kinds of the icons last drawn (the buildings gone into, in view). */
        this.icons = [];

        // Out in the world: the patch painted round the player ({ x, z (its corner, metres),
        // image }), the next being painted ({ x, z, steps }), the town's own picture (painted
        // once), and where the player was last drawn
        this.patch = null;
        this.painting = null;
        this.town = null;
        this.middle = null;
        this.setMap(world.maps?.town ?? { id: "town", width: world.width, height: world.height });

        // A tap walks there; held a while without moving, the world map opens
        const down = (event) => {
            clearTimeout(this.pointer?.timer);

            const pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, held: false };

            pointer.timer = setTimeout(() => {
                pointer.held = true;
                onHold();
            }, HOLD_MS);
            this.pointer = pointer;
        };
        const move = (event) => {
            const pointer = this.pointer;

            if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP) {
                clearTimeout(pointer.timer);
            }
        };
        const up = (event) => {
            const pointer = this.pointer;

            clearTimeout(pointer?.timer);
            this.pointer = null;

            if (!pointer || pointer.held || pointer.id !== event.pointerId || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > TAP_SLOP) {
                return;
            }

            // (Held long enough, though the page was too busy to notice till now)
            if (event.timeStamp - pointer.time >= HOLD_MS) {
                onHold();

                return;
            }

            const rect = canvas.getBoundingClientRect();
            const [x0, z0, across] = this.shown();
            const metres = across / rect.width;

            onTap({ x: x0 + (event.clientX - rect.left) * metres, z: z0 + (event.clientY - rect.top) * metres, reach: PICK * metres, clientX: event.clientX, clientY: event.clientY, time: event.timeStamp });
        };

        const cancel = () => {
            clearTimeout(this.pointer?.timer);
            this.pointer = null;
        };

        // (No menu popping up for a finger held on it)
        this.listeners = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", cancel], ["contextmenu", (event) => event.preventDefault()]];

        for (const [type, listener] of this.listeners) {
            canvas.addEventListener(type, listener);
        }
    }

    /** Let go of a floor's painting (its building's been let go: painted again if it's shown again). */
    forget(mapId) {
        this.bases.delete(mapId);
    }

    /**
     * Show a map (one of the world's maps: the world outside, the town on its own, or a floor
     * inside), painting it the first time (or, the world outside, as the player goes).
     */
    setMap(map) {
        this.map = map;
        this.drawn = -Infinity;

        // The world outside: the patch round the player, painted as they go
        if (map.chunk) {
            this.base = this.patch?.image ?? null;
            this.canvas.style.aspectRatio = "1 / 1";

            return;
        }

        if (!this.bases.has(map.id)) {
            this.bases.set(map.id, map.id === "town" ? paint(this.world) : paintInterior(map));
        }

        this.base = this.bases.get(map.id);
        this.canvas.style.aspectRatio = `${map.width} / ${map.height}`;
    }

    /**
     * What it shows of its map: [x, z (its north-west corner), metres across]: the whole map, or
     * out in the world, the SPAN metres round where the player was last drawn.
     */
    shown() {
        if (!this.map.chunk) {
            return [0, 0, this.map.width];
        }

        const [x, z] = this.middle ?? [this.map.width / 2, this.map.height / 2];

        return [x - SPAN / 2, z - SPAN / 2, SPAN];
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
     * targeted }], `destination` [x, z] or null, `look` the way the player's looking over the
     * ground (radians, as `facing`: 0 south, towards +z) or null, and `icons` over the buildings
     * gone into ([{ kind, x, z }]).
     */
    draw({ player, others = [], destination = null, look = null, icons = [] }, now = performance.now()) {
        const { canvas, context, map } = this;

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

        // Out in the world: round the player (painted afresh if they've gone far enough)
        if (map.chunk) {
            if (player) {
                this.middle = [player.x, player.z];
            }

            this.#repaint();
        }

        const [x0, z0, across] = this.shown();
        const scale = width / across;
        const at = (x, z) => [(x - x0) * scale, (z - z0) * scale];

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        if (map.chunk) {
            const { x: px, z: pz } = this.patch;

            context.fillStyle = "#1c2a33";
            context.fillRect(0, 0, width, height);
            context.drawImage(this.base, (x0 - px) * SCALE, (z0 - pz) * SCALE, across * SCALE, across * SCALE, 0, 0, width, height);
        } else {
            context.drawImage(this.base, 0, 0, width, height);
        }

        // Which way the player's looking: a wedge from them, always the same size, fading out
        // towards its tip
        this.looked = null;

        if (player && look !== null) {
            const [px, py] = at(player.x, player.z);
            const reach = width * LOOK.reach;
            const middle = Math.atan2(Math.cos(look), Math.sin(look));
            const fade = (alpha) => {
                const gradient = context.createRadialGradient(px, py, 0, px, py, reach);

                gradient.addColorStop(0, `rgba(255, 248, 225, ${alpha})`);
                gradient.addColorStop(LOOK.fade, `rgba(255, 248, 225, ${alpha})`);
                gradient.addColorStop(1, "rgba(255, 248, 225, 0)");

                return gradient;
            };

            context.beginPath();
            context.moveTo(px, py);
            context.arc(px, py, reach, middle - LOOK.spread / 2, middle + LOOK.spread / 2);
            context.closePath();
            context.fillStyle = fade(0.2);
            context.fill();
            context.strokeStyle = fade(0.65);
            context.lineWidth = 1;
            context.stroke();
            this.looked = { look, reach };
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

        // The buildings the player has gone into: what each is (those shown, kept for tests)
        this.icons = [];

        for (const icon of icons) {
            const [x, y] = at(icon.x, icon.z);

            if (x > -ICON_SIZE && y > -ICON_SIZE && x < width + ICON_SIZE && y < height + ICON_SIZE) {
                drawBuildingIcon(context, icon.kind, x, y, ICON_SIZE);
                this.icons.push(icon.kind);
            }
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

    // Out in the world: the next patch round the player painted a step at a time while they're
    // still well inside this one, ahead of where they're going, and shown once it's painted; or
    // painted at once, if what's shown would otherwise go past this one's edge (the first, or a
    // leap across the world)
    #repaint() {
        const [x0, z0, across] = this.shown();
        const middle = [x0 + across / 2, z0 + across / 2];
        const within = (patch) => patch && x0 >= patch.x && z0 >= patch.z && x0 + across <= patch.x + PAINTED && z0 + across <= patch.z + PAINTED;

        if (!this.painting && within(this.patch)) {
            const away = [middle[0] - (this.patch.x + PAINTED / 2), middle[1] - (this.patch.z + PAINTED / 2)];

            if (Math.max(...away.map(Math.abs)) >= AHEAD) {
                this.painting = this.#painting(middle[0] + away[0], middle[1] + away[1]);
            }
        }

        // (Finished at once if what's shown would go past this one's edge; let go if it wouldn't
        // hold what's shown either)
        const painting = this.painting;

        if (painting && !within(this.patch) && !within(painting)) {
            this.painting = null;
        } else if (painting?.steps.take(within(this.patch) ? performance.now() + PAINTING : Infinity)) {
            this.painting = null;

            if (within(painting)) {
                this.#show(painting);
            }
        }

        if (!within(this.patch)) {
            const now = this.#painting(...middle);

            now.steps.take();
            this.#show(now);
        }
    }

    // The patch round a point (metres), snapped to whole chunks' quarters (so it's the same
    // wherever it's come to from), to paint a step at a time
    #painting(x, z) {
        const snap = CHUNK / 4;
        const [px, pz] = [x, z].map((v) => Math.round((v - PAINTED / 2) / snap) * snap);

        return { x: px, z: pz, steps: new Steps(paintingPatch(this.world, px, pz, PAINTED, this.town)) };
    }

    // A patch painted, shown
    #show({ x, z, steps }) {
        this.patch = { x, z, image: steps.value };
        this.town = steps.value.town;
        this.base = steps.value;
    }

    /** Stop listening for taps. */
    dispose() {
        clearTimeout(this.pointer?.timer);

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

// A map inside's image: a colour for every square, walls, stairs' treads, round barrels, the
// hearth's fire and the doorway
function paintInterior(map) {
    const { width, height, pieces, marks } = map;
    const squares = offscreen(width, height);

    squares.getContext("2d").putImageData(new ImageData(interiorColours(map), width, height), 0, 0);

    const image = offscreen(width * SCALE, height * SCALE);
    const context = image.getContext("2d");

    context.imageSmoothingEnabled = false;
    context.drawImage(squares, 0, 0, width * SCALE, height * SCALE);
    context.scale(SCALE, SCALE);

    for (const { kind, x, y, w, h } of pieces) {
        if (kind === "stairs") {
            // Treads across the way they go
            context.strokeStyle = "rgba(40, 26, 14, 0.7)";
            context.lineWidth = 0.08;

            for (let tread = x + 0.33; tread < x + w; tread += 0.33) {
                context.beginPath();
                context.moveTo(tread, y + 0.08);
                context.lineTo(tread, y + h - 0.08);
                context.stroke();
            }
        } else if (kind === "barrels") {
            for (let j = y; j < y + h; j++) {
                context.beginPath();
                context.arc(x + w / 2, j + 0.5, 0.4, 0, 2 * Math.PI);
                context.fillStyle = "rgb(146, 104, 58)";
                context.fill();
                context.strokeStyle = "rgba(40, 26, 14, 0.8)";
                context.lineWidth = 0.1;
                context.stroke();
            }
        } else if (kind === "hearth" || kind === "forge") {
            context.beginPath();
            context.arc(x + w * 0.62, y + h / 2, 0.55, 0, 2 * Math.PI);
            context.fillStyle = "rgba(255, 128, 40, 0.9)";
            context.fill();
        } else if (kind !== "wall") {
            context.strokeStyle = "rgba(24, 14, 8, 0.55)";
            context.lineWidth = 0.1;
            context.strokeRect(x + 0.08, y + 0.08, w - 0.16, h - 0.16);
        }
    }

    // The walls round it, and the doorway through them
    context.strokeStyle = `rgb(${INSIDE.wall.join(",")})`;
    context.lineWidth = 0.5;
    context.strokeRect(0.25, 0.25, width - 0.5, height - 0.5);

    for (const [x, y] of marks.D ?? []) {
        context.fillStyle = "rgb(186, 150, 96)";
        context.fillRect(x, y + 0.5, 1, 0.5);
    }

    return image;
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

    // Buildings: a dark edge, and a light ridge along the roof, each turned as it stands
    for (const { corners, ridge } of buildingsOf(world)) {
        context.beginPath();
        corners.forEach(([x, y], k) => context[k ? "lineTo" : "moveTo"](x, y));
        context.closePath();
        context.strokeStyle = "rgba(34, 22, 16, 0.85)";
        context.lineWidth = 0.6;
        context.stroke();
        context.beginPath();
        context.moveTo(...ridge[0]);
        context.lineTo(...ridge[1]);
        context.strokeStyle = "rgba(255, 230, 200, 0.35)";
        context.lineWidth = 0.5;
        context.stroke();
    }

    // Trees: round crowns, lit from the top left
    for (const { x, y, r } of treesOf(world)) {
        crown(context, x, y, r);
    }

    return image;
}

// Each land's grass colour on the minimap (RGB): the town's grass, in the land's colour as much
// as the ground's drawn in it (world/ground.js LAND_COLOURS)
const landColour = new Map();

/** A land's grass colour on the map (RGB), by its BIOMES id. */
export function grassOf(biome) {
    if (!landColour.has(biome)) {
        const [colour, amount] = LAND_COLOURS[biome] ?? ["#000000", 0];
        const tint = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));

        landColour.set(biome, GROUND_COLOURS[GROUND.grass].map((c, k) => c + (tint[k] - c) * amount));
    }

    return landColour.get(biome);
}

/**
 * A patch of the world outside (buildWorld's), `size` metres square from (x0, z0): each square's
 * colour (its land's grass, roads, soil, water and bridges), the town's own picture where it
 * is (painted once: `town`, if it has been), and the trees, round. Returns the image (SCALE
 * pixels to the metre), with the town's picture as its `town`.
 */
export function paintPatch(world, x0, z0, size, town = null) {
    return allAtOnce(paintingPatch(world, x0, z0, size, town));
}

/**
 * The same (paintPatch), a step at a time (each a yield): each chunk's squares, the town, each
 * settlement near, and each chunk's trees a step of their own.
 */
export function* paintingPatch(world, x0, z0, size, town = null) {
    const overworld = world.maps.town;
    const data = new Uint8ClampedArray(size * size * 4);

    for (let cy = Math.floor(z0 / CHUNK); cy * CHUNK < z0 + size; cy++) {
        for (let cx = Math.floor(x0 / CHUNK); cx * CHUNK < x0 + size; cx++) {
            if (cx < 0 || cy < 0 || cx * CHUNK >= overworld.width || cy * CHUNK >= overworld.height) {
                continue;
            }

            const chunk = overworld.chunk(cx, cy);

            for (let j = 0; j < CHUNK; j++) {
                const y = chunk.y0 + j - z0;

                if (y < 0 || y >= size) {
                    continue;
                }

                for (let i = 0; i < CHUNK; i++) {
                    const x = chunk.x0 + i - x0;

                    if (x < 0 || x >= size) {
                        continue;
                    }

                    const k = j * CHUNK + i;
                    const ground = chunk.ground[k];
                    let colour;

                    if (chunk.bridge[k]) {
                        colour = BRIDGE;
                    } else if (chunk.water[k]) {
                        colour = WATER_COLOURS[chunk.water[k]];
                    } else if (ground === GROUND.grass) {
                        colour = grassOf(overworld.biomeAt(chunk.x0 + i, chunk.y0 + j));
                    } else {
                        colour = GROUND_COLOURS[ground] ?? GROUND_COLOURS[GROUND.grass];
                    }

                    const shade = 1 + 0.05 * jitter(chunk.x0 + i, chunk.y0 + j);
                    const at = (y * size + x) * 4;

                    data[at] = colour[0] * shade;
                    data[at + 1] = colour[1] * shade;
                    data[at + 2] = colour[2] * shade;
                    data[at + 3] = 255;
                }
            }

            yield;
        }
    }

    const squares = offscreen(size, size);

    squares.getContext("2d").putImageData(new ImageData(data, size, size), 0, 0);

    const image = offscreen(size * SCALE, size * SCALE);
    const context = image.getContext("2d");

    context.imageSmoothingEnabled = false;
    context.drawImage(squares, 0, 0, size * SCALE, size * SCALE);

    // The town, as it's painted on its own
    const { stamp, home } = world;

    image.town = town ?? paint(home);
    context.drawImage(image.town, (stamp.at[0] - x0) * SCALE, (stamp.at[1] - z0) * SCALE);
    yield;

    // The other settlements laid out near (their ground's in the chunks'): their buildings'
    // roofs, edges and ridges, and their props
    context.scale(SCALE, SCALE);
    context.translate(-x0, -z0);

    for (const settlement of overworld.settlements?.laid.values() ?? []) {
        const { at, size: across, town: layout } = settlement;

        if (at[0] < x0 + size && at[1] < z0 + size && at[0] + across > x0 && at[1] + across > z0) {
            paintSettlement(context, layout, at);
            yield;
        }
    }

    // The trees round it

    for (let cy = Math.floor(z0 / CHUNK); cy * CHUNK < z0 + size; cy++) {
        for (let cx = Math.floor(x0 / CHUNK); cx * CHUNK < x0 + size; cx++) {
            if (cx < 0 || cy < 0 || cx * CHUNK >= overworld.width || cy * CHUNK >= overworld.height) {
                continue;
            }

            for (const { x, y, size: grown } of overworld.chunk(cx, cy).trees) {
                crown(context, x, y, 1.8 * grown);
            }

            for (const feature of overworld.chunk(cx, cy).features ?? []) {
                mark(context, feature);
            }

            yield;
        }
    }

    return image;
}

// A settlement's buildings, their roofs in their styles' colours, dark edges and light ridges,
// and its props, as the town's are painted (its layout's metres from `at`, the world's)
function paintSettlement(context, layout, at) {
    for (const piece of layout.pieces) {
        if (piece.kind === "prop") {
            const corners = footprint(piece, -(piece.w * PLOT) / 4);

            outline(context, corners, at);
            context.fillStyle = `rgb(${PROP.join(",")})`;
            context.fill();
        } else if (piece.kind === "house" || piece.kind === "landmark") {
            const corners = footprint(piece, -0.3);
            const roof = piece.kind === "landmark" ? LANDMARK_ROOF : ROOFS[Math.max(0, HOUSE_STYLES.indexOf(piece.style))];
            const [a, b, c, d] = corners.map(([x, y]) => [x + at[0], y + at[1]]);
            const middle = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            const ridge = piece.w >= piece.h ? [middle(a, d), middle(b, c)] : [middle(a, b), middle(d, c)];

            outline(context, corners, at);
            context.fillStyle = `rgb(${roof.join(",")})`;
            context.fill();
            context.strokeStyle = "rgba(34, 22, 16, 0.85)";
            context.lineWidth = 0.6;
            context.stroke();
            context.beginPath();
            context.moveTo(...ridge[0]);
            context.lineTo(...ridge[1]);
            context.strokeStyle = "rgba(255, 230, 200, 0.35)";
            context.lineWidth = 0.5;
            context.stroke();
        }
    }
}

// A closed path round corners ([x, y]: metres, from `at`)
function outline(context, corners, at) {
    context.beginPath();
    corners.forEach(([x, y], k) => context[k ? "lineTo" : "moveTo"](x + at[0], y + at[1]));
    context.closePath();
}

// The colours of the land's own features on the map: stone grey, wood brown, bushes dark green
const FEATURE_COLOURS = { stone: "rgb(128, 124, 116)", wood: "rgb(112, 88, 62)", bush: "rgb(52, 84, 40)", straw: "rgb(196, 168, 96)", earth: "rgb(150, 96, 60)", bone: "rgb(226, 218, 196)" };
const FEATURE_LOOKS = { boulder: "stone", outcrop: "stone", cairn: "stone", menhir: "stone", ruin: "stone", log: "wood", stump: "wood", snag: "wood", logpile: "wood", scarecrow: "wood", bush: "bush", haystack: "straw", mound: "earth", ribs: "bone" };

// A feature (core/wilds.js) on the map: a line along a long one, a round mark for the rest
function mark(context, feature) {
    const { kind, x, y, size, turn } = feature;

    context.fillStyle = context.strokeStyle = FEATURE_COLOURS[FEATURE_LOOKS[kind]] ?? FEATURE_COLOURS.stone;

    // (An arch of rock: its two legs, each out as far as its foot reaches, and its span between them)
    if (kind === "arch") {
        const [dx, dy] = [Math.cos(turn) * size, Math.sin(turn) * size];

        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(x - dx, y - dy);
        context.lineTo(x + dx, y + dy);
        context.stroke();
        context.lineWidth = ARCHES.leg * 2;
        context.lineCap = "round";

        for (const [[fx, fy], [tx, ty]] of legsOf(feature.arch ?? { x, y, turn, span: size * 2 })) {
            context.beginPath();
            context.moveTo(fx, fy);
            context.lineTo(tx + (tx === fx && ty === fy ? 0.01 : 0), ty);
            context.stroke();
        }

        context.lineCap = "butt";

        return;
    }

    if (kind === "log" || kind === "ruin" || kind === "logpile" || kind === "ribs") {
        const [dx, dy] = [(Math.cos(turn) * size) / 2, (Math.sin(turn) * size) / 2];

        context.lineWidth = kind === "log" ? 0.9 : 0.7;
        context.beginPath();
        context.moveTo(x - dx, y - dy);
        context.lineTo(x + dx, y + dy);
        context.stroke();

        return;
    }

    context.beginPath();
    context.arc(x, y, Math.max(0.5, kind === "outcrop" ? size * 0.8 : size), 0, 2 * Math.PI);
    context.fill();
}

// A tree's crown, round, lit from the top left
function crown(context, x, y, r) {
    context.beginPath();
    context.arc(x, y, r, 0, 2 * Math.PI);
    context.fillStyle = `rgb(${TREE.join(",")})`;
    context.fill();
    context.beginPath();
    context.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 2 * Math.PI);
    context.fillStyle = "rgba(140, 180, 90, 0.35)";
    context.fill();
}
