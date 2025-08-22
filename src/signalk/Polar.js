const MessageHandler = require('./MessageHandler');


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


  constructor(pathMagnitude, pathAngle, sourceMagnitude, sourceAngle) {

    this.pathMagnitude = pathMagnitude;
    this.pathAngle = pathAngle;
    this.sourceMagnitude = sourceMagnitude;
    this.sourceAngle = sourceAngle;
    this.magnitudeHandler = new MessageHandler(this.pathMagnitude, this.sourceMagnitude); 
    this.angleHandler = new MessageHandler(this.pathAngle, this.sourceAngle);
    this.onUpdate = null;
    // initialise to unit vector
    this.magnitudeHandler.value = 1;
    this.angleHandler.value = 0;
    this.xValue = 1;
    this.yValue = 0;
    this.displayAttributes = {};
  }


  subscribe(app, pluginId, magnitude = true, angle = true, passOn = true) {
    if (magnitude) {
      this.magnitudeHandler.onChange = this.processChanges.bind(this);
      this.magnitudeHandler.subscribe(app, pluginId, passOn);
    }
    if (angle) {
      this.angleHandler.onChange = this.processChanges.bind(this);
      this.angleHandler.subscribe(app, pluginId, passOn);
    }
  }

  processChanges() {
    this.xValue = this.magnitudeHandler.value * Math.cos(this.angleHandler.value);
    this.yValue = this.magnitudeHandler.value * Math.sin(this.angleHandler.value);
    if (typeof this.onUpdate === 'function') {
      this.onUpdate();
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

  get polarValue() {
    return {
      magnitude : Math.sqrt(this.xValue * this.xValue + this.yValue * this.yValue), 
      angle: Math.atan2(this.yValue, this.xValue)};
  }
  
  get vectorValue() {
    return {x: this.xValue, y: this.yValue};
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
    return Math.atan2(this.yValue, this.xValue);
  }
  
  get frequency() {
    const f1 = this.magnitudeHandler.frequency;
    const f2 = this.angleHandler.frequency;
    if (typeof f1 === 'number' && typeof f2 === 'number') {
      return Math.min(f1, f2);
    }
    if (typeof f1 === 'number') return f1;
    if (typeof f2 === 'number') return f2;
    return null;
  }
  
  get timestamp() {
    const f1 = this.magnitudeHandler.timestamp;
    const f2 = this.angleHandler.timestamp;
    if (typeof f1 === 'number' && typeof f2 === 'number') {
      return Math.max(f1, f2);
    }
    if (typeof f1 === 'number') return f1;
    if (typeof f2 === 'number') return f2;
    return null;
  }
}

class PolarDamped {
  constructor(polar, timeConstant = 5.0) {   // τ in seconds
    this.polar = polar;
    this.timeConstant = timeConstant;

    this.xValue = 0;
    this.yValue = 0;
    this.xVar = 0;  // variance in x
    this.yVar = 0;  // variance in y
    this.timestamp = null;
    this.n =0;
  }

  sample() {
    const now = Date.now();
    if (this.timestamp) {
      const dt = (now - this.timestamp) / 1000; // seconds
      const factor = Math.exp(-dt / this.timeConstant);

      // Save old mean before updating
      const prevX = this.xValue;
      const prevY = this.yValue;

      // Update means (exponential smoothing)
      this.xValue = factor * this.xValue + (1 - factor) * this.polar.xValue;
      this.yValue = factor * this.yValue + (1 - factor) * this.polar.yValue;

      // Update variances (exponential smoothing of squared deviations)
      const dx = this.polar.xValue - prevX;
      const dy = this.polar.yValue - prevY;
      this.xVar = factor * this.xVar + (1 - factor) * dx * dx;
      this.yVar = factor * this.yVar + (1 - factor) * dy * dy;

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
      angle: Math.atan2(this.yValue, this.xValue)
    };
  }

  get vectorValue() { return { x: this.xValue, y: this.yValue }; }
  get vector() { return [this.xValue, this.yValue]; }
  get x() { return this.xValue; }
  get y() { return this.yValue; }
  get magnitude() { return Math.sqrt(this.xValue * this.xValue + this.yValue * this.yValue); }
  get angle() { return Math.atan2(this.yValue, this.xValue); }
  get variance() { return [ this.xVar, this.yVar ]; }
}


module.exports = {Polar, PolarDamped};