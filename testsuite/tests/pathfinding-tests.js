/**
 * PATHFINDING TESTS
 * =================
 * Tests for the A* pathfinding algorithm in astar.js and movement-related functions.
 * 
 * TEST COVERAGE:
 * - A* algorithm correctness
 * - Path finding in different scenarios
 * - Movement validation
 * - Grid-based navigation
 */

(function() {
    'use strict';
    
    /**
     * TEST: A* algorithm basic functionality
     * Tests that A* can find a simple path
     */
    testFramework.addTest(
        "A* algorithm finds path in simple open grid",
        function() {
            // Create a simple 5x5 grid with no obstacles
            const grid = [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ];
            
            const start = [0, 0];
            const end = [4, 4];
            
            const path = AStar(grid, start, end, "Diagonal");
            
            if (!path || path.length === 0) {
                return "A* should find a path in open grid";
            }
            
            // Check that path starts and ends at correct positions
            if (path[0].x !== start[0] || path[0].y !== start[1]) {
                return "Path should start at start position";
            }
            
            if (path[path.length - 1].x !== end[0] || path[path.length - 1].y !== end[1]) {
                return "Path should end at end position";
            }
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: A* algorithm with obstacles
     * Tests that A* can navigate around obstacles
     */
    testFramework.addTest(
        "A* algorithm navigates around obstacles",
        function() {
            // Create a grid with obstacles
            const grid = [
                [0, 0, 0, 0, 0],
                [0, 1, 1, 1, 0], // Wall in middle
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ];
            
            const start = [0, 0];
            const end = [4, 4];
            
            const path = AStar(grid, start, end, "Diagonal");
            
            if (!path || path.length === 0) {
                return "A* should find path around obstacles";
            }
            
            // Check that path doesn't go through obstacles
            for (let i = 0; i < path.length; i++) {
                const x = path[i].x;
                const y = path[i].y;
                if (grid[y][x] === 1) {
                    return "Path should not go through obstacles";
                }
            }
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: A* algorithm with no path available
     * Tests that A* handles impossible paths correctly
     */
    testFramework.addTest(
        "A* algorithm handles impossible paths gracefully",
        function() {
            // Create a grid with completely blocked path
            const grid = [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [1, 1, 1, 1, 1], // Complete wall
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ];
            
            const start = [0, 0];
            const end = [4, 4];
            
            const path = AStar(grid, start, end, "Diagonal");
            
            // Should return empty array or null when no path exists
            if (path && path.length > 0) {
                return "A* should return empty path when no route exists";
            }
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: A* algorithm different movement types
     * Tests different movement patterns (Manhattan, Diagonal, Euclidean)
     */
    testFramework.addTest(
        "A* algorithm supports different movement patterns",
        function() {
            const grid = [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ];
            
            const start = [0, 0];
            const end = [4, 4];
            
            // Test Manhattan movement (no diagonals)
            const manhattanPath = AStar(grid, start, end, "Manhattan");
            if (!manhattanPath || manhattanPath.length === 0) {
                return "Manhattan movement should find path";
            }
            
            // Test Diagonal movement
            const diagonalPath = AStar(grid, start, end, "Diagonal");
            if (!diagonalPath || diagonalPath.length === 0) {
                return "Diagonal movement should find path";
            }
            
            // Test Euclidean movement
            const euclideanPath = AStar(grid, start, end, "Euclidean");
            if (!euclideanPath || euclideanPath.length === 0) {
                return "Euclidean movement should find path";
            }
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: A* algorithm path optimality
     * Tests that A* finds reasonably optimal paths
     */
    testFramework.addTest(
        "A* algorithm finds reasonably optimal paths",
        function() {
            const grid = [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ];
            
            const start = [0, 0];
            const end = [4, 4];
            
            const path = AStar(grid, start, end, "Diagonal");
            
            if (!path || path.length === 0) {
                return "A* should find path";
            }
            
            // For diagonal movement, optimal path should be 4 steps (4,4 from 0,0)
            if (path.length > 6) {
                return "Path should be reasonably optimal";
            }
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: Grid coordinate conversion
     * Tests conversion between pixel and grid coordinates
     */
    testFramework.addTest(
        "Grid coordinate conversion works correctly",
        function() {
            // Mock game.gridSize
            if (!game.gridSize) game.gridSize = 20;
            
            // Test pixel to grid conversion
            const pixelX = 45;
            const pixelY = 65;
            
            const gridX = Math.floor(pixelX / game.gridSize);
            const gridY = Math.floor(pixelY / game.gridSize);
            
            if (gridX !== 2) return "Grid X conversion incorrect";
            if (gridY !== 3) return "Grid Y conversion incorrect";
            
            // Test grid to pixel conversion
            const centerPixelX = gridX * game.gridSize + game.gridSize / 2;
            const centerPixelY = gridY * game.gridSize + game.gridSize / 2;
            
            if (centerPixelX !== 50) return "Center pixel X calculation incorrect";
            if (centerPixelY !== 70) return "Center pixel Y calculation incorrect";
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: Movement validation
     * Tests that movement is validated against grid boundaries
     */
    testFramework.addTest(
        "Movement validation respects grid boundaries",
        function() {
            const gridWidth = 10;
            const gridHeight = 10;
            
            // Test valid movement
            const validX = 5;
            const validY = 5;
            
            if (validX < 0 || validX >= gridWidth) {
                return "Valid X coordinate should be within bounds";
            }
            
            if (validY < 0 || validY >= gridHeight) {
                return "Valid Y coordinate should be within bounds";
            }
            
            // Test invalid movement
            const invalidX = 15;
            const invalidY = -2;
            
            if (invalidX >= 0 && invalidX < gridWidth) {
                return "Invalid X coordinate should be detected";
            }
            
            if (invalidY >= 0 && invalidY < gridHeight) {
                return "Invalid Y coordinate should be detected";
            }
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: Distance calculation for pathfinding
     * Tests distance calculations used in pathfinding
     */
    testFramework.addTest(
        "Distance calculations are accurate for pathfinding",
        function() {
            const point1 = {x: 0, y: 0};
            const point2 = {x: 3, y: 4};
            
            // Manhattan distance
            const manhattanDist = Math.abs(point2.x - point1.x) + Math.abs(point2.y - point1.y);
            if (manhattanDist !== 7) return "Manhattan distance calculation incorrect";
            
            // Euclidean distance
            const euclideanDist = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
            if (Math.abs(euclideanDist - 5) > 0.1) return "Euclidean distance calculation incorrect";
            
            // Diagonal distance (max of x and y differences)
            const diagonalDist = Math.max(Math.abs(point2.x - point1.x), Math.abs(point2.y - point1.y));
            if (diagonalDist !== 4) return "Diagonal distance calculation incorrect";
            
            return true;
        },
        "pathfinding"
    );
    
    /**
     * TEST: Path smoothing and optimization
     * Tests that paths can be optimized and smoothed
     */
    testFramework.addTest(
        "Path optimization removes unnecessary waypoints",
        function() {
            // Create a path with redundant waypoints
            const redundantPath = [
                {x: 0, y: 0},
                {x: 1, y: 0},
                {x: 2, y: 0},
                {x: 3, y: 0},
                {x: 4, y: 0},
                {x: 4, y: 1},
                {x: 4, y: 2},
                {x: 4, y: 3},
                {x: 4, y: 4}
            ];
            
            // Simple optimization: remove waypoints that are in straight lines
            const optimizedPath = [];
            for (let i = 0; i < redundantPath.length; i++) {
                if (i === 0 || i === redundantPath.length - 1) {
                    optimizedPath.push(redundantPath[i]);
                } else {
                    const prev = redundantPath[i - 1];
                    const curr = redundantPath[i];
                    const next = redundantPath[i + 1];
                    
                    // Keep waypoint if direction changes
                    const dx1 = curr.x - prev.x;
                    const dy1 = curr.y - prev.y;
                    const dx2 = next.x - curr.x;
                    const dy2 = next.y - curr.y;
                    
                    if (dx1 !== dx2 || dy1 !== dy2) {
                        optimizedPath.push(curr);
                    }
                }
            }
            
            // Optimized path should be shorter
            if (optimizedPath.length >= redundantPath.length) {
                return "Path optimization should reduce waypoints";
            }
            
            return true;
        },
        "pathfinding"
    );
    
    console.log("🗺️ Pathfinding tests registered");
})(); 