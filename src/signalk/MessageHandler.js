// Statistical smoothing and variance tracking for MessageHandler values, using Smoother classes

const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');

/**
 * MessageSmoother wraps a MessageHandler and applies a smoothing algorithm
 * using a specified Smoother class (MovingAverageSmoother, ExponentialSmoother, KalmanSmoother).
 * It supports both scalar and object values, automatically creating smoothers for numeric properties in objects.
 * The MessageSmootherpasses on configuration changes to the underlying MessageHandler. 
 * 
 **/

class MessageSmoother {
 



  /**
   * @param {string} id - Identifier for this handler.
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
    this.onChange = null; // Add onChange property
  }

  /**
   * Gets the handler id.
   * @returns {string}
   */
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
   * Terminates the underlying handler.
   * @returns {null}
   */
  terminate(clearCallback = true) {
    return this.handler.terminate(clearCallback);
  }

  /**
   * Adds a new sample from the handler to the smoother(s).
   * @returns {MessageSmoother}
   */
  sample() {
    if (!this.ready) return this;
    if (this.n === 0) this.reset();
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
    return this.handler.stale;
  }

  /**
   * Returns true if the underlying handler is ready.
   * @returns {boolean}
   */
  get ready() {
    return this.handler.ready;
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
    return { id: this.id, ...this.handler.state };
  }

  /**
   * Returns a summary object for reporting.
   * @returns {Object}
   */
  /**
   * Returns the list of sources seen by the underlying handler.
   * @returns {string[]}
   */
  getSources() {
    return this.handler.getSources();
  }

