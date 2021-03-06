import { Request, Response } from 'express'
import * as sql from 'mssql'
import cityMetadataJSON from '../../cityMetadata.json'
import { Logger, WakaRequest } from '../../types'
import BaseLines from '../../types/BaseLines'
import { isKeyof, sortFn } from '../../utils'
import WakaRedis from '../../waka-realtime/Redis'
import Connection from '../db/connection'
import Storage from '../db/storage'
import StopsDataAccess from '../dataAccess/stopsDataAccess'
import SydneyLines from './regions/au-syd'
import GenericLines from './regions/generic'
import AucklandLines from './regions/nz-akl'
import ChristchurchLines from './regions/nz-chc'
import WellingtonLines from './regions/nz-wlg'

const regions = {
  'au-syd': SydneyLines,
  'nz-akl': AucklandLines,
  'nz-chc': ChristchurchLines,
  'nz-wlg': WellingtonLines,
}
interface LinesProps {
  logger: Logger
  connection: Connection
  prefix: string
  version: string
  config: {
    storageService: 'aws' | 'local'
    shapesContainer: string
    shapesRegion: string
  }
  redis: WakaRedis
}

class Lines {
  logger: Logger
  connection: Connection
  prefix: string
  version: string
  stopsDataAccess: StopsDataAccess
  storageSvc: Storage
  lineDataSource: BaseLines
  config: {
    storageService: 'aws' | 'local'
    shapesContainer: string
    shapesRegion: string
  }
  cityMetadata: {
    [prefix: string]: {
      name: string
      secondaryName: string
      longName: string
      initialLocation: number[]
      showInCityList: boolean
      bounds?: {
        lat: {
          min: number
          max: number
        }
        lon: {
          min: number
          max: number
        }
      }
    }
  }
  redis: WakaRedis
  constructor(props: LinesProps) {
    const { logger, connection, prefix, version, config, redis } = props
    this.logger = logger
    this.connection = connection
    this.prefix = prefix
    this.version = version
    this.config = config
    this.cityMetadata = cityMetadataJSON
    this.redis = redis
    // not too happy about this
    this.stopsDataAccess = new StopsDataAccess({ connection, prefix })

    this.storageSvc = new Storage({
      backing: config.storageService,
      region: config.shapesRegion,
      logger,
    })

    this.lineDataSource = isKeyof(regions, prefix)
      ? new regions[prefix]({ logger, connection })
      : new GenericLines({ logger, connection })
  }

  start = async () => {
    const { logger, lineDataSource } = this
    try {
      if (lineDataSource === null) {
        throw new Error('Region not implemented.')
      }
      await lineDataSource.start()

      // the second element in the array is default, if it is not exported from the source
      const requiredProps: [string, {} | []][] = [
        ['lineColors', {}],
        ['lineIcons', {}],
        ['friendlyNames', {}],
        ['friendlyNumbers', {}],
        ['lineGroups', []],
        ['allLines', {}],
        ['lineOperators', {}],
      ]
    } catch (err) {
      logger.error({ err }, 'Could not load line data.')
    }
  }

  stop = () => {}

  getColor = (agencyId: string, routeShortName: string) => {
    const { lineDataSource } = this
    if (lineDataSource.lineColors) {
      return (
        lineDataSource.lineColors[`${agencyId}/${routeShortName}`] || '#00263A'
      )
    }
    return '#00263A'
  }

  getIcon = (agencyId: string, routeShortName: string) => {
    // this will probably be revised soon
    const { lineDataSource } = this
    if (lineDataSource.lineIcons) {
      return lineDataSource.lineIcons[`${agencyId}/${routeShortName}`] || null
    }
    return null
  }

