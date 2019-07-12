import { pRateLimit, QuotaManager, RedisQuotaManager, Quota } from 'p-ratelimit'

import Redis from './Redis'
import createLogger from './logger'

import { isKeyof } from '../utils'
import { Logger } from '../typings'

import BaseRealtime from './BaseRealtime'

import AucklandRealtime from './regions/nz-akl'
import CanberraRealtime from './regions/au-cbr'
import SydneyRealtime from './regions/au-syd'

const Regions = {
  'au-cbr': CanberraRealtime,
  'au-syd': SydneyRealtime,
  'nz-akl': AucklandRealtime,
}

interface RealtimeConfig {
  prefix: string
  quota?: Quota
  version: string
  api: { [prefix: string]: string }
}

class Realtime {
  redis: Redis
  prefix: string
  quotaManager: QuotaManager
  rateLimiter: <T>(fn: () => Promise<T>) => Promise<T>
  region: BaseRealtime
  logger: Logger
  constructor(config: RealtimeConfig) {
    const logger = createLogger(config.prefix, config.version)
    this.logger = logger
    this.prefix = config.prefix
    this.redis = new Redis({ prefix: this.prefix })
    const quota: Quota = config.quota || {
      interval: 1000,
      rate: 5,
      concurrency: 5,
    }
    this.quotaManager = new RedisQuotaManager(
      quota,
      this.prefix,
      this.redis.client
    )
    this.rateLimiter = pRateLimit(this.quotaManager)
    const apiKey = config.api[this.prefix]
    this.region = isKeyof(Regions, this.prefix)
      ? new Regions[this.prefix]({
          redis: this.redis,
          rateLimiter: this.rateLimiter,
          logger: this.logger,
          apiKey,
        })
      : null
  }

  start = async () => {
    if (this.region) {
      await this.region.start()
    }
  }

  stop = () => {
    if (this.region) {
      this.region.stop()
    }
  }
}

export default Realtime
