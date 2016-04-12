if (process.env.NODE_ENV === 'development') {
  process.env.RETHINKDB_HOST = process.env.RETHINKDB_HOST || 'local.docker'
} else if (process.env.NODE_ENV === 'travis') {
  process.env.RETHINKDB_HOST = process.env.RETHINKDB_HOST || 'localhost'
}
