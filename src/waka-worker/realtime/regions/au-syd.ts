// import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import axios from 'axios'
import * as protobuf from 'protobufjs'
import BaseRealtime from './BaseRealtime'
import Connection from '../../db/connection'
import * as Logger from 'bunyan'
import {
  PositionFeedMessage,
  UpdateFeedMessage,
  TripUpdate,
  VehiclePosition,
} from './types'
import { Response, Request } from 'express'
import { VarChar } from 'mssql'
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

interface IRealtimeAUSYDProps {
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
  currentVehicleData: { [tripId: string]: VehiclePosition }
  currentVehicleDataFails: any
  tripUpdateOptions: { url: string; headers: { Authorization: any } }
  vehicleLocationOptions: { url: string; headers: { Authorization: any } }
  constructor(props: IRealtimeAUSYDProps) {
    super()
    const { apiKey, connection, logger } = props
    this.connection = connection
    this.logger = logger
    this.apiKey = apiKey

    this.lastUpdate = null
    this.lastVehicleUpdate = null
    this.currentData = {}
    this.currentDataFails = 0
    this.currentVehicleData = {}
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
    const newVehicleData = {}
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
          feed.entity.forEach(trip => {
            if (trip.vehicle) {
              newVehicleData[trip.vehicle.trip.tripId] = trip.vehicle
            }
          })
        } catch (err) {
          // console.error(err)
        }
      })
    )
    this.currentVehicleData = newVehicleData
    this.currentDataFails = 0
    this.lastVehicleUpdate = new Date()
  }

  async getTripsEndpoint(req: Request, res: Response) {
    const { trips, stop_id } = req.body
    const realtimeInfo = {}
    for (const trip in trips) {
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
    return res.send(realtimeInfo)
  }

  async getVehicleLocationEndpoint(req, res) {
    const { logger, currentVehicleData } = this
    const { trips } = req.body
    const vehicleInfo = {}
    for (const trip in trips) {
      try {
        const data = currentVehicleData[trip]
        vehicleInfo[trip] = {
          latitude: data.position.latitude,
          longitude: data.position.longitude,
        }
      } catch (err) {}
    }
    debugger
    res.send(vehicleInfo)
  }

  async getLocationsForLine(req, res) {
    debugger
    const { logger, connection } = this
    const { line } = req.params
    const currentTripIds = Object.keys(this.currentVehicleData)
    debugger
    if (currentTripIds.length === 0) {
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
      const tripIds = currentTripIds.filter(tripId => {
        const routeId = this.currentVehicleData[tripId].trip.routeId
        routeIds.includes(routeId)
      })
      // const tripIds = trips.map(entity => entity.vehicle.trip.trip_id)
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
        bearing: entity.vehicle.position.bearing
          ? parseInt(entity.vehicle.position.bearing, 10)
          : null,
        direction: tripIdsMap[entity.vehicle.trip.trip_id],
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
