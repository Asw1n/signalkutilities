/**
 * Test script for PolarTable class using real sailboat polar data
 * Tests all major functionality including CSV loading, interpolation, and performance adjustments
 */

const { PolarTable } = require('../general/PolarTable');
const SI = require('../general/SI');

// Real CSV polar data from your sailboat (Jieter format)
const csv = `twa/tws;4;6;8;10;12;14;16;20;24
0; 0; 0; 0; 0; 0; 0; 0; 0; 0
43.2; 3.24; 0; 0; 0; 0; 0; 0; 0; 0
43.2; 0; 4.4; 0; 0; 0; 0; 0; 0; 0
41.2; 0; 0; 5.1; 0; 0; 0; 0; 0; 0
40; 0; 0; 0; 5.57; 0; 0; 0; 0; 0
39.6; 0; 0; 0; 0; 5.84; 0; 0; 0; 0
39; 0; 0; 0; 0; 0; 5.93; 0; 0; 0
39.2; 0; 0; 0; 0; 0; 0; 6.03; 0; 0
39.4; 0; 0; 0; 0; 0; 0; 0; 6.08; 0
40.6; 0; 0; 0; 0; 0; 0; 0; 0; 6.11
52; 3.66; 4.87; 5.68; 6.16; 6.42; 6.55; 6.62; 6.68; 6.69
60; 3.88; 5.11; 5.9; 6.33; 6.58; 6.73; 6.8; 6.88; 6.91
75; 4; 5.26; 6.04; 6.46; 6.72; 6.91; 7.04; 7.19; 7.27
90; 3.9; 5.16; 6; 6.51; 6.82; 7.01; 7.14; 7.43; 7.61
110; 3.7; 5.04; 6.02; 6.57; 6.89; 7.16; 7.41; 7.81; 8.04
120; 3.54; 4.85; 5.84; 6.47; 6.83; 7.1; 7.37; 7.96; 8.44
135; 3.12; 4.34; 5.35; 6.13; 6.62; 6.94; 7.22; 7.82; 8.54
150; 2.56; 3.71; 4.74; 5.59; 6.25; 6.67; 6.96; 7.52; 8.18
147.5; 2.63; 0; 0; 0; 0; 0; 0; 0; 0
147.5; 0; 3.81; 0; 0; 0; 0; 0; 0; 0
152.1; 0; 0; 4.65; 0; 0; 0; 0; 0; 0
156.1; 0; 0; 0; 5.34; 0; 0; 0; 0; 0
162.4; 0; 0; 0; 0; 5.83; 0; 0; 0; 0
168.9; 0; 0; 0; 0; 0; 6.24; 0; 0; 0
177.7; 0; 0; 0; 0; 0; 0; 6.54; 0; 0
179; 0; 0; 0; 0; 0; 0; 0; 7.1; 0
178.6; 0; 0; 0; 0; 0; 0; 0; 0; 7.63`;

