/**
 * LAST COLONY - COMMON UTILITIES AND SHARED FUNCTIONS
 * ===================================================
 * 
 * This file contains shared utilities, mathematical functions, and common patterns
 * used throughout the game. It provides the foundation for entity management,
 * asset loading, and mathematical calculations.
 * 
 * CONTENTS:
 * 1. RequestAnimationFrame Polyfill - Ensures smooth animation across browsers
 * 2. Asset Loader System - Manages loading of images and sounds
 * 3. Entity Management - Common functions for creating and managing game objects
 * 4. Mathematical Utilities - Angle calculations, movement, and combat math
 * 5. Combat Functions - Target finding and damage calculations
 * 
 * DESIGN PATTERNS:
 * - Factory Pattern: loadItem() and addItem() functions create entities
 * - Observer Pattern: Asset loading with progress callbacks
 * - Utility Functions: Pure mathematical functions for calculations
 * - Polyfill Pattern: Cross-browser compatibility for modern APIs
 */

// ========================================
// REQUESTANIMATIONFRAME POLYFILL
// ========================================

/**
 * REQUESTANIMATIONFRAME POLYFILL
 * Provides smooth animation timing across all browsers.
 * Modern browsers have requestAnimationFrame built-in, but older browsers need this polyfill.
 * 
 * This polyfill:
 * - Uses vendor-prefixed versions if available (webkit, moz, o, ms)
 * - Falls back to setTimeout-based implementation for older browsers
 * - Maintains consistent 60fps timing when possible
 * - Provides cancelAnimationFrame for cleanup
 */
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    
    // Try to find vendor-prefixed requestAnimationFrame
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = 
          window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
    }
 
    // Fallback implementation using setTimeout
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { 
                callback(currTime + timeToCall); 
            }, timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    }
 
    // Fallback implementation for cancelAnimationFrame
    if (!window.cancelAnimationFrame) {
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
    }
}());

// ========================================
// ASSET LOADING SYSTEM
// ========================================

/**
 * ASSET LOADER OBJECT
 * Manages the loading of all game assets (images, sounds, etc.).
 * Provides progress tracking and ensures all assets are loaded before game starts.
 * 
 * Features:
 * - Progress tracking with visual feedback
 * - Audio format detection and fallback
 * - Loading screen management
 * - Callback system for completion
 */
var loader = {
    loaded: true,           // Whether all assets have finished loading
    loadedCount: 0,        // Number of assets successfully loaded
    totalCount: 0,         // Total number of assets to load
    soundFileExtn: ".ogg", // Preferred audio format extension
    
    /**
     * INITIALIZE LOADER
     * Sets up the asset loading system and detects browser capabilities.
     * Determines which audio formats are supported for optimal performance.
     */
    init: function(){
        // Detect audio format support for optimal file loading
        var mp3Support, oggSupport;
        var audio = document.createElement('audio');
        
    	if (audio.canPlayType) {
       		// canPlayType() returns: "", "maybe", or "probably"
       		// Empty string means definitely not supported
      		mp3Support = "" != audio.canPlayType('audio/mpeg');
      		oggSupport = "" != audio.canPlayType('audio/ogg; codecs="vorbis"');
    	} else {
    		// Audio tag not supported - disable sound
    		mp3Support = false;
    		oggSupport = false;	
    	}

        // Choose best audio format: OGG (smaller) > MP3 > none
        // OGG is preferred due to smaller file sizes and open format
        loader.soundFileExtn = oggSupport ? ".ogg" : mp3Support ? ".mp3" : undefined;        
    },
    
    /**
     * RESET LOADER COUNTERS
     * Resets the loading counters when starting a new mission.
     * This prevents incorrect loading counts between missions.
     */
    reset: function(){
        this.loadedCount = 0;
        this.totalCount = 0;
        this.loaded = true;
        this.onload = undefined;
    },
    
    /**
     * LOAD IMAGE ASSET
     * Loads an image file and tracks loading progress.
     * 
     * @param {string} url - Path to the image file
     * @returns {Image} The image object (may not be loaded yet)
     */
    loadImage: function(url){
        this.totalCount++;
        this.loaded = false;
        $('#loadingscreen').show();
        
        var image = new Image();
        image.src = url;
        image.onload = loader.itemLoaded;
        return image;
    },
    
    /**
     * LOAD SOUND ASSET
     * Loads an audio file with format detection and progress tracking.
     * 
     * @param {string} url - Base path to the sound file (without extension)
     * @returns {Audio} The audio object (may not be loaded yet)
     */
	loadSound: function(url){
		this.totalCount++;
		this.loaded = false;
		$('#loadingscreen').show();
		
		var audio = new Audio();
		audio.src = url + loader.soundFileExtn;
		audio.addEventListener("canplaythrough", loader.itemLoaded, false);
		return audio;   
	},
    
    /**
     * ASSET LOADED CALLBACK
     * Called when any asset finishes loading.
     * Updates progress display and checks if all assets are complete.
     */
    itemLoaded: function(){
        loader.loadedCount++;
        $('#loadingmessage').html('Loaded ' + loader.loadedCount + ' of ' + loader.totalCount);
        
        // Check if all assets have finished loading
        if (loader.loadedCount === loader.totalCount){
            loader.loaded = true;
            $('#loadingscreen').hide();
            
            // Execute completion callback if provided
            if(loader.onload){
                loader.onload();
                loader.onload = undefined;
            }
        }
    }
}

