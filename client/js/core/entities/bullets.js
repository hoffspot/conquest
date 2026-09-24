import { GRID_SIZE } from "../config.js";
import { defineSpecs, Entity } from "./entity.js";

export const bulletSpecs = defineSpecs({
    "fireball": {
        speed: 60,
        reloadTime: 30,
        range: 8,
        damage: 10,
        spriteImages: [
            { name: "fly", count: 1, directions: 8 },
            { name: "explode", count: 7 },
        ],
    },
    "heatseeker": {
        reloadTime: 40,
        speed: 25,
        range: 9,
        damage: 20,
        turnSpeed: 2,
        spriteImages: [
            { name: "fly", count: 1, directions: 8 },
            { name: "explode", count: 7 },
        ],
    },
    "cannon-ball": {
        reloadTime: 40,
        speed: 25,
        damage: 10,
        range: 6,
        spriteImages: [
            { name: "fly", count: 1, directions: 8 },
            { name: "explode", count: 7 },
        ],
    },
    "bullet": {
        damage: 5,
        speed: 50,
        range: 5,
        reloadTime: 20,
        spriteImages: [
            { name: "fly", count: 1, directions: 8 },
            { name: "explode", count: 3 },
        ],
    },
});

export class Bullet extends Entity {
    static defaults = {
        type: "bullets",
        canMove: true,

        distanceTravelled: 0,
        directions: 8,

        pixelWidth: 10,
        pixelHeight: 11,
        pixelOffsetX: 5,
        pixelOffsetY: 5,

        radius: 6,

        action: "fly",
        selectable: false,

        orders: { type: "fire" },
    };

    // No team colours for bullets
    get spriteRow() {
        return 0;
    }

    moveTo(destination) {
        // Weapons like the heatseeker can turn slowly toward target while moving
        if (this.turnSpeed) {
            this.turnTo(this.findAngleForFiring(destination));
        }

        const movement = this.speed * this.speedAdjustmentFactor;
        const angleRadians = -(this.direction / this.directions) * 2 * Math.PI;

        this.lastMovementX = -(movement * Math.sin(angleRadians));
        this.lastMovementY = -(movement * Math.cos(angleRadians));

        this.x += this.lastMovementX;
        this.y += this.lastMovementY;

        // Track distance travelled by bullet
        this.distanceTravelled += movement;
    }

    reachedTarget() {
        const item = this.target;

        if (item.type === "buildings") {
            return item.x <= this.x && item.x >= this.x - item.baseWidth / GRID_SIZE
                && item.y <= this.y && item.y >= this.y - item.baseHeight / GRID_SIZE;
        }

        // Aircraft are hit at their drawn position, pixelShadowHeight above their shadow
        const dx = item.x - this.x;
        const dy = item.type === "aircraft"
            ? item.y - (this.y + item.pixelShadowHeight / GRID_SIZE)
            : item.y - this.y;
        const radius = item.radius / GRID_SIZE;

        return dx * dx + dy * dy < radius * radius;
    }

    processOrders() {
        this.lastMovementX = 0;
        this.lastMovementY = 0;

        if (this.orders.type !== "fire") {
            return;
        }

        if (this.distanceTravelled > this.range) {
            // Bullet falls to the ground without hitting target
            this.game.remove(this);
            this.game.emit("hit", this, undefined);
        } else if (this.reachedTarget()) {
            // Bullet damages target and then explodes
            this.target.life -= this.damage;
            this.game.emit("hit", this, this.target);

            this.orders = { type: "explode" };
            this.action = "explode";
            this.animationIndex = 0;
        } else {
            this.moveTo(this.target);
        }
    }

    // Bullets have no health, so skip the health check and just animate
    animate() {
        this.processActions();
    }

    processActions() {
        switch (this.action) {
            case "fly": {
                const direction = Math.round(this.direction) % this.directions;

                this.imageList = this.spriteArray[`fly-${direction}`];
                this.imageOffset = this.imageList.offset;
                break;
            }

            case "explode":
                // Bullet explodes completely and then disappears
                if (this.animateSprite("explode")) {
                    this.game.remove(this);
                }

                break;
        }
    }
}
