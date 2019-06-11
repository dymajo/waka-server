import Long from 'long'
import * as Logger from 'bunyan'
import { Request, Response } from 'express'
import { config as SqlConfig } from 'mssql'
import Connection from './waka-worker/db/connection'
import GatewayLocal from './waka-orchestrator/adaptors/gatewayLocal'

export interface WakaConfig {
  port: number
  gateway: string
  keyvalue: string
  keyvaluePrefix: string
  keyvalueRegion: string
  storageService: string
  connectionTimeout: number
  requestTimeout: number
  transactionLimit: number
  api: {
    [api: string]: string
  }
  db: {
    [dbConfig: string]: DBConfig
  }
  updaters: {
    [updater: string]: {
      delay: number
      prefix: string
      dbconfig: string
      interval: number
      shapesContainer: string
      type: string
      shapesRegion: string
      url: string
      extended: boolean
    }
  }
  gatewayConfig?: {
    ecs: EcsGatewayConfig
  }
}

export interface WorkerConfig {
  prefix: string
  version: string
  db: DBConfig
  api: string
  storageService: string
  shapesContainer: string
  shapesRegion: string
}

export interface EcsGatewayConfig {
  cluster: string
  region: string
  servicePrefix: string
  serviceSuffix: string
  replicas: number
}

export interface DBConfig extends SqlConfig {
  server: string
  user: string
  password: string
}

export interface EnvironmentConfig {
  PREFIX: string
  VERSION: string
  DB_DATABASE: string
  DB_USER: string
  DB_PASSWORD: string
  DB_SERVER: string
  DB_TRANSACTION_LIMIT: string
  DB_CONNECTION_TIMEOUT: string
  DB_REQUEST_TIMEOUT: string
  STORAGE_SERVICE: string
  SHAPES_CONTAINER: string
  SHAPES_REGION: string
  SHAPES_SKIP: string
}

export interface EnvironmentImporterConfig extends EnvironmentConfig {
  KEYVALUE: string
  KEYVALUE_VERSION_TABLE: string
  KEYVALUE_REGION: string
}

export interface EnvironmentWorkerConfig extends EnvironmentConfig {
  AT_API_KEY: string
  AGENDA21_API_KEY: string
}

export abstract class BaseKeyvalue {
  public name: string

  abstract get(key: string): Promise<any>

  abstract set(key: string, value: any): Promise<boolean>

  abstract scan(): Promise<any>
}

export abstract class BaseRealtime {
  connection: Connection
  logger: Logger
  scheduleLocationPull?(): Promise<void>
  schedulePull?(): Promise<void>
  abstract start(): void
}

export abstract class BaseLines {
  getColors: any
  abstract start(): void
  logger: Logger
  connection: Connection
  dataAccess: any
  lineIcons: any
  lineColors: any
  allLines: any
  lineGroups: any
  lineOperators: any
  friendlyNames: any
}

export abstract class BaseGateway {
  abstract start(prefix: string, config: WorkerConfig): Promise<void>
  abstract recycle(prefix: string, config: WorkerConfig): Promise<void>
  abstract stop(prefix: string): Promise<void>
}

export interface UpdateFeedMessage {
  entity: UpdateFeedEntity[]
  header: FeedHeader
}

export interface PositionFeedMessage {
  entity: PositionFeedEntity[]
  header: FeedHeader
}

export interface PositionFeedEntity {
  id: string
  vehicle: VehiclePosition
}

export interface UpdateFeedEntity {
  id: string
  tripUpdate: TripUpdate
}

export interface TripUpdate {
  stopTimeUpdate: StopTimeUpdate[]
  timestamp: Long
  trip: TripDescriptor
  vehicle: VehicleDescriptor
}

export interface StopTimeUpdate {
  departure: StopTimeEvent
  scheduleRelationship: number
  stopId: string
  stopSequence: number
}

export interface StopTimeEvent {
  delay: number
  time: Long
}

export interface TripDescriptor {
  routeId: string
  scheduleRelationship: number
  startDate: string
  startTime: string
  tripId: string
}

export interface VehicleDescriptor {
  id: string
  label: string
  licensePlate: string
}

export interface FeedHeader {
  gtfsRealtimeversion: string
  incrementality: number
  timestamp: Long
}

export interface VehiclePosition {
  congestionLevel: number
  position: {
    latitude: number
    longitude: number
    bearing?: number
    speed?: number
  }
  stopId: string
  timestamp: Long
  trip: TripDescriptor
  vehicle: VehicleDescriptor
}

export interface TfNSWUpdaterProps {
  apiKey: string
  callback: any
  delay: number
  interval: number
}

export interface AklTimes {
  provider: string
  trips: undefined[]
  availableSpaces?: number
  maxSpaces?: number
  html?: string
}

export interface StopsDataAccessProps {
  connection: Connection
  prefix: string
}

export interface RealtimeNZWLGProps {
  connection: Connection
  logger: Logger
}
export interface RealtimeNZAKLProps {
  connection: Connection
  logger: Logger
  apiKey: string
}

export interface LinesAUSYDProps {
  logger: Logger
  connection: Connection
}

export interface VersionManagerProps {
  gateway: GatewayLocal
  config: WakaConfig
}

export interface LinesNZAKLProps {
  connection: Connection
  logger: Logger
}

export type WakaParams<T> = T
export type WakaBody<T> = T

export interface WakaRequest<WakaBody, WakaParams> extends Request {
  body: WakaBody
  params: WakaParams
}

declare const process: {
  env: {
    PORT: string
    GATEWAY: string
    KEYVALUE: string
    KEYVALUE_PREFIX: string
    KEYVALUE_REGION: string
    STORAGE_SERVICE: 'aws' | 'local'
  }
}
