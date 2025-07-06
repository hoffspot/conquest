var sidebar = {
	enableSidebarButtons:function(){
		// Buttons only enabled when appropriate building is selected
		$("#gameinterfacescreen #sidebarbuttons input[type='button'] ").attr("disabled", true);		
		
		// If no building selected, then no point checking below
		if (game.selectedItems.length==0){		
			return;
		}
		var baseSelected = false;
		var starportSelected = false;
		// Check if base or starport is selected
		for (var i = game.selectedItems.length - 1; i >= 0; i--){
			var item = game.selectedItems[i];			
			//  Check If player selected a healthy,inactive building (damaged buildings can't produce)
			if (item.type == "buildings" && item.team == game.team && item.lifeCode == "healthy" && item.action=="stand"){				
				if(item.name == "base"){
					baseSelected = true;
				} else if (item.name == "starport"){
					starportSelected = true;
				}	
			}
		};	

		var cashBalance = game.cash[game.team];
		/* Enable building buttons if base is selected,building has been loaded in requirements, not in deploy building mode and player has enough money*/
		if (baseSelected && !game.deployBuilding){			
			if(game.currentLevel.requirements.buildings.indexOf('starport')>-1 && cashBalance>=buildings.list["starport"].cost){
				$("#starportbutton").removeAttr("disabled");
			}
			if(game.currentLevel.requirements.buildings.indexOf('ground-turret')>-1 && cashBalance>=buildings.list["ground-turret"].cost){
				$("#turretbutton").removeAttr("disabled");
			}			
		}

		/* Enable unit buttons if startport is selected, unit has been loaded in requirements, and player has enough money*/
		
		if (starportSelected){
			if(game.currentLevel.requirements.vehicles.indexOf('scout-tank')>-1 && cashBalance>=vehicles.list["scout-tank"].cost){
				$("#scouttankbutton").removeAttr("disabled");
			}
			if(game.currentLevel.requirements.vehicles.indexOf('heavy-tank')>-1 && cashBalance>=vehicles.list["heavy-tank"].cost){
				$("#heavytankbutton").removeAttr("disabled");
			}
			if(game.currentLevel.requirements.vehicles.indexOf('harvester')>-1 && cashBalance>=vehicles.list["harvester"].cost){
				$("#harvesterbutton").removeAttr("disabled");
			}
			if(game.currentLevel.requirements.aircraft.indexOf('chopper')>-1 && cashBalance>=aircraft.list["chopper"].cost){
				$("#chopperbutton").removeAttr("disabled");
			}
			if(game.currentLevel.requirements.aircraft.indexOf('wraith')>-1 && cashBalance>=aircraft.list["wraith"].cost){
				$("#wraithbutton").removeAttr("disabled");
			}	
		}
	},
	animate:function(){		
		// Display the current cash balance value		
		$('#cash').html(game.cash[game.team]);

		//  Enable or disable buttons as appropriate
		this.enableSidebarButtons();		

		if (game.deployBuilding){
			// Create the buildable grid to see where building can be placed
			game.rebuildBuildableGrid();	
			// Compare with buildable grid to see where we need to place the building
			var placementGrid = buildings.list[game.deployBuilding].buildableGrid;
			game.placementGrid = $.extend(true,[],placementGrid);
			game.canDeployBuilding = true;
			
			console.log("=== CAN DEPLOY BUILDING DEBUG ===");
			console.log("Deploy building:", game.deployBuilding);
			console.log("Mouse grid position:", mouse.gridX, mouse.gridY);
			console.log("Map dimensions:", game.currentLevel.mapGridWidth, "x", game.currentLevel.mapGridHeight);
			console.log("Placement grid:", game.placementGrid);
			
			for (var i = game.placementGrid.length - 1; i >= 0; i--){
				for (var j = game.placementGrid[i].length - 1; j >= 0; j--){					
					if(game.placementGrid[i][j] && 
						(mouse.gridY+i>= game.currentLevel.mapGridHeight || mouse.gridX+j>= game.currentLevel.mapGridWidth 
							|| game.currentMapBuildableGrid[mouse.gridY+i][mouse.gridX+j]==1 || fog.grid[game.team][mouse.gridY+i][mouse.gridX+j]==1)){
						
						console.log("Building placement blocked at grid position:", mouse.gridX+j, mouse.gridY+i);
						console.log("Reason: mapGridHeight exceeded:", mouse.gridY+i>= game.currentLevel.mapGridHeight);
						console.log("Reason: mapGridWidth exceeded:", mouse.gridX+j>= game.currentLevel.mapGridWidth);
						console.log("Reason: buildable grid blocked:", game.currentMapBuildableGrid[mouse.gridY+i][mouse.gridX+j]==1);
						console.log("Reason: fog of war:", fog.grid[game.team][mouse.gridY+i][mouse.gridX+j]==1);
						
						game.canDeployBuilding = false;
						game.placementGrid[i][j] = 0;
					}
				};
			};
			console.log("Final canDeployBuilding:", game.canDeployBuilding);
			console.log("=== END CAN DEPLOY BUILDING DEBUG ===");
		}		
	},
	init:function(){
		// Initialize unit construction buttons 
		$("#scouttankbutton").click(function(){
			sidebar.constructAtStarport({type:"vehicles","name":"scout-tank"});
		});
		$("#heavytankbutton").click(function(){
			sidebar.constructAtStarport({type:"vehicles","name":"heavy-tank"});
		});
		$("#harvesterbutton").click(function(){
			sidebar.constructAtStarport({type:"vehicles","name":"harvester"});
		});
		$("#chopperbutton").click(function(){
			sidebar.constructAtStarport({type:"aircraft","name":"chopper"});
		});
		$("#wraithbutton").click(function(){
			sidebar.constructAtStarport({type:"aircraft","name":"wraith"});
		});
		
		//Initialize building construction buttons
		$("#starportbutton").click(function(){
			game.deployBuilding = "starport";
			$("#starportbutton").addClass("selected");
			$("#turretbutton").removeClass("selected");
			game.showMessage("system", "Building placement mode: Left-click to place, Right-click or Escape to cancel");
		});
		$("#turretbutton").click(function(){
			game.deployBuilding = "ground-turret";
			$("#turretbutton").addClass("selected");
			$("#starportbutton").removeClass("selected");
			game.showMessage("system", "Building placement mode: Left-click to place, Right-click or Escape to cancel");
		});
	},
	constructAtStarport:function(unitDetails){
		var starport;
		// Find the first eligible starport among selected items
		for (var i = game.selectedItems.length - 1; i >= 0; i--){
			var item = game.selectedItems[i];
			if (item.type == "buildings" && item.name == "starport" 
				&& item.team == game.team && item.lifeCode == "healthy" && item.action=="stand"){
				starport = item;
				break;
			}
		};
		if (starport){
			game.sendCommand([starport.uid],{type:"construct-unit",details:unitDetails});
		}
	},
	cancelDeployingBuilding:function(){
	    game.deployBuilding = undefined;
	    this.clearBuildingButtonSelection();
	},
	
	/**
	 * CLEAR BUILDING BUTTON SELECTION
	 * Removes visual selection highlight from building buttons
	 */
	clearBuildingButtonSelection:function(){
	    // Remove any visual selection from building buttons
	    $("#starportbutton, #turretbutton").removeClass("selected");
	},
	finishDeployingBuilding:function(){
	    var buildingName= game.deployBuilding;        
	    var base;
	    
	    console.log("=== BUILDING PLACEMENT DEBUG ===");
	    console.log("Building to deploy:", buildingName);
	    console.log("Mouse position (grid):", mouse.gridX, mouse.gridY);
	    console.log("Can deploy building:", game.canDeployBuilding);
	    console.log("Selected items:", game.selectedItems.length);
	    
	    for (var i = game.selectedItems.length - 1; i >= 0; i--){
	        var item = game.selectedItems[i];
	        console.log("Selected item", i, ":", item.name, "type:", item.type, "team:", item.team, "lifeCode:", item.lifeCode, "action:", item.action);
	        if (item.type == "buildings" && item.name == "base" && item.team == game.team && item.lifeCode == "healthy" && item.action=="stand"){
	            base = item;
	            console.log("Found eligible base:", base.uid);
	            break;
	        }
	    };        

	    if (base){
	        var buildingDetails = {type:"buildings",name:buildingName,x:mouse.gridX,y:mouse.gridY};
	        console.log("Sending construct-building command:", buildingDetails);
	        console.log("Base UID:", base.uid);
	        game.sendCommand([base.uid],{type:"construct-building",details:buildingDetails});
	        console.log("Command sent successfully");
	    } else {
	        console.error("No eligible base found for building construction");
	        console.log("Requirements: type=buildings, name=base, team=" + game.team + ", lifeCode=healthy, action=stand");
	    }

	    // Clear deployBuilding flag and button selection
	    game.deployBuilding = undefined;
	    this.clearBuildingButtonSelection();
	    console.log("=== END BUILDING PLACEMENT DEBUG ===");
	}	
}
