const { MessageHandler } = require('./MessageHandler');
const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');

const INACTIVE = 'INACTIVE';
const ACTIVE = 'ACTIVE';
const ABSENT = 'ABSENT';
const FRESH = 'FRESH';
const STALE = 'STALE';
const DEFAULT_IDLE_PERIOD = 60000;
const DEFAULT_STALE_PERIOD = 4000;

function clearTimer(timer) {
  if (timer) clearTimeout(timer);
  return null;
}

class Polar {
  static send(app, pluginId, polars) {
    const values = [];
    polars.forEach(polar => {
      if (polar.ready) {
        values.push({ path: polar.pathMagnitude, value: polar.magnitude });
        values.push({ path: polar.pathAngle, value: polar.angle });
      }
    });
    const message = {
      context: 'vessels.self',
      updates: [{
        $source: pluginId,
        values
      }]
    };
    if (values.length > 0) app.handleMessage(pluginId, message);
  }

  static clear(app, pluginId, polars) {
    const values = [];
    polars.forEach(p => {
      const polar = p.polar ?? p;
      if (polar.pathMagnitude) values.push({ path: polar.pathMagnitude, value: null });
      if (polar.pathAngle) values.push({ path: polar.pathAngle, value: null });
    });
    if (values.length > 0) app.handleMessage(pluginId, {
      context: 'vessels.self',
      updates: [{ $source: pluginId, values }]
    });
  }

  constructor(app, pluginId, id) {
    this._app = app;
    this._pluginId = pluginId;
    this._id = id;
    this._polarMeta = {};
    this._ready = false;
    this._valueStatus = ABSENT;
    this._stale = false;
    this._lifecycle = INACTIVE;
    this._magnitudeThreshold = null;
    this._usingFallbackAngle = false;
    this._idlePeriod = DEFAULT_IDLE_PERIOD;
    this._stalePeriod = DEFAULT_STALE_PERIOD;
    this._idleTimer = null;
    this._staleTimer = null;
    this._onDelta = null;
    this._onIdle = null;
    this._onStale = null;
    this._deltaListeners = new Set();
    this._processBound = this.processChanges.bind(this);
    this.magnitudeHandler = new MessageHandler(app, pluginId, id + '.magnitude');
    this.angleHandler = new MessageHandler(app, pluginId, id + '.angle');
    this.angleRange = '-piToPi';
  }

  /**
   * Gets the polar id.
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  _ensureInactive(field) {
    if (this.subscribed) {
      throw new Error(`Cannot modify ${field} while subscription is ACTIVE for ${this.id}`);
    }
  }

  _clearEventTimers() {
    this._idleTimer = clearTimer(this._idleTimer);
    this._staleTimer = clearTimer(this._staleTimer);
  }

  // Re-armed on every delta, so firing always means idlePeriod of silence.
  _armIdleTimer() {
    this._idleTimer = clearTimer(this._idleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onIdle !== 'function' || !(this._idlePeriod > 0)) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._lifecycle === ACTIVE && typeof this._onIdle === 'function') {
        this._onIdle();
      }
    }, this._idlePeriod);
  }

  _armStaleTimer() {
    this._staleTimer = clearTimer(this._staleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onStale !== 'function' || !(this._stalePeriod > 0)) return;
    this._staleTimer = setTimeout(() => {
      this._staleTimer = null;
      if (this._lifecycle !== ACTIVE || this._stale) return;
      this._stale = true;
      if (this._valueStatus !== ABSENT) this._valueStatus = STALE;
      if (typeof this._onStale === 'function') this._onStale();
    }, this._stalePeriod);
  }

  _dispatchDelta() {
    for (const listener of this._deltaListeners) {
      listener();
    }
    if (typeof this._onDelta === 'function') {
      this._onDelta();
    }
  }

  addDeltaListener(fn) {
    if (typeof fn === 'function') this._deltaListeners.add(fn);
    return this;
  }

  removeDeltaListener(fn) {
    this._deltaListeners.delete(fn);
    return this;
  }

  configureAngle(pathAngle, subscribeOptions = { excludeSelf: true }) {
    this._ensureInactive('angle path');
    this.angleHandler.configure(pathAngle, subscribeOptions);
    return this;
  }

  configureMagnitude(pathMagnitude, subscribeOptions = { excludeSelf: true }) {
    this._ensureInactive('magnitude path');
    this.magnitudeHandler.configure(pathMagnitude, subscribeOptions);
    return this;
  }

  /**
   * Enables fallback angle (0) when magnitude is at or below the given threshold.
   * When active, the polar becomes ready based on magnitude alone.
   * Set threshold to null to disable.
   * @param {number|null} threshold
   */
  configureFallbackAngle(threshold) {
    this._magnitudeThreshold = threshold;
    return this;
  }