  /**
   * @api {get} /:region/lines List - All
   * @apiName GetLines
   * @apiGroup Lines
   *
   * @apiParam {String} region Region of Worker
   *
   * @apiSuccess {Object} meta Region metadata
   * @apiSuccess {String} meta.prefix Region Prefix
   * @apiSuccess {String} meta.name Name of the Region
   * @apiSuccess {String} meta.secondaryName Extra Region Name (State, Country etc)
   * @apiSuccess {String} meta.longName The name and secondary name combined.
   * @apiSuccess {Object[]} friendlyNames Key value store of Route Short Names to more official names
   * @apiSuccess {Object[]} colors Key value store of Route Short Names to corresponding colors
   * @apiSuccess {Object[]} icons Key value store of Route Short Names to corresponding icons (optional)
   * @apiSuccess {Object[]} groups Grouping for all the lines into region.
   * @apiSuccess {String} groups.name Name of Group
   * @apiSuccess {String[]} groups.items Route Short Names that belong in the group
   * @apiSuccess {Object[]} lines List of all lines
   * @apiSuccess {String[]} lines.line Can have more than one item - depends on how many route variants.
   * For each variant: 0th Element - Origin (or full name if length 1), 1st Element - Destination. 2nd Element - Via.
   *
   * @apiSuccessExample Success-Response:
   *     HTTP/1.1 200 OK
   *     {
   *       "meta": {
   *         "prefix": "nz-akl",
   *         "name": "Tāmaki Makaurau",
   *         "secondaryName": "Auckland"
   *         "longName": "Tāmaki Makaurau, Auckland"
   *       },
   *       "friendlyNames": {
   *         "380": "Airporter"
   *       },
   *       "colors": {
   *         "380": "#2196F3"
   *       },
   *       "icons": {
   *         "380": "nz/at-metro-airporter"
   *       },
   *       "groups": [
   *         {
   *           "name": "Congestion Free Network",
   *           "items": [
   *             "380"
   *           ]
   *         }
   *       ],
   *       "lines": {
   *         "380": [
   *           [
   *             "Onehunga",
   *             "Manukau",
   *             "Airport"
   *           ],
   *           [
   *             "Howick",
   *             "Pukekohe",
   *             "Airport"
   *           ]
   *         ]
   *       }
   *     }
   *
   */
  getLines = (req: WakaRequest<null, null>, res: Response) => {
    res.send(this._getLines())
  }

  getLinesV2 = (req: WakaRequest<null, null>, res: Response) => {
    res.send(this._getLinesV2())
  }

  _getLinesV2 = () => {
    const { prefix, lineDataSource, cityMetadata } = this
    // if the region has multiple cities
    let city = cityMetadata[prefix]
    if (!Object.prototype.hasOwnProperty.call(city, 'name')) {
      city = city[prefix]
    }
    return {
      meta: {
        prefix,
        name: cityMetadata[prefix].name,
        secondaryName: cityMetadata[prefix].secondaryName,
        longName: cityMetadata[prefix].longName,
      },
      colors: lineDataSource.lineColors,
      icons: lineDataSource.lineIcons,
      groups: lineDataSource.lineGroupsV2,
    }
  }

  _getLines = () => {
    const { prefix, lineDataSource, cityMetadata } = this
    // if the region has multiple cities
    let city = cityMetadata[prefix]
    if (!Object.prototype.hasOwnProperty.call(city, 'name')) {
      city = city[prefix]
    }

    const updateKeys = obj => {
      const newObj = {}
      Object.keys(obj).forEach(key => {
        newObj[
          key
            .split('/')
            .slice(1)
            .join('/')
        ] = obj[key]
      })
      return newObj
    }

    const updateGroups = groups =>
      groups
        .filter(group => group.items.length > 0)
        .map(group => {
          const { name } = group
          const items = group.items.map(i =>
            i
              .split('/')
              .slice(1)
              .join('/')
          )
          return { name, items }
        })

    return {
      meta: {
        prefix,
        name: cityMetadata[prefix].name,
        secondaryName: cityMetadata[prefix].secondaryName,
        longName: cityMetadata[prefix].longName,
      },
      colors: updateKeys(lineDataSource.lineColors),
      icons: updateKeys(lineDataSource.lineIcons),
      friendlyNames: lineDataSource.friendlyNames,
      friendlyNumbers: updateKeys(lineDataSource.friendlyNumbers),
      groups: updateGroups(lineDataSource.lineGroups),
      lines: updateKeys(lineDataSource.allLines),
      operators: updateKeys(lineDataSource.lineOperators),
    }
  }

  /**
   * @api {get} /:region/line/:line Info - by route_short_name
   * @apiName GetLine
   * @apiGroup Lines
   *
   * @apiParam {String} region Region of Worker
   * @apiParam {String} line route_short_name of particular line
   *
   * @apiSuccess {Object[]} line All the variants for a particular line.
   * @apiSuccess {String} line.route_id GTFS route_id
   * @apiSuccess {String} line.route_long_name Long name for route variant
   * @apiSuccess {String} line.route_short_name Short name for route variant
   * @apiSuccess {String} line.route_color Color for route
   * @apiSuccess {String} line.route_icon Icon for route (optional)
   * @apiSuccess {Number} line.direction_id Direction of route
   * @apiSuccess {String} line.shape_id GTFS Shape_id
   * @apiSuccess {Number} line.route_type GTFS route_type - Transport mode
   *
   * @apiSuccessExample Success-Response:
   * HTTP/1.1 200 OK
   * [
   *   {
   *     "route_id": "50140-20171113160906_v60.12",
   *     "route_long_name": "Britomart Train Station to Manukau Train Station",
   *     "route_short_name": "EAST",
   *     "route_color": "#f39c12",
   *     "route_icon": "nz/at-metro-eastern",
   *     "direction_id": 1,
   *     "shape_id": "1199-20171113160906_v60.12",
   *     "route_type": 2
   *   },
   *   {
   *     "route_id": "50151-20171113160906_v60.12",
   *     "route_long_name": "Manukau Train Station to Britomart Train Station",
   *     "route_short_name": "EAST",
   *     "route_color": "#f39c12",
   *     "route_icon": "nz/at-metro-eastern",
   *     "direction_id": 0,
   *     "shape_id": "1198-20171113160906_v60.12",
   *     "route_type": 2
   *   }
   * ]
   */
  getLine = async (req: WakaRequest<null, { line: string }>, res: Response) => {
    const lineId = req.params.line.trim()
    const routeId = (req.query.route_id || '').trim()
    const agencyId = (req.query.agency_id || '').trim()
    try {
      const data = await this._getLine(lineId, agencyId, routeId)
      res.send(data)
    } catch (err) {
      this.logger.error(err)
      res.status(500).send({ message: 'Internal Server Error' })
    }
  }

