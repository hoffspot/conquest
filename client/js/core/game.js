import { sanitizeCommand } from "./commands.js";
import { GRID_SIZE, TICK_MS } from "./config.js";
import { maps } from "./data/maps.js";
import { Emitter } from "./emitter.js";
import { createEntity, getSpec, getSpecs } from "./entities/index.js";
import { Fog } from "./fog.js";
import { TriggerRunner } from "./triggers.js";


/**
 * The game simulation: every entity on the map, the map grids, cash, fog of war and triggers.
 *
 * Game has no DOM, canvas or audio dependencies, so it runs unchanged in the browser and under
 * Node (for tests). Things the player should see or hear are reported as events:
 *   "message"   (from, text)     - a character or system message for the message panel
 *   "sound"     (name)           - a sound effect should be played
 *   "fire"      (item, bullet)   - an item fired its weapon (for muzzle flashes and recoil)
 *   "hit"       (bullet, target) - a bullet hit its target, or hit the ground at the end of its
 *                                  range (target undefined)
 *   "destroyed" (item)           - a unit or building was destroyed
 *   "levelend"  (success)        - a trigger ended the level
 *
 * These events only report what happened: listeners must not change the game, so that every
 * player's copy of a multiplayer game stays the same.
 */
export class Game extends Emitter {
    constructor() {
        super();

        this.fog = new Fog(this);

        // Commands are processed directly unless a handler is installed (multiplayer sends them to the server)
        this.commandHandler = undefined;

        this.reset();
    }

    // Clear all state from any previous level
    reset() {
        // Counts items added in game, to assign them a unique id
        this.counter = 0;

        // Track all the items currently in the game, in one list and by category
        this.items = [];
        this.buildings = [];
        this.vehicles = [];
        this.aircraft = [];
        this.terrain = [];
        this.bullets = [];
        this.itemsByUid = new Map();

        // Items sorted for drawing (back to front)
        this.sortedItems = [];

        // Track items that have been selected by the player
        this.selectedItems = [];

        this.cash = {};
        this.tick = 0;
        this.ended = false;
        this.triggers = new TriggerRunner(this);

        this.mapTerrainGrid = undefined;
        this.mapPassableGrid = undefined;
        this.mapBuildableGrid = undefined;
    }

    // Game time in milliseconds since the level started
    get time() {
        return this.tick * TICK_MS;
    }

    /**
     * Load a level definition.
     * @param {object} level  entry from levels.singleplayer or levels.multiplayer
     * @param {{team: string}} options  team is the local player's team
     */
    loadLevel(level, { team }) {
        this.reset();

        this.currentLevel = level;
        this.currentMap = maps[level.mapName];
        this.team = team;

        if (!this.currentMap) {
            throw new Error(`Unknown map: ${level.mapName}`);
        }

        // Level definitions are shared, so work on a copy of the items to keep the definition unchanged
        for (const details of structuredClone(level.items)) {
            this.add(details);
        }

        // Load starting cash for the level
        this.cash = { ...level.cash };

        this.createTerrainGrid();
        this.fog.init();
        this.triggers = new TriggerRunner(this, level.triggers);
    }

    getSpec(type, name) {
        return getSpec(type, name);
    }

    getSpecsOfType(type) {
        return getSpecs(type);
    }

    add(details) {
        const itemDetails = { ...details };

        // Set a unique id for the item. Ids are never reused, even for ids that levels assign explicitly
        if (!itemDetails.uid) {
            do {
                itemDetails.uid = ++this.counter;
            } while (this.itemsByUid.has(itemDetails.uid));
        } else if (itemDetails.uid > this.counter) {
            this.counter = itemDetails.uid;
        }

        const item = createEntity(this, itemDetails);

        this.items.push(item);
        this[item.type].push(item);
        this.itemsByUid.set(item.uid, item);

        // Reset the passable grid whenever the map changes
        if (item.type === "buildings" || item.type === "terrain") {
            this.mapPassableGrid = undefined;
        }

        // Play bullet firing sound when a bullet is created
        if (item.type === "bullets") {
            this.emit("sound", item.name);
        }

        return item;
    }