  get angleFallbackActive() {
    return this._usingFallbackAngle;
  }

  get subscribed() {
    return this.magnitudeHandler.subscribed || this.angleHandler.subscribed;
  }

  get onDelta() {
    return this._onDelta;
  }

  set onDelta(fn) {
    this._ensureInactive('onDelta');
    this._onDelta = fn;
  }

  get onChange() {
    return this.onDelta;
  }

  set onChange(fn) {
    this.onDelta = fn;
  }

  get onIdle() {
    return this._onIdle;
  }

  set onIdle(fn) {
    this._ensureInactive('onIdle');
    this._onIdle = fn;
  }

  get onStale() {
    return this._onStale;
  }

  set onStale(fn) {
    this._ensureInactive('onStale');
    this._onStale = fn;
  }

  get idlePeriod() {
    return this._idlePeriod;
  }

  set idlePeriod(ms) {
    this._ensureInactive('idlePeriod');
    this._idlePeriod = ms;
  }

  get stalePeriod() {
    return this._stalePeriod;
  }

  set stalePeriod(ms) {
    this._ensureInactive('stalePeriod');
    this._stalePeriod = ms;
  }

  subscribe(toMagnitude = true, toAngle = true) {
    this._valueStatus = ABSENT;
    this._ready = false;
    this._stale = false;
    this._clearEventTimers();
    if (toMagnitude) {
      this.magnitudeHandler.addDeltaListener(this._processBound);
      this.magnitudeHandler.subscribe();
    }
    if (toAngle) {
      this.angleHandler.addDeltaListener(this._processBound);
      this.angleHandler.subscribe();
    }
    if (this.subscribed) {
      this._lifecycle = ACTIVE;
      this._armIdleTimer();
      this._armStaleTimer();
    } else {
      this._lifecycle = INACTIVE;
    }
    return this;
  }

  setAngleRange(range) {
    if (range === '0to2pi' || range === '-piToPi') {
      this.angleRange = range;
    }
    return this;
  }

  unsubscribe() {
    this._lifecycle = INACTIVE;
    this._clearEventTimers();
    this.magnitudeHandler.unsubscribe();
    this.angleHandler.unsubscribe();
    return this;
  }

  terminate(clearCallback = true) {
    this._lifecycle = INACTIVE;
    this._clearEventTimers();
    this.magnitudeHandler.removeDeltaListener(this._processBound);
    this.angleHandler.removeDeltaListener(this._processBound);
    if (clearCallback) {
      this._onDelta = null;
      this._onIdle = null;
      this._onStale = null;
    }
    this.magnitudeHandler.terminate(clearCallback);
    this.angleHandler.terminate(clearCallback);
    return null;
  }

  processChanges() {
    const belowThreshold = this._magnitudeThreshold !== null &&
      this.magnitudeHandler.ready &&
      Math.abs(this.magnitudeHandler.value) <= this._magnitudeThreshold;
    const canProcess = this.magnitudeHandler.ready && (belowThreshold || this.angleHandler.ready);
    if (!canProcess) {
      this._ready = false;
      return this;
    }
    this._usingFallbackAngle = belowThreshold;
    const angleValue = belowThreshold ? 0 : this.angleHandler.value;
    this.xValue = this.magnitudeHandler.value * Math.cos(angleValue);
    this.yValue = this.magnitudeHandler.value * Math.sin(angleValue);
    this.xVariance = 0;
    this.yVariance = 0;
    this._ready = true;
    this._valueStatus = FRESH;
    this._stale = false;
    this._armIdleTimer();
    this._armStaleTimer();
    this._dispatchDelta();
    return this;
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
    this._valueStatus = FRESH;
    this._stale = false;
  }

