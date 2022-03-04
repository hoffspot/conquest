// Asset loader.   I've historically seen some weird behavior here.  Likely needs a rework/reimplementation
var loader = {
    loaded: true,
    loadedCount: 0, // Assets that have been loaded so far
    totalCount: 0, // Total number of assets that need loading

    init: function() {
        // Check for sounds support
        var mp3Support, oggSupport;
        var audio = document.createElement("audio");

        if (audio.canPlayType) {
            // Currently canPlayType() returns:  "", "maybe", or "probably"
            mp3Support = "" !== audio.canPlayType("audio/mpeg");
            oggSupport = "" !== audio.canPlayType("audio/ogg; codecs=\"vorbis\"");
        } else {
            // The audio tag is not supported
            mp3support = false;
            oggSupport = false;
        }

        // Check for ogg, then mp3, and finally set soundFileExtn to undefined
        loader.soundFileExtn = oggSupport ? ".ogg" : mp3Support ? ".mp3" : undefined;
    },

    loadImage: function(url) {
        this.loaded = false;
        this.totalCount++;

        game.showScreen("loadingscreen");

        var image = new Image();

        image.addEventListener("load", loader.itemLoaded, false);
        image.src = url;

        return image;
    },

    soundFileExtn: ".ogg",

    loadSound: function(url) {
        this.loaded = false;
        this.totalCount++;

        game.showScreen("loadingscreen");

        var audio = new Audio();

        audio.addEventListener("canplaythrough", loader.itemLoaded, false);
        audio.src = url + loader.soundFileExtn;

        return audio;
    },

    itemLoaded: function(ev) {
        // Stop listening for event type (load or canplaythrough) for this item now that it has been loaded
        ev.target.removeEventListener(ev.type, loader.itemLoaded, false);
        loader.loadedCount++;

        document.getElementById("loadingmessage").innerHTML = "Loaded " + loader.loadedCount + " of " + loader.totalCount;

        if (loader.loadedCount === loader.totalCount) {
            // Loader has loaded completely
            //Reset and clear the loader
            loader.loaded = true;
            loader.loadedCount = 0;
            loader.totalCount = 0;

            // Hide the loading screen
            game.hideScreen("loadingscreen");

            // and call the loader.onload method if it exists
            if (loader.onload) {
                loader.onload();
                loader.onload = undefined;
            }
        }
    }
};

// The default load() method used by all of our game entities
function loadItem(name) {

    //Question: where does the this reference get that list populated?  Looks like the function 
    //gets referenced as internal to the object representing the entity.  Like a "base" object from buildings.js
    var item = this.list[name];

    // If the item sprite array has already been loaded, then no need to do it again
    if (item.spriteArray) {
        return;
    }

    item.spriteSheet = loader.loadImage("images/" + this.defaults.type + "/" + name + ".png");
    item.spriteArray = [];
    item.spriteCount = 0;

    item.spriteImages.forEach(function(spriteImage) {
        let constructImageCount = spriteImage.count;
        let constructDirectionCount = spriteImage.directions;

        if (constructDirectionCount) {
            // If the spriteImage has directions defined, store sprites for each direction in spriteArray
            for (let i = 0; i < constructDirectionCount; i++) {
                let constructImageName = spriteImage.name + "-" + i;

                item.spriteArray[constructImageName] = {
                    name: constructImageName,
                    count: constructImageCount,
                    offset: item.spriteCount
                };
                item.spriteCount += constructImageCount;
            }
        } else {
            // If the spriteImage has no directions, store just the name and image count in spriteArray
            let constructImageName = spriteImage.name;

            item.spriteArray[constructImageName] = {
                name: constructImageName,
                count: constructImageCount,
                offset: item.spriteCount
            };
        }
    });
}

// Polyfill for a few browsers that still do not support Object.assign
if (typeof Object.assign !== "function") {
    Object.assign = function(target, varArgs) { // .length of function is 2
        "use strict";
        if (target === null) { // TypeError if undefined of null
            throw new TypeError("Cannot convert undefined or null to object");
        }

        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];

            if (nextSource != null) { // Skip over undefined or null
                for (var nextKey in nextSource) {
                    // Avoid bugs when hasOwnProperty is shadowed
                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
        }

        return to;
    };
}

// The default add() method used by all our game entities
function addItem(details) {
    var name = details.name;

    //Initialize the item with any default parameters the item should have
    var item = Object.assign({}, baseItem);

    // Assign the item all the default properties for its category type
    Object.assign(item, this.defaults);

    // Assign item properties based on the item name
    Object.assign(item, this.list[name]);

    // By default, set the item's life to its maximum hit points
    item.life = item.hitPoints;

    // Override item defaults based on details
    Object.assign(item, details);

    return item;
}

//Default properties that every item should have
var baseItem = {
    animationIndex: 0,
    direction: 0,

    selected: false,
    selectable: true,

    orders:{ type: "stand"},
    action: "stand",

    // Default method for animating an item
    animate: function() {

        // Check the health of the item
        if (this.life > this.hitPoints * 0.4) {
            // Consider item healthy if it has more than 40% life
            this.lifeCode = "healthy";
        } else if (this.life > 0) {
            // Consider item damaged if it has less than 40% life
            this.lifeCode = "damaged";
        } else {
            // Remove item from the game if it had died (life is 0 or negative)
            //  Good place to trigger blow up animation or keel over dead animation
            this.lifeCode = "dead";
            game.remove(this);

            return;
        }

        //Process the currrent action
        this.processActions();
    },

    // Default method for drawing an item
    draw: function() {
        // Compute pixel coordinates on canvas for drawing item
        this.drawingX = (this.x * game.gridSize) - game.offsetX - this.pixelOffsetX;
        this.drawingY = (this.y * game.gridSize) - game.offsetY - this.pixelOffsetY;

        this.drawSprite();
    },
};
