// The world map: the whole world, full screen, opened by holding a finger (or the mouse) on the
// minimap, or pressing M. What the player's set foot in is shown, and a fog lies over every
// chunk of the world (64 metres square) they haven't (core/explored.js): the lands in their
// colours, shaded by their hills, with the rivers, lakes and seas and the roads between the
// settlements; nearer in, each chunk they've been in as the minimap paints it, every square of it
// (painted a few at a time as they come into view, and kept); the settlements' names; icons over
// the buildings they've gone into (app/mapicons.js); and where they are, pointing the way they
// face. Drag to look about, pinch or scroll to zoom, and tap the buttons to zoom or come back to
// where they are.

import { WET } from "../core/overworld.js";
import { BIOMES, CELL, CELLS, CHUNK, CHUNKS, WATER, WORLD_SIZE } from "../core/worldplan/plan.js";
import { drawBuildingIcon } from "./mapicons.js";
import { grassOf, paintPatch, WATER_COLOURS } from "./minimap.js";

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

// The settlements' names from this near (metres to a pixel, at most), and the icons over the
// buildings gone into from this near, this big (pixels)
const NAMES_FROM = 20;
const ICONS_FROM = 6;
const ICON_SIZE = 24;

// Roads' colours and widths (metres; a pixel at least)
const ROAD = { colour: "rgb(186, 160, 112)", width: 5 };

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

        /** What was drawn last (for tests): { chunks (shown in detail), fogged, names, icons }. */
        this.drawn = null;

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
     * over `icons` ([{ kind, x, z }]: the buildings they've gone into).
     */
    open({ player, icons = [] }) {
        this.land ??= paintLand(this.world.plan);
        this.player = player;
        this.icons = icons;

        const [width, height] = this.#size();

        this.view = { scale: Math.max(NEAREST, OPENED / Math.max(1, Math.min(width, height))), x: player.x, z: player.z };
        this.#clamp();
        this.draw();
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

        // The settlements' names, where the player's been
        const names = [];

        if (view.scale <= NAMES_FROM) {
            context.font = `600 ${view.scale <= 4 ? 15 : 13}px Georgia, "Times New Roman", serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.lineJoin = "round";

            for (const place of this.world.plan.places) {
                const [px, pz] = place.at;

                if (!this.explored.isVisited(Math.floor(px / CHUNK), Math.floor(pz / CHUNK))) {
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
                    drawBuildingIcon(context, icon.kind, x, y, ICON_SIZE);
                    icons.push(icon.kind);
                }
            }
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

        this.drawn = { chunks, fogged: CHUNKS * CHUNKS - this.explored.chunksVisited, names, icons, scale: view.scale };
    }

    /** Stop listening, and let go of what it painted. */
    dispose() {
        for (const [type, listener] of this.listeners) {
            this.canvas.removeEventListener(type, listener);
        }

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
