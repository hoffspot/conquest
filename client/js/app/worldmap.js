// The world map: the whole world, full screen, opened by holding a finger (or the mouse) on the
// minimap, or pressing M. What the player's set foot in is shown, and a fog lies over every
// chunk of the world (64 metres square) they haven't (core/explored.js): the lands in their
// colours, shaded by their hills, with the rivers, lakes and seas and the roads between the
// settlements; nearer in, each chunk they've been in as the minimap paints it, every square of it
// (painted a few at a time as they come into view, and kept); the settlements' names; icons over
// the buildings they've gone into (app/mapicons.js); and where they are, pointing the way they
// face. Drag to look about, pinch or scroll to zoom, and tap the buttons to zoom or come back to
// where they are. Hold a finger (or the mouse) down somewhere to drop a pin there (or on the pin,
// to take it away), shown with the way there from where they are (the terrain plan's M7g) and how
// far that is beside it; tap twice somewhere to run there.
//
// Opened from a guild's portal (core/portals.js), it's the travel map: the same land and fog, but
// of the buildings only the guild's branches open to the player, each however far out it's
// zoomed, with its town's name and its fare; tapped, one's chosen.
//
// Opened at their ruler's (app/building.js), it's the building screen: of the buildings only their
// people's fortifications standing, each with its strength, and where the council would build
// more, each however far out it's zoomed, numbered best first, named, and whether the stores hold
// it now; tapped, one's chosen to counsel.

import { WET } from "../core/overworld.js";
import { BIOMES, CELL, CELLS, CHUNK, CHUNKS, WATER, WORLD_SIZE } from "../core/worldplan/plan.js";
import { drawBuildingIcon, FORT_ICONS } from "./mapicons.js";
import { FORD_MARK, grassOf, paintPatch, WATER_COLOURS } from "./minimap.js";

// The land's picture: pixels to a cell of the plan (32 metres)
const PIXELS = 4;

// How near it can be zoomed (metres to a pixel of the screen, least), and how far (the whole
// world fits the screen at most); and how much it shows of the world when it's opened (metres
// across the screen's shorter side)
const NEAREST = 0.25;
const OPENED = 900;

// A chunk the player has been in is shown as the minimap paints it from this near (metres to a
// pixel, at most), at this many pixels to the metre, painting at most this many a frame, keeping
// at most this many
const DETAIL_FROM = 4;
const DETAIL = 2;
const DETAIL_BUDGET = 6;
const DETAIL_KEEP = 240;

// Closed, it keeps this many of them (the latest drawn): the rest, and its other pictures, are
// painted again in a frame or two when it's opened
const DETAIL_RESTING = 48;

// The settlements' names from this near (metres to a pixel, at most), and the icons over the
// buildings gone into from this near, this big (pixels)
const NAMES_FROM = 20;
const ICONS_FROM = 6;
const ICON_SIZE = 24;

// The travel map's branches: how big their icons (pixels), and how near one a tap chooses it
// (pixels, from its middle)
const BRANCH_SIZE = 30;
const BRANCH_REACH = 28;

// (What's said across the top of the travel map: how much of it, pixels, the branches keep clear of)
const BRANCH_TOP = 72;

// The building screen's: how big a plan's icon and a fortification standing's (pixels)
const PLAN_SIZE = 30;
const FORT_SIZE = 22;

// Roads' colours and widths (metres; a pixel at least)
const ROAD = { colour: "rgb(186, 160, 112)", width: 5 };

/**
 * Holding a finger down this long (ms) without moving it more than TAP_MOVE pixels drops a pin;
 * tapping twice this soon (ms) within DOUBLE_REACH pixels is a double tap; and a hold this near the
 * pin (pixels) takes it away.
 */
export const HOLD_MS = 550;
const TAP_MOVE = 8;
const DOUBLE_MS = 350;
const DOUBLE_REACH = 18;
const PIN_REACH = 22;

// The pin and the way to it: their colours (the column's blue in the world)
const PIN = { colour: "#64b4ff", glow: "rgba(100, 180, 255, 0.9)", way: "rgba(130, 196, 255, 0.85)" };

