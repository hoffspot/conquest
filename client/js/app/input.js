import { GRID_SIZE } from "../core/config.js";

// Distance from the edge of the map (in CSS pixels) at which the mouse scrolls the map
const EDGE_PAN_THRESHOLD = 40;
// Scrolling speed for edge and keyboard panning, in CSS pixels per second
const PAN_SPEED = 700;
// If the mouse is dragged more than this (CSS pixels), assume the player is trying to select something
const DRAG_SELECT_THRESHOLD = 5;

// A finger that moves less than this (CSS pixels) is tapping rather than dragging
const TOUCH_SLOP = 10;
// Holding a finger still this long starts a selection box
const LONG_PRESS_MS = 400;
// Two taps this close together in time and space are a double tap
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 40;
// Fingers are imprecise: items this close (CSS pixels) to a tap count as tapped
const TOUCH_HIT_SLOP = 16;
// Flick scrolling: the map keeps moving after the finger lifts, slowing down at this rate
const INERTIA_DECAY = 5;
const MIN_INERTIA_SPEED = 80;

const WHEEL_ZOOM_SPEED = 0.0015;
const KEY_ZOOM_STEP = 1.25;

// Colours of the markers that confirm a command
const MARKER_COLORS = {
    move: "#7dff9a",
    attack: "#ff6060",
    guard: "#80c8ff",
    deploy: "#ffd24a",
};

const BUILDABLE_COLOR = "rgba(0,0,255,0.3)";
const UNBUILDABLE_COLOR = "rgba(255,0,0,0.3)";

const PAN_KEYS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
};

// When a tap could mean several overlapping items, prefer the smaller, higher ones
const TYPE_PRIORITY = { aircraft: 0, vehicles: 1, buildings: 2, terrain: 3 };

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Mouse, touch, pen and keyboard controls for the map.
 *
 * Mouse (as in the book): left click selects (shift adds or removes), dragging draws a selection box,
 * right click gives orders, moving to the edge of the map scrolls it. Added: the wheel zooms, the
 * middle button drags the map, and double-clicking a unit selects all units of that type on screen.
 *
 * Touch and pen:
 *  - tap a unit or building to select it
 *  - with units selected, tap the ground to move there, an enemy to attack it, an oil field to deploy
 *  - drag to scroll the map (flick to keep it moving), pinch to zoom
 *  - touch and hold, then drag, to draw a selection box
 *  - touch and hold a friendly unit to have the selected units guard it
 *  - double tap a unit to select every unit of that type on screen
 */
export class Input {
    // Pointer position relative to the top left corner of the map area, in CSS pixels
    x = 0;
    y = 0;

    // Pointer position on the map, in world pixels, and the map tile under it
    gameX = 0;
    gameY = 0;
    gridX = 0;
    gridY = 0;

    insideCanvas = false;
    buttonPressed = false;
    dragSelect = false;
    dragX = 0;
    dragY = 0;

    // The kind of pointer used last: "mouse", "touch" or "pen"
    pointerType = "mouse";

    // Top left tile of the building being placed
    placementX = 0;
    placementY = 0;

    #panKeys = new Set();
    #touches = new Map();
    #gesture = "none";
    #longPressTimer;
    #pinch;
    #velocity = { x: 0, y: 0 };
    #lastTap;
    #middleDrag;

