import axios from 'axios'
import { Logger } from '../../types'
import Redis from '../Redis'
import SingleEndpoint from '../SingleEndpoint'

interface ChristchurchRealtimeProps {
  wakaRedis: Redis
  logger: Logger
  apiKey: string
  scheduleUpdatePullTimeout?: number
  scheduleLocationPullTimeout?: number
}

class ChristchurchRealtime extends SingleEndpoint {
  constructor(props: ChristchurchRealtimeProps) {
    super({
      axios: axios.create({
        baseURL:
          'https://apis.metroinfo.co.nz/rti/gtfsrt/v1/',
        headers: {
          'Ocp-Apim-Subscription-Key': props.apiKey,
          Accept: 'application/x-protobuf',
        },
        responseType: 'arraybuffer',
        timeout: 5000,
      }),
      vehiclePositionEndpoint: 'vehicle-positions.pb',
      tripUpdateEndpoint: 'trip-updates.pb',
      serviceAlertEndpoint: 'service-alerts.pb',
      apiKeyRequired: true,
      scheduleAlertPullTimeout: 60000,
      ...props,
    })
  }
}

export default ChristchurchRealtime