  setVectorValue(value= { x: 0, y: 0 }, variance = { x: 0, y: 0 }) {
    this.xValue = value.x;
    this.yValue = value.y;
    this.xVariance = variance.x;
    this.yVariance = variance.y;
    this._ready = true;
    this._valueStatus = FRESH;
    this._stale = false;
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
      idlePeriod: this.idlePeriod,
      stalePeriod: this.stalePeriod,
      magnitude: this.magnitudeHandler.meta,
      angle: this.angleHandler.meta,
    };
  }

  /**
   * Gets dynamic state for this polar.
   * @returns {Object}
   */
  get state() {
    const t1 = this.magnitudeHandler.subscribed ? this.magnitudeHandler.timestamp : null;
    const t2 = this.angleHandler.subscribed ? this.angleHandler.timestamp : null;
    const lastDelta = this.timestamp; // most recent of both (max)
    const oldestDelta = (t1 !== null && t2 !== null) ? Math.min(t1, t2) : (t1 ?? t2);
    return {
      id: this.id,
      lifecycle: this._lifecycle,
      valueStatus: this._valueStatus,
      ready: this.ready,
      isStale: this.stale,
      hasValue: this._ready,
      pathKnown: this.magnitudeHandler._specMeta !== null && this.angleHandler._specMeta !== null,
      subscribed: this.subscribed,
      angleFallbackActive: this._usingFallbackAngle,
      lastDelta,
      deltaAge: oldestDelta ? Date.now() - oldestDelta : null,
      frequency: this.frequency,
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
    return this._stale;
  }

  /**
   * Marks this polar as having no valid value. Downstream consumers that check
   * ready will treat it as unavailable until a successful value write occurs.
   * @returns {this}
   */
  invalidate() {
    this._ready = false;
    this._valueStatus = ABSENT;
    this._stale = false;
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
    return this.xVariance + this.yVariance;
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
  constructor(polar, SmootherClass = ExponentialSmoother, smootherOptions = {}, eventOptions = {}) {
    this.id = polar.id + '.smoothed';
    this.polar = polar;
    this.SmootherClass = SmootherClass;
    this.smootherOptions = smootherOptions;
    this.xSmoother = new SmootherClass(smootherOptions);
    this.ySmoother = new SmootherClass(smootherOptions);
    this.timestamp = null;
    this.n = 0;
    this.angleRange = '-piToPi';
    this._lifecycle = polar.subscribed ? ACTIVE : INACTIVE;
    this._valueStatus = ABSENT;
    this._stale = false;
    this._idleTimer = null;
    this._staleTimer = null;
    this._idlePeriod = eventOptions.idlePeriod ?? DEFAULT_IDLE_PERIOD;
    this._stalePeriod = eventOptions.stalePeriod ?? this._derivedStalePeriod(smootherOptions);
    this._onDelta = eventOptions.onDelta ?? null;
    this._onIdle = eventOptions.onIdle ?? null;
    this._onStale = eventOptions.onStale ?? null;
    this._handleSourceDelta = () => { this.sample(); };
    this.polar.addDeltaListener(this._handleSourceDelta);
    if (this.polar.subscribed) {
      this._activateLifecycle();
    }
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

  _ensureInactive(field) {
    if (this.subscribed) {
      throw new Error(`Cannot modify ${field} while subscription is ACTIVE for ${this.id}`);
    }
  }

  _clearEventTimers() {
    this._idleTimer = clearTimer(this._idleTimer);
    this._staleTimer = clearTimer(this._staleTimer);
  }

  // Re-armed on every delta, so firing always means idlePeriod of silence.
  _armIdleTimer() {
    this._idleTimer = clearTimer(this._idleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onIdle !== 'function' || !(this._idlePeriod > 0)) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._lifecycle === ACTIVE && typeof this._onIdle === 'function') {
        this._onIdle();
      }
    }, this._idlePeriod);
  }

  _armStaleTimer() {
    this._staleTimer = clearTimer(this._staleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onStale !== 'function' || !(this._stalePeriod > 0)) return;
    this._staleTimer = setTimeout(() => {
      this._staleTimer = null;
      if (this._lifecycle !== ACTIVE || this._stale) return;
      this._stale = true;
      if (this._valueStatus !== ABSENT) this._valueStatus = STALE;
      if (typeof this._onStale === 'function') this._onStale();
    }, this._stalePeriod);
  }

  _activateLifecycle() {
    this._lifecycle = ACTIVE;
    this._valueStatus = ABSENT;
    this._stale = false;
    this.reset();
    this._armIdleTimer();
    this._armStaleTimer();
  }

  _deactivateLifecycle() {
    this._lifecycle = INACTIVE;
    this._clearEventTimers();
  }

  _derivedStalePeriod(opts) {
    const MIN_PERIOD = DEFAULT_STALE_PERIOD;
    if (typeof opts.timeConstant === 'number') return Math.max(opts.timeConstant * 3000, MIN_PERIOD);
    if (typeof opts.tau === 'number') return Math.max(opts.tau * 3000, MIN_PERIOD);
    if (typeof opts.timeSpan === 'number') return Math.max(opts.timeSpan * 3000, MIN_PERIOD);
    return DEFAULT_STALE_PERIOD;
  }

  get subscribed() {
    return this.polar.subscribed;
  }

  subscribe(toMagnitude = true, toAngle = true) {
    this.polar.subscribe(toMagnitude, toAngle);
    if (this.subscribed) {
      this._activateLifecycle();
    } else {
      this._deactivateLifecycle();
    }
    return this;
  }

  unsubscribe() {
    this._deactivateLifecycle();
    return this.polar.unsubscribe();
  }

  terminate(clearCallback = true) {
    this._deactivateLifecycle();
    this.polar.removeDeltaListener(this._handleSourceDelta);
    if (clearCallback) {
      this._onDelta = null;
      this._onIdle = null;
      this._onStale = null;
    }
    return this.polar.terminate(clearCallback);
  }

  /**
   * Take a new sample from the underlying Polar object and update smoothers.
   */
  sample() {
    if (!this.polar.ready) return this;
    if (this._stale || this.n === 0) this.reset();
    const now = Date.now();
    this.xSmoother.add(this.polar.xValue, this.polar.xVariance);
    this.ySmoother.add(this.polar.yValue, this.polar.yVariance);
    this.timestamp = now;
    this.n++;
    this._valueStatus = FRESH;
    this._stale = false;
    this._armIdleTimer();
    this._armStaleTimer();
    if (typeof this._onDelta === 'function') {
      this._onDelta();
    }
    return this;
  }

  get onDelta() {
    return this._onDelta;
  }

  set onDelta(fn) {
    this._ensureInactive('onDelta');
    this._onDelta = fn;
  }

  get onChange() {
    return this.onDelta;
  }

  set onChange(fn) {
    this.onDelta = fn;
  }

  get onIdle() {
    return this._onIdle;
  }

  set onIdle(fn) {
    this._ensureInactive('onIdle');
    this._onIdle = fn;
  }

  get onStale() {
    return this._onStale;
  }

  set onStale(fn) {
    this._ensureInactive('onStale');
    this._onStale = fn;
  }

  get idlePeriod() {
    return this._idlePeriod;
  }

  set idlePeriod(ms) {
    this._ensureInactive('idlePeriod');
    this._idlePeriod = ms;
  }

  get stalePeriod() {
    return this._stalePeriod;
  }

  set stalePeriod(ms) {
    this._ensureInactive('stalePeriod');
    this._stalePeriod = ms;
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

  // Write null to the magnitude and angle SK paths. Delegates to Polar.clear
  // via the .polar pointer.
  static clear(app, pluginId, polarsSmoothed) {
    Polar.clear(app, pluginId, polarsSmoothed);
  }

  /**
   * Gets static metadata for this smoother, delegating to the underlying polar.
   * Adds smoother config on top.
   * @returns {Object}
   */
  get meta() {
    return {
      id: this.id,
      ...this.polar.meta,
      idlePeriod: this.idlePeriod,
      stalePeriod: this.stalePeriod,
      smoother: { type: this.SmootherClass.name, ...this.smootherOptions }
    };
  }

  /**
   * Gets dynamic state for this smoother.
   * @returns {Object}
   */
  get state() {
    const lastDelta = this.timestamp;
    return {
      id: this.id,
      subscribed: this.subscribed,
      valueStatus: this._valueStatus,
      ready: this.ready,
      isStale: this.stale,
      hasDelta: this.n > 0,
      nSamples: this.n,
      lastDelta,
      deltaAge: lastDelta ? Date.now() - lastDelta : null,
      frequency: this.polar.frequency,
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
    if (!this.ready) return null;
    return {
      magnitude: this.magnitude,
      angle: this.angle
    };
  }

  get variance() {
    return [this.xVariance, this.yVariance];
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
    return this._valueStatus !== ABSENT && !this.stale;
  }

  get trace() {
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
 * @param {string} [options.angleRange='0to2pi'] - '0to2pi' or '-piToPi'.
 * @param {Object} [options.meta={}] - Plugin-owned meta fields (displayName, description, plane).
 * @param {Function} [options.SmootherClass=ExponentialSmoother] - Smoother class to use.
 * @param {Object} [options.smootherOptions={ timeConstant: 1 }] - Options for the smoother.
 * @param {Object} [options.subscribeOptions={ excludeSelf: true }] - Options passed to the subscription manager.
 *   Supports `excludeSelf` (boolean) and `excludeSources` (string[]).
 */
class SmoothedAngle extends PolarSmoother {
  constructor(app, pluginId, id, path, {
    angleRange = '0to2pi',
    meta = {},
    SmootherClass = ExponentialSmoother,
    smootherOptions = { timeConstant: 1 },
    subscribeOptions = { excludeSelf: true },
    onDelta = null,
    onIdle = null,
    onStale = null,
    idlePeriod,
    stalePeriod,
    subscribe = true,
  } = {}) {
    const polar = new Polar(app, pluginId, id);
    polar.magnitudeHandler.value = 1;
    polar.configureAngle(path, subscribeOptions);
    super(polar, SmootherClass, smootherOptions, { onDelta, onIdle, onStale, idlePeriod, stalePeriod });
    this.polar.setMeta(meta);
    this.setAngleRange(angleRange);
    if (subscribe) this.subscribe(false, true);
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
    const lastDelta = this.timestamp;
    return {
      id: this.id,
      ready: this.ready,
      isStale: this.stale,
      valueStatus: this._valueStatus,
      hasDelta: this.n > 0,
      nSamples: this.n,
      lastDelta,
      deltaAge: lastDelta ? Date.now() - lastDelta : null,
      frequency: this.frequency,
      handler: this.polar.angleHandler.state,
    };
  }

  report() {
    return {
      id: this.id,
      value: this.value,
      variance: this.variance,
      path: this.path,
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
 * @param {Object} options.app - The app instance.
 * @param {string} options.pluginId - Plugin identifier.
 * @param {Function} [options.SmootherClass=ExponentialSmoother] - Smoother class to use.
 * @param {Object} [options.smootherOptions={}] - Options for the smoother.
 * @param {Object} [options.meta={}] - Plugin-owned metadata for the polar (e.g. displayName, description, plane).
 * @param {String} [options.angleRange='-piToPi'] - Angle range for the polar coordinates, valid values are '0to2pi' or '-piToPi'.
 * @param {Object} [options.subscribeOptions={ excludeSelf: true }] - Options passed to the subscription manager.
 *   Supports `excludeSelf` (boolean) and `excludeSources` (string[]).
 * @returns {PolarSmoother}
 */
function createSmoothedPolar({
  id,
  pathMagnitude,
  pathAngle,
  subscribe = true,
  app,
  pluginId,
  SmootherClass = ExponentialSmoother,
  smootherOptions = {},
  meta = {},
  angleRange = '-piToPi',
  magnitudeThreshold = 0.1,
  subscribeOptions = { excludeSelf: true },
  onDelta = null,
  onIdle = null,
  onStale = null,
  idlePeriod,
  stalePeriod,
}) {

  const polar = new Polar(app, pluginId, id);
  polar.configureMagnitude(pathMagnitude, subscribeOptions);
  polar.configureAngle(pathAngle, subscribeOptions);
  polar.setAngleRange(angleRange);
  polar.setMeta(meta);
  if (magnitudeThreshold !== null) polar.configureFallbackAngle(magnitudeThreshold);
  const smoother = new PolarSmoother(polar, SmootherClass, smootherOptions, {
    onDelta,
    onIdle,
    onStale,
    idlePeriod,
    stalePeriod,
  });
  if (subscribe) smoother.subscribe(true, true);
  return smoother;
}





module.exports = { Polar, PolarSmoother, createSmoothedPolar, SmoothedAngle };