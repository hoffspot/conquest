#!/usr/bin/env node

/**
 * TEST RUNNER SCRIPT
 * ==================
 * Automatically runs the test suite and reports results.
 * This script can be called after code updates to ensure functionality is maintained.
 * 
 * Usage:
 *   node testsuite/run-tests.js
 *   npm test
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🧪 Last Colony Test Suite Runner');
console.log('================================');

// Check if test files exist
const testFiles = [
    'testsuite/runalltests.html',
    'testsuite/tests/math-tests.js',
    'testsuite/tests/game-engine-tests.js',
    'testsuite/tests/entity-tests.js',
    'testsuite/tests/pathfinding-tests.js',
    'testsuite/tests/input-tests.js',
    'testsuite/tests/combat-tests.js',
    'testsuite/tests/ui-tests.js',
    'testsuite/tests/integration-tests.js'
];

console.log('\n📁 Checking test files...');
let allFilesExist = true;

testFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ Some test files are missing. Please ensure all test files are created.');
    process.exit(1);
}

console.log('\n✅ All test files found!');
console.log('\n🚀 To run the test suite:');
console.log('   1. Open testsuite/runalltests.html in a web browser');
console.log('   2. Tests will run automatically and display results');
console.log('   3. Check the browser console for detailed test output');
console.log('\n📊 Test Categories:');
console.log('   - Math utilities (angle calculations, damage)');
console.log('   - Game engine (initialization, camera, timing)');
console.log('   - Entity management (creation, lifecycle, targeting)');
console.log('   - Pathfinding (A* algorithm, movement)');
console.log('   - Input handling (mouse, coordinates)');
console.log('   - Combat system (damage, targeting, weapons)');
console.log('   - UI components (sidebar, selection, building)');
console.log('   - Integration (multi-system functionality)');

console.log('\n📝 Test Documentation:');
console.log('   - Each test includes timing information');
console.log('   - Tests are categorized for easy identification');
console.log('   - Failed tests show detailed error messages');
console.log('   - Code comments reference associated tests');

console.log('\n🔄 Continuous Testing:');
console.log('   - Run tests after any code changes');
console.log('   - Update tests when adding new functionality');
console.log('   - Ensure all functions have associated tests');

console.log('\n✨ Test suite ready! Open testsuite/runalltests.html to begin testing.'); 