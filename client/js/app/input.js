import { GRID_SIZE } from "../core/config.js";

// Distance from edge of canvas at which panning starts
const PANNING_THRESHOLD = 80;
// Scrolling speed for edge and keyboard panning, in pixels per second
const PANNING_SPEED = 600;
// If the pointer is dragged more than this, assume the player is trying to select something
const DRAG_SELECT_THRESHOLD = 5;
// Two taps within this time count as a double tap (the touch equivalent of a right click)
const DOUBLE_TAP_TIMEOUT_MS = 300;

const BUILDABLE_COLOR = "rgba(0,0,255,0.3)";
const UNBUILDABLE_COLOR = "rgba(255,0,0,0.3)";

const PAN_KEYS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
};

/**
 * Mouse, touch and pen input on the game canvas using Pointer Events.
 *
 *  - Left click selects (shift adds to / removes from the selection), dragging draws a selection box
 *  - Right click gives orders: move, attack, guard, or deploy a harvester on an oil field
 *  - On touch screens a tap is a left click and a double tap is a right click
 *  - Moving the pointer to the edge of the map, or holding the arrow keys, scrolls the view
 */
export class Input {
    // x,y coordinates of the pointer relative to the top left corner of the canvas
    x = 0;
    y = 0;

    // x,y coordinates of the pointer relative to the top left corner of the map
    gameX = 0;
    gameY = 0;

    // Map grid tile under the pointer
    gridX = 0;
    gridY = 0;

    insideCanvas = false;
    buttonPressed = false;
    dragSelect = false;

    #panKeys = new Set();
    #doubleTapTimeout;
    #lastPointerType = "mouse";

    constructor({ canvas, game, renderer, sidebar, sounds }) {
        this.canvas = canvas;
        this.game = game;
        this.renderer = renderer;
        this.sidebar = sidebar;
        this.sounds = sounds;

        canvas.addEventListener("pointermove", (ev) => this.#onPointerMove(ev));
        // Only start edge panning once the pointer actually moves over the map, so that the view
        // doesn't scroll away just because the game screen appeared under a resting cursor
        canvas.addEventListener("pointerenter", (ev) => this.setCoordinates(ev.clientX, ev.clientY));
        canvas.addEventListener("pointerleave", () => {
            this.insideCanvas = false;
        });
        canvas.addEventListener("pointerdown", (ev) => this.#onPointerDown(ev));
        canvas.addEventListener("pointerup", (ev) => this.#onPointerUp(ev));
        canvas.addEventListener("pointercancel", () => this.#resetPointer());
        canvas.addEventListener("contextmenu", (ev) => this.#onContextMenu(ev));

        renderer.overlays.push((context, view) => this.drawOverlay(context, view));
    }

    calculateGameCoordinates() {
        this.gameX = this.x + this.renderer.offsetX;
        this.gameY = this.y + this.renderer.offsetY;

        this.gridX = Math.floor(this.gameX / GRID_SIZE);
        this.gridY = Math.floor(this.gameY / GRID_SIZE);
    }

    setCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        // The game container is scaled with a CSS transform, so convert from screen pixels to canvas pixels
        const scale = rect.width / this.canvas.offsetWidth || 1;

        this.x = (clientX - rect.left) / scale;
        this.y = (clientY - rect.top) / scale;

        this.calculateGameCoordinates();
    }

    #onPointerMove(ev) {
        this.insideCanvas = true;
        this.setCoordinates(ev.clientX, ev.clientY);
        this.#checkIfDragging();
    }

    #checkIfDragging() {
        if (this.buttonPressed && !this.sidebar.deployBuilding) {
            // If the pointer has been dragged more than the threshold treat it as a drag
            if (Math.abs(this.dragX - this.gameX) > DRAG_SELECT_THRESHOLD && Math.abs(this.dragY - this.gameY) > DRAG_SELECT_THRESHOLD) {
                this.dragSelect = true;
            }
        } else {
            this.dragSelect = false;
        }
    }

    #onPointerDown(ev) {
        this.#lastPointerType = ev.pointerType;
        this.insideCanvas = true;
        this.setCoordinates(ev.clientX, ev.clientY);

        // Left mouse button, or a finger or pen touching the screen
        if (ev.button === 0) {
            this.buttonPressed = true;
            this.dragX = this.gameX;
            this.dragY = this.gameY;

            // Keep receiving events for this pointer even if it leaves the canvas mid-drag
            this.canvas.setPointerCapture?.(ev.pointerId);
        }

        if (ev.pointerType !== "mouse") {
            // Prevent touches from being turned into emulated mouse events and scrolling
            ev.preventDefault();
        }
    }

    #onPointerUp(ev) {
        this.setCoordinates(ev.clientX, ev.clientY);

        if (ev.button !== 0) {
            return;
        }

        const shiftPressed = ev.shiftKey;

        if (this.dragSelect) {
            // If currently drag-selecting, attempt to select items with the selection rectangle
            this.finishDragSelection(shiftPressed);
        } else if (ev.pointerType === "touch") {
            this.#handleTap(shiftPressed);
        } else {
            // If not dragging, treat this as a normal click once the button is released
            this.leftClick(shiftPressed);
        }

        this.buttonPressed = false;
        this.dragSelect = false;

        if (ev.pointerType === "touch") {
            // When a touch ends, act as if the pointer has left the canvas (stops edge panning)
            this.insideCanvas = false;
        }
    }

