const Table2D = require('./src/general/Table2D');
const { PolarTable } = require('./src/general/PolarTable');
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
  createSmoothedPolar,
  SmoothedAngle
} = require('./src/signalk/Polar');

const {
  BaseSmoother,
  MovingAverageSmoother,
  ExponentialSmoother,
  KalmanSmoother
} = require('./src/signalk/smoothers');

module.exports = {
  Table2D,
  PolarTable,
  SI,
  Reporter,
  MessageHandler,
  MessageSmoother,
  createSmoothedHandler,
  Polar,
  PolarSmoother,
  createSmoothedPolar,
  SmoothedAngle,
  BaseSmoother,
  MovingAverageSmoother,
  ExponentialSmoother,
  KalmanSmoother
};