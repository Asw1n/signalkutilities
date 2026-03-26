const { MessageHandler } = require('./MessageHandler');
const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');


class Polar {
  static send(app, pluginId, polars) {
    let values = [];
    polars.forEach(polar => {
      if (polar.ready) {
      values.push({
        path: polar.pathMagnitude,
        value: polar.magnitude 
      });
      values.push({
        path: polar.pathAngle,
        value: polar.angle 
      });
    }
    });
    const message = {
      context: 'vessels.self',
      updates: [
        {
          $source: pluginId,
          values: values
        }]
    };
     if (values.length > 0) app.handleMessage(pluginId, message);
  }

  constructor(app, pluginId, id) {
    this._app = app;
    this._pluginId = pluginId;
    this._id = id;
    this._polarMeta = {};
    this._ready = false;
    this.magnitudeHandler = new MessageHandler(app, pluginId, id + ".magnitude");
    this.angleHandler = new MessageHandler(app, pluginId, id + ".angle");
  }

  /**
   * Gets the polar id.
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  configureAngle(pathAngle, sourceAngle, passOn = true) {
    this.angleHandler.configure(pathAngle, sourceAngle, passOn);
  }

  configureMagnitude(pathMagnitude, sourceMagnitude, passOn = true) {
    this.magnitudeHandler.configure(pathMagnitude, sourceMagnitude, passOn);
  }

  subscribe(toMagnitude = true, toAngle = true) {
    if (toMagnitude) {
      this.magnitudeHandler.onChange = this.processChanges.bind(this);
         this.magnitudeHandler.subscribe();
    } 
    if (toAngle) {
      this.angleHandler.onChange = this.processChanges.bind(this);
      this.angleHandler.subscribe();
    }
  }

  setAngleRange(range) {
    if (range === '0to2pi' || range === '-piToPi') {
      this.angleRange = range;
    }
  }



  terminate() {
    this.magnitudeHandler.terminate();
    this.angleHandler.terminate(); 
    return null;
  }

  processChanges() {
    this.xValue = this.magnitudeHandler.value * Math.cos(this.angleHandler.value);
    this.yValue = this.magnitudeHandler.value * Math.sin(this.angleHandler.value);
    this.xVariance = 0;
    this.yVariance = 0;
    this._ready = this.magnitudeHandler.ready && this.angleHandler.ready;
    if (typeof this.onChange === 'function') {
      this.onChange();
    }
  }

  copyFrom(polar) {
    this.xValue = polar.x;
    this.yValue = polar.y;
    this.xVariance = polar.xVariance;
    this.yVariance = polar.yVariance;
    this._ready = true;
  }

  substract(polar) {
    this.xValue -= polar.x;
    this.yValue -= polar.y;
    this.xVariance += polar.xVariance;
    this.yVariance += polar.yVariance;
  }
  add(polar) {
    this.xValue += polar.x;
    this.yValue += polar.y;
    this.xVariance += polar.xVariance;
    this.yVariance += polar.yVariance;
  }

  rotate(angle) {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const xNew = this.xValue * cosAngle - this.yValue * sinAngle;
    const yNew = this.xValue * sinAngle + this.yValue * cosAngle;

    // Variance transformation for independent x/y:
    const xVarNew = this.xVariance * cosAngle * cosAngle + this.yVariance * sinAngle * sinAngle;
    const yVarNew = this.xVariance * sinAngle * sinAngle + this.yVariance * cosAngle * cosAngle;

    this.xValue = xNew;
    this.yValue = yNew;
    this.xVariance = xVarNew;
    this.yVariance = yVarNew;
  }

  scale(factor) {
    this.xValue *= factor;
    this.yValue *= factor;
    this.xVariance *= factor * factor;
    this.yVariance *= factor * factor;
  }

  setPolarValue(value) {
    this.xValue = value.magnitude * Math.cos(value.angle);
    this.yValue = value.magnitude * Math.sin(value.angle);
    this.xVariance = 0;
    this.yVariance = 0;
    this._ready = true;
  }

  setVectorValue(value= { x: 0, y: 0 }, variance = { x: 0, y: 0 }) {
    this.xValue = value.x;
    this.yValue = value.y;
    this.xVariance = variance.x;
    this.yVariance = variance.y;
    this._ready = true;
  }

  setMeta(obj) {
    Object.assign(this._polarMeta, obj);
    return this;
  }

  setMetaField(key, value) {
    this._polarMeta[key] = value;
    return this;
  }

  set x(value) {
    this.xValue = value;
  }

  set y(value) {
    this.yValue = value;
  }

  /**
   * Gets static metadata for this polar.
   * Plugin-owned fields (displayName, description, plane) come from _polarMeta.
   * Handler meta is read lazily from SK via each handler's get meta().
   * @returns {Object}
   */
  get meta() {
    return {
      id: this.id,
      ...this._polarMeta,
      angleRange: this.angleRange,
      magnitude: this.magnitudeHandler.meta,
      angle: this.angleHandler.meta,
    };
  }

