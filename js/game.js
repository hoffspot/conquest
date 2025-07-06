/**
 * LAST COLONY - MAIN GAME ENGINE
 * =============================
 * 
 * This file contains the core game engine that orchestrates all game systems.
 * The game follows a component-based architecture where different systems
 * (buildings, vehicles, aircraft, etc.) are managed as separate modules
 * but interact through this central game object.
 * 
 * ARCHITECTURE OVERVIEW:
 * - Game Loop: Separates animation (logic) from drawing (rendering) for performance
 * - Entity Management: All game objects (units, buildings, bullets) are stored in arrays
 * - Command System: Player actions are processed through a command queue
 * - Grid System: Map is divided into 20x20 pixel tiles for pathfinding and collision
 * - Trigger System: Events can be scheduled or conditionally triggered
 * 
 * DESIGN PATTERNS:
 * - Observer Pattern: Game systems observe and react to events
 * - Command Pattern: Player actions are encapsulated as commands
 * - Component Pattern: Game entities are composed of reusable components
 * - State Machine: Entities have different states (idle, moving, attacking, dead)
 */

// Wait for all page resources to load before initializing the game
// This ensures all images, sounds, and scripts are available
$(window).load(function() {
	game.init();
});

/**
 * MAIN GAME OBJECT
 * This is the central hub that coordinates all game systems and maintains game state.
 * It follows a singleton pattern to ensure there's only one game instance.
 */
