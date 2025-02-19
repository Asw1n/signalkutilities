class DeltaBase {

  static sendDeltas(app, pluginId, deltas) {
    let values = [];
    deltas.forEach(delta => {
      values.push(delta.getMessage());
    });
    const delta = {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: pluginId
          },
          values: values
        }]
    };
    app.handleMessage(pluginId, delta);
  }

  constructor(path) {
    /** @type {string} The path of the delta */
    this.path = path;
    this.value = null;
    this.timestamp = null;
    this.label = "delta";
    this.id = "delta";
    this.timeConstant = 0;
    this.oldValue = null;
  }

  setDisplayAttributes(id, label) {
    this.id = id;
    this.label = label;
  }

  setValue(value) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  getMessage() {
    return {
      path: this.path,
      value: this.value
    };
  }

  copyFrom(delta) {
    if (!(delta instanceof Delta)) throw new Error('Parameter must be of type Delta');
    this.value = typeof delta.value === 'object' && delta.value !== null
      ? structuredClone(delta.value)
      : delta.value;
  }

  smoothen() {
    if (this.timestamp == null || this.timeConstant == 0) {
      this.oldVvalue = this.value;
      this.timestamp = new Date();
    }
    else {
      const now = new Date();
      const deltaT = (this.timestamp - now) / 1000;
      const alpha = 1 - Math.exp(-deltaT / this.timeConstant);
      this.value = this.oldValue + alpha * (this.value - this.oldValue);
      this.timestamp = now;
      this.oldValue = this.value;
    }
  }
}

class DeltaStat {
  constructor(delta) {
    if (!(delta instanceof DeltaBase)) throw new Error('Parameter must be of type DeltaBase');
    this.delta = delta;
    this.x = null;
    this._mean = null;
    this.meansq = null;
    this.a = 0.05;
    this.n = 0;
  }

  sample() {
    const x = this.delta.getValue();
    this.x = x;
    this.n += 1;
    if (this.n == 1) {
      this._mean = x;
      this.meansq = x ** 2;
    }
    else {
      meanOld = this._mean;
      this._mean = (1 - this.a) * this._mean + this.a * x;
      this.meansq = (1 - this.a) * this.meansq + this.a * (x - this._mean) * (x - meanOld);
    }
  }

  get obs() {
    return this.x;
  }

  get mean() {
    return this._mean;
  }

  get variance() {
    return this.meansq - this._mean ** 2;
  }





}

class DeltaSubscribe extends DeltaBase {
  subscribe(app, pluginId, unsubscribes, onChange = null, policy = "instant") {
    if (this.path?.trim?.().length) {
      app.debug(`subscribing to ${this.path}`);
      let localSubscription = {
        context: "vessels.self",
        subscribe: [{ path: this.path, policy: policy }]
      };
      app.subscriptionmanager.subscribe(
        localSubscription,
        unsubscribes,
        subscriptionError => {
          app.error('Error:' + subscriptionError);
        },
        delta => {
          delta.updates.forEach(u => {
            //app.debug(u.source?.label);
            //app.debug(this.pluginId);
            if (u.source?.label !== pluginId) {
              u.values.forEach(v => {
                this.value = v.value;
                this.smoothen();
                if (typeof onChange === 'function')
                  onChange(this.timestamp);
              }
              )

            }
          }
          )
        }
      )
    }
  }
}

class PolarDeltaBase {

  static sendDeltas(app, pluginId, polars) {
    let values = [];
    polars.forEach(polar => {
      let messages = polar.getMessages();
      messages.forEach(message => {
        values.push(message);
      })
    });
    const delta = {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: pluginId
          },
          values: values
        }]
    };
    app.handleMessage(pluginId, delta);
  }

  constructor(speedPath, anglePath) {
    this.pValue = { speed: null, angle: null };
    this.vValue = { x: null, y: null };
    this.path = { speed: speedPath, angle: anglePath };
    this.timestamp = null;
    this.timeConstant = 0;
    this.label = "polar";
    this.plane = "ref_Boat";
    this.id = "polar";
    this.renewed = { speed: false, angle: false };
  }

  setDisplayAttributes(id, refPlane, label) {
    this.id = id;
    this.plane = refPlane;
    this.label = label;
  }

  debug(app, message) {
    app.debug(`${message}: ${this.pValue.speed} , ${this.pValue.angle}`);
  }

  pToV() {
    this.vValue.x = this.pValue.speed * Math.cos(this.pValue.angle);
    this.vValue.y = this.pValue.speed * Math.sin(this.pValue.angle)
  }


  vToP() {
    this.pValue.speed = Math.sqrt(this.vValue.x ** 2 + this.vValue.y ** 2);
    this.pValue.angle = Math.atan2(this.vValue.y, this.vValue.x);
  }

  setPValue(value) {
    if (!("speed" in value && "angle" in value)) {
      throw new Error('Parameter must contain speed and angle');
    }
    else {
      this.pValue.speed = value.speed;
      this.pValue.angle = value.angle;
      this.pToV();
    }
  }


  setVValue(vector) {
    if (!("x" in vector && "y" in vector)) throw new Error('Parameter must have both x and y');
    else {
      this.vValue.x = vector.x;
      this.vValue.y = vector.y;
      this.vToP();
    }
  }

  setKValue(state) {
    this.vValue.x = state.mean[0][0];
    this.vValue.y = state.mean[1][0];
    this.vToP();
  }


  getPValue() {
    return { speed: this.pValue.speed, angle: this.pValue.angle };
  }

  getVValue() {
    return { x: this.vValue.x, y: this.vValue.y };
  }

  getMessages() {
    return [{ path: this.path.speed, value: this.pValue.speed }, { path: this.path.angle, value: this.pValue.angle }];
  }

  rotate(angle) {
    this.pValue.angle = (this.pValue.angle + angle + Math.PI) % (2 * Math.PI) - Math.PI;
    this.pToV();
  }

  scale(factor) {
    this.pValue.speed *= factor;
    this.pToV();
  }

  copyFrom(polar) {
    if (!(polar instanceof PolarDeltaBase)) throw new Error('Parameter must be of type PolarDeltaBase');
    else {
      this.pValue = polar.getPValue();
      this.pToV();
    }
  }

  add(polar) {
    if (!(polar instanceof PolarDeltaBase)) throw new Error('Parameter must be of type PolarDeltaBase');
    this.addVector(polar.getVValue());
  }

  addVector(vector) {
    if (!("x" in vector && "y" in vector)) throw new Error('Parameter must have both x and y');
    const a = this.getVValue();
    this.vValue.x += vector.x;
    this.vValue.y += vector.y;
    this.vToP();
  }

  substract(polar) {
    if (!(polar instanceof PolarDeltaBase)) throw new Error('Parameter must be of type PolarDeltaBase');
    this.substractVector(polar.getVValue());
  }

  substractVector(vector) {
    if (!("x" in vector && "y" in vector)) throw new Error('Parameter must have both x and y');
    this.vValue.x -= vector.x;
    this.vValue.y -= vector.y;
    this.vToP();
  }

}

