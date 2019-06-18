abstract class BaseStops {
  abstract start(): void
  abstract stop(): void
  filter?(recordset: any[], mode: string): void
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
}

export default BaseStops
