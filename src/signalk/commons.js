const { MessageHandler, MessageSmoother } = require('./MessageHandler');
const { Polar, PolarSmoother } = require('./Polar');
const { BaseSmoother, ExponentialSmoother, MovingAverageSmoother, KalmanSmoother } = require('./smoothers');

// Heading

// Apparent wind
class ApparentWind extends Polar {
  constructor(app, pluginId, source = null, passOn = true) {
    super(app, pluginId, "apparentWind");
    this.configureMagnitude("environment.wind.speedApparent", source, passOn);
    this.configureAngle("environment.wind.angleApparent", source, passOn);
    this.setMeta({ displayName: "Observed apparent Wind", plane: "Boat" });
    this.setAngleRange('-piToPi');
    this.subscribe(true, true);
  }
}

class SmoothedApparentWind extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new ApparentWind(app, pluginId, source, passOn);
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.polar.setMeta({ displayName: "Smoothed apparent Wind", plane: "Boat" });
    this.setAngleRange('-piToPi');
    polar.onChange = () => { this.sample(); };
  }
}

// ground speed
class GroundSpeed extends Polar {
  constructor(app, pluginId, source = null, passOn = true) {
    super(app, pluginId, "groundSpeed");
    this.configureMagnitude("navigation.speedOverGround", source, passOn);
    this.configureAngle("navigation.courseOverGroundTrue", source, passOn);
    this.setMeta({ displayName: "Observed ground Speed", plane: "Ground" });
    this.setAngleRange('0to2pi');
    this.subscribe(true, true);
  }
}

class SmoothedGroundSpeed extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new GroundSpeed(app, pluginId, source, passOn);
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.polar.setMeta({ displayName: "Smoothed ground Speed", plane: "Ground" });
    this.setAngleRange('0to2pi');
    polar.onChange = () => { this.sample(); };
  }
}

// speed through water
class SpeedThroughWater extends Polar {
  constructor(app, pluginId, source = null, passOn = true) {
    super(app, pluginId, "boatSpeed");
    this.configureMagnitude("navigation.speedThroughWater", source, passOn);
    this.configureAngle("navigation.leewayAngle", source, passOn);
    this.setMeta({ displayName: "Observed speed Through Water", plane: "Boat" });
    this.setAngleRange('-piToPi');
    this.subscribe(true, false);
  }
}

class SmoothedSpeedThroughWater extends PolarSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const polar = new SpeedThroughWater(app, pluginId, source, passOn);
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.polar.setMeta({ displayName: "Smoothed speed Through Water", plane: "Boat" });
    this.setAngleRange('-piToPi');
    polar.onChange = () => { this.sample(); };
  }
}

// attitude
class Attitude extends MessageHandler {
  constructor(app, pluginId, source = null, passOn = true) {
    super(app, pluginId, "attitude");
    this.configure("navigation.attitude", source, passOn);
    this.subscribe();
  }
}

class SmoothedAttitude extends MessageSmoother {
  constructor(app, pluginId, source = null, passOn = true, SmootherClass = ExponentialSmoother, smootherOptions = { timeConstant: 1 }) {
    const handler = new Attitude(app, pluginId, source, passOn);
    super(handler.id, handler, SmootherClass, smootherOptions);
    handler.onChange = () => { this.sample(); };
  }
}

// Heading
class Heading extends MessageHandler {
  constructor(app, pluginId, source = null, passOn = true) {
    super(app, pluginId, "heading");
    this.configure("navigation.headingTrue", source, passOn);
    this.subscribe();
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
    const polar = new Polar(app, pluginId, "heading");
    polar.configureAngle("navigation.headingTrue", source, passOn);
    polar.subscribe(false, true);
    polar.magnitudeHandler.value = 1;
    super(polar.id, polar, SmootherClass, smootherOptions);
    this.polar.setMeta({ displayName: "Smoothed heading", plane: "Ground" });
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
      state: this.state
    };
  }
}

module.exports = { ApparentWind, SmoothedApparentWind, GroundSpeed, SmoothedGroundSpeed, SpeedThroughWater, SmoothedSpeedThroughWater, Attitude, SmoothedAttitude, Heading, SmoothedHeading };