class PolarStat {
  constructor(polar) {
    if (!(polar instanceof PolarDeltaBase)) throw new Error('Parameter must be of type DeltaBase');
    this.polar = polar;
    this.x = null;
    this._mean = null;
    this.meansq = null;
    this.a = 0.2;
    this.n = 0;
  }

  sample() {
    const p = this.polar.getVValue();
    const x = [p.x, p.y];
    this.x = x;
    this.n += 1;
    if (this.n == 1) {
      this._mean = x;
      this.meansq = x.map(num => num ** 2);
    }
    else {
      for (var n = 0; n < 2; n++) {
        const meanOld = this._mean[n];
        const meansqOld = this.meansq[n];
        this._mean[n] = (1 - this.a) * this._mean[n] + this.a * x[n];
        this.meansq[n] = (1 - this.a) * this.meansq[n] + this.a * (x[n] - this._mean[0]) * (x[n] - meanOld);
      }
    }
  }

  get obs() {
    return this.x;
  }

  get mean() {
    return this._mean;
  }

  get variance() {
    return this.meansq;
  }
}

class PolarDeltaSubscribe extends PolarDeltaBase {

  subscribe(app, pluginId, unsubscribes, onChange = null, policy = "instant") {
    app.debug(`subscribing to ${this.path.speed} and ${this.path.angle}`);
    let localSubscription = {
      context: "vessels.self",
      subscribe: [{ path: this.path.speed, policy: policy }, { path: this.path.angle, policy: policy }]
    };
    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          //app.debug(u.source?.label);
          //app.debug(this.pluginId);
          if (u.source?.label !== pluginId) {
            u.values.forEach(v => {
              if (v.path == this.path.speed) {
                this.pValue.speed = v.value;
                this.renewed.speed = true;
              }
              if (v.path == this.path.angle) {
                this.pValue.angle = v.value;
                this.renewed.angle = true;
              }
              if (this.renewed.speed && this.renewed.angle) {
                this.renewed.speed = false;
                this.renewed.angle = false;
                this.pToV();
                if (typeof onChange === 'function')
                  onChange(this.timestamp);
              }
            }
            )
          }
        }
        )
      }
    )
  }
}

class PolarDeltaCatch extends PolarDeltaBase {
  catchDeltas(app, pluginId, onChange) {
    app.debug(`Catching ${this.path}`);
    app.registerDeltaInputHandler((delta, next) => {
      let found = false;

      delta?.updates.forEach(update => {

        if (update?.source?.label != pluginId) {
          const timestamp = new Date(update.timestamp);
          if (Array.isArray(update?.values)) {
            update?.values.forEach(pathValue => {
              if (this.path.speed == pathValue.path) {
                this.pValue.speed = pathValue.value;
                this.renewed.speed = true;
              }
              if (this.path.angle == pathValue.path) {
                this.pValue.angle = pathValue.value;
                this.renewed.angle = true;
              }
            }
            )
          }
        }
      })
      if (this.renewed.speed && this.renewed.angle) {
        this.renewed.speed = false;
        this.renewed.angle = false;
        this.pToV();
        if (typeof onChange === 'function')
          onChange(this.getTimestamp());
      }
      else {
        next(delta);
      }
    });
  }

}

module.exports = { DeltaStat, PolarStat, DeltaBase, DeltaSubscribe, PolarDeltaBase, PolarDeltaCatch, PolarDeltaSubscribe};
