import { createLogger as _createLogger, stdSerializers } from 'bunyan'

const createLogger = (prefix, version) =>
  _createLogger({
    name: 'waka-worker',
    prefix,
    version,
    serializers: stdSerializers,
  })

export default createLogger
