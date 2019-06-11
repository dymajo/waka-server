// import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import axios from 'axios'
import * as protobuf from 'protobufjs'
import * as Logger from 'bunyan'
import { Response, Request } from 'express'
import { VarChar } from 'mssql'
import Connection from '../../db/connection'
import {
  PositionFeedMessage,
  UpdateFeedMessage,
  TripUpdate,
  VehiclePosition,
  BaseRealtime,
  WakaRequest,
  PositionFeedEntity,
} from '../../../typings'

const schedulePullTimeout = 20000
const scheduleLocationPullTimeout = 15000

const modes = [
  'buses',
  'ferries',
  'lightrail/innerwest',
  'lightrail/newcastle',
  'nswtrains',
  'sydneytrains',
]

interface RealtimeAUSYDProps {
  apiKey: string
  connection: Connection
  logger: Logger
}

class RealtimeAUSYD extends BaseRealtime {
  connection: Connection
  logger: Logger
  apiKey: string
  lastUpdate: any
  lastVehicleUpdate: any
  currentData: { [tripId: string]: TripUpdate }
  currentDataFails: number
  currentVehicleData: PositionFeedEntity[]
  currentVehicleDataFails: any
  tripUpdateOptions: { url: string; headers: { Authorization: any } }
  vehicleLocationOptions: { url: string; headers: { Authorization: any } }
  constructor(props: RealtimeAUSYDProps) {
    super()
    const { apiKey, connection, logger } = props
    this.connection = connection
    this.logger = logger
    this.apiKey = apiKey

    this.lastUpdate = null
    this.lastVehicleUpdate = null
    this.currentData = {}
    this.currentDataFails = 0
    this.currentVehicleData = []
    this.currentVehicleDataFails = null

    this.tripUpdateOptions = {
      url: 'https://api.transport.nsw.gov.au/v1/gtfs/realtime',
      headers: {
        Authorization: apiKey,
      },
    }

    this.vehicleLocationOptions = {
      url: 'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos',
      headers: {
        Authorization: apiKey,
      },
    }

    this.schedulePull = this.schedulePull.bind(this)
    this.scheduleLocationPull = this.scheduleLocationPull.bind(this)
  }

  start() {
    const { apiKey, logger } = this
    if (!apiKey) {
      logger.warn('No TfNSW API Key, will not show realtime.')
    }
    this.schedulePull()
    this.scheduleLocationPull()
    logger.info('TfNSW Realtime Started.')
  }

  async schedulePull() {
    const { logger, tripUpdateOptions } = this
    const newData: { [tripId: string]: TripUpdate } = {}
    const root = await protobuf.load('tfnsw-gtfs-realtime.proto')
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage')
    const results = await Promise.all(
      modes.map(async mode => {
        try {
          const res = await axios.get(`${tripUpdateOptions.url}/${mode}`, {
            headers: tripUpdateOptions.headers,
            responseType: 'arraybuffer',
          })
          const uInt8 = new Uint8Array(res.data)
          const _feed = FeedMessage.decode(uInt8) as unknown
          // const _feed = GtfsRealtimeBindings.FeedMessage.decode(res)
          const feed = _feed as UpdateFeedMessage

          // const feed = GtfsRealtimeBindings.TripUpdate.decode(buffer)

          feed.entity.forEach(trip => {
            if (trip.tripUpdate) {
              newData[trip.tripUpdate.trip.tripId] = trip.tripUpdate
            }
          })
        } catch (err) {
          // console.error(err)
          // logger.error(err)
        }
      })
    )

    this.currentData = newData
    this.currentDataFails = 0
    this.lastUpdate = new Date()
    setTimeout(this.schedulePull, schedulePullTimeout)
  }

