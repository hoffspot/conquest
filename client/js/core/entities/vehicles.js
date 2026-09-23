import { GRID_SIZE } from "../config.js";
import { findPath } from "../pathfinding.js";
import { defineSpecs, STYLE } from "./entity.js";
import { Unit } from "./unit.js";

export const vehicleSpecs = defineSpecs({
    "transport": {
        pixelWidth: 31,
        pixelHeight: 30,
        pixelOffsetX: 15,
        pixelOffsetY: 15,
        radius: 15,
        speed: 15,
        sight: 3,
        cost: 400,
        hitPoints: 100,
        turnSpeed: 3,
        spriteImages: [
            { name: "stand", count: 1, directions: 8 },
        ],
    },
    "harvester": {
        pixelWidth: 21,
        pixelHeight: 20,
        pixelOffsetX: 10,
        pixelOffsetY: 10,
        radius: 10,
        speed: 10,
        sight: 3,
        cost: 1600,
        canConstruct: true,
        hitPoints: 50,
        turnSpeed: 3,
        spriteImages: [
            { name: "stand", count: 1, directions: 8 },
        ],
    },
    "scout-tank": {
        canAttack: true,
        canAttackLand: true,
        canAttackAir: false,
        weaponType: "bullet",
        pixelWidth: 21,
        pixelHeight: 21,
        pixelOffsetX: 10,
        pixelOffsetY: 10,
        radius: 11,
        speed: 20,
        sight: 4,
        cost: 500,
        canConstruct: true,
        hitPoints: 50,
        turnSpeed: 5,
        spriteImages: [
            { name: "stand", count: 1, directions: 8 },
        ],
    },
    "heavy-tank": {
        canAttack: true,
        canAttackLand: true,
        canAttackAir: false,
        weaponType: "cannon-ball",
        pixelWidth: 30,
        pixelHeight: 30,
        pixelOffsetX: 15,
        pixelOffsetY: 15,
        radius: 13,
        speed: 15,
        sight: 5,
        cost: 1200,
        canConstruct: true,
        hitPoints: 50,
        turnSpeed: 4,
        spriteImages: [
            { name: "stand", count: 1, directions: 8 },
        ],
    },
});

export class Vehicle extends Unit {
    static defaults = {
        ...Unit.defaults,
        type: "vehicles",

        // How slow the vehicle should move while turning
        speedAdjustmentWhileTurningFactor: 0.5,
    };

    processMoveOrder(distanceFromDestination, radius) {
        const orders = this.orders;

        if (!orders.to || distanceFromDestination < radius) {
            // Stop when within one vehicle radius of the destination
            this.orders = { type: "stand" };

            return;
        }

        if (this.colliding && distanceFromDestination < 3 * radius) {
            // Stop when within 3 radius of the destination if colliding with something
            this.orders = { type: "stand" };

            return;
        }

        if (this.colliding && distanceFromDestination < 5 * radius) {
            // Count collisions within 5 radius distance of goal, and give up after 30 of them
            orders.collisionCount = (orders.collisionCount ?? 0) + 1;

            if (orders.collisionCount > 30) {
                this.orders = { type: "stand" };

                return;
            }
        }

        // Pathfinding couldn't find a path so stop
        if (!this.moveTo(orders.to, distanceFromDestination)) {
            this.orders = { type: "stand" };
        }
    }

    processDeployOrder(distanceFromDestination, radius) {
        const oilfield = this.orders.to;

        // Only harvesters can deploy, and only onto an oil field that hasn't been used already
        if (this.name !== "harvester" || !oilfield || oilfield.name !== "oilfield" || oilfield.lifeCode === "dead") {
            this.orders = { type: "stand" };

            return;
        }

        if (distanceFromDestination < radius + 1) {
            // After reaching within 1 square of oil field, turn harvester to point towards left (direction 6)
            this.turnTo(6);

            if (!this.turning) {
                // Once it is pointing to the left, replace the harvester and oil field with a harvester building
                this.game.remove(oilfield);
                oilfield.lifeCode = "dead";

                this.game.remove(this);
                this.lifeCode = "dead";

                this.game.add({ type: "buildings", name: "harvester", x: oilfield.x, y: oilfield.y, action: "deploy", team: this.team });
            }
        } else if (!this.moveTo(oilfield, distanceFromDestination)) {
            // Pathfinding couldn't find a path so stop
            this.orders = { type: "stand" };
        }
    }

