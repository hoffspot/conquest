import { GRID_SIZE } from "../core/config.js";

const TEAM_COLORS = { blue: "#4aa8ff", green: "#5cff5c" };
const TERRAIN_COLOR = "#e0b050";
const VIEW_COLOR = "rgba(255,255,255,0.9)";

/**
 * A small overview of the whole map in the sidebar (the book's sidebar art has an empty black
 * square for it). Shows the terrain, the fog of war, every visible item as a coloured dot and the
 * part of the map on screen. Tapping or dragging on it moves the view.
 */
export class Minimap {
    #dragging = false;

    constructor({ canvas, game, camera, renderer }) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d");
        this.game = game;
        this.camera = camera;
        this.renderer = renderer;

        canvas.addEventListener("pointerdown", (ev) => {
            ev.preventDefault();
            this.#dragging = true;
            canvas.setPointerCapture?.(ev.pointerId);
            this.#moveViewTo(ev);
        });
        canvas.addEventListener("pointermove", (ev) => {
            if (this.#dragging) {
                this.#moveViewTo(ev);
            }
        });

        for (const type of ["pointerup", "pointercancel"]) {
            canvas.addEventListener(type, () => {
                this.#dragging = false;
            });
        }
    }

    // Match the canvas resolution to its size on screen (in CSS pixels)
    resize(size) {
        const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
        const pixels = Math.max(1, Math.round(size * pixelRatio));

        this.canvas.width = pixels;
        this.canvas.height = pixels;
    }

    // Where the map is drawn inside the (square) minimap: as large as possible, centred
    #mapRect() {
        const { mapWidth, mapHeight } = this.camera;
        const scale = Math.min(this.canvas.width / mapWidth, this.canvas.height / mapHeight);
        const width = mapWidth * scale;
        const height = mapHeight * scale;

        return { x: (this.canvas.width - width) / 2, y: (this.canvas.height - height) / 2, width, height, scale };
    }

    #moveViewTo(ev) {
        if (!this.camera.mapWidth) {
            return;
        }

        const bounds = this.canvas.getBoundingClientRect();
        const map = this.#mapRect();
        const canvasX = (ev.clientX - bounds.left) * this.canvas.width / bounds.width;
        const canvasY = (ev.clientY - bounds.top) * this.canvas.height / bounds.height;

        this.camera.centerOn((canvasX - map.x) / map.scale, (canvasY - map.y) / map.scale);
    }

    render() {
        const { context, game, camera, renderer } = this;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = "#000";
        context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!renderer.mapImage || !camera.mapWidth) {
            return;
        }

        const map = this.#mapRect();

        context.setTransform(map.scale, 0, 0, map.scale, map.x, map.y);
        context.drawImage(renderer.mapImage, 0, 0);
        context.drawImage(renderer.fogCanvas, 0, 0);

        // Items as dots; the player's own items are always shown, others only when not under fog
        const dotSize = Math.max(GRID_SIZE, 2.5 / map.scale);

        for (const item of game.items) {
            if (item.type === "bullets" || item.lifeCode === "dead") {
                continue;
            }

            if (item.team !== game.team && game.fog.isTileFogged(Math.floor(item.x), Math.floor(item.y))) {
                continue;
            }

            context.fillStyle = item.team ? TEAM_COLORS[item.team] : TERRAIN_COLOR;

            if (item.type === "buildings" || item.type === "terrain") {
                context.fillRect(item.x * GRID_SIZE, item.y * GRID_SIZE, Math.max(item.baseWidth, dotSize), Math.max(item.baseHeight, dotSize));
            } else {
                context.fillRect(item.x * GRID_SIZE - dotSize / 2, item.y * GRID_SIZE - dotSize / 2, dotSize, dotSize);
            }
        }

        // The part of the map currently on screen
        context.strokeStyle = VIEW_COLOR;
        context.lineWidth = 1.5 / map.scale;
        context.strokeRect(camera.offsetX, camera.offsetY, camera.width, camera.height);
    }
}
