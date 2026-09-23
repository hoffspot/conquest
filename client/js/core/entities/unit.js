import { GRID_SIZE } from "../config.js";
import { Entity, STYLE } from "./entity.js";

/**
 * Behaviour shared by vehicles and aircraft: following orders, finding targets and firing.
 * In the book this logic was duplicated in vehicles.js and aircraft.js.
 * Subclasses implement moveTo() and may override processMoveOrder()/processDeployOrder().
 */
export class Unit extends Entity {
    static defaults = {
        directions: 8,
        canMove: true,
    };

    processOrders() {
        this.lastMovementX = 0;
        this.lastMovementY = 0;

        if (this.reloadTimeLeft) {
            this.reloadTimeLeft--;
        }

        const orders = this.orders;
        let distanceFromDestination;
        let radius;

        if (orders.to) {
            distanceFromDestination = Math.sqrt(this.distanceSquaredTo(orders.to));
            radius = this.radius / GRID_SIZE;
        }

        let targets;

        switch (orders.type) {
            case "move":
                this.processMoveOrder(distanceFromDestination, radius);
                break;

            case "deploy":
                this.processDeployOrder(distanceFromDestination, radius);
                break;

            case "stand":
                // Look for targets that are within sight range
                targets = this.findTargetsInSight();

                if (targets.length > 0) {
                    this.orders = { type: "attack", to: targets[0] };
                }

                break;

            case "sentry":
                // Look for targets up to 2 squares beyond sight range
                targets = this.findTargetsInSight(2);

                if (targets.length > 0) {
                    this.orders = { type: "attack", to: targets[0], previousOrder: orders };
                }

                break;

            case "hunt":
                // Look for targets anywhere on the map
                targets = this.findTargetsInSight(100);

                if (targets.length > 0) {
                    this.orders = { type: "attack", to: targets[0], previousOrder: orders };
                }

                break;

            case "attack":
                // If the target is no longer valid, cancel the current order
                if (!this.isValidTarget(orders.to)) {
                    this.cancelCurrentOrder();
                    break;
                }

                if (this.isTargetInSight(orders.to)) {
                    // Turn toward the target and start attacking once facing it
                    const targetDirection = this.findAngleForFiring(orders.to);

                    this.turnTo(targetDirection);

                    // Fire once the unit has finished turning and reloading
                    if (!this.turning && !this.reloadTimeLeft) {
                        this.fireAt(orders.to, targetDirection);
                    }
                } else {
                    // Move towards the target
                    this.moveTo(orders.to, distanceFromDestination);
                }

                break;

            case "patrol":
                // A patrol needs both of its end points
                if (!orders.to || !orders.from) {
                    this.orders = { type: "stand" };
                    break;
                }

                targets = this.findTargetsInSight(1);

                if (targets.length > 0) {
                    // Attack the target, but save the patrol order as previousOrder
                    this.orders = { type: "attack", to: targets[0], previousOrder: orders };
                    break;
                }

                // Move toward destination until it is inside of sight range
                if (distanceFromDestination < this.sight) {
                    // Swap to and from locations
                    [orders.to, orders.from] = [orders.from, orders.to];
                } else {
                    this.moveTo(orders.to, distanceFromDestination);
                }

                break;

            case "guard":
                // If the item being guarded is dead (or missing), cancel the current order
                if (!orders.to || orders.to.lifeCode === "dead") {
                    this.cancelCurrentOrder();
                    break;
                }

                if (distanceFromDestination < this.sight) {
                    // Attack any enemies nearby, but save the guard order as previousOrder
                    targets = this.findTargetsInSight(1);

                    if (targets.length > 0) {
                        this.orders = { type: "attack", to: targets[0], previousOrder: orders };
                    }
                } else {
                    // Move towards the item being guarded
                    this.moveTo(orders.to, distanceFromDestination);
                }

                break;
        }
    }

    // Move toward the destination until within one unit radius of it
    processMoveOrder(distanceFromDestination, radius) {
        if (!this.orders.to || distanceFromDestination < radius) {
            this.orders = { type: "stand" };
        } else {
            this.moveTo(this.orders.to, distanceFromDestination);
        }
    }

    // Only harvester vehicles know how to deploy
    processDeployOrder() {
        this.orders = { type: "stand" };
    }

    moveTo() {
        return false;
    }

    processActions() {
        const direction = Math.round(this.direction) % this.directions;

        switch (this.action) {
            case "stand":
                this.animateSprite(`stand-${direction}`);
                break;

            case "teleport":
                this.animateSprite(`stand-${direction}`);

                // Initialize the brightness variable when unit is first teleported
                if (this.brightness === undefined) {
                    this.brightness = 0.6;
                }

                this.brightness -= 0.05;

                // Once brightness gets to zero, clear brightness and just stand normally
                if (this.brightness <= 0) {
                    this.brightness = undefined;
                    this.action = "stand";
                }

                break;
        }
    }

    // Move a distance in the current direction, remembering the movement for smooth drawing
    moveForward(movement) {
        const angleRadians = -(this.direction / this.directions) * 2 * Math.PI;

        this.lastMovementX = -(movement * Math.sin(angleRadians));
        this.lastMovementY = -(movement * Math.cos(angleRadians));

        this.x += this.lastMovementX;
        this.y += this.lastMovementY;
    }

    drawLifeBar(context) {
        const y = this.drawingY - 2 * STYLE.lifeBarHeight - (this.pixelShadowHeight ?? 0);

        this.drawLifeBarAt(context, this.drawingX, y, this.pixelWidth);
    }
}
