import { createLogger, stdSerializers } from 'bunyan'

const logger = createLogger({
  name: 'waka-orchestrator',
  serializers: stdSerializers,
})

export default logger
