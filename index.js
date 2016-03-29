// export stream
module.exports = require('./lib/create-validator-stream.js')
// monkeypatches rethinkdb, and export validation error
module.exports.ValidationError = require('validate-reql').ValidationError