/** How far something is, in words: "640 m"; past a kilometre, to a tenth of one ("1.3 km"). */
export function distanceLabel(metres) {
    return metres > 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

// How far it is along a way ([[x, z], ...] metres)
function lengthAlong(way) {
    let length = 0;

    for (let k = 1; k < way.length; k++) {
        length += Math.hypot(way[k][0] - way[k - 1][0], way[k][1] - way[k - 1][1]);
    }

    return length;
}

// The fog: its colour (and how much its clouds vary from it), and how big a tile of its clouds is
// (pixels of the screen)
const FOG = [30, 27, 22];
const FOG_VARY = 14;
const CLOUDS = 256;

// A canvas that isn't on the page
function offscreen(width, height) {
    return globalThis.OffscreenCanvas ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
}

/**
 * The land's picture: each cell of the plan its land's grass colour (as the minimap has it),
 * shaded as if lit from the north-west; the seas, lakes and rivers as the minimap has them.
 */
export function paintLand(plan) {
    const size = CELLS * PIXELS;
    const data = new Uint8ClampedArray(size * size * 4);
    const heightAt = (x, y) => plan.height[Math.min(CELLS - 1, Math.max(0, y)) * CELLS + Math.min(CELLS - 1, Math.max(0, x))];

    for (let y = 0; y < CELLS; y++) {
        for (let x = 0; x < CELLS; x++) {
            const k = y * CELLS + x;
            const water = plan.water[k];
            let colour;
            let shade = 1;

            if (water === WATER.river) {
                colour = WATER_COLOURS[WET.river];
            } else if (water) {
                colour = WATER_COLOURS[WET.still];
            } else {
                colour = grassOf(BIOMES[plan.biome[k]].id);
                shade = Math.min(1.3, Math.max(0.7, 1 + (heightAt(x - 1, y) - heightAt(x + 1, y) + heightAt(x, y - 1) - heightAt(x, y + 1)) * 3));
            }

            for (let dy = 0; dy < PIXELS; dy++) {
                for (let dx = 0; dx < PIXELS; dx++) {
                    const grain = water ? 1 : 0.97 + (((x * 7 + dx) * 13 + (y * 11 + dy) * 17) % 7) / 100;
                    const p = ((y * PIXELS + dy) * size + x * PIXELS + dx) * 4;

                    data[p] = colour[0] * shade * grain;
                    data[p + 1] = colour[1] * shade * grain;
                    data[p + 2] = colour[2] * shade * grain;
                    data[p + 3] = 255;
                }
            }
        }
    }

    const image = offscreen(size, size);

    image.getContext("2d").putImageData(new ImageData(data, size, size), 0, 0);

    return image;
}

/**
 * Where the fog lies: a pixel for every chunk of the world, solid where the player hasn't been
 * (`explored`: core/explored.js), clear where they have.
 */
export function paintFog(explored) {
    const data = new Uint8ClampedArray(CHUNKS * CHUNKS * 4);

    for (let cy = 0; cy < CHUNKS; cy++) {
        for (let cx = 0; cx < CHUNKS; cx++) {
            if (!explored.isVisited(cx, cy)) {
                data.set([...FOG, 255], (cy * CHUNKS + cx) * 4);
            }
        }
    }

    const image = offscreen(CHUNKS, CHUNKS);

    image.getContext("2d").putImageData(new ImageData(data, CHUNKS, CHUNKS), 0, 0);

    return image;
}

/**
 * The fog's clouds: a tile (CLOUDS pixels square, wrapping round so it tiles) of soft noise, a few
 * octaves of it, in shades of the fog's colour.
 */
function paintClouds() {
    const data = new Uint8ClampedArray(CLOUDS * CLOUDS * 4);
    let seed = 7;
    const next = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const octaves = [4, 8, 16, 32].map((cells) => ({ cells, values: Array.from({ length: cells * cells }, next) }));
    const smooth = (t) => t * t * (3 - 2 * t);

    for (let y = 0; y < CLOUDS; y++) {
        for (let x = 0; x < CLOUDS; x++) {
            let value = 0;
            let weight = 0;

            octaves.forEach(({ cells, values }, k) => {
                const [u, v] = [(x / CLOUDS) * cells, (y / CLOUDS) * cells];
                const [i, j] = [Math.floor(u), Math.floor(v)];
                const [fu, fv] = [smooth(u - i), smooth(v - j)];
                const at = (a, b) => values[(b % cells) * cells + (a % cells)];
                const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu;
                const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu;
                const amount = 1 / (k + 1);

                value += (top + (bottom - top) * fv) * amount;
                weight += amount;
            });

            const shade = (value / weight - 0.5) * 2 * FOG_VARY;

            data.set([FOG[0] + shade, FOG[1] + shade, FOG[2] + shade * 0.8, 255], (y * CLOUDS + x) * 4);
        }
    }

    const image = offscreen(CLOUDS, CLOUDS);

    image.getContext("2d").putImageData(new ImageData(data, CLOUDS, CLOUDS), 0, 0);

    return image;
}

export class WorldMap {
    /**
     * @param {HTMLCanvasElement} canvas - Where to draw it (sized by the page's styles).
     * @param {object} world - From buildWorld (core/overworld.js).
     * @param {import("../core/explored.js").Explored} explored - Where the player's been.
     */
    constructor(canvas, world, explored) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d");
        this.world = world;
        this.explored = explored;
        this.land = null;
        this.fog = null;
        this.fogVersion = -1;

        // The fog's clouds (a pattern), and where the fog's drawn through its chunks
        this.clouds = null;
        this.layer = null;

        // Chunks painted in detail (by index: most recently drawn last), and the town's picture
        // (painted once, for every chunk it's in)
        this.details = new Map();
        this.town = null;

        // What's shown: metres to a pixel of the screen, and the world's point at the middle
        this.view = { scale: 4, x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 };
        this.player = null;
        this.icons = [];
        this.frame = 0;
        this.fallback = 0;
        this.pointers = new Map();
        this.pinch = null;

        /** Heard with the point tapped ([x, z], metres) while picking somewhere (Wizard's Walk), or null. */
        this.onPick = null;
        this.pressed = null;

        /** Heard with the point held ([x, z], metres) and whether it's on the pin (to drop it, or take it away). */
        this.onHold = null;

        /** Heard with the point tapped twice ([x, z], metres): to run there. */
        this.onDoubleTap = null;

        // The pin ({ x, z } metres, or null) and the way to it ([[x, z], ...] metres, or null);
        // the hold under way (its timer), and the last tap (for a double tap)
        this.pin = null;
        this.way = null;
        this.holding = 0;
        this.lastTap = null;

        /** What was drawn last (for tests): { chunks (shown in detail), fogged, names, icons }. */
        this.drawn = null;

        /** The travel map's branches (core/portals.js branchesFrom), or null for the world map. */
        this.travel = null;

        /**
         * The building screen's plans and fortifications standing (app/building.js buildingView's
         * { plans, forts }), or null for the world map.
         */
        this.build = null;

        const listen = (type, listener, options) => {
            canvas.addEventListener(type, listener, options);
            this.listeners.push([type, listener]);
        };

        this.listeners = [];
        listen("pointerdown", (event) => this.#down(event));
        listen("pointermove", (event) => this.#move(event));
        listen("pointerup", (event) => this.#up(event));
        listen("pointercancel", (event) => this.#up(event));
        listen("wheel", (event) => this.#wheel(event), { passive: false });
    }

    /**
     * Open it on where the player is (`player` { x, z, facing }: metres, radians), with icons
     * over `icons` ([{ kind, x, z, rim }]: the buildings they've gone into, and the places worth
     * finding near where they've been, rimmed in who holds them), marks where their
     * requests take them (`marks`: [{ x, z, label }]), and their pin (`pin`: { x, z }, or null)
     * and the way to it (`way`: [[x, z], ...], or null). Or as the travel map (`travel`: the
     * branches), or the building screen (`build`: { plans, forts }).
     */
    open({ player, icons = [], marks = [], pin = null, way = null, travel = null, build = null }) {
        const only = Boolean(travel || build);

        this.land ??= paintLand(this.world.plan);
        this.player = player;
        this.travel = travel;
        this.build = build;
        this.icons = only ? [] : icons;
        this.marks = only ? [] : marks;
        this.pin = only ? null : pin;
        this.way = only ? null : way;
        this.lastTap = null;

        const [width, height] = this.#size();

        this.view = { scale: Math.max(NEAREST, OPENED / Math.max(1, Math.min(width, height))), x: player.x, z: player.z };

        // (The travel map: every branch open to them in view, if they're far apart, a little
        // below the middle, clear of what's said across the top; the building screen: every plan,
        // and where they are)
        const shown = travel ?? (build ? [...build.plans, ...(build.plans.length ? [] : build.forts), player] : null);

        if (shown?.length > 1) {
            const [xs, zs] = [shown.map(({ x }) => x), shown.map(({ z }) => z)];
            const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
            const scale = Math.max(this.view.scale, ((x1 - x0) * 1.5) / Math.max(1, width), ((z1 - z0) * 1.5) / Math.max(1, height - 2 * BRANCH_TOP));

            this.view = { scale, x: (x0 + x1) / 2, z: (z0 + z1) / 2 - (BRANCH_TOP / 2) * scale };
        }

        this.#clamp();
        this.draw();
    }

    /** The travel map's branch at a point (metres: [x, z]), tapped: the nearest near enough, or null. */
    branchAt(point) {
        return this.#nearest(this.travel, point);
    }

    /** The building screen's plan at a point (metres: [x, z]), tapped: the nearest near enough, or null. */
    planAt(point) {
        return this.#nearest(this.build?.plans, point);
    }

    // Of `list` ([{ x, z }]), the nearest a point (metres) within BRANCH_REACH pixels, or null
    #nearest(list, [x, z]) {
        let best = null;

        for (const each of list ?? []) {
            const pixels = Math.hypot(each.x - x, each.z - z) / this.view.scale;

            if (pixels <= BRANCH_REACH && (!best || pixels < best.pixels)) {
                best = { each, pixels };
            }
        }

        return best?.each ?? null;
    }

    /**
     * Show the pin somewhere else, or none (`pin`: { x, z }, or null), and the way to it (`way`:
     * [[x, z], ...], or null); or no pin at all (null).
     */
    setPin(shown) {
        this.pin = shown?.pin ?? null;
        this.way = shown?.way ?? null;
        this.redraw();
    }

    /** Whether a point on the canvas (pixels from its top left corner) is on the pin. */
    onPin(sx, sy) {
        if (!this.pin) {
            return false;
        }

        const [width, height] = this.#size();
        const [px, py] = [(this.pin.x - this.view.x) / this.view.scale + width / 2, (this.pin.z - this.view.z) / this.view.scale + height / 2];

        // (The pin's head stands over its point)
        return Math.hypot(sx - px, sy - (py - 14)) <= PIN_REACH;
    }

    /** The world's point (metres: [x, z]) at a point on the canvas (pixels from its top left corner). */
    pointAt(sx, sy) {
        const [width, height] = this.#size();

        return [this.view.x + (sx - width / 2) * this.view.scale, this.view.z + (sy - height / 2) * this.view.scale];
    }

    /** Whether somewhere's been uncovered (a point: metres). */
    uncovered([x, z]) {
        return this.explored?.visitedAt(x, z) ?? false;
    }

    /** Zoom in (`factor` below 1) or out, about the middle of the screen. */
    zoom(factor) {
        const [width, height] = this.#size();

        this.#zoomAt(factor, width / 2, height / 2);
    }

    /** Come back to where the player is. */
    centre() {
        if (this.player) {
            this.view.x = this.player.x;
            this.view.z = this.player.z;
            this.#clamp();
            this.redraw();
        }
    }

    /**
     * Draw it again, in the next frame (or, if the browser has no frame coming, as nothing else
     * on the page is changing, a moment later).
     */
    redraw() {
        if (this.frame) {
            return;
        }

        const now = () => {
            cancelAnimationFrame(this.frame);
            clearTimeout(this.fallback);
            this.frame = 0;
            this.draw();
        };

        this.frame = requestAnimationFrame(now);
        this.fallback = setTimeout(now, 50);
    }

    /** Draw it now. */
    draw() {
        const { canvas, context, view } = this;
        const [width, height] = this.#size();

        if (!width || !height || !this.land) {
            return;
        }

        const ratio = Math.min(2, globalThis.devicePixelRatio || 1);

        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
        }

        const [left, top] = [view.x - (width / 2) * view.scale, view.z - (height / 2) * view.scale];
        const at = (x, z) => [(x - left) / view.scale, (z - top) / view.scale];
        const across = WORLD_SIZE / view.scale;
        const [ox, oy] = at(0, 0);

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = `rgb(${FOG.join(",")})`;
        context.fillRect(0, 0, width, height);

        // The land, and the roads over it
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(this.land, ox, oy, across, across);
        this.#roads(at);

        // Near, the chunks the player's been in, every square of them
        const chunks = [];

        if (view.scale <= DETAIL_FROM) {
            const [c0, r0] = [Math.max(0, Math.floor(left / CHUNK)), Math.max(0, Math.floor(top / CHUNK))];
            const [c1, r1] = [Math.min(CHUNKS - 1, Math.floor((left + width * view.scale) / CHUNK)), Math.min(CHUNKS - 1, Math.floor((top + height * view.scale) / CHUNK))];
            let budget = DETAIL_BUDGET;
            let missing = false;

            for (let cy = r0; cy <= r1; cy++) {
                for (let cx = c0; cx <= c1; cx++) {
                    if (!this.explored.isVisited(cx, cy)) {
                        continue;
                    }

                    let detail = this.#detail(cx, cy, budget > 0);

                    if (detail === undefined) {
                        missing = true;
                        continue;
                    }

                    if (detail.fresh) {
                        budget--;
                        detail = detail.image;
                    }

                    const [x, y] = at(cx * CHUNK, cy * CHUNK);

                    context.drawImage(detail, x, y, CHUNK / view.scale, CHUNK / view.scale);
                    chunks.push(cy * CHUNKS + cx);
                }
            }

            // (The rest next frame)
            if (missing) {
                this.redraw();
            }
        }

        // The fog, over every chunk the player hasn't set foot in: its clouds (moving with the map
        // as it's dragged), kept to those chunks
        if (this.fogVersion !== this.explored.version) {
            this.fog = paintFog(this.explored);
            this.fogVersion = this.explored.version;
        }

        this.#drawFog(ox, oy, across, ratio);

        // The fords where the player's been: further out than the chunks are drawn square by
        // square (which have them marked as the minimap has: minimap.js fordMark), as many stones
        // across as there's room for
        if (view.scale > DETAIL_FROM && view.scale <= NAMES_FROM) {
            this.#fords(at, width, height);
        }

        // The settlements' names, where the player's been
        const names = [];

        if (view.scale <= NAMES_FROM) {
            context.font = `600 ${view.scale <= 4 ? 15 : 13}px Georgia, "Times New Roman", serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.lineJoin = "round";

            const branches = new Set((this.travel ?? []).map(({ id }) => id));

            for (const place of this.world.plan.places) {
                const [px, pz] = place.at;

                if (!this.explored.isVisited(Math.floor(px / CHUNK), Math.floor(pz / CHUNK)) || branches.has(place.id)) {
                    continue;
                }

                const [x, y] = at(px, pz - place.radius * 0.8);

                if (x < -100 || y < -20 || x > width + 100 || y > height + 20) {
                    continue;
                }

                context.lineWidth = 4;
                context.strokeStyle = "rgba(20, 14, 8, 0.85)";
                context.strokeText(place.name, x, y);
                context.fillStyle = "#f6ead0";
                context.fillText(place.name, x, y);
                names.push(place.name);
            }
        }

        // The buildings the player's gone into
        const icons = [];

        if (view.scale <= ICONS_FROM) {
            for (const icon of this.icons) {
                const [x, y] = at(icon.x, icon.z);

                if (x > -ICON_SIZE && y > -ICON_SIZE && x < width + ICON_SIZE && y < height + ICON_SIZE) {
                    drawBuildingIcon(context, icon.kind, x, y, ICON_SIZE, icon.rim);
                    icons.push(icon.kind);
                }
            }
        }

        // The travel map's branches, however far out: each a guild's icon, with its town's name
        // and its fare (or that it's where they are, ringed)
        for (const branch of this.travel ?? []) {
            const [x, y] = at(branch.x, branch.z);

            if (x < -120 || y < -60 || x > width + 120 || y > height + 60) {
                continue;
            }

            if (branch.here) {
                context.beginPath();
                context.arc(x, y, BRANCH_SIZE * 0.72, 0, Math.PI * 2);
                context.lineWidth = 3;
                context.strokeStyle = "#8fd2ff";
                context.stroke();
            }

            drawBuildingIcon(context, "guild", x, y, BRANCH_SIZE);
            context.font = `600 14px Georgia, "Times New Roman", serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.lineJoin = "round";

            for (const [text, dy, colour] of [[branch.name, -BRANCH_SIZE * 0.85, "#f6ead0"], [branch.here ? "You are here" : branch.fare ? `${branch.fare} gold` : "Free", BRANCH_SIZE * 0.85, branch.here ? "#8fd2ff" : "#f0c96a"]]) {
                context.lineWidth = 4;
                context.strokeStyle = "rgba(20, 14, 8, 0.85)";
                context.strokeText(text, x, y + dy);
                context.fillStyle = colour;
                context.fillText(text, x, y + dy);
            }

            icons.push("guild");
        }

        // The building screen: their people's fortifications standing, each with its strength
        // under it; and where the council would build, however far out, each ringed (in gold,
        // the one counselled), numbered best first, named, and whether the stores hold it now
        if (this.build) {
            this.#drawBuild(at, width, height, icons);
        }

        // Where the player's requests take them: a gold ring with a star in it, fog or no
        for (const mark of this.marks ?? []) {
            const [x, y] = at(mark.x, mark.z);

            if (x < -20 || y < -20 || x > width + 20 || y > height + 20) {
                continue;
            }

            context.beginPath();
            context.arc(x, y, 9, 0, Math.PI * 2);
            context.fillStyle = "rgba(30, 20, 8, 0.75)";
            context.fill();
            context.lineWidth = 2.4;
            context.strokeStyle = "#f0c96a";
            context.stroke();
            context.beginPath();

            for (let k = 0; k < 10; k++) {
                const [r, angle] = [k % 2 ? 2.4 : 6, -Math.PI / 2 + (k * Math.PI) / 5];

                context.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
            }

            context.closePath();
            context.fillStyle = "#f0c96a";
            context.fill();
        }

        // The way to the pin, and the pin: blue, glowing, fog or no
        if (this.pin) {
            this.#drawPin(at);
        }

        // Where the player is, the way they face
        if (this.player) {
            const [x, y] = at(this.player.x, this.player.z);

            context.save();
            context.translate(x, y);
            context.rotate(-this.player.facing);
            context.beginPath();
            context.moveTo(0, 9);
            context.lineTo(6.5, -6);
            context.lineTo(0, -3);
            context.lineTo(-6.5, -6);
            context.closePath();
            context.fillStyle = "#fff1c4";
            context.fill();
            context.strokeStyle = "rgba(30, 20, 8, 0.95)";
            context.lineWidth = 1.6;
            context.stroke();
            context.restore();
        }

        this.drawn = { chunks, fogged: CHUNKS * CHUNKS - this.explored.chunksVisited, names, icons, marks: (this.marks ?? []).length, pin: Boolean(this.pin), way: this.pin && this.way ? this.way.length : 0, distance: this.pin ? this.pinDistance : null, scale: view.scale, branches: (this.travel ?? []).length, plans: (this.build?.plans ?? []).length, forts: (this.build?.forts ?? []).length };
    }

    // The building screen's fortifications and plans (draw's)
    #drawBuild(at, width, height, icons) {
        const context = this.context;
        const label = (text, x, y, colour, size = 13) => {
            context.font = `600 ${size}px Georgia, "Times New Roman", serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.lineJoin = "round";
            context.lineWidth = 4;
            context.strokeStyle = "rgba(20, 14, 8, 0.85)";
            context.strokeText(text, x, y);
            context.fillStyle = colour;
            context.fillText(text, x, y);
        };
        const inView = (x, y) => x > -120 && y > -60 && x < width + 120 && y < height + 60;

        for (const fort of this.build.forts) {
            const [x, y] = at(fort.x, fort.z);

            if (!inView(x, y)) {
                continue;
            }

            drawBuildingIcon(context, FORT_ICONS[fort.kind], x, y, FORT_SIZE, "#e2c25a");

            // (Its strength: a bar under it)
            const [w, h, share] = [FORT_SIZE, 4, Math.max(0, Math.min(1, fort.hp / fort.maxHp))];

            context.fillStyle = "rgba(20, 14, 8, 0.85)";
            context.fillRect(x - w / 2 - 1, y + FORT_SIZE * 0.62 - 1, w + 2, h + 2);
            context.fillStyle = share > 0.5 ? "#7fcf6a" : share > 0.25 ? "#e8c35a" : "#e0634a";
            context.fillRect(x - w / 2, y + FORT_SIZE * 0.62, w * share, h);
            icons.push(FORT_ICONS[fort.kind]);
        }

        for (const plan of this.build.plans) {
            const [x, y] = at(plan.x, plan.z);

            if (!inView(x, y)) {
                continue;
            }

            context.save();
            context.beginPath();
            context.arc(x, y, PLAN_SIZE * 0.7, 0, Math.PI * 2);
            context.setLineDash(plan.counselled ? [] : [5, 4]);
            context.lineWidth = plan.counselled ? 3 : 2;
            context.strokeStyle = plan.counselled ? "#f0c96a" : "rgba(246, 234, 208, 0.85)";
            context.stroke();
            context.restore();
            context.globalAlpha = plan.affordable ? 1 : 0.7;
            drawBuildingIcon(context, FORT_ICONS[plan.kind], x, y, PLAN_SIZE);
            context.globalAlpha = 1;

            // (Its place in the council's order, on a gold badge by it)
            const [bx, by] = [x + PLAN_SIZE * 0.5, y - PLAN_SIZE * 0.5];

            context.beginPath();
            context.arc(bx, by, 8, 0, Math.PI * 2);
            context.fillStyle = "#f0c96a";
            context.fill();
            context.lineWidth = 1.5;
            context.strokeStyle = "#2a1608";
            context.stroke();
            context.font = `700 11px Georgia, "Times New Roman", serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = "#2a1608";
            context.fillText(String(plan.place), bx, by + 0.5);

            label(plan.kind === "garrison" ? "Forward garrison" : "Guard tower", x, y - PLAN_SIZE * 0.95, "#f6ead0");
            label(plan.counselled ? "Counselled" : plan.affordable ? "The stores hold it" : "Saving for it", x, y + PLAN_SIZE * 0.95, plan.counselled ? "#f0c96a" : plan.affordable ? "#a8e08c" : "#e8b07a", 12);
            icons.push(FORT_ICONS[plan.kind]);
        }
    }

    /**
     * Closed: let go of what's quickly painted again, rather than keep it the whole game (25 to 30
     * MB of pictures): its fog's layer, all but the latest chunks painted in detail, and its own
     * pixels (the canvas's made the screen's size again when it's next drawn).
     */
    rest() {
        cancelAnimationFrame(this.frame);
        clearTimeout(this.fallback);
        clearTimeout(this.holding);
        this.frame = 0;
        this.layer = null;

        for (const key of [...this.details.keys()].slice(0, Math.max(0, this.details.size - DETAIL_RESTING))) {
            this.details.delete(key);
        }

        this.canvas.width = this.canvas.height = 1;
    }

    /** Stop listening, and let go of what it painted. */
    dispose() {
        for (const [type, listener] of this.listeners) {
            this.canvas.removeEventListener(type, listener);
        }

        clearTimeout(this.holding);
        cancelAnimationFrame(this.frame);
        clearTimeout(this.fallback);
        this.frame = 0;
        this.details.clear();
    }

    // The canvas's size on the page (pixels)
    #size() {
        return [this.canvas.clientWidth, this.canvas.clientHeight];
    }

    // The fog's clouds through where it lies (the world's corner at ox, oy and `across` pixels
    // wide on the screen), onto the map
    #drawFog(ox, oy, across, ratio) {
        const { canvas, context } = this;

        if (!this.layer || this.layer.width !== canvas.width || this.layer.height !== canvas.height) {
            this.layer = offscreen(canvas.width, canvas.height);
        }

        const fog = this.layer.getContext("2d");

        this.clouds ??= fog.createPattern(paintClouds(), "repeat");
        fog.setTransform(1, 0, 0, 1, 0, 0);
        fog.globalCompositeOperation = "copy";
        fog.imageSmoothingEnabled = false;
        fog.drawImage(this.fog, ox * ratio, oy * ratio, across * ratio, across * ratio);
        fog.globalCompositeOperation = "source-in";
        this.clouds.setTransform(new DOMMatrix([1, 0, 0, 1, ox * ratio, oy * ratio]));
        fog.fillStyle = this.clouds;
        fog.fillRect(0, 0, this.layer.width, this.layer.height);
        fog.globalCompositeOperation = "source-over";

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(this.layer, 0, 0);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // The way to the pin (a glowing blue line, from where the player is), and the pin over its
    // point: a blue head on a pin, glowing, and how far it is beside it (along the way, or as the
    // crow flies when there's none)
    #drawPin(at) {
        const { context } = this;

        context.save();
        context.lineCap = context.lineJoin = "round";
        context.shadowColor = PIN.glow;

        if (this.way?.length > 1) {
            context.shadowBlur = 8;
            context.strokeStyle = PIN.way;
            context.lineWidth = 3;
            context.setLineDash([]);
            context.beginPath();
            this.way.forEach(([x, z], k) => context[k ? "lineTo" : "moveTo"](...at(x, z)));
            context.stroke();
        }

        const [x, y] = at(this.pin.x, this.pin.z);

        context.shadowBlur = 14;
        context.strokeStyle = "rgba(20, 30, 50, 0.9)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y - 12);
        context.stroke();
        context.beginPath();
        context.arc(x, y - 16, 7, 0, Math.PI * 2);
        context.fillStyle = PIN.colour;
        context.fill();
        context.shadowBlur = 0;
        context.lineWidth = 1.6;
        context.stroke();
        context.beginPath();
        context.arc(x - 2, y - 18, 2.2, 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 255, 255, 0.8)";
        context.fill();

        const far = this.way?.length > 1 ? lengthAlong(this.way) : this.player ? Math.hypot(this.pin.x - this.player.x, this.pin.z - this.player.z) : null;

        this.pinDistance = far === null ? null : distanceLabel(far);

        if (this.pinDistance) {
            // (On the pin's right, or its left if that's off the edge)
            const [width] = this.#size();

            context.font = `600 13px Georgia, "Times New Roman", serif`;
            context.textBaseline = "middle";

            const wide = context.measureText(this.pinDistance).width;
            const left = x + 12 + wide > width - 6;

            context.textAlign = left ? "right" : "left";
            context.lineWidth = 3.5;
            context.strokeStyle = "rgba(10, 20, 40, 0.9)";
            context.strokeText(this.pinDistance, left ? x - 12 : x + 12, y - 16);
            context.fillStyle = "#e6f3ff";
            context.fillText(this.pinDistance, left ? x - 12 : x + 12, y - 16);
        }

        context.restore();
    }

    // The fords (core/terrain/waters.js fords) in the chunks the player's been in: a row of three
    // pale stones straight across the river at each, a few pixels apart whatever the scale
    #fords(at, width, height) {
        const { context } = this;

        context.fillStyle = FORD_MARK.colour;
        context.strokeStyle = FORD_MARK.edge;
        context.lineWidth = 1;

        for (const { at: [fx, fz], banks: [[ax, az], [bx, bz]] } of this.world.maps?.town?.waters?.fords() ?? []) {
            if (!this.explored.isVisited(Math.floor(fx / CHUNK), Math.floor(fz / CHUNK))) {
                continue;
            }

            const [x, y] = at(fx, fz);

            if (x < -10 || y < -10 || x > width + 10 || y > height + 10) {
                continue;
            }

            const long = Math.hypot(bx - ax, bz - az) || 1;
            const [ux, uy] = [(bx - ax) / long, (bz - az) / long];

            for (const k of [-1, 0, 1]) {
                context.beginPath();
                context.arc(x + ux * k * 4, y + uy * k * 4, 1.8, 0, Math.PI * 2);
                context.fill();
                context.stroke();
            }
        }
    }

    // The roads between the settlements, as the plan has them (from cell middle to cell middle)
    #roads(at) {
        const { context, view } = this;

        context.lineCap = context.lineJoin = "round";
        context.strokeStyle = ROAD.colour;
        context.lineWidth = Math.max(1, ROAD.width / view.scale);
        context.beginPath();

        for (const road of this.world.plan.roads) {
            road.cells.forEach(([x, y], k) => {
                const [sx, sy] = at((x + 0.5) * CELL, (y + 0.5) * CELL);

                context[k ? "lineTo" : "moveTo"](sx, sy);
            });
        }

        context.stroke();
    }

    // A chunk's picture, every square as the minimap paints it: painted if it hasn't been (if
    // `paint`: { fresh, image }), or undefined for one to paint later
    #detail(cx, cy, paint) {
        const key = cy * CHUNKS + cx;
        const kept = this.details.get(key);

        if (kept) {
            this.details.delete(key);
            this.details.set(key, kept);

            return kept;
        }

        if (!paint) {
            return undefined;
        }

        const patch = paintPatch(this.world, cx * CHUNK, cy * CHUNK, CHUNK, this.town);
        const image = offscreen(CHUNK * DETAIL, CHUNK * DETAIL);
        const context = image.getContext("2d");

        this.town = patch.town;
        context.imageSmoothingQuality = "high";
        context.drawImage(patch, 0, 0, CHUNK * DETAIL, CHUNK * DETAIL);

        if (this.details.size >= DETAIL_KEEP) {
            this.details.delete(this.details.keys().next().value);
        }

        this.details.set(key, image);

        return { fresh: true, image };
    }

    // Keep the view on the world: no nearer than NEAREST, no further than the whole of it, and
    // the world in the middle whichever way it's smaller than the screen
    #clamp() {
        const [width, height] = this.#size();
        const view = this.view;
        const furthest = (WORLD_SIZE * 1.1) / Math.max(1, Math.min(width, height));

        view.scale = Math.min(furthest, Math.max(NEAREST, view.scale));

        for (const [axis, pixels] of [["x", width], ["z", height]]) {
            const half = (pixels / 2) * view.scale;

            view[axis] = half * 2 >= WORLD_SIZE ? WORLD_SIZE / 2 : Math.min(WORLD_SIZE - half, Math.max(half, view[axis]));
        }
    }

    // Zoom by `factor` keeping the world's point under (sx, sy) (pixels) where it is
    #zoomAt(factor, sx, sy) {
        const [width, height] = this.#size();
        const view = this.view;
        const [wx, wz] = [view.x + (sx - width / 2) * view.scale, view.z + (sy - height / 2) * view.scale];

        view.scale *= factor;
        this.#clamp();
        view.x = wx - (sx - width / 2) * view.scale;
        view.z = wz - (sy - height / 2) * view.scale;
        this.#clamp();
        this.redraw();
    }

    // --- Dragging, pinching and scrolling ---

    #down(event) {
        this.canvas.setPointerCapture?.(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.pressed = this.pointers.size === 1 ? { x: event.clientX, y: event.clientY, moved: 0, held: false } : null;

        // (Held still long enough: a pin dropped, or taken away; not while picking somewhere)
        clearTimeout(this.holding);

        if (this.pressed && this.onHold && !this.onPick) {
            const pressed = this.pressed;

            this.holding = setTimeout(() => {
                if (this.pressed !== pressed || pressed.moved >= TAP_MOVE) {
                    return;
                }

                const rect = this.canvas.getBoundingClientRect();
                const [sx, sy] = [pressed.x - rect.left, pressed.y - rect.top];

                pressed.held = true;
                this.lastTap = null;
                this.onHold(this.pointAt(sx, sy), this.onPin(sx, sy));
            }, HOLD_MS);
        }

        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];

            this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
        }
    }

    #move(event) {
        const pointer = this.pointers.get(event.pointerId);

        if (!pointer) {
            return;
        }

        const [dx, dy] = [event.clientX - pointer.x, event.clientY - pointer.y];

        pointer.x = event.clientX;
        pointer.y = event.clientY;

        if (this.pressed) {
            this.pressed.moved += Math.abs(dx) + Math.abs(dy);
        }

        if (this.pointers.size === 2 && this.pinch) {
            const [a, b] = [...this.pointers.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            const rect = this.canvas.getBoundingClientRect();

            if (distance > 0 && this.pinch.distance > 0) {
                this.#zoomAt(this.pinch.distance / distance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
            }

            this.pinch.distance = distance;

            return;
        }

        if (Math.abs(dx) + Math.abs(dy) > 0) {
            this.view.x -= dx * this.view.scale;
            this.view.z -= dy * this.view.scale;
            this.#clamp();
            this.redraw();
        }
    }

    #up(event) {
        this.pointers.delete(event.pointerId);
        clearTimeout(this.holding);

        const tapped = this.pressed && this.pressed.moved < TAP_MOVE && !this.pressed.held && event.type === "pointerup";
        const rect = this.canvas.getBoundingClientRect();
        const [sx, sy] = [event.clientX - rect.left, event.clientY - rect.top];

        // (Picking somewhere: a tap, not a drag)
        if (this.onPick && tapped) {
            this.onPick(this.pointAt(sx, sy));
        } else if (this.onDoubleTap && tapped) {
            // (Twice, quickly, in the same place: run there)
            const last = this.lastTap;
            const now = event.timeStamp;

            if (last && now - last.time <= DOUBLE_MS && Math.hypot(sx - last.x, sy - last.y) <= DOUBLE_REACH) {
                this.lastTap = null;
                this.onDoubleTap(this.pointAt(sx, sy));
            } else {
                this.lastTap = { time: now, x: sx, y: sy };
            }
        }

        this.pressed = null;

        if (this.pointers.size < 2) {
            this.pinch = null;
        }
    }

    #wheel(event) {
        event.preventDefault();

        const rect = this.canvas.getBoundingClientRect();

        this.#zoomAt(Math.exp(event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    }
}
