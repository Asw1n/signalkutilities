// Statistical smoothing and variance tracking for MessageHandler values, using Smoother classes

const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');

/**
 * MessageSmoother wraps a MessageHandler and applies a smoothing algorithm
 * using a specified Smoother class (MovingAverageSmoother, ExponentialSmoother, KalmanSmoother).
 * It supports both scalar and object values, automatically creating smoothers for numeric properties in objects.
 * The MessageSmoother passes on configuration changes to the underlying MessageHandler.
 * 
 **/

class MessageSmoother {
  /**
   * @param {MessageHandler} handler - The underlying MessageHandler instance.
   * @param {Function} [SmootherClass=ExponentialSmoother] - The smoother class to use.
   * @param {Object} [smootherOptions={}] - Options to pass to the smoother.
   */
  constructor(handler, SmootherClass = ExponentialSmoother, smootherOptions = {}) {
    this.id = handler.id + '.smoothed';
    this.handler = handler;
    this.SmootherClass = SmootherClass;
    this.smootherOptions = smootherOptions;
    this.smoother = null;
    this.timestamp = null;
    this.n = 0;
    this._isObject = false;
    this._propertyKeys = null;
    this.onChange = null;
    this._stale = true;
    this._idleTimer = null;
    this.idlePeriod = this._derivedIdlePeriod(smootherOptions);
    this._stalenessDetection = true;
  }

  /**
   * Resets the smoother(s) and determines the value type (scalar or object).
   * Initializes appropriate smoother(s) for the value type.
   */
  reset() {
    this.timestamp = null;
    this.n = 0;
    this._isObject = false;
    this._propertyKeys = null;
    this.smoother = null;

    const handlerValue = this.handler.value;
    if (typeof handlerValue === 'number') {
      this._isObject = false;
      this.smoother = new this.SmootherClass(this.smootherOptions);
    } else if (handlerValue && typeof handlerValue === 'object') {
      this._isObject = true;
      this._propertyKeys = Object.keys(handlerValue).filter(
        key => typeof handlerValue[key] === 'number'
      );
      this.smoother = {};
      for (const key of this._propertyKeys) {
        this.smoother[key] = new this.SmootherClass(this.smootherOptions);
      }
    } else {
      this.smoother = null; // No valid value yet
    }
  }

