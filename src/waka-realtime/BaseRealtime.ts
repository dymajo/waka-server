import { AxiosInstance } from 'axios'
import Redis from './Redis'
import { Logger } from '../typings'

export interface BaseRealtimeProps {
  redis: Redis
  apiKey: string
  logger: Logger
  axios: AxiosInstance
  scheduleUpdatePullTimeout?: number
  scheduleLocationPullTimeout?: number
  apiKeyRequired?: boolean
}

export default abstract class BaseRealtime {
  vehiclePositionTimeout: NodeJS.Timer
  tripUpdateTimeout: NodeJS.Timer
  scheduleUpdatePullTimeout: number
  scheduleLocationPullTimeout: number
  redis: Redis
  apiKey: string
  logger: Logger
  axios: AxiosInstance
  apiKeyRequired: boolean
  abstract start(): void
  abstract stop(): void
  constructor(props: BaseRealtimeProps) {
    this.redis = props.redis
    this.apiKey = props.apiKey
    this.logger = props.logger
    this.axios = props.axios
    this.scheduleUpdatePullTimeout = props.scheduleUpdatePullTimeout || 15000
    this.scheduleLocationPullTimeout =
      props.scheduleLocationPullTimeout || 15000
    this.apiKeyRequired = props.apiKeyRequired || false
  }
}