    // Move one step towards the destination using A* and local collision avoidance.
    // Returns false if there is no path to the destination.
    moveTo(destination, distanceFromDestination) {
        const game = this.game;
        const map = game.currentMap;

        const start = [Math.floor(this.x), Math.floor(this.y)];
        const end = [Math.floor(destination.x), Math.floor(destination.y)];

        // Direction that we will need to turn to reach destination
        let newDirection;

        const vehicleOutsideMapBounds = start[0] < 0 || start[0] > map.mapGridWidth - 1
            || start[1] < 0 || start[1] > map.mapGridHeight - 1;
        const vehicleReachedDestinationTile = start[0] === end[0] && start[1] === end[1];

        const passableGrid = game.getPassableGrid();

        if (vehicleOutsideMapBounds || vehicleReachedDestinationTile) {
            // Don't use A*. Just turn towards destination.
            newDirection = this.findAngle(destination);

            this.orders.path = [[this.x, this.y], [destination.x, destination.y]];
        } else {
            let grid = passableGrid;

            if (destination.type === "buildings" || destination.type === "terrain") {
                // Buildings and terrain are obstructions themselves, so mark the destination
                // tile as passable on a copy of the grid to let the algorithm find a path to it
                const endX = Math.min(Math.max(end[0], 0), map.mapGridWidth - 1);
                const endY = Math.min(Math.max(end[1], 0), map.mapGridHeight - 1);

                grid = passableGrid.map((row) => row.slice());
                grid[endY][endX] = 0;
            }

            this.orders.path = findPath(grid, start, end);

            if (this.orders.path.length > 1) {
                // The next step is the center of the next path tile
                const nextStep = { x: this.orders.path[1][0] + 0.5, y: this.orders.path[1][1] + 0.5 };

                newDirection = this.findAngle(nextStep);
            } else {
                // Let the calling function know that there is no path
                return false;
            }
        }

        // Moving along the present path will cause a collision, so steer away
        const collisionObjects = this.checkForCollisions(passableGrid);

        if (this.colliding) {
            newDirection = this.steerAwayFromCollisions(collisionObjects);
        }

        this.turnTo(newDirection);

        // Calculate maximum distance that vehicle can move per game tick
        const maximumMovement = this.speed * this.speedAdjustmentFactor * (this.turning ? this.speedAdjustmentWhileTurningFactor : 1);
        let movement = Math.min(maximumMovement, distanceFromDestination);

        // Back off slightly if we are in a hard collision
        if (this.hardCollision) {
            movement = -movement * 0.5;
        }

        this.moveForward(movement);

        // Let the calling function know that we were able to move
        return true;
    }

