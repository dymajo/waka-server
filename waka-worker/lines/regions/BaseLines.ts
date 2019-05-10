import * as Logger from 'bunyan'

abstract class BaseLines {
  getColors: any
  abstract start(): void
  logger: Logger
}

export default BaseLines