  _getLine = async (lineId: string, agencyId: string, routeId: string) => {
    const { connection, lineDataSource } = this
    const sqlRequest = connection.get().request()
    let route = ''
    if (routeId !== '') {
      route = 'routes.route_id = @route_id'
      sqlRequest.input('route_id', sql.VarChar(50), routeId)
    } else {
      route = 'routes.route_short_name = @route_short_name'
      sqlRequest.input('route_short_name', sql.VarChar(50), lineId)
    }
    // filter by agency if a filter exists
    let agency = ''
    if (agencyId !== '') {
      agency = 'and routes.agency_id = @agency_id'
      sqlRequest.input('agency_id', sql.VarChar(50), agencyId)
    }
    const query = `
      SELECT
        routes.route_id,
        routes.agency_id,
        routes.route_short_name,
        routes.route_long_name,
        routes.route_type,
        routes.route_color,
        trips.shape_id,
        trips.trip_headsign,
        trips.direction_id,
        stops.stop_code as first_stop_id,
        count(trips.shape_id) as shape_score
      FROM routes
      INNER JOIN trips ON
        trips.route_id = routes.route_id
      CROSS APPLY ( SELECT TOP 1 stop_id FROM stop_times WHERE trip_id = trips.trip_id ORDER BY stop_sequence) stop_times2
      INNER JOIN stops on stop_times2.stop_id = stops.stop_id
      WHERE
        ${route}
        and shape_id is not null
        ${agency}
      GROUP BY
        routes.route_id,
        routes.agency_id,
        routes.route_short_name,
        routes.route_long_name,
        routes.route_type,
        routes.route_color,
        trips.shape_id,
        trips.trip_headsign,
        trips.direction_id,
        stops.stop_code
      ORDER BY
        shape_score desc
    `
    const result = await sqlRequest.query<{
      route_id: string
      agency_id: string
      route_short_name: string
      route_long_name: string
      route_type: number
      route_color: string
      shape_id: string
      trip_headsign: string
      direction_id: string
      first_stop_id: string
      shape_score: number
    }>(query)
    const versions = {}
    const results: {
      route_id: string
      agency_id: string
      route_long_name: string
      route_short_name: string
      route_color: string
      route_icon: string
      direction_id: string
      shape_id: string
      first_stop_id: string
      route_type: number
    }[] = []
    result.recordset.forEach(route => {
      // make sure it's not already in the response
      if (
        typeof versions[route.route_long_name + (route.direction_id || '0')] ===
        'undefined'
      ) {
        versions[route.route_long_name + (route.direction_id || '0')] = true
      } else {
        return
      }

      const result = {
        route_id: route.route_id,
        agency_id: route.agency_id,
        route_long_name: route.route_long_name,
        route_short_name: route.route_short_name,
        route_color: `#${route.route_color}`,
        route_icon: this.getIcon(route.agency_id, route.route_short_name),
        direction_id: route.direction_id,
        shape_id: route.shape_id,
        first_stop_id: route.first_stop_id,
        route_type: route.route_type,
        services_count: route.shape_score, // factious
      }
      results.push(result)
    })
    if (results.length === 2) {
      if (results[0].route_long_name === results[1].route_long_name) {
        let candidate = results[1]
        if (results[0].direction_id !== 1) {
          candidate = results[0]
        }
        const regexed = candidate.route_long_name.match(/\((.+?)\)/g)
        if (regexed) {
          const newName = `(${regexed[0]
            .slice(1, -1)
            .split(' - ')
            .reverse()
            .join(' - ')})`
          candidate.route_long_name = candidate.route_long_name.replace(
            /\((.+?)\)/g,
            newName
          )
        } else {
          candidate.route_long_name = candidate.route_long_name
            .split(' - ')
            .reverse()
            .join(' - ')
        }
      }
    }
    return results
  }

