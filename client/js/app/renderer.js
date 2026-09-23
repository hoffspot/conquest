import { GRID_SIZE } from "../core/config.js";

// The game area is always 400 pixels tall; its width changes with the window's aspect ratio
const CANVAS_HEIGHT = 400;

/**
 * Draws the game onto two stacked canvases: the background canvas holds the map and is only
 * redrawn when the view scrolls, while the foreground canvas is cleared and redrawn every frame.
 */
export class Renderer {
    constructor({ game, backgroundCanvas, foregroundCanvas }) {
        this.game = game;

        this.backgroundCanvas = backgroundCanvas;
        this.backgroundContext = backgroundCanvas.getContext("2d");
        this.foregroundCanvas = foregroundCanvas;
        this.foregroundContext = foregroundCanvas.getContext("2d");

        // The visible part of the map, in map pixel coordinates
        this.offsetX = 0;
        this.offsetY = 0;
        this.width = 480;
        this.height = CANVAS_HEIGHT;

        // Overlays (selection box, building placement grid) drawn on top of everything else
        this.overlays = [];

        // The fog is painted onto an offscreen canvas the size of the whole map
        this.fogCanvas = document.createElement("canvas");
        this.fogContext = this.fogCanvas.getContext("2d");
        this.paintedFogVersion = -1;

        this.resize(this.width);
    }

    resize(width) {
        this.width = width;

        for (const canvas of [this.backgroundCanvas, this.foregroundCanvas]) {
            canvas.width = width;
            canvas.height = this.height;
        }

        // Ensure the resizing doesn't cause the map to pan out of bounds
        this.panBy(0, 0);
        this.refreshBackground = true;
    }

    setMap(mapImage) {
        this.mapImage = mapImage;
        this.fogCanvas.width = mapImage.width;
        this.fogCanvas.height = mapImage.height;
        this.paintedFogVersion = -1;
        this.refreshBackground = true;
    }

    // Move the view to a map position (in pixels), keeping it within the map
    setView(offsetX, offsetY) {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.panBy(0, 0);
        this.refreshBackground = true;
    }

    /** Scroll the view, staying within the map. Returns true if the view moved. */
    panBy(dx, dy) {
        const mapWidth = this.mapImage?.width ?? this.width;
        const mapHeight = this.mapImage?.height ?? this.height;

        const offsetX = Math.round(Math.min(Math.max(this.offsetX + dx, 0), Math.max(0, mapWidth - this.width)));
        const offsetY = Math.round(Math.min(Math.max(this.offsetY + dy, 0), Math.max(0, mapHeight - this.height)));

        if (offsetX === this.offsetX && offsetY === this.offsetY) {
            return false;
        }

        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.refreshBackground = true;

        return true;
    }

    /**
     * Draw a frame.
     * @param {number} interpolation  -1..0, how far between the previous and the current tick to draw moving items
     */
    render(interpolation) {
        const context = this.foregroundContext;
        const view = { offsetX: this.offsetX, offsetY: this.offsetY, interpolation };

        this.drawBackground();

        context.clearRect(0, 0, this.width, this.height);

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

        for (const overlay of this.overlays) {
            overlay(context, view);
        }
    }

    // Since drawing the background map is a fairly large operation,
    // we only redraw the background if it changes (due to panning or resizing)
    drawBackground() {
        if (!this.refreshBackground || !this.mapImage) {
            return;
        }

        this.backgroundContext.drawImage(this.mapImage,
            this.offsetX, this.offsetY, this.width, this.height,
            0, 0, this.width, this.height);

        this.refreshBackground = false;
    }

    drawFog() {
        const fog = this.game.fog;

        if (!this.mapImage) {
            return;
        }

        if (this.paintedFogVersion !== fog.version) {
            this.paintFog(fog.grid);
            this.paintedFogVersion = fog.version;
        }

        this.foregroundContext.drawImage(this.fogCanvas,
            this.offsetX, this.offsetY, this.width, this.height,
            0, 0, this.width, this.height);
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

    // Draw a message such as "PAUSED" in the middle of the game area
    drawBanner(text) {
        const context = this.foregroundContext;

        context.save();
        context.fillStyle = "rgba(0,0,0,0.5)";
        context.fillRect(0, this.height / 2 - 30, this.width, 60);
        context.font = "bold 32px \"Courier New\", Courier, monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "white";
        context.fillText(text, this.width / 2, this.height / 2);
        context.restore();
    }
}