  report() {
    return {
      id: this.id,
      path: this.handler.path,
      value: this.value,
      variance: this.variance,
      source: this.handler.source,
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
  /* Old constructor
  constructor(id, path, source) {
    this.id = id;
    this._path = path;
    this._source = typeof source === 'string' ? source.replace(/\s+/g, "") : source;

    this.value = null;
    this.timestamp = null;
    this.frequency = null;
    this.freqAlpha = 0.2;
    this.onChange = null;
    this._displayAttributes = {};
    this.subscribed = false;
    this.n = 0;
    this._onIdle = null;
    this.idlePeriod = 4000; // ms
    this._idleTimer = null;
    this.stale = false;
    this._passOn = true;
    this._app = null;
    this._pluginId = null;
  }
    */

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
 
    this.value = null;
    this.timestamp = null;
    this.frequency = null;
    this.freqAlpha = 0.2;
    this.onChange = null;
    this.subscribed = false;
    this.n = 0;
    this.idlePeriod = 4000; // ms
    this._idleTimer = null;
    this.stale = false;
    this._passOn = true;
    this._path="";
    this._source="";
    this._sources = new Set();
    this._unsubscribes = [];      // holds unsubscribe fns pushed by subscriptionmanager
    this._deltaGate = { active: false }; // gates registered delta handlers after terminate()
    this._restMeta = null;
  }

  /**
   * Gets the handler id.
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  set path(newPath) {
    this._path = newPath;
    this._sources = new Set();
    this._restMeta = null;
    this._fetchRestMeta(newPath);
    if (this.subscribed ) {
      this.terminate(false);
      this.subscribe();
    }
  }

  get path() {
    return this._path;
  }

  set source(newSource) {
    this._source = typeof newSource === 'string' ? newSource.replace(/\s+/g, "") : newSource;
    if (this.subscribed ) {
      this.terminate(false);
      this.subscribe();
    }
  }

  get source() {
    return this._source;
  }

  set passOn(newPassOn) {
    this._passOn = newPassOn;
    if (this.subscribed ) {
      this.terminate(false);
      this.subscribe( );
    } 
  }

  get passOn() {
    return this._passOn;
  }

  set onChange(newOnChange) {
    this._onChange = newOnChange;
  }

  get onChange() {
    return this._onChange;
  }

  configure(path, source, passOn = true, onChange) {
    this._path = path;
    this._source = typeof source === 'string' ? source.replace(/\s+/g, "") : source;
    this._passOn = passOn;
    if (onChange !== undefined) this._onChange = onChange;
    this._restMeta = null;
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
    // Release subscriptionmanager subscription (passOn = true path)
    this._unsubscribes.forEach(fn => fn());
    this._unsubscribes = [];
    // Neutralise any registered delta handler (passOn = false path)
    this._deltaGate.active = false;
    this.subscribed = false;
    this.stale = false;
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
      values.push({
        path: delta._path,
        value: delta.value
      });
    });
    const message = {
      context: 'vessels.self',
      updates: [
        {
          $source: pluginId,
          values: values
        }]
    };
    app.handleMessage(pluginId, message);
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
      this.stale = true;
      return;
    }

    app.debug(`Subscribing to ${path}` + (this._source ? ` from source ${this._source}` : ""));
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this.stale = false;
    }

    if (this._passOn) {
      this._subscribeViaManager(path);
    } else {
      this._subscribeViaHandler(path);
    }

    this.subscribed = true;
    return this;
  }

  /**
   * Subscribes using app.subscriptionmanager (passOn = true).
   * Provides efficient path-scoped delivery and proper unsubscription.
   * @private
   */
  _subscribeViaManager(path) {
    const app = this._app;
    const pluginId = this._pluginId;
    const source = this._source;
    const label = (typeof source === 'string' && source) ? source : null;

    app.subscriptionmanager.subscribe(
      { context: 'vessels.self', subscribe: [{ path, policy: 'instant', minPeriod: 0 }] },
      this._unsubscribes,
      err => app.debug(`MessageHandler[${this.id}] subscription error: ${err}`),
      delta => {
        let found = false;
        delta?.updates?.forEach(update => {
          const updateSource = update?.$source ?? update?.source?.label;
          const isOwnSource = update?.source?.label === pluginId ||
            updateSource === pluginId ||
            (typeof updateSource === 'string' && updateSource.startsWith(pluginId + '.'));
          if (!isOwnSource && (!label || updateSource === label)) {
            if (Array.isArray(update?.values)) {
              for (const entry of update.values) {
                if (path === entry.path) {
                  this.value = entry.value;
                  this.updateFrequency();
                  found = true;
                  if (updateSource) this._sources.add(updateSource);
                }
              }
            }
          }
        });
        if (found) {
          this._resetIdleTimer();
          if (typeof this._onChange === 'function') {
            this._onChange();
          }
        }
      }
    );
  }

  /**
   * Subscribes using app.registerDeltaInputHandler (passOn = false).
   * Required when the delta must be suppressed from the stream.
   * The handler is gated so terminate() renders it inert without deregistering it.
   * @private
   */
  _subscribeViaHandler(path) {
    const app = this._app;
    const pluginId = this._pluginId;
    const source = this._source;
    const label = (typeof source === 'string' && source) ? source : null;
    const gate = this._deltaGate;
    gate.active = true;

    app.registerDeltaInputHandler((delta, next) => {
      if (!gate.active) return next(delta);

      const selfContext = app.selfContext ?? 'vessels.self';
      if (delta && delta.context && delta.context !== selfContext) {
        return next(delta);
      }

      let found = false;
      delta?.updates?.forEach(update => {
        const updateSource = update?.$source ?? update?.source?.label;
        const isOwnSource = update?.source?.label === pluginId ||
          updateSource === pluginId ||
          (typeof updateSource === 'string' && updateSource.startsWith(pluginId + '.'));
        if (!isOwnSource && (!label || updateSource === label)) {
          if (Array.isArray(update?.values)) {
            for (let i = update.values.length - 1; i >= 0; i--) {
              if (path === update.values[i].path) {
                this.value = update.values[i].value;
                this.updateFrequency();
                found = true;
                if (updateSource) this._sources.add(updateSource);
                update.values.splice(i, 1);
              }
            }
          }
        }
      });
      if (found) {
        this._resetIdleTimer();
        if (typeof this._onChange === 'function') {
          this._onChange();
        }
      }
      next(delta);
    });
  }

  /**
   * Resets the idle timer for staleness detection.
   * @private
    */
  _resetIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      if (this.stale) {
        this._app.debug(`Data received for ${this.path}, clearing stale state.`);
       }
      this.stale = false;
    }
    this._idleTimer = setTimeout(() => {
      this._app.debug(`No data for ${this.path}`);
      this.stale = true;
    }, this.idlePeriod);
  }

  /**
   * Fetches metadata for the given path from the SK REST API and caches it.
   * Fire-and-forget; called whenever the path changes.
   * @private
   */
  _fetchRestMeta(path) {
    if (!path) return;
    const app = this._app;
    const protocol = app.config?.ssl ? 'https' : 'http';
    const port = app.config?.port ?? app.config?.settings?.port;
    if (!port) {
      app.debug(`MessageHandler[${this.id}]: cannot fetch REST meta — port not found in app.config`);
      return;
    }
    const skPath = path.replace(/\./g, '/');
    const url = `${protocol}://localhost:${port}/signalk/v1/api/vessels/self/${skPath}/meta`;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && typeof data === 'object') this._restMeta = data; })
      .catch(err => app.debug(`MessageHandler[${this.id}]: REST meta fetch failed for ${path}: ${err.message}`));
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
   * Lazily reads SK meta for this path on every call — no caching.
   * SK may contribute displayName, description, units, zones, etc.
   * If a field is absent from SK, it will not appear here — the webapp supplies fallbacks.
   * @returns {Object}
   */
  get meta() {
    try {
      const skMeta = this._app.getSelfPath(this.path)?.meta ?? {};
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
      return { id: this.id, path: this.path, source: this.source, idlePeriod: this.idlePeriod, ...merged };
    } catch (e) {
      return { id: this.id, path: this.path, source: this.source, idlePeriod: this.idlePeriod, ...(this._restMeta ?? {}) };
    }
  }

  /**
   * Gets dynamic state for this handler.
   * @returns {Object}
   */
  get state() {
    return { id: this.id, stale: this.stale, frequency: this.frequency, sources: this.getSources() };
  }

  /**
   * Returns true if the handler is ready to provide a value.
   * A handler that is not subscribed is always ready (write-only use).
   * A subscribed handler becomes ready once the first value has been received.
   * @returns {boolean}
   */
  get ready() {
    return !this.subscribed || this.value !== null;
  }

  /**
   * Returns the list of sources seen for the subscribed path.
   * Empty if not subscribed or no data received yet.
   * Cleared when path changes.
   * @returns {string[]}
   */
  getSources() {
    return [...this._sources];
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
      source: this.source,
      state: this.state
    };
  }
}

function createSmoothedHandler({
  id,
  path,
  source,
  subscribe = false,
  app,
  pluginId,
  SmootherClass = ExponentialSmoother,
  smootherOptions = {},
}) {
  const handler = new MessageHandler(app, pluginId, id);
  handler.configure(path, source, true);
  const smoother = new MessageSmoother(handler, SmootherClass, smootherOptions); // create before subscribe to avoid race
  if (subscribe) {
    handler.subscribe();
    handler.onChange = () => { smoother.sample(); };
  }
  return smoother;
}

module.exports = { MessageHandler, MessageSmoother, createSmoothedHandler };


