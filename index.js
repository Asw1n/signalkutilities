const Table2D = require('./src/general/Table2D');
const SI = require('./src/general/SI');
const {MessageHandler, MessageHandlerDamped} = require('./src/signalk/MessageHandler.js');
const {Polar, PolarDamped} = require('./src/signalk/Polar');
const Reporter = require('./src/web/Reporter');


module.exports = { MessageHandler, MessageHandlerDamped, Polar, PolarDamped, Table2D, SI, Reporter };