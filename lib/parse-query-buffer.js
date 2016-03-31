var debug = require('debug')('rethinkdb-validator-stream:parse-query-buffer')

module.exports = parseQueryBuffer

function parseQueryBuffer (queryBuf) {
  var astStr = queryBuf.slice(12).toString()
  debug('ast string (pre-parse-json) %s', astStr)
  var queryAst = JSON.parse(astStr)
  debug('ast json %o', queryAst)
  var astParts = {
    token: queryBuf.slice(0, 8),
    type: queryAst[0],
    term: queryAst[1],
    opts: queryAst[2]
  }
  debug('ast parts %o', astParts)
  return astParts
}
