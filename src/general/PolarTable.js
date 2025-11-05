const SI = require('./SI');

/**
 * PolarTable - A class for managing and interpolating sailing boat polar performance data.
 * 
 * Polar tables contain boat performance data across different True Wind Speeds (TWS) and 
 * True Wind Angles (TWA), including optimal sailing angles, speeds, and VMG calculations.
 * 
 * The class provides interpolation capabilities to get smooth performance data for any
 * wind condition, even between measured data points.
 * 
 * @example
 * const polar = new PolarTable();
 * polar.loadFromJieter(csvData);
 * polar.setPerformanceAdjustment(0.9); // 90% performance
 * 
 * const beatAngle = polar.getBeatAngle(SI.fromKnots(12)); // Get optimal beating angle
 * const boatSpeed = polar.getBoatSpeed(SI.fromKnots(15), SI.fromDegrees(90)); // Get boat speed
 */
class PolarTable {
  /**
   * Creates a new PolarTable instance.
   * Initializes with empty table and default performance adjustment of 1.0 (100%).
   */
  constructor() {
    this.table = [];
    this.perfAdjust = 1;
  }

  /**
   * Sets the performance adjustment factor for all speed-related calculations.
   * This allows scaling the entire polar table performance up or down.
   * 
   * @param {number} value - Performance multiplier (1.0 = 100%, 0.9 = 90%, etc.)
   * @example
   * polar.setPerformanceAdjustment(0.85); // Conservative 85% performance
   * polar.setPerformanceAdjustment(1.1);  // Optimistic 110% performance
   */
  setPerformanceAdjustment(value) {
    this.perfAdjust = value;
  }

  /**
   * Gets the current performance adjustment factor.
   * 
   * @returns {number} Current performance multiplier
   */
  getPerformanceAdjustment() {
    return this.perfAdjust;
  }

  /**
   * Helper function to find the two closest TWS values and calculate interpolation ratio.
   * Handles edge cases where target TWS is outside the available data range.
   * 
   * @private
   * @param {number} targetTws - Target True Wind Speed in m/s
   * @returns {Object|null} Interpolation data with lowerIndex, upperIndex, and ratio, or null if no data
   */
  _findTwsInterpolation(targetTws) {
    if (!this.table || this.table.length === 0) {
      return null;
    }

    // Find the two closest TWS values
    let lowerIndex = -1;
    let upperIndex = -1;

    for (let i = 0; i < this.table.length; i++) {
      if (this.table[i].tws <= targetTws) {
        lowerIndex = i;
      }
      if (this.table[i].tws >= targetTws && upperIndex === -1) {
        upperIndex = i;
        break;
      }
    }

    // Edge case: target TWS is below all available data
    if (lowerIndex === -1) {
      return { lowerIndex: 0, upperIndex: 0, ratio: 0 };
    }

    // Edge case: target TWS is above all available data
    if (upperIndex === -1) {
      const lastIndex = this.table.length - 1;
      return { lowerIndex: lastIndex, upperIndex: lastIndex, ratio: 0 };
    }

    // Exact match or normal interpolation
    if (lowerIndex === upperIndex) {
      return { lowerIndex: lowerIndex, upperIndex: upperIndex, ratio: 0 };
    }

    // Calculate interpolation ratio
    const lowerTws = this.table[lowerIndex].tws;
    const upperTws = this.table[upperIndex].tws;
    const ratio = (targetTws - lowerTws) / (upperTws - lowerTws);

    return { lowerIndex: lowerIndex, upperIndex: upperIndex, ratio: ratio };
  }

