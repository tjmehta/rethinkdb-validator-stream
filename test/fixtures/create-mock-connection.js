var net = require('net')

var exists = require('101/exists')
var isFunction = require('101/is-function')
var noop = require('101/noop')
var r = require('rethinkdb')
var shimmer = require('shimmer')

var MockSocket = require('./mock-socket.js')

module.exports = createMockConnection

function createMockConnection (opts, cb) {
  if (isFunction(opts)) {
    cb = opts
    opts = null
  }
  var mockSocket = new MockSocket()
  mockSocket.setNoDelay = noop
  mockSocket.setKeepAlive = noop
  // stub `net.connect` to return passthrough stream instead of socket
  shimmer.wrap(net, 'connect', function (orig) {
    return function () {
      return mockSocket
    }
  })
  // connect to rethinkdb
  var args = [opts, wrapCb].filter(exists)
  var conn = r.connect.apply(r, args)
  function wrapCb (err, conn) {
    // dont let the connection attempt to parse data
    mockSocket.removeAllListeners('data')
    mockSocket.connected = true // hack
    cb(err, conn)
  }
  // un-stub `net.connect`, so it can be used like normal ( if used elsewhere)
  shimmer.unwrap(net, 'connect')
  // mock socket handshake, connect
  mockSocket.writeMockHandleshake()

  return conn
}
