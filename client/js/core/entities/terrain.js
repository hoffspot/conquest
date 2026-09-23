import { defineSpecs, Entity } from "./entity.js";

export const terrainSpecs = defineSpecs({
    "oilfield": {
        pixelWidth: 40,
        pixelHeight: 60,
        baseWidth: 40,
        baseHeight: 20,
        pixelOffsetX: 0,
        pixelOffsetY: 40,
        buildableGrid: [
            [1, 1],
        ],
        passableGrid: [
            [0, 0],
        ],
        spriteImages: [
            { name: "hint", count: 1 },
            { name: "stand", count: 1 },
        ],
    },
    "bigrocks": {
        pixelWidth: 40,
        pixelHeight: 70,
        baseWidth: 40,
        baseHeight: 40,
        pixelOffsetX: 0,
        pixelOffsetY: 30,
        buildableGrid: [
            [1, 1],
            [0, 1],
        ],
        passableGrid: [
            [1, 1],
            [0, 1],
        ],
        spriteImages: [
            { name: "stand", count: 1 },
        ],
    },
    "smallrocks": {
        pixelWidth: 20,
        pixelHeight: 35,
        baseWidth: 20,
        baseHeight: 20,
        pixelOffsetX: 0,
        pixelOffsetY: 15,
        buildableGrid: [
            [1],
        ],
        passableGrid: [
            [1],
        ],
        spriteImages: [
            { name: "stand", count: 1 },
        ],
    },
});

export class Terrain extends Entity {
    static defaults = {
        type: "terrain",
        selectable: false,
    };

    // No team colours for terrain
    get spriteRow() {
        return 0;
    }

    // Terrain has no health, so skip the health check and just pick the sprite for the action
    animate() {
        this.processActions();
    }

    processActions() {
        this.imageList = this.spriteArray[this.action];
        this.imageOffset = this.imageList.offset;
    }
}
