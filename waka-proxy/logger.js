import { createLogger, stdSerializers } from 'bunyan'

const logger = createLogger({
  name: 'waka-proxy',
  serializers: stdSerializers,
})

export default logger