// Mock app object for debug logging (optional)
const mockApp = {
  debug: (...args) => {
    if (process.env.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }
};

/**
 * Test suite for PolarTable class
 */
class PolarTableTest {
  constructor() {
    this.testCount = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  /**
   * Assert helper function
   */
  assert(condition, message) {
    this.testCount++;
    if (condition) {
      this.passedTests++;
      console.log(`✅ PASS: ${message}`);
    } else {
      this.failedTests++;
      console.log(`❌ FAIL: ${message}`);
    }
  }

  /**
   * Assert approximately equal for floating point numbers
   */
  assertApproxEqual(actual, expected, tolerance = 0.01, message) {
    const diff = Math.abs(actual - expected);
    this.assert(diff <= tolerance, `${message} (expected ~${expected}, got ${actual}, diff: ${diff.toFixed(4)})`);
  }

  /**
   * Test basic instantiation and properties
   */
  testBasicFunctionality() {
    console.log('\n=== Testing Basic Functionality ===');
    
    const polar = new PolarTable();
    
    this.assert(polar.getPerformanceAdjustment() === 1, 'Default performance adjustment is 1.0');
    
    polar.setPerformanceAdjustment(0.9);
    this.assert(polar.getPerformanceAdjustment() === 0.9, 'Performance adjustment can be set');
    
    // Reset for other tests
    polar.setPerformanceAdjustment(1.0);
  }

  /**
   * Test empty table handling
   */
  testEmptyTableHandling() {
    console.log('\n=== Testing Empty Table Handling ===');
    
    const polar = new PolarTable();
    
    // Test with empty table
    this.assert(polar.getBeatAngle(SI.fromKnots(10)) === null, 'Returns null for empty table - getBeatAngle');
    this.assert(polar.getBoatSpeed(SI.fromKnots(10), SI.fromDegrees(45)) === null, 'Returns null for empty table - getBoatSpeed');
    this.assert(polar.getRunAngle(SI.fromKnots(10)) === null, 'Returns null for empty table - getRunAngle');
    this.assert(polar.getBeatVMG(SI.fromKnots(10)) === null, 'Returns null for empty table - getBeatVMG');
    this.assert(polar.getMaxSpeed(SI.fromKnots(10)) === null, 'Returns null for empty table - getMaxSpeed');
  }

  /**
   * Test CSV loading functionality
   */
  testCSVLoading() {
    console.log('\n=== Testing CSV Loading ===');
    
    const polar = new PolarTable();
    const result = polar.loadFromJieter(csv, mockApp);
    
    this.assert(result === polar, 'loadFromJieter returns the instance for chaining');
    this.assert(Array.isArray(polar.table), 'Table is loaded as array');
    this.assert(polar.table.length > 0, 'Table contains data after loading');
    
    // Check first entry structure
    const firstEntry = polar.table[0];
    this.assert(typeof firstEntry.tws === 'number', 'TWS is converted to number');
    this.assert(Array.isArray(firstEntry.twa), 'TWA array exists');
    this.assert(typeof firstEntry['Max speed'] === 'number', 'Max speed is calculated');
    this.assert(typeof firstEntry['Beat angle'] !== 'undefined', 'Beat angle is set');
    this.assert(typeof firstEntry['Run angle'] !== 'undefined', 'Run angle is set');
  }

  /**
   * Test interpolation with real data points
   */
  testInterpolation() {
    console.log('\n=== Testing Interpolation ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    
    // Test exact value lookup (should match CSV data - 90° at 12 knots = 6.82 knots)
    const speed90deg12kts = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(90));
    this.assertApproxEqual(speed90deg12kts, SI.fromKnots(6.82), 0.1, 'Exact lookup matches CSV data');
    
    // Test interpolation between wind speeds (between 12kt and 14kt at 90°)
    const speed90deg13kts = polar.getBoatSpeed(SI.fromKnots(13), SI.fromDegrees(90));
    const expected13kts = (SI.fromKnots(6.82) + SI.fromKnots(7.01)) / 2;
    this.assertApproxEqual(speed90deg13kts, expected13kts, 0.1, 'Interpolates between wind speeds');
    
    // Test interpolation between angles (between 75° and 90° at 12kt)
    const speed82deg12kts = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(82.5));
    const expected82deg = (SI.fromKnots(6.72) + SI.fromKnots(6.82)) / 2;
    this.assertApproxEqual(speed82deg12kts, expected82deg, 0.2, 'Interpolates between wind angles');
  }

  /**
   * Test optimal angle methods
   */
  testOptimalAngles() {
    console.log('\n=== Testing Optimal Angles ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    
    // Test beat angle (should be around 39-43 degrees based on your CSV data)
    const beatAngle = polar.getBeatAngle(SI.fromKnots(12));
    this.assert(beatAngle !== null, 'Beat angle is calculated');
    this.assert(beatAngle > 0 && beatAngle < Math.PI/2, 'Beat angle is in valid range (0-90°)');
    console.log(`   Beat angle at 12kt: ${SI.toDegrees(beatAngle).toFixed(1)}°`);
    
    // Test run angle (should be around 162-178 degrees based on your CSV data)
    const runAngle = polar.getRunAngle(SI.fromKnots(12));
    this.assert(runAngle !== null, 'Run angle is calculated');
    this.assert(runAngle > Math.PI/2 && runAngle <= Math.PI, 'Run angle is in valid range (90-180°)');
    console.log(`   Run angle at 12kt: ${SI.toDegrees(runAngle).toFixed(1)}°`);
    
    // Test max speed angle
    const maxSpeedAngle = polar.getMaxSpeedAngle(SI.fromKnots(12));
    this.assert(maxSpeedAngle !== null, 'Max speed angle is calculated');
    this.assert(maxSpeedAngle >= 0 && maxSpeedAngle <= Math.PI, 'Max speed angle is in valid range');
    console.log(`   Max speed angle at 12kt: ${SI.toDegrees(maxSpeedAngle).toFixed(1)}°`);
  }

  /**
   * Test VMG calculations with real data
   */
  testVMGCalculations() {
    console.log('\n=== Testing VMG Calculations ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    
    // Test beat VMG
    const beatVMG = polar.getBeatVMG(SI.fromKnots(12));
    this.assert(beatVMG !== null, 'Beat VMG is calculated');
    this.assert(beatVMG > 0, 'Beat VMG is positive');
    console.log(`   Beat VMG at 12kt: ${SI.toKnots(beatVMG).toFixed(2)} knots`);
    
    // Test run VMG
    const runVMG = polar.getRunVMG(SI.fromKnots(12));
    this.assert(runVMG !== null, 'Run VMG is calculated');
    this.assert(runVMG > 0, 'Run VMG is positive');
    console.log(`   Run VMG at 12kt: ${SI.toKnots(runVMG).toFixed(2)} knots`);
    
    // Test general VMG calculation at 60 degrees
    const vmg60deg = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(60));
    const boatSpeed60deg = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(60));
    const expectedVMG = boatSpeed60deg * Math.cos(SI.fromDegrees(60));
    this.assertApproxEqual(vmg60deg, expectedVMG, 0.01, 'VMG calculation matches formula');
    
    // Test VMG at 90 degrees (should be near zero)
    const vmg90deg = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(90));
    this.assertApproxEqual(vmg90deg, 0, 0.1, 'VMG at 90° is near zero');
  }

  /**
   * Test performance adjustment scaling
   */
  testPerformanceAdjustment() {
    console.log('\n=== Testing Performance Adjustment ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    
    // Get baseline values at 100% performance
    polar.setPerformanceAdjustment(1.0);
    const baselineSpeed = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(90));
    const baselineBeatVMG = polar.getBeatVMG(SI.fromKnots(12));
    const baselineMaxSpeed = polar.getMaxSpeed(SI.fromKnots(12));
    
    // Test 90% performance
    polar.setPerformanceAdjustment(0.9);
    const reducedSpeed = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(90));
    const reducedBeatVMG = polar.getBeatVMG(SI.fromKnots(12));
    const reducedMaxSpeed = polar.getMaxSpeed(SI.fromKnots(12));
    
    this.assertApproxEqual(reducedSpeed, baselineSpeed * 0.9, 0.01, 'Boat speed scaled by performance adjustment');
    this.assertApproxEqual(reducedBeatVMG, baselineBeatVMG * 0.9, 0.01, 'Beat VMG scaled by performance adjustment');
    this.assertApproxEqual(reducedMaxSpeed, baselineMaxSpeed * 0.9, 0.01, 'Max speed scaled by performance adjustment');
    
    // Test that angles are NOT affected by performance adjustment
    polar.setPerformanceAdjustment(1.0);
    const baselineBeatAngle = polar.getBeatAngle(SI.fromKnots(12));
    polar.setPerformanceAdjustment(0.9);
    const adjustedBeatAngle = polar.getBeatAngle(SI.fromKnots(12));
    
    this.assertApproxEqual(adjustedBeatAngle, baselineBeatAngle, 0.001, 'Angles not affected by performance adjustment');
  }

  /**
   * Test edge cases and error handling
   */
  testEdgeCases() {
    console.log('\n=== Testing Edge Cases ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    
    // Test very low wind speed (below CSV range)
    const lowWindSpeed = polar.getBoatSpeed(SI.fromKnots(2), SI.fromDegrees(90));
    this.assert(lowWindSpeed !== null, 'Handles very low wind speed');
    this.assert(lowWindSpeed >= 0, 'Low wind speed gives non-negative result');
    
    // Test very high wind speed (above CSV range)
    const highWindSpeed = polar.getBoatSpeed(SI.fromKnots(30), SI.fromDegrees(90));
    this.assert(highWindSpeed !== null, 'Handles very high wind speed');
    this.assert(highWindSpeed > 0, 'High wind speed gives positive result');
    
    // Test extreme angles
    const speed0deg = polar.getBoatSpeed(SI.fromKnots(12), 0);
    const speed180deg = polar.getBoatSpeed(SI.fromKnots(12), Math.PI);
    this.assert(speed0deg !== null, 'Handles 0° angle');
    this.assert(speed180deg !== null, 'Handles 180° angle');
    
    // Test negative performance adjustment
    polar.setPerformanceAdjustment(-0.5);
    const negativeResult = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(90));
    this.assert(negativeResult < 0, 'Negative performance adjustment gives negative speed');
  }

  /**
   * Test port tack (negative wind angles) with symmetry
   */
  testPortTackAngles() {
    console.log('\n=== Testing Port Tack (Negative Wind Angles) with Symmetry ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    
    // Test that negative angles work with symmetry (should mirror positive angles)
    // -45° should behave like +45° for boat speed
    const speedMinus45 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(-45));
    const speedPlus45 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(45));
    this.assert(speedMinus45 !== null, 'Handles negative wind angles (-45°)');
    this.assertApproxEqual(speedMinus45, speedPlus45, 0.01, 'Port and starboard boat speeds are symmetric (-45° = +45°)');
    console.log(`   Speed at -45°: ${speedMinus45 ? SI.toKnots(speedMinus45).toFixed(2) : 'null'}kt`);
    console.log(`   Speed at +45°: ${speedPlus45 ? SI.toKnots(speedPlus45).toFixed(2) : 'null'}kt`);
    
    // Test -90° (port beam reach)
    const speedMinus90 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(-90));
    const speedPlus90 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(90));
    this.assert(speedMinus90 !== null, 'Handles negative wind angles (-90°)');
    this.assertApproxEqual(speedMinus90, speedPlus90, 0.01, 'Port and starboard boat speeds are symmetric (-90° = +90°)');
    console.log(`   Speed at -90°: ${speedMinus90 ? SI.toKnots(speedMinus90).toFixed(2) : 'null'}kt`);
    console.log(`   Speed at +90°: ${speedPlus90 ? SI.toKnots(speedPlus90).toFixed(2) : 'null'}kt`);
    
    // Test -135° (port broad reach)
    const speedMinus135 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(-135));
    const speedPlus135 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(135));
    this.assert(speedMinus135 !== null, 'Handles negative wind angles (-135°)');
    this.assertApproxEqual(speedMinus135, speedPlus135, 0.01, 'Port and starboard boat speeds are symmetric (-135° = +135°)');
    console.log(`   Speed at -135°: ${speedMinus135 ? SI.toKnots(speedMinus135).toFixed(2) : 'null'}kt`);
    console.log(`   Speed at +135°: ${speedPlus135 ? SI.toKnots(speedPlus135).toFixed(2) : 'null'}kt`);
    
    // Test VMG calculations with negative angles (should preserve angle sign)
    const vmgMinus60 = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(-60));
    const vmgPlus60 = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(60));
    this.assert(vmgMinus60 !== null, 'VMG calculation works with negative angles');
    this.assertApproxEqual(vmgMinus60, vmgPlus60, 0.01, 'VMG magnitude is symmetric between port and starboard');
    console.log(`   VMG at -60°: ${vmgMinus60 ? SI.toKnots(vmgMinus60).toFixed(2) : 'null'}kt`);
    console.log(`   VMG at +60°: ${vmgPlus60 ? SI.toKnots(vmgPlus60).toFixed(2) : 'null'}kt`);
    
    // Test extreme negative angle (-180°)
    const speedMinus180 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(-180));
    const speedPlus180 = polar.getBoatSpeed(SI.fromKnots(12), SI.fromDegrees(180));
    this.assert(speedMinus180 !== null, 'Handles extreme negative angle (-180°)');
    this.assertApproxEqual(speedMinus180, speedPlus180, 0.01, 'Extreme angles show symmetry (-180° = +180°)');
    console.log(`   Speed at -180°: ${speedMinus180 ? SI.toKnots(speedMinus180).toFixed(2) : 'null'}kt`);
    console.log(`   Speed at +180°: ${speedPlus180 ? SI.toKnots(speedPlus180).toFixed(2) : 'null'}kt`);
    
    // Test that VMG for beam reach approaches zero regardless of sign
    const vmgMinus90 = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(-90));
    const vmgPlus90 = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(90));
    this.assertApproxEqual(vmgMinus90, 0, 0.1, 'VMG at -90° is near zero');
    this.assertApproxEqual(vmgPlus90, 0, 0.1, 'VMG at +90° is near zero');
  }

  /**
   * Test real sailing scenarios
   */
  testRealSailingScenarios() {
    console.log('\n=== Testing Real Sailing Scenarios ===');
    
    const polar = new PolarTable();
    polar.loadFromJieter(csv, mockApp);
    polar.setPerformanceAdjustment(0.95); // Realistic 95% performance
    
    const scenarios = [
      { tws: 8, twa: 45, desc: 'Light air close hauled (starboard)' },
      { tws: 8, twa: -45, desc: 'Light air close hauled (port)' },
      { tws: 12, twa: 90, desc: 'Medium wind beam reach (starboard)' },
      { tws: 12, twa: -90, desc: 'Medium wind beam reach (port)' },
      { tws: 20, twa: 135, desc: 'Strong wind broad reach (starboard)' },
      { tws: 20, twa: -135, desc: 'Strong wind broad reach (port)' },
      { tws: 6, twa: 60, desc: 'Light air close reach (starboard)' },
      { tws: 6, twa: -60, desc: 'Light air close reach (port)' },
      { tws: 16, twa: 120, desc: 'Fresh wind broad reach (starboard)' },
      { tws: 16, twa: -120, desc: 'Fresh wind broad reach (port)' }
    ];
    
    let allScenariosWork = true;
    scenarios.forEach(scenario => {
      const speed = polar.getBoatSpeed(SI.fromKnots(scenario.tws), SI.fromDegrees(scenario.twa));
      const vmg = polar.getVMG(SI.fromKnots(scenario.tws), SI.fromDegrees(scenario.twa));
      
      if (speed === null || vmg === null) {
        allScenariosWork = false;
      } else {
        console.log(`   ${scenario.desc} (${scenario.tws}kt @ ${scenario.twa}°): ${SI.toKnots(speed).toFixed(1)}kt, VMG ${SI.toKnots(vmg).toFixed(1)}kt`);
      }
    });
    
    this.assert(allScenariosWork, 'All real sailing scenarios return valid results');
  }

  /**
   * Run all tests
   */
  runAllTests() {
    console.log('🚤 Starting PolarTable Test Suite with Real Sailboat Data');
    console.log('=========================================================');
    
    this.testBasicFunctionality();
    this.testEmptyTableHandling();
    this.testCSVLoading();
    this.testInterpolation();
    this.testOptimalAngles();
    this.testVMGCalculations();
    this.testPerformanceAdjustment();
    this.testEdgeCases();
    this.testPortTackAngles();
    this.testRealSailingScenarios();
    
    console.log('\n=========================================================');
    console.log(`📊 Test Results: ${this.passedTests}/${this.testCount} passed`);
    
    if (this.failedTests === 0) {
      console.log('🎉 All tests passed! PolarTable is working correctly with your sailboat data.');
    } else {
      console.log(`⚠️  ${this.failedTests} test(s) failed. Please check the implementation.`);
    }
    
    return this.failedTests === 0;
  }
}