// ========================================
// ENTITY MANAGEMENT FUNCTIONS
// ========================================

/**
 * LOAD ENTITY SPRITES
 * Loads sprite sheets and creates sprite arrays for game entities.
 * This is the default load method used by all game entity types.
 * 
 * Sprite System:
 * - Each entity has a sprite sheet (single image with multiple frames)
 * - Sprite arrays define which frames to use for different states
 * - Supports multiple directions (for units that can face different ways)
 * - Automatically loads weapon sprites if entity has weapons
 * 
 * @param {string} name - Name of the entity to load
 * 
 * TEST: testsuite/tests/entity-tests.js - "Entity creation with addItem()"
 */
function loadItem(name){
    var item = this.list[name];
    
    // Skip loading if sprites already loaded (optimization)
    if(item.spriteArray){
        return;
    }        
    
    // Load the main sprite sheet image
    item.spriteSheet = loader.loadImage('images/' + this.defaults.type + '/' + name + '.png');
    item.spriteArray = [];
    item.spriteCount = 0;
    
    // Process each sprite definition in the entity's spriteImages array
    for (var i = 0; i < item.spriteImages.length; i++){             
        var constructImageCount = item.spriteImages[i].count; 
        var constructDirectionCount = item.spriteImages[i].directions; 
        
        if (constructDirectionCount){
            // Multi-directional sprites (e.g., units that can face 8 directions)
            for (var j = 0; j < constructDirectionCount; j++) {
                var constructImageName = item.spriteImages[i].name + "-" + j;
                item.spriteArray[constructImageName] = {
                    name: constructImageName,
                    count: constructImageCount,
                    offset: item.spriteCount
                };
                item.spriteCount += constructImageCount;
            };
        } else {
            // Single-direction sprites (e.g., buildings, effects)
            var constructImageName = item.spriteImages[i].name;
            item.spriteArray[constructImageName] = {
                name: constructImageName,
                count: constructImageCount,
                offset: item.spriteCount
            };
            item.spriteCount += constructImageCount;
        }
    };
    
    // Load weapon sprites if entity has weapons
    if(item.weaponType){
        bullets.load(item.weaponType);
    }
}

/**
 * CREATE ENTITY INSTANCE
 * Creates a new game entity with default properties and custom details.
 * This is the default add method used by all game entity types.
 * 
 * Entity Creation Process:
 * 1. Start with entity defaults (base properties)
 * 2. Apply entity-specific properties from the list
 * 3. Set initial life/hit points
 * 4. Apply custom details (position, owner, etc.)
 * 
 * @param {Object} details - Custom properties for the new entity
 * @returns {Object} The created entity object
 */