  /**
   * Helper function to find the two closest TWA values and interpolation ratio within a TWS entry.
   * Used for bilinear interpolation when getting boat speeds at specific wind angles.
   * 
   * @private
   * @param {Array} twaArray - Array of TWA data points from a specific TWS entry
   * @param {number} targetTwa - Target True Wind Angle in radians
   * @returns {Object|null} Interpolation data with lowerIndex, upperIndex, and ratio, or null if no data
   */
  _findTwaInterpolation(twaArray, targetTwa) {
    if (!twaArray || twaArray.length === 0) {
      return null;
    }

    // Find the two closest TWA values
    let lowerIndex = -1;
    let upperIndex = -1;

    for (let i = 0; i < twaArray.length; i++) {
      if (twaArray[i].twa <= targetTwa) {
        lowerIndex = i;
      }
      if (twaArray[i].twa >= targetTwa && upperIndex === -1) {
        upperIndex = i;
        break;
      }
    }

    // Edge case: target TWA is below all available data
    if (lowerIndex === -1) {
      return { lowerIndex: 0, upperIndex: 0, ratio: 0 };
    }

    // Edge case: target TWA is above all available data
    if (upperIndex === -1) {
      const lastIndex = twaArray.length - 1;
      return { lowerIndex: lastIndex, upperIndex: lastIndex, ratio: 0 };
    }

    // Exact match or normal interpolation
    if (lowerIndex === upperIndex) {
      return { lowerIndex: lowerIndex, upperIndex: upperIndex, ratio: 0 };
    }

    // Calculate interpolation ratio
    const lowerTwa = twaArray[lowerIndex].twa;
    const upperTwa = twaArray[upperIndex].twa;
    const ratio = (targetTwa - lowerTwa) / (upperTwa - lowerTwa);

    return { lowerIndex: lowerIndex, upperIndex: upperIndex, ratio: ratio };
  }

  /**
   * Gets the optimal beating angle (upwind) for a given true wind speed.
   * Uses linear interpolation between the closest TWS data points.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @returns {number|null} Optimal beating angle in radians, or null if no data available
   * @example
   * const beatAngle = polar.getBeatAngle(SI.fromKnots(12)); // Get beat angle for 12 knots
   */
  getBeatAngle(tws) {
    const interpolation = this._findTwsInterpolation(tws);
    if (!interpolation) {
      return null;
    }

    const lowerAngle = this.table[interpolation.lowerIndex]['Beat angle'];
    const upperAngle = this.table[interpolation.upperIndex]['Beat angle'];
    return lowerAngle + interpolation.ratio * (upperAngle - lowerAngle);
  }

  /**
   * Gets the optimal running angle (downwind) for a given true wind speed.
   * Uses linear interpolation between the closest TWS data points.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @returns {number|null} Optimal running angle in radians, or null if no data available
   * @example
   * const runAngle = polar.getRunAngle(SI.fromKnots(20)); // Get run angle for 20 knots
   */
  getRunAngle(tws) {
    const interpolation = this._findTwsInterpolation(tws);
    if (!interpolation) {
      return null;
    }

    const lowerAngle = this.table[interpolation.lowerIndex]['Run angle'];
    const upperAngle = this.table[interpolation.upperIndex]['Run angle'];
    return lowerAngle + interpolation.ratio * (upperAngle - lowerAngle);
  }

  /**
   * Gets the Velocity Made Good (VMG) when beating for a given true wind speed.
   * VMG represents the effective speed toward the wind direction.
   * Result is scaled by the performance adjustment factor.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @returns {number|null} Beat VMG in m/s (scaled by perfAdjust), or null if no data available
   * @example
   * const beatVMG = polar.getBeatVMG(SI.fromKnots(15)); // Get beat VMG for 15 knots
   */
  getBeatVMG(tws) {
    const interpolation = this._findTwsInterpolation(tws);
    if (!interpolation) {
      return null;
    }

    const lowerVMG = this.table[interpolation.lowerIndex]['Beat VMG'];
    const upperVMG = this.table[interpolation.upperIndex]['Beat VMG'];
    return (lowerVMG + interpolation.ratio * (upperVMG - lowerVMG)) * this.perfAdjust;
  }

  /**
   * Gets the Velocity Made Good (VMG) when running for a given true wind speed.
   * VMG represents the effective speed away from the wind direction.
   * Result is scaled by the performance adjustment factor.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @returns {number|null} Run VMG in m/s (scaled by perfAdjust), or null if no data available
   * @example
   * const runVMG = polar.getRunVMG(SI.fromKnots(18)); // Get run VMG for 18 knots
   */
  getRunVMG(tws) {
    const interpolation = this._findTwsInterpolation(tws);
    if (!interpolation) {
      return null;
    }

    const lowerVMG = this.table[interpolation.lowerIndex]['Run VMG'];
    const upperVMG = this.table[interpolation.upperIndex]['Run VMG'];
    return (lowerVMG + interpolation.ratio * (upperVMG - lowerVMG)) * this.perfAdjust;
  }

