// Statistical smoothing and variance tracking for MessageHandler values, using Smoother classes

const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');



/**
 * MessageSmoother wraps a MessageHandler and applies a smoothing algorithm
 * using a specified Smoother class (MovingAverageSmoother, ExponentialSmoother, KalmanSmoother).
 *
 * @class
 */

class MessageSmoother {
  /**
   * @param {string} id - Identifier for this handler.
   * @param {MessageHandler} handler - The underlying MessageHandler instance.
   * @param {Function} [SmootherClass=ExponentialSmoother] - The smoother class to use.
   * @param {Object} [smootherOptions={}] - Options to pass to the smoother.
   */
  constructor(id, handler, SmootherClass = ExponentialSmoother, smootherOptions = {}) {
    // Remove: this.id = id;
    this.handler = handler;
    this.SmootherClass = SmootherClass;
    this.smootherOptions = smootherOptions;
    this.smoother = null;
    this.timestamp = null;
    this.n = 0;
    this._displayAttributes = {};
    this._isObject = false;
    this._propertyKeys = null;
    this.onChange = null; // Add onChange property
  }

  /**
   * Gets the handler id.
   * @returns {string}
   */
  get id() {
    return this.handler.id;
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
   * Terminates the underlying handler.
   * @returns {null}
   */
  terminate() {
    return this.handler.terminate();
  }

  /**
   * Adds a new sample from the handler to the smoother(s).
   * @returns {MessageSmoother}
   */
  sample() {
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
        if (typeof this.smoother[key].standardError === 'function'){
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
   * Sets display attributes for UI.
   * @param {Object} attr
   */
  setDisplayAttributes(attr) {
    this._displayAttributes = attr;
  }

  /**
   * Sets a single display attribute.
   * @param {string} key
   * @param {*} value
   */
  setDisplayAttribute(key, value) {
    this._displayAttributes[key] = value;
  }

  /**
   * Gets display attributes, including staleness.
   * @returns {Object}
   */
  get displayAttributes() {
    return { ...this._displayAttributes, stale: this.stale };
  }

  /**
   * Returns a summary object for reporting.
   * @returns {Object}
   */
  report() {
    return {
      id: this.id,
      value: this.value,
      variance: this.variance,
      path: this.handler.path,
      source: this.handler.source,
      displayAttributes: this.displayAttributes
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
   * Constructs a MessageHandler.
   * @param {string} id - Identifier for this handler.
   * @param {string} path - Signal K path.
   * @param {string} source - Source label.
   */
  constructor(id, path, source) {
    this.id = id;
    this.path = path;
    this.source = typeof source === 'string' ? source.replace(/\s+/g, "") : source;
    this.value = null;
    this.timestamp = null;
    this.frequency = null;
    this.freqAlpha = 0.2;
    this.onChange = null;
    this._displayAttributes = {};
    this.subscribed = false;
    this.n = 0;
    this.onIdle = null;
    this.idlePeriod = 4000; // ms
    this._idleTimer = null;
    this.stale = false;
  }

  /**
   * Terminates the handler, unsubscribes and clears timers.
   * @param {Object} app - The app instance.
   * @returns {null}
   */
  terminate(app) {
    this.onChange = null;
    this.onIdle = null;
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    if (this.subscribed) {
      //app.registerDeltaInputHandler(null);
    }
    this.subscribed = false;
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
        path: delta.path,
        value: delta.value
      });
    });
    const message = {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: pluginId
          },
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
          source: { label: pluginId },
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

  /**
   * Subscribes to Signal K updates for the specified path and source.
   * @param {Object} app - The app instance.
   * @param {string} pluginId - Plugin identifier.
   * @param {boolean} [passOn=true] - Whether to pass on the delta.
   * @param {Function} [onIdle=null] - Callback for idle state.
   * @returns {MessageHandler}
   */
  subscribe(app, pluginId, passOn = true, onIdle = null) {
    this.onIdle = onIdle;
    let label = null, talker = null;
    if (typeof this.source === 'string' && this.source.includes('.')) {
      [label, talker] = this.source.split('.', 2);
    }
    if (!this.path || this.path === "") {
      app.debug(`${this.id} is trying to subscribe to an empty path, subscription aborted`);
      this.stale = true;
      return;
    }
    app.debug(`Subscribing to ${this.path}` + (this.source ? ` from source ${this.source}` : ""));
    this._resetIdleTimer(app);
    app.registerDeltaInputHandler((delta, next) => {
      // Only process deltas for vessels.self
      if (delta && delta.context && delta.context !== 'vessels.self') {
        return next(delta);
      }
      let found = false;
      delta?.updates.forEach(update => {
        if (update?.source?.label != pluginId && (!this.source || (update?.source?.label == label && update?.source?.talker == talker))) {
          if (Array.isArray(update?.values)) {
            for (let i = update.values.length - 1; i >= 0; i--) {
              if (this.path == update.values[i].path) {
                this.value = update.values[i].value;
                this.updateFrequency();
                found = true;
                if (!passOn) update.values.splice(i, 1); 
              }
            }
          }
        }
      });
      if (found) {
        this._resetIdleTimer(app);
        if (typeof this.onChange === 'function') {
          this.onChange();
        }
      }
      next(delta);
    });
    this.subscribed = true;
    return this;
  }

  /**
   * Resets the idle timer for staleness detection.
   * @private
   * @param {Object} app - The app instance.
   */
  _resetIdleTimer(app) {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this.stale = false;
    }
    this._idleTimer = setTimeout(() => {
      app.debug(`No data for ${this.path}`);
      this.stale = true;
      if (typeof this.onIdle === 'function') {
        this.onIdle(this);
      }
    }, this.idlePeriod);
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
   * Sets display attributes for UI.
   * @param {Object} attr
   * @returns {MessageHandler}
   */
  setDisplayAttributes(attr) {
    this._displayAttributes = attr;
    return this;
  }

  /**
   * Sets a single display attribute.
   * @param {string} key
   * @param {*} value
   */
  setDisplayAttribute(key, value) {
    this._displayAttributes[key] = value;
  }

  /**
  * Load Signal K metadata for this.path into displayAttributes.
  * Merges server meta first, then any attributes already set in code.
  * @param {Object} app - The app instance.
  * @returns {MessageHandler}
  */
  loadMeta(app) {
    if (!app || typeof app.getSelfPath !== 'function' || !this.path) {
      return this;
    }

    try {
      const node = app.getSelfPath(this.path);
      if (node && node.meta && typeof node.meta === 'object') {
        this._displayAttributes = {
          ...node.meta,
          ...this._displayAttributes
        };
      }
    } catch (e) {
      if (typeof app.debug === 'function') {
        app.debug(`MessageHandler[${this.id}]: failed to load meta for ${this.path}: ${e.message}`);
      }
    }

    return this;
  }

  /**
   * @deprecated Use the 'stale' property instead.
   * @returns {boolean}
   */
  lackingInputData() {
    return this.stale;
  }

  /**
   * Gets display attributes, including staleness.
   * @returns {Object}
   */
  get displayAttributes() {
    return { ...this._displayAttributes, stale: this.stale };
  }

  /**
   * Returns a summary object for reporting.
   * @returns {Object}
   */
  report() {
    return {
      id: this.id,
      value: this.value,
      path: this.path,
      source: this.source,
      displayAttributes: this.displayAttributes
    }
  }
}

/**
 * Creates a MessageHandler and a linked MessageSmoother.
 * @param {Object} options
 * @param {string} options.id - Identifier for the handler.
 * @param {string} options.path - Signal K path.
 * @param {string} options.source - Source label.
 * @param {boolean} [options.subscribe=false] - Subscribe to path.
 * @param {Object} options.app - The app instance.
 * @param {string} options.pluginId - Plugin identifier.
 * @param {Function} [options.SmootherClass=MessageSmoother] - The smoother class to use.
 * @param {Object} [options.smootherOptions={}] - Options for the smoother.
 * @param {Object} [options.displayAttributes={}] - Display attributes for the smoother.
 * @param {Function} [options.onIdle] - Optional onIdle callback.
 * @returns {MessageSmoother}
 */
function createSmoothedHandler({
  id,
  path,
  source,
  subscribe = false,
  app,
  pluginId,
  SmootherClass = ExponentialSmoother, // FIX: default to ExponentialSmoother
  smootherOptions = {},
  displayAttributes = {},
  onIdle = null
}) {
  const handler = new MessageHandler(id, path, source);
  const smoother = new MessageSmoother(id, handler, SmootherClass, smootherOptions); // create before subscribe to avoid race
  if (subscribe) {
    handler.subscribe(app, pluginId, true, onIdle);
    handler.onChange = () => { smoother.sample(); };
  }
  smoother.setDisplayAttributes(displayAttributes);
  return smoother;
}

module.exports = { MessageHandler, MessageSmoother, createSmoothedHandler };


