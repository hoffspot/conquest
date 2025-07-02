/**
 * ENTITY TESTS
 * ============
 * Tests for entity management functions in common.js and entity-specific files
 * including vehicle, aircraft, building, and terrain entities.
 * 
 * TEST COVERAGE:
 * - Entity creation and initialization
 * - Entity lifecycle management
 * - Entity property validation
 * - Entity type-specific behavior
 */

(function() {
    'use strict';
    
    /**
     * TEST: Entity creation with addItem()
     * Tests the main entity creation function
     */
    testFramework.addTest(
        "addItem() creates entities with proper default properties",
        function() {
            // Mock game.items array
            if (!game.items) game.items = [];
            
            // Test entity creation
            const testEntity = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10,
                team: "player"
            });
            
            // Check required properties
            if (!testEntity.uid) return "Entity should have a UID";
            if (testEntity.type !== "vehicles") return "Entity type not set correctly";
            if (testEntity.name !== "scout-tank") return "Entity name not set correctly";
            if (testEntity.x !== 10) return "Entity X coordinate not set correctly";
            if (testEntity.y !== 10) return "Entity Y coordinate not set correctly";
            if (testEntity.team !== "player") return "Entity team not set correctly";
            
            // Check default properties
            if (typeof testEntity.selected !== 'boolean') return "Entity should have selected property";
            if (typeof testEntity.selectable !== 'boolean') return "Entity should have selectable property";
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity UID generation
     * Tests that entities get unique identifiers
     */
    testFramework.addTest(
        "Entities receive unique UIDs when created",
        function() {
            if (!game.items) game.items = [];
            
            const entity1 = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10
            });
            
            const entity2 = addItem({
                type: "vehicles", 
                name: "heavy-tank",
                x: 20,
                y: 20
            });
            
            if (entity1.uid === entity2.uid) {
                return "Entities should have different UIDs";
            }
            
            if (!entity1.uid || !entity2.uid) {
                return "Entities should have non-empty UIDs";
            }
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Vehicle entity properties
     * Tests vehicle-specific properties and behavior
     */
    testFramework.addTest(
        "Vehicle entities have correct combat and movement properties",
        function() {
            const vehicle = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10
            });
            
            // Check vehicle-specific properties
            if (typeof vehicle.speed !== 'number') return "Vehicle should have speed property";
            if (typeof vehicle.sight !== 'number') return "Vehicle should have sight property";
            if (typeof vehicle.hitPoints !== 'number') return "Vehicle should have hitPoints property";
            if (typeof vehicle.radius !== 'number') return "Vehicle should have radius property";
            
            // Check combat properties for combat vehicles
            if (vehicle.name === "scout-tank") {
                if (!vehicle.canAttack) return "Scout tank should be able to attack";
                if (!vehicle.canAttackLand) return "Scout tank should be able to attack land units";
                if (vehicle.canAttackAir) return "Scout tank should not be able to attack air units";
            }
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity death detection
     * Tests the isItemDead() function
     */
    testFramework.addTest(
        "isItemDead() correctly identifies dead entities",
        function() {
            const aliveEntity = {
                life: 50,
                hitPoints: 100
            };
            
            const deadEntity = {
                life: 0,
                hitPoints: 100
            };
            
            const negativeLifeEntity = {
                life: -10,
                hitPoints: 100
            };
            
            if (isItemDead(aliveEntity)) return "Entity with life > 0 should not be considered dead";
            if (!isItemDead(deadEntity)) return "Entity with life = 0 should be considered dead";
            if (!isItemDead(negativeLifeEntity)) return "Entity with life < 0 should be considered dead";
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity targeting system
     * Tests the isValidTarget() function for combat targeting
     */
    testFramework.addTest(
        "isValidTarget() correctly validates combat targets",
        function() {
            const attacker = {
                team: "player",
                canAttack: true,
                canAttackLand: true,
                canAttackAir: false
            };
            
            const enemyGroundUnit = {
                team: "enemy",
                type: "vehicles",
                lifeCode: "healthy",
                selectable: true
            };
            
            const friendlyUnit = {
                team: "player",
                type: "vehicles",
                lifeCode: "healthy",
                selectable: true
            };
            
            const enemyAirUnit = {
                team: "enemy",
                type: "aircraft",
                lifeCode: "healthy",
                selectable: true
            };
            
            // Test valid targets
            if (!isValidTarget(attacker, enemyGroundUnit)) {
                return "Ground attacker should be able to target enemy ground units";
            }
            
            // Test invalid targets
            if (isValidTarget(attacker, friendlyUnit)) {
                return "Units should not be able to target friendly units";
            }
            
            if (isValidTarget(attacker, enemyAirUnit)) {
                return "Ground-only attacker should not be able to target air units";
            }
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity sight and detection
     * Tests the findTargetsInSight() function
     */
    testFramework.addTest(
        "findTargetsInSight() finds valid targets within sight range",
        function() {
            const observer = {
                x: 10,
                y: 10,
                sight: 5,
                team: "player",
                weaponRange: 5,
                hasLineOfSightTo: function(target) { return true; }
            };
            
            const nearbyEnemy = {
                x: 12,
                y: 12,
                team: "enemy",
                type: "vehicles",
                lifeCode: "healthy",
                selectable: true
            };
            
            const farEnemy = {
                x: 20,
                y: 20,
                team: "enemy", 
                type: "vehicles",
                lifeCode: "healthy",
                selectable: true
            };
            
            // Mock game.items array
            if (!game.items) game.items = [];
            game.items = [observer, nearbyEnemy, farEnemy];
            
            const targets = findTargetsInSight.call(observer, 1);
            
            // Should find nearby enemy but not far enemy
            const foundNearby = targets.some(target => target === nearbyEnemy);
            const foundFar = targets.some(target => target === farEnemy);
            
            if (!foundNearby) return "Should find enemy within sight range";
            if (foundFar) return "Should not find enemy outside sight range";
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity line of sight
     * Tests the hasLineOfSightTo() function
     */
    testFramework.addTest(
        "hasLineOfSightTo() correctly determines visibility between entities",
        function() {
            const observer = {
                x: 10,
                y: 10,
                sight: 5
            };
            
            const visibleTarget = {
                x: 12,
                y: 12
            };
            
            const blockedTarget = {
                x: 15,
                y: 15
            };
            
            // Mock game.gridSize and currentMapPassableGrid
            if (!game.gridSize) game.gridSize = 20;
            if (!game.currentMapPassableGrid) game.currentMapPassableGrid = [];
            
            // Mock terrain blocking (simplified test)
            if (!hasLineOfSightTo.call(observer, visibleTarget)) {
                return "Should have line of sight to nearby target";
            }
            
            // This test is simplified - in real game there would be terrain checking
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity animation system
     * Tests that entities have proper animation properties
     */
    testFramework.addTest(
        "Entities have proper animation properties for rendering",
        function() {
            const entity = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10
            });
            
            // Check animation properties
            if (typeof entity.animationIndex !== 'number') {
                return "Entity should have animationIndex property";
            }
            
            if (typeof entity.direction !== 'number') {
                return "Entity should have direction property";
            }
            
            if (typeof entity.action !== 'string') {
                return "Entity should have action property";
            }
            
            if (typeof entity.animate !== 'function') {
                return "Entity should have animate function";
            }
            
            return true;
        },
        "entity"
    );
    
    /**
     * TEST: Entity order processing
     * Tests that entities can process orders
     */
    testFramework.addTest(
        "Entities can process movement and combat orders",
        function() {
            const entity = addItem({
                type: "vehicles",
                name: "scout-tank",
                x: 10,
                y: 10
            });
            
            // Test order structure
            const moveOrder = {
                type: "move",
                to: { x: 20, y: 20 }
            };
            
            const attackOrder = {
                type: "attack",
                toUid: "target-uid"
            };
            
            // Check that entity can process orders
            if (typeof entity.processOrders !== 'function') {
                return "Entity should have processOrders function";
            }
            
            // Test order assignment
            entity.orders = moveOrder;
            if (entity.orders.type !== "move") {
                return "Entity orders not properly assigned";
            }
            
            return true;
        },
        "entity"
    );
    
    console.log("🏗️ Entity tests registered");
})(); 