  /**
   * Gets dynamic state for this polar.
   * @returns {Object}
   */
  get state() {
    return {
      id: this.id,
      ready: this.ready,
      stale: this.stale,
      magnitude: this.magnitudeHandler.state,
      angle: this.angleHandler.state,
    };
  }

  get polarValue() {
    return {
      magnitude: Math.sqrt(this.xValue * this.xValue + this.yValue * this.yValue),
      angle: this._formatAngle(Math.atan2(this.yValue, this.xValue))
    };
  }

  get vectorValue() {
    return { x: this.xValue, y: this.yValue };
  }

  get vector() {
    return [this.xValue, this.yValue];
  }

  get x() {
    return this.xValue;
  }

  get y() {
    return this.yValue;
  }

  get magnitude() {
    return Math.sqrt(this.xValue * this.xValue + this.yValue * this.yValue);
  }

  get angle() {
    return this._formatAngle(Math.atan2(this.yValue, this.xValue));
  }

  get pathMagnitude() {
    return this.magnitudeHandler.path;
  }

  get pathAngle() {
    return this.angleHandler.path;
  } 

  _formatAngle(angle) {
    if (this.angleRange === '0to2pi') {
      return (angle < 0) ? angle + 2 * Math.PI : angle;
    }
    // default: -pi to pi
    return angle;
  }

  get frequency() {
    const f1 = this.magnitudeHandler.subscribed ? this.magnitudeHandler.frequency : null;
    const f2 = this.angleHandler.subscribed ? this.angleHandler.frequency : null;
    if (typeof f1 === 'number' && typeof f2 === 'number') {
      return Math.min(f1, f2);
    }
    if (typeof f1 === 'number') return f1;
    if (typeof f2 === 'number') return f2;
    return null;
  }

  get timestamp() {
    const f1 = this.magnitudeHandler.subscribed ? this.magnitudeHandler.timestamp : null;
    const f2 = this.angleHandler.subscribed ? this.angleHandler.timestamp : null;
    if (typeof f1 === 'number' && typeof f2 === 'number') {
      return Math.max(f1, f2);
    }
    if (typeof f1 === 'number') return f1;
    if (typeof f2 === 'number') return f2;
    return null;
  }

  get stale() {
    return (this.magnitudeHandler.subscribed && this.magnitudeHandler.stale) || (this.angleHandler.subscribed && this.angleHandler.stale);
  }

  /**
   * Marks this polar as having no valid value. Downstream consumers that check
   * ready will treat it as unavailable until a successful value write occurs.
   * @returns {this}
   */
  invalidate() {
    this._ready = false;
    return this;
  }

  /**
   * Returns true when this polar holds a currently valid value.
   * For subscribed polars this is set by incoming SK data and cleared on staleness.
   * For derived polars this is set by the calculation code via value-writing methods
   * and cleared by invalidate().
   * @returns {boolean}
   */
  get ready() {
    if (this.stale) return false;
    return this._ready;
  }

  get trace() {
    return Math.sqrt(this.xVariance ** 2 + this.yVariance ** 2);
  }

  report() {
    return {
      id: this.id,
      pathMagnitude: this.magnitudeHandler.path,
      pathAngle: this.angleHandler.path,
      x: this.x,
      y: this.y,
      xVariance: this.xVariance,
      yVariance: this.yVariance,
      magnitude: this.magnitude,
      angle: this.angle,
      trace: this.trace,
      state: this.state,
    };
  }

}

