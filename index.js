const Table2D = require('./src/general/Table2D');
const SI = require('./src/general/SI');
const { MessageHandler, MessageHandlerDamped, MessageSmoother, createSmoothedHandler}  = require('./src/signalk/MessageHandler.js');
const { Polar, PolarDamped, PolarSmoother, createSmoothedPolar } = require('./src/signalk/Polar');
const Reporter = require('./src/web/Reporter');
const { BaseSmoother, MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./src/signalk/smoothers');


module.exports = { MessageHandler, MessageHandlerDamped, MessageSmoother, Polar, PolarDamped, PolarSmoother, Table2D, SI, Reporter, BaseSmoother, MovingAverageSmoother, ExponentialSmoother, KalmanSmoother, createSmoothedHandler, createSmoothedPolar };