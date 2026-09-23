import { GRID_SIZE } from "../config.js";
import { defineSpecs, Entity, STYLE } from "./entity.js";

export const buildingSpecs = defineSpecs({
    "base": {
        // Dimensions of the individual sprite
        pixelWidth: 60,
        pixelHeight: 60,

        // Dimensions of the base area
        baseWidth: 40,
        baseHeight: 40,

        // Offset of the base area from the top left corner of the sprite
        pixelOffsetX: 0,
        pixelOffsetY: 20,

        // Grid squares necessary for constructing the building
        buildableGrid: [
            [1, 1],
            [1, 1],
        ],

        // Grid squares that are passable or obstructed for pathfinding
        passableGrid: [
            [1, 1],
            [1, 1],
        ],

        // How far the building can "see" through fog of war
        sight: 3,

        // Maximum possible life
        hitPoints: 500,

        cost: 5000,

        spriteImages: [
            { name: "healthy", count: 4 },
            { name: "damaged", count: 1 },
            { name: "constructing", count: 3 },
        ],
    },

    "starport": {
        pixelWidth: 40,
        pixelHeight: 60,
        baseWidth: 40,
        baseHeight: 55,
        pixelOffsetX: 1,
        pixelOffsetY: 5,
        buildableGrid: [
            [1, 1],
            [1, 1],
            [1, 1],
        ],
        passableGrid: [
            [1, 1],
            [0, 0],
            [0, 0],
        ],
        sight: 3,
        cost: 2000,
        canConstruct: true,
        hitPoints: 300,
        spriteImages: [
            { name: "teleport", count: 9 },
            { name: "closing", count: 18 },
            { name: "healthy", count: 4 },
            { name: "damaged", count: 1 },
        ],
    },

    "harvester": {
        pixelWidth: 40,
        pixelHeight: 60,
        baseWidth: 40,
        baseHeight: 20,
        pixelOffsetX: -2,
        pixelOffsetY: 40,
        buildableGrid: [
            [1, 1],
        ],
        passableGrid: [
            [1, 1],
        ],
        sight: 3,
        cost: 5000,
        hitPoints: 300,
        spriteImages: [
            { name: "deploy", count: 17 },
            { name: "healthy", count: 3 },
            { name: "damaged", count: 1 },
        ],
    },

    "ground-turret": {
        canAttack: true,
        canAttackLand: true,
        canAttackAir: false,
        weaponType: "cannon-ball",
        action: "stand",
        direction: 0, // Face upward (0) by default
        directions: 8, // Total of 8 turret directions allowed (0-7)
        orders: { type: "guard" },
        pixelWidth: 38,
        pixelHeight: 32,
        baseWidth: 20,
        baseHeight: 18,
        cost: 1500,
        canConstruct: true,
        pixelOffsetX: 9,
        pixelOffsetY: 12,
        buildableGrid: [
            [1],
        ],
        passableGrid: [
            [1],
        ],
        sight: 5,
        hitPoints: 200,
        turnSpeed: 1,
        spriteImages: [
            { name: "teleport", count: 9 },
            { name: "healthy", count: 1, directions: 8 },
            { name: "damaged", count: 1 },
        ],
    },
});

export class Building extends Entity {
    static defaults = {
        type: "buildings",
    };

    processActions() {
        switch (this.action) {
            case "stand":
                this.animateSprite(this.standingSpriteName());
                break;

            case "construct":
                // Once constructing is complete go back to standing
                if (this.animateSprite("constructing")) {
                    this.action = "stand";
                }

                break;

            case "teleport":
                // Once teleporting is complete, move to stand mode
                if (this.animateSprite("teleport")) {
                    this.action = "stand";
                }

                break;

            case "close":
                // Once closing is complete go back to standing
                if (this.animateSprite("closing")) {
                    this.action = "stand";
                }

                break;

            case "open":
                // Opening is just the closing sprites running backwards
                if (this.animateSprite("closing", { reverse: true })) {
                    this.action = "close";
                    this.onOpened();
                }

                break;

            case "deploy":
                // Once deploying is complete, go to harvest
                if (this.animateSprite("deploy")) {
                    this.action = "harvest";
                }

                break;

            case "harvest":
                // Harvesters mine 2 credits of cash per animation cycle
                if (this.animateSprite(this.lifeCode) && this.lifeCode === "healthy") {
                    this.game.cash[this.team] += 2;
                }

                break;
        }
    }

    standingSpriteName() {
        return this.lifeCode;
    }

    // Called when an "open" animation completes (used by the starport)
    onOpened() {}

    drawLifeBar(context) {
        const x = this.drawingX + this.pixelOffsetX;
        const y = this.drawingY - 2 * STYLE.lifeBarHeight;

        this.drawLifeBarAt(context, x, y, this.baseWidth);
    }

    drawSelection(context) {
        const x = this.drawingX + this.pixelOffsetX;
        const y = this.drawingY + this.pixelOffsetY;

        context.strokeStyle = STYLE.selectionBorderColor;
        context.lineWidth = 1;
        context.fillStyle = STYLE.selectionFillColor;

        // Draw a filled rectangle around the building
        context.fillRect(x - 1, y - 1, this.baseWidth + 2, this.baseHeight + 2);
        context.strokeRect(x - 1, y - 1, this.baseWidth + 2, this.baseHeight + 2);
    }
}

