var DuplexStream = require('stream').Duplex
var util = require('util')

var noop = require('101/noop')
var through2 = require('through2')

module.exports = MockSocket

function MockSocket () {
  DuplexStream.call(this)
  this.writeStream = through2(function (data, enc, cb) {
    cb(null, data)
  })
  this.readStream = through2(function (data, enc, cb) {
    cb(null, data)
  })
  /**
   * proxy event emitter from readStream
   */
  this.on = function (event, handler) {
    return this.readStream.on(event, handler)
  }
  /**
   * proxy event emitter from readStream
   */
  this.removeListener = function (event, handler) {
    return this.readStream.removeListener(event, handler)
  }
  /**
   * proxy event emitter from readStream
   */
  this.removeAllListeners = function (event) {
    return this.readStream.removeAllListeners(event)
  }
}

util.inherits(MockSocket, DuplexStream)

/**
 * mock socket setNoDelay method
 */
MockSocket.prototype.setNoDelay = noop
/**
 * mock socket setKeepAlive method
 */
MockSocket.prototype.setKeepAlive = noop
/**
 * emit handshake data and connect event
 */
MockSocket.prototype.writeMockHandleshake = function () {
  var self = this
  this.readStream.write(new Buffer('SUCCESS\u0000'), function (err) {
    if (err) { throw err }
    self.readStream.emit('connect')
  })
}
/**
 * write will write data to `writeStream` buffer
 */
MockSocket.prototype._write = function (chunk, enc, cb) {
  if (!this.connected) { // gets set by create-mock-connection.js
    return cb() // drop it
  }
  this.writeStream.write(chunk, enc, cb)
}
/**
 * read will read data from the `readStream` buffer
 */
MockSocket.prototype._read = function (size) {
  return this.readStream.read(size)
}
