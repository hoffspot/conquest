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
    },

    defaults: {
        type: "buildings",
    },

    load: loadItem,
    add: addItem,
};