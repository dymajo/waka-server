/* eslint-disable promise/prefer-await-to-callbacks */
import redis from 'redis'
import { TripUpdate, VehiclePosition, Alert } from '../gtfs'

interface RedisProps {
  prefix: string
  redis?: redis.RedisClient
}

class Redis {
  client: redis.RedisClient
  prefix: string
  constructor(props: RedisProps) {
    this.client = props.redis || redis.createClient()
    this.prefix = props.prefix
  }

  setKey = (
    key: string,
    value: string,
    type:
      | 'trip-update'
      | 'vehicle-position'
      | 'alert'
      | 'alert-route'
      | 'alert-route-type'
      | 'alert-route'
      | 'alert-trip'
      | 'alert-stop'
      | 'vehicle-position-route'
      | 'last-trip-update'
      | 'last-vehicle-position-update'
      | 'last-alert-update'
  ) => {
    return new Promise<string>((resolve, reject) => {
      const { prefix } = this
      const fullKey = `waka-rt:${prefix}:${type}:${key}`

      this.client.set(fullKey, value, 'EX', 60, (err, reply) => {
        if (err) return reject(err)
        return resolve(reply)
      })
    })
  }

  getTripUpdate = (tripId: string) => {
    const { prefix } = this
    return new Promise<TripUpdate>((resolve, reject) => {
      const fullKey = `waka-rt:${prefix}:trip-update:${tripId}`
      this.client.get(fullKey, (err, reply) => {
        if (err) return reject(err)
        return resolve(JSON.parse(reply))
      })
    })
  }

  getVehiclePosition = (tripId: string) => {
    const { prefix } = this
    return new Promise<VehiclePosition>((resolve, reject) => {
      const fullKey = `waka-rt:${prefix}:vehicle-position:${tripId}`
      this.client.get(fullKey, (err, reply) => {
        if (err) return reject(err)
        return resolve(JSON.parse(reply))
      })
    })
  }

  getAlert = (alertId: string) => {
    const { prefix } = this
    return new Promise<Alert>((resolve, reject) => {
      const fullKey = `waka-rt:${prefix}:alert:${alertId}`
      this.client.get(fullKey, (err, reply) => {
        if (err) return reject(err)
        return resolve(JSON.parse(reply))
      })
    })
  }

  getKey = (
    key: string,
    type:
      | 'alert-route'
      | 'alert-route-type'
      | 'alert-trip'
      | 'alert-stop'
      | 'vehicle-position-route'
      | 'last-trip-update'
      | 'last-vehicle-position-update'
      | 'last-alert-update'
  ) => {
    const { prefix } = this
    switch (type) {
      case 'vehicle-position-route':
      case 'alert-route':
      case 'alert-route-type':
      case 'alert-trip':
      case 'alert-stop':
        return new Promise<string[]>((resolve, reject) => {
          const fullKey = `waka-rt:${prefix}:${type}:${key}`
          this.client.get(fullKey, (err, reply) => {
            if (err) return reject(err)
            if (reply) {
              return resolve(reply.split(','))
            }
            return resolve([])
          })
        })
      case 'last-trip-update':
      case 'last-vehicle-position-update':
      case 'last-alert-update':
        return new Promise<string>((resolve, reject) => {
          const fullKey = `waka-rt:${prefix}:${type}:${key}`
          this.client.get(fullKey, (err, reply) => {
            if (err) return reject(err)
            return resolve(reply)
          })
        })
      default:
        throw Error('unknown type')
    }
  }
}

export default Redis
