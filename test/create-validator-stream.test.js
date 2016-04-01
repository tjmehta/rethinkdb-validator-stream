if (typeof Promise === 'undefined') require('es6-promise').polyfill()
// var createResponseChunker = require('rethinkdb-stream-chunker').createResponseStreamChunker
var createCount = require('callback-count')
var expect = require('chai').expect
var pick = require('101/pick')
var r = require('rethinkdb')
var sinon = require('sinon')

var afterEach = global.afterEach
var beforeEach = global.beforeEach
var describe = global.describe
var it = global.it

var createMockConnection = require('./fixtures/create-mock-connection.js')
var createQueryChunk = require('./fixtures/create-query-chunk.js')
var createValidator = require('../index.js')
var parseQueryBuffer = require('../lib/parse-query-buffer.js')

var ValidationError = createValidator.ValidationError

describe('create-validator-stream tests', function () {
  describe('db opt', function () {
    beforeEach(function (done) {
      var self = this
      this.db = 'test-db'
      createMockConnection({ db: this.db }, function (err, connection) {
        if (err) { return done(err) }
        self.connection = connection
        self.socket = connection.rawSocket
        done()
      })
    })

    it('should passthrough handshake', function (done) {
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      var handshakeBuf = new Buffer([ 0x20, 0x2d, 0x0c, 0x40, 0x00, 0x00, 0x00, 0x00, 0xc7, 0x70, 0x69, 0x7e ])
      this.socket.writeStream.pipe(createValidator(opts, false)).on('data', function (_handshakeBuf) {
        try {
          expect(_handshakeBuf).to.deep.equal(handshakeBuf)
          done()
        } catch (err) {
          done(err)
        }
      })
      this.socket.writeStream.write(handshakeBuf)
    })

    it('should passthrough handshake and then a query w/ expected opts', function (done) {
      var self = this
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      var handshakeBuf = new Buffer([ 0x20, 0x2d, 0x0c, 0x40, 0x00, 0x00, 0x00, 0x00, 0xc7, 0x70, 0x69, 0x7e ])
      var expectedChunks = [
        // handshake
        function (buf) {
          expect(buf).to.deep.equal(handshakeBuf)
        },
        // query
        function (buf) {
          var queryParts = pick(parseQueryBuffer(buf), ['type', 'term', 'opts'])
          expect(queryParts).to.deep.equal({
            type: 1,
            term: query.build(),
            opts: {
              db: r.db(self.db).build()
            }
          })
        }
      ]
      var i = 0
      this.socket.writeStream.pipe(createValidator(opts, false)).on('data', function (chunkBuf) {
        try {
          expectedChunks[i](chunkBuf)
          i++
          if (i === 2) {
            done()
          }
        } catch (err) {
          done(err)
        }
      })
      this.socket.writeStream.write(handshakeBuf)
      query.run(this.connection, function () {})
    })

    it('should passthrough queries w/ expected opts', function (done) {
      var self = this
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('data', function (queryBuf) {
        try {
          var queryParts = pick(parseQueryBuffer(queryBuf), ['type', 'term', 'opts'])
          expect(queryParts).to.deep.equal({
            type: 1,
            term: query.build(),
            opts: {
              db: r.db(self.db).build()
            }
          })
          done()
        } catch (err) {
          done(err)
        }
      })
      query.run(this.connection, function () {})
    })

    it('should passthrough "non-START" queries', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      // create a "CONTINUE" query
      // note: this is probably not a valid "continue" query...
      var continueBuf = createQueryChunk(query)
      var ast = JSON.parse(continueBuf.slice(12))
      ast[0] = 2 // CONTINUE
      continueBuf.write(JSON.stringify(ast), 12)
      this.socket.writeStream.write(continueBuf)
      this.socket.writeStream.pipe(createValidator(opts, true)).on('data', function (queryBuf) {
        try {
          var queryParts = pick(parseQueryBuffer(queryBuf), ['type', 'term', 'opts'])
          expect(queryParts).to.deep.equal({
            type: 2,
            term: query.build(),
            opts: undefined
          })
          done()
        } catch (err) {
          done(err)
        }
      })
    })

    it('should passthrough handshake and then an error for query w/ unexpected opts', function (done) {
      var next = createCount(2, done).next
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: 'unexpected-db' // mismatch!
      }
      var handshakeBuf = new Buffer([ 0x20, 0x2d, 0x0c, 0x40, 0x00, 0x00, 0x00, 0x00, 0xc7, 0x70, 0x69, 0x7e ])
      this.socket.writeStream.pipe(createValidator(opts, false))
        .on('data', function (chunkBuf) {
          try {
            expect(chunkBuf).to.deep.equal(handshakeBuf)
            next()
          } catch (err) {
            next(err)
          }
        })
        .on('error', function (err) {
          try {
            expect(err).to.be.an.instanceOf(ValidationError)
            expect(err.message).to.equal('"opts" mismatch')
            next()
          } catch (err) {
            next(err)
          }
        })
      this.socket.writeStream.write(handshakeBuf)
      query.run(this.connection, function () {})
    })

    it('should error for queries w/ unexpected opts', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: 'unexpected-db' // mismatch!
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('error', function (err) {
        try {
          expect(err).to.be.an.instanceOf(ValidationError)
          expect(err.message).to.equal('"opts" mismatch')
          done()
        } catch (err) {
          done(err)
        }
      })
      query.run(this.connection, function () {})
    })
  })

  describe('missing opts', function () {
    it('should error for if whitelist is missing', function (done) {
      expect(function () {
        createValidator(null, true)
      }).to.throw(/whitelist/)
      done()
    })
  })

  describe('invalid ast data', function () {
    beforeEach(function (done) {
      var self = this
      createMockConnection(function (err, connection) {
        if (err) { return done(err) }
        self.connection = connection
        self.socket = connection.rawSocket
        done()
      })
    })

    it('should error for queries w/ invalid query ast', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('error', function (err) {
        expect(err).to.be.an.instanceOf(Error)
        expect(err.message).to.equal('Invalid query ast')
        done()
      })
      var invalidBuf = createQueryChunk(query)
      invalidBuf.write('hello', 12) // corrupt query
      this.socket.writeStream.write(invalidBuf)
    })

    it('should error for queries w/ invalid query type', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('error', function (err) {
        expect(err).to.be.an.instanceOf(Error)
        expect(err.message).to.equal('Unknown query type')
        done()
      })
      var invalidBuf = createQueryChunk(query)
      var ast = JSON.parse(invalidBuf.slice(12))
      ast[0] = 9 // unknown query type
      invalidBuf.write(JSON.stringify(ast), 12)
      this.socket.writeStream.write(invalidBuf)
    })

    it('should error for queries w/ invalid term type', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('error', function (err) {
        expect(err).to.be.an.instanceOf(Error)
        expect(err.message).to.match(/term/)
        done()
      })
      var invalidBuf = createQueryChunk(query)
      var ast = JSON.parse(invalidBuf.slice(12))
      ast[1][0] = -1 // unknown term type
      invalidBuf.write(JSON.stringify(ast), 12)
      this.socket.writeStream.write(invalidBuf)
    })
  })

  describe('logging', function () {
    beforeEach(function (done) {
      var self = this
      createMockConnection(function (err, connection) {
        if (err) { return done(err) }
        self.connection = connection
        self.socket = connection.rawSocket
        done()
      })
    })
    beforeEach(function (done) {
      sinon.stub(console, 'log')
      done()
    })
    afterEach(function (done) {
      console.log.restore()
      done()
    })

    it('should log allowed queries', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        log: true
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('data', function (queryBuf) {
        try {
          sinon.assert.calledOnce(console.log)
          sinon.assert.calledWith(console.log, sinon.match(/ALLOW/))
          done()
        } catch (err) {
          done(err)
        }
      })
      query.run(this.connection, function () {})
    })

    it('should log denied queries', function (done) {
      var query = r.table('nononono').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        log: true
      }
      this.socket.writeStream.pipe(createValidator(opts, true)).on('error', function (queryBuf) {
        try {
          sinon.assert.calledOnce(console.log)
          sinon.assert.calledWith(console.log, sinon.match(/DENY/))
          done()
        } catch (err) {
          done(err)
        }
      })
      query.run(this.connection, function () {})
    })
  })
})
