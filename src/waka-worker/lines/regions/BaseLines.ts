import * as Logger from 'bunyan'
import Connection from '../../db/connection'

abstract class BaseLines {
  getColors: any
  abstract start(): void
  logger: Logger
  connection: Connection
  dataAccess: any
  lineIcons: any
  lineColors: any
  allLines: any
  lineGroups: any
  lineOperators: any
  friendlyNames: any
}

export default BaseLines