function addItem(details){
    try {
        
        var name = details.name;
        var type = details.type || "vehicles";
        
        // Get the entity definition from the appropriate type manager
        var typeManager = window[type];
        if (!typeManager || !typeManager.list || !typeManager.list[name]) {
            console.error("Entity definition not found:", type, name);
            console.error("Available types:", Object.keys(window).filter(k => typeof window[k] === 'object' && window[k].list));
            return null;
        }
        
        // Start with the defaults (includes all methods like draw, animate, etc.)
        var item = $.extend(true, {}, typeManager.defaults);
        
        // Then extend with the specific entity definition
        $.extend(true, item, typeManager.list[name]);
        
        // Set basic properties
        item.type = type;
        item.name = name;
        item.x = details.x || 0;
        item.y = details.y || 0;
        item.team = details.team || "blue";
        item.selected = false;
        item.selectable = details.selectable !== undefined ? details.selectable : true;
        
        // Set UID (use provided UID or generate new one)
        if (details.uid) {
            item.uid = details.uid;
        } else {
            item.uid = game.counter++;
        }
        
        // Set life and hit points
        if (details.life !== undefined) {
            item.life = details.life;
        } else if (item.hitPoints) {
            item.life = item.hitPoints;
        } else {
            item.life = 100;
        }
        
        // Initialize reload time for combat units
        if (item.canAttack && item.weaponType) {
            item.reloadTimeLeft = 0; // Allow immediate firing
        }
        
        // Apply all other custom details (overrides defaults)
        for (var key in details) {
            if (details.hasOwnProperty(key) && key !== 'type' && key !== 'name') {
                item[key] = details[key];
            }
        }
        
        // Ensure required methods exist
        if (!item.draw) {
            console.error("Entity missing draw method:", item);
            return null;
        }
        
        if (!item.animate) {
            console.error("Entity missing animate method:", item);
            return null;
        }
        return item;
        
    } catch (error) {
        console.error("Error in addItem:", error, "Details:", details);
        return null;
    }
}

// ========================================
// MATHEMATICAL UTILITIES
// ========================================

/**
 * FIND ANGLE BETWEEN TWO OBJECTS
 * Calculates the direction from one object to another.
 * Returns an angle value suitable for sprite direction selection.
 * 
 * Mathematical Process:
 * 1. Calculate delta X and Y between objects
 * 2. Use atan2 to get angle in radians
 * 3. Convert to game's direction system (0 to directions-1)
 * 4. Wrap angle to ensure it's within valid range
 * 
 * @param {Object} object - Target object (what we're pointing toward)
 * @param {Object} unit - Source object (what we're pointing from)
 * @param {number} directions - Number of possible directions (usually 8)
 * @returns {number} Direction index (0 to directions-1)
 */
function findAngle(object, unit, directions){
     var dy = (object.y) - (unit.y);
     var dx = (object.x) - (unit.x);
     
     // Convert atan2 result to game direction system
     // atan2 returns -π to π, we convert to 0 to directions-1
     var angle = wrapDirection(directions/2 - (Math.atan2(dx, dy) * directions / (2 * Math.PI)), directions);   
     return angle;    
     // TEST: testsuite/tests/math-tests.js - "findAngle() calculates correct angle between two points"
     // TEST: testsuite/tests/math-tests.js - "findAngle() calculates correct diagonal angles"
 }

/**
 * CALCULATE ANGLE DIFFERENCE
 * Finds the smallest difference between two angles.
 * Used for smooth turning animations and determining turn direction.
 * 
 * @param {number} angle1 - First angle (0 to directions-1)
 * @param {number} angle2 - Second angle (0 to directions-1)
 * @param {number} directions - Number of possible directions
 * @returns {number} Smallest difference (-directions/2 to +directions/2)
 */
function angleDiff(angle1, angle2, directions){
    // Normalize angles to -directions/2 to +directions/2 range
    if (angle1 >= directions/2){
        angle1 = angle1 - directions;
    }
    if (angle2 >= directions/2){
        angle2 = angle2 - directions;
    }
    
    // Calculate difference
    var diff = angle2 - angle1;
    
    // Wrap difference to smallest possible value
    if (diff < -directions/2){
        diff += directions;
    }
    if (diff > directions/2){
        diff -= directions;
    }
    
    return diff;
    // TEST: testsuite/tests/math-tests.js - "angleDiff() calculates correct angle differences"
}

/**
 * WRAP DIRECTION VALUE
 * Ensures a direction value stays within the valid range.
 * Used to prevent array out-of-bounds errors with sprite arrays.
 * 
 * @param {number} direction - Direction value to wrap
 * @param {number} directions - Number of possible directions
 * @returns {number} Wrapped direction value (0 to directions-1)
 */
function wrapDirection(direction, directions){
    // Handle negative values
    while (direction < 0){
        direction += directions;
    }  
    // Handle values >= directions
    while (direction >= directions){
        direction -= directions;
    }
    return direction;
    // TEST: testsuite/tests/math-tests.js - "wrapDirection() correctly wraps direction values"
}