    remove(item) {
        if (item.removed) {
            return;
        }

        item.removed = true;

        // Unselect item if it is selected
        if (item.selected) {
            item.selected = false;
            removeFromArray(this.selectedItems, item);
        }

        removeFromArray(this.items, item);
        removeFromArray(this[item.type], item);

        if (this.itemsByUid.get(item.uid) === item) {
            this.itemsByUid.delete(item.uid);
        }

        // Reset the passable grid whenever the map changes
        if (item.type === "buildings" || item.type === "terrain") {
            this.mapPassableGrid = undefined;
        }
    }

    getItemByUid(uid) {
        return this.itemsByUid.get(uid);
    }

    isItemDead(uid) {
        const item = this.getItemByUid(uid);

        return !item || item.lifeCode === "dead";
    }

    /* Selection */

    clearSelection() {
        while (this.selectedItems.length > 0) {
            this.selectedItems.pop().selected = false;
        }
    }

    selectItem(item, shiftPressed) {
        // Pressing shift and clicking on a selected item will deselect it
        if (shiftPressed && item.selected) {
            item.selected = false;
            removeFromArray(this.selectedItems, item);

            return;
        }

        if (item.selectable && !item.selected) {
            item.selected = true;
            this.selectedItems.push(item);
        }
    }

    /* Commands */

    // Issue a command, either directly (single player) or through the command handler (multiplayer)
    sendCommand(uids, details) {
        if (this.commandHandler) {
            this.commandHandler(uids, details);
        } else {
            this.processCommand(uids, details);
        }
    }

    /**
     * Give orders to a set of units.
     * @param {number[]} uids
     * @param {object} details  the order, e.g. { type: "move", to: {x, y} } or { type: "attack", toUid }
     *                          (see commands.js for every command and its fields)
     * @param {string} [team]   when set, only units belonging to this team will obey (used in multiplayer)
     */
    processCommand(uids, details, team) {
        // Rebuild the command from the fields it needs, rejecting invalid commands
        const orders = sanitizeCommand(details);

        if (!Array.isArray(uids) || !orders) {
            return;
        }

        // Commands name their target item by uid: fetch the target object
        if (orders.toUid !== undefined) {
            orders.to = this.getItemByUid(orders.toUid);

            if (!orders.to || orders.to.lifeCode === "dead") {
                // Target no longer exists. Invalid command
                return;
            }
        }

        for (const uid of uids) {
            const item = this.getItemByUid(uid);

            if (item && (team === undefined || item.team === team)) {
                item.orders = { ...orders };
            }
        }
    }

    /* The game loop */

    // Advance the game by one tick
    update() {
        this.tick++;

        // Items added during this tick (e.g. bullets) start acting on the next tick
        for (const item of [...this.items]) {
            if (!item.removed) {
                item.processOrders();
            }
        }

        for (const item of [...this.items]) {
            if (!item.removed) {
                item.animate();
            }
        }

        // Sort game items based on their x,y coordinates so they are drawn back to front
        this.sortedItems = [...this.items].sort((a, b) => a.y - b.y + (a.y === b.y ? b.x - a.x : 0));

        this.fog.update();
        this.triggers.update(this.time);
    }

    endLevel(success) {
        this.emit("levelend", success);
    }

    // Stop running triggers (called when the level is over)
    end() {
        this.ended = true;
    }

    showMessage(from, message) {
        this.emit("message", from, message);
    }

    /* Map grids */

    // Create a grid that stores all obstructed tiles as 1 and unobstructed as 0
    createTerrainGrid() {
        const { mapGridWidth, mapGridHeight, mapObstructedTerrain } = this.currentMap;

        this.mapTerrainGrid = Array.from({ length: mapGridHeight }, () => new Array(mapGridWidth).fill(0));

        for (const [x, y] of mapObstructedTerrain) {
            this.mapTerrainGrid[y][x] = 1;
        }

        this.rebuildPassableGrid();
    }