var game = {
    
    /**
     * GAME INITIALIZATION
     * Sets up all game systems and prepares the game for play.
     * This is called once when the page loads.
     * 
     * TEST: testsuite/tests/game-engine-tests.js - "Game initialization sets up all required systems"
     * TEST: testsuite/tests/integration-tests.js - "Complete game initialization sets up all systems correctly"
     */
	init: function(){
		// Initialize all subsystem managers
		loader.init();      // Asset loading system
		mouse.init();       // Mouse input handling
		sidebar.init();     // UI sidebar controls
		sounds.init();      // Audio system
		
		// Initialize game state arrays
		game.items = [];        // All game entities (units, buildings, bullets)
		game.sortedItems = [];  // Items sorted by Y coordinate for rendering
		game.selectedItems = []; // Currently selected units
		
		// Initialize game state properties
		game.team = "player";   // Current player team
		game.cash = {           // Cash balance for each team
			"player": 1000,
			"enemy": 1000
		};
		game.running = false;   // Game loop running state
		
		// Mock level and map data for testing
		game.currentLevel = {
			mapGridWidth: 50,
			mapGridHeight: 50,
			triggers: [],
			requirements: {
				buildings: ['starport', 'ground-turret'],
				vehicles: ['scout-tank', 'heavy-tank', 'harvester'],
				aircraft: ['chopper', 'wraith']
			}
		};
		game.currentMapImage = {
			width: 1000,
			height: 800
		};

		// Hide all game layers and show the start screen
		// Game layers are different UI screens (start, mission, game, etc.)
		$('.gamelayer').hide();
		$('#gamestartscreen').show();

		// Set up the dual-canvas rendering system
		// Background canvas: Static map elements (terrain, buildings)
		// Foreground canvas: Dynamic elements (units, bullets, effects)
		game.backgroundCanvas = document.getElementById('gamebackgroundcanvas');
		if (game.backgroundCanvas) {
			game.backgroundContext = game.backgroundCanvas.getContext('2d');
			// Store canvas dimensions for calculations
			game.canvasWidth = game.backgroundCanvas.width;
			game.canvasHeight = game.backgroundCanvas.height;
		} else {
			// Mock canvas for testing environment
			game.backgroundCanvas = {
				width: 800,
				height: 600,
				getContext: function() {
					return {
						drawImage: function() {},
						clearRect: function() {},
						fillRect: function() {},
						strokeRect: function() {},
						fillText: function() {},
						strokeText: function() {},
						save: function() {},
						restore: function() {},
						translate: function() {},
						scale: function() {},
						rotate: function() {}
					};
				}
			};
			game.backgroundContext = game.backgroundCanvas.getContext();
			game.canvasWidth = 800;
			game.canvasHeight = 600;
		}

		game.foregroundCanvas = document.getElementById('gameforegroundcanvas');
		if (game.foregroundCanvas) {
			game.foregroundContext = game.foregroundCanvas.getContext('2d');
		} else {
			// Mock canvas for testing environment
			game.foregroundCanvas = {
				width: 800,
				height: 600,
				getContext: function() {
					return {
						drawImage: function() {},
						clearRect: function() {},
						fillRect: function() {},
						strokeRect: function() {},
						fillText: function() {},
						strokeText: function() {},
						save: function() {},
						restore: function() {},
						translate: function() {},
						scale: function() {},
						rotate: function() {}
					};
				}
			};
			game.foregroundContext = game.foregroundCanvas.getContext();
		}
	},
    
    /**
     * START GAME
     * Begins the actual gameplay after initialization.
     * Sets up the game loop and initializes level-specific content.
     */
    start: function(){
        try {
            // Switch to the main game interface
            console.log("Hiding all game layers...");
            $('.gamelayer').hide();
            console.log("Showing game interface...");
            $('#gameinterfacescreen').show();
            
            // Check if interface is actually visible
            const interface = document.getElementById('gameinterfacescreen');
            if (interface) {
                console.log("Game interface element found, display style:", interface.style.display);
                console.log("Game interface computed display:", window.getComputedStyle(interface).display);
            } else {
                console.error("Game interface element not found!");
            }
            
            // Set game state flags
            game.running = true;           // Enables the game loop
            game.refreshBackground = true; // Forces background redraw on first frame
            
            // Start the rendering loop (this runs continuously)
            game.drawingLoop();

            // Clear any previous game messages
            $('#gamemessages').html("");
            
            // Initialize all level-specific triggers
            // Triggers are events that happen at specific times or conditions
            console.log("Initializing", game.currentLevel.triggers.length, "triggers");
            for (var i = game.currentLevel.triggers.length - 1; i >= 0; i--){
                game.initTrigger(game.currentLevel.triggers[i]);
            };
            
            console.log("Game interface started successfully");
        } catch (error) {
            console.error("Error in game.start():", error);
            game.running = false;
            throw error;
        }
    },
	
	// ========================================
	// GAME CONFIGURATION CONSTANTS
	// ========================================
	
	/**
	 * GRID SYSTEM CONFIGURATION
	 * The game world is divided into a grid system for efficient pathfinding,
	 * collision detection, and spatial organization.
	 */
	gridSize: 20, // Each grid tile is 20x20 pixels
	
	/**
	 * RENDERING OPTIMIZATION FLAGS
	 * These flags help optimize performance by avoiding unnecessary redraws.
	 */
	refreshBackground: true, // Set to true when background needs redrawing (e.g., camera panning)
		
	/**
	 * GAME LOOP TIMING
	 * Controls how often the game logic updates vs. rendering.
	 * Animation runs at fixed intervals, drawing runs as fast as possible.
	 */
	animationTimeout: 100, // Animation updates every 100ms (10 times per second)
	
	/**
	 * CAMERA SYSTEM
	 * Controls the viewport position and panning behavior.
	 */
	offsetX: 0,	// Current X offset of the camera viewport
	offsetY: 0, // Current Y offset of the camera viewport
	panningThreshold: 60, // Distance from edge where panning starts (in pixels)
	panningSpeed: 10,     // How many pixels to pan per frame
	
	/**
	 * HANDLE CAMERA PANNING
	 * Implements edge-scrolling: when mouse is near screen edges, camera moves.
	 * This allows players to navigate large maps without needing a minimap.
	 * 
	 * TEST: testsuite/tests/game-engine-tests.js - "Camera panning responds to mouse position at screen edges"
	 * TEST: testsuite/tests/game-engine-tests.js - "Camera respects map boundaries during panning"
	 */
	handlePanning: function(){
		// Don't pan if mouse is outside the game canvas
		if (!mouse.insideCanvas){
			return;
		}

		// PAN LEFT: Mouse is near left edge
		if(mouse.x <= game.panningThreshold){
			// Only pan if we haven't reached the left edge of the map
			if (game.offsetX >= game.panningSpeed){
				game.refreshBackground = true; // Mark background for redraw
				game.offsetX -= game.panningSpeed; // Move camera left		
			}
		} 
		// PAN RIGHT: Mouse is near right edge
		else if (mouse.x >= game.canvasWidth - game.panningThreshold){
			// Only pan if we haven't reached the right edge of the map
			if (game.offsetX + game.canvasWidth + game.panningSpeed <= game.currentMapImage.width){
				game.refreshBackground = true;
				game.offsetX += game.panningSpeed;
			}
		}
	
		// PAN UP: Mouse is near top edge
		if(mouse.y <= game.panningThreshold){
			if (game.offsetY >= game.panningSpeed){
				game.refreshBackground = true;
				game.offsetY -= game.panningSpeed;
			}
		} 
		// PAN DOWN: Mouse is near bottom edge
		else if (mouse.y >= game.canvasHeight - game.panningThreshold){
			if (game.offsetY + game.canvasHeight + game.panningSpeed <= game.currentMapImage.height){
				game.refreshBackground = true;
				game.offsetY += game.panningSpeed;
			}
		}	
	
		// If camera moved, update mouse coordinates relative to game world
		if (game.refreshBackground){
			mouse.calculateGameCoordinates();
		}
	},
	
	/**
	 * ANIMATION LOOP
	 * Updates game logic at fixed intervals (every 100ms).
	 * This handles: unit movement, combat, AI, UI updates, etc.
	 * Separated from drawing loop for consistent game speed regardless of frame rate.
	 * 
	 * TEST: testsuite/tests/game-engine-tests.js - "Game loop maintains consistent animation timing"
	 */
	animationLoop: function(){
		// Update UI elements (buttons, indicators, etc.)
	    sidebar.animate();
	    
		// Process orders for all game entities that can receive commands
		// This includes movement, attack, build, and other actions
	    for (var i = game.items.length - 1; i >= 0; i--){
	        if(game.items[i].processOrders){
	            game.items[i].processOrders();
	        }            
	    };
	    
	    // Update all game entities (movement, animations, state changes)
	    for (var i = game.items.length - 1; i >= 0; i--){
	        game.items[i].animate();
	    };

	    // Sort entities by Y coordinate for proper rendering order
	    // Entities further "back" (higher Y) are drawn first, creating depth
	    game.sortedItems = $.extend([], game.items);
	    
	    // Debug: Check for invalid items
	    for (var i = game.sortedItems.length - 1; i >= 0; i--) {
	        var item = game.sortedItems[i];
	        if (!item || typeof item !== 'object') {
	            console.error("Invalid item in game.items:", item, "at index:", i);
	            game.sortedItems.splice(i, 1);
	            continue;
	        }
	        if (!item.y || typeof item.y !== 'number') {
	            console.error("Item missing valid Y coordinate:", item);
	        }
	    }
	    
	    game.sortedItems.sort(function(a,b){
	        return b.y - a.y + ((b.y == a.y) ? (a.x - b.x) : 0);
	    });
		
		// Update fog of war system
		fog.animate();
		
		// Update attack target indicators
		game.updateAttackTargetIndicators();
		
	    // Record when this animation cycle completed
	    // Used for interpolation in the drawing loop
	    game.lastAnimationTime = (new Date()).getTime();
	},    
	
	/**
	 * DRAWING LOOP
	 * Renders the game at maximum frame rate (typically 60 FPS).
	 * Uses requestAnimationFrame for smooth, efficient rendering.
	 * Separated from animation loop to maintain consistent game speed.
	 */
	drawingLoop: function(){    
	    try {
	        // Handle camera panning (edge scrolling)
	        game.handlePanning();
		
		    // Calculate interpolation factor for smooth movement
		    // Since drawing happens more frequently than animation, we interpolate
		    // between animation frames to create smooth visual movement
		    game.lastDrawTime = (new Date()).getTime();
	        if (game.lastAnimationTime){
	            game.drawingInterpolationFactor = (game.lastDrawTime - game.lastAnimationTime) / game.animationTimeout - 1;
	            if (game.drawingInterpolationFactor > 0){ 
	            	game.drawingInterpolationFactor = 0; // Don't interpolate beyond next animation frame
	            }
	        } else {
			    game.drawingInterpolationFactor = -1;
		    }

	        // OPTIMIZATION: Only redraw background when necessary
	        // Background redrawing is expensive, so we only do it when camera moves
	        if (game.refreshBackground){
	            game.backgroundContext.drawImage(
	                game.currentMapImage, 
	                game.offsetX, game.offsetY, game.canvasWidth, game.canvasHeight, 
	                0, 0, game.canvasWidth, game.canvasHeight
	            );
	            game.refreshBackground = false;
	        }

	        // Clear the foreground canvas for fresh drawing
	        game.foregroundContext.clearRect(0, 0, game.canvasWidth, game.canvasHeight);
		
	        // Draw all game entities in sorted order (back to front)
	        for (var i = game.sortedItems.length - 1; i >= 0; i--){
	            var item = game.sortedItems[i];
	            if (item.type != "bullets"){
	                if (typeof item.draw !== 'function') {
	                    console.error("Item missing draw method:", item);
	                    console.error("Item type:", item.type);
	                    console.error("Item name:", item.name);
	                    console.error("Item UID:", item.uid);
	                    continue; // Skip this item
	                }
	                item.draw();
	            }
	        };

		    // Draw bullets on top of everything else
		    // Bullets are drawn separately to ensure they're always visible
	        for (var i = game.bullets.length - 1; i >= 0; i--){
	            game.bullets[i].draw();
	        };

		    // Draw fog of war overlay
		    fog.draw();
			
	        // Draw mouse cursor and selection indicators
	        mouse.draw();
			
	        // Draw attack target indicators
	        game.drawAttackTargetIndicators();

	        // Schedule the next frame
	        if (game.running){
	            requestAnimationFrame(game.drawingLoop);    
	        }
	    } catch (error) {
	        console.error("Error in drawingLoop:", error);
	        // Stop the game loop if there's an error
	        game.running = false;
	    }                       
	},
	
	/**
	 * RESET GAME STATE
	 * Clears all game entities and resets counters.
	 * Called when starting a new level or restarting the game.
	 */
	resetArrays: function(){
	    game.counter = 1; // Unique ID counter for new entities
	    game.items = [];        // All game entities
	    game.sortedItems = [];  // Sorted version for rendering
	    game.buildings = [];    // Buildings (factories, defenses, etc.)
	    game.vehicles = [];     // Ground vehicles (tanks, harvesters)
	    game.aircraft = [];     // Flying units (helicopters, fighters)
	    game.terrain = [];      // Terrain features (rocks, oil fields)
	    game.triggeredEvents = []; // Active event triggers
	    game.selectedItems = [];   // Currently selected units
	    game.sortedItems = [];     // Duplicate line (legacy code)
		game.bullets = [];         // Active projectiles
	},
	
	/**
	 * ADD ENTITY TO GAME
	 * Creates and adds a new game entity (unit, building, etc.) to the game world.
	 * 
	 * @param {Object} itemDetails - Configuration object for the new entity
	 * @returns {Object} The created entity object
	 */
	add: function(itemDetails) {
	    try {
	        
	        // Assign unique identifier if not provided
	        // Note: Negative UIDs are used for special entities like:
	        // - Mission objectives and triggers
	        // - Pre-placed units with specific story roles
	        // - Entities that need to be referenced by other game systems
	        if (!itemDetails.uid){
	            itemDetails.uid = game.counter++;
	        }

	        // Check if the type manager exists
	        if (!window[itemDetails.type]) {
	            console.error("Type manager not found:", itemDetails.type);
	            return null;
	        }

	                // Create the entity using the common addItem function
        var item = addItem(itemDetails);
	        
	        if (!item) {
	            console.error("Failed to create item:", itemDetails);
	            return null;
	        }

	        // Add to main entity list
	        game.items.push(item);
	        // Add to type-specific list for efficient access
	        game[item.type].push(item); 
	        // Add to sorted items for rendering (will be re-sorted in animation loop)
	        game.sortedItems.push(item);

	        // If adding buildings or terrain, invalidate pathfinding cache
	        // This forces recalculation of walkable areas
	        if(item.type == "buildings" || item.type == "terrain"){
	            game.currentMapPassableGrid = undefined;
	        }
	
	        // Play sound effect for bullet creation
	        if (item.type == "bullets"){
	            sounds.play(item.name);
	        }
	        
	                return item;
	    } catch (error) {
	        console.error("Error in game.add():", error, "Item details:", itemDetails);
	        return null;
	    }        
	},
	
	/**
	 * REMOVE ENTITY FROM GAME
	 * Completely removes an entity from all game systems.
	 * Handles cleanup of selections, arrays, and pathfinding updates.
	 * 
	 * @param {Object} item - The entity to remove
	 */
	remove: function(item){
	    // Remove from selection if currently selected
	    item.selected = false;
	    for (var i = game.selectedItems.length - 1; i >= 0; i--){
	           if(game.selectedItems[i].uid == item.uid){
	               game.selectedItems.splice(i, 1);
	               break;
	           }
	    };

	    // Remove from main entity list
	    for (var i = game.items.length - 1; i >= 0; i--){
	        if(game.items[i].uid == item.uid){
	            game.items.splice(i, 1);
	            break;
	        }
	    };

	    // Remove from type-specific list
	    for (var i = game[item.type].length - 1; i >= 0; i--){
	        if(game[item.type][i].uid == item.uid){
	            game[item.type].splice(i, 1);
	            break;
	        }
	    };   
	    
	    // Remove from sorted items list
	    for (var i = game.sortedItems.length - 1; i >= 0; i--){
	        if(game.sortedItems[i].uid == item.uid){
	            game.sortedItems.splice(i, 1);
	            break;
	        }
	    };
	
	    // Invalidate pathfinding cache if removing buildings or terrain
	    if(item.type == "buildings" || item.type == "terrain"){
	        game.currentMapPassableGrid = undefined;
	    }	 
	},
	
	// ========================================
	// SELECTION SYSTEM
	// ========================================
	
	/**
	 * SELECTION VISUAL STYLING
	 * Colors and appearance for selected units and health bars.
	 */
	selectionBorderColor: "rgba(255,255,0,0.5)",      // Yellow border for selected units
	selectionFillColor: "rgba(255,215,0,0.2)",        // Light yellow fill
	healthBarBorderColor: "rgba(0,0,0,0.8)",          // Black border for health bars
	healthBarHealthyFillColor: "rgba(0,255,0,0.5)",   // Green for healthy units
	healthBarDamagedFillColor: "rgba(255,0,0,0.5)",   // Red for damaged units
	lifeBarHeight: 5,                                  // Height of health bar in pixels
	
	/**
	 * CLEAR ALL SELECTIONS
	 * Deselects all currently selected units.
	 */
	clearSelection: function(){
	    while(game.selectedItems.length > 0){
	        game.selectedItems.pop().selected = false;
	    }
	},
	
	/**
	 * SELECT A GAME ENTITY
	 * Handles unit selection with support for multi-selection and deselection.
	 * 
	 * @param {Object} item - The entity to select
	 * @param {boolean} shiftPressed - Whether shift key is held (for multi-selection)
	 */
	selectItem: function(item, shiftPressed){
	    // SHIFT+CLICK on selected item = deselect it
	    if (shiftPressed && item.selected){
	        item.selected = false;
	        for (var i = game.selectedItems.length - 1; i >= 0; i--){
	            if(game.selectedItems[i].uid == item.uid){
	                game.selectedItems.splice(i, 1);
	                break;
	            }
	        };            
	        return;
	    }

	    // Select the item if it's selectable and not already selected
	    if (item.selectable && !item.selected){
	        item.selected = true;
	        game.selectedItems.push(item);            
	    }
	},
	
	/**
	 * SEND COMMAND TO SELECTED UNITS
	 * Routes commands to either singleplayer or multiplayer system.
	 * 
	 * @param {Array} uids - Array of unit IDs to command
	 * @param {Object} details - Command details (move, attack, build, etc.)
	 */
	sendCommand: function(uids, details){
		if (game.type == "singleplayer"){
			 singleplayer.sendCommand(uids, details);
		} else {
			multiplayer.sendCommand(uids, details);
		}
	},
	
	/**
	 * FIND ENTITY BY UNIQUE ID
	 * Searches all game entities for one with matching UID.
	 * 
	 * @param {number} uid - Unique identifier to search for
	 * @returns {Object|null} The found entity or null if not found
	 */
	getItemByUid: function(uid){
	    for (var i = game.items.length - 1; i >= 0; i--){
	        if(game.items[i].uid == uid){
	            return game.items[i];
	        }
	    };
	},
	
	/**
	 * ATTACK TARGET INDICATORS
	 * Visual feedback system for attack commands
	 */
	attackTargetIndicators: [],
	
	/**
	 * ADD ATTACK TARGET INDICATOR
	 * Creates a visual indicator on the target of an attack command
	 * 
	 * @param {Object} target - The target entity to highlight
	 */
	addAttackTargetIndicator: function(target) {
		if (!target || target.lifeCode === "dead") {
			return;
		}
		
		var indicator = {
			target: target,
			startTime: Date.now(),
			duration: 1000, // 1 second
			alpha: 1.0
		};
		
		game.attackTargetIndicators.push(indicator);
	},
	
	/**
	 * UPDATE ATTACK TARGET INDICATORS
	 * Updates and removes expired indicators
	 */
	updateAttackTargetIndicators: function() {
		var currentTime = Date.now();
		
		for (var i = game.attackTargetIndicators.length - 1; i >= 0; i--) {
			var indicator = game.attackTargetIndicators[i];
			var elapsed = currentTime - indicator.startTime;
			
			if (elapsed >= indicator.duration) {
				// Remove expired indicator
				game.attackTargetIndicators.splice(i, 1);
			} else {
				// Update alpha for fade effect
				indicator.alpha = 1.0 - (elapsed / indicator.duration);
			}
		}
	},
	
	/**
	 * DRAW ATTACK TARGET INDICATORS
	 * Renders all active attack target indicators
	 */
	drawAttackTargetIndicators: function() {
		for (var i = 0; i < game.attackTargetIndicators.length; i++) {
			var indicator = game.attackTargetIndicators[i];
			var target = indicator.target;
			
			if (!target || target.lifeCode === "dead") {
				continue;
			}
			
			if (target.type === "buildings") {
				// Draw red rectangle for buildings
				game.drawBuildingAttackIndicator(target, indicator.alpha);
			} else {
				// Draw red circle for units
				game.drawUnitAttackIndicator(target, indicator.alpha);
			}
		}
	},
	
	/**
	 * DRAW BUILDING ATTACK INDICATOR
	 * Draws a red rectangle around a building target
	 * 
	 * @param {Object} building - The building target
	 * @param {number} alpha - Transparency value (0-1)
	 */
	drawBuildingAttackIndicator: function(building, alpha) {
		// Use the same positioning logic as building selection rectangles
		var x = building.drawingX + building.pixelOffsetX;
		var y = building.drawingY + building.pixelOffsetY;
		
		game.foregroundContext.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
		game.foregroundContext.lineWidth = 1.5;
		game.foregroundContext.fillStyle = `rgba(255, 0, 0, ${alpha * 0.2})`;
		game.foregroundContext.fillRect(x - 2, y - 2, building.baseWidth + 4, building.baseHeight + 4);
		game.foregroundContext.strokeRect(x - 2, y - 2, building.baseWidth + 4, building.baseHeight + 4);
	},
	
	/**
	 * DRAW UNIT ATTACK INDICATOR
	 * Draws a red circle around a unit target
	 * 
	 * @param {Object} unit - The unit target
	 * @param {number} alpha - Transparency value (0-1)
	 */
	drawUnitAttackIndicator: function(unit, alpha) {
		// Use the same positioning logic as selection circles (including movement interpolation)
		var x = unit.drawingX + unit.pixelOffsetX;
		var y = unit.drawingY + unit.pixelOffsetY;
		
		game.foregroundContext.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
		game.foregroundContext.lineWidth = 1.5;
		game.foregroundContext.fillStyle = `rgba(255, 0, 0, ${alpha * 0.2})`;
		game.foregroundContext.beginPath();
		game.foregroundContext.arc(x, y, unit.radius + 2, 0, Math.PI * 2, false);
		game.foregroundContext.fill();
		game.foregroundContext.stroke();
	},
	
	/**
	 * PROCESS COMMAND FOR UNITS
	 * Receives commands from singleplayer/multiplayer and assigns them to units.
	 * Handles target resolution and command validation.
	 * 
	 * @param {Array} uids - Array of unit IDs to command
	 * @param {Object} details - Command details including target information
	 */
	processCommand: function(uids, details){
		console.log("=== PROCESS COMMAND DEBUG ===");
		console.log("Processing command:", details.type);
		console.log("Target UIDs:", uids);
		console.log("Command details:", details);
		
		// Resolve target object if command includes a target UID
		var toObject;	
		if (details.toUid){
			toObject = game.getItemByUid(details.toUid);
			if(!toObject || toObject.lifeCode == "dead"){	
				// Target no longer exists - invalid command			
				console.error("Target object not found or dead:", details.toUid);
				return;
			}
		}

		// Add attack target indicator if this is an attack command
		if (details.type === "attack" && toObject) {
			game.addAttackTargetIndicator(toObject);
		}

		// Assign command to each specified unit
		for (var i in uids){
			var uid = uids[i];
			var item = game.getItemByUid(uid);
			console.log("Processing UID:", uid, "Item found:", !!item);
			// Set the order for valid units
			if(item){
				console.log("Setting order on item:", item.name, "type:", item.orders.type);
				item.orders = $.extend([], details);	
				if(toObject) {
					item.orders.to = toObject;					
				}
				console.log("Order set successfully");
			} else {
				console.error("Item not found for UID:", uid);
			}
		};
		console.log("=== END PROCESS COMMAND DEBUG ===");
	},
	
	// ========================================
	// MOVEMENT AND PATHFINDING
	// ========================================
	
	/**
	 * MOVEMENT SPEED ADJUSTMENT FACTORS
	 * These factors convert game units to pixel movement per frame.
	 * Lower values = slower movement, higher values = faster movement.
	 */
	speedAdjustmentFactor: 1/64,      // For forward/backward movement
	turnSpeedAdjustmentFactor: 1/8,   // For rotation/turning
	
	/**
	 * REBUILD PASSABLE GRID
	 * Recalculates which grid tiles are walkable by units.
	 * Called when buildings or terrain are added/removed.
	 * Uses A* pathfinding algorithm for efficient unit movement.
	 */
	rebuildPassableGrid: function(){
	    // Start with terrain grid (base walkable areas)
	    game.currentMapPassableGrid = $.extend(true, [], game.currentMapTerrainGrid);
	    
	    // Mark areas occupied by buildings and terrain as unwalkable
	    for (var i = game.items.length - 1; i >= 0; i--){
	        var item = game.items[i];
	        if(item.type == "buildings" || item.type == "terrain"){
	            // Apply the item's passable grid to the world grid
	            for (var y = item.passableGrid.length - 1; y >= 0; y--){
	                for (var x = item.passableGrid[y].length - 1; x >= 0; x--){
	                    if(item.passableGrid[y][x]){
	                        game.currentMapPassableGrid[item.y + y][item.x + x] = 1;
	                    }
	                };
	            };
	        }                            
	    };        
	}, 
	
	/**
	 * REBUILD BUILDABLE GRID
	 * Recalculates which grid tiles are available for building placement.
	 * Prevents buildings from being placed on occupied areas.
	 */
	rebuildBuildableGrid: function(){
	    // Start with terrain grid
	    game.currentMapBuildableGrid = $.extend(true, [], game.currentMapTerrainGrid);
	    
	    // Mark areas occupied by buildings, terrain, and vehicles as unbuildable
	    for (var i = game.items.length - 1; i >= 0; i--){
	        var item = game.items[i];
	        if(item.type == "buildings" || item.type == "terrain"){
	            // Apply building/terrain buildable grid
	            for (var y = item.buildableGrid.length - 1; y >= 0; y--){
	                for (var x = item.buildableGrid[y].length - 1; x >= 0; x--){
	                    if(item.buildableGrid[y][x]){
	                        game.currentMapBuildableGrid[item.y + y][item.x + x] = 1;
	                    }
	                };
	            };
	        } else if (item.type == "vehicles"){    
	            // Mark area around vehicles as unbuildable
	            // This prevents buildings from being placed on moving units
	            var radius = item.radius / game.gridSize;
	            var x1 = Math.max(Math.floor(item.x - radius), 0);
	            var x2 = Math.min(Math.floor(item.x + radius), game.currentLevel.mapGridWidth - 1);
	            var y1 = Math.max(Math.floor(item.y - radius), 0);
	            var y2 = Math.min(Math.floor(item.y + radius), game.currentLevel.mapGridHeight - 1);
	            for (var x = x1; x <= x2; x++) {
	                for (var y = y1; y <= y2; y++) {
	                    game.currentMapBuildableGrid[y][x] = 1;
	                };
	            };
	        }                            
	    };        
	},
	
	// ========================================
	// COMMUNICATION SYSTEM
	// ========================================
	
	/**
	 * CHARACTER DEFINITIONS
	 * Defines the different characters that can send messages to the player.
	 * Each character has a name and portrait image.
	 */
	characters: {
	    "system": {
	        "name": "System",
	        "image": "images/characters/system.png"
	    },
	    "op": {
	        "name": "Operator",
	        "image": "images/characters/girl1.png"
	    },
	    "pilot": {
	        "name": "Pilot",
	        "image": "images/characters/girl2.png"
	    },
	    "driver": {
	        "name": "Driver",
	        "image": "images/characters/man1.png"
	    }            
	},
	
	/**
	 * SHOW MESSAGE TO PLAYER
	 * Displays a message from a character with optional portrait.
	 * Messages appear in the game interface and auto-scroll.
	 * 
	 * @param {string} from - Character ID sending the message
	 * @param {string} message - The message text to display
	 */
	showMessage: function(from, message){
		// Play message notification sound
		sounds.play('message-received');
		
	    // Look up character details
	    var character = game.characters[from];        
	    if (character){
	        from = character.name;
	        // Display character portrait if available
	        if (character.image){
	            $('#callerpicture').html('<img src="' + character.image + '"/>');
	            // Hide portrait after 6 seconds
	            setTimeout(function(){
	                $('#callerpicture').html("");
	            }, 6000)    
	        }
	    }
	    
	    // Add message to the message log and scroll to bottom
	    var existingMessage = $('#gamemessages').html();
	    var newMessage = existingMessage + '<span>' + from + ': </span>' + message + '<br>';
	    $('#gamemessages').html(newMessage);
	    $('#gamemessages').animate({scrollTop: $('#gamemessages').prop('scrollHeight')});
	    
	    console.log("Message displayed:", from + ": " + message);
	},
	
	// ========================================
	// MESSAGE BOX SYSTEM
	// ========================================
	
	/**
	 * MESSAGE BOX CALLBACKS
	 * Store callback functions for message box OK/Cancel buttons.
	 */
	messageBoxOkCallback: undefined,
	messageBoxCancelCallback: undefined,
	
	/**
	 * SHOW MESSAGE BOX
	 * Displays a modal dialog box with optional OK/Cancel buttons.
	 * Used for important player decisions or notifications.
	 * 
	 * @param {string} message - The message to display
	 * @param {Function} onOK - Callback function for OK button (optional)
	 * @param {Function} onCancel - Callback function for Cancel button (optional)
	 */
	showMessageBox: function(message, onOK, onCancel){
	    // Set the message text
	    $('#messageboxtext').html(message);

	    // Configure OK button callback
	    if(!onOK){
	        game.messageBoxOkCallback = undefined;                
	    } else {
	        game.messageBoxOkCallback = onOK;
	    }    

	    // Configure Cancel button callback and visibility
	    if(!onCancel){
	        game.messageBoxCancelCallback = undefined;            
	        $("#messageboxcancel").hide();
	    } else {
	        game.messageBoxCancelCallback = onCancel;
	        $("#messageboxcancel").show();
	    }

	    // Display the message box
	    $('#messageboxscreen').show();                
	},
	
	/**
	 * MESSAGE BOX OK BUTTON HANDLER
	 * Called when player clicks OK in message box.
	 */
	messageBoxOK: function(){
	    $('#messageboxscreen').hide();
	    if(game.messageBoxOkCallback){
	        game.messageBoxOkCallback()
	    }            
	},
	
	/**
	 * MESSAGE BOX CANCEL BUTTON HANDLER
	 * Called when player clicks Cancel in message box.
	 */
	messageBoxCancel: function(){
	    $('#messageboxscreen').hide();
	    if(game.messageBoxCancelCallback){
	        game.messageBoxCancelCallback();
	    }            
	},
	
	// ========================================
	// TRIGGER SYSTEM
	// ========================================
	
	/**
	 * INITIALIZE TRIGGER
	 * Sets up a game trigger that can fire based on time or conditions.
	 * Triggers are used for scripted events, AI behavior, and level progression.
	 * 
	 * @param {Object} trigger - Trigger configuration object
	 */
	initTrigger: function(trigger){
	    console.log("Initializing trigger:", trigger.type, trigger);
	    if(trigger.type == "timed"){
	        // Timed trigger: fires after a specific delay
	        trigger.timeout = setTimeout(function(){
	            console.log("Executing timed trigger after", trigger.time, "ms");
	            game.runTrigger(trigger);
	        }, trigger.time)
	    } else if(trigger.type == "conditional"){
	        // Conditional trigger: checks condition every second
	        trigger.interval = setInterval(function(){
	            game.runTrigger(trigger);
	        }, 1000)
	    }
	},
	
	/**
	 * RUN TRIGGER
	 * Executes a trigger's action when conditions are met.
	 * 
	 * @param {Object} trigger - The trigger to execute
	 */
	runTrigger: function(trigger){
	    console.log("Running trigger:", trigger.type);
	    if(trigger.type == "timed"){
	        // Re-initialize timed trigger if it should repeat
	        if (trigger.repeat){
	            game.initTrigger(trigger);
	        }
	        // Execute the trigger's action
	        console.log("Executing trigger action");
	        trigger.action(trigger);
	    } else if (trigger.type == "conditional"){
	        // Check if condition is satisfied
	        if(trigger.condition()){
	            // Clear the trigger (one-time execution)
	            game.clearTrigger(trigger);
	            // Execute the trigger's action
	            trigger.action(trigger);    
	        } 
	    }
	},
	
	/**
	 * CLEAR TRIGGER
	 * Removes a trigger from the system, stopping its execution.
	 * 
	 * @param {Object} trigger - The trigger to clear
	 */
	clearTrigger: function(trigger){
	    if(trigger.type == "timed"){
	        clearTimeout(trigger.timeout);
	    } else if (trigger.type == "conditional"){
	        clearInterval(trigger.interval);
	    }
	},    
	
	/**
	 * END GAME
	 * Cleanup function called when game ends.
	 * Stops all triggers and halts the game loop.
	 */
	end: function(){
	    // Clear all active triggers to prevent memory leaks
	    if (game.currentLevel.triggers){
	        for (var i = game.currentLevel.triggers.length - 1; i >= 0; i--){
	            game.clearTrigger(game.currentLevel.triggers[i]);
	        };
	    }
	    // Stop the game loop
	    game.running = false;    
	}
	
}