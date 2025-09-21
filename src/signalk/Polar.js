const { MessageHandler, MessageHandlerDamped } = require('./MessageHandler');
const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');


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
    this._displayAttributes = {};
    this.angleRange = '-piToPi';
    this.xVariance = 0;
    this.yVariance = 0;
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
    this.xVariance = 0;
    this.yVariance = 0;
    if (typeof this.onChange === 'function') {
      this.onChange();
    }
  }

  copyFrom(polar) {
    this.xValue = polar.x;
    this.yValue = polar.y;
    this.xVariance = polar.xVariance;
    this.yVariance = polar.yVariance;
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
  }

  setVectorValue(value= { x: 0, y: 0 }, variance = { x: 0, y: 0 }) {
    this.xValue = value.x;
    this.yValue = value.y;
    this.xVariance = variance.x;
    this.yVariance = variance.y;
  }

  setDisplayAttributes(attr) {
    this._displayAttributes = attr;
  }

  setDisplayAttribute(key, value) {
    this._displayAttributes[key] = value;
  }

  set x(value) {
    this.xValue = value;
  }

  set y(value) {
    this.yValue = value;
  }

  get displayAttributes() {
    return { ...this._displayAttributes, stale: this.stale };
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

  /**
   * @deprecated Use the 'stale' property instead.
   */
  lackingInputData() {
    return this.stale;
  }

  get stale() {
    return this.magnitudeHandler.stale || this.angleHandler.stale;
  }

  get trace() {
    return Math.sqrt(this.xVariance ** 2 + this.yVariance ** 2);
  }

  report() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      xVariance: this.xVariance,
      yVariance: this.yVariance,
      magnitude: this.magnitude,
      angle: this.angle,
      trace: this.trace,
      displayAttributes: this.displayAttributes,
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
  constructor(id, polar, SmootherClass = ExponentialSmoother, smootherOptions = {}) {
    this.id = id;
    this.polar = polar;
    this.SmootherClass = SmootherClass;
    this.smootherOptions = smootherOptions;
    this.xSmoother = new SmootherClass(smootherOptions);
    this.ySmoother = new SmootherClass(smootherOptions);
    this.timestamp = null;
    this.n = 0;
    this._displayAttributes = {};
    this.angleRange = '-piToPi';
    this.onChange = null; // Add onChange property
    //this.reset();
  }

  /**
   * Resets the smoothers and counters.
   * Initializes the smoothers with the current polar x/y values.
   */
  reset() {
    this.xSmoother.reset();
    this.ySmoother.reset();
    // Optionally, initialize with current values
    // if (typeof this.polar.xValue === 'number') {
    //   this.xSmoother.add(this.polar.xValue);
    // }
    // if (typeof this.polar.yValue === 'number') {
    //   this.ySmoother.add(this.polar.yValue);
    // }
    this.timestamp = null;
    this.n = 0;
  }

  terminate() {
    return this.polar.terminate();
  }

  /**
   * Take a new sample from the underlying Polar object and update smoothers.
   */
  sample() {
    const now = Date.now();
    this.xSmoother.add(this.polar.xValue, this.polar.xVariance);
    this.ySmoother.add(this.polar.yValue, this.polar.yVariance);
    this.timestamp = now;
    this.n++;
    if (typeof this.onChange === 'function') {
      this.onChange();
    }
    return this;
  }

  setAngleRange(range) {
    if (range === '0to2pi' || range === '-piToPi') {
      this.angleRange = range;
    }
  }

  setDisplayAttributes(attr) {
    this._displayAttributes = attr;
  }

  setDisplayAttribute(key, value) {
    this._displayAttributes[key] = value;
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
      values.push({
        path: ps.polar.pathMagnitude,
        value: ps.magnitude
      });
      values.push({
        path: ps.polar.pathAngle,
        value: ps.angle
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
        }
      ]
    };
    app.handleMessage(pluginId, message);
  }

  get displayAttributes() {
    return { ...this._displayAttributes, stale: this.stale };
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
    return {
      magnitude: this.magnitude,
      angle: this.angle
    };
  }

  get variance() {
    return [this.xVariance, this.yVariance];
  }

  get timestamp() {
    return this._timestamp;
  }

  set timestamp(val) {
    this._timestamp = val;
  }

  get nSamples() {
    return this.n;
  }

  get stale() {
    return this.polar.stale;
  }

  get trace() {
    return Math.sqrt(this.xVariance ** 2 + this.yVariance ** 2);
  }

  report() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      magnitude: this.magnitude,
      angle: this.angle,
      displayAttributes: this.displayAttributes,
      trace: this.trace
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
 * Creates a Polar and a linked PolarSmoother, wires up onChange, and sets display attributes.
 * @param {Object} options
 * @param {string} options.id - Identifier for the polar.
 * @param {string} options.pathMagnitude - Signal K path for magnitude.
 * @param {string} options.subscribe - Subscribe to path.
 * @param {string} options.pathAngle - Signal K path for angle.
 * @param {string} options.sourceMagnitude - Source label for magnitude.
 * @param {string} options.sourceAngle - Source label for angle.
 * @param {Object} options.app - The app instance.
 * @param {string} options.pluginId - Plugin identifier.
 * @param {Function} [options.SmootherClass=ExponentialSmoother] - Smoother class to use.
 * @param {Object} [options.smootherOptions={}] - Options for the smoother.
 * @param {Object} [options.displayAttributes={}] - Display attributes for the smoother.
 * @param {boolean} [options.passOn=true] - Pass on subscription.
 * @param {Function} [options.onIdle=null] - Optional onIdle callback.
 * @param {String} [options.angleRange='-piToPi'] - Angle range for the polar coordinates, valid values are '0to2pi' or '-piToPi'.
 * @returns {{ polar: Polar, smoother: PolarSmoother }}
 */
function createSmoothedPolar({
  id,
  pathMagnitude,
  pathAngle,
  subscribe = false,
  sourceMagnitude,
  sourceAngle,
  app,
  pluginId,
  SmootherClass = PolarSmoother,
  smootherOptions = {},
  displayAttributes = {},
  passOn = true,
  onIdle = null,
  angleRange = '-piToPi'
}) {
  const polar = new Polar(id, pathMagnitude, pathAngle, sourceMagnitude, sourceAngle);
  polar.setAngleRange(angleRange);
  if (subscribe) polar.subscribe(app, pluginId, true, true, passOn, onIdle);
  const smoother = new PolarSmoother(id, polar, SmootherClass, smootherOptions);
  polar.onChange = () => { smoother.sample(); };
  smoother.setDisplayAttributes(displayAttributes);
  return smoother;
}





module.exports = { Polar, PolarSmoother, createSmoothedPolar };