  /**
   * Terminates the underlying handler and clears the idle timer.
   * @returns {null}
   */
  terminate(clearCallback = true) {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    return this.handler.terminate(clearCallback);
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

  get stalenessDetection() {
    return this._stalenessDetection;
  }

  set stalenessDetection(val) {
    this._stalenessDetection = val;
    this.handler.stalenessDetection = val;
    if (!val) {
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
      this._stale = false;
    } else if (!this._idleTimer) {
      // Re-enabling: evaluate immediately — don't wait for next delta
      if (this.timestamp === null) {
        this._stale = true;
      } else {
        const age = Date.now() - this.timestamp;
        if (age >= this.idlePeriod) {
          this._stale = true;
        } else {
          this._stale = false;
          this._idleTimer = setTimeout(() => { this._stale = true; }, this.idlePeriod - age);
        }
      }
    }
  }

  _resetIdleTimer() {
    if (!this._stalenessDetection) return;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._stale = false;
    this._idleTimer = setTimeout(() => { this._stale = true; }, this.idlePeriod);
  }

  /**
   * Adds a new sample from the handler to the smoother(s).
   * @returns {MessageSmoother}
   */
  sample() {
    if (!this.handler.ready) return this;
    if (this._stale) {
      this.reset();
    } else if (this.n === 0) {
      this.reset();
    }
    const now = Date.now();
    const handlerValue = this.handler.value;
    const handlerVariance = this.handler.variance;
    if (!this.smoother) {
      this.reset();
    }
    if (!this._isObject) {
      this.smoother.add(handlerValue, handlerVariance);
    } else if (handlerValue && typeof handlerValue === 'object') {
      for (const key of this._propertyKeys) {
        this.smoother[key].add(handlerValue[key]);
      }
    }
    this.timestamp = now;
    this.n++;
    this._resetIdleTimer();
    if (typeof this.onChange === 'function') {
      this.onChange();
    }
    return this;
  }

  /**
   * Gets the current smoothed value.
   * @returns {number|Object|undefined}
   */
  get value() {
    if (this._isObject && this.smoother) {
      const result = {};
      for (const key of this._propertyKeys) {
        result[key] = this.smoother[key].estimate;
      }
      return result;
    }
    return this.smoother ? this.smoother.estimate : undefined;
  }

  /**
   * Gets the current variance estimate.
   * @returns {number|Object|undefined}
   */
  get variance() {
    if (this._isObject && this.smoother) {
      const result = {};
      for (const key of this._propertyKeys) {
        result[key] = this.smoother[key].variance;
      }
      return result;
    }
    return this.smoother ? this.smoother.variance : undefined;
  }

  /**
   * Gets the current standard error estimate.
   * @returns {number|Object|undefined}
   */
  get standardError() {
    if (this._isObject && this.smoother) {
      const result = {};
      for (const key of this._propertyKeys) {
        if (typeof this.smoother[key].standardError === 'function') {
          result[key] = this.smoother[key].standardError;
        }
      }
      return result;
    }
    return this.smoother ? this.smoother.standardError : undefined;
  }

  /**
   * Returns true if the underlying handler is stale.
   * @returns {boolean}
   */
  get stale() {
    return this._stalenessDetection ? this._stale : false;
  }

  /**
   * Returns true if the smoother has received at least one sample and is not stale.
   * Stale is determined by the smoother's own idle timer, not the source's state.
   * @returns {boolean}
   */
  get ready() {
    return this.n > 0 && !this.stale;
  }

  /**
   * Updates smoother options and immediately applies them to the live smoother(s).
   * Note: this resets the smoother state, losing accumulated history.
   * @param {Object} opts - New options to pass to the smoother.
   */
  setSmootherOptions(opts) {
    this.smootherOptions = opts;
    if (!this.smoother) return;
    if (this._isObject) {
      for (const key of this._propertyKeys) {
        this.smoother[key].options = opts;
      }
    } else {
      this.smoother.options = opts;
    }
  }

  /**
   * Replaces the smoother class and immediately recreates the live smoother(s).
   * Note: this resets the smoother state, losing accumulated history.
   * @param {Function} SmootherClass - The new smoother class to use.
   */
  setSmootherClass(SmootherClass) {
    this.SmootherClass = SmootherClass;
    this.reset();
  }

  /**
   * Gets static metadata for this smoother and its underlying handler.
   * SK meta is read lazily from the handler. Absent fields are not populated here —
   * the webapp is responsible for fallback values.
   * @returns {Object}
   */
  get meta() {
    return { id: this.id, ...this.handler.meta, smoother: { type: this.SmootherClass.name, ...this.smootherOptions } };
  }

  /**
   * Gets dynamic state for this smoother.
   * @returns {Object}
   */
  get state() {
    const lastDelta = this.timestamp;
    return {
      id: this.id,
      ready: this.ready,
      isStale: this.stale,
      hasDelta: this.n > 0,
      nSamples: this.n,
      stalenessDetection: this._stalenessDetection,
      lastDelta,
      deltaAge: lastDelta ? Date.now() - lastDelta : null,
      frequency: this.handler.frequency,
      handler: this.handler.state,
    };
  }

  /**
   * Returns a summary object for reporting.
   * @returns {Object}
   */
  report() {
    return {
      id: this.id,
      path: this.handler.path,
      value: this.value,
      variance: this.variance,
      state: this.state
    };
  }

  /**
   * Gets the update frequency (Hz).
   * @returns {number|null}
   */
  get frequency() {
    return this.handler.frequency;
  }
}

/**
 * Handles subscription to a Signal K path, tracks value, frequency, and staleness.
 * @class
 */
class MessageHandler {
  /**
   * Constructs the messagehandler.
   * @param {Object} app - The app instance.
   * @param {string} pluginId - Plugin identifier.
   * @param {string} id - Identifier for this handler.
   */

