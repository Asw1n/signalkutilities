/**
 * Base class for statistical smoothers.
 * Subclasses should implement their own smoothing logic.
 */
class BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options for the smoother.
   *   Subclasses may define their own options structure.
   */
  constructor(options = {}) {
    this._options = options;
    this.reset();
  }

  /**
   * Reset the smoother state.
   * @param {number} [estimate=0] - Initial estimate.
   * @param {number} [variance=0] - Initial variance.
   */
  reset(estimate=0, variance =0) {
    // Reset the smoother state
    this._estimate = estimate;
    this._variance = variance;
  }

  /**
   * Add a new value to the smoother.
   * @param {number} value - The new value.
   * @param {number} [variance=0] - The variance of the value.
   */
  add(value, variance = 0) {  
    this._estimate = value;
    this._variance = variance;
  }

  /**
   * Get the current estimate.
   * @returns {number}
   */
  get estimate() {
    return this._estimate;
  } 
  /**
   * Get the current variance.
   * @returns {number}
   */
  get variance() {
    return this._variance;  
  }
  /**
   * Get the current options.
   * @returns {Object}
   */
  get options() {
    return this._options; 
  }

  /**
   * Set new options and reset the smoother.
   * @param {Object} opts
   */
  set options(opts) {
    this._options = opts;
    this.reset();
  }
}

/**
 * Moving average smoother with a time window.
 * Does not use variance.
 */
class MovingAverageSmoother extends BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.timeSpan=1] - Time window in seconds for the moving average.
   */
  constructor(options = {}) {
    super(options);
  }

  /**
   * Reset the moving average window and state.
   */
  reset() {
    super.reset();
    this._timeSpan = this._options.timeSpan || 1; 
    this._window = []; 
    this._estimate = null;
    this._variance = null; 
  }

  /**
   * Add a new value to the moving average.
   * @param {number} value - The new value.
   */
  add(value) {
    // nb, variance cannot be used here
    this._window.push({ value, timestamp: Date.now() });
    const cutoff = Date.now() - this._timeSpan*1000;
    this._window = this._window.filter(entry => entry.timestamp >= cutoff);
    this._estimate = this._window.reduce((sum, entry) => sum + entry.value, 0) / this._window.length;
    this._variance = this._window.reduce((sum, entry) => sum + Math.pow(entry.value - this._estimate, 2), 0) / this._window.length;
  }

  /**
   * Get the standard error of the mean.
   * @returns {number|null}
   */
  get standardError() {
    return this._variance !== null && this._window.length > 0 ? Math.sqrt(this._variance / this._window.length) : null;
  }
}

/**
 * Exponential smoother (exponential moving average).
 */
class ExponentialSmoother extends BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.tau=1] - Time constant (in seconds) for exponential smoothing.
   */
  constructor(options = {}) {
    super(options);
  } 

  /**
   * Reset the exponential smoother state.
   */
  reset() {
    super.reset();
    this._tau = this._options.tau || 1; 
    this._estimate = null;
    this._variance = null;
    this._lastTime = null;
  }

  /**
   * Add a new value to the exponential smoother.
   * @param {number} value - The new value.
   */
  add(value) {
    const now = Date.now();
    if (this._estimate === null) {
      this._estimate = value;
      this._variance = 0;
      this._lastTime = now;
      return;
    }
  
    const dt = (now - this._lastTime) / 1000; // seconds
    const alpha = 1 - Math.exp(-dt / this._tau);
  
    // Update estimate (mean)
    const prevEstimate = this._estimate;
    this._estimate = alpha * value + (1 - alpha) * this._estimate;
  
    // Update variance
    if (this._variance === null) this._variance = 0;
    this._variance = (1 - alpha) * (this._variance + alpha * Math.pow(value - prevEstimate, 2));
  
    this._lastTime = now;
  }
}

/**
 * Kalman smoother (1D Kalman filter).
 */
class KalmanSmoother extends BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.processVariance=0.1] - Process variance (Q) for the Kalman filter.
   * @param {number} [options.measurementVariance=0.4] - Measurement variance (R) for the Kalman filter.
   * @param {number} [options.steadyState] - Optional steady-state Kalman gain (between 0 and 1).
   */
  constructor(options = {}) {
    super(options);
    this.reset();
  } 

  /**
   * Reset the Kalman filter state.
   * @param {number|null} [estimate] - Initial estimate.
   * @param {number|null} [variance] - Initial variance.
   */
  reset(estimate=null, variance=null) {
    super.reset();
    if (isFinite(this._options.steadyState) ) {
      const K = this._options.steadyState;
      if (K <= 0 || K >= 1) {
        throw new Error('steadyState must be between 0 and 1 (exclusive)');
      }
      const ratio = (K * K - K) / (K - 1);
      this._measurementVariance = 1/ratio ;
      this._processVariance = 1;
    }
    else {
    this._processVariance = this._options.processVariance || 1; 
    this._measurementVariance = this._options.measurementVariance || 4; 
  }
    this._estimate = estimate;
    this._variance = variance;
  } 

  /**
   * Add a new value to the Kalman filter.
   * @param {number} value - The new value.
   * @param {number} [measurementVariance] - Measurement variance for this value.
   */
  add(value, measurementVariance = this._measurementVariance) {
    if (measurementVariance <= 0) {
      measurementVariance = this._measurementVariance;
    }
    if (this._estimate === null) {
      this._estimate = value;
      this._variance = measurementVariance;
      return;
    }
    // Prediction step
    this._variance += this._processVariance;  
    // Update step
    const kalmanGain = this._variance / (this._variance + measurementVariance);
    this._estimate += kalmanGain * (value - this._estimate);
    this._variance *= (1 - kalmanGain);
  }
}

module.exports = {
  BaseSmoother,
  MovingAverageSmoother,
  ExponentialSmoother,
  KalmanSmoother
};