    constructor({ canvas, game, camera, renderer, sidebar, sounds }) {
        this.canvas = canvas;
        this.game = game;
        this.camera = camera;
        this.renderer = renderer;
        this.sidebar = sidebar;
        this.sounds = sounds;

        canvas.addEventListener("pointerdown", (ev) => this.#onPointerDown(ev));
        canvas.addEventListener("pointermove", (ev) => this.#onPointerMove(ev));
        canvas.addEventListener("pointerup", (ev) => this.#onPointerUp(ev));
        canvas.addEventListener("pointercancel", (ev) => this.#onPointerCancel(ev));
        canvas.addEventListener("pointerleave", (ev) => {
            if (ev.pointerType === "mouse") {
                this.insideCanvas = false;
            }
        });
        // Only start edge panning once the mouse actually moves over the map, so that the view
        // doesn't scroll away just because the game screen appeared under a resting cursor
        canvas.addEventListener("pointerenter", (ev) => {
            if (ev.pointerType === "mouse") {
                this.setCoordinates(ev.clientX, ev.clientY);
            }
        });
        canvas.addEventListener("contextmenu", (ev) => this.#onContextMenu(ev));
        canvas.addEventListener("dblclick", (ev) => this.#onDoubleClick(ev));
        canvas.addEventListener("wheel", (ev) => this.#onWheel(ev), { passive: false });

        // Remember what kind of pointer the player is using anywhere on the page (e.g. for the sidebar)
        window.addEventListener("pointerdown", (ev) => {
            this.pointerType = ev.pointerType;
        }, { capture: true });

        sidebar.onStartPlacement = () => this.startPlacement();
        renderer.overlays.push((context, view) => this.drawOverlay(context, view));
    }

    get isTouch() {
        return this.pointerType !== "mouse";
    }

    calculateGameCoordinates() {
        const world = this.camera.screenToWorld(this.x, this.y);

        this.gameX = world.x;
        this.gameY = world.y;
        this.gridX = Math.floor(this.gameX / GRID_SIZE);
        this.gridY = Math.floor(this.gameY / GRID_SIZE);

        // With a mouse, the building being placed follows the pointer
        if (!this.isTouch && this.sidebar.deployBuilding) {
            this.placementX = this.gridX;
            this.placementY = this.gridY;
        }
    }

    setCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();

        this.x = clientX - rect.left;
        this.y = clientY - rect.top;
        this.calculateGameCoordinates();
    }

    #pointFromEvent(ev) {
        const rect = this.canvas.getBoundingClientRect();

        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top, time: ev.timeStamp };
    }

    #onPointerDown(ev) {
        this.pointerType = ev.pointerType;

        if (ev.pointerType === "mouse") {
            this.#stopInertia();
            this.#onMouseDown(ev);
        } else {
            // Stop the browser from scrolling, zooming or sending emulated mouse events
            ev.preventDefault();
            this.#onTouchStart(ev);
        }
    }

    #onPointerMove(ev) {
        if (ev.pointerType === "mouse") {
            this.#onMouseMove(ev);
        } else {
            this.#onTouchMove(ev);
        }
    }

    #onPointerUp(ev) {
        if (ev.pointerType === "mouse") {
            this.#onMouseUp(ev);
        } else {
            this.#onTouchEnd(ev);
        }
    }

    #onPointerCancel(ev) {
        if (ev.pointerType !== "mouse") {
            this.#touches.delete(ev.pointerId);
            this.#cancelLongPress();

            if (this.#touches.size > 0) {
                return;
            }
        }

        this.#gesture = "none";
        this.#middleDrag = undefined;
        this.buttonPressed = false;
        this.dragSelect = false;
        this.insideCanvas = false;
    }

    /* Mouse */

    #onMouseDown(ev) {
        this.insideCanvas = true;
        this.setCoordinates(ev.clientX, ev.clientY);