    // Make a list of collisions that the vehicle will have if it goes along present path
    checkForCollisions(grid) {
        const game = this.game;
        const map = game.currentMap;

        // Calculate new position on present path at maximum speed
        const movement = this.speed * this.speedAdjustmentFactor;
        const angleRadians = -(this.direction / this.directions) * 2 * Math.PI;
        const newX = this.x - movement * Math.sin(angleRadians);
        const newY = this.y - movement * Math.cos(angleRadians);

        this.colliding = false;
        this.hardCollision = false;

        // List of objects that will collide after next movement step
        const collisionObjects = [];

        // Test for collision with grid up to 3 squares away from this vehicle
        const x1 = Math.max(0, Math.floor(newX) - 3);
        const x2 = Math.min(map.mapGridWidth - 1, Math.floor(newX) + 3);
        const y1 = Math.max(0, Math.floor(newY) - 3);
        const y2 = Math.min(map.mapGridHeight - 1, Math.floor(newY) + 3);

        const gridHardCollisionThreshold = (this.radius * 0.9 / GRID_SIZE) ** 2;
        const gridSoftCollisionThreshold = (this.radius * 1.1 / GRID_SIZE) ** 2;

        for (let j = x1; j <= x2; j++) {
            for (let i = y1; i <= y2; i++) {
                if (grid[i][j] !== 1) {
                    continue;
                }

                // Grid square is obstructed
                const dx = j + 0.5 - newX;
                const dy = i + 0.5 - newY;
                const distanceSquared = dx * dx + dy * dy;

                if (distanceSquared < gridHardCollisionThreshold) {
                    collisionObjects.push({ collisionType: "hard", with: { type: "wall", x: j + 0.5, y: i + 0.5 } });
                    this.colliding = true;
                    this.hardCollision = true;
                } else if (distanceSquared < gridSoftCollisionThreshold) {
                    collisionObjects.push({ collisionType: "soft", with: { type: "wall", x: j + 0.5, y: i + 0.5 } });
                    this.colliding = true;
                }
            }
        }

        for (let i = game.vehicles.length - 1; i >= 0; i--) {
            const vehicle = game.vehicles[i];

            // Only test vehicles that are less than 3 squares away
            if (vehicle === this || Math.abs(vehicle.x - this.x) >= 3 || Math.abs(vehicle.y - this.y) >= 3) {
                continue;
            }

            const dx = vehicle.x - newX;
            const dy = vehicle.y - newY;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < ((this.radius + vehicle.radius) / GRID_SIZE) ** 2) {
                // Closer than the sum of both vehicle radii
                collisionObjects.push({ collisionType: "hard", with: vehicle });
                this.colliding = true;
                this.hardCollision = true;
            } else if (distanceSquared < ((this.radius * 1.5 + vehicle.radius) / GRID_SIZE) ** 2) {
                // Closer than 1.5 times this vehicle's radius plus the other vehicle's radius
                collisionObjects.push({ collisionType: "soft", with: vehicle });
                this.colliding = true;
            }
        }

        return collisionObjects;
    }

    // Find a direction that steers away from the collision objects
    steerAwayFromCollisions(collisionObjects) {
        // Add up the repulsion from all colliding objects into a single force vector
        const forceVector = { x: 0, y: 0 };

        // The next step on the path has a mild attraction force
        const nextStep = this.orders.path[1];
        const forces = [
            ...collisionObjects,
            { collisionType: "attraction", with: { x: nextStep[0] + 0.5, y: nextStep[1] + 0.5 } },
        ];

        const forceMagnitudes = { hard: 2, soft: 1, attraction: -0.25 };

        for (const { collisionType, with: object } of forces) {
            const objectAngle = this.findAngle(object);
            const objectAngleRadians = -(objectAngle / this.directions) * 2 * Math.PI;
            const forceMagnitude = forceMagnitudes[collisionType];

            forceVector.x += forceMagnitude * Math.sin(objectAngleRadians);
            forceVector.y += forceMagnitude * Math.cos(objectAngleRadians);
        }

        // Find a new direction based on the force vector
        return this.directionFromDelta(forceVector.x, forceVector.y);
    }

    drawSelection(context) {
        const x = this.drawingX + this.pixelOffsetX;
        const y = this.drawingY + this.pixelOffsetY;

        context.strokeStyle = STYLE.selectionBorderColor;
        context.lineWidth = 1;

        // Draw a filled circle around the vehicle
        context.beginPath();
        context.arc(x, y, this.radius, 0, Math.PI * 2, false);
        context.fillStyle = STYLE.selectionFillColor;
        context.fill();
        context.stroke();
    }
}