  /**
   * Gets the maximum achievable boat speed for a given true wind speed.
   * This represents the peak performance speed regardless of wind angle.
   * Result is scaled by the performance adjustment factor.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @returns {number|null} Maximum boat speed in m/s (scaled by perfAdjust), or null if no data available
   * @example
   * const maxSpeed = polar.getMaxSpeed(SI.fromKnots(25)); // Get max speed for 25 knots
   */
  getMaxSpeed(tws) {
    const interpolation = this._findTwsInterpolation(tws);
    if (!interpolation) {
      return null;
    }

    const lowerSpeed = this.table[interpolation.lowerIndex]['Max speed'];
    const upperSpeed = this.table[interpolation.upperIndex]['Max speed'];
    return (lowerSpeed + interpolation.ratio * (upperSpeed - lowerSpeed)) * this.perfAdjust;
  }

  /**
   * Gets the true wind angle at which maximum speed is achieved for a given true wind speed.
   * This indicates the optimal angle for achieving peak boat speed.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @returns {number|null} Angle of maximum speed in radians, or null if no data available
   * @example
   * const maxSpeedAngle = polar.getMaxSpeedAngle(SI.fromKnots(20)); // Get angle for max speed
   */
  getMaxSpeedAngle(tws) {
    const interpolation = this._findTwsInterpolation(tws);
    if (!interpolation) {
      return null;
    }

    const lowerAngle = this.table[interpolation.lowerIndex]['Max speed angle'];
    const upperAngle = this.table[interpolation.upperIndex]['Max speed angle'];
    return lowerAngle + interpolation.ratio * (upperAngle - lowerAngle);
  }


  /**
   * Gets the boat speed for specific true wind speed and true wind angle.
   * Uses bilinear interpolation to provide smooth speed data between measured points.
   * Result is scaled by the performance adjustment factor.
   * 
   * Handles negative wind angles (port tack) by using symmetry - negative angles
   * are converted to their positive equivalents since sailboat performance is
   * typically symmetric between port and starboard tacks.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @param {number} twa - True Wind Angle in radians (positive or negative)
   * @returns {number|null} Boat speed in m/s (scaled by perfAdjust), or null if no data available
   * @example
   * const speed = polar.getBoatSpeed(SI.fromKnots(15), SI.fromDegrees(90)); // Speed at 15kt, 90°
   * const speedPort = polar.getBoatSpeed(SI.fromKnots(15), SI.fromDegrees(-90)); // Same as +90°
   */
  getBoatSpeed(tws, twa) {
    // Handle negative angles by using symmetry (port tack = starboard tack performance)
    const normalizedTwa = Math.abs(twa);
    
    const twsInterpolation = this._findTwsInterpolation(tws);
    if (!twsInterpolation) {
      return null;
    }

    // Get boat speed from lower TWS entry at target TWA
    const lowerTwsEntry = this.table[twsInterpolation.lowerIndex];
    const lowerTwaInterpolation = this._findTwaInterpolation(lowerTwsEntry.twa, normalizedTwa);
    if (!lowerTwaInterpolation) {
      return null;
    }

    const lowerTbs1 = lowerTwsEntry.twa[lowerTwaInterpolation.lowerIndex].tbs;
    const lowerTbs2 = lowerTwsEntry.twa[lowerTwaInterpolation.upperIndex].tbs;
    const lowerBoatSpeed = lowerTbs1 + lowerTwaInterpolation.ratio * (lowerTbs2 - lowerTbs1);

    // Get boat speed from upper TWS entry at target TWA
    const upperTwsEntry = this.table[twsInterpolation.upperIndex];
    const upperTwaInterpolation = this._findTwaInterpolation(upperTwsEntry.twa, normalizedTwa);
    if (!upperTwaInterpolation) {
      return null;
    }

    const upperTbs1 = upperTwsEntry.twa[upperTwaInterpolation.lowerIndex].tbs;
    const upperTbs2 = upperTwsEntry.twa[upperTwaInterpolation.upperIndex].tbs;
    const upperBoatSpeed = upperTbs1 + upperTwaInterpolation.ratio * (upperTbs2 - upperTbs1);

    // Interpolate between the two TWS values and scale by performance adjustment
    return (lowerBoatSpeed + twsInterpolation.ratio * (upperBoatSpeed - lowerBoatSpeed)) * this.perfAdjust;
  }

