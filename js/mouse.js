/**
 * LAST COLONY - MOUSE INPUT HANDLING SYSTEM
 * =========================================
 * 
 * This file manages all mouse input for the game, including:
 * - Mouse position tracking and coordinate conversion
 * - Click detection and command processing
 * - Drag selection for unit groups
 * - Building placement preview
 * - Context menu (right-click) handling
 * 
 * COORDINATE SYSTEMS:
 * - Screen coordinates (x, y): Mouse position relative to canvas
 * - Game coordinates (gameX, gameY): Position in the game world
 * - Grid coordinates (gridX, gridY): Position in the tile grid system
 * 
 * INTERACTION PATTERNS:
 * - Left Click: Select units, confirm building placement
 * - Right Click: Issue commands (move, attack, guard, deploy)
 * - Drag: Select multiple units in a rectangular area
 * - Shift + Click: Add/remove units from selection
 * 
 * DESIGN PATTERNS:
 * - Observer Pattern: Mouse events trigger game actions
 * - State Machine: Different interaction modes (normal, building placement)
 * - Command Pattern: Mouse actions create unit commands
 */

/**
 * MOUSE INPUT MANAGER
 * Central object that handles all mouse-related functionality.
 * Maintains mouse state and coordinates across different coordinate systems.
 */
