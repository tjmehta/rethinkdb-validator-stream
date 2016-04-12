var assert = require('assert')

var assign = require('101/assign')
var astToReQL = require('ast-to-reql')
var chalk = require('chalk')
var createQueryChunker = require('rethinkdb-stream-chunker').createQueryStreamChunker
var debug = require('debug')('rethinkdb-validator-stream:create-validator-stream')
var pipeline = require('pumpify')
var rethinkdb = require('rethinkdb')
var through2 = require('through2')
var validateReQL = require('validate-reql')

var parseQueryBuffer = require('./parse-query-buffer.js')
var queryTypeIs = require('./query-type-is.js')
var createErr = function (msg, data) {
  var err = new Error(msg)
  err.data = data
  return err
}
var safeToString = function (v) {
  return v && v.toString && v.toString()
}

module.exports = createValidatorStream

function createValidatorStream (opts) {
  opts = opts || {}
  assert(!opts.db || typeof opts.db === 'string', '"db" must be a string')
  assert(Array.isArray(opts.whitelist), '"whitelist" is required')
  if (opts.db) {
    opts.whitelist = opts.whitelist.map(function (reql) {
      checkMaxLen(reql, opts)
      return reql.rvOpt('db', rethinkdb.db(opts.db))
    })
  } else { // just opts.whitelist
    opts.whitelist.forEach(function (reql) {
      checkMaxLen(reql, opts)
    })
  }
  function checkMaxLen (reql, opts) {
    var len = JSON.stringify([1, reql.build()]).length
    if (!opts.maxChunkLen || (len * 2) > opts.maxChunkLen) {
      // note: len is multiplied by two as that length should still be reasonable for security,
      // but also leaves some space for unknown variable len (probably unneccessary, but i don't know reql well enough)
      opts.maxChunkLen = len * 2
    }
  }
  debug('create validator stream %o', opts)
  var chunker = opts.chunker = createQueryChunker(opts.handshakeComplete, opts.maxChunkLen)
  var validator = _createValidatorStream(opts)
  var chunkAndValidate = pipeline(chunker, validator)
  Object.defineProperty(chunkAndValidate, 'handshakeComplete', {
    get: function () {
      return validator.handshakeComplete
    }
  })
  // merge streams into one
  return chunkAndValidate
}

function _createValidatorStream (opts) {
  var validator = through2(function transform (queryBuf, enc, cb) {
    if (!validator.handshakeComplete) {
      validator.handshakeComplete = opts.chunker.__streamChunkerState.handshakeComplete
      debug('handshake buff %o', queryBuf)
      debug('handshake complete %o', validator.handshakeComplete)
      cb(null, queryBuf)
      return
    }
    debug('query buff', queryBuf)
    var queryParts
    try {
      queryParts = parseQueryBuffer(queryBuf)
    } catch (err) {
      return cb(createErr('Invalid query ast', { err: err }))
    }
    var queryType = queryParts.type
    if (queryTypeIs(queryType, 'CONTINUE', 'STOP', 'NOREPLY_WAIT')) {
      debug('query type is: %s ("CONTINUE", "STOP", "NOREPLY_WAIT")', queryType)
      cb(null, queryBuf) // pass
      return
    }
    if (!queryTypeIs(queryType, 'START')) {
      // query type is "SERVER_INFO"
      debug('unknown query type: %s', queryType)
      cb(createErr('Unknown query type', { query: queryParts }))
      return
    }
    debug('query type is START! %s', queryType)
    // Query queryType is 'START'
    var termAst = queryParts.term
    var termOptsAst = queryParts.opts
    debug('term and opts ast %o %o', termAst, termOptsAst)
    try {
      var reql = astToReQL(termAst)
      var reqlOpts = astToReQL(termOptsAst)
    } catch (err) {
      cb(err)
    }
    debug('term and opts reql %o %o', reql, reqlOpts)
    // validate the reql
    validateReQL(reql, reqlOpts, opts.whitelist)
      .then(function () {
        // query is valid
        if (opts.log) {
          console.log(chalk.green('ALLOW') + ' %s %s', safeToString(reql), safeToString(reqlOpts))
        }
        /* istanbul ignore if */
        if (debug.enabled) {
          // prevent unnecessary toStrings
          debug('ALLOW %s %s', safeToString(reql), safeToString(reqlOpts))
        }
        cb(null, queryBuf)
      })
      .catch(function (err) {
        if (opts.log) {
          console.log(chalk.red('DENY') + ' %s %s (%s)', safeToString(reql), safeToString(reqlOpts), err.message)
        }
        /* istanbul ignore if */
        if (debug.enabled) {
          // prevent unnecessary toStrings
          debug('DENY %s %s (%s)', safeToString(reql), safeToString(reqlOpts), err.message)
        }
        err.data = err.data || {}
        assign(err.data, {
          query: queryParts,
          reql: reql.toString()
        })
        cb(err)
      })
  })
  validator.handshakeComplete = opts.handshakeComplete || false

  return validator
}