  async scheduleLocationPull() {
    const { logger, vehicleLocationOptions } = this
    const root = await protobuf.load('tfnsw-gtfs-realtime.proto')
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage')
    let newVehicleData: PositionFeedEntity[] = []
    const results = await Promise.all(
      modes.map(async mode => {
        try {
          const res = await axios.get(`${vehicleLocationOptions.url}/${mode}`, {
            headers: vehicleLocationOptions.headers,
            responseType: 'arraybuffer',
          })
          const uInt8 = new Uint8Array(res.data)
          const _feed = FeedMessage.decode(uInt8) as unknown
          // const _feed = GtfsRealtimeBindings.FeedMessage.decode(res)
          const feed = _feed as PositionFeedMessage
          newVehicleData = newVehicleData.concat(feed.entity)
          // feed.entity.forEach(trip => {
          //   if (trip.vehicle.trip.routeId === '2441_343') {
          //     console.log(trip)
          //   }
          //   if (trip.vehicle) {
          //     newVehicleData[trip.vehicle.trip.tripId] = trip.vehicle
          //   }
          // })
        } catch (err) {
          // console.error(err)
        }
      })
    )
    this.currentVehicleData = newVehicleData
    this.currentDataFails = 0
    this.lastVehicleUpdate = new Date()
  }

  async getTripsEndpoint(
    req: WakaRequest<{ trips: string[]; stop_id: string }, null>,
    res: Response
  ) {
    const { trips, stop_id } = req.body
    const realtimeInfo = {}
    for (const trip in trips) {
      if (Object.prototype.hasOwnProperty.call(trips, trip)) {
        try {
          const data = this.currentData[trip]

          if (typeof data !== 'undefined') {
            const stop = data.stopTimeUpdate.find(stu => stu.stopId === stop_id)
            const timeUpdate = stop.departure
            const info = {}
            Object.assign(
              info,
              stop.stopSequence && { stop_sequence: stop.stopSequence },
              stop.departure && {
                delay: stop.departure.delay,
                timestamp: stop.departure.time.toNumber(),
              }
            )
            realtimeInfo[trip] = info
          }
        } catch (error) {}
      }
    }
    return res.send(realtimeInfo)
  }

  async getVehicleLocationEndpoint(
    req: WakaRequest<{ trips: string[] }, null>,
    res: Response
  ) {
    const { logger, currentVehicleData } = this
    const { trips } = req.body
    const vehicleInfo = {}
    for (const trip in trips) {
      if (Object.prototype.hasOwnProperty.call(trips, trip)) {
        const element = trips[trip]
        try {
          const data = currentVehicleData[trip]
          vehicleInfo[trip] = {
            latitude: data.position.latitude,
            longitude: data.position.longitude,
          }
        } catch (err) {}
      }
    }
    res.send(vehicleInfo)
  }

  async getLocationsForLine(req: WakaRequest<null, { line: string }>, res) {
    const { logger, connection } = this
    const { line } = req.params
    if (this.currentVehicleData.length === 0) {
      return res.send([])
    }

    try {
      const sqlRouteIdRequest = connection.get().request()
      sqlRouteIdRequest.input('route_short_name', VarChar(50), line)
      const routeIdResult = await sqlRouteIdRequest.query<{ route_id: string }>(
        `
      SELECT route_id
      FROM routes
      WHERE route_short_name = @route_short_name
      `
      )
      const routeIds = routeIdResult.recordset.map(r => r.route_id)
      const trips = this.currentVehicleData.filter(entity =>
        routeIds.includes(entity.vehicle.trip.routeId)
      )
      const tripIds = trips.map(entity => entity.vehicle.trip.tripId)
      const escapedTripIds = `'${tripIds.join("', '")}'`
      const sqlTripIdRequest = connection.get().request()
      const tripIdRequest = await sqlTripIdRequest.query<{
        trip_id: string
        direction_id: number
      }>(`
      SELECT *
      FROM trips
      WHERE trip_id IN (${escapedTripIds})
      `)

      const tripIdsMap = {}
      tripIdRequest.recordset.forEach(
        record => (tripIdsMap[record.trip_id] = record.direction_id)
      )

      // now we return the structued data finally
      const result = trips.map(entity => ({
        latitude: entity.vehicle.position.latitude,
        longitude: entity.vehicle.position.longitude,
        bearing: entity.vehicle.position.bearing,
        direction: tripIdsMap[entity.vehicle.trip.tripId],
        updatedAt: this.lastVehicleUpdate,
      }))
      res.send(result)
      return result
    } catch (err) {
      logger.error({ err }, 'Could not get locations from line.')
      res.status(500).send(err)
      return err
    }
  }
}

export default RealtimeAUSYD