var mouse = {
    // ========================================
    // MOUSE STATE PROPERTIES
    // ========================================
    
    /**
     * SCREEN COORDINATES
     * Mouse position relative to the top-left corner of the game canvas.
     * These are the raw pixel coordinates from the browser.
     */
    x: 0,
    y: 0,
    
    /**
     * GAME WORLD COORDINATES
     * Mouse position in the game world, accounting for camera offset.
     * Used for determining what the player is clicking on in the game world.
     */
    gameX: 0,
    gameY: 0,
    
    /**
     * GRID COORDINATES
     * Mouse position converted to the game's tile grid system.
     * Each grid tile is 20x20 pixels, used for pathfinding and building placement.
     */
    gridX: 0,
    gridY: 0,
    
    /**
     * MOUSE BUTTON STATE
     * Whether the left mouse button is currently being held down.
     * Used for drag selection and continuous interaction.
     */
    buttonPressed: false,
    
    /**
     * DRAG SELECTION STATE
     * Whether the player is currently dragging to select multiple units.
     * Activated when mouse moves more than 4 pixels while button is pressed.
     */
    dragSelect: false,
    
    /**
     * CANVAS HOVER STATE
     * Whether the mouse cursor is currently inside the game canvas.
     * Used to disable camera panning when mouse leaves the game area.
     */
    insideCanvas: false,
    
    // ========================================
    // CLICK HANDLING
    // ========================================
    
    	/**
	 * HANDLE MOUSE CLICK
	 * Processes all mouse clicks and converts them into game actions.
	 * Supports both left-click (selection) and right-click (commands).
	 * 
	 * @param {Event} ev - The mouse event object from the browser
	 * @param {boolean} rightClick - Whether this is a right-click (context menu)
	 * 
	 * TEST: testsuite/tests/input-tests.js - "Click events are properly detected and validated"
	 */
	click: function(ev, rightClick){
	    // Get the game object under the mouse cursor
	    var clickedItem = this.itemUnderMouse();
	    var shiftPressed = ev.shiftKey;

	    if (!rightClick){ 
	        // ========================================
	        // LEFT CLICK HANDLING (SELECTION)
	        // ========================================
	        
			if (game.deployBuilding){
				// BUILDING PLACEMENT MODE
				// If the game is in building placement mode, left click deploys the building
				console.log("=== BUILDING PLACEMENT CLICK DEBUG ===");
				console.log("Building placement mode active:", game.deployBuilding);
				console.log("Can deploy building:", game.canDeployBuilding);
				console.log("Mouse grid position:", mouse.gridX, mouse.gridY);
				console.log("Mouse game position:", mouse.gameX, mouse.gameY);
				
				if(game.canDeployBuilding){
					console.log("Attempting to deploy building...");
					sidebar.finishDeployingBuilding();
				} else {
					console.log("Cannot deploy building here - showing warning");
					game.showMessage("system", "Warning! Cannot deploy building here.");
				}
				console.log("=== END BUILDING PLACEMENT CLICK DEBUG ===");
				return;
			}

	        // NORMAL SELECTION MODE
	        if (clickedItem){                
	            // Handle unit selection with shift key support
	            // Shift + click adds to existing selection, normal click clears selection
	            if(!shiftPressed){
	                game.clearSelection();
	            }
	            game.selectItem(clickedItem, shiftPressed);
	        }
	    } else { 
	        // ========================================
	        // RIGHT CLICK HANDLING (COMMANDS)
	        // ========================================
	        
	        if (game.deployBuilding){
				// CANCEL BUILDING PLACEMENT
				// Right click cancels building placement mode
	            sidebar.cancelDeployingBuilding();
	            return;
	        }	        
			
			// PROCESS UNIT COMMANDS
			// Right click issues commands to selected units based on what was clicked
			var uids = [];			
			
			if (clickedItem){ 
			    // CLICKED ON A GAME OBJECT
			    
				if (clickedItem.type != "terrain"){					
					if (clickedItem.team != game.team){ 
					    // ATTACK ENEMY
					    // Player right-clicked on an enemy unit/building
					    // Find all selected units that can attack and command them to attack
						for (var i = game.selectedItems.length - 1; i >= 0; i--){
							var item = game.selectedItems[i];							
							if(item.team == game.team && item.canAttack){
								uids.push(item.uid);
							}
						};
						
						// Issue attack command to all capable units
						if (uids.length > 0){
							game.sendCommand(uids, {type: "attack", toUid: clickedItem.uid});
							sounds.play("acknowledge-attacking");
						}
					} else { 
					    // GUARD FRIENDLY
					    // Player right-clicked on a friendly unit/building
					    // Find all selected mobile units and command them to guard
						for (var i = game.selectedItems.length - 1; i >= 0; i--){
							var item = game.selectedItems[i];
							if(item.team == game.team && (item.type == "vehicles" || item.type == "aircraft")){
								uids.push(item.uid);
							}
						};
						
						// Issue guard command to all mobile units
						if (uids.length > 0){
							game.sendCommand(uids, {type: "guard", toUid: clickedItem.uid});
							sounds.play("acknowledge-moving");
						}
					}
				} else if (clickedItem.name == "oilfield"){ 
				    // DEPLOY HARVESTER
				    // Player right-clicked on an oil field
				    // Find the first selected harvester and command it to deploy
					for (var i = game.selectedItems.length - 1; i >= 0; i--){
						var item = game.selectedItems[i];						
						if(item.team == game.team && (item.type == "vehicles" && item.name == "harvester")){
							uids.push(item.uid);
							break; // Only deploy one harvester at a time
						}
					};
					
					// Issue deploy command to the harvester
					if (uids.length > 0){					
						game.sendCommand(uids, {type: "deploy", toUid: clickedItem.uid});
						sounds.play("acknowledge-moving");
					}
				} 
			} else { 
			    // CLICKED ON EMPTY GROUND
			    // Player right-clicked on empty space - command units to move there
			    
			    // Find all selected mobile units
				for (var i = game.selectedItems.length - 1; i >= 0; i--){
					var item = game.selectedItems[i];
					if(item.team == game.team && (item.type == "vehicles" || item.type == "aircraft")){
						uids.push(item.uid);
					}
				};
				
				// Issue move command to the clicked location
				if (uids.length > 0){
					game.sendCommand(uids, {
					    type: "move", 
					    to: {
					        x: mouse.gameX / game.gridSize, 
					        y: mouse.gameY / game.gridSize
					    }
					});
					sounds.play("acknowledge-moving");
				}
			}
	    }
	},
	
	// ========================================
	// OBJECT DETECTION
	// ========================================
	
	/**
	 * FIND OBJECT UNDER MOUSE
	 * Determines which game object (if any) is under the mouse cursor.
	 * Uses different collision detection methods for different object types.
	 * 
	 * Collision Detection Methods:
	 * - Buildings/Terrain: Rectangle collision (accounting for size)
	 * - Aircraft: Circle collision with height offset (for shadow)
	 * - Units: Circle collision at ground level
	 * 
	 * @returns {Object|null} The game object under the mouse, or null if none
	 */
	itemUnderMouse: function(){
		// Don't detect objects under fog of war
		if(fog.isPointOverFog(mouse.gameX, mouse.gameY)){
	        return;
	    }	    
	
	    // Search through all game objects (back to front for proper layering)
	    for (var i = game.items.length - 1; i >= 0; i--){
	        var item = game.items[i];
	        
	        // Skip dead objects
	        if (item.lifeCode == "dead") continue;
	        
	        if (item.type == "buildings" || item.type == "terrain"){
	            // RECTANGLE COLLISION FOR BUILDINGS AND TERRAIN
	            // Buildings and terrain have rectangular footprints
	            if(item.x <= (mouse.gameX) / game.gridSize 
	                && item.x >= (mouse.gameX - item.baseWidth) / game.gridSize
	                && item.y <= mouse.gameY / game.gridSize 
	                && item.y >= (mouse.gameY - item.baseHeight) / game.gridSize
	                ){
	                    return item;
	            }
	        } else if (item.type == "aircraft"){
	            // CIRCLE COLLISION FOR AIRCRAFT WITH HEIGHT OFFSET
	            // Aircraft appear to float above ground, so we check their shadow position
	            var aircraftX = item.x - mouse.gameX / game.gridSize;
	            var aircraftY = (item.y - (mouse.gameY + item.pixelShadowHeight) / game.gridSize);
	            var distanceSquared = aircraftX * aircraftX + aircraftY * aircraftY;
	            var radiusSquared = (item.radius / game.gridSize) * (item.radius / game.gridSize);
	            
	            if (distanceSquared < radiusSquared){
	                return item;
	            }
	       } else {
	            // CIRCLE COLLISION FOR GROUND UNITS
	            // Standard circular collision detection for vehicles and other units
	            var unitX = item.x - mouse.gameX / game.gridSize;
	            var unitY = item.y - mouse.gameY / game.gridSize;
	            var distanceSquared = unitX * unitX + unitY * unitY;
	            var radiusSquared = (item.radius / game.gridSize) * (item.radius / game.gridSize);
	            
	            if (distanceSquared < radiusSquared){
	                return item;
	            }
	        }
	    }
	},
	
	// ========================================
	// VISUAL FEEDBACK
	// ========================================
	
	/**
	 * DRAW MOUSE VISUALS
	 * Renders visual feedback for mouse interactions.
	 * Includes drag selection rectangle and building placement preview.
	 */
	draw: function(){
	    // DRAW DRAG SELECTION RECTANGLE
	    if(this.dragSelect){    
	        var x = Math.min(this.gameX, this.dragX);
	        var y = Math.min(this.gameY, this.dragY);
	        var width = Math.abs(this.gameX - this.dragX);
	        var height = Math.abs(this.gameY - this.dragY);
	        
	        // Draw white rectangle showing selection area
	        game.foregroundContext.strokeStyle = 'white';
	        game.foregroundContext.strokeRect(
	            x - game.offsetX, 
	            y - game.offsetY, 
	            width, 
	            height
	        );
	    }    
	    
	    // DRAW BUILDING PLACEMENT PREVIEW
	    if (game.deployBuilding && game.placementGrid){
	        var buildingType = buildings.list[game.deployBuilding];
	        var x = (this.gridX * game.gridSize) - game.offsetX;
	        var y = (this.gridY * game.gridSize) - game.offsetY;
	        
	        // Draw colored grid showing where building will be placed
	        for (var i = game.placementGrid.length - 1; i >= 0; i--){
	            for (var j = game.placementGrid[i].length - 1; j >= 0; j--){                    
	                if(game.placementGrid[i][j]){
	                    // Blue = valid placement location
	                    game.foregroundContext.fillStyle = "rgba(0,0,255,0.3)";                        
	                } else {
	                    // Red = invalid placement location
	                    game.foregroundContext.fillStyle = "rgba(255,0,0,0.3)";
	                }
	                game.foregroundContext.fillRect(
	                    x + j * game.gridSize, 
	                    y + i * game.gridSize, 
	                    game.gridSize, 
	                    game.gridSize
	                );
	            };
	        };        
	    }
	},
	
	// ========================================
	// COORDINATE CONVERSION
	// ========================================
	
	/**
	 * CALCULATE GAME COORDINATES
	 * Converts screen coordinates to game world coordinates.
	 * Accounts for camera offset and converts to grid coordinates.
	 */
	calculateGameCoordinates: function(){
		// Convert screen coordinates to game world coordinates
		mouse.gameX = mouse.x + game.offsetX;
		mouse.gameY = mouse.y + game.offsetY;

		// Convert game coordinates to grid coordinates
		mouse.gridX = Math.floor((mouse.gameX) / game.gridSize);
		mouse.gridY = Math.floor((mouse.gameY) / game.gridSize);	
	},
	
	// ========================================
	// EVENT HANDLER SETUP
	// ========================================
	
	/**
	 * INITIALIZE MOUSE SYSTEM
	 * Sets up all mouse event handlers and initializes the input system.
	 * This is called once when the game starts.
	 */
    init: function(){
        var $mouseCanvas = $("#gameforegroundcanvas");
        
        // MOUSE MOVE HANDLER
        // Tracks mouse position and handles drag selection
        $mouseCanvas.mousemove(function(ev) {
            // Calculate mouse position relative to canvas
            var offset = $mouseCanvas.offset();
            mouse.x = ev.pageX - offset.left;
            mouse.y = ev.pageY - offset.top;  
            
            // Convert to game coordinates
            mouse.calculateGameCoordinates();

            // Handle drag selection
            if (mouse.buttonPressed){
                // Start drag selection if mouse moves more than 4 pixels
                if ((Math.abs(mouse.dragX - mouse.gameX) > 4 || Math.abs(mouse.dragY - mouse.gameY) > 4)){
                        mouse.dragSelect = true;
                }
            } else {
                mouse.dragSelect = false;
            }                     
        });
        
        // LEFT CLICK HANDLER
        // Handles unit selection and building placement confirmation
        $mouseCanvas.click(function(ev) {
            mouse.click(ev, false);
            mouse.dragSelect = false;                
            return false; // Prevent default browser behavior
        });
        
        // MOUSE DOWN HANDLER
        // Initiates drag selection and tracks drag start position
        $mouseCanvas.mousedown(function(ev) {
            if(ev.which == 1){ // Left mouse button only
                mouse.buttonPressed = true;
                mouse.dragX = mouse.gameX;
                mouse.dragY = mouse.gameY;
                ev.preventDefault();
            }
            return false;
        });
        
        // RIGHT CLICK HANDLER (CONTEXT MENU)
        // Handles unit commands and building placement cancellation
        $mouseCanvas.bind('contextmenu', function(ev){
            mouse.click(ev, true);
            return false; // Prevent default context menu
        });
        
        // MOUSE UP HANDLER
        // Completes drag selection and processes multi-unit selection
		$mouseCanvas.mouseup(function(ev) {
		    var shiftPressed = ev.shiftKey;
		    if(ev.which == 1){ // Left mouse button only
		        if (mouse.dragSelect){
		            // PROCESS DRAG SELECTION
		            // Calculate selection rectangle bounds
		            var x1 = Math.min(mouse.gameX, mouse.dragX) / game.gridSize;
		            var y1 = Math.min(mouse.gameY, mouse.dragY) / game.gridSize;
		            var x2 = Math.max(mouse.gameX, mouse.dragX) / game.gridSize;
		            var y2 = Math.max(mouse.gameY, mouse.dragY) / game.gridSize;
		            
		            // If shift is not held, unselect units outside the selection box
		            if (!shiftPressed){
		                // First, unselect all currently selected units that are outside the selection box
		                for (var i = game.selectedItems.length - 1; i >= 0; i--){
		                    var selectedItem = game.selectedItems[i];
		                    var isInSelectionBox = false;
		                    
		                    // Check if the selected item is within the selection rectangle
		                    if (selectedItem.type != "buildings" && 
		                        x1 <= selectedItem.x && x2 >= selectedItem.x){
		                        
		                        if ((selectedItem.type == "vehicles" && y1 <= selectedItem.y && y2 >= selectedItem.y)
		                        || (selectedItem.type == "aircraft" && 
		                            (y1 <= selectedItem.y - selectedItem.pixelShadowHeight / game.gridSize) && 
		                            (y2 >= selectedItem.y - selectedItem.pixelShadowHeight / game.gridSize))){
		                            isInSelectionBox = true;
		                        }
		                    }
		                    
		                    // If unit is outside selection box, unselect it
		                    if (!isInSelectionBox){
		                        selectedItem.selected = false;
		                        game.selectedItems.splice(i, 1);
		                    }
		                }
		            }

		            // Select all units within the rectangle
		            for (var i = game.items.length - 1; i >= 0; i--){
		                var item = game.items[i];
		                
		                // Only select friendly, selectable, non-building units
		                if (item.type != "buildings" && item.selectable && item.team == game.team && 
		                    x1 <= item.x && x2 >= item.x){
		                    
		                    // Different selection logic for ground units vs aircraft
		                    if ((item.type == "vehicles" && y1 <= item.y && y2 >= item.y)
		                    || (item.type == "aircraft" && 
		                        (y1 <= item.y - item.pixelShadowHeight / game.gridSize) && 
		                        (y2 >= item.y - item.pixelShadowHeight / game.gridSize))){
		                        game.selectItem(item, shiftPressed);
		                    }
		                } 
		            };
		        }
		        
		        // Reset mouse state
		        mouse.buttonPressed = false;
		        mouse.dragSelect = false;
		    }
		    return false;
		});

        // MOUSE LEAVE HANDLER
        // Disables camera panning when mouse leaves canvas
        $mouseCanvas.mouseleave(function(ev) {
            mouse.insideCanvas = false;
        });
        
        // MOUSE ENTER HANDLER
        // Re-enables interaction when mouse returns to canvas
        $mouseCanvas.mouseenter(function(ev) {
            mouse.buttonPressed = false;
            mouse.insideCanvas = true;
        });
    }
}
