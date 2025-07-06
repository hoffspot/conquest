var singleplayer = {
    // Begin single player campaign
    start:function(){
        // Hide the starting menu layer
        $('.gamelayer').hide();
        
        // Begin with the first level
        singleplayer.currentLevel = 0;
        game.type = "singleplayer";
        game.team = "blue";
                
        // Finally start the level
        singleplayer.startCurrentLevel();
    },    
    exit:function(){
        // Show the starting menu layer
        $('.gamelayer').hide();
        $('#gamestartscreen').show();
    },
    currentLevel:0,    
	startCurrentLevel:function(){                
	    // Load all the items for the level
	    var level = maps.singleplayer[singleplayer.currentLevel];

	    // Reset asset loader counters for new mission
	    loader.reset();

	    // Don't allow player to enter mission until all assets for the level are loaded
	    $("#entermission").attr("disabled", true);

	    // Load all the assets for the level
	    game.currentMapImage = loader.loadImage(level.mapImage);
	    game.currentLevel = level;

	    game.offsetX = level.startX * game.gridSize;
	    game.offsetY = level.startY * game.gridSize;

	    // Load level Requirements 
	    game.resetArrays();
	    for (var type in level.requirements){
	           var requirementArray = level.requirements[type];
	           for (var i=0; i < requirementArray.length; i++) {
	               var name = requirementArray[i];
	               if (window[type]){
	                   loadItem.call(window[type], name);
	               } else {
	                   console.log('Could not load type :',type);
	               }
	           };
	    };

	    console.log("Loading level items:", level.items.length, "items");
	    console.log("Available type managers:", {
	        buildings: typeof buildings !== 'undefined',
	        vehicles: typeof vehicles !== 'undefined', 
	        aircraft: typeof aircraft !== 'undefined',
	        terrain: typeof terrain !== 'undefined'
	    });
	    for (var i = level.items.length - 1; i >= 0; i--){
	        var itemDetails = level.items[i];
	                var item = game.add(itemDetails);
	    };        

	    // Create a grid that stores all obstructed tiles as 1 and unobstructed as 0
	    game.currentMapTerrainGrid = [];
	    for (var y=0; y < level.mapGridHeight; y++) {
	        game.currentMapTerrainGrid[y] = [];
	        for (var x=0; x< level.mapGridWidth; x++) {
	           game.currentMapTerrainGrid[y][x] = 0;
	        }
	    };
	    for (var i = level.mapObstructedTerrain.length - 1; i >= 0; i--){            
	        var obstruction = level.mapObstructedTerrain[i];
	        game.currentMapTerrainGrid[obstruction[1]][obstruction[0]] = 1;
	    };
	    game.currentMapPassableGrid = undefined;	

		// Load Starting Cash For Game
		game.cash = $.extend([],level.cash);
	
	    // Enable the enter mission button once all assets are loaded
	    if (loader.loaded){
	        $("#entermission").removeAttr("disabled");
	    } else {
	        loader.onload = function(){
	            $("#entermission").removeAttr("disabled");
	        }
	    }

	    // Load the mission screen with the current briefing
	    $('#missonbriefing').html(level.briefing.replace(/\n/g,'<br><br>'));   
	    $("#missionscreen").show();       
	},    
    play:function(){
        try {
            // Initialize fog of war system
            fog.initLevel();
            
            // Run initial animation loop
            game.animationLoop();
            
            // Set up the animation interval for regular updates
            game.animationInterval = setInterval(game.animationLoop, game.animationTimeout);
            
            // Start the game (this includes the drawing loop)
            game.start();
        } catch (error) {
            console.error("Error starting game:", error);
            // Try to clean up if there was an error
            if (game.animationInterval) {
                clearInterval(game.animationInterval);
                game.animationInterval = null;
            }
            game.running = false;
        }
    },   
	sendCommand:function(uids,details){
	    game.processCommand(uids,details);
	},
	endLevel:function(success){
	    clearInterval(game.animationInterval);
	    game.end();

	    if (success){
	        var moreLevels = (singleplayer.currentLevel < maps.singleplayer.length-1);
	        if (moreLevels){
	            game.showMessageBox("Mission Accomplished.",function(){
	                $('.gamelayer').hide();
	                singleplayer.currentLevel++;
	                singleplayer.startCurrentLevel();
	            });
	        } else {
	            game.showMessageBox("Mission Accomplished.<br><br>This was the last mission in the campaign.<br><br>Thank You for playing.",function(){
	                $('.gamelayer').hide();
	                $('#gamestartscreen').show();
	            });
	        }
	    } else {
	        game.showMessageBox("Mission Failed.<br><br>Try again?",function(){
	            $('.gamelayer').hide();
	            singleplayer.startCurrentLevel();
	        }, function(){
	            $('.gamelayer').hide();
	            $('#gamestartscreen').show();
	        });
	    }
	}
};
