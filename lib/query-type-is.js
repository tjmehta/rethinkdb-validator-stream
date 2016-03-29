var assertArgs = require('assert-args')
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
  return compareTypes.some(equals(type))
}

console.log(protoDef.Query.QueryType)