var assertArgs = require('assert-args')
var debug = require('debug')('rethinkdb-validator-stream:query-type-is')
var equals = require('101/equals')
var protoDef = require('rethinkdb/proto-def')

module.exports = queryTypeIs

function queryTypeIs (type /*, ...keys */) {
  var args = assertArgs(arguments, {
    'type': 'number',
    '...keys': 'string'
  })
  type = args.type
  var keys = args.keys
  var compareTypes = keys.map(function (key) {
    return protoDef.Query.QueryType[key]
  })
  debug('compare types %s %o', type, compareTypes)
  return compareTypes.some(equals(type))
}
