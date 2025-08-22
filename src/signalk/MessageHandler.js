class MessageHandler {

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

  constructor(path, source) {
    this.path = path;
    this.source = source;
    this.value = null;
    this.timestamp = null;
    this.frequency = null; 
    this.freqAlpha = 0.2; 
    this.onChange = null;
    this.displayAttributes = {};
  }

  subscribe(app, pluginId, passOn = true) {
 
    app.debug(`Subscribing to  ${this.path}` + (this.source != null ? ` from source ${this.source}` : "") );
    app.registerDeltaInputHandler((delta, next) => {
      let found = false;
      delta?.updates.forEach(update => {
        if (update?.source?.label != pluginId  && (!this.source || update?.source?.label == this.source)) {
          if (Array.isArray(update?.values)) {
            update?.values.forEach(pathValue => {
              if (this.path == pathValue.path) {
                this.value = pathValue.value;
                this.updateFrequency();
                found = true;
              }
            }
            )
          }
        }
      })

      if (found && typeof this.onChange === 'function') {
          this.onChange();
      }
      if ((found && passOn) || !found) {
        next(delta);
      }
    });
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
  } 

}

module.exports = MessageHandler;


