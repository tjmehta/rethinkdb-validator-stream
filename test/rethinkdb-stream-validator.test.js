if (typeof Promise === 'undefined') require('es6-promise').polyfill()
require('./fixtures/load-env.js')

var net = require('net')

var createCount = require('callback-count')
var expect = require('chai').expect
var pick = require('101/pick')
var r = require('rethinkdb')
var shimmer = require('shimmer')
var sinon = require('sinon')
var through2 = require('through2')

var afterEach = global.afterEach
var beforeEach = global.beforeEach
var describe = global.describe
var it = global.it

var createQueryChunk = require('./fixtures/create-query-chunk.js')
var createValidator = require('../index.js')
var parseQueryBuffer = require('../lib/parse-query-buffer.js')

var ValidationError = createValidator.ValidationError

describe('create-validator-stream tests', function () {
  describe('missing opts', function () {
    it('should error for if whitelist is missing', function (done) {
      expect(function () {
        createValidator(null, true)
      }).to.throw(/whitelist/)
      done()
    })
  })

  describe('validation', function () {
    beforeEach(function (done) {
      var self = this
      this.db = 'test'
      shimmer.wrap(net, 'connect', function (o) {
        return function () {
          var socket = self.socket = o.apply(this, arguments)
          var writeStream = self.writeStream = through2()
          // stub socket write
          self.__socketWrite = socket.write.bind(socket)
          socket.write = writeStream.write.bind(writeStream)
          return socket
        }
      })
      var opts = {
        host: process.env.RETHINKDB_HOST,
        db: this.db
      }
      this.connPromise = r.connect(opts, function (err, conn) {
        if (err) { console.error(err) }
      })
      done()
      shimmer.unwrap(net, 'connect')
    })
    afterEach(function (done) {
      if (this.__socketWrite) {
        // restore
        this.socket.write = this.__socketWrite
      }
      if (this.conn) {
        this.conn.close()
      }
      done()
    })

    it('should passthrough handshake', function (done) {
      var self = this
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db
      }
      var validator = createValidator(opts, false)
      this.writeStream.pipe(validator).on('data', function (_handshakeBuf) {
        // write to real socket
        self.__socketWrite(_handshakeBuf)
        if (validator.handshakeComplete) {
          done()
        }
      })
    })

    it('should passthrough "non-START" queries', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db,
        handshakeComplete: true
      }
      // create a "CONTINUE" query
      // note: this not a valid "continue" query...
      var continueBuf = createQueryChunk(query)
      var ast = JSON.parse(continueBuf.slice(12))
      ast[0] = 2 // CONTINUE
      continueBuf.write(JSON.stringify(ast), 12)
      var validator = createValidator(opts)
      validator.on('data', function (queryBuf) {
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
      validator.write(continueBuf)
    })

    it('should passthrough handshake and then a query w/ expected opts', function (done) {
      var self = this
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey'),
          r.table('test-table').get('hello-world'), // for maxChunkLen coverage
          r.table('test-table').get('a') // for maxChunkLen coverage
        ],
        db: this.db
      }
      var validator = createValidator(opts, false)
      var handshakeComplete = false

      this.writeStream.pipe(validator)
        .on('data', function (buf) {
          if (!handshakeComplete) {
            // write handshake to real socket
            self.__socketWrite(buf)
            handshakeComplete = validator.handshakeComplete
            return
          }
          var queryParts = pick(parseQueryBuffer(buf), ['type', 'term', 'opts'])
          expect(queryParts).to.deep.equal({
            type: 1,
            term: query.build(),
            opts: {
              db: r.db(self.db).build()
            }
          })
          done()
        })
        .on('error', done)
      this.connPromise.then(function (conn) {
        query.run(conn, function () {})
      })
    })

    it('should passthrough handshake and then an error for query w/ unexpected opts', function (done) {
      var self = this
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: 'unexpected-db' // mismatch!
      }
      var validator = createValidator(opts, false)
      var handshakeComplete = false

      this.writeStream.pipe(validator)
        .on('data', function (buf) {
          if (!handshakeComplete) {
            // write handshake to real socket
            self.__socketWrite(buf)
            handshakeComplete = validator.handshakeComplete
            return
          }
          done(new Error('expected an error'))
        })
        .on('error', function (err) {
          try {
            expect(err).to.be.an.instanceOf(ValidationError)
            expect(err.message).to.equal('"opts" mismatch')
            done()
          } catch (err) {
            done(err)
          }
        })
      this.connPromise.then(function (conn) {
        query.run(conn, function () {})
      })
    })

    it('should error if queries is larger than max len', function (done) {
      var self = this
      var opts = {
        whitelist: [
          r.table('test-table').get('hey'),
          r.table('test-table').get('hello-world'), // for maxChunkLen coverage
          r.table('test-table').get('a') // for maxChunkLen coverage
        ]
      }
      var query = r.table(new Array(1000).join('A')).get('hey')
      var validator = createValidator(opts)
      var handshakeComplete = false
      this.writeStream.pipe(validator)
        .on('data', function (buf) {
          if (!handshakeComplete) {
            // write handshake to real socket
            self.__socketWrite(buf)
            handshakeComplete = validator.handshakeComplete
            return
          }
          done(new Error('expected an error'))
        })
        .on('error', function (err) {
          try {
            expect(err).to.exist
            expect(err.message).to.match(/length/)
            done()
          } catch (err) {
            done(err)
          }
        })
      this.connPromise.then(function (conn) {
        query.run(conn, function () {})
      })
    })

    describe('logging', function () {
      beforeEach(function (done) {
        sinon.stub(console, 'log')
        done()
      })
      afterEach(function (done) {
        console.log.restore()
        done()
      })

      it('should log allowed queries', function (done) {
        var self = this
        var query = r.table('test-table').get('hey')
        var opts = {
          whitelist: [
            r.table('test-table').get('hey')
          ],
          db: this.db,
          log: true
        }
        var validator = createValidator(opts)
        var handshakeComplete = false
        this.writeStream.pipe(validator)
          .on('data', function (buf) {
            if (!handshakeComplete) {
              // write handshake to real socket
              self.__socketWrite(buf)
              handshakeComplete = validator.handshakeComplete
              return
            }
            try {
              sinon.assert.calledOnce(console.log)
              sinon.assert.calledWith(console.log, sinon.match(/ALLOW/))
              done()
            } catch (err) {
              done(err)
            }
          })
        this.connPromise.then(function (conn) {
          query.run(conn, function () {})
        })
      })

      it('should log denied queries', function (done) {
        var self = this
        var query = r.table('nononono').get('hey')
        var opts = {
          whitelist: [
            r.table('test-table').get('hey')
          ],
          log: true,
          db: this.db
        }
        var validator = createValidator(opts)
        var handshakeComplete = false
        this.writeStream.pipe(validator)
          .on('data', function (buf) {
            if (!handshakeComplete) {
              // write handshake to real socket
              self.__socketWrite(buf)
              handshakeComplete = validator.handshakeComplete
              return
            }
            done(new Error('expected an error'))
          })
          .on('error', function (err) {
            try {
              expect(err.message).to.match(/query.*mismatch/)
              sinon.assert.calledOnce(console.log)
              sinon.assert.calledWith(console.log, sinon.match(/DENY/))
              done()
            } catch (err) {
              done(err)
            }
          })
        this.connPromise.then(function (conn) {
          query.run(conn, function () {})
        })
      })
    })
  })

  describe('invalid ast data', function () {
    it('should error for queries w/ invalid query ast', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db,
        handshakeComplete: true
      }
      var validator = createValidator(opts)
      validator.on('error', function (err) {
        expect(err).to.be.an.instanceOf(Error)
        expect(err.message).to.equal('Invalid query ast')
        done()
      })
      var invalidBuf = createQueryChunk(query)
      invalidBuf.write('hello', 12) // corrupt query
      validator.write(invalidBuf)
    })

    it('should error for queries w/ invalid query type', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db,
        handshakeComplete: true
      }
      var validator = createValidator(opts)
      validator.on('error', function (err) {
        expect(err).to.be.an.instanceOf(Error)
        expect(err.message).to.equal('Unknown query type')
        done()
      })
      var invalidBuf = createQueryChunk(query)
      var ast = JSON.parse(invalidBuf.slice(12))
      ast[0] = 9 // unknown query type
      invalidBuf.write(JSON.stringify(ast), 12)
      validator.write(invalidBuf)
    })

    it('should error for queries w/ invalid term type', function (done) {
      var query = r.table('test-table').get('hey')
      var opts = {
        whitelist: [
          r.table('test-table').get('hey')
        ],
        db: this.db,
        handshakeComplete: true
      }
      var validator = createValidator(opts)
      validator.on('error', function (err) {
        expect(err).to.be.an.instanceOf(Error)
        expect(err.message).to.match(/term/)
        done()
      })
      var invalidBuf = createQueryChunk(query)
      var ast = JSON.parse(invalidBuf.slice(12))
      ast[1][0] = -1 // unknown term type
      invalidBuf.write(JSON.stringify(ast), 12)
      validator.write(invalidBuf)
    })
  })
})
