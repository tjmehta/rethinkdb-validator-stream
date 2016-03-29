module.exports = parseQueryBuffer

function parseQueryBuffer (queryBuf) {
  var queryAst = JSON.parse(queryBuf.slice(12).toString())
  return {
    token: queryBuf.slice(0, 8),
    type: queryAst[0],
    term: queryAst[1],
    opts: queryAst[2]
  }
}
