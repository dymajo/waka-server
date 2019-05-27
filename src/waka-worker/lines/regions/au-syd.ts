import DataAccess from '../dataAccess'
import BaseLines from './BaseLines'
import Connection from '../../db/connection'
import * as Logger from 'bunyan'

interface ILinesAUSYDProps {
  logger: Logger
  connection: Connection
}

class LinesAUSYD extends BaseLines {
  connection: Connection
  dataAccess: DataAccess
  allLines: {}
  lineGroups: {}
  lineOperators: {}
  constructor(props: ILinesAUSYDProps) {
    super()
    const { logger, connection } = props
    this.logger = logger
    this.connection = connection
    this.dataAccess = new DataAccess({ connection })

    // this.lineIcons = lineIcons
    // this.lineColors = lineColors
    this.allLines = {}
    this.lineGroups = {}
    this.lineOperators = {}
    // this.friendlyNames = friendlyNames
  }

  async start() {
    await this.getLines()
  }

  async getLines() {
    const { logger, dataAccess } = this
    const allLines = {}
    const lineOperators = {}
    const lineGroups = [
      { name: 'Metro', items: [] },
      { name: 'Suburban Trains', items: [] },
      {
        name: 'Intercity Trains',
        items: [],
      },
      { name: 'Buses', items: [] },
      { name: 'Ferries', items: [] },
      { name: 'Light Rail', items: [] },
      { name: 'NSW TrainLink', items: [] },
    ]
    const result = await dataAccess.getRoutes()
    result.recordset.forEach(record => {
      lineOperators[record.route_short_name] = record.agency_id
      const splitName = record.route_long_name
        .replace(/^\d+\W+/, '')
        .split(' - ')
      const viaSplit = (splitName[1] || '').split('via')
      const lineEntry = [splitName[0]]
      if (viaSplit.length > 1) {
        lineEntry.push(viaSplit[0])
        lineEntry.push(viaSplit[1])
      } else if (splitName.length === 2) {
        lineEntry.push(splitName[1])
      }
      const {
        route_type: routeType,
        route_short_name: routeShortName,
        route_desc: routeDesc,
      } = record
      if (Object.prototype.hasOwnProperty.call(allLines, routeShortName)) {
        allLines[routeShortName].push(lineEntry)
      } else {
        allLines[routeShortName] = [lineEntry]
        if (routeType === 401) {
          lineGroups[0].items.push(routeShortName)
        }
        if (routeType === 400 && routeShortName[0] === 'T') {
          lineGroups[1].items.push(routeShortName)
        }
        if (routeType === 400 && routeShortName[0] !== 'T') {
          lineGroups[2].items.push(routeShortName)
        }
        if (routeType === 700 && routeDesc !== 'School Buses') {
          lineGroups[3].items.push(routeShortName)
        }
        if (routeType === 1000) {
          lineGroups[4].items.push(routeShortName)
        }

        if (routeType === 900) {
          lineGroups[5].items.push(routeShortName)
        }
        if (routeType === 106 || routeType === 204) {
          lineGroups[6].items.push(routeShortName)
        }

        const numericLine = parseInt(routeShortName, 10)
      }

      lineGroups.forEach(group => {
        // this sorts text names before numbers
        group.items.sort((a, b) => {
          const parsedA = parseInt(a, 10)
          const parsedB = parseInt(b, 10)
          if (isNaN(parsedA) && isNaN(parsedB)) return a.localeCompare(b)
          if (isNaN(parsedA)) return -1
          if (isNaN(parsedB)) return 1
          return parsedA - parsedB
        })
      })
    })
    this.allLines = allLines
    this.lineOperators = lineOperators
    this.lineGroups = lineGroups
  }
}

export default LinesAUSYD
