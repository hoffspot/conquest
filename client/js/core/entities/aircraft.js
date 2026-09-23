import { GRID_SIZE } from "../config.js";
import { defineSpecs, STYLE } from "./entity.js";
import { Unit } from "./unit.js";

export const aircraftSpecs = defineSpecs({
    "chopper": {
        cost: 900,
        canConstruct: true,
        pixelWidth: 40,
        pixelHeight: 40,
        pixelOffsetX: 20,
        pixelOffsetY: 20,
        weaponType: "heatseeker",
        radius: 18,
        sight: 6,
        canAttack: true,
        canAttackLand: true,
        canAttackAir: true,
        hitPoints: 50,
        speed: 25,
        turnSpeed: 4,
        pixelShadowHeight: 40,
        spriteImages: [
            { name: "stand", count: 4, directions: 8 },
        ],
    },
    "wraith": {
        cost: 600,
        canConstruct: true,
        pixelWidth: 30,
        pixelHeight: 30,
        canAttack: true,
        canAttackLand: false,
        canAttackAir: true,
        weaponType: "fireball",
        pixelOffsetX: 15,
        pixelOffsetY: 15,
        radius: 15,
        sight: 8,
        speed: 40,
        turnSpeed: 4,
        hitPoints: 50,
        pixelShadowHeight: 40,
        spriteImages: [
            { name: "stand", count: 1, directions: 8 },
        ],
    },
});

export class Aircraft extends Unit {
    static defaults = {
        ...Unit.defaults,
        type: "aircraft",

        // How slow the aircraft should move while turning
        speedAdjustmentWhileTurningFactor: 0.4,
    };

    // Aircraft fly straight towards their destination; no path finding or collisions needed
    moveTo(destination, distanceFromDestination) {
        this.turnTo(this.findAngle(destination));

        // Calculate maximum distance that aircraft can move per game tick
        const maximumMovement = this.speed * this.speedAdjustmentFactor * (this.turning ? this.speedAdjustmentWhileTurningFactor : 1);

        this.moveForward(Math.min(maximumMovement, distanceFromDestination));

        return true;
    }

    // Bullets leave from the aircraft itself, which flies pixelShadowHeight above its shadow
    bulletOrigin(angleRadians) {
        const origin = super.bulletOrigin(angleRadians);

        origin.y -= this.pixelShadowHeight / GRID_SIZE;

        return origin;
    }

    drawSprite(context) {
        const spriteSheet = this.spriteSheet;

        if (!spriteSheet || this.imageOffset === undefined) {
            return;
        }

        const sourceX = this.imageOffset * this.pixelWidth;
        const colorOffset = this.spriteRow * this.pixelHeight;
        // The aircraft shadow is on the third row of the sprite sheet
        const shadowOffset = this.pixelHeight * 2;

        // Draw the aircraft pixelShadowHeight pixels above its position
        context.drawImage(spriteSheet, sourceX, colorOffset, this.pixelWidth, this.pixelHeight,
            this.drawingX, this.drawingY - this.pixelShadowHeight, this.pixelWidth, this.pixelHeight);

        // Draw the shadow at aircraft position
        context.drawImage(spriteSheet, sourceX, shadowOffset, this.pixelWidth, this.pixelHeight,
            this.drawingX, this.drawingY, this.pixelWidth, this.pixelHeight);
    }

    drawSelection(context) {
        const x = this.drawingX + this.pixelOffsetX;
        const y = this.drawingY + this.pixelOffsetY - this.pixelShadowHeight;

        context.strokeStyle = STYLE.selectionBorderColor;
        context.fillStyle = STYLE.selectionFillColor;
        context.lineWidth = 2;

        // Draw a filled circle around the aircraft
        context.beginPath();
        context.arc(x, y, this.radius, 0, Math.PI * 2, false);
        context.stroke();
        context.fill();

        // Draw a circle around the aircraft shadow
        context.beginPath();
        context.arc(x, y + this.pixelShadowHeight, 4, 0, Math.PI * 2, false);
        context.stroke();

        // Join the center of the two circles with a line
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + this.pixelShadowHeight);
        context.stroke();
    }
}