  /**
   * @api {get} /:region/shapejson/:shape_id Line Shape - by shape_id
   * @apiName GetShape
   * @apiGroup Lines
   *
   * @apiParam {String} region Region of Worker
   * @apiParam {String} shape_id GTFS Shape_id for particular shape.
   *
   * @apiSuccess {String} type GeoJSON Shape Type
   * @apiSuccess {Object[]} coordinates GeoJSON Coordinates
   *
   * @apiSuccessExample Success-Response:
   * HTTP/1.1 200 OK
   * {
   *   "type": "LineString",
   *   "coordinates": [
   *     [
   *         174.76848,
   *         -36.84429
   *     ],
   *     [
   *         174.76863,
   *         -36.84438
   *     ]
   *   ]
   * }
   */
  getShapeJSON = async (req: Request, res: Response) => {
    const { prefix, version, config, storageSvc } = this
    const containerName = config.shapesContainer
    const { shapeId } = req.params
    const fileName = `${prefix}/${version
      .replace('_', '-')
      .replace('.', '-')}/${Buffer.from(shapeId).toString('base64')}.json`

    await storageSvc.downloadStream(
      containerName,
      fileName,
      res,
      (blobError, data) => {
        if (blobError) {
          res.status(404)
        }
        res.end()
      }
    )
  }

  // TODO: Probably move these to the Auckland & Wellington Specific Files
  exceptionCheck = (route, bestMatchMode = false) => {
    const { prefix, lineDataSource } = this
    if (prefix !== 'nz-akl' && prefix !== 'nz-wlg') {
      return true
    }

    const { allLines } = lineDataSource

    // blanket thing for no schools
    if (route.trip_headsign === 'Schools') {
      return false
    }
    if (typeof allLines[route.route_short_name] === 'undefined') {
      return true
    }
    let retval = false
    let routes = allLines[route.route_short_name].slice()

    // new mode that we only find the best match
    if (bestMatchMode) {
      routes = [routes[0]]
    }
    routes.forEach(variant => {
      if (variant.length === 1 && route.route_long_name === variant[0]) {
        retval = true
        // normal routes - from x to x
      } else if (variant.length === 2) {
        const splitName = route.route_long_name.toLowerCase().split(' to ')
        if (
          variant[0].toLowerCase() === splitName[0] &&
          variant[1].toLowerCase() === splitName[1]
        ) {
          retval = true
          // reverses the order
        } else if (
          variant[1].toLowerCase() === splitName[0] &&
          variant[0].toLowerCase() === splitName[1] &&
          !bestMatchMode
        ) {
          retval = true
        }
        // handles via Flyover or whatever
      } else if (variant.length === 3) {
        const splitName = route.route_long_name.toLowerCase().split(' to ')
        if (
          splitName.length > 1 &&
          splitName[1].split(' via ')[1] === variant[2].toLowerCase()
        ) {
          splitName[1] = splitName[1].split(' via ')[0]
          if (
            variant[0].toLowerCase() === splitName[0] &&
            variant[1].toLowerCase() === splitName[1]
          ) {
            retval = true
            // reverses the order
          } else if (
            variant[1].toLowerCase() === splitName[0] &&
            variant[0].toLowerCase() === splitName[1] &&
            !bestMatchMode
          ) {
            retval = true
          }
        }
      }
    })
    return retval
  }

  stopTimesv2 = async (
    req: WakaRequest<null, { tripId: string }>,
    res: Response
  ) => {
    const {
      params: { tripId },
    } = req
    const { stopsDataAccess, logger } = this
    try {
      const data = await stopsDataAccess.getBlockFromTrip(tripId)
      const promises = data.current.map(async i => {
        const redisresult = await this.redis.client.get(
          `waka-worker:${this.prefix}:stop-transfers:${i.stop_code}`
        )
        let transfers: string[] = []
        if (redisresult) {
          transfers = redisresult.split(',')
        }
        const transfersWithColors = transfers.map(t => {
          const [agency, routeShortName] = t.split('/')
          return [routeShortName, this.getColor(agency, routeShortName)]
        })
        transfersWithColors.sort(sortFn)
        i.stop_id = i.stop_code
        delete i.stop_code

        return { ...i, transfers: transfersWithColors }
      })
      const current = await Promise.all(promises)
      res.send({ ...data, current })
    } catch (err) {
      logger.error({ err }, 'Could not get stop times for trip')
      res.status(500).send({ message: 'Could not get stop times for trip' })
    }
  }
}

export default Lines
