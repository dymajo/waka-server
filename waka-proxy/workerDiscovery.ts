import axios from 'axios'
import cityMetadata from '../cityMetadata.json'
import logger from './logger'

import AWSXRay from 'aws-xray-sdk'

class WorkerDiscovery {
  endpoint: string
  interval: NodeJS.Timeout
  responseMap: Map<
    string,
    {
      prefix: string
      bounds: {
        lat: { max: number; min: number }
        lon: { max: number; min: number }
      }
    }
  >
  constructor(props) {
    this.endpoint = props.endpoint
    this.interval = null
    this.responseMap = new Map()

    this.checkCities = this.checkCities.bind(this)
  }

  start() {
    this.checkCities()

    // don't imagine it updating more than once every minute
    clearInterval(this.interval)
    this.interval = setInterval(this.checkCities, 60000)
  }

  checkCities() {
    logger.info('checking cities')
    Object.keys(cityMetadata).forEach(prefix => this.checkCity(prefix))
  }

  async checkCity(prefix: string) {
    AWSXRay.getNamespace().run(() => {
      const segment = new AWSXRay.Segment(
        `waka-proxy${process.env.XRAY_SUFFIX || ''}`
      )
      AWSXRay.setSegment(segment)
      AWSXRay.captureAsyncFunc(`check-${prefix}`, async subsegment => {
        let response = null
        let message = null
        try {
          response = await axios.get(`${this.endpoint}/${prefix}/info`)
          this.responseMap.set(prefix, response.data)
          message = `${prefix} is available`
        } catch (err) {
          response = err.response
          this.responseMap.delete(prefix)
          message = `${prefix} is unavailable`
        }
        logger.info({ prefix, status: response.status }, message)
        subsegment.close()
      })
      segment.close()
    })
  }

  getRegionByBounds(lat: number, lon: number) {
    let region = 'nz-akl' // default
    this.responseMap.forEach(response => {
      const { prefix, bounds } = response
      if (
        lat >= bounds.lat.min &&
        lat <= bounds.lat.max &&
        lon >= bounds.lon.min &&
        lon <= bounds.lon.max
      ) {
        region = prefix
      }
    })
    return region
  }

  getRegions() {
    const availableRegions = {}
    this.responseMap.forEach(response => {
      const { prefix } = response
      const meta = cityMetadata[prefix]

      // takes a subset of the object
      const unwrap = ({
        name,
        secondaryName,
        longName,
        initialLocation,
        showInCityList,
      }) => ({
        prefix,
        name,
        secondaryName,
        longName,
        initialLocation,
        showInCityList,
      })

      if (Object.prototype.hasOwnProperty.call(meta, 'name')) {
        // this is if there is a 1-1 mapping of region to setting
        availableRegions[prefix] = unwrap(meta)
      } else {
        // this is if there are multiple cities to a region
        Object.keys(meta).forEach(
          city => (availableRegions[city] = unwrap(meta[city]))
        )
      }
    })
    return availableRegions
  }
}
export default WorkerDiscovery
