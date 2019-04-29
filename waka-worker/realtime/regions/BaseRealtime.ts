import Connection from '../../db/connection'
import * as Logger from 'bunyan'
abstract class BaseRealtime {
  connection: Connection
  logger: Logger
  scheduleLocationPull?(): Promise<void>
  schedulePull?(): Promise<void>

  abstract start(): void
}

export default BaseRealtime
