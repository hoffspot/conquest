# Last Colony - Comprehensive Test Suite

This directory contains a comprehensive test suite for the Last Colony game engine, designed to validate functionality, catch regressions, and ensure code quality.

## 🚀 Quick Start

1. **Run the test suite:**
   ```bash
   # Open the test harness in your browser
   open testsuite/runalltests.html
   ```

2. **Check test status:**
   ```bash
   # Verify all test files exist
   node testsuite/run-tests.js
   ```

## 📁 Test Structure

### Main Test Harness
- **`runalltests.html`** - Main test runner with visual interface
- **`run-tests.js`** - Node.js script for test validation

### Test Categories
- **`tests/math-tests.js`** - Mathematical utilities and calculations
- **`tests/game-engine-tests.js`** - Core game engine functionality
- **`tests/entity-tests.js`** - Entity management and lifecycle
- **`tests/pathfinding-tests.js`** - A* algorithm and movement
- **`tests/input-tests.js`** - Mouse input and coordinate systems
- **`tests/combat-tests.js`** - Combat system and damage calculation
- **`tests/ui-tests.js`** - User interface components
- **`tests/integration-tests.js`** - Multi-system integration

## 🧪 Test Features

### Visual Test Runner
- **Real-time progress bar** showing test execution
- **Summary statistics** with pass/fail counts
- **Detailed results** with timing information
- **Error reporting** with specific failure messages
- **Category organization** for easy navigation

### Test Capabilities
- **Timing measurement** for performance validation
- **Mock objects** for isolated testing
- **Edge case coverage** for robust validation
- **Integration testing** for system interactions
- **Automated execution** with immediate feedback

## 📊 Test Coverage

### Mathematical Functions
- ✅ Angle calculations (`findAngle`)
- ✅ Angle differences (`angleDiff`)
- ✅ Direction wrapping (`wrapDirection`)
- ✅ Damage calculations (`calculateDamage`)
- ✅ Distance calculations
- ✅ Precision validation

### Game Engine
- ✅ Initialization and setup
- ✅ Camera panning and boundaries
- ✅ Game loop timing
- ✅ Grid system configuration
- ✅ Entity management
- ✅ Command processing
- ✅ State management
- ✅ Performance optimization

### Entity System
- ✅ Entity creation and UID generation
- ✅ Property validation
- ✅ Lifecycle management
- ✅ Death detection
- ✅ Target validation
- ✅ Sight and detection
- ✅ Animation system
- ✅ Order processing

### Pathfinding
- ✅ A* algorithm correctness
- ✅ Obstacle navigation
- ✅ Impossible path handling
- ✅ Movement pattern support
- ✅ Path optimality
- ✅ Grid coordinate conversion
- ✅ Boundary validation
- ✅ Path optimization

### Input Handling
- ✅ Mouse coordinate tracking
- ✅ Coordinate system conversion
- ✅ Canvas boundary detection
- ✅ Click event validation
- ✅ Drag selection
- ✅ Event handling

### Combat System
- ✅ Damage calculation with armor
- ✅ Target validation by unit type
- ✅ Combat range validation
- ✅ Weapon reload timing
- ✅ Combat state transitions
- ✅ Line of sight validation
- ✅ Multiple target selection
- ✅ Damage application

### User Interface
- ✅ Sidebar initialization
- ✅ Unit selection display
- ✅ Building placement validation
- ✅ Button state management
- ✅ Resource display
- ✅ Unit information display
- ✅ Message system
- ✅ Minimap functionality
- ✅ Responsive design

### Integration
- ✅ Complete game initialization
- ✅ Entity lifecycle integration
- ✅ Combat and movement integration
- ✅ UI and game state synchronization
- ✅ Pathfinding and movement integration
- ✅ Resource and building integration
- ✅ Multiplayer system integration
- ✅ Sound system integration
- ✅ Performance integration

## 🔧 Code Integration

### Test References in Code
Each function with tests includes a reference comment:

```javascript
/**
 * FIND ANGLE BETWEEN TWO POINTS
 * Calculates the angle from one point to another.
 * 
 * TEST: testsuite/tests/math-tests.js - "findAngle() calculates correct angle between two points"
 */
function findAngle(object, unit, directions) {
    // Implementation...
    // TEST: testsuite/tests/math-tests.js - "findAngle() calculates correct angle between two points"
}
```

### Adding New Tests
1. **Create test function** in appropriate test file
2. **Register test** with `testFramework.addTest()`
3. **Add test reference** to code comments
4. **Update this README** with new test coverage

### Test Best Practices
- **Isolate tests** using mock objects
- **Test edge cases** and error conditions
- **Measure performance** with timing
- **Provide clear error messages**
- **Group related tests** by category
- **Maintain test documentation**

## 🚨 Continuous Testing

### After Code Changes
1. **Run the test suite** to check for regressions
2. **Update tests** for new functionality
3. **Add tests** for bug fixes
4. **Verify timing** for performance changes

### Test Maintenance
- **Keep tests current** with code changes
- **Remove obsolete tests** for removed features
- **Update test references** when moving code
- **Validate test accuracy** regularly

## 📈 Performance Monitoring

The test suite includes performance validation:
- **Frame timing** for game loop performance
- **Function execution time** for optimization
- **Memory usage** patterns
- **Algorithm efficiency** measurements

## 🐛 Debugging Tests

### Common Issues
- **Mock objects missing** - Add required mocks
- **Function not found** - Check script loading order
- **Timing failures** - Adjust performance thresholds
- **Coordinate mismatches** - Verify calculation accuracy

### Debug Tools
- **Browser console** for detailed output
- **Test timing** for performance analysis
- **Error messages** for specific failures
- **Category filtering** for focused debugging

## 📚 Test Documentation

### Test Categories
- **Unit Tests** - Individual function validation
- **Integration Tests** - System interaction validation
- **Performance Tests** - Timing and efficiency validation
- **Regression Tests** - Bug fix validation

### Test Patterns
- **Arrange** - Set up test conditions
- **Act** - Execute the function being tested
- **Assert** - Verify expected results
- **Cleanup** - Reset test state

## 🎯 Quality Assurance

This test suite ensures:
- **Functionality correctness** across all systems
- **Performance stability** under various conditions
- **Regression prevention** during development
- **Code quality** through comprehensive validation
- **Documentation accuracy** through test references

## 🔄 Future Enhancements

Planned improvements:
- **Automated test execution** via CI/CD
- **Coverage reporting** for untested code
- **Performance benchmarking** against baselines
- **Visual test results** with screenshots
- **Test data management** for complex scenarios

## Test Harness

The unified test harness is now:

- `runalltests-cli.html` — Use this for both browser-based and CLI/automation test runs. It supports both modes via a URL parameter (`?mode=cli` for CLI output, default is browser/DOM output).

**Obsolete/removed files:**
- `runalltests.html`, `runalltests-fixed.html`, `run-tests-cli.js`, `run-tests-simple.js` (all functionality consolidated)

### Usage

- **Browser:** Open `runalltests-cli.html` in your browser to see a full UI with progress, summary, and detailed results.
- **CLI/Automation:** Use a headless browser or automation tool to open `runalltests-cli.html?mode=cli` and capture console output for CI/CD or scripting.

---

**Last Updated:** December 2024  
**Test Count:** 80+ individual tests  
**Coverage:** All major game systems  
**Status:** Active development and maintenance 