  constructor(app, pluginId, id) {

    this._app = app;
    this._id = id;
    this._pluginId = pluginId;

    this._value = null;
    this._ready = false;
    this.timestamp = null;
    this.frequency = null;
    this.freqAlpha = 0.2;
    this.onChange = null;
    this.subscribed = false;
    this.n = 0;
    this.idlePeriod = 4000; // ms
    this._idleTimer = null;
    this._path="";
    this._unsubscribes = [];      // holds unsubscribe fns pushed by subscriptionmanager
    this._restMeta = null;
    this._fetchPending = false;
    this._metaCache = null;
    this._stale = false;
    this._stalenessDetection = true;
    this._subscribeOptions = { excludeSelf: true };
  }

  /**
   * Gets the handler id.
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = v;
    this._ready = true;
  }

  /**
   * Marks this handler as having no valid value.
   * Downstream consumers that check ready will treat it as unavailable
   * until a successful value write occurs.
   * @returns {this}
   */
  invalidate() {
    this._ready = false;
    return this;
  }

  set path(newPath) {
    this._path = newPath;
    this._restMeta = null;
    this._metaCache = null;
    this._fetchPending = false;
    this._fetchRestMeta(newPath);
    if (this.subscribed ) {
      this.terminate(false);
      this.subscribe();
    }
  }

  get path() {
    return this._path;
  }

  set onChange(newOnChange) {
    this._onChange = newOnChange;
  }

  get onChange() {
    return this._onChange;
  }

  /**
   * Configures the path and subscription options for this handler.
   * @param {string} path - The Signal K path to subscribe to.
   * @param {Object} [subscribeOptions={ excludeSelf: true }] - Options passed to the subscription manager.
   *   Supports `excludeSelf` (boolean) and `excludeSources` (string[]).
   *   Pass `{}` to receive the plugin's own output alongside other sources.
   * @returns {this}
   */
  configure(path, subscribeOptions = { excludeSelf: true }) {
    this._path = path;
    this._subscribeOptions = subscribeOptions;
    this._restMeta = null;
    this._metaCache = null;
    this._fetchPending = false;
    this._fetchRestMeta(path);
    if (this.subscribed) {
      this.terminate(false);
      this.subscribe();
    }
    return this;
  }


  /**
   * Terminates the handler, unsubscribes and clears timers.
   * @param {boolean} [clearCallback=true] - If false, preserves _onChange (used for internal resubscribes).
   */
  terminate(clearCallback = true) {
    if (clearCallback) this._onChange = null;
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    // Release subscriptionmanager subscription
    this._unsubscribes.forEach(fn => fn());
    this._unsubscribes = [];
    this.subscribed = false;
    this._stale = false;
    return null;
  }

