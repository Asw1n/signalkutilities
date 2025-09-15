class BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options for the smoother.
   *   Subclasses may define their own options structure.
   */
  constructor(options = {}) {
    this._options = options;
    this.reset();
  }

  reset() {
    // Reset the smoother state
    this._estimate = null;
    this._variance = null;
  }

  add(value) {  
  }

  get estimate() {
    return this._estimate;
  } 
  get variance() {
    return this._variance;  
  }
  get options() {
    return this._options; 
  }

  set options(opts) {
    this._options = opts;
    this.reset();
  }
}

class MovingAverageSmoother extends BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.timeSpan=1] - Time window in seconds for the moving average.
   */
  constructor(options = {}) {
    super(options);
  }

  reset() {
    super.reset();
    this._timeSpan = this._options.timeSpan || 1; 
    this._window = []; 
    this._estimate = null;
    this._variance = null; 
  }

  add(value) {
    this._window.push({ value, timestamp: Date.now() });
    const cutoff = Date.now() - this._timeSpan;
    this._window = this._window.filter(entry => entry.timestamp >= cutoff);
    this._estimate = this._window.reduce((sum, entry) => sum + entry.value, 0) / this._window.length;
    this._variance = this._window.reduce((sum, entry) => sum + Math.pow(entry.value - this._estimate, 2), 0) / this._window.length;
  }
}

class ExponentialSmoother extends BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.tau=1] - Time constant (in seconds) for exponential smoothing.
   */
  constructor(options = {}) {
    super(options);
  } 
  reset() {
    super.reset();
    this._tau = this._options.tau || 1; 
    this._estimate = null;
    this._variance = null;
    this._lastTime = null;
  }

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

class KalmanSmoother extends BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.processVariance=1] - Process variance (Q) for the Kalman filter.
   * @param {number} [options.measurementVariance=4] - Measurement variance (R) for the Kalman filter.
   */
  constructor(options = {}) {
    super(options);
  } 
  reset() {
    super.reset();
    this._processVariance = this._options.processVariance || 1; 
    this._measurementVariance = this._options.measurementVariance || 4; 
    this._estimate = null;
    this._variance = null; 
  } 
  add(value) {
    if (this._estimate === null) {
      this._estimate = value;
      this._variance = this._measurementVariance;
      return;
    }
    // Prediction step
    this._variance += this._processVariance;  
    // Update step
    const kalmanGain = this._variance / (this._variance + this._measurementVariance);
    this._estimate += kalmanGain * (value - this._estimate);
    this._variance *= (1 - kalmanGain);
  }
}

module.exports = {
  MovingAverageSmoother,
  ExponentialSmoother,
  KalmanSmoother
};