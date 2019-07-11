/* eslint-disable promise/prefer-await-to-callbacks */
import redis from 'redis'
import { TripUpdate, VehiclePosition } from '../typings'

interface RedisProps {
  prefix: string
}

class Redis {
  client: redis.RedisClient
  prefix: string
  constructor(props: RedisProps) {
    this.client = redis.createClient()
    this.prefix = props.prefix
  }

  setKeyToRedis = (
    key: string,
    value: string,
    type:
    | 'trip-update'
    | 'vehicle-position'
    | 'route-id'
    | 'last-trip-update'
    | 'last-vehicle-position'
  ) => {
    return new Promise<string>((resolve, reject) => {
      const { prefix } = this
      const fullKey = `${prefix}:${type}:${key}`

      this.client.set(fullKey, value, 'EX', 60, (err, reply) => {
        if (err) return reject(err)
        return resolve(reply)
      })
    })
  }

  getKeyFromRedis = (
    key: string,
    type:
    | 'trip-update'
    | 'vehicle-position'
    | 'route-id'
    | 'last-trip-update'
    | 'last-vehicle-position'
  ) => {
    const { prefix } = this
    switch (type) {
      case 'trip-update':
        return new Promise<TripUpdate>((resolve, reject) => {
          const fullKey = `${prefix}:${type}:${key}`
          this.client.get(fullKey, (err, reply) => {
            if (err) return reject(err)
            return resolve(JSON.parse(reply))
          })
        })
      case 'vehicle-position':
        return new Promise<VehiclePosition>((resolve, reject) => {
          const fullKey = `${prefix}:${type}:${key}`
          this.client.get(fullKey, (err, reply) => {
            if (err) return reject(err)
            return resolve(JSON.parse(reply))
          })
        })

      case 'route-id':
        return new Promise<string[]>((resolve, reject) => {
          const fullKey = `${prefix}:${type}:${key}`
          this.client.get(fullKey, (err, reply) => {
            if (err) return reject(err)
            return resolve(reply.split(','))
          })
        })
      case 'last-trip-update':
      case 'last-vehicle-position':
        return new Promise<string>((resolve, reject) => {
          const fullKey = `${prefix}:${type}:${key}`
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
