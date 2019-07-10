// import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import axios from 'axios'
import * as protobuf from 'protobufjs'
import * as Logger from 'bunyan'
import { Response, Request } from 'express'
import { VarChar } from 'mssql'
import redis from 'redis'
import { pRateLimit, RedisQuotaManager } from 'p-ratelimit'
import Connection from '../../db/connection'
import {
  PositionFeedMessage,
  UpdateFeedMessage,
  TripUpdate,
  WakaRequest,
  PositionFeedEntity,
  VehiclePosition,
} from '../../../typings'
import BaseRealtime from '../../../types/BaseRealtime'

const scheduleUpdatePullTimeout = 15000
const scheduleLocationPullTimeout = 15000

const modes: [
  'buses',
  'ferries',
  'lightrail/innerwest',
  'lightrail/newcastle',
  'nswtrains',
  'sydneytrains',
  'metro'
] = [
    'buses',
    'ferries',
    'lightrail/innerwest',
    'lightrail/newcastle',
    'nswtrains',
    'sydneytrains',
    'metro',
  ]

interface RealtimeAUSYDProps {
  apiKey: string
  connection: Connection
  logger: Logger
  prefix: string
}

class RealtimeAUSYD extends BaseRealtime {
  tripUpdateOptions: { url: string; headers: { Authorization: any } }
  vehicleLocationOptions: { url: string; headers: { Authorization: any } }
  updates: {
    [mode: string]: {
      vehicle: { data: PositionFeedEntity[]; lastModified: Date }
      tripupdate: { data: { [tripId: string]: TripUpdate }; lastModified: Date }
    }
  }
  rateLimiter: <T>(fn: () => Promise<T>) => Promise<T>
  redis: redis.RedisClient

