// The camera: which part of the map is on screen, and how much it is magnified.
//
// World coordinates are map pixels (a tile is 20 world pixels). Screen coordinates are CSS pixels
// relative to the top left corner of the map area. zoom is the number of CSS pixels per world pixel.
// This module has no DOM code so the maths can be unit tested.

// Never zoom in further than this many CSS pixels per world pixel
const MAX_ZOOM = 4;

export class Camera {
    // Top left corner of the view, in world pixels
    offsetX = 0;
    offsetY = 0;
    zoom = 1;

    // Size of the map area on screen, in CSS pixels
    viewWidth = 0;
    viewHeight = 0;

    mapWidth = 0;
    mapHeight = 0;

    // Width and height of the visible part of the map, in world pixels
    get width() {
        return this.viewWidth / this.zoom;
    }

    get height() {
        return this.viewHeight / this.zoom;
    }

    // The smallest zoom that still fills the view with map
    get minZoom() {
        if (!this.mapWidth || !this.mapHeight) {
            return 0.1;
        }

        return Math.max(this.viewWidth / this.mapWidth, this.viewHeight / this.mapHeight);
    }

    get maxZoom() {
        return Math.max(MAX_ZOOM, this.minZoom);
    }

    setMapSize(width, height) {
        this.mapWidth = width;
        this.mapHeight = height;
        this.setView(this.zoom, this.offsetX, this.offsetY);
    }

    setViewSize(width, height) {
        // Keep the centre of the view in place when the screen size changes
        const centerX = this.offsetX + this.width / 2;
        const centerY = this.offsetY + this.height / 2;

        this.viewWidth = width;
        this.viewHeight = height;
        this.setView(this.zoom, centerX - this.width / 2, centerY - this.height / 2);
    }

    /** Set zoom and position together, keeping both within limits. Returns true if anything changed. */
    setView(zoom, offsetX, offsetY) {
        const previous = [this.zoom, this.offsetX, this.offsetY];

        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
        this.offsetX = clampOffset(offsetX, this.mapWidth, this.width);
        this.offsetY = clampOffset(offsetY, this.mapHeight, this.height);

        return previous[0] !== this.zoom || previous[1] !== this.offsetX || previous[2] !== this.offsetY;
    }

    /** Zoom in or out, keeping the world point under the screen position (focusX, focusY) in place. */
    zoomTo(zoom, focusX = this.viewWidth / 2, focusY = this.viewHeight / 2) {
        const world = this.screenToWorld(focusX, focusY);
        const clampedZoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));

        return this.setView(clampedZoom, world.x - focusX / clampedZoom, world.y - focusY / clampedZoom);
    }

    /** Scroll by a distance in world pixels. Returns true if the view moved. */
    panBy(dx, dy) {
        return this.setView(this.zoom, this.offsetX + dx, this.offsetY + dy);
    }

    /** Put a world point (in world pixels) in the middle of the view. */
    centerOn(x, y) {
        return this.setView(this.zoom, x - this.width / 2, y - this.height / 2);
    }

    screenToWorld(screenX, screenY) {
        return { x: this.offsetX + screenX / this.zoom, y: this.offsetY + screenY / this.zoom };
    }

    worldToScreen(worldX, worldY) {
        return { x: (worldX - this.offsetX) * this.zoom, y: (worldY - this.offsetY) * this.zoom };
    }
}

// Keep the view inside the map, or centre the map if the view is larger than it
function clampOffset(offset, mapSize, viewSize) {
    if (!mapSize || viewSize >= mapSize) {
        return (mapSize - viewSize) / 2;
    }

    return Math.min(Math.max(offset, 0), mapSize - viewSize);
}
