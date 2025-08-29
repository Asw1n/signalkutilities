const { MessageHandler, MessageHandlerDamped } = require('./MessageHandler');


class Polar {
  static send(app, pluginId, polars) {
    let values = [];
    polars.forEach(polar => {
      values.push({
        path: polar.pathMagnitude,
        value: polar.magnitude
      });
      values.push({
        path: polar.pathAngle,
        value: polar.angle
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


  constructor(id, pathMagnitude, pathAngle, sourceMagnitude, sourceAngle) {
    this.id = id;
    this.pathMagnitude = pathMagnitude;
    this.pathAngle = pathAngle;
    this.sourceMagnitude = sourceMagnitude;
    this.sourceAngle = sourceAngle;
    this.magnitudeHandler = new MessageHandler(this.id + "Magnitude", this.pathMagnitude, this.sourceMagnitude);
    this.angleHandler = new MessageHandler(this.id + "Angle", this.pathAngle, this.sourceAngle);
    this.onChange = null;
    // initialise to unit vector
    this.magnitudeHandler.value = 1;
    this.angleHandler.value = 0;
    this.xValue = 1;
    this.yValue = 0;
    this.displayAttributes = {};
    this.angleRange = '-piToPi';
  }
  setAngleRange(range) {
    if (range === '0to2pi' || range === '-piToPi') {
      this.angleRange = range;
    }
  }


  subscribe(app, pluginId, magnitude = true, angle = true, passOn = true, onIdle = null) {
    if (magnitude) {
      this.magnitudeHandler.onChange = this.processChanges.bind(this);
      this.magnitudeHandler.subscribe(app, pluginId, passOn, onIdle);
    }
    if (angle) {
      this.angleHandler.onChange = this.processChanges.bind(this);
      this.angleHandler.subscribe(app, pluginId, passOn, onIdle);
    }
  }

  terminate(app) {
    this.magnitudeHandler.terminate(app);
    this.angleHandler.terminate(app); 
    return null;
  }

  processChanges() {
    this.xValue = this.magnitudeHandler.value * Math.cos(this.angleHandler.value);
    this.yValue = this.magnitudeHandler.value * Math.sin(this.angleHandler.value);
    if (typeof this.onChange === 'function') {
      this.onChange();
    }
  }

  copyFrom(polar) {
    this.xValue = polar.x;
    this.yValue = polar.y;
  }

  substract(polar) {
    this.xValue -= polar.x;
    this.yValue -= polar.y;
  }
  add(polar) {
    this.xValue += polar.x;
    this.yValue += polar.y;
  }

  rotate(angle) {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const xNew = this.xValue * cosAngle - this.yValue * sinAngle;
    const yNew = this.xValue * sinAngle + this.yValue * cosAngle;
    this.xValue = xNew;
    this.yValue = yNew;
  }

  scale(factor) {
    this.xValue *= factor;
    this.yValue *= factor;
  }

  setPolarValue(value) {
    this.xValue = value.magnitude * Math.cos(value.angle);
    this.yValue = value.magnitude * Math.sin(value.angle);
  }

  setVectorValue(value) {
    this.xValue = value.x;
    this.yValue = value.y;
  }

  setDisplayAttributes(attr) {
    this.displayAttributes = attr;
  }

  set x(value) {
    this.xValue = value;
  }

  set y(value) {
    this.yValue = value;
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

  lackingInputData() {
    return this.magnitudeHandler.lackingInputData() || this.angleHandler.lackingInputData();
  }

  report() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      magnitude: this.magnitude,
      angle: this.angle,
      displayAttributes: this.displayAttributes,
    };
  }

}

class PolarDamped {
  constructor(id, polar, timeConstant = 1.0) {   // τ in seconds
    this.id = id;
    this.polar = polar;
    this.timeConstant = timeConstant;
    this.xValue = 0;
    this.yValue = 0;
    this.xVar = 0;  // variance in x
    this.yVar = 0;  // variance in y
    this.timestamp = null;
    this.n = 0;
    this.displayAttributes = {};
    this.angleRange = '-piToPi';
  }

  setAngleRange(range) {
    if (range === '0to2pi' || range === '-piToPi') {
      this.angleRange = range;
    }
  }

  static send(app, pluginId, polarsDamped) {
    let values = [];
    polarsDamped.forEach(pd => {
      values.push({
        path: pd.polar.pathMagnitude,
        value: pd.magnitude
      });
      values.push({
        path: pd.polar.pathAngle,
        value: pd.angle
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

  sample() {
    const now = Date.now();
    // If timeConstant is 0, instantly follow polar values, no smoothing
    if (this.timeConstant === 0) {
      this.xValue = this.polar.xValue;
      this.yValue = this.polar.yValue;
      this.xVar = 0;
      this.yVar = 0;
      this.timestamp = now;
      this.n++;
      return;
    }
    if (this.timestamp) {
      const dt = (now - this.timestamp) / 1000; // seconds
      if (dt === 0) {
        this.timestamp = now;
        this.n++;
        return;
      }
      const factor = Math.exp(-dt / this.timeConstant);

      // Save old mean before updating, ensure valid numbers
      const prevX = (typeof this.xValue === 'number' && !isNaN(this.xValue)) ? this.xValue : this.polar.xValue;
      const prevY = (typeof this.yValue === 'number' && !isNaN(this.yValue)) ? this.yValue : this.polar.yValue;

      // Update means (exponential smoothing)
      this.xValue = factor * prevX + (1 - factor) * this.polar.xValue;
      this.yValue = factor * prevY + (1 - factor) * this.polar.yValue;

      // Update variances (exponential smoothing of squared deviations)
      const dx = this.polar.xValue - prevX;
      const dy = this.polar.yValue - prevY;
      const prevXVar = (typeof this.xVar === 'number' && !isNaN(this.xVar)) ? this.xVar : 0;
      const prevYVar = (typeof this.yVar === 'number' && !isNaN(this.yVar)) ? this.yVar : 0;
      this.xVar = factor * prevXVar + (1 - factor) * dx * dx;
      this.yVar = factor * prevYVar + (1 - factor) * dy * dy;

    } else {
      // First sample initializes mean, variance = 0
      this.xValue = this.polar.xValue;
      this.yValue = this.polar.yValue;
      this.xVar = 0;
      this.yVar = 0;
    }
    this.timestamp = now;
    this.n++;
  }

  get polarValue() {
    return {
      magnitude: Math.sqrt(this.xValue * this.xValue + this.yValue * this.yValue),
      angle: this._formatAngle(Math.atan2(this.yValue, this.xValue))
    };
  }

  setDisplayAttributes(attr) {
    this.displayAttributes = attr;
  }

  report() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      magnitude: this.magnitude,
      angle: this.angle,
      displayAttributes: this.displayAttributes,
      xVariance: this.xVar,
      yVariance: this.yVar
    };
  }

  get vectorValue() { return { x: this.xValue, y: this.yValue }; }
  get vector() { return [this.xValue, this.yValue]; }
  get x() { return this.xValue; }
  get y() { return this.yValue; }
  get magnitude() { return Math.sqrt(this.xValue * this.xValue + this.yValue * this.yValue); }
  get angle() { return this._formatAngle(Math.atan2(this.yValue, this.xValue)); }

  _formatAngle(angle) {
    if (this.angleRange === '0to2pi') {
      return (angle < 0) ? angle + 2 * Math.PI : angle;
    }
    // default: -pi to pi
    return angle;
  }
  get variance() { return [this.xVar, this.yVar]; }


}


module.exports = { Polar, PolarDamped };