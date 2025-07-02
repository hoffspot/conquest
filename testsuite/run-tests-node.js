#!/usr/bin/env node

/**
 * Node.js Test Runner for Last Colony
 * ===================================
 * Runs tests using Node.js and captures output.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class NodeTestRunner {
    constructor() {
        this.testResults = [];
        this.passed = 0;
        this.failed = 0;
    }
    
    async runTests() {
        console.log('🚀 Starting Last Colony Test Suite...');
        
        // Test 1: Check if common.js functions work
        await this.testCommonFunctions();
        
        // Test 2: Check if math functions work
        await this.testMathFunctions();
        
        // Test 3: Check if entity functions work
        await this.testEntityFunctions();
        
        // Test 4: Check if AStar works
        await this.testAStar();
        
        // Test 5: Check if game object works
        await this.testGameObject();
        
        this.printSummary();
        
        if (this.failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
    
    async testCommonFunctions() {
        console.log('\n🧪 Testing Common Functions...');
        
        const testScript = `
            const { addItem, findAngle, wrapDirection, angleDiff, isValidTarget } = require('./js/common.js');
            
            // Test addItem
            const entity = addItem({
                name: "test-unit",
                type: "vehicles",
                x: 10,
                y: 20,
                team: "player"
            });
            
            if (!entity || entity.name !== "test-unit") {
                console.log('❌ FAIL: addItem not working correctly');
                process.exit(1);
            }
            
            // Test wrapDirection
            const result = wrapDirection(10, 8);
            if (result !== 2) {
                console.log('❌ FAIL: wrapDirection(10, 8) should return 2, got ' + result);
                process.exit(1);
            }
            
            console.log('✅ PASS: Common functions work correctly');
        `;
        
        try {
            await this.runNodeScript(testScript);
            this.passed++;
        } catch (error) {
            console.log('❌ FAIL: Common functions test failed - ' + error.message);
            this.failed++;
        }
    }
    
    async testMathFunctions() {
        console.log('\n🧪 Testing Math Functions...');
        
        const testScript = `
            const { findAngle, angleDiff, calculateDamage } = require('./js/common.js');
            
            // Test findAngle
            const angle = findAngle({x: 10, y: 0}, {x: 0, y: 0}, 8);
            if (isNaN(angle) || angle < 0 || angle >= 8) {
                console.log('❌ FAIL: findAngle returned invalid result: ' + angle);
                process.exit(1);
            }
            
            // Test angleDiff
            const diff = angleDiff(0, 4, 8);
            if (isNaN(diff)) {
                console.log('❌ FAIL: angleDiff returned NaN');
                process.exit(1);
            }
            
            // Test calculateDamage
            const damage = calculateDamage(100, 20);
            if (damage < 70 || damage > 90) {
                console.log('❌ FAIL: calculateDamage returned unexpected value: ' + damage);
                process.exit(1);
            }
            
            console.log('✅ PASS: Math functions work correctly');
        `;
        
        try {
            await this.runNodeScript(testScript);
            this.passed++;
        } catch (error) {
            console.log('❌ FAIL: Math functions test failed - ' + error.message);
            this.failed++;
        }
    }
    
    async testEntityFunctions() {
        console.log('\n🧪 Testing Entity Functions...');
        
        const testScript = `
            const { isValidTarget } = require('./js/common.js');
            
            const attacker = {
                team: "player",
                canAttack: true,
                canAttackLand: true,
                canAttackAir: false
            };
            
            const enemyGround = {
                team: "enemy",
                type: "vehicles",
                lifeCode: "healthy",
                selectable: true
            };
            
            const friendly = {
                team: "player",
                type: "vehicles",
                lifeCode: "healthy",
                selectable: true
            };
            
            if (!isValidTarget(attacker, enemyGround)) {
                console.log('❌ FAIL: Should be able to attack enemy ground unit');
                process.exit(1);
            }
            
            if (isValidTarget(attacker, friendly)) {
                console.log('❌ FAIL: Should not be able to attack friendly unit');
                process.exit(1);
            }
            
            console.log('✅ PASS: Entity functions work correctly');
        `;
        
        try {
            await this.runNodeScript(testScript);
            this.passed++;
        } catch (error) {
            console.log('❌ FAIL: Entity functions test failed - ' + error.message);
            this.failed++;
        }
    }
    
    async testAStar() {
        console.log('\n🧪 Testing A* Pathfinding...');
        
        const testScript = `
            const AStar = require('./js/astar.js');
            
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
                console.log('❌ FAIL: A* should find a path in open grid');
                process.exit(1);
            }
            
            console.log('✅ PASS: A* pathfinding works correctly');
        `;
        
        try {
            await this.runNodeScript(testScript);
            this.passed++;
        } catch (error) {
            console.log('❌ FAIL: A* test failed - ' + error.message);
            this.failed++;
        }
    }
    
    async testGameObject() {
        console.log('\n🧪 Testing Game Object...');
        
        const testScript = `
            const game = require('./js/game.js');
            
            if (typeof game.init !== 'function') {
                console.log('❌ FAIL: game.init function not found');
                process.exit(1);
            }
            
            if (typeof game.handlePanning !== 'function') {
                console.log('❌ FAIL: game.handlePanning function not found');
                process.exit(1);
            }
            
            if (game.gridSize !== 20) {
                console.log('❌ FAIL: game.gridSize should be 20, got ' + game.gridSize);
                process.exit(1);
            }
            
            console.log('✅ PASS: Game object works correctly');
        `;
        
        try {
            await this.runNodeScript(testScript);
            this.passed++;
        } catch (error) {
            console.log('❌ FAIL: Game object test failed - ' + error.message);
            this.failed++;
        }
    }
    
    runNodeScript(script) {
        return new Promise((resolve, reject) => {
            const tempFile = path.join(__dirname, 'temp-test.js');
            fs.writeFileSync(tempFile, script);
            
            exec(`node ${tempFile}`, { timeout: 10000 }, (error, stdout, stderr) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    // Ignore cleanup errors
                }
                
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                
                if (stdout.includes('❌ FAIL')) {
                    reject(new Error(stdout.trim()));
                    return;
                }
                
                resolve(stdout);
            });
        });
    }
    
    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.passed + this.failed}`);
        console.log(`Passed: ${this.passed}`);
        console.log(`Failed: ${this.failed}`);
        console.log('='.repeat(50));
        
        if (this.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED!');
        } else {
            console.log(`\n⚠️  ${this.failed} tests failed`);
        }
    }
}

// Run the tests
const runner = new NodeTestRunner();
runner.runTests().catch(error => {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
}); 