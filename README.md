# rethinkdb-validator-stream [![Build Status](https://travis-ci.org/tjmehta/rethinkdb-validator-stream.svg)](https://travis-ci.org/tjmehta/rethinkdb-validator-stream) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)
Validate rethinkdb queries streaming to the socket

# Installation
```bash
npm i --save rethinkdb-validator-stream
```

# Usage
```js
var createValidatorStream = require('rethinkdb-validator-stream')

var astStream = ... // incoming ast stream
var socket = ... // rethinkdb socket connection
var replyStream = ... // outgoing reply stream

var opts = {
  db: 'database', // optional, specify database requirement for all queries
  whitelist: [
    // exact reql query or reql validator,
    // see `http://github.com/tjmehta/validate-reql` for examples
  ]
}
var validatorStream = createValidatorStream(opts)

// incoming pipeline
astStream.pipe(validatorStream).pipe(socket)
// handle validation errors
validatorStream.on('error', function (err) {
  // handle err
  // if you want to send a rethinkdb ClientError to the reply stream,
  // checkout https://github.com/tjmehta/rethinkdb-stream-chunker (responseStream.insertClientError)
})
// outgoign pipeline
socket.pipe(replyStream)
```

# Credits
Thank you [Mike Mintz](https://github.com/mikemintz)! Code is heavily inspired by [rethinkdb-websocket-server](https://github.com/mikemintz/rethinkdb-websocket-server)

# License
MIT
