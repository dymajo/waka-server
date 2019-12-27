import { Logger } from '../types'
import Connection from '../waka-worker/db/connection'
import DataAccess from '../waka-worker/lines/dataAccess'

export interface BaseLinesProps {
  logger: Logger
  connection: Connection
}

export default abstract class BaseLines {
  abstract getLines(): Promise<void>
  logger: Logger
  connection: Connection
  dataAccess: DataAccess
  agencyFilter?(line: string): string

  lineIcons: { [routeShortName: string]: string }
  lineColors: { [routeShortName: string]: string }
  allLines: { [routeShortName: string]: string[][] | string[] }
  lineGroups: { name: string; items: string[] }[]
  lineGroupsV2: {
    name: string
    items: {
      routeId: string
      agencyId: string
      routeLongName: string
      routeShortName: string
      directionId?: number
    }[]
  }[]
  lineOperators: { [routeShortName: string]: string }
  friendlyNames: { [routeShortName: string]: string }
  friendlyNumbers?: { [routeShortName: string]: string }
  constructor(props: BaseLinesProps) {
    const { logger, connection } = props
    this.logger = logger
    this.connection = connection
    this.dataAccess = new DataAccess({ connection })
    this.lineIcons = {}
    this.lineColors = {}
    this.allLines = {}
    this.lineGroups = []
    this.lineOperators = {}
    this.friendlyNames = {}
    this.friendlyNumbers = {}
  }

  start = async () => {
    await this.getLines()
  }
}
