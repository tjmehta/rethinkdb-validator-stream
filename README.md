# rethinkdb-validator-stream
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
    // reql query or reql validator,
    // see `http://github.com/tjmehta/validate-reql` for examples
  ]
}
var validatorStream = createValidatorStream(opts)

// incoming pipeline
astStream.pipe(validatorStream).pipe(socket)
// outgoign pipeline
socket.pipe(replyStream)
```

# Credits
Thank you [Mike Mintz](https://github.com/mikemintz)! Code is heavily inspired by [rethinkdb-websocket-server](https://github.com/mikemintz/rethinkdb-websocket-server)

# License
MIT
