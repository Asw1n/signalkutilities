// Statistical smoothing and variance tracking for MessageHandler values, using Smoother classes

const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');



/**
 * MessageHandlerSmoothed wraps a MessageHandler and applies a smoothing algorithm
 * using a specified Smoother class (MovingAverageSmoother, ExponentialSmoother, KalmanSmoother).
 *
 * @param {string} id - Identifier for this handler.
 * @param {MessageHandler} handler - The underlying MessageHandler instance.
 * @param {Function} SmootherClass - The smoother class to use (e.g., ExponentialSmoother).
 * @param {Object} [smootherOptions={}] - Options to pass to the smoother.
 */
class MessageSmoother {
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

  terminate() {
    return this.handler.terminate();
  }

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

  get stale() {
    return this.handler.stale;
  }

  setDisplayAttributes(attr) {
    this._displayAttributes = attr;
  }

  setDisplayAttribute(key, value) {
    this._displayAttributes[key] = value;
  }

  get displayAttributes() {
    return { ...this._displayAttributes, stale: this.stale };
  }

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

  get frequency() {
    return this.handler.frequency;
  }
}

class MessageHandler {
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

  setDisplayAttributes(attr) {
    this._displayAttributes = attr;
    return this;
  }

  setDisplayAttribute(key, value) {
    this._displayAttributes[key] = value;
  }

  /**
   * @deprecated Use the 'stale' property instead.
   */
  lackingInputData() {
    return this.stale;
  }

  get displayAttributes() {
    return { ...this._displayAttributes, stale: this.stale };
  } 

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
 * @param {string} id - Identifier for the handler.
 * @param {string} path - Signal K path.
 * @param {string} source - Source label.
 * @param {boolean} subscribe - Subscribe to path.
 * @param {Object} app - The app instance.
 * @param {string} pluginId - Plugin identifier.
 * @param {Function} SmootherClass - The smoother class to use.
 * @param {Object} smootherOptions - Options for the smoother.
 * @param {Object} displayAttributes - Display attributes for the smoother.
 * @param {Function} [onIdle] - Optional onIdle callback.
 * @returns {{ handler: MessageHandler, smoother: MessageSmoother }}
 */
function createSmoothedHandler({
  id,
  path,
  source,
  subscribe = false,
  app,
  pluginId,
  SmootherClass = MessageSmoother,
  smootherOptions = {},
  displayAttributes = {},
  onIdle = null
}) {
  const handler = new MessageHandler(id, path, source);
  if (subscribe) {
    handler.subscribe(app, pluginId, true, onIdle);
    handler.onChange = () => { smoother.sample(); };
  }
  const smoother = new MessageSmoother(id, handler, SmootherClass, smootherOptions);
  smoother.setDisplayAttributes(displayAttributes);
  return smoother;
}

module.exports = { MessageHandler, MessageSmoother, createSmoothedHandler };