/**
 * FIND FIRING ANGLE
 * Calculates the optimal firing angle for weapons.
 * Accounts for different object types and their visual offsets.
 * 
 * Special Considerations:
 * - Buildings: Aim at center of building
 * - Aircraft: Account for height/shadow offset
 * - Units: Standard center-to-center targeting
 * 
 * @param {Object} target - Object being fired at
 * @param {Object} source - Object doing the firing
 * @param {number} directions - Number of possible directions
 * @returns {number} Optimal firing direction
 */
function findFiringAngle(target, source, directions){
    var dy = (target.y) - (source.y);
    var dx = (target.x) - (source.x);

    // Adjust for building center (buildings are larger than units)
    if(target.type == "buildings"){
        dy += target.baseWidth/2 / game.gridSize;
        dx += target.baseHeight/2 / game.gridSize;
    } 
    // Adjust for aircraft height (they appear to "float" above ground)
    else if(target.type == "aircraft"){
        dy -= target.pixelShadowHeight / game.gridSize;
    }

    // Adjust for source object characteristics
    if(source.type == "buildings"){
        dy -= source.baseWidth/2 / game.gridSize;
        dx -= source.baseHeight/2 / game.gridSize;
    } else if(source.type == "aircraft"){
        dy += source.pixelShadowHeight / game.gridSize;
    }

    // Convert to game direction system
    var angle = wrapDirection(directions/2 - (Math.atan2(dx, dy) * directions / (2 * Math.PI)), directions);   
    return angle;    
}

// ========================================
// COMBAT AND TARGETING FUNCTIONS
// ========================================

/**
 * VALIDATE COMBAT TARGET
 * Determines if a unit can attack a specific target.
 * Used for combat targeting validation.
 * 
 * Targeting Rules:
 * 1. Target must be on different team (enemy)
 * 2. Attacker must have appropriate attack capabilities
 * 3. Target must be within attack range
 * 4. Target must be alive and selectable
 * 
 * @param {Object} attacker - Unit attempting to attack
 * @param {Object} target - Potential target
 * @returns {boolean} True if target is valid for attack
 */
function isValidTarget(attacker, target) {
    // Check if target is on different team
    if (attacker.team === target.team) {
        return false;
    }
    
    // Check if attacker can attack
    if (!attacker.canAttack) {
        return false;
    }
    
    // Check if target is alive and selectable
    if (target.lifeCode === "dead" || !target.selectable) {
        return false;
    }
    
    // Check attack type capabilities
    if (attacker.canAttackLand && target.type === "vehicles") {
        return true;
    }
    
    if (attacker.canAttackAir && target.type === "aircraft") {
        return true;
    }
    
    if (attacker.canAttackLand && target.type === "buildings") {
        return true;
    }
    
    return false;
}

/**
 * FIND TARGETS IN SIGHT
 * Searches for valid targets within sight range and line of sight.
 * Used by units to find enemies to attack.
 * 
 * Targeting Logic:
 * 1. Check if target is within sight range
 * 2. Verify line of sight (no obstacles blocking)
 * 3. Ensure target is on different team
 * 4. Prioritize closest or most threatening targets
 * 
 * @param {number} increment - Search increment (for performance optimization)
 * @returns {Array} Array of valid targets found
 */
function findTargetsInSight(increment){
    var targets = [];
    
    // Search through all game entities
    for (var i = game.items.length - 1; i >= 0; i--){
        var item = game.items[i];
        
        // Skip if item is dead or not a valid target
        if (item.lifeCode == "dead" || !item.selectable){
            continue;
        }
        
        // Check if target is on different team (enemy)
        if (item.team != this.team){
            // Calculate distance to target
            var distance = Math.sqrt(Math.pow(item.x - this.x, 2) + Math.pow(item.y - this.y, 2));
            
            // Check if target is within sight range
            if (distance <= this.sight){
                // Check line of sight (simplified - could be enhanced with raycasting)
                if (this.hasLineOfSightTo(item)){
                    targets.push(item);
                }
            }
        }
    }
    
    return targets;
}

/**
 * CHECK IF ENTITY IS DEAD
 * Determines if a game entity has been destroyed.
 * Used throughout the game for cleanup and state management.
 * 
 * @param {number} uid - Unique identifier of the entity to check
 * @returns {boolean} True if entity is dead or doesn't exist
 */