  constructor(props: RealtimeAUSYDProps) {
    super()
    const { apiKey, connection, logger, prefix } = props
    this.connection = connection
    this.logger = logger
    this.apiKey = apiKey
    this.lastTripUpdate = null
    this.lastVehicleUpdate = null
    this.currentUpdateDataFails = 0
    this.currentVehicleDataFails = null
    this.redis = redis.createClient()
    this.rateLimiter = pRateLimit(
      new RedisQuotaManager(
        {
          interval: 1000,
          rate: 5,
          concurrency: 5,
        },
        prefix,
        this.redis
      )
    )

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
    this.updates = {
      metro: {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
      buses: {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
      ferries: {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
      'lightrail/innerwest': {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
      'lightrail/newcastle': {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
      nswtrains: {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
      sydneytrains: {
        vehicle: { data: [], lastModified: new Date(0) },
        tripupdate: { data: {}, lastModified: new Date(0) },
      },
    }
  }

  start = async () => {
    const { apiKey, logger } = this
    if (!apiKey) {
      logger.warn('No TfNSW API Key, will not show realtime.')
    }
    this.scheduleUpdatePull()
    this.scheduleLocationPull()
    logger.info('TfNSW Realtime Started.')
  }

  stop = () => {
    // TODO!
    this.logger.warn('Sydney Realtime Not Stopped! Not Implemented.')
  }

  scheduleUpdatePull = async () => {
    const { logger, tripUpdateOptions } = this
    const root = await protobuf.load('tfnsw-gtfs-realtime.proto')
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage')
    logger.info('starting trip update pull')

    for (const mode of modes) {
      try {
        const res = await this.rateLimiter(() =>
          axios.get(`${tripUpdateOptions.url}/${mode}`, {
            headers: tripUpdateOptions.headers,
            responseType: 'arraybuffer',
          })
        )

        const uInt8 = new Uint8Array(res.data)
        const _feed = FeedMessage.decode(uInt8) as unknown
        const feed = _feed as UpdateFeedMessage
        for (const trip of feed.entity) {
          await this.setKeyToRedis(
            trip.tripUpdate.trip.tripId,
            JSON.stringify(trip.tripUpdate),
            'trip-update'
          )
        }
      } catch (err) {
        console.error(JSON.parse(err.response.data))
        logger.error(err.response.data)
      }
    }

    this.currentUpdateDataFails = 0
    this.lastTripUpdate = new Date()
    logger.info('Pulled TfNSW Trip Updates Data.')

    setTimeout(this.scheduleUpdatePull, scheduleUpdatePullTimeout)
  }

  scheduleLocationPull = async () => {
    const { logger, vehicleLocationOptions } = this
    const root = await protobuf.load('tfnsw-gtfs-realtime.proto')
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage')
    logger.info('starting location pull')
    for (const mode of modes) {
      try {
        const res = await this.rateLimiter(() =>
          axios.get(`${vehicleLocationOptions.url}/${mode}`, {
            headers: vehicleLocationOptions.headers,
            responseType: 'arraybuffer',
          })
        )

        const uInt8 = new Uint8Array(res.data)
        const _feed = FeedMessage.decode(uInt8) as unknown
        const feed = _feed as PositionFeedMessage
        const routes: { [routeId: string]: string[] } = {}
        for (const trip of feed.entity) {
          if (trip.vehicle.trip.tripId) {
            if (
              Object.prototype.hasOwnProperty.call(
                routes,
                trip.vehicle.trip.routeId
              )
            ) {
              routes[trip.vehicle.trip.routeId].push(trip.vehicle.trip.tripId)
            } else {
              routes[trip.vehicle.trip.routeId] = [trip.vehicle.trip.tripId]
            }
            try {
              await this.setKeyToRedis(
                trip.vehicle.trip.tripId,
                JSON.stringify(trip.vehicle),
                'vehicle-position'
              )
            } catch (error) {
              console.log(error)
            }
          }
        }

        for (const routeId in routes) {
          if (Object.prototype.hasOwnProperty.call(routes, routeId)) {
            await this.setKeyToRedis(
              routeId,
              routes[routeId].toString(),
              'route-id'
            )
          }
        }
        this.updates[mode].vehicle.lastModified = res.headers['last-modified']
      } catch (err) {
        console.error(err)
      }
    }
    this.lastVehicleUpdate = new Date()
    logger.info('Pulled TfNSW Location Data')
    setTimeout(this.scheduleLocationPull, scheduleLocationPullTimeout)
  }
  setKeyToRedis = (
    key: string,
    value: string,
    type: 'trip-update' | 'vehicle-position' | 'route-id'
  ) => {
    return new Promise<string>((resolve, reject) => {
      const fullKey = `au-syd:${type}:${key}`

      this.redis.set(fullKey, value, 'EX', 60, (err, reply) => {
        if (err) return reject(err)
        return resolve(reply)
      })
    })
  }

  getKeyFromRedis = <T = string[]>(
    key: string,
    type: 'trip-update' | 'vehicle-position' | 'route-id'
  ) => {
    return new Promise<T>((resolve, reject) => {
      const fullKey = `au-syd:${type}:${key}`
      this.redis.get(fullKey, (err, reply) => {
        if (err) return reject(err)
        if (type === 'route-id') {
          return resolve(reply.split(','))
        }
        return resolve(JSON.parse(reply))
      })
    })
  }

  getTripsEndpoint = async (
    req: WakaRequest<{ trips: string[]; stop_id: string }, null>,
    res: Response
  ) => {
    const { trips, stop_id } = req.body
    const realtimeInfo: { [tripId: string]: TripUpdate } = {}
    for (const trip of trips) {
      try {
        const data = await this.getKeyFromRedis<TripUpdate>(trip, 'trip-update')

        realtimeInfo[trip] = data
      } catch (error) {
        console.log(error)
      }
    }
    return res.send(realtimeInfo)
  }

  getVehicleLocationEndpoint = async (
    req: WakaRequest<{ trips: string[] }, null>,
    res: Response
  ) => {
    const { logger } = this
    const { trips } = req.body
    const vehicleInfo: {
      [tripId: string]: { latitude: number; longitude: number }
    } = {}
    for (const trip in trips) {
      if (Object.prototype.hasOwnProperty.call(trips, trip)) {
        const element = trips[trip]
        try {
          const data = await this.getKeyFromRedis<VehiclePosition>(
            trip,
            'vehicle-position'
          )
          vehicleInfo[trip] = {
            latitude: data.position.latitude,
            longitude: data.position.longitude,
          }
        } catch (err) {
          console.log(err)
        }
      }
    }
    return res.send(vehicleInfo)
  }

  getLocationsForLine = async (
    req: WakaRequest<null, { line: string }>,
    res: Response
  ) => {
    const { logger, connection } = this
    const { line } = req.params

    try {
      const sqlRouteIdRequest = connection.get().request()
      sqlRouteIdRequest.input('route_short_name', VarChar(50), line)
      const routeIdResult = await sqlRouteIdRequest.query<{ route_id: string }>(
        `
      SELECT route_id
      FROM routes
      WHERE route_short_name = @route_short_name or route_id = @route_short_name
      `
      )
      const routeIds = routeIdResult.recordset.map(r => r.route_id)
      let tripIds: string[] = []
      for (const routeId of routeIds) {
        const t = await this.getKeyFromRedis<string[]>(routeId, 'route-id')
        tripIds = [...tripIds, ...t]
      }

      const trips = await Promise.all(
        tripIds.map(tripId =>
          this.getKeyFromRedis<VehiclePosition>(tripId, 'vehicle-position')
        )
      )
      const escapedTripIds = `'${tripIds.join('\', \'')}'`
      const sqlTripIdRequest = connection.get().request()
      const tripIdRequest = await sqlTripIdRequest.query<{
        trip_id: string
        direction_id: number
        trip_headsign: string
        bikes_allowed: number
        block_id: string
        route_id: string
        service_id: string
        shape_id: string
        trip_short_name: string
        wheelchair_accessible: number
      }>(`
        SELECT *
        FROM trips
        WHERE trip_id IN (${escapedTripIds})
      `)
      console.log(tripIdRequest.recordset)

      const tripIdsMap: {
        [tripId: string]: {
          trip_id: string
          direction_id: number
          trip_headsign: string
          bikes_allowed: number
          block_id: string
          route_id: string
          service_id: string
          shape_id: string
          trip_short_name: string
          wheelchair_accessible: number
        }
      } = {}
      tripIdRequest.recordset.forEach(record => {
        tripIdsMap[record.trip_id] = record
      })

      // now we return the structued data finally
      const result = trips.map(vehicle => {
        console.log(vehicle)
        console.log(tripIdsMap[vehicle.trip.tripId])
        return {
          latitude: vehicle.position.latitude,
          longitude: vehicle.position.longitude,
          bearing: vehicle.position.bearing,
          direction: tripIdsMap[vehicle.trip.tripId].direction_id,
          stopId: vehicle.stopId,
          congestionLevel: vehicle.congestionLevel,
          updatedAt: this.lastVehicleUpdate,
          trip_id: vehicle.trip.tripId,
          label: vehicle.vehicle.label,
        }
      })
      return res.send(result)
    } catch (err) {
      logger.error({ err }, 'Could not get locations from line.')
      return res.status(500).send(err)
    }
  }

  getAllVehicleLocations = async (
    req: WakaRequest<null, null>,
    res: Response
  ) => {
    const { buses, trains, lightrail, ferries } = req.query
    const { currentVehicleData, connection } = this
    if (currentVehicleData.length !== 0) {
      const tripIds = currentVehicleData.map(
        entity => entity.vehicle.trip.tripId
      )
      const escapedTripIds = `'${tripIds.join('\', \'')}'`
      try {
        const sqlTripIdRequest = connection.get().request()
        const tripIdRequest = await sqlTripIdRequest.query<{
          trip_id: string
          route_type: number
        }>(`
  select routes.route_type, trips.trip_id from trips join routes on trips.route_id = routes.route_id where trip_id in (${escapedTripIds})
  `)
        const routeTypes = tripIdRequest.recordset.map(res => ({
          trip_id: res.trip_id,
          route_type: res.route_type,
        }))
        const vehicleData = currentVehicleData
          .filter(entity => entity.vehicle.position)
          .map(entity => ({
            latitude: entity.vehicle.position.latitude,
            longitude: entity.vehicle.position.longitude,
            bearing: entity.vehicle.position.bearing,
            updatedAt: this.lastVehicleUpdate,
            trip_id: entity.vehicle.trip.tripId,
          }))
        const result: {
          route_type: number
          latitude: number
          longitude: number
          bearing: number
          updatedAt: Date
          trip_id: string
        }[] = []
        for (let i = 0; i < routeTypes.length; i++) {
          result.push({
            ...routeTypes[i],
            ...vehicleData.find(
              itmInner => itmInner.trip_id === routeTypes[i].trip_id
            ),
          })
        }

        result.filter(res => {
          switch (res.route_type) {
            case 1000:
              return ferries === 'true'
            case 400:
            case 401:
            case 2:
            case 100:
            case 106:
              return trains === 'true'
            case 900:
              return lightrail === 'true'
            case 700:
            case 712:
            case 714:
            case 3:
              return buses === 'true'
            default:
              return false
          }
        })
        return res.send(result)
      } catch (error) {
        //
      }
    } else {
      return res.sendStatus(400)
    }
  }
}

export default RealtimeAUSYD