    // The terrain grid plus every tile blocked by a building or terrain item (rebuilt when needed)
    getPassableGrid() {
        if (!this.mapPassableGrid) {
            this.rebuildPassableGrid();
        }

        return this.mapPassableGrid;
    }

    rebuildPassableGrid() {
        this.mapPassableGrid = copyGrid(this.mapTerrainGrid);

        for (const item of this.items) {
            if (item.type === "buildings" || item.type === "terrain") {
                markFootprint(this.mapPassableGrid, item, item.passableGrid);
            }
        }
    }

    // Build a grid of tiles where nothing can be built: terrain, buildings and tiles near vehicles
    rebuildBuildableGrid() {
        const { mapGridWidth, mapGridHeight } = this.currentMap;

        this.mapBuildableGrid = copyGrid(this.mapTerrainGrid);

        for (const item of this.items) {
            if (item.type === "buildings" || item.type === "terrain") {
                markFootprint(this.mapBuildableGrid, item, item.buildableGrid);
            } else if (item.type === "vehicles") {
                // Mark all squares under or near the vehicle as unbuildable
                const radius = item.radius / GRID_SIZE;
                const x1 = Math.max(Math.floor(item.x - radius), 0);
                const x2 = Math.min(Math.floor(item.x + radius), mapGridWidth - 1);
                const y1 = Math.max(Math.floor(item.y - radius), 0);
                const y2 = Math.min(Math.floor(item.y + radius), mapGridHeight - 1);

                for (let x = x1; x <= x2; x++) {
                    for (let y = y1; y <= y2; y++) {
                        this.mapBuildableGrid[y][x] = 1;
                    }
                }
            }
        }
    }

    /**
     * Check whether a building can be placed with its top left corner at gridX, gridY.
     * @param {(x: number, y: number) => boolean} [isHidden]  optionally treat tiles as unbuildable (e.g. fogged tiles)
     * @returns {{canDeployBuilding: boolean, placementGrid: number[][]}}
     *          placementGrid marks each tile of the building's footprint as 1 (buildable) or 2 (blocked)
     */
    checkBuildingPlacement(name, gridX, gridY, isHidden = () => false) {
        const spec = getSpec("buildings", name);
        const { mapGridWidth, mapGridHeight } = this.currentMap;

        this.rebuildBuildableGrid();

        const placementGrid = copyGrid(spec.buildableGrid);
        let canDeployBuilding = true;

        for (let y = 0; y < placementGrid.length; y++) {
            for (let x = 0; x < placementGrid[y].length; x++) {
                // Only tiles that need to be buildable for the building matter
                if (placementGrid[y][x] !== 1) {
                    continue;
                }

                const tileX = gridX + x;
                const tileY = gridY + y;

                if (tileX < 0 || tileY < 0 || tileX >= mapGridWidth || tileY >= mapGridHeight
                    || isHidden(tileX, tileY) || this.mapBuildableGrid[tileY][tileX]) {
                    canDeployBuilding = false;
                    placementGrid[y][x] = 2;
                }
            }
        }

        return { canDeployBuilding, placementGrid };
    }
}

function removeFromArray(array, item) {
    const index = array.indexOf(item);

    if (index > -1) {
        array.splice(index, 1);
    }
}

// Make a copy of a 2 dimensional array
function copyGrid(grid) {
    return grid.map((row) => row.slice());
}

// Mark the tiles covered by an item's footprint (its passableGrid or buildableGrid) as obstructed
function markFootprint(grid, item, footprint) {
    for (let y = 0; y < footprint.length; y++) {
        for (let x = 0; x < footprint[y].length; x++) {
            const row = grid[item.y + y];

            if (footprint[y][x] && row && item.x + x >= 0 && item.x + x < row.length) {
                row[item.x + x] = 1;
            }
        }
    }
}