    // Wait briefly after a tap: a second tap turns it into a double tap (right click)
    #handleTap(shiftPressed) {
        if (this.#doubleTapTimeout === undefined) {
            this.#doubleTapTimeout = setTimeout(() => {
                this.#doubleTapTimeout = undefined;
                this.leftClick(shiftPressed);
            }, DOUBLE_TAP_TIMEOUT_MS);
        } else {
            clearTimeout(this.#doubleTapTimeout);
            this.#doubleTapTimeout = undefined;
            this.rightClick();
        }
    }

    #onContextMenu(ev) {
        // Prevent the browser from showing the context menu
        ev.preventDefault();

        // Touch screens use double tap instead of the long-press context menu
        if (this.#lastPointerType !== "touch") {
            this.setCoordinates(ev.clientX, ev.clientY);
            this.rightClick();
        }
    }

    #resetPointer() {
        this.buttonPressed = false;
        this.dragSelect = false;
        this.insideCanvas = false;
    }

    // Forget any pointer and key state (e.g. when a new level starts)
    reset() {
        this.#resetPointer();
        this.releaseKeys();
        clearTimeout(this.#doubleTapTimeout);
        this.#doubleTapTimeout = undefined;
    }

    // Called whenever player completes a left click on the game canvas
    leftClick(shiftPressed) {
        if (this.sidebar.deployBuilding) {
            // Check the placement at the exact tile that was clicked
            this.sidebar.checkBuildingPlacement(this.gridX, this.gridY);

            if (this.sidebar.canDeployBuilding) {
                this.sidebar.finishDeployingBuilding(this.gridX, this.gridY);
            } else {
                this.game.showMessage("system", "Warning! Cannot deploy building here.");
            }

            return;
        }

        const clickedItem = this.itemUnderPointer();

        if (clickedItem) {
            // Pressing shift adds to existing selection. If shift is not pressed, clear existing selection
            if (!shiftPressed) {
                this.game.clearSelection();
            }

            this.game.selectItem(clickedItem, shiftPressed);
        }
    }

    // Return the first item detected under the pointer
    itemUnderPointer() {
        const game = this.game;

        // If the pointer is over fog, don't detect any items
        if (game.fog.isPointOverFog(this.gameX, this.gameY)) {
            return undefined;
        }

        for (let i = game.items.length - 1; i >= 0; i--) {
            const item = game.items[i];

            // Dead items will not be detected
            if (item.lifeCode === "dead") {
                continue;
            }

            const x = item.x * GRID_SIZE;
            const y = item.y * GRID_SIZE;

            if (item.type === "buildings" || item.type === "terrain") {
                // If pointer coordinates are within rectangular area of building or terrain
                if (x <= this.gameX && x >= this.gameX - item.baseWidth && y <= this.gameY && y >= this.gameY - item.baseHeight) {
                    return item;
                }
            } else if (item.type === "aircraft") {
                // If pointer coordinates are within radius of aircraft (adjusted for pixelShadowHeight)
                if ((x - this.gameX) ** 2 + (y - this.gameY - item.pixelShadowHeight) ** 2 < item.radius ** 2) {
                    return item;
                }
            } else if (item.type === "vehicles") {
                // If pointer coordinates are within radius of item
                if ((x - this.gameX) ** 2 + (y - this.gameY) ** 2 < item.radius ** 2) {
                    return item;
                }
            }
        }

        return undefined;
    }

    finishDragSelection(shiftPressed) {
        const game = this.game;

        if (!shiftPressed) {
            // If shift key is not pressed, clear any previously selected items
            game.clearSelection();
        }

        // Calculate the bounds of the selection rectangle
        const x1 = Math.min(this.gameX, this.dragX);
        const y1 = Math.min(this.gameY, this.dragY);
        const x2 = Math.max(this.gameX, this.dragX);
        const y2 = Math.max(this.gameY, this.dragY);

        for (const item of game.items) {
            // Unselectable items, dead items, opponent team items and buildings are not drag-selectable
            if (!item.selectable || item.lifeCode === "dead" || item.team !== game.team || item.type === "buildings") {
                continue;
            }

            const x = item.x * GRID_SIZE;
            // In case of aircraft, adjust for pixelShadowHeight
            const y = item.y * GRID_SIZE - (item.type === "aircraft" ? item.pixelShadowHeight : 0);

            if ((item.type === "vehicles" || item.type === "aircraft") && x1 <= x && x2 >= x && y1 <= y && y2 >= y) {
                game.selectItem(item, shiftPressed);
            }
        }

        this.dragSelect = false;
    }

    // Called whenever player completes a right click on the game canvas
    rightClick() {
        const game = this.game;

        // If the game is in deployBuilding mode, right clicking will cancel deployBuilding mode
        if (this.sidebar.deployBuilding) {
            this.sidebar.cancelDeployingBuilding();

            return;
        }

        const ownSelectedItems = game.selectedItems.filter((item) => item.team === game.team);
        const clickedItem = this.itemUnderPointer();

        if (!clickedItem) {
            // Player right-clicked on the ground: move selected units there
            this.#command(ownSelectedItems.filter((item) => item.canMove),
                { type: "move", to: { x: this.gameX / GRID_SIZE, y: this.gameY / GRID_SIZE } }, "acknowledge-moving");
        } else if (clickedItem.type !== "terrain") {
            if (clickedItem.team !== game.team) {
                // Player right-clicked on an enemy item: attack it
                this.#command(ownSelectedItems.filter((item) => item.canAttack),
                    { type: "attack", toUid: clickedItem.uid }, "acknowledge-attacking");
            } else {
                // Player right-clicked on a friendly item: guard it
                this.#command(ownSelectedItems.filter((item) => item.canAttack && item.canMove),
                    { type: "guard", toUid: clickedItem.uid }, "acknowledge-moving");
            }
        } else if (clickedItem.name === "oilfield") {
            // Player right-clicked on an oil field: deploy the first selected harvester (only one can deploy at a time)
            const harvester = ownSelectedItems.findLast((item) => item.type === "vehicles" && item.name === "harvester");

            this.#command(harvester ? [harvester] : [], { type: "deploy", toUid: clickedItem.uid }, "acknowledge-moving");
        }
    }

    #command(items, details, acknowledgement) {
        if (items.length > 0) {
            this.game.sendCommand(items.map((item) => item.uid), details);
            this.sounds.play(acknowledgement);
        }
    }

    /* Keyboard */

    handleKeyDown(ev) {
        if (Object.hasOwn(PAN_KEYS, ev.key)) {
            this.#panKeys.add(ev.key);
            ev.preventDefault();

            return true;
        }

        if (ev.key === "Escape" && this.sidebar.deployBuilding) {
            this.sidebar.cancelDeployingBuilding();

            return true;
        }

        return false;
    }

    handleKeyUp(ev) {
        this.#panKeys.delete(ev.key);
    }

    releaseKeys() {
        this.#panKeys.clear();
    }

    /* Panning */

    // Scroll the map when the pointer is near the edge of the canvas or an arrow key is held down
    handlePanning(elapsedMs) {
        const distance = PANNING_SPEED * elapsedMs / 1000;
        let dx = 0;
        let dy = 0;

        if (this.insideCanvas) {
            if (this.x <= PANNING_THRESHOLD) {
                dx = -1;
            } else if (this.x >= this.renderer.width - PANNING_THRESHOLD) {
                dx = 1;
            }

            if (this.y <= PANNING_THRESHOLD) {
                dy = -1;
            } else if (this.y >= this.renderer.height - PANNING_THRESHOLD) {
                dy = 1;
            }
        }

        for (const key of this.#panKeys) {
            dx += PAN_KEYS[key][0];
            dy += PAN_KEYS[key][1];
        }

        dx = Math.sign(dx);
        dy = Math.sign(dy);

        if ((dx || dy) && this.renderer.panBy(dx * distance, dy * distance)) {
            // Update pointer game coordinates based on the new view
            this.calculateGameCoordinates();
        }
    }

    /* Drawing */

    drawOverlay(context, view) {
        // If the player is dragging and selecting, draw a white box to mark the selection area
        if (this.dragSelect) {
            const x = Math.min(this.gameX, this.dragX);
            const y = Math.min(this.gameY, this.dragY);
            const width = Math.abs(this.gameX - this.dragX);
            const height = Math.abs(this.gameY - this.dragY);

            context.strokeStyle = "white";
            context.lineWidth = 1;
            context.strokeRect(x - view.offsetX, y - view.offsetY, width, height);
        }

        // While placing a building, show which of its tiles can be built on
        const placementGrid = this.sidebar.placementGrid;

        if (this.insideCanvas && this.sidebar.deployBuilding && placementGrid) {
            const x = this.gridX * GRID_SIZE - view.offsetX;
            const y = this.gridY * GRID_SIZE - view.offsetY;

            for (let i = 0; i < placementGrid.length; i++) {
                for (let j = 0; j < placementGrid[i].length; j++) {
                    const tile = placementGrid[i][j];

                    if (tile) {
                        context.fillStyle = tile === 1 ? BUILDABLE_COLOR : UNBUILDABLE_COLOR;
                        context.fillRect(x + j * GRID_SIZE, y + i * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                    }
                }
            }
        }
    }
}
