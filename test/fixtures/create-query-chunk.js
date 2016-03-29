module.exports = createQueryChunk

function createQueryChunk (reql) {
  var reqlStr = JSON.stringify([1, reql.build()])
  var tokenBuf = new Buffer(8)
  var lenBuf = new Buffer(4)
  lenBuf.writeUInt32LE(reqlStr.length, 0)
  var reqlBuf = new Buffer(reqlStr)
  return Buffer.concat([tokenBuf, lenBuf, reqlBuf])
}
