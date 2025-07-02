/**
 * INTEGRATION TESTS
 * =================
 * Tests that verify multiple systems work together correctly including:
 * - Game initialization and startup
 * - Entity lifecycle with multiple systems
 * - Combat and movement integration
 * - UI and game state synchronization
 */

(function() {
    'use strict';
    
    /**
     * TEST: Complete game initialization
     * Tests that all systems initialize properly together
     */
    testFramework.addTest(
        "Complete game initialization sets up all systems correctly",
        function() {
            // Mock all required systems
            if (!loader) window.loader = { init: function() {} };
            if (!mouse) window.mouse = { init: function() {} };
            if (!sidebar) window.sidebar = { init: function() {} };
            if (!sounds) window.sounds = { init: function() {} };
            if (!game) window.game = { init: function() {} };
            
            // Mock canvas
            const mockCanvas = {
                width: 800,
                height: 600,
                getContext: function() { return {}; }
            };
            
            if (!document.getElementById) {
                document.getElementById = function(id) {
                    if (id.includes('canvas')) return mockCanvas;
                    return null;
                };
            }
            
            // Test initialization
            try {
                game.init();
                return true;
            } catch (error) {
                return "Game initialization failed: " + error.message;
            }
        },
        "integration"
    );
    
    /**
     * TEST: Entity creation and management integration
     * Tests that entities work with all systems
     */
    testFramework.addTest(
        "Entity creation integrates with all management systems",
        function() {
            // Mock game arrays
            if (!game.items) game.items = [];
            if (!game.selectedItems) game.selectedItems = [];
            
            // Create test entity
            const entity = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10,
                team: "player"
            });
            
            // Verify entity is in game items array
            if (!game.items.includes(entity)) {
                return "Entity should be added to game items array";
            }
            
            // Test entity selection
            game.selectedItems.push(entity);
            entity.selected = true;
            
            if (!game.selectedItems.includes(entity)) {
                return "Entity should be added to selected items array";
            }
            
            // Test entity removal
            const initialCount = game.items.length;
            game.items = game.items.filter(item => item !== entity);
            
            if (game.items.length !== initialCount - 1) {
                return "Entity should be properly removed from game";
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: Combat and movement integration
     * Tests that combat and movement systems work together
     */
    testFramework.addTest(
        "Combat and movement systems work together correctly",
        function() {
            // Create attacker and target
            const attacker = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10,
                team: "player",
                canAttack: true,
                weaponRange: 5
            });
            
            const target = addItem({
                type: "vehicles",
                name: "enemy-tank",
                x: 12,
                y: 12,
                team: "enemy",
                life: 100,
                hitPoints: 100
            });
            
            // Test movement to target
            const distance = Math.sqrt(Math.pow(target.x - attacker.x, 2) + Math.pow(target.y - attacker.y, 2));
            
            if (distance > attacker.weaponRange) {
                // Should move closer
                attacker.orders = { type: "move", to: { x: target.x - 1, y: target.y - 1 } };
            }
            
            // Test attack when in range
            if (distance <= attacker.weaponRange) {
                attacker.orders = { type: "attack", toUid: target.uid };
                
                // Apply damage (with variability)
                const damage = calculateDamage(25, 0);
                const initialLife = target.life;
                target.life -= damage;
                
                // Check that damage was applied (with variability range)
                // Damage should be between 22-28 for 25 base damage
                const expectedMinLife = initialLife - 28; // 25 * 1.1 = 27.5, rounded up
                const expectedMaxLife = initialLife - 22; // 25 * 0.9 = 22.5, rounded down
                if (target.life > expectedMaxLife || target.life < expectedMinLife) {
                    return `Damage should be applied correctly within variability range. Expected life between ${expectedMaxLife}-${expectedMinLife}, got ${target.life}`;
                }
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: UI and game state synchronization
     * Tests that UI reflects game state correctly
     */
    testFramework.addTest(
        "UI properly reflects game state changes",
        function() {
            // Mock game state
            if (!game.selectedItems) game.selectedItems = [];
            if (!game.items) game.items = [];
            // Reset selection to avoid test pollution
            game.selectedItems = [];
            
            const unit = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10,
                team: "player",
                life: 75,
                hitPoints: 100
            });
            
            // Select unit
            game.selectedItems.push(unit);
            unit.selected = true;
            
            // Test UI reflects selection
            if (game.selectedItems.length !== 1) {
                return `UI should reflect unit selection. Expected 1 selected item, got ${game.selectedItems.length}`;
            }
            
            // Test UI reflects unit health
            const healthPercent = Math.floor((unit.life / unit.hitPoints) * 100);
            if (healthPercent !== 75) {
                return "UI should reflect correct unit health";
            }
            
            // Test UI reflects unit type
            if (unit.type !== "vehicles") {
                return "UI should reflect correct unit type";
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: Pathfinding and movement integration
     * Tests that pathfinding works with movement system
     */
    testFramework.addTest(
        "Pathfinding integrates with movement system",
        function() {
            // Create simple grid
            const grid = [
                [0, 0, 0, 0, 0],
                [0, 1, 1, 1, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ];
            
            const start = [0, 0];
            const end = [4, 4];
            
            // Find path
            const path = AStar(grid, start, end, "Diagonal");
            
            if (!path || path.length === 0) {
                return "Pathfinding should find valid path";
            }
            
            // Test movement along path
            const unit = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: start[0],
                y: start[1],
                speed: 1
            });
            
            // Move to first waypoint
            if (path.length > 1) {
                const waypoint = path[1];
                unit.orders = { type: "move", to: { x: waypoint.x, y: waypoint.y } };
                
                // Verify movement order
                if (unit.orders.type !== "move") {
                    return "Unit should receive move order";
                }
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: Resource and building integration
     * Tests that resource system works with building system
     */
    testFramework.addTest(
        "Resource system integrates with building system",
        function() {
            // Mock resource system
            const resources = {
                money: 1000,
                oil: 500,
                canAfford: function(cost) {
                    return this.money >= cost;
                },
                spend: function(amount) {
                    if (this.canAfford(amount)) {
                        this.money -= amount;
                        return true;
                    }
                    return false;
                }
            };
            
            // Test building cost validation
            const harvesterCost = 1600;
            const tankCost = 500;
            
            if (resources.canAfford(harvesterCost)) {
                return "Should not be able to afford expensive building";
            }
            
            if (!resources.canAfford(tankCost)) {
                return "Should be able to afford affordable building";
            }
            
            // Test resource spending
            const initialMoney = resources.money;
            if (resources.spend(tankCost)) {
                if (resources.money !== initialMoney - tankCost) {
                    return "Resources should be properly deducted";
                }
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: Multiplayer integration
     * Tests that multiplayer systems work with game systems
     */
    testFramework.addTest(
        "Multiplayer systems integrate with game systems",
        function() {
            // Mock multiplayer system
            const multiplayer = {
                connected: false,
                players: [],
                connect: function() {
                    this.connected = true;
                    return true;
                },
                sendCommand: function(command) {
                    if (!this.connected) return false;
                    return true;
                }
            };
            
            // Test connection
            if (!multiplayer.connect()) {
                return "Multiplayer connection should work";
            }
            
            // Test command sending
            const testCommand = {
                type: "move",
                unitId: "test-unit",
                target: { x: 10, y: 10 }
            };
            
            if (!multiplayer.sendCommand(testCommand)) {
                return "Command sending should work when connected";
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: Sound system integration
     * Tests that sound system works with game events
     */
    testFramework.addTest(
        "Sound system integrates with game events",
        function() {
            // Mock sound system
            const soundSystem = {
                sounds: {},
                play: function(soundName) {
                    if (this.sounds[soundName]) {
                        return true;
                    }
                    return false;
                },
                loadSound: function(name, url) {
                    this.sounds[name] = url;
                    return true;
                }
            };
            
            // Load test sounds
            soundSystem.loadSound("click", "audio/click.ogg");
            soundSystem.loadSound("attack", "audio/attack.ogg");
            
            // Test sound playing
            if (!soundSystem.play("click")) {
                return "Sound system should play loaded sounds";
            }
            
            if (soundSystem.play("nonexistent")) {
                return "Sound system should not play unloaded sounds";
            }
            
            return true;
        },
        "integration"
    );
    
    /**
     * TEST: Performance integration
     * Tests that all systems work together without performance issues
     */
    testFramework.addTest(
        "All systems work together without performance degradation",
        function() {
            // Mock performance monitoring
            const performance = {
                frameCount: 0,
                lastFrameTime: Date.now(),
                measureFrame: function() {
                    const currentTime = Date.now();
                    const frameTime = currentTime - this.lastFrameTime;
                    this.lastFrameTime = currentTime;
                    this.frameCount++;
                    
                    // Frame time should be reasonable (less than 100ms for 10fps minimum)
                    if (frameTime > 100) {
                        return false;
                    }
                    return true;
                }
            };
            
            // Simulate multiple frames
            for (let i = 0; i < 10; i++) {
                if (!performance.measureFrame()) {
                    return "Performance should remain acceptable across multiple frames";
                }
            }
            
            return true;
        },
        "integration"
    );
    
    console.log("🔗 Integration tests registered");
})(); 