class BaseSmoother {
  /**
   * @param {Object} [options={}] - Configuration options for the smoother.
   *   Subclasses may define their own options structure.
   */
  constructor(options = {}) {
    this._options = options;
    this.reset();
  }

  reset(estimate=0, variance =0) {
    // Reset the smoother state
    this._estimate = estimate;
    this._variance = variance;
  }

  add(value, variance = 0) {  
    this._estimate = value;
    this._variance = variance;
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
    // nb, variance cannot be used here
    this._window.push({ value, timestamp: Date.now() });
    const cutoff = Date.now() - this._timeSpan*1000;
    this._window = this._window.filter(entry => entry.timestamp >= cutoff);
    this._estimate = this._window.reduce((sum, entry) => sum + entry.value, 0) / this._window.length;
    this._variance = this._window.reduce((sum, entry) => sum + Math.pow(entry.value - this._estimate, 2), 0) / this._window.length;
  }

  get standardError() {
    return this._variance !== null && this._window.length > 0 ? Math.sqrt(this._variance / this._window.length) : null;
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
   * @param {number} [options.processVariance=.1] - Process variance (Q) for the Kalman filter.
   * @param {number} [options.measurementVariance=.4] - Measurement variance (R) for the Kalman filter.
   */
  constructor(options = {}) {
    super(options);
    this.reset();
  } 
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