/**
 * PolarSmoother applies statistical smoothing to the cartesian (x, y) representation
 * of a Polar object using a specified Smoother class.
 *
 * The smoothing is applied to the x and y values (not magnitude/angle).
 * The class assumes the underlying handlers always provide numeric values.
 */
class PolarSmoother {
  /**
   * @param {string} id - Identifier for this PolarSmoother.
   * @param {Polar} polar - The Polar instance to wrap.
   * @param {Function} SmootherClass - The smoother class to use (default: ExponentialSmoother).
   * @param {Object} [smootherOptions={}] - Options for the smoother.
   */
  constructor(polar, SmootherClass = ExponentialSmoother, smootherOptions = {}) {
    this.id = polar.id + '.smoothed';
    this.polar = polar;
    this.SmootherClass = SmootherClass;
    this.smootherOptions = smootherOptions;
    this.xSmoother = new SmootherClass(smootherOptions);
    this.ySmoother = new SmootherClass(smootherOptions);
    this.timestamp = null;
    this.n = 0;
    this.angleRange = '-piToPi';
    this.onChange = null;
    this._stale = true;
    this._idleTimer = null;
    this.idlePeriod = this._derivedIdlePeriod(smootherOptions);
  }

  /**
   * Resets the smoothers and counters.
   * Initializes the smoothers with the current polar x/y values.
   */
  reset(xValue = null, yValue = null, xVariance = null, yVariance = null) {
    this.xSmoother.reset(xValue, xVariance);
    this.ySmoother.reset(yValue, yVariance);
    this.timestamp = null;
    this.n = 0;
  }