  /**
   * Gets the Velocity Made Good (VMG) for specific true wind speed and true wind angle.
   * VMG represents the component of boat speed in the direction toward or away from the wind.
   * 
   * Handles negative wind angles (port tack) correctly by using the original angle
   * for VMG calculation while using symmetry for boat speed lookup.
   * 
   * @param {number} tws - True Wind Speed in m/s
   * @param {number} twa - True Wind Angle in radians (positive or negative)
   * @returns {number|null} VMG in m/s (positive = toward wind, negative = away from wind), or null if no data
   * @example
   * const vmg = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(45)); // VMG at 12kt, 45°
   * const vmgPort = polar.getVMG(SI.fromKnots(12), SI.fromDegrees(-45)); // VMG at 12kt, -45° (port)
   */
  getVMG(tws, twa) {
    const boatSpeed = this.getBoatSpeed(tws, twa);
    if (boatSpeed === null) {
      return null;
    }

    // VMG = boat speed * cos(original true wind angle) 
    // Use original angle (not normalized) to preserve sign for VMG direction
    return boatSpeed * Math.cos(twa);
  }


  /**
   * Helper method to process the TWS header row from CSV data.
   * Creates the initial polar table structure with TWS entries.
   * 
   * @private
   * @param {Array} row - CSV row containing 'twa/tws' and wind speed values
   * @param {Object} app - Optional debug logging object
   * @returns {Array} Array of polar entries with TWS values
   */
  _processTWSHeader(row, app) {
    app && app.debug('First row with TWS columns')
    const polar = []
    for (let index = 1; index < row.length; index++) {
      polar.push({ tws: SI.fromKnots(row[index]) })
    }
    app && app.debug('polar: %s', JSON.stringify(polar))
    return polar
  }

  /**
   * Helper method to add speed data to a polar table entry.
   * Handles TWA data addition and max speed tracking.
   * 
   * @private
   * @param {Object} polarEntry - Polar table entry to update
   * @param {number} angle - True wind angle in radians
   * @param {number} tbs - True boat speed in m/s
   * @param {number} vmg - Velocity made good in m/s
   * @param {string} angleName - Optional angle property name ('Beat angle' or 'Run angle')
   * @param {string} VMGName - Optional VMG property name ('Beat VMG' or 'Run VMG')
   * @param {Object} app - Optional debug logging object
   */
  _addSpeedData(polarEntry, angle, tbs, vmg, angleName, VMGName, app) {
    if (!polarEntry.twa) {
      polarEntry.twa = []
    }
    
    // Set beat/run specific data
    if (angleName) {
      polarEntry[angleName] = angle
      polarEntry[VMGName] = this._roundDec(vmg)
    }
    
    // Add to TWA array
    polarEntry.twa.push({ twa: angle, tbs: tbs, vmg: vmg })
    
    // Update max speed if necessary
    if (!polarEntry['Max speed'] || tbs > polarEntry['Max speed']) {
      polarEntry['Max speed'] = tbs
      polarEntry['Max speed angle'] = angle
      app && app.debug('Found max speed: %s', JSON.stringify(polarEntry))
    }
  }

  /**
   * Helper method to process a speed data row from CSV.
   * Handles both regular speed data and optimal angle rows.
   * 
   * @private
   * @param {Array} row - CSV row with angle and speed data
   * @param {Array} polar - Polar table array to update
   * @param {Object} app - Optional debug logging object
   */
  _processSpeedRow(row, polar, app) {
    const angle = SI.fromDegrees(Number(row[0]))
    const halfPi = Math.PI / 2
    
    // Check if this is a beat/run angle row (multiple zeros)
    const isOptimalAngle = row.filter(i => i === '0').length > 1
    let angleName, VMGName
    
    if (isOptimalAngle) {
      app && app.debug('beat and run angles are included')
      if (angle < halfPi) {
        angleName = 'Beat angle'
        VMGName = 'Beat VMG'
        app && app.debug('cvsToPolar: row includes Beat angle: %s', row.join(';'))
      } else {
        angleName = 'Run angle'
        VMGName = 'Run VMG'
        app && app.debug('cvsToPolar: row includes Run angle: %s', row.join(';'))
      }
    }

    // Process each TWS column
    for (let index = 0; index < row.length - 1; index++) {
      const speedValue = row[index + 1]
      if (speedValue && speedValue != '0') {
        const tbs = SI.fromKnots(Number(speedValue))
        const vmg = tbs * Math.abs(Math.cos(angle))
        this._addSpeedData(polar[index], angle, tbs, vmg, angleName, VMGName, app)
      }
    }
  }

