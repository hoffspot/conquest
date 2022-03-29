var buildings = {
    list: {
        "base": {
            name: "base",

            //Properties for drawing the base

            // Dimensions of the individual sprite
            pixelWidth: 60,
            pixelHeight: 60,

            //Dimensions of the base area
            baseWidth: 40,
            baseHeight: 40,

            //Offset of the base area from the top-left corner of the sprite
            pixelOffsetX: 0,
            pixelOffsetY: 20,

            // Grid squares necessary for constructing the building
            buildableGrid: [
                [1,1],
                [1,1]
            ],

            // Grid squares that are passable or obstructred for pathfinding
            passableGrid: [
                [1, 1],
                [1, 1]
            ],

            // How far the building can "see" through fog of war
            sight: 3,

            //Maximum possible life
            hitPoints: 500,

            cost: 5000,

            spriteImages: [
                {name: "healthy", count: 4},
                {name: "damaged", count: 1},
                {name: "constructing", count: 3}
            ],
        },
        "starport": {
            name: "starport",
            pixelWidth: 40,
            pixelHeight: 60,
            baseWidth: 40,
            baseHeight: 55,
            pixelOffsetX: 1,
            pixelOffsetY: 5,
            buildableGrid: [
                [1,1],
                [1,1],
                [1,1]
            ],
            passableGrid: [
                [1,1],
                [0,0],
                [0,0]
            ],
            sight: 3,
            cost: 2000,
            canConstruct: true,
            hitPoints: 300,
            spriteImages: [
                { name: "teleport", count: 9},
                { name: "closing", count: 18},
                { name: "healthy", count: 4},
                { name: "damaged", count: 1}
            ],
        },
    },

    defaults: {
        type: "buildings",

        processActions: function() {
            switch (this.action) {
                case "stand":
                    this.imageList = this.spriteArray[this.lifeCode];
                    this.imageOffset = this.imageList.offset + this.animationIndex;
                    this.animationIndex++;

                    if  (this.animationIndex >= this.imageList.count) {
                        this.animationIndex = 0;
                    }
                    break;

                case "construct":
                    this.imageList = this.spriteArray["constructing"];
                    this.imageOffset = this.imageList.offset + this.animationIndex;
                    this.animationIndex++;

                    // Once constructing is complete go back to standing
                    if (this.animationIndex >= this.imageList.count) {
                        this.animationIndex = 0;
                        this.action = stand;
                    }
                    break;
                case "teleport":
                    this.imageList = this.spriteArray["teleport"];
                    this.imageOffset = this.imageList.offset + this.animationIndex;
                    this.animationIndex++;

                    // Once teleporting is complete, move to stand mode
                    break;
            }
        },

        // Default function for drawing a building
        drawSprite: function() {
            let x = this.drawingX;
            let y = this.drawingY;

            // All Sprite sheets will have blue in the first row and green in the second row
            let colorIndex = (this.team === "blue") ? 0 : 1;
            let colorOffset = colorIndex * this.pixelHeight;

            // Draw the sprite at x, y
            game.foregroundContext.drawImage(this.spriteSheet, this.imageOffset * this.pixelWidth, colorOffset, this.pixelWidth, this.pixelHeight, x, y, this.pixelWidth, this.pixelHeight);
        },
    },

    load: loadItem,
    add: addItem,
};