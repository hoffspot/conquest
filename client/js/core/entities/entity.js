import { GRID_SIZE } from "../config.js";
import { buildSpriteIndex, getSpriteSheet } from "./sprites.js";

// Properties every entity starts with (the book's baseItem)
const ENTITY_DEFAULTS = Object.freeze({
    animationIndex: 0,
    direction: 0,

    selected: false,
    selectable: true,

    action: "stand",

    lastMovementX: 0,
    lastMovementY: 0,

    // Movement related properties
    speedAdjustmentFactor: 1 / 64,
    turnSpeedAdjustmentFactor: 1 / 8,
});

// Colours used when drawing selections and life bars
export const STYLE = Object.freeze({
    selectionBorderColor: "rgba(255,255,0,0.5)",
    selectionFillColor: "rgba(255,215,0,0.2)",
    lifeBarBorderColor: "rgba(0,0,0,0.8)",
    lifeBarHealthyFillColor: "rgba(0,255,0,0.5)",
    lifeBarDamagedFillColor: "rgba(255,0,0,0.5)",
    lifeBarHeight: 5,
});

/**
 * Turn a { name: properties } list of entity definitions into frozen specs,
 * pre-computing the sprite index of each one.
 */
export function defineSpecs(list) {
    const specs = {};

    for (const [name, spec] of Object.entries(list)) {
        specs[name] = Object.freeze({ name, ...spec, ...buildSpriteIndex(spec.spriteImages) });
    }

    return Object.freeze(specs);
}

/**
 * Base class for everything that lives on the map: buildings, vehicles, aircraft, terrain and bullets.
 *
 * An entity is built from three layers of properties, exactly like the book's addItem():
 *   1. the defaults for its category (static defaults on the subclass),
 *   2. the spec for its name (e.g. the "heavy-tank" definition),
 *   3. the details it was created with (position, team, orders, ...).
 */
export class Entity {
    static defaults = {};

    constructor(game, spec, details = {}) {
        Object.assign(this, ENTITY_DEFAULTS, { orders: { type: "stand" } }, this.constructor.defaults, spec);

        // By default, set the item's life to its maximum hit points
        this.life = this.hitPoints;

        Object.assign(this, details);

        // Give every entity its own copy of its orders so that they can be changed safely
        this.orders = { ...this.orders };

        this.game = game;
    }

    get spriteSheet() {
        return getSpriteSheet(this.type, this.name);
    }

    // Called once per game tick. Checks health and advances the current action's animation.
    animate() {
        if (this.life > this.hitPoints * 0.4) {
            // Consider item healthy if it has more than 40% life
            this.lifeCode = "healthy";
        } else if (this.life > 0) {
            // Consider item damaged if it has less than 40% life
            this.lifeCode = "damaged";
        } else {
            // Remove item from the game if it has died (life is 0 or negative)
            this.lifeCode = "dead";
            this.game.remove(this);
            this.game.emit("destroyed", this);

            return;
        }

        this.processActions();
    }

    // Overridden by entity types that react to orders
    processOrders() {}

    // Overridden by entity types to choose the sprite for the current action
    processActions() {}

    /**
     * Point imageOffset at the current frame of the named sprite animation and advance it.
     * Returns true when the animation has just shown its last frame and wrapped back to the start.
     */
    animateSprite(spriteName, { reverse = false } = {}) {
        this.imageList = this.spriteArray[spriteName];

        const frame = reverse ? this.imageList.count - 1 - this.animationIndex : this.animationIndex;

        this.imageOffset = this.imageList.offset + frame;
        this.animationIndex++;

        if (this.animationIndex >= this.imageList.count) {
            this.animationIndex = 0;

            return true;
        }

        return false;
    }

    /* Drawing */

