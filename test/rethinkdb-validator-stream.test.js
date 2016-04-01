if (typeof Promise === 'undefined') require('es6-promise').polyfill()

var createResponseChunker = require('rethinkdb-stream-chunker').createResponseStreamChunker
var expect = require('chai').expect
var pick = require('101/pick')
var r = require('rethinkdb')

var describe = global.describe
var beforeEach = global.beforeEach
var it = global.it

var createMockConnection = require('./fixtures/create-mock-connection.js')
var createValidator = require('../index.js')
var parseQueryBuffer = require('../lib/parse-query-buffer.js')

var ValidationError = createValidator.ValidationError

describe('rethinkdb-validator-stream tests', function () {
  beforeEach(function (done) {
    var self = this
    createMockConnection(function (err, connection) {
      if (err) { return done(err) }
      self.connection = connection
      self.socket = connection.rawSocket
      done()
    })
  })

  it('should passthrough queries in whitelist', function (done) {
    var query = r.table('test-table').get('hey')
    var opts = {
      whitelist: [
        r.table('test-table').get('hey')
      ],
      handshakeComplete: true
    }
    this.socket.writeStream.pipe(createValidator(opts)).on('data', function (queryBuf) {
      try {
        var queryParts = pick(parseQueryBuffer(queryBuf), ['type', 'term', 'opts'])
        expect(queryParts).to.deep.equal({
          type: 1,
          term: query.build(),
          opts: undefined
        })
        done()
      } catch (err) {
        done(err)
      }
    })
    query.run(this.connection, function () {})
  })

  it('should not passthrough queries not in the whitelist', function (done) {
    var self = this
    var query = r.table('test-table').get('hey')
    var opts = {
      whitelist: [
        r.table('NONONON').get('hey')
      ],
      handshakeComplete: true
    }
    var buffer = new Buffer(0)
    var validator = createValidator(opts)
    this.socket.writeStream.pipe(validator).on('data', function (queryBuf) {
      buffer = Buffer.concat([buffer, queryBuf])
    })
    var responseStream = createResponseChunker(true)
    responseStream.pipe(self.socket)
    // handle error
    validator.on('error', function (err) {
      try {
        expect(err).to.be.an.instanceOf(ValidationError)
        expect(err.data.reql).to.equal(query.toString())
        done()
      } catch (err) {
        done(err)
      }
    })

    query.run(this.connection, function () {})
  })
})
