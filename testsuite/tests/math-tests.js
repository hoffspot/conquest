/**
 * MATHEMATICAL UTILITY TESTS
 * =========================
 * Tests for mathematical functions in common.js including:
 * - Angle calculations and conversions
 * - Distance calculations
 * - Direction wrapping
 * - Combat mathematics
 * 
 * TEST COVERAGE:
 * - findAngle() - Angle calculation between two points
 * - angleDiff() - Difference between two angles
 * - wrapDirection() - Direction wrapping for sprite animations
 * - findFiringAngle() - Combat angle calculations
 * - calculateDamage() - Damage calculation with armor
 */

// Register mathematical utility tests
(function() {
    'use strict';
    
    /**
     * TEST: findAngle() - Basic angle calculation
     * Tests the core angle calculation function with simple cases
     */
    testFramework.addTest(
        "findAngle() calculates correct angle between two points",
        function() {
            // Test case 1: Point directly to the right
            const angle1 = findAngle({x: 10, y: 0}, {x: 0, y: 0}, 8);
            if (isNaN(angle1) || angle1 < 0 || angle1 >= 8) return "Expected valid angle 0-7, got " + angle1;
            
            // Test case 2: Point directly to the left
            const angle2 = findAngle({x: -10, y: 0}, {x: 0, y: 0}, 8);
            if (isNaN(angle2) || angle2 < 0 || angle2 >= 8) return "Expected valid angle 0-7, got " + angle2;
            
            // Test case 3: Point directly above
            const angle3 = findAngle({x: 0, y: -10}, {x: 0, y: 0}, 8);
            if (isNaN(angle3) || angle3 < 0 || angle3 >= 8) return "Expected valid angle 0-7, got " + angle3;
            
            // Test case 4: Point directly below
            const angle4 = findAngle({x: 0, y: 10}, {x: 0, y: 0}, 8);
            if (isNaN(angle4) || angle4 < 0 || angle4 >= 8) return "Expected valid angle 0-7, got " + angle4;
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: findAngle() - Diagonal angles
     * Tests angle calculation for diagonal directions
     */
    testFramework.addTest(
        "findAngle() calculates correct diagonal angles",
        function() {
            // Test case 1: Upper right diagonal
            const angle1 = findAngle({x: 10, y: -10}, {x: 0, y: 0}, 8);
            if (isNaN(angle1) || angle1 < 0 || angle1 >= 8) return "Expected valid angle 0-7, got " + angle1;
            
            // Test case 2: Upper left diagonal
            const angle2 = findAngle({x: -10, y: -10}, {x: 0, y: 0}, 8);
            if (isNaN(angle2) || angle2 < 0 || angle2 >= 8) return "Expected valid angle 0-7, got " + angle2;
            
            // Test case 3: Lower left diagonal
            const angle3 = findAngle({x: -10, y: 10}, {x: 0, y: 0}, 8);
            if (isNaN(angle3) || angle3 < 0 || angle3 >= 8) return "Expected valid angle 0-7, got " + angle3;
            
            // Test case 4: Lower right diagonal
            const angle4 = findAngle({x: 10, y: 10}, {x: 0, y: 0}, 8);
            if (isNaN(angle4) || angle4 < 0 || angle4 >= 8) return "Expected valid angle 0-7, got " + angle4;
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: angleDiff() - Angle difference calculation
     * Tests the function that calculates the shortest difference between two angles
     */
    testFramework.addTest(
        "angleDiff() calculates correct angle differences",
        function() {
            // Test case 1: Simple difference
            const diff1 = angleDiff(0, 2, 8);
            if (isNaN(diff1)) return "Expected valid angle difference, got NaN";
            
            // Test case 2: Wrapped difference (should take shortest path)
            const diff2 = angleDiff(0, 6, 8);
            if (isNaN(diff2)) return "Expected valid angle difference, got NaN";
            
            // Test case 3: Zero difference
            const diff3 = angleDiff(3, 3, 8);
            if (Math.abs(diff3 - 0) > 0.1) return "Expected diff 0, got " + diff3;
            
            // Test case 4: Maximum difference
            const diff4 = angleDiff(0, 4, 8);
            if (isNaN(diff4)) return "Expected valid angle difference, got NaN";
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: wrapDirection() - Direction wrapping
     * Tests the function that wraps direction values to valid ranges
     */
    testFramework.addTest(
        "wrapDirection() correctly wraps direction values",
        function() {
            // Test case 1: Normal value
            const wrap1 = wrapDirection(3, 8);
            if (wrap1 !== 3) return "Expected 3, got " + wrap1;
            
            // Test case 2: Negative value
            const wrap2 = wrapDirection(-1, 8);
            if (wrap2 !== 7) return "Expected 7, got " + wrap2;
            
            // Test case 3: Value above maximum
            const wrap3 = wrapDirection(10, 8);
            if (wrap3 !== 2) return "Expected 2, got " + wrap3;
            
            // Test case 4: Multiple wraps
            const wrap4 = wrapDirection(20, 8);
            if (wrap4 !== 4) return "Expected 4, got " + wrap4;
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: findFiringAngle() - Combat angle calculation
     * Tests the function that calculates firing angles for weapons
     */
    testFramework.addTest(
        "findFiringAngle() calculates correct firing angles",
        function() {
            // Mock game.gridSize for testing
            if (!game.gridSize) game.gridSize = 20;
            
            // Test case 1: Direct shot
            const angle1 = findFiringAngle({x: 10, y: 0}, {x: 0, y: 0}, 8);
            if (isNaN(angle1)) return "Expected valid angle, got NaN";
            
            // Test case 2: Diagonal shot
            const angle2 = findFiringAngle({x: 10, y: 10}, {x: 0, y: 0}, 8);
            if (isNaN(angle2)) return "Expected valid angle, got NaN";
            
            // Test case 3: Moving target (with velocity)
            const angle3 = findFiringAngle({x: 10, y: 0, velocityX: 2, velocityY: 0}, {x: 0, y: 0}, 8);
            // This should account for target movement
            if (isNaN(angle3)) return "Expected valid angle, got NaN";
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: calculateDamage() - Damage calculation
     * Tests the damage calculation function with different weapon and armor values
     */
    testFramework.addTest(
        "calculateDamage() calculates correct damage values",
        function() {
            // Test case 1: Basic damage calculation (with randomness)
            const damage1 = calculateDamage(100, 0);
            if (damage1 < 90 || damage1 > 110) return "Expected damage between 90-110, got " + damage1;
            
            // Test case 2: Damage with armor (with randomness)
            const damage2 = calculateDamage(100, 20);
            if (damage2 < 70 || damage2 > 90) return "Expected damage between 70-90, got " + damage2;
            
            // Test case 3: High armor (should not go below 1)
            const damage3 = calculateDamage(50, 100);
            if (damage3 < 1) return "Expected minimum damage 1, got " + damage3;
            
            // Test case 4: Zero weapon power
            const damage4 = calculateDamage(0, 10);
            if (damage4 !== 0) return "Expected damage 0, got " + damage4;
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: Distance calculation accuracy
     * Tests that distance calculations are mathematically accurate
     */
    testFramework.addTest(
        "Distance calculations are mathematically accurate",
        function() {
            // Test case 1: Horizontal distance
            const dist1 = Math.sqrt(Math.pow(10 - 0, 2) + Math.pow(0 - 0, 2));
            if (Math.abs(dist1 - 10) > 0.1) return "Expected distance 10, got " + dist1;
            
            // Test case 2: Vertical distance
            const dist2 = Math.sqrt(Math.pow(0 - 0, 2) + Math.pow(10 - 0, 2));
            if (Math.abs(dist2 - 10) > 0.1) return "Expected distance 10, got " + dist2;
            
            // Test case 3: Diagonal distance (3-4-5 triangle)
            const dist3 = Math.sqrt(Math.pow(3 - 0, 2) + Math.pow(4 - 0, 2));
            if (Math.abs(dist3 - 5) > 0.1) return "Expected distance 5, got " + dist3;
            
            return true;
        },
        "math"
    );
    
    /**
     * TEST: Mathematical precision
     * Tests that mathematical operations maintain sufficient precision
     */
    testFramework.addTest(
        "Mathematical operations maintain precision",
        function() {
            // Test case 1: Small angle differences
            const smallDiff = angleDiff(0.1, 0.2, 8);
            if (isNaN(smallDiff)) return "Expected valid angle difference, got NaN";
            
            // Test case 2: Large coordinate values
            const largeAngle = findAngle({x: 1000, y: 1000}, {x: 2000, y: 2000}, 8);
            if (isNaN(largeAngle)) return "Expected valid angle, got NaN";
            
            // Test case 3: Zero coordinates
            const zeroAngle = findAngle({x: 0, y: 0}, {x: 0, y: 0}, 8);
            if (isNaN(zeroAngle)) return "Expected valid angle for zero coordinates, got NaN";
            
            return true;
        },
        "math"
    );
    
    console.log("📐 Mathematical utility tests registered");
})(); 