  /**
   * Sends a batch of messages to Signal K.
   * @static
   * @param {Object} app - The app instance.
   * @param {string} pluginId - Plugin identifier.
   * @param {Array<{path: string, value: *}>} messages - Array of messages.
   */
  static send(app, pluginId, messages) {
    let values = [];
    messages.forEach(delta => {

      if (delta.ready) {
        values.push({
          path: delta._path,
          value: delta.value
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

  // Send meta updates for one or more paths
  static sendMeta(app, pluginId, metaEntries) {
    const meta = metaEntries.map(entry => ({
      path: entry.path,
      value: entry.value ?? entry.meta
    }));
    const message = {
      context: 'vessels.self',
      updates: [
        {
          $source: pluginId,
          meta
        }
      ]
    };
    app.handleMessage(pluginId, message);
  }

  // Convenience for a single path
  static setMeta(app, pluginId, path, value) {
    return MessageHandler.sendMeta(app, pluginId, [{ path, value }]);
  }

  // subscribes to a single path and source.
  subscribe() {
    const path = this._path;
    const app = this._app;

    if (!path || path === "") {
      app.debug(`${this.id} is trying to subscribe to an empty path, subscription aborted`);
      this._stale = true;
      return;
    }

    app.debug(`Subscribing to ${path}`);
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._stale = false;
    }

    this._subscribeViaManager(path);
    this.subscribed = true;
    return this;
  }

  /**
   * Subscribes to a path via the subscription manager.
   * @private
   */
  _subscribeViaManager(path) {
    const app = this._app;
    app.subscriptionmanager.subscribe(
      { context: 'vessels.self', ...this._subscribeOptions, subscribe: [{ path, policy: 'instant', minPeriod: 0 }] },
      this._unsubscribes,
      err => app.debug(`MessageHandler[${this.id}] subscription error: ${err}`),
      delta => {
        let found = false;
        delta?.updates?.forEach(update => {
          if (Array.isArray(update?.values)) {
            for (const entry of update.values) {
              if (path === entry.path) {
                this._value = entry.value;
                this._ready = true;
                this.updateFrequency();
                found = true;
              }
            }
          }
        });
        if (found) {
          this._resetIdleTimer();
          if (this._restMeta === null) this._fetchRestMeta(this._path);
          if (typeof this._onChange === 'function') {
            this._onChange();
          }
        }
      }
    );
  }

  get stalenessDetection() {
    return this._stalenessDetection;
  }

  set stalenessDetection(val) {
    this._stalenessDetection = val;
    if (!val) {
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
      this._stale = false;
    } else if (!this._idleTimer) {
      // Re-enabling: evaluate immediately — don't wait for next delta
      if (this.timestamp === null) {
        this._stale = true;
      } else {
        const age = Date.now() - this.timestamp;
        if (age >= this.idlePeriod) {
          this._stale = true;
        } else {
          this._stale = false;
          this._idleTimer = setTimeout(() => {
            this._app.debug(`No data for ${this.path}`);
            this._stale = true;
          }, this.idlePeriod - age);
        }
      }
    }
  }

  get stale() {
    return this._stalenessDetection ? this._stale : false;
  }

  /**
   * Resets the idle timer for staleness detection.
   * @private
   */
  _resetIdleTimer() {
    if (!this._stalenessDetection) return;
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      if (this._stale) {
        this._app.debug(`Data received for ${this.path}, clearing stale state.`);
      }
      this._stale = false;
    }
    this._idleTimer = setTimeout(() => {
      this._app.debug(`No data for ${this.path}`);
      this._stale = true;
    }, this.idlePeriod);
  }

  /**
   * Fetches metadata for the given path from the SK REST API and caches it.
   * Fire-and-forget; called whenever the path changes.
   * Guarded by _fetchPending to prevent multiple concurrent in-flight requests.
   * @private
   */
  _fetchRestMeta(path) {
    if (!path || this._fetchPending) return;
    this._fetchPending = true;
    const app = this._app;
    const protocol = app.config?.ssl ? 'https' : 'http';
    const port = app.config?.port ?? app.config?.settings?.port ?? 3000;
    const skPath = path.replace(/\./g, '/');
    const url = `${protocol}://localhost:${port}/signalk/v1/api/vessels/self/${skPath}/meta`;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        this._fetchPending = false;
        if (data && typeof data === 'object') {
          this._restMeta = data;
          this._metaCache = null; // invalidate cached meta
        }
      })
      .catch(err => {
        this._fetchPending = false;
        app.debug(`MessageHandler[${this.id}]: REST meta fetch failed for ${path}: ${err.message}`);
      });
  }

  /**
   * Updates the frequency estimate based on the latest update.
   */
  updateFrequency() {
    const now = Date.now();
    if (this.timestamp) {
      const dt = (now - this.timestamp);
      const freq = dt > 0 ? 1000 / dt : 0;
      if (this.frequency === null) {
        this.frequency = freq;
      } else {
        this.frequency = (1 - this.freqAlpha) * this.frequency + this.freqAlpha * freq;
      }
    }
    this.timestamp = now;
  }

  /**
   * Gets static metadata for this handler.
   * The REST-sourced portion (_restMeta) is merged once and cached in _metaCache;
   * the cache is invalidated when _restMeta changes or the path is reset.
   * getSelfPath() is still called on every read because it reflects live SK state.
   * SK may contribute displayName, description, units, zones, etc.
   * If a field is absent from SK, it will not appear here — the webapp supplies fallbacks.
   * @returns {Object}
   */
  get meta() {
    try {
      const skMeta = this._app.getSelfPath(this.path)?.meta ?? {};
      if (!this._metaCache) {
        // Rebuild the REST-layer merge. Only runs when _restMeta changes.
        const restMeta = this._restMeta ?? {};
        // REST cache is the base; getSelfPath overlays field by field.
        // For object-valued fields (e.g. displayUnits), merge one level deeper so
        // REST cache fills any members that getSelfPath omits due to the known bug.
        const merged = { ...restMeta };
        for (const [key, val] of Object.entries(skMeta)) {
          if (val && typeof val === 'object' && !Array.isArray(val) &&
              merged[key] && typeof merged[key] === 'object') {
            merged[key] = { ...merged[key], ...val };
          } else {
            merged[key] = val;
          }
        }
        this._metaCache = merged;
      }
      return { id: this.id, path: this.path, idlePeriod: this.idlePeriod, ...this._metaCache };
    } catch (e) {
      return { id: this.id, path: this.path, idlePeriod: this.idlePeriod, ...(this._restMeta ?? {}) };
    }
  }

  /**
   * Gets dynamic state for this handler.
   * @returns {Object}
   */
  get state() {
    const lastDelta = this.timestamp;
    return {
      id: this.id,
      subscribed: this.subscribed,
      pathKnown: this._restMeta !== null,
      hasDelta: this._ready,
      isStale: this.stale,
      stalenessDetection: this._stalenessDetection,
      lastDelta,
      deltaAge: lastDelta ? Date.now() - lastDelta : null,
      frequency: this.frequency,
      ready: this.ready,
    };
  }

  /**
   * Returns true when this handler holds a currently valid value.
   * For subscribed handlers this is set by incoming SK data and cleared on staleness.
   * For write-only/derived handlers this is set by assignment to value and cleared by invalidate().
   * A handler with no path and no subscription is a constant/placeholder contributor
   * (e.g. a fixed angle of 0 when only magnitude is used) and is always ready.
   * @returns {boolean}
   */
  get ready() {
    return !this.stale && this._ready;
  }

  /**
   * Returns a summary object for reporting.
   * @returns {Object}
   */
  report() {
    return {
      id: this.id,
      path: this.path,
      value: this.value,
      state: this.state
    };
  }
}

function createSmoothedHandler({
  id,
  path,
  subscribe = false,
  app,
  pluginId,
  SmootherClass = ExponentialSmoother,
  smootherOptions = {},
  subscribeOptions = { excludeSelf: true },
}) {
  const handler = new MessageHandler(app, pluginId, id);
  handler.configure(path, subscribeOptions);
  const smoother = new MessageSmoother(handler, SmootherClass, smootherOptions); // create before subscribe to avoid race
  if (subscribe) {
    handler.subscribe();
    handler.onChange = () => { smoother.sample(); };
  }
  return smoother;
}

module.exports = { MessageHandler, MessageSmoother, createSmoothedHandler };


