import { AklTimes, Logger } from '../types'

export interface BaseStopsProps {
  logger: Logger
  apiKey?: string
}

export default abstract class BaseStops {
  logger: Logger
  apiKey?: string
  constructor(props: BaseStopsProps) {
    this.logger = props.logger
    this.apiKey = props.apiKey
  }
  badStops?: string[]
  abstract start(): void
  abstract stop(): void
  getSingle?(
    code: string
  ): {
    stop_id: string
    stop_lat: number
    stop_lon: number
    stop_lng: number
    stop_region: string
    route_type: number
    stop_name: string
    description: string
    timestamp: Date
    availableSpaces: number
    maxSpaces: number
  }
  filter?(
    recordset: {
      stop_id: string
    }[],
    mode?: string
  ): {
    stop_id: string
  }[]
  extraSources?(
    lat: number,
    lon: number,
    dist: number
  ): Promise<
    {
      stop_id: string
      stop_lat: number
      stop_lon: number
      stop_lng: number
      stop_region: string
      route_type: number
      stop_name: string
      description: string
      timestamp: Date
      availableSpaces: number
      maxSpaces: number
    }[]
  >
  getTimes?: (code: string) => AklTimes | null
}