        if (ev.button === 0) {
            this.buttonPressed = true;
            this.dragX = this.gameX;
            this.dragY = this.gameY;

            // Keep receiving events for this pointer even if it leaves the map mid-drag
            this.canvas.setPointerCapture?.(ev.pointerId);
        } else if (ev.button === 1) {
            // Dragging with the middle button scrolls the map
            ev.preventDefault();
            this.#middleDrag = { x: ev.clientX, y: ev.clientY };
            this.canvas.setPointerCapture?.(ev.pointerId);
        }
    }

    #onMouseMove(ev) {
        this.insideCanvas = true;

        if (this.#middleDrag) {
            this.camera.panBy(-(ev.clientX - this.#middleDrag.x) / this.camera.zoom, -(ev.clientY - this.#middleDrag.y) / this.camera.zoom);
            this.#middleDrag = { x: ev.clientX, y: ev.clientY };
        }

        this.setCoordinates(ev.clientX, ev.clientY);
        this.#checkIfDragging();
    }

    #checkIfDragging() {
        if (this.buttonPressed && !this.sidebar.deployBuilding) {
            // If the mouse has been dragged more than the threshold (in screen pixels) treat it as a drag
            const zoom = this.camera.zoom;

            if (Math.abs(this.dragX - this.gameX) * zoom > DRAG_SELECT_THRESHOLD && Math.abs(this.dragY - this.gameY) * zoom > DRAG_SELECT_THRESHOLD) {
                this.dragSelect = true;
            }
        } else {
            this.dragSelect = false;
        }
    }

    #onMouseUp(ev) {
        this.setCoordinates(ev.clientX, ev.clientY);

        if (ev.button === 1) {
            this.#middleDrag = undefined;

            return;
        }

        if (ev.button !== 0) {
            return;
        }

        if (this.dragSelect) {
            // If currently drag-selecting, attempt to select items with the selection rectangle
            this.finishDragSelection(ev.shiftKey);
        } else {
            // If not dragging, treat this as a normal click once the button is released
            this.leftClick(ev.shiftKey);
        }

        this.buttonPressed = false;
        this.dragSelect = false;
    }

    #onContextMenu(ev) {
        // Prevent the browser from showing the context menu
        ev.preventDefault();

        // Touch screens use their own gestures instead of the long-press context menu
        if (this.pointerType === "mouse") {
            this.setCoordinates(ev.clientX, ev.clientY);
            this.rightClick();
        }
    }

    #onDoubleClick(ev) {
        if (this.pointerType !== "mouse") {
            return;
        }

        this.setCoordinates(ev.clientX, ev.clientY);

        const item = this.itemUnderPointer();

        if (item && item.team === this.game.team && item.type !== "buildings") {
            this.selectAllOfType(item);
        }
    }

    #onWheel(ev) {
        ev.preventDefault();
        this.setCoordinates(ev.clientX, ev.clientY);

        // Lines and pages are converted to (roughly) pixels; trackpad pinches arrive as ctrl + wheel
        const delta = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1) * (ev.ctrlKey ? 4 : 1);

        this.zoomBy(Math.exp(-delta * WHEEL_ZOOM_SPEED), this.x, this.y);
    }

    /* Touch and pen */

    #onTouchStart(ev) {
        this.canvas.setPointerCapture?.(ev.pointerId);

        const point = this.#pointFromEvent(ev);

        this.#touches.set(ev.pointerId, { start: point, current: point, previous: point });

        if (this.#touches.size === 1) {
            // A finger on the map stops any flick scrolling
            this.#stopInertia();
            this.#gesture = "pending";
            this.insideCanvas = true;
            this.x = point.x;
            this.y = point.y;
            this.calculateGameCoordinates();

            this.#cancelLongPress();
            this.#longPressTimer = setTimeout(() => this.#onLongPress(), LONG_PRESS_MS);
        } else if (this.#touches.size === 2) {
            // A second finger turns whatever the first was doing into a pinch
            this.#cancelLongPress();
            this.buttonPressed = false;
            this.dragSelect = false;
            this.#gesture = "pinch";
            this.#startPinch();
        } else {
            this.#gesture = "ignore";
        }
    }

    #onTouchMove(ev) {
        const touch = this.#touches.get(ev.pointerId);

        if (!touch) {
            return;
        }

        touch.previous = touch.current;
        touch.current = this.#pointFromEvent(ev);

        if (this.#gesture === "pending" && distance(touch.start, touch.current) > TOUCH_SLOP) {
            // The finger moved: this is a drag to scroll the map, not a tap
            this.#cancelLongPress();
            this.#gesture = "pan";
            touch.previous = touch.start;
        }

        if (this.#gesture === "pan") {
            this.#panWithFinger(touch);
        } else if (this.#gesture === "box") {
            this.x = touch.current.x;
            this.y = touch.current.y;
            this.calculateGameCoordinates();
        } else if (this.#gesture === "pinch") {
            this.#updatePinch();
        }
    }

    #panWithFinger(touch) {
        const dx = touch.current.x - touch.previous.x;
        const dy = touch.current.y - touch.previous.y;
        const elapsed = (touch.current.time - touch.previous.time) / 1000;

        this.camera.panBy(-dx / this.camera.zoom, -dy / this.camera.zoom);

        // Track the finger's speed (smoothed) for flick scrolling
        if (elapsed > 0) {
            this.#velocity = {
                x: this.#velocity.x * 0.5 + (dx / elapsed) * 0.5,
                y: this.#velocity.y * 0.5 + (dy / elapsed) * 0.5,
            };
        }
    }

    #onTouchEnd(ev) {
        const touch = this.#touches.get(ev.pointerId);

        if (!touch) {
            return;
        }

        this.#touches.delete(ev.pointerId);

        switch (this.#gesture) {
            case "pending":
                this.#cancelLongPress();
                this.x = touch.current.x;
                this.y = touch.current.y;
                this.calculateGameCoordinates();
                this.#handleTap(ev.timeStamp);
                break;

            case "pan": {
                // Keep the map moving after a flick, unless the finger stopped before lifting
                const speed = Math.hypot(this.#velocity.x, this.#velocity.y);

                if (this.#touches.size > 0 || ev.timeStamp - touch.current.time > 80 || speed < MIN_INERTIA_SPEED) {
                    this.#stopInertia();
                }

                break;
            }

            case "box":
                this.#finishTouchBox();
                break;

            case "pinch":
                if (this.#touches.size === 1) {
                    // Carry on scrolling with the finger that is still down
                    const [remaining] = this.#touches.values();

                    remaining.previous = remaining.current;
                    this.#stopInertia();
                    this.#gesture = "pan";
                }

                break;
        }

        if (this.#touches.size === 0) {
            this.#gesture = "none";
            this.buttonPressed = false;
            this.dragSelect = false;
            // Touches don't hover, so don't leave the pointer "inside" the map
            this.insideCanvas = false;
        }
    }

    #onLongPress() {
        if (this.#gesture !== "pending" || this.#touches.size !== 1) {
            return;
        }

        // Start a selection box at the finger
        this.#gesture = "box";
        this.buttonPressed = true;
        this.dragSelect = true;
        this.dragX = this.gameX;
        this.dragY = this.gameY;

        navigator.vibrate?.(15);
    }

    #cancelLongPress() {
        clearTimeout(this.#longPressTimer);
        this.#longPressTimer = undefined;
    }

    #finishTouchBox() {
        const dragged = Math.hypot(this.gameX - this.dragX, this.gameY - this.dragY) * this.camera.zoom > TOUCH_SLOP;

        if (dragged) {
            this.finishDragSelection(false);
        } else {
            this.#longPressAction();
        }

        this.buttonPressed = false;
        this.dragSelect = false;
    }

    // Touch and hold without dragging: guard a friendly item, otherwise act like a tap
    #longPressAction() {
        if (this.sidebar.deployBuilding) {
            this.#placementTap();

            return;
        }

        const game = this.game;
        const item = this.itemUnderPointer(TOUCH_HIT_SLOP);

        if (item && item.type !== "terrain" && item.team === game.team) {
            const guards = this.#ownSelection().filter((unit) => unit.canAttack && unit.canMove && unit !== item);

            if (guards.length > 0) {
                this.#command(guards, { type: "guard", toUid: item.uid }, "acknowledge-moving", itemCenter(item), MARKER_COLORS.guard);

                return;
            }
        }

        this.#smartTap(item);
    }

    #startPinch() {
        const [a, b] = [...this.#touches.values()].map((touch) => touch.current);
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

        this.#stopInertia();
        this.#pinch = {
            distance: Math.max(distance(a, b), 1),
            zoom: this.camera.zoom,
            // The map point between the fingers stays between the fingers
            world: this.camera.screenToWorld(middle.x, middle.y),
        };
    }

    #updatePinch() {
        const [a, b] = [...this.#touches.values()].map((touch) => touch.current);
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { camera } = this;
        const zoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, this.#pinch.zoom * distance(a, b) / this.#pinch.distance));

        camera.setView(zoom, this.#pinch.world.x - middle.x / zoom, this.#pinch.world.y - middle.y / zoom);
    }

    #stopInertia() {
        this.#velocity = { x: 0, y: 0 };
    }

    #handleTap(time) {
        if (this.sidebar.deployBuilding) {
            this.#placementTap();

            return;
        }

        const item = this.itemUnderPointer(TOUCH_HIT_SLOP);
        const lastTap = this.#lastTap;
        const doubleTap = lastTap && time - lastTap.time < DOUBLE_TAP_MS && distance(lastTap, this) < DOUBLE_TAP_DISTANCE;

        this.#lastTap = { time, x: this.x, y: this.y };

        // Double tap a unit to select all units of that type on screen
        if (doubleTap && item && item.team === this.game.team && item.type !== "buildings" && item.selectable) {
            this.selectAllOfType(item);
            this.#lastTap = undefined;

            return;
        }

        this.#smartTap(item);
    }

    // One tap does what the player most likely means: select, attack, deploy or move
    #smartTap(item) {
        const game = this.game;
        const own = this.#ownSelection();

        if (item && item.type !== "terrain" && item.team !== game.team) {
            // An enemy: attack it with the selected units, or just select it to see its health
            const attackers = own.filter((unit) => unit.canAttack);

            if (attackers.length > 0) {
                this.#command(attackers, { type: "attack", toUid: item.uid }, "acknowledge-attacking", itemCenter(item), MARKER_COLORS.attack);
            } else {
                game.clearSelection();
                game.selectItem(item);
            }

            return;
        }

        if (item && item.type !== "terrain" && item.selectable) {
            // One of the player's own units or buildings: select it
            game.clearSelection();
            game.selectItem(item);

            return;
        }

        if (item?.name === "oilfield") {
            const harvester = own.findLast((unit) => unit.type === "vehicles" && unit.name === "harvester");

            if (harvester) {
                this.#command([harvester], { type: "deploy", toUid: item.uid }, "acknowledge-moving", itemCenter(item), MARKER_COLORS.deploy);

                return;
            }
        }

        // The ground: move there, or deselect if nothing selected can move
        const movers = own.filter((unit) => unit.canMove);

        if (movers.length > 0) {
            this.#moveTo(movers);
        } else {
            game.clearSelection();
        }
    }

    /* Building placement */

    // Called by the sidebar when the player picks a building to place
    startPlacement() {
        if (!this.isTouch) {
            this.placementX = this.gridX;
            this.placementY = this.gridY;

            return;
        }

        // On touch screens, start with the building in the middle of the view; taps move it
        const { camera } = this;
        const { width, height } = this.#footprint();

        this.placementX = Math.round((camera.offsetX + camera.width / 2) / GRID_SIZE - width / 2);
        this.placementY = Math.round((camera.offsetY + camera.height / 2) / GRID_SIZE - height / 2);
        this.sidebar.checkBuildingPlacement(this.placementX, this.placementY);
    }

    #footprint() {
        const grid = this.game.getSpec("buildings", this.sidebar.deployBuilding.name).buildableGrid;

        return { width: grid[0].length, height: grid.length };
    }

    // Tapping the building being placed builds it; tapping anywhere else moves it there
    #placementTap() {
        const { width, height } = this.#footprint();
        const onPlacement = this.gridX >= this.placementX && this.gridX < this.placementX + width
            && this.gridY >= this.placementY && this.gridY < this.placementY + height;

        if (onPlacement) {
            this.confirmPlacement();

            return;
        }

        this.placementX = Math.round(this.gameX / GRID_SIZE - width / 2);
        this.placementY = Math.round(this.gameY / GRID_SIZE - height / 2);
        this.sidebar.checkBuildingPlacement(this.placementX, this.placementY);
    }

    confirmPlacement() {
        if (!this.sidebar.deployBuilding) {
            return;
        }

        this.sidebar.checkBuildingPlacement(this.placementX, this.placementY);

        if (this.sidebar.canDeployBuilding) {
            this.sidebar.finishDeployingBuilding(this.placementX, this.placementY);
        } else {
            this.game.showMessage("system", "Warning! Cannot deploy building here.");
        }
    }

    /* Selection and commands */

    #ownSelection() {
        return this.game.selectedItems.filter((item) => item.team === this.game.team);
    }

    #command(items, details, acknowledgement, marker, color) {
        if (items.length === 0) {
            return;
        }

        this.game.sendCommand(items.map((item) => item.uid), details);
        this.sounds.play(acknowledgement);
        this.renderer.addMarker(marker.x, marker.y, color);
    }

    #moveTo(units) {
        this.#command(units, { type: "move", to: { x: this.gameX / GRID_SIZE, y: this.gameY / GRID_SIZE } },
            "acknowledge-moving", { x: this.gameX, y: this.gameY }, MARKER_COLORS.move);
    }

    // Called whenever the player completes a left click on the map
    leftClick(shiftPressed) {
        if (this.sidebar.deployBuilding) {
            this.placementX = this.gridX;
            this.placementY = this.gridY;
            this.confirmPlacement();

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

    // Called whenever the player completes a right click on the map
    rightClick() {
        const game = this.game;

        // If the game is in deployBuilding mode, right clicking will cancel deployBuilding mode
        if (this.sidebar.deployBuilding) {
            this.sidebar.cancelDeployingBuilding();

            return;
        }

        const own = this.#ownSelection();
        const clickedItem = this.itemUnderPointer();

        if (!clickedItem) {
            // Player right-clicked on the ground: move selected units there
            this.#moveTo(own.filter((item) => item.canMove));
        } else if (clickedItem.type !== "terrain") {
            if (clickedItem.team !== game.team) {
                // Player right-clicked on an enemy item: attack it
                this.#command(own.filter((item) => item.canAttack), { type: "attack", toUid: clickedItem.uid },
                    "acknowledge-attacking", itemCenter(clickedItem), MARKER_COLORS.attack);
            } else {
                // Player right-clicked on a friendly item: guard it
                this.#command(own.filter((item) => item.canAttack && item.canMove), { type: "guard", toUid: clickedItem.uid },
                    "acknowledge-moving", itemCenter(clickedItem), MARKER_COLORS.guard);
            }
        } else if (clickedItem.name === "oilfield") {
            // Player right-clicked on an oil field: deploy the first selected harvester (only one can deploy at a time)
            const harvester = own.findLast((item) => item.type === "vehicles" && item.name === "harvester");

            this.#command(harvester ? [harvester] : [], { type: "deploy", toUid: clickedItem.uid },
                "acknowledge-moving", itemCenter(clickedItem), MARKER_COLORS.deploy);
        } else {
            this.#moveTo(own.filter((item) => item.canMove));
        }
    }

    /**
     * The item under the pointer, or undefined. slop (CSS pixels) widens the search for fingers;
     * the nearest item wins, and units win over the buildings behind them.
     */
    itemUnderPointer(slop = 0) {
        const game = this.game;
        const maximumDistance = slop / this.camera.zoom;
        const pointerFogged = game.fog.isPointOverFog(this.gameX, this.gameY);
        let best;
        let bestScore = Infinity;

        for (const item of game.items) {
            if (item.lifeCode === "dead" || item.type === "bullets") {
                continue;
            }

            // Things hidden by fog can't be picked (the player's own items are never hidden)
            if (item.team !== game.team && pointerFogged && game.fog.isTileFogged(Math.floor(item.x), Math.floor(item.y))) {
                continue;
            }

            const itemDistance = this.#distanceToItem(item);

            if (itemDistance > maximumDistance) {
                continue;
            }

            const score = itemDistance + TYPE_PRIORITY[item.type] * 0.001;

            if (score < bestScore) {
                best = item;
                bestScore = score;
            }
        }

        return best;
    }

    // Distance (in world pixels) from the pointer to the edge of an item; 0 if the pointer is on it
    #distanceToItem(item) {
        const x = item.x * GRID_SIZE;
        const y = item.y * GRID_SIZE;

        if (item.type === "buildings" || item.type === "terrain") {
            const dx = Math.max(x - this.gameX, 0, this.gameX - (x + item.baseWidth));
            const dy = Math.max(y - this.gameY, 0, this.gameY - (y + item.baseHeight));

            return Math.hypot(dx, dy);
        }

        // Aircraft are drawn pixelShadowHeight above their position
        const centerY = item.type === "aircraft" ? y - item.pixelShadowHeight : y;

        return Math.max(0, Math.hypot(x - this.gameX, centerY - this.gameY) - item.radius);
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

    // Select every unit of the same kind as item that is on screen
    selectAllOfType(item) {
        const { game, camera } = this;

        game.clearSelection();

        for (const other of game.items) {
            const x = other.x * GRID_SIZE;
            const y = other.y * GRID_SIZE;
            const onScreen = x >= camera.offsetX && x <= camera.offsetX + camera.width && y >= camera.offsetY && y <= camera.offsetY + camera.height;

            if (other.name === item.name && other.team === game.team && other.selectable && other.lifeCode !== "dead" && onScreen) {
                game.selectItem(other);
            }
        }
    }

    // Select all of the player's combat units, wherever they are
    selectArmy() {
        const game = this.game;

        game.clearSelection();

        for (const item of game.items) {
            if (item.team === game.team && item.canAttack && item.canMove && item.selectable && item.lifeCode !== "dead") {
                game.selectItem(item);
            }
        }
    }

    hasArmy() {
        const game = this.game;

        return game.items.some((item) => item.team === game.team && item.canAttack && item.canMove && item.selectable);
    }

    /* Keyboard */

    handleKeyDown(ev) {
        if (Object.hasOwn(PAN_KEYS, ev.key)) {
            this.#panKeys.add(ev.key);
            ev.preventDefault();

            return true;
        }

        if (ev.key === "+" || ev.key === "=") {
            this.zoomBy(KEY_ZOOM_STEP);

            return true;
        }

        if (ev.key === "-" || ev.key === "_") {
            this.zoomBy(1 / KEY_ZOOM_STEP);

            return true;
        }

        if (ev.key === "Escape") {
            if (this.sidebar.deployBuilding) {
                this.sidebar.cancelDeployingBuilding();

                return true;
            }

            if (this.game.selectedItems.length > 0) {
                this.game.clearSelection();

                return true;
            }
        }

        return false;
    }

    handleKeyUp(ev) {
        this.#panKeys.delete(ev.key);
    }

    /* View */

    zoomBy(factor, focusX = this.camera.viewWidth / 2, focusY = this.camera.viewHeight / 2) {
        this.camera.zoomTo(this.camera.zoom * factor, focusX, focusY);
        this.calculateGameCoordinates();
    }

    // Scroll the map for edge panning, arrow keys and flicks; called every frame
    handlePanning(elapsedMs) {
        const { camera } = this;
        const seconds = elapsedMs / 1000;
        let dx = 0;
        let dy = 0;

        if (!this.isTouch && this.insideCanvas && !this.#middleDrag) {
            if (this.x <= EDGE_PAN_THRESHOLD) {
                dx = -1;
            } else if (this.x >= camera.viewWidth - EDGE_PAN_THRESHOLD) {
                dx = 1;
            }

            if (this.y <= EDGE_PAN_THRESHOLD) {
                dy = -1;
            } else if (this.y >= camera.viewHeight - EDGE_PAN_THRESHOLD) {
                dy = 1;
            }
        }

        for (const key of this.#panKeys) {
            dx += PAN_KEYS[key][0];
            dy += PAN_KEYS[key][1];
        }

        let moved = false;

        if (dx || dy) {
            const panDistance = PAN_SPEED * seconds / camera.zoom;

            moved = camera.panBy(Math.sign(dx) * panDistance, Math.sign(dy) * panDistance);
        }

        // Flick scrolling after the finger has lifted
        if (this.#gesture === "none" && (this.#velocity.x || this.#velocity.y)) {
            const flicked = camera.panBy(-this.#velocity.x * seconds / camera.zoom, -this.#velocity.y * seconds / camera.zoom);
            const decay = Math.exp(-INERTIA_DECAY * seconds);

            this.#velocity = { x: this.#velocity.x * decay, y: this.#velocity.y * decay };

            if (!flicked || Math.hypot(this.#velocity.x, this.#velocity.y) < 10) {
                this.#stopInertia();
            }

            moved ||= flicked;
        }

        if (moved) {
            // Update pointer game coordinates based on the new view
            this.calculateGameCoordinates();
        }
    }

    releaseKeys() {
        this.#panKeys.clear();
    }

    // Forget any pointer and key state (e.g. when a new level starts)
    reset() {
        this.#touches.clear();
        this.#gesture = "none";
        this.#cancelLongPress();
        this.#stopInertia();
        this.#middleDrag = undefined;
        this.#lastTap = undefined;
        this.buttonPressed = false;
        this.dragSelect = false;
        this.insideCanvas = false;
        this.releaseKeys();
    }

    /* Drawing */

    drawOverlay(context, view) {
        const lineWidth = 1.5 / view.zoom;

        // Selection box
        if (this.dragSelect) {
            const x = Math.min(this.gameX, this.dragX);
            const y = Math.min(this.gameY, this.dragY);
            const width = Math.abs(this.gameX - this.dragX);
            const height = Math.abs(this.gameY - this.dragY);

            context.fillStyle = "rgba(255,255,255,0.08)";
            context.fillRect(x - view.offsetX, y - view.offsetY, width, height);
            context.strokeStyle = "white";
            context.lineWidth = lineWidth;
            context.strokeRect(x - view.offsetX, y - view.offsetY, width, height);

            // Show that touch and hold started a selection
            if (this.#gesture === "box") {
                context.beginPath();
                context.arc(this.dragX - view.offsetX, this.dragY - view.offsetY, 18 / view.zoom, 0, Math.PI * 2);
                context.stroke();
            }
        }

        // While placing a building, show which of its tiles can be built on
        const placementGrid = this.sidebar.placementGrid;

        if (this.sidebar.deployBuilding && placementGrid && (this.isTouch || this.insideCanvas)) {
            const x = this.placementX * GRID_SIZE - view.offsetX;
            const y = this.placementY * GRID_SIZE - view.offsetY;

            for (let i = 0; i < placementGrid.length; i++) {
                for (let j = 0; j < placementGrid[i].length; j++) {
                    const tile = placementGrid[i][j];

                    if (tile) {
                        context.fillStyle = tile === 1 ? BUILDABLE_COLOR : UNBUILDABLE_COLOR;
                        context.fillRect(x + j * GRID_SIZE, y + i * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                    }
                }
            }

            context.strokeStyle = this.sidebar.canDeployBuilding ? "rgba(125,255,154,0.9)" : "rgba(255,120,120,0.9)";
            context.lineWidth = lineWidth;
            context.strokeRect(x, y, placementGrid[0].length * GRID_SIZE, placementGrid.length * GRID_SIZE);
        }
    }
}

// The middle of an item, in world pixels
function itemCenter(item) {
    if (item.type === "buildings" || item.type === "terrain") {
        return { x: item.x * GRID_SIZE + item.baseWidth / 2, y: item.y * GRID_SIZE + item.baseHeight / 2 };
    }

    return { x: item.x * GRID_SIZE, y: item.y * GRID_SIZE - (item.pixelShadowHeight ?? 0) };
}
