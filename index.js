const Table2D = require('./src/general/Table2D');
const SI = require('./src/general/SI');
const Reporter = require('./src/web/Reporter');

const {
  MessageHandler,
  MessageSmoother,
  createSmoothedHandler
} = require('./src/signalk/MessageHandler.js');

const {
  Polar,
  PolarSmoother,
  createSmoothedPolar
} = require('./src/signalk/Polar');

const {
  BaseSmoother,
  MovingAverageSmoother,
  ExponentialSmoother,
  KalmanSmoother
} = require('./src/signalk/smoothers');

const {
  ApparentWind,
  SmoothedApparentWind,
  GroundSpeed,
  SmoothedGroundSpeed,
  SpeedThroughWater,
  SmoothedSpeedThroughWater,
  Attitude,
  SmoothedAttitude,
  Heading,
  SmoothedHeading
} = require('./src/signalk/commons');

module.exports = {
  Table2D,
  SI,
  Reporter,
  MessageHandler,
  MessageSmoother,
  createSmoothedHandler,
  Polar,
  PolarSmoother,
  createSmoothedPolar,
  BaseSmoother,
  MovingAverageSmoother,
  ExponentialSmoother,
  KalmanSmoother,
  ApparentWind,
  SmoothedApparentWind,
  GroundSpeed,
  SmoothedGroundSpeed,
  SpeedThroughWater,
  SmoothedSpeedThroughWater,
  Attitude,
  SmoothedAttitude,
  Heading,
  SmoothedHeading
};