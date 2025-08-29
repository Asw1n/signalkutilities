// Statistical smoothing and variance tracking for MessageHandler values, analogous to PolarDamped

class MessageHandlerDamped {
  constructor(id, handler, timeConstant = 1.0) { // τ in seconds
    this.id = id;
    this.handler = handler;
    this.timeConstant = timeConstant;
    this.value = undefined; // can be number or object
    this.variance = undefined; // can be number or object
    this.timestamp = null;
    this.n = 0;
    this.displayAttributes = {};
  }

  sample() {
    const now = Date.now();
    const handlerValue = this.handler.value;
    // If timeConstant is 0, instantly follow handler value, no smoothing
    if (this.timeConstant === 0) {
      if (typeof handlerValue === 'number') {
        this.value = handlerValue;
        this.variance = 0;
      } else if (handlerValue && typeof handlerValue === 'object') {
        this.value = {};
        this.variance = {};
        for (const key in handlerValue) {
          if (typeof handlerValue[key] === 'number') {
            this.value[key] = handlerValue[key];
            this.variance[key] = 0;
          }
        }
      }
      this.timestamp = now;
      this.n++;
      return;
    }
    if (typeof handlerValue === 'number') {
      // Scalar value
      if (this.timestamp) {
        const dt = (now - this.timestamp) / 1000;
        if (dt === 0) {
          // skip update if no time has passed
          this.timestamp = now;
          this.n++;
          return;
        }
        const factor = Math.exp(-dt / this.timeConstant);
        const prevValue = (typeof this.value === 'number' && !isNaN(this.value)) ? this.value : handlerValue;
        this.value = factor * prevValue + (1 - factor) * handlerValue;
        const d = handlerValue - prevValue;
        const prevVar = (typeof this.variance === 'number' && !isNaN(this.variance)) ? this.variance : 0;
        this.variance = prevVar * factor + (1 - factor) * d * d;
      } else {
        this.value = handlerValue;
        this.variance = 0;
      }
    } else if (handlerValue && typeof handlerValue === 'object') {
      // Object with named numbers
      if (!this.value || typeof this.value !== 'object') {
        // First sample: initialize all keys
        this.value = {};
        this.variance = {};
        for (const key in handlerValue) {
          if (typeof handlerValue[key] === 'number') {
            this.value[key] = handlerValue[key];
            this.variance[key] = 0;
          }
        }
      } else {
        const dt = this.timestamp ? (now - this.timestamp) / 1000 : 0;
        if (dt === 0) {
          this.timestamp = now;
          this.n++;
          return;
        }
        const factor = this.timestamp ? Math.exp(-dt / this.timeConstant) : 0;
        for (const key in handlerValue) {
          if (typeof handlerValue[key] === 'number') {
            // Always initialize if missing or NaN
            if (typeof this.value[key] !== 'number' || isNaN(this.value[key])) {
              this.value[key] = handlerValue[key];
            }
            const prevValue = this.value[key];
            this.value[key] = factor * prevValue + (1 - factor) * handlerValue[key];
            const d = handlerValue[key] - prevValue;
            if (typeof this.variance[key] !== 'number' || isNaN(this.variance[key])) {
              this.variance[key] = 0;
            }
            this.variance[key] = this.variance[key] * factor + (1 - factor) * d * d;
          }
        }
      }
    }
    this.timestamp = now;
    this.n++;
  }

  setDisplayAttributes(attr) {
    this.displayAttributes = attr;
  }

  report() {
    return {
      id: this.id,
      value: this.value,
      variance: this.variance,
      timestamp: this.timestamp,
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
    this.displayAttributes = {};
    this.subscribed = false;
    this.n = 0;
    this.onIdle = null;
    this.idlePeriod = 10000; // ms
    this._idleTimer = null;
  }

  subscribe(app, pluginId, passOn = true, onIdle = null) {
    this.onIdle = onIdle;
    let label = null, talker = null;
    if (typeof this.source === 'string' && this.source.includes('.')) {
      [label, talker] = this.source.split('.', 2);
    }
    app.debug(`Subscribing to ${this.path}` + (this.source ? ` from source ${this.source}` : ""));
    this._resetIdleTimer(app);
    app.registerDeltaInputHandler((delta, next) => {
      let found = false;
      delta?.updates.forEach(update => {
        if (update?.source?.label != pluginId && (!this.source || (update?.source?.label == label && update?.source?.talker == talker))) {
          if (Array.isArray(update?.values)) {
            update?.values.forEach(pathValue => {
              if (this.path == pathValue.path) {
                this.value = pathValue.value;
                this.updateFrequency();
                found = true;
              }
            });
          }
        }
      });
      if (found) {
        this._resetIdleTimer(app);
      }
      if (found && typeof this.onChange === 'function') {
        this.onChange();
      }
      if ((found && passOn) || !found) {
        next(delta);
      }
    });
    this.subscribed = true;
    return this;
  }

  _resetIdleTimer(app) {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
    }
    this._idleTimer = setTimeout(() => {
      app.debug(`No data for ${this.path}`);
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
    this.displayAttributes = attr;
    return this;
  }

  lackingInputData() {
    if (!this.subscribed) return false;
    if (this.timestamp === null) return true;
    return false;
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



module.exports = { MessageHandler, MessageHandlerDamped };