  _derivedIdlePeriod(opts) {
    const MIN_IDLE = 5000;
    if (typeof opts.timeConstant === 'number') return Math.max(opts.timeConstant * 3000, MIN_IDLE);
    if (typeof opts.tau === 'number') return Math.max(opts.tau * 3000, MIN_IDLE);
    if (typeof opts.timeSpan === 'number') return Math.max(opts.timeSpan * 3000, MIN_IDLE);
    // KalmanSmoother (processVariance/measurementVariance/steadyState) has no
    // time-based parameter — use a sensible default.
    return 10000;
  }

  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._stale = false;
    this._idleTimer = setTimeout(() => { this._stale = true; }, this.idlePeriod);
  }

  terminate() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    return this.polar.terminate();
  }

  /**
   * Take a new sample from the underlying Polar object and update smoothers.
   */
  sample() {
    if (!this.polar.ready) return this;
    if (this._stale) this.reset();
    const now = Date.now();
    this.xSmoother.add(this.polar.xValue, this.polar.xVariance);
    this.ySmoother.add(this.polar.yValue, this.polar.yVariance);
    this.timestamp = now;
    this.n++;
    this._resetIdleTimer();
    if (typeof this.onChange === 'function') {
      this.onChange();
    }
    return this;
  }

  setAngleRange(range) {
    if (range === '0to2pi' || range === '-piToPi') {
      this.angleRange = range;
    }
    return this;
  }

  /**
   * Updates smoother options and immediately applies them to the live x and y smoothers.
   * Note: this resets the smoother state, losing accumulated history.
   * @param {Object} opts - New options to pass to the smoothers.
   */
  setSmootherOptions(opts) {
    this.smootherOptions = opts;
    this.xSmoother.options = opts;
    this.ySmoother.options = opts;
    return this;
  }

  /**
   * Replaces the smoother class and immediately recreates the x and y smoother instances.
   * Note: this resets the smoother state, losing accumulated history.
   * @param {Function} SmootherClass - The new smoother class to use.
   */
  setSmootherClass(SmootherClass) {
    this.SmootherClass = SmootherClass;
    this.xSmoother = new SmootherClass(this.smootherOptions);
    this.ySmoother = new SmootherClass(this.smootherOptions);
    return this;
  }

  /**
   * Send an update message for an array of PolarSmoother instances.
   * Uses the pathMagnitude and pathAngle from the underlying polar object.
   * @param {Object} app - The application instance.
   * @param {string} pluginId - The plugin identifier.
   * @param {PolarSmoother[]} polarsSmoothed - Array of PolarSmoother instances.
   */
  static send(app, pluginId, polarsSmoothed) {
    let values = [];
    polarsSmoothed.forEach(ps => {
      if(ps.ready) {
      values.push({
        path: ps.polar.pathMagnitude,
        value: ps.magnitude 
      });
      values.push({
        path: ps.polar.pathAngle,
        value: ps.angle 
      });
    }
    });
    const message = {
      context: 'vessels.self',
      updates: [
        {
          $source: pluginId,
          values: values
        }
      ]
    };
    if (values.length > 0) app.handleMessage(pluginId, message);
  }

  /**
   * Gets static metadata for this smoother, delegating to the underlying polar.
   * Adds smoother config on top.
   * @returns {Object}
   */
  get meta() {
    return { id: this.id, ...this.polar.meta, smoother: { type: this.SmootherClass.name, ...this.smootherOptions } };
  }

  /**
   * Gets dynamic state for this smoother.
   * @returns {Object}
   */
  get state() {
    return {
      id: this.id,
      ready: this.ready,
      stale: this.stale,
      sources: this.sources,
      magnitude: this.polar.magnitudeHandler.state,
      angle: this.polar.angleHandler.state,
    };
  }

  get x() {
    return this.xSmoother.estimate;
  }

  get y() {
    return this.ySmoother.estimate;
  }

  get xVariance() {
    return this.xSmoother.variance;
  }

  get yVariance() {
    return this.ySmoother.variance;
  }

  get vectorValue() {
    return { x: this.x, y: this.y };
  }

  get vector() {
    return [this.x, this.y];
  }

  get magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  get angle() {
    return this._formatAngle(Math.atan2(this.y, this.x));
  }

  get polarValue() {
    return {
      magnitude: this.magnitude,
      angle: this.angle
    };
  }

  get variance() {
    return [this.xVariance, this.yVariance];
  }

  get timestamp() {
    return this._timestamp;
  }

  set timestamp(val) {
    this._timestamp = val;
  }

  get nSamples() {
    return this.n;
  }

  get stale() {
    return this._stale;
  }

  /**
   * Returns true if the smoother has received at least one sample and is not stale.
   * Stale is determined by the smoother's own idle timer, not the source's state.
   * @returns {boolean}
   */
  get ready() {
    return !this._stale;
  }

  get sources() {
    const mag = this.polar.magnitudeHandler.getSources();
    const ang = this.polar.angleHandler.getSources();
    return [...new Set([...mag, ...ang])];
  }

  get trace() {
    //return Math.sqrt(this.xVariance ** 2 + this.yVariance ** 2);
    return this.xVariance + this.yVariance;
  }

  report() {
    return {
      id: this.id,
      pathMagnitude: this.polar.magnitudeHandler.path,
      pathAngle: this.polar.angleHandler.path,
      x: this.x,
      y: this.y,
      magnitude: this.magnitude,
      angle: this.angle,
      trace: this.trace,
      state: this.state,
    };
  }

  _formatAngle(angle) {
    if (this.angleRange === '0to2pi') {
      return (angle < 0) ? angle + 2 * Math.PI : angle;
    }
    // default: -pi to pi
    return angle;
  }
}

/**
 * SmoothedAngle wraps any single angular SK path and applies vector-based smoothing
 * that correctly handles wraparound (e.g. heading crossing 0/2π or -π/+π).
 *
 * Internally it creates a unit-magnitude Polar so that smoothing is done in cartesian
 * space. The public interface mirrors MessageSmoother: value, variance, path, source,
 * report(), meta, state.
 *
 * @param {Object} app - The app instance.
 * @param {string} pluginId - Plugin identifier.
 * @param {string} id - Identifier for this smoother (e.g. "heading").
 * @param {string} path - SK path for the angle (e.g. "navigation.headingTrue").
 * @param {Object} [options={}]
 * @param {string|null} [options.source=null] - Source filter.
 * @param {boolean} [options.passOn=true] - Pass delta on to SK stream.
 * @param {string} [options.angleRange='0to2pi'] - '0to2pi' or '-piToPi'.
 * @param {Object} [options.meta={}] - Plugin-owned meta fields (displayName, description, plane).
 * @param {Function} [options.SmootherClass=ExponentialSmoother] - Smoother class to use.
 * @param {Object} [options.smootherOptions={ timeConstant: 1 }] - Options for the smoother.
 */