/**
 * Demonstrate practical usage with the loaded polar data
 */
function demonstrateUsage() {
  console.log('\n🧪 Practical Usage Demonstration');
  console.log('=================================');
  
  const polar = new PolarTable();
  polar.loadFromJieter(csv);
  polar.setPerformanceAdjustment(0.95); // Conservative 95% performance
  
  console.log('Your sailboat polar table loaded successfully!');
  console.log(`Wind speed range: 4-24 knots`);
  console.log(`Wind angle range: 0-180 degrees`);
  
  // Show optimal performance at different wind speeds
  console.log('\nOptimal performance summary:');
  [6, 10, 16, 20].forEach(windSpeed => {
    const beatAngle = polar.getBeatAngle(SI.fromKnots(windSpeed));
    const runAngle = polar.getRunAngle(SI.fromKnots(windSpeed));
    const maxSpeed = polar.getMaxSpeed(SI.fromKnots(windSpeed));
    const beatVMG = polar.getBeatVMG(SI.fromKnots(windSpeed));
    const runVMG = polar.getRunVMG(SI.fromKnots(windSpeed));
    
    console.log(`\n${windSpeed} knots:`);
    console.log(`  Beat: ${SI.toDegrees(beatAngle).toFixed(1)}° (VMG ${SI.toKnots(beatVMG).toFixed(1)}kt)`);
    console.log(`  Run:  ${SI.toDegrees(runAngle).toFixed(1)}° (VMG ${SI.toKnots(runVMG).toFixed(1)}kt)`);
    console.log(`  Max speed: ${SI.toKnots(maxSpeed).toFixed(1)}kt`);
  });
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new PolarTableTest();
  const allPassed = testSuite.runAllTests();
  
  if (allPassed) {
    demonstrateUsage();
  }
  
  process.exit(allPassed ? 0 : 1);
}

module.exports = { PolarTableTest, csv, mockApp };