  /**
   * Helper method for decimal rounding.
   * 
   * @private
   * @param {number} num - Number to round
   * @param {number} decimals - Number of decimal places (default: 2)
   * @returns {number} Rounded number
   */
  _roundDec(num, decimals = 2) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
  }

  /**
   * Helper method to sort TWA arrays and find optimal beat/run angles.
   * Sorts all TWA data by angle and calculates best VMG angles if not already set.
   * 
   * @private
   * @param {Array} polar - Polar table array to process
   * @param {Object} app - Optional debug logging object
   */
  _sortAndOptimizePolar(polar, app) {
    const halfPi = Math.PI / 2

    // Sort the twa arrays by angle
    polar.forEach(twsEntry => {
      if (twsEntry.twa && twsEntry.twa.length > 0) {
        twsEntry.twa.sort((a, b) => a.twa - b.twa)
      }
    })

    // Find beat/run angles if not already set
    polar.forEach((twsEntry, index) => {
      // Skip entries without twa data
      if (!twsEntry.twa || twsEntry.twa.length === 0) {
        app && app.debug('Skipping TWS %s - no angle data available', SI.toKnots(twsEntry.tws).toFixed(0))
        return
      }
      
      if (typeof twsEntry['Beat angle'] === 'undefined') {
        app && app.debug('Finding beat angle for TWS %s', SI.toKnots(twsEntry.tws).toFixed(0))
        
        let beatVMG = 0, beatElement = 0, runVMG = 0, runElement = 0

        twsEntry.twa.forEach((twaObj, element) => {
          if (twaObj.twa < halfPi && twaObj.vmg > beatVMG) {
            beatVMG = twaObj.vmg
            beatElement = element
          } else if (twaObj.twa >= halfPi && twaObj.vmg > runVMG) {
            runVMG = twaObj.vmg
            runElement = element
          }
        })

        app && app.debug(
          'beatVMG for %s is %s (angle %s)',
          SI.toKnots(twsEntry.tws).toFixed(0),
          SI.toKnots(twsEntry.twa[beatElement].vmg).toFixed(2),
          SI.toDegrees(twsEntry.twa[beatElement].twa).toFixed(1)
        )
        app && app.debug(
          'runVMG for %s is %s (angle %s)',
          SI.toKnots(twsEntry.tws).toFixed(0),
          SI.toKnots(twsEntry.twa[runElement].vmg).toFixed(2),
          SI.toDegrees(twsEntry.twa[runElement].twa).toFixed(1)
        )

        twsEntry['Beat angle'] = twsEntry.twa[beatElement].twa
        twsEntry['Beat VMG'] = twsEntry.twa[beatElement].vmg
        twsEntry['Run angle'] = twsEntry.twa[runElement].twa
        twsEntry['Run VMG'] = twsEntry.twa[runElement].vmg
      }
    })
  }

  /**
   * Helper method to add padding for interpolation at wind angle extremes.
   * Adds zero-wind-speed entry and pads TWA ranges from 0 to π radians.
   * 
   * @private
   * @param {Array} polar - Polar table array to pad
   * @param {Object} app - Optional debug logging object
   */
  _addPolarPadding(polar, app) {
    // Add zero wind speed entry for low wind interpolation
    if (polar.length > 0 && polar[0].tws > 0 && polar[0].twa && polar[0].twa.length > 0) {
      app && app.debug('Add a 0 line to allow interpolation at very low wind speeds')
      const zeroEntry = {
        tws: 0.0001,
        'Beat angle': polar[0]['Beat angle'],
        'Beat VMG': polar[0]['Beat VMG'],
        'Run angle': polar[0]['Run angle'],
        'Run VMG': polar[0]['Run VMG'],
        'Max speed': 0,
        'Max speed angle': polar[0]['Max speed angle'],
        twa: polar[0].twa.map(twaObj => ({ twa: twaObj.twa, tbs: 0, vmg: 0 }))
      }
      polar.unshift(zeroEntry)
    }

    // Add padding at low and high wind angles for each TWS
    polar.forEach(twsEntry => {
      // Skip entries without twa data
      if (!twsEntry.twa || twsEntry.twa.length === 0) {
        return
      }
      
      const twaArray = twsEntry.twa
      const lowTWA = twaArray[0].twa
      const lowTBS = twaArray[0].tbs
      const highTWA = twaArray[twaArray.length - 1].twa
      const highTBS = twaArray[twaArray.length - 1].tbs

      // Pad low angles (0 to first angle)
      const topPadding = []
      for (let angle = 0; angle < lowTWA; angle += SI.fromDegrees(5)) {
        const tbs = Math.max(0, (angle / lowTWA) * Math.pow(Math.cos((-lowTWA + angle) * 2), 2) * lowTBS)
        topPadding.push({ twa: angle, tbs: tbs })
      }

      // Pad high angles (last angle to π)
      const tailPadding = []
      for (let angle = Math.PI; angle > highTWA; angle -= SI.fromDegrees(5)) {
        const tbs = Math.pow(highTWA / angle, 2) * highTBS
        tailPadding.unshift({ twa: angle, tbs: tbs })
      }

      // Combine all data
      twsEntry.twa = [...topPadding, ...twaArray, ...tailPadding]
    })
  }

  /**
   * Loads polar table data from Jieter CSV format.
   * 
   * The Jieter format is a semicolon-separated CSV with:
   * - Header row: 'twa/tws' followed by wind speeds in knots
   * - Data rows: wind angle in degrees followed by boat speeds in knots
   * - Special rows with multiple '0' values indicate optimal beat/run angles
   * 
   * The method converts all input units (knots/degrees) to internal units (m/s/radians)
   * and builds an interpolatable polar table with padding for smooth performance.
   * 
   * @param {string} csv - CSV data string in Jieter format
   * @param {Object} app - Optional debug logging object with debug() method
   * @returns {PolarTable} Returns this instance for method chaining
   * @example
   * const csvData = `twa/tws;6;8;10;12;14;16;20;25
   * 0;0;0;0;0;0;0;0;0
   * 30;3.5;4.2;4.8;5.2;5.5;5.7;6.1;6.5
   * 45;4.1;5.0;5.8;6.4;6.8;7.1;7.6;8.0`;
   * 
   * const polar = new PolarTable();
   * polar.loadFromJieter(csvData);
   */
  loadFromJieter(csv, app = null) {
    // Parse CSV into array of arrays
    const csvArray = csv.split('\n').map(row => row.split(';'))
    let polar = []

    // Process each CSV row
    csvArray.forEach(row => {
      if (row[0] === 'twa/tws') {
        polar = this._processTWSHeader(row, app)
      } else if (row[0] && !isNaN(row[0])) {
        this._processSpeedRow(row, polar, app)
      }
    })

    // Sort TWA arrays and find optimal angles
    this._sortAndOptimizePolar(polar, app)

    // Add padding and interpolation data
    this._addPolarPadding(polar, app)

    // app && app.debug(JSON.stringify(polar))
    this.table = polar
    return this
  }
}