class SmoothedAngle extends PolarSmoother {
  constructor(app, pluginId, id, path, {
    source = null,
    passOn = true,
    angleRange = '0to2pi',
    meta = {},
    SmootherClass = ExponentialSmoother,
    smootherOptions = { timeConstant: 1 }
  } = {}) {
    const polar = new Polar(app, pluginId, id);
    polar.configureAngle(path, source, passOn);
    polar.subscribe(false, true);
    polar.magnitudeHandler.value = 1;
    super(polar, SmootherClass, smootherOptions);
    this.polar.setMeta(meta);
    this.setAngleRange(angleRange);
    polar.onChange = () => { this.sample(); };
  }

  /** The underlying MessageHandler — mirrors MessageSmoother.handler. */
  get handler() {
    return this.polar.angleHandler;
  }

  get value() {
    return this.angle;
  }

  get variance() {
    return this.trace;
  }

  /** Angular standard error in radians (sqrt of trace). */
  get standardError() {
    return Math.sqrt(this.trace);
  }

  get frequency() {
    return this.polar.angleHandler.frequency;
  }

  get path() {
    return this.polar.angleHandler.path;
  }

  get source() {
    return this.polar.angleHandler.source;
  }

  getSources() {
    return this.polar.angleHandler.getSources();
  }

  /** Flat meta — matches MessageSmoother.meta shape. */
  get meta() {
    return {
      id: this.id,
      ...this.polar.angleHandler.meta,
      ...this.polar._polarMeta,
      angleRange: this.angleRange,
      smoother: { type: this.SmootherClass.name, ...this.smootherOptions }
    };
  }

  /** Flat state — matches MessageSmoother.state shape. */
  get state() {
    return {
      id: this.id,
      ready: this.ready,
      stale: this.stale,
      frequency: this.frequency,
      sources: this.getSources()
    };
  }

  report() {
    return {
      id: this.id,
      value: this.value,
      variance: this.variance,
      path: this.path,
      source: this.source,
      state: this.state
    };
  }
}

/**
 * Creates a Polar and a linked PolarSmoother, wires up onChange, and sets display attributes.
 * @param {Object} options
 * @param {string} options.id - Identifier for the polar.
 * @param {string} options.pathMagnitude - Signal K path for magnitude.
 * @param {string} options.subscribe - Subscribe to path.
 * @param {string} options.pathAngle - Signal K path for angle.
 * @param {string} options.sourceMagnitude - Source label for magnitude.
 * @param {string} options.sourceAngle - Source label for angle.
 * @param {Object} options.app - The app instance.
 * @param {string} options.pluginId - Plugin identifier.
 * @param {Function} [options.SmootherClass=ExponentialSmoother] - Smoother class to use.
 * @param {Object} [options.smootherOptions={}] - Options for the smoother.
 * @param {Object} [options.meta={}] - Plugin-owned metadata for the polar (e.g. displayName, description, plane).
 * @param {boolean} [options.passOn=true] - Pass on subscription.
 * @param {String} [options.angleRange='-piToPi'] - Angle range for the polar coordinates, valid values are '0to2pi' or '-piToPi'.
 * @returns {PolarSmoother}
 */
function createSmoothedPolar({
  id,
  pathMagnitude,
  pathAngle,
  subscribe = true,
  sourceMagnitude,
  sourceAngle,
  app,
  pluginId,
  SmootherClass = ExponentialSmoother,
  smootherOptions = {},
  meta = {},
  passOn = true,
  angleRange = '-piToPi'
}) {

  const polar = new Polar(app, pluginId, id);
  polar.configureMagnitude(pathMagnitude, sourceMagnitude, passOn);
  polar.configureAngle(pathAngle, sourceAngle, passOn);
  polar.setAngleRange(angleRange);
  polar.setMeta(meta);
  if (subscribe) polar.subscribe(true, true);
  const smoother = new PolarSmoother(polar, SmootherClass, smootherOptions);
  polar.onChange = () => { smoother.sample(); };
  return smoother;
}





module.exports = { Polar, PolarSmoother, createSmoothedPolar, SmoothedAngle };