    // Sprite sheets have the blue team in the first row and the green team in the second
    get spriteRow() {
        return this.team === "blue" ? 0 : 1;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {{offsetX: number, offsetY: number, interpolation: number, drawModel?: Function}} view
     *        interpolation runs from -1 (previous tick position) to 0 (current tick position);
     *        drawModel(context, item) draws the item another way instead of its sprite if it can
     *        (returning true): as a 3D model (js/app/units3d.js), or a shot as an effect
     *        (js/app/effects.js)
     */
    draw(context, view) {
        // Compute pixel coordinates on the canvas for drawing the item
        this.drawingX = this.x * GRID_SIZE - view.offsetX - this.pixelOffsetX;
        this.drawingY = this.y * GRID_SIZE - view.offsetY - this.pixelOffsetY;

        // Smooth out movement between game ticks
        if (this.canMove) {
            this.drawingX += this.lastMovementX * view.interpolation * GRID_SIZE;
            this.drawingY += this.lastMovementY * view.interpolation * GRID_SIZE;
        }

        if (this.selected) {
            this.drawSelection(context);
            this.drawLifeBar(context);
        }

        if (!view.drawModel?.(context, this)) {
            this.drawSprite(context);
        }

        // Draw a glow around unit while teleporting in
        if (this.brightness) {
            const x = this.drawingX + this.pixelOffsetX;
            const y = this.drawingY + this.pixelOffsetY - (this.pixelShadowHeight ?? 0);

            context.beginPath();
            context.arc(x, y, this.radius, 0, Math.PI * 2, false);
            context.fillStyle = `rgba(255,255,255,${this.brightness})`;
            context.fill();
        }
    }

    drawSprite(context) {
        const spriteSheet = this.spriteSheet;

        if (!spriteSheet || this.imageOffset === undefined) {
            return;
        }

        context.drawImage(spriteSheet,
            this.imageOffset * this.pixelWidth, this.spriteRow * this.pixelHeight, this.pixelWidth, this.pixelHeight,
            this.drawingX, this.drawingY, this.pixelWidth, this.pixelHeight);
    }

    drawSelection() {}

    drawLifeBar() {}

    // Draw a life bar of the given width at x, y
    drawLifeBarAt(context, x, y, width) {
        context.fillStyle = this.lifeCode === "healthy" ? STYLE.lifeBarHealthyFillColor : STYLE.lifeBarDamagedFillColor;
        context.fillRect(x, y, width * this.life / this.hitPoints, STYLE.lifeBarHeight);

        context.strokeStyle = STYLE.lifeBarBorderColor;
        context.lineWidth = 1;
        context.strokeRect(x, y, width, STYLE.lifeBarHeight);
    }

    /* Direction and targeting */

    // Convert an x/y offset into a direction between 0 and this.directions
    directionFromDelta(dx, dy) {
        const angle = this.directions / 2 - (Math.atan2(dx, dy) * this.directions / (2 * Math.PI));

        return (angle + this.directions) % this.directions;
    }

    // Finds the angle towards a destination in terms of a direction (0 <= angle < directions)
    findAngle(destination) {
        return this.directionFromDelta(destination.x - this.x, destination.y - this.y);
    }

    // Return the smallest difference (between -directions/2 and +directions/2) towards newDirection
    angleDiff(newDirection) {
        const directions = this.directions;
        let currentDirection = this.direction;

        // Make both directions between -directions/2 and +directions/2
        if (currentDirection >= directions / 2) {
            currentDirection -= directions;
        }

        if (newDirection >= directions / 2) {
            newDirection -= directions;
        }

        let difference = newDirection - currentDirection;

        // Ensure difference is also between -directions/2 and +directions/2
        if (difference < -directions / 2) {
            difference += directions;
        }

        if (difference > directions / 2) {
            difference -= directions;
        }

        return difference;
    }

    turnTo(newDirection) {
        const difference = this.angleDiff(newDirection);

        // Maximum amount that the entity can turn per game tick
        const turnAmount = this.turnSpeed * this.turnSpeedAdjustmentFactor;

        if (Math.abs(difference) > turnAmount) {
            // Change direction by turn amount, keeping it between 0 and this.directions
            this.direction += turnAmount * Math.sign(difference);
            this.direction = (this.direction + this.directions) % this.directions;
            this.turning = true;
        } else {
            this.direction = newDirection;
            this.turning = false;
        }
    }

    // Finds the angle from the center of this entity to the center of a target (0 <= angle < directions)
    findAngleForFiring(target) {
        let dx = target.x - this.x;
        let dy = target.y - this.y;

        // Adjust dx and dy to point towards center of target
        if (target.type === "buildings") {
            dx += target.baseWidth / 2 / GRID_SIZE;
            dy += target.baseHeight / 2 / GRID_SIZE;
        } else if (target.type === "aircraft") {
            dy -= target.pixelShadowHeight / GRID_SIZE;
        }

        // Adjust dx and dy to start from center of source
        if (this.type === "buildings") {
            dx -= this.baseWidth / 2 / GRID_SIZE;
            dy -= this.baseHeight / 2 / GRID_SIZE;
        } else if (this.type === "aircraft") {
            dy += this.pixelShadowHeight / GRID_SIZE;
        }

        return this.directionFromDelta(dx, dy);
    }

    isValidTarget(item) {
        // Cannot target units that are dead or from the same team
        if (!item || item.lifeCode === "dead" || item.team === this.team) {
            return false;
        }

        if (item.type === "buildings" || item.type === "vehicles") {
            return Boolean(this.canAttackLand);
        }

        if (item.type === "aircraft") {
            return Boolean(this.canAttackAir);
        }

        return false;
    }

    isTargetInSight(item, sightBonus = 0) {
        const dx = item.x - this.x;
        const dy = item.y - this.y;
        const range = this.sight + sightBonus;

        return dx * dx + dy * dy < range * range;
    }

    distanceSquaredTo(item) {
        const dx = item.x - this.x;
        const dy = item.y - this.y;

        return dx * dx + dy * dy;
    }

    // Returns all valid targets in sight, nearest first
    findTargetsInSight(sightBonus = 0) {
        return this.game.items
            .filter((item) => this.isValidTarget(item) && this.isTargetInSight(item, sightBonus))
            .sort((a, b) => this.distanceSquaredTo(a) - this.distanceSquaredTo(b));
    }

    // Get back to the previous order if any, otherwise just stand
    cancelCurrentOrder() {
        this.orders = this.orders.previousOrder ?? { type: "stand" };
    }

    // Where a bullet fired in the direction of angleRadians starts from
    bulletOrigin(angleRadians) {
        return {
            x: this.x - this.radius * Math.sin(angleRadians) / GRID_SIZE,
            y: this.y - this.radius * Math.cos(angleRadians) / GRID_SIZE,
        };
    }

    // Fire this entity's weapon at a target and start reloading
    fireAt(target, targetDirection) {
        const angleRadians = -(targetDirection / this.directions) * 2 * Math.PI;
        const { x, y } = this.bulletOrigin(angleRadians);

        const bullet = this.game.add({ name: this.weaponType, type: "bullets", x, y, direction: targetDirection, target });

        this.reloadTimeLeft = bullet.reloadTime;
        this.game.emit("fire", this, bullet);
    }

    // Show a system warning, but only to the player who owns this entity
    warnOwner(message) {
        if (this.team === this.game.team) {
            this.game.showMessage("system", message);
        }
    }
}
