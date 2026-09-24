import { GRID_SIZE } from "../core/config.js";

// Canvases are rendered at the screen's pixel density for sharp output, up to this limit
// (beyond 2x the difference is hard to see, but the cost in battery life is not)
const MAX_PIXEL_RATIO = 2;

// How long a command marker (the ring shown where a unit was ordered to go) stays visible
const MARKER_DURATION_MS = 500;

/**
 * Draws the game onto two stacked canvases: the background canvas holds the map and is only
 * redrawn when the view changes, while the foreground canvas is cleared and redrawn every frame.
 * Everything is drawn in world pixels, scaled by the camera's zoom and the screen's pixel ratio.
 */
export class Renderer {
    #lastBackground = "";
    #markers = [];
    // Lets items drawn in 3D replace their sprites (see Entity.draw)
    #drawModel = (context, item) => this.units3d?.draw(context, item) ?? false;

    constructor({ game, camera, backgroundCanvas, foregroundCanvas }) {
        this.game = game;
        this.camera = camera;

        this.backgroundCanvas = backgroundCanvas;
        this.backgroundContext = backgroundCanvas.getContext("2d");
        this.foregroundCanvas = foregroundCanvas;
        this.foregroundContext = foregroundCanvas.getContext("2d");
        this.pixelRatio = 1;

        // Overlays (selection box, building placement grid) drawn on top of everything else
        this.overlays = [];

        // Draws some units in 3D instead of sprites, once loaded (js/app/units3d.js)
        this.units3d = undefined;

        // The fog is painted onto an offscreen canvas the size of the whole map
        this.fogCanvas = document.createElement("canvas");
        this.fogContext = this.fogCanvas.getContext("2d");
        this.paintedFogVersion = -1;
    }

    // The visible part of the map in world pixels (used by the input code)
    get offsetX() {
        return this.camera.offsetX;
    }

    get offsetY() {
        return this.camera.offsetY;
    }

    get width() {
        return this.camera.width;
    }

    get height() {
        return this.camera.height;
    }

    /** Size the canvases to fill width x height CSS pixels. */
    resize(width, height) {
        this.pixelRatio = Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);

        for (const canvas of [this.backgroundCanvas, this.foregroundCanvas]) {
            canvas.width = Math.round(width * this.pixelRatio);
            canvas.height = Math.round(height * this.pixelRatio);
        }

        this.camera.setViewSize(width, height);
        this.#lastBackground = "";
    }

    setMap(mapImage) {
        this.mapImage = mapImage;
        this.fogCanvas.width = mapImage.width;
        this.fogCanvas.height = mapImage.height;
        this.paintedFogVersion = -1;
        this.camera.setMapSize(mapImage.width, mapImage.height);
        this.#lastBackground = "";
    }

    /** Show a ring at a world position, e.g. to confirm where units were ordered to go. */
    addMarker(x, y, color) {
        this.#markers.push({ x, y, color, start: performance.now() });
    }

    // Scale drawing so that one unit is one world pixel
    #applyTransform(context) {
        const scale = this.camera.zoom * this.pixelRatio;

        context.setTransform(scale, 0, 0, scale, 0, 0);
    }

    /**
     * Draw a frame.
     * @param {number} interpolation  -1..0, how far between the previous and the current tick to draw moving items
     */
    render(interpolation) {
        const context = this.foregroundContext;
        const view = { offsetX: this.offsetX, offsetY: this.offsetY, interpolation, zoom: this.camera.zoom, drawModel: this.#drawModel };

        this.drawBackground();

        // Render the 3D units first; each is copied onto the map when its turn to be drawn comes
        this.units3d?.render(this.game.sortedItems, {
            scale: this.camera.zoom * this.pixelRatio,
            interpolation,
            tick: this.game.tick,
            view: { x: this.offsetX, y: this.offsetY, width: this.width, height: this.height },
        });

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, this.foregroundCanvas.width, this.foregroundCanvas.height);
        this.#applyTransform(context);

        for (const item of this.game.sortedItems) {
            item.draw(context, view);
        }

        // Draw exploding bullets on top of everything else
        for (const bullet of this.game.bullets) {
            if (bullet.action === "explode") {
                bullet.draw(context, view);
            }
        }

        this.drawFog();
        this.#drawMarkers(context, view);

        for (const overlay of this.overlays) {
            overlay(context, view);
        }
    }

    // Since drawing the background map is a fairly large operation,
    // only redraw it when the view changes (due to panning, zooming or resizing)
    drawBackground() {
        if (!this.mapImage) {
            return;
        }

        const { offsetX, offsetY, zoom } = this.camera;
        const state = `${offsetX},${offsetY},${zoom},${this.backgroundCanvas.width},${this.backgroundCanvas.height}`;

        if (state === this.#lastBackground) {
            return;
        }

        const context = this.backgroundContext;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = "#090009";
        context.fillRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
        this.#applyTransform(context);
        context.drawImage(this.mapImage, -offsetX, -offsetY);

        this.#lastBackground = state;
    }

    drawFog() {
        if (!this.mapImage) {
            return;
        }

        if (this.paintedFogVersion !== this.game.fog.version) {
            this.paintFog(this.game.fog.grid);
            this.paintedFogVersion = this.game.fog.version;
        }

        this.foregroundContext.drawImage(this.fogCanvas, -this.offsetX, -this.offsetY);
    }

    // Cover the map with a darkened copy of itself, then cut soft-edged holes where the player can see
    paintFog(grid) {
        const context = this.fogContext;

        context.globalCompositeOperation = "source-over";
        context.drawImage(this.mapImage, 0, 0);
        context.fillStyle = "rgba(0,0,0,0.8)";
        context.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);

        context.globalCompositeOperation = "destination-out";

        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                if (grid[y][x] !== 0) {
                    continue;
                }

                const centerX = x * GRID_SIZE + 12;
                const centerY = y * GRID_SIZE + 12;

                for (const [radius, alpha] of [[16, 0.9], [18, 0.7], [24, 0.5]]) {
                    context.fillStyle = `rgba(100,0,0,${alpha})`;
                    context.beginPath();
                    context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
                    context.fill();
                }
            }
        }

        context.globalCompositeOperation = "source-over";
    }

    // Expanding, fading rings where commands were given
    #drawMarkers(context, view) {
        const now = performance.now();

        this.#markers = this.#markers.filter((marker) => now - marker.start < MARKER_DURATION_MS);

        for (const marker of this.#markers) {
            const progress = (now - marker.start) / MARKER_DURATION_MS;

            context.globalAlpha = 1 - progress;
            context.strokeStyle = marker.color;
            context.lineWidth = 2 / view.zoom;
            context.beginPath();
            context.arc(marker.x - view.offsetX, marker.y - view.offsetY, (6 + 14 * progress), 0, Math.PI * 2);
            context.stroke();
        }

        context.globalAlpha = 1;
    }
}
