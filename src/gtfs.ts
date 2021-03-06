export interface UpdateFeedMessage {
  entity: UpdateFeedEntity[]
  header: FeedHeader
}

export interface PositionFeedMessage {
  entity: PositionFeedEntity[]
  header: FeedHeader
}

export interface AlertFeedMessage {
  entity: AlertFeedEntity[]
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

export interface AlertFeedEntity {
  id: string
  alert: Alert
}

export interface FeedMessage {
  header: FeedHeader
  entity: FeedEntity[]
}

export interface FeedEntity {
  id: string
  isDeleted: boolean
  tripUpdate?: TripUpdate
  vehicle?: VehiclePosition
  alert?: Alert
}

export interface Alert {
  activePeriod?: TimeRange[]
  informedEntity: EntitySelector[]
  cause?: Cause
  effect?: Effect
  url?: TranslatedString
  headerText: TranslatedString
  descriptionText: TranslatedString
}

export interface TimeRange {
  start?: number
  end?: number
}

export type Cause =
  | 'UNKNOWN_CAUSE'
  | 'OTHER_CAUSE'
  | 'TECHNICAL_PROBLEM'
  | 'STRIKE'
  | 'DEMONSTRATION'
  | 'ACCIDENT'
  | 'HOLIDAY'
  | 'WEATHER'
  | 'MAINTENANCE'
  | 'CONSTRUCTION'
  | 'POLICE_ACTIVITY'
  | 'MEDICAL_EMERGENCY'

export type Effect =
  | 'NO_SERVICE'
  | 'REDUCED_SERVICE'
  | 'SIGNIFICANT_DELAYS'
  | 'DETOUR'
  | 'ADDITIONAL_SERVICE'
  | 'MODIFIED_SERVICE'
  | 'OTHER_EFFECT'
  | 'UNKNOWN_EFFECT'
  | 'STOP_MOVED'

export interface TranslatedString {
  translation: Translation
}

export interface Translation {
  text: string
  language?: string
}

export interface EntitySelector {
  agencyId?: string
  routeId?: string
  routeType?: number
  trip?: TripDescriptor
  stopId?: string
}

export interface TripUpdate {
  trip: TripDescriptor
  stopTimeUpdate?: StopTimeUpdate[]
  timestamp?: number
  vehicle?: VehicleDescriptor
  delay?: number
}

export interface StopTimeUpdate {
  departure?: StopTimeEvent
  arrival?: StopTimeEvent
  scheduleRelationship?: ScheduleRelationship
  stopId?: string
  stopSequence?: number
  '.transit_realtime.nyctStopTimeUpdate'?: NyctStopTimeUpdate
}
export interface NyctStopTimeUpdate {
  actualTrack: string
  scheduledTrack: string
}

export interface StopTimeEvent {
  delay?: number
  time?: number
  uncertainty?: number
}

export interface TripDescriptor {
  tripId: string
  routeId: string
  directionId: number
  scheduleRelationship?: ScheduleRelationship
  startDate: string
  startTime: string
  '.transit_realtime.nyctTripDescriptor'?: NyctTripDescriptor
}

export interface NyctTripDescriptor {
  direction: number
  isAssigned: boolean
  trainId: string
}

export type ScheduleRelationship =
  | 'SCHEDULED'
  | 'ADDED'
  | 'UNSCHEDULED'
  | 'CANCELED'

export interface VehicleDescriptor {
  id?: string
  label?: string
  licensePlate?: string
  '.transit_realtime.tfnswVehicleDescriptor'?: TfNSWVehicleDescriptor
  '.transit_realtime.tfnswVehicleDescriptorMnwNlr'?: TfNSWVehicleDescriptor
}

export interface TfNSWVehicleDescriptor {
  airConditioned: boolean
  performingPriorTrip: boolean
  specialVehicleAttributes: number
  vehicleModel: string
  wheelChairAccessible: string
}

export enum TfNSWSpecialVehicle {
  STA85 = 1 << 0,
  wifi = 1 << 1,
  xmas = 1 << 2,
}

export interface FeedHeader {
  gtfsRealtimeversion: string
  incrementality: number
  timestamp: number
}

export interface VehiclePosition {
  trip?: TripDescriptor
  vehicle?: VehicleDescriptor
  position?: Position
  currentStopSequence?: number
  stopId?: string
  currentStatus?: VehicleStopStatus
  timestamp?: number
  congestionLevel?: CongestionLevel
  occupancyStatus?: OccupancyStatus
  '.transit_realtime.consist': CarriageDescriptor[]
}

export interface CarriageDescriptor {
  name?: string
  positionInConsist: number
  occupancyStatus: OccupancyStatus
  quietCarriage?: boolean
  toiletStatus?: ToiletStatus
  luggageStatus?: boolean
}

export type ToiletStatus = 'NONE' | 'NORMAL' | 'ACCESSIBLE'

export type OccupancyStatus =
  | 'EMPTY'
  | 'MANY_SEATS_AVAILABLE'
  | 'FEW_SEATS_AVAILABLE'
  | 'STANDING_ROOM_ONLY'
  | 'CRUSHED_STANDING_ROOM_ONLY'
  | 'FULL'

export type CongestionLevel =
  | 'UNKNOWN_CONGESTION_LEVEL'
  | 'RUNNING_SMOOTHLY'
  | 'STOP_AND_GO'
  | 'CONGESTION'
  | 'SEVERE_CONGESTION'

export type VehicleStopStatus = 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO'

export interface Position {
  latitude: number
  longitude: number
  bearing?: number
  speed?: number
  odometer?: number
}