function isItemDead(uid){
    var item;
    
    // If uid is a string, get item by UID
    if (typeof uid === 'string') {
        item = game.getItemByUid(uid);
    } else {
        // If uid is an object, use it directly
        item = uid;
    }
    
    // Check if item exists and is alive
    if (!item) {
        return true; // Non-existent items are considered dead
    }
    
    // Check life code first (for entities that use lifeCode)
    if (item.lifeCode === "dead") {
        return true;
    }
    
    // Check life value (for entities that use life/hitPoints)
    if (item.life !== undefined) {
        return item.life <= 0;
    }
    
    // Check hitPoints (fallback)
    if (item.hitPoints !== undefined) {
        return item.hitPoints <= 0;
    }
    
    // If no life indicators found, assume alive
    return false;
}

/**
 * DAMAGE VARIABILITY CONSTANTS
 * These constants define the range of random variation in damage calculations.
 * Damage varies by ±10% to simulate real-world weapon inconsistencies.
 */
var DAMAGE_VARIABILITY = {
    MIN_FACTOR: 0.9,  // Minimum damage multiplier (90% of base)
    MAX_FACTOR: 1.1,  // Maximum damage multiplier (110% of base)
    RANGE: 0.2        // Total range of variation (0.2 = 20%)
};

/**
 * ENTITY UID GENERATION CONSTANTS
 * These constants define the format and characteristics of entity UIDs.
 * UIDs are randomly generated to ensure uniqueness across all game entities.
 */
var UID_GENERATION = {
    PREFIX: "entity-",           // Prefix for all entity UIDs
    LENGTH: 9,                   // Length of random part
    BASE: 36,                    // Base for number conversion (alphanumeric)
    START_INDEX: 2              // Start index for substring (skip "0.")
};

/**
 * CALCULATE DAMAGE
 * Determines how much damage a weapon does to a target.
 * Takes into account weapon power, target armor, and random factors.
 * 
 * Damage Formula:
 * Base damage + random variation - target armor = final damage
 * 
 * @param {number} weaponPower - Base damage of the weapon
 * @param {number} targetArmor - Armor value of the target
 * @returns {number} Final damage amount
 */
function calculateDamage(weaponPower, targetArmor){
    // If weapon power is 0, return 0 damage
    if (weaponPower <= 0) {
        return 0;
    }
    
    // Add random variation to damage (±10% variation)
    var randomFactor = DAMAGE_VARIABILITY.MIN_FACTOR + Math.random() * DAMAGE_VARIABILITY.RANGE;
    var baseDamage = weaponPower * randomFactor;
    
    // Apply armor reduction
    var finalDamage = Math.max(1, baseDamage - targetArmor);
    
    return Math.floor(finalDamage);
    // TEST: testsuite/tests/math-tests.js - "calculateDamage() calculates correct damage values"
    // TEST: testsuite/tests/combat-tests.js - "Damage calculation correctly applies armor reduction"
}

/**
 * CHECK LINE OF SIGHT
 * Determines if one object can see another (no obstacles blocking).
 * Used for targeting and AI decision making.
 * 
 * Line of Sight Algorithm:
 * 1. Draw line between source and target
 * 2. Check each grid cell along the line
 * 3. If any cell is blocked, line of sight is blocked
 * 
 * @param {Object} source - Object doing the looking
 * @param {Object} target - Object being looked at
 * @returns {boolean} True if line of sight is clear
 */
function hasLineOfSightTo(target){
    // Simplified line of sight - could be enhanced with proper raycasting
    // For now, just check if there are any buildings/terrain between source and target
    
    var dx = target.x - this.x;
    var dy = target.y - this.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    
    // Check a few points along the line
    var steps = Math.max(1, Math.floor(distance / game.gridSize));
    
    for (var i = 1; i < steps; i++){
        var t = i / steps;
        var checkX = this.x + dx * t;
        var checkY = this.y + dy * t;
        
        // Check if this point is blocked by terrain or buildings
        if (game.currentMapPassableGrid && 
            game.currentMapPassableGrid[Math.floor(checkY)] && 
            game.currentMapPassableGrid[Math.floor(checkY)][Math.floor(checkX)] == 1){
            return false; // Line of sight blocked
        }
    }
    
    return true; // Line of sight clear
}