/**
 * Internal structure of this.table after loading polar data:
 * 
 * @typedef {Object} PolarEntry
 * @property {number} tws - True Wind Speed in m/s (converted from knots)
 * @property {number} Beat angle - Optimal beating angle in radians
 * @property {number} Beat VMG - Velocity Made Good when beating in m/s
 * @property {number} Run angle - Optimal running angle in radians  
 * @property {number} Run VMG - Velocity Made Good when running in m/s
 * @property {number} Max speed - Maximum boat speed for this TWS in m/s
 * @property {number} Max speed angle - Angle at which max speed occurs in radians
 * @property {Array<Object>} twa - Array of True Wind Angle data points
 * @property {number} twa[].twa - True wind angle in radians
 * @property {number} twa[].tbs - True boat speed in m/s
 * @property {number} twa[].vmg - Velocity made good in m/s
 * 
 * @example
 * // Structure example:
 * this.table = [
 *   {
 *     tws: 2.57,  // True Wind Speed in m/s (converted from knots)
 *     'Beat angle': 0.785,  // Optimal beating angle in radians
 *     'Beat VMG': 1.2,      // Velocity Made Good when beating
 *     'Run angle': 2.356,   // Optimal running angle in radians  
 *     'Run VMG': 1.8,       // Velocity Made Good when running
 *     'Max speed': 3.5,     // Maximum boat speed for this TWS
 *     'Max speed angle': 1.57,  // Angle at which max speed occurs
 *     twa: [  // Array of True Wind Angle data points
 *       { twa: 0, tbs: 0, vmg: 0 },           // Padded start values
 *       { twa: 0.087, tbs: 0.5, vmg: 0.49 }, // Angle in rad, boat speed, VMG
 *       { twa: 0.174, tbs: 1.2, vmg: 1.18 },
 *       // ... more data points covering 0 to π radians
 *       { twa: 3.14, tbs: 2.1, vmg: -2.1 }   // Padded end values
 *     ]
 *   },
 *   // ... more TWS objects for different wind speeds
 * ]
 */

module.exports = { PolarTable };