// The base constructs new buildings
export class Base extends Building {
    processOrders() {
        if (this.orders.type !== "construct-building") {
            return;
        }

        const { name, x, y } = this.orders.details ?? {};

        this.orders = { type: "stand" };

        const spec = Object.hasOwn(buildingSpecs, name) ? buildingSpecs[name] : undefined;

        if (!spec?.canConstruct || !Number.isInteger(x) || !Number.isInteger(y)) {
            return;
        }

        // Check cash and placement again when the order is carried out, since the situation
        // may have changed since the player clicked (particularly in multiplayer)
        if (this.game.cash[this.team] < spec.cost) {
            this.warnOwner(`Warning! Insufficient Funds. Need ${spec.cost} credits.`);

            return;
        }

        if (!this.game.checkBuildingPlacement(name, x, y).canDeployBuilding) {
            this.warnOwner("Warning! Cannot deploy building here.");

            return;
        }

        this.action = "construct";
        this.animationIndex = 0;

        // Teleport in building and subtract the cost from player cash
        this.game.add({ type: "buildings", name, x, y, team: this.team, action: "teleport" });
        this.game.cash[this.team] -= spec.cost;
    }
}

// The starport constructs vehicles and aircraft
export class Starport extends Building {
    isUnitOnTop() {
        return this.game.items.some((item) => (item.type === "vehicles" || item.type === "aircraft")
            && item.x > this.x && item.x < this.x + 2 && item.y > this.y && item.y < this.y + 3);
    }

    processOrders() {
        if (this.orders.type !== "construct-unit") {
            return;
        }

        // Wait until any unit already being teleported in has arrived
        if (this.action !== "stand") {
            return;
        }

        const details = this.orders.details ?? {};

        this.orders = { type: "stand" };

        // If the building isn't healthy, ignore the order
        if (this.lifeCode !== "healthy") {
            return;
        }

        const spec = (details.type === "vehicles" || details.type === "aircraft")
            ? this.game.getSpec(details.type, details.name)
            : undefined;

        if (!spec?.canConstruct) {
            return;
        }

        if (this.isUnitOnTop()) {
            this.warnOwner("Warning! Cannot teleport unit while landing bay is occupied.");
        } else if (this.game.cash[this.team] < spec.cost) {
            this.warnOwner(`Warning! Insufficient Funds. Need ${spec.cost} credits.`);
        } else {
            this.action = "open";
            this.animationIndex = 0;

            // Subtract the cost from player cash
            this.game.cash[this.team] -= spec.cost;

            // Position the new unit above the center of the starport, and teleport it in once the doors open
            this.constructUnit = {
                type: details.type,
                name: details.name,
                x: this.x + 0.5 * this.pixelWidth / GRID_SIZE,
                y: this.y + 0.5 * this.pixelHeight / GRID_SIZE,
                action: "teleport",
                team: this.team,
            };

            if (details.orders && typeof details.orders.type === "string") {
                this.constructUnit.orders = { ...details.orders };
            }
        }
    }

    onOpened() {
        if (this.constructUnit) {
            this.game.add(this.constructUnit);
            this.constructUnit = undefined;
        }
    }
}

// The ground turret automatically attacks land units within range
export class GroundTurret extends Building {
    // A healthy turret uses its direction to choose the sprite
    standingSpriteName() {
        if (this.lifeCode === "healthy") {
            return `healthy-${Math.round(this.direction) % this.directions}`;
        }

        return this.lifeCode;
    }

    bulletOrigin(angleRadians) {
        return {
            x: this.x + 0.5 - Math.sin(angleRadians),
            y: this.y + 0.5 - Math.cos(angleRadians),
        };
    }

    processOrders() {
        if (this.reloadTimeLeft) {
            this.reloadTimeLeft--;
        }

        // Damaged turret cannot do anything
        if (this.lifeCode !== "healthy") {
            return;
        }

        switch (this.orders.type) {
            case "guard": {
                const targets = this.findTargetsInSight();

                if (targets.length > 0) {
                    this.orders = { type: "attack", to: targets[0] };
                }

                break;
            }

            case "attack": {
                // If the current target is no longer valid, go back to guarding
                if (!this.isValidTarget(this.orders.to) || !this.isTargetInSight(this.orders.to)) {
                    this.orders = { type: "guard" };
                    break;
                }

                const targetDirection = this.findAngleForFiring(this.orders.to);

                this.turnTo(targetDirection);

                // Fire once the turret has finished turning and reloading
                if (!this.turning && !this.reloadTimeLeft) {
                    this.fireAt(this.orders.to, targetDirection);
                }

                break;
            }
        }
    }
}

// Buildings with special behaviour get their own class; everything else is a plain Building
export const buildingClasses = {
    "base": Base,
    "starport": Starport,
    "ground-turret": GroundTurret,
};
