import axios from 'axios'
import { Logger } from '../../types'
import Redis from '../Redis'
import SingleEndpoint from '../SingleEndpoint'

interface WellingtonRealtimeProps {
  wakaRedis: Redis
  apiKey: string
  logger: Logger
  scheduleUpdatePullTimeout?: number
  scheduleLocationPullTimeout?: number
}

class WellingtonRealtime extends SingleEndpoint {
  constructor(props: WellingtonRealtimeProps) {
    super({
      axios: axios.create({
        baseURL: 'https://api.opendata.metlink.org.nz/v1/gtfs-rt/',
        headers: {
          'x-api-key': props.apiKey,
          Accept: 'application/x-protobuf',
        },
        responseType: 'arraybuffer',
        timeout: 5000,
      }),
      vehiclePositionEndpoint: 'vehiclepositions',
      tripUpdateEndpoint: 'tripupdates',
      serviceAlertEndpoint: 'servicealerts',
      apiKeyRequired: true,
      scheduleAlertPullTimeout: 60000,
      ...props,
    })
  }
}

export default WellingtonRealtime
