import DataAccess from '../dataAccess'
import { BaseLines } from '../../../typings'

const friendlyNames = {
  Orbiter: 'The Orbiter',
}

const lineIcons = {
  Blue: 'nz/metro-blue',
  Orange: 'nz/metro-orange',
  Orbiter: 'nz/metro-orbiter',
  Purple: 'nz/metro-purple',
  Yellow: 'nz/metro-yellow',
  Diamond: 'nz/metro-ferry',
}

// obtained from: http://www.metroinfo.co.nz/timetables/Pages/default.aspx
// with Array.from(document.querySelectorAll('.routelistingnumber'))
// .map((item) => ({route_short_name: item.innerText.trim(), color: item.style.backgroundColor}))
const lineColors = {
  Blue: 'rgb(62, 188, 237)',
  Orange: 'rgb(243, 112, 33)',
  Orbiter: 'rgb(121, 188, 67)',
  Purple: 'rgb(85, 69, 136)',
  Yellow: 'rgb(239, 181, 6)',
  Diamond: 'rgb(0, 88, 153)',
  '17': 'rgb(236, 0, 140)',
  '28': 'rgb(247, 147, 40)',
  '29': 'rgb(0, 83, 159)',
  '44': 'rgb(0, 116, 173)',
  '60': 'rgb(218, 111, 171)',
  '80': 'rgb(113, 125, 189)',
  '85': 'rgb(240, 90, 78)',
  '95': 'rgb(196, 16, 57)',
  '100': 'rgb(136, 128, 126)',
  '107': 'rgb(70, 162, 153)',
  '108': 'rgb(181, 162, 206)',
  '120': 'rgb(250, 166, 26)',
  '125': 'rgb(95, 153, 55)',
  '130': 'rgb(159, 57, 37)',
  '135': 'rgb(13, 177, 75)',
  '140': 'rgb(0, 146, 158)',
  '145': 'rgb(149, 100, 56)',
  '150': 'rgb(152, 83, 161)',
  '535': 'rgb(210, 191, 165)',
  '820': 'rgb(70, 186, 124)',
}

class LinesNZCHC extends BaseLines {
  constructor(props) {
    super()
    const { logger, connection } = props
    this.logger = logger
    this.connection = connection
    this.dataAccess = new DataAccess({ connection })

    this.lineIcons = lineIcons
    this.lineColors = lineColors
    this.allLines = {}
    this.lineGroups = {}
    this.lineOperators = {}
    this.friendlyNames = friendlyNames
  }

  async start() {
    await this.getLines()
  }

  async getLines() {
    const { logger, dataAccess } = this
    const allLines = {}
    const lineOperators = {}
    const lineGroups = [
      {
        name: 'Frequent',
        items: [],
      },
      {
        name: 'Connector',
        items: [],
      },
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

      // deduplicates same route short names - orbiter
      if (allLines.hasOwnProperty(record.route_short_name)) {
        allLines[record.route_short_name].push(lineEntry)
      } else {
        allLines[record.route_short_name] = [lineEntry]

        const numericLine = parseInt(record.route_short_name, 10)
        if (numericLine < 85 || isNaN(numericLine)) {
          lineGroups[0].items.push(record.route_short_name)
        } else {
          lineGroups[1].items.push(record.route_short_name)
        }
      }
    })

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

    this.allLines = allLines
    this.lineOperators = lineOperators
    this.lineGroups = lineGroups
    logger.info('Cached Lines')
  }
}
export default LinesNZCHC
