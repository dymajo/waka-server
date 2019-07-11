import Protobuf from 'protobufjs'
import BaseRealtime, { BaseRealtimeProps } from './BaseRealtime'
import { PositionFeedMessage, UpdateFeedMessage } from '../typings'

export interface SingleEndpointProps extends BaseRealtimeProps {
  vehiclePositionEndpoint: string
  tripUpdateEndpoint: string
}

abstract class SingleEndpoint extends BaseRealtime {
  rateLimiter: <T>(fn: () => Promise<T>) => Promise<T>
  protobuf: protobuf.Type
  modes: string[]
  vehiclePositionEndpoint: string
  tripUpdateEndpoint: string
  constructor(props: SingleEndpointProps) {
    super(props)
    this.vehiclePositionEndpoint = props.vehiclePositionEndpoint
    this.tripUpdateEndpoint = props.tripUpdateEndpoint
  }

  start = async () => {
    const { apiKey, logger, apiKeyRequired } = this
    if (apiKeyRequired && !apiKey) {
      logger.warn('No API Key, will not show realtime.')
      throw new Error('API key is required for realtime')
    } else {
      const pb = await Protobuf.load('tfnsw-gtfs-realtime.proto')
      const FeedMessage = pb.lookupType('transit_realtime.FeedMessage')
      this.protobuf = FeedMessage
      this.scheduleUpdatePull()
      this.scheduleLocationPull()
      logger.info('Realtime Started.')
    }
  }

  stop = () => {
    const { logger } = this
    clearTimeout(this.tripUpdateTimeout)
    clearTimeout(this.vehiclePositionTimeout)
    logger.info('Realtime Stopped.')
  }

  setupProtobuf = async () => {
    if (!this.protobuf) {
      const pb = await Protobuf.load('tfnsw-gtfs-realtime.proto')
      const FeedMessage = pb.lookupType('transit_realtime.FeedMessage')
      this.protobuf = FeedMessage
    }
  }

  scheduleUpdatePull = async () => {
    const {
      logger,
      axios,
      tripUpdateEndpoint,
      redis,
      scheduleUpdatePull,
      scheduleUpdatePullTimeout,
      protobuf,
      setupProtobuf,
    } = this
    if (!protobuf) {
      await setupProtobuf()
    }
    logger.info('Starting Trip Update Pull')

    try {
      const res = await axios.get(`${tripUpdateEndpoint}`)
      const oldModified = await redis.getKeyFromRedis(
        'default',
        'last-trip-update'
      )
      if (
        res.headers['last-modified'] !== oldModified ||
        new Date().toISOString() !== oldModified
      ) {
        const uInt8 = new Uint8Array(res.data)
        const _feed = protobuf.decode(uInt8) as unknown
        const feed = _feed as UpdateFeedMessage
        for (const trip of feed.entity) {
          await redis.setKeyToRedis(
            trip.tripUpdate.trip.tripId,
            JSON.stringify(trip.tripUpdate),
            'trip-update'
          )
        }

        if (res.headers['last-modified']) {
          await redis.setKeyToRedis(
            'default',
            res.headers['last-modified'],
            'last-trip-update'
          )
        } else {
          await redis.setKeyToRedis(
            'default',
            new Date().toISOString(),
            'last-trip-update'
          )
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to pull trip updates')
    }
    logger.info('Pulled Trip Updates.')

    this.tripUpdateTimeout = setTimeout(
      scheduleUpdatePull,
      scheduleUpdatePullTimeout
    )
  }

  scheduleLocationPull = async () => {
    const {
      logger,
      axios,
      redis,
      scheduleLocationPull,
      scheduleLocationPullTimeout,
      vehiclePositionEndpoint,
      setupProtobuf,
      protobuf,
    } = this
    if (!protobuf) {
      await setupProtobuf()
    }
    logger.info('Starting Vehicle Location Pull')
    try {
      const res = await axios.get(`${vehiclePositionEndpoint}`)

      const oldModified = await redis.getKeyFromRedis(
        'default',
        'last-vehicle-position'
      )
      if (
        res.headers['last-modified'] !== oldModified ||
        new Date().toISOString() !== oldModified
      ) {
        const uInt8 = new Uint8Array(res.data)
        const _feed = protobuf.decode(uInt8) as unknown
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
            await redis.setKeyToRedis(
              trip.vehicle.trip.tripId,
              JSON.stringify(trip.vehicle),
              'vehicle-position'
            )
          }
        }

        for (const routeId in routes) {
          if (Object.prototype.hasOwnProperty.call(routes, routeId)) {
            await redis.setKeyToRedis(
              routeId,
              routes[routeId].toString(),
              'route-id'
            )
          }
        }

        if (res.headers['last-modified']) {
          await redis.setKeyToRedis(
            'default',
            res.headers['last-modified'],
            'last-vehicle-position'
          )
        } else {
          await redis.setKeyToRedis(
            'default',
            new Date().toISOString(),
            'last-vehicle-position'
          )
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to pull vehicle positions')
    }
    logger.info('Pulled Vehicle Locations')
    this.vehiclePositionTimeout = setTimeout(
      scheduleLocationPull,
      scheduleLocationPullTimeout
    )
  }
}

export default SingleEndpoint
