import Long from 'long'
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
