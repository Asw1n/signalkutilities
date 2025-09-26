const { MessageHandler, MessageSmoother } = require('./MessageHandler');
const { Polar, PolarSmoother } = require('./Polar');
const { BaseSmoother, ExponentialSmoother, MovingAverageSmoother, KalmanSmoother } = require('./smoothers');

// Heading

// Apparent wind
class ApparentWind extends Polar {
  constructor( app, pluginId, source = null, passOn = true) {
    super("apparentWind", "environment.wind.speedApparent", "environment.wind.angleApparent", source, source);
    this.setDisplayAttributes({ label: "Observed apparent Wind", plane: "Boat" });
    this.setAngleRange('-piToPi');
    this.subscribe(app, pluginId, true, true, passOn);
  }
}

class SmoothedApparentWind extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new ApparentWind(app, pluginId, source, passOn);
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.setDisplayAttributes({ label: "Smoothed apparent Wind", plane: "Boat" });
    this.setAngleRange('-piToPi');
    polar.onChange = () => { this.sample(); };
  }
}

// ground speed
class GroundSpeed extends Polar {
  constructor(app, pluginId, source = null, passOn = true) {
    super("groundSpeed", "navigation.speedOverGround", "navigation.courseOverGroundTrue", source, source);
    this.setDisplayAttributes({ label: "Observed ground Speed", plane: "Ground" });
    this.setAngleRange('0to2pi');
    this.subscribe(app, pluginId, true, true, passOn);
  }
}

class SmoothedGroundSpeed extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new GroundSpeed(app, pluginId, source, passOn);
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.setDisplayAttributes({ label: "Smoothed ground Speed", plane: "Ground" });
    this.setAngleRange('0to2pi');
    polar.onChange = () => { this.sample(); };
  }
}

// speed through water
class SpeedThroughWater extends Polar {
  constructor(app, pluginId, source = null, passOn = true) {
    super("boatSpeed", "navigation.speedThroughWater", "navigation.leewayAngle", source, source);
    this.setDisplayAttributes({ label: "Observed speed Through Water", plane: "Boat" });
    this.setAngleRange('-piToPi');
    this.subscribe(app, pluginId, true, true, passOn);
  }
}

class SmoothedSpeedThroughWater extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new SpeedThroughWater(app, pluginId, source, passOn);
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.setDisplayAttributes({ label: "Smoothed speed Through Water", plane: "Boat" });
    this.setAngleRange('-piToPi');
    polar.onChange = () => { this.sample(); };
  }
}

// attitude
class Attitude extends MessageHandler {
  constructor(app, pluginId, source = null, passOn = true) {
    super("attitude", "navigation.attitude", source);
    this.setDisplayAttributes({ label: "Observed attitude" });
    this.subscribe(app, pluginId, passOn);
  }
}

class SmoothedAttitude extends MessageSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const handler = new Attitude(app, pluginId, source, passOn);
    super(handler.id, handler, SmootherClass, smootherOptions);
    this.setDisplayAttributes({ label: "Smoothed attitude" });
    handler.onChange = () => { this.sample(); };
  }
}

// Heading
class Heading extends MessageHandler {
  constructor(app, pluginId, source = null, passOn = true) {
    super("heading", "navigation.headingTrue", source);
    this.setDisplayAttributes({ label: "Observed heading" });
    this.subscribe(app, pluginId, passOn);
  }
}

/**
 * SmoothedHeading provides a statistically smoothed heading angle.
 * 
 * Since heading is an angle and smoothing must account for wraparound,
 * this class uses a Polar with a fixed magnitude of 1 and applies a vector-based smoother.
 * 
 * The interface mimics a SmoothedHandler, so users can treat it as a handler-like object.
 */
class SmoothedHeading extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new Polar("heading", null, "navigation.headingTrue", source, null);
    polar.subscribe(app, pluginId, false, true, passOn);
    polar.magnitudeHandler.value = 1;
    polar.angleHandler.setDisplayAttributes({ label: "Observed heading" });
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.setDisplayAttributes({ label: "Smoothed heading", plane: "Ground" });
    this.setAngleRange('0to2pi');
    polar.onChange = () => { this.sample(); };
  }

  // modify some methods to mimic a handler
  get value() {
    return this.angle;
  } 

  get variance() {
    return this.trace;
  }

  report() {
    return {
      id: this.id,
      value: this.value,
      variance: this.variance,
      path: this.polar.angleHandler.path,
      source: this.polar.angleHandler.source,
      displayAttributes: this.displayAttributes
    };
  }
}

module.exports = { ApparentWind, SmoothedApparentWind, GroundSpeed, SmoothedGroundSpeed, SpeedThroughWater, SmoothedSpeedThroughWater, Attitude, SmoothedAttitude, Heading, SmoothedHeading };