import { GRID_SIZE } from "./config.js";

/**
 * Fog of war for the local player's team.
 *
 * grid[y][x] is 1 for tiles the player cannot currently see and 0 for visible tiles.
 * Only the grid lives here; the browser renderer paints it onto a canvas.
 */
export class Fog {
    constructor(game) {
        this.game = game;
        this.grid = [];
        // Incremented every time the grid changes so the renderer knows when to repaint
        this.version = 0;
    }

    init() {
        const { mapGridWidth, mapGridHeight } = this.game.currentMap;

        this.grid = Array.from({ length: mapGridHeight }, () => new Array(mapGridWidth).fill(1));
        this.version++;
    }

    // Recalculate which tiles the local team can see
    update() {
        const { game } = this;
        const { mapGridWidth, mapGridHeight } = game.currentMap;
        const grid = Array.from({ length: mapGridHeight }, () => new Array(mapGridWidth).fill(1));

        for (const item of game.items) {
            if (item.team !== game.team || item.keepFogged) {
                continue;
            }

            const x = Math.floor(item.x);
            const y = Math.floor(item.y);
            const x0 = Math.max(0, x - item.sight + 1);
            const y0 = Math.max(0, y - item.sight + 1);
            const x1 = Math.min(mapGridWidth - 1, x + item.sight - 1 + (item.type === "buildings" ? item.baseWidth / GRID_SIZE : 0));
            const y1 = Math.min(mapGridHeight - 1, y + item.sight - 1 + (item.type === "buildings" ? item.baseHeight / GRID_SIZE : 0));

            for (let j = x0; j <= x1; j++) {
                for (let k = y0; k <= y1; k++) {
                    // Leave out the corners of the square so the visible area looks rounded
                    if ((j > x0 && j < x1) || (k > y0 && k < y1)) {
                        grid[k][j] = 0;
                    }
                }
            }
        }

        this.grid = grid;
        this.version++;
    }

    isTileFogged(gridX, gridY) {
        const row = this.grid[gridY];

        // Tiles outside the map are always considered fogged
        return !row || gridX < 0 || gridX >= row.length || row[gridX] === 1;
    }

    // Is the point at pixel coordinates x, y (relative to the map) covered by fog?
    isPointOverFog(x, y) {
        if (x < 0 || y < 0) {
            return true;
        }

        return this.isTileFogged(Math.floor(x / GRID_SIZE), Math.floor(y / GRID_SIZE));
    }
}
