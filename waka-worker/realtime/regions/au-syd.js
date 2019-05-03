const GtfsRealtimeBindings = require('gtfs-realtime-bindings')
const protobuf = require('protobufjs')
const fetch = require('node-fetch')
const request = require('request-promise-native')

const schedulePullTimeout = 20000
const scheduleLocationPullTimeout = 15000

const modes = [
  'buses',
  'ferries',
  'lightrail/innerwest',
  'lightrail/newcastle',
  'nswtrains',
  'sydneytrains',
]

class RealtimeAUSYD {
  constructor(props) {
    const { apiKey, connection, logger } = props
    this.connection = connection
    this.logger = logger
    this.apiKey = apiKey

    this.lastUpdate = null
    this.lastVehicleUpdate = null
    this.currentData = {}
    this.currentDataFails = 0
    this.currentVehicleData = {}
    this.currentVehicleDataFails = null

    this.tripUpdateOptions = {
      url: 'https://api.transport.nsw.gov.au/v1/gtfs/realtime',
      headers: {
        Authorization: apiKey,
      },
    }

    this.vehicleLocationOptions = {
      url: 'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos',
      headers: {
        Authorization: apiKey,
      },
    }

    this.schedulePull = this.schedulePull.bind(this)
    this.scheduleLocationPull = this.scheduleLocationPull.bind(this)
  }

  start() {
    const { apiKey, logger } = this
    if (!apiKey) {
      logger.warn('No TfNSW API Key, will not show realtime.')
    }
    this.schedulePull()
    this.scheduleLocationPull()
    logger.info('TfNSW Realtime Started.')
  }

  async schedulePull() {
    const { logger, tripUpdateOptions } = this
    const newData = {}
    const root = await protobuf.load('tfnsw-gtfs-realtime.proto')
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage')
    modes.forEach(async mode => {
      try {
        const res = await request(`${tripUpdateOptions.url}/${mode}`, {
          headers: tripUpdateOptions.headers,
          encoding: null,
        })
        const _feed = GtfsRealtimeBindings.FeedMessage.decode(res)

        const body = await res.arrayBuffer()
        const uInt8 = new Uint8Array(body)
        debugger
        const feed = FeedMessage.decode(uInt8)
        // const feed = GtfsRealtimeBindings.TripUpdate.decode(buffer)
        feed.entity.forEach(trip => {
          if (trip.tripUpdate) {
            newData[trip.tripUpdate.trip.tripId] = trip.tripUpdate
          }
        })
      } catch (err) {
        this.currentDataFails += 1
        logger.error({ err }, `could not get ${mode} data`)
      }
    })

    this.currentData = newData
    this.currentDataFails = 0
    this.lastUpdate = new Date()
    setTimeout(this.schedulePull, schedulePullTimeout)
  }

  async scheduleLocationPull() {
    const { logger, vehicleLocationOptions } = this
    const root = await protobuf.load('tfnsw-gtfs-realtime.proto')

    const FeedMessage = root.lookupType('transit_realtime.FeedMessage')
    const newVehicleData = { entity: [] }
    modes.forEach(async mode => {
      try {
        const res = await request({
          url: `${vehicleLocationOptions.url}/${mode}`,
          headers: vehicleLocationOptions.headers,
          encoding: null,
        })
        const _feed = GtfsRealtimeBindings.FeedMessage.decode(res)

        const feed = FeedMessage.decode(res)
        newVehicleData.entity = [...newVehicleData.entity, ...feed.entity]
      } catch (err) {
        this.currentVehicleDataFails += 1
        logger.error({ err }, `could not get ${mode} data`)
      }
    })
    this.currentVehicleData = newVehicleData
    this.currentDataVehicleFails = 0
    this.lastVehicleUpdate = new Date()
    setTimeout(this.scheduleLocationPull, scheduleLocationPullTimeout)
  }

  async getTripsEndpoint(req, res) {
    // compat with old version of api
    if (req.body.trips.constructor !== Array) {
      req.body.trips = Object.keys(req.body.trips)
    }
    const { trips, train } = req.body

    // falls back to API if we're out of date
    const data = this.getTripsCached(trips)
    res.send(data)
  }

  getTripsCached(trips) {
    // this is essentially the same function as above, but just pulls from cache
    const realtimeInfo = {}
    console.log(trips[0])
    console.log(this.currentData)
    trips.forEach(trip => {
      const data = this.currentData[trip]
      // console.log(data)

      if (typeof data !== 'undefined') {
        const timeUpdate =
          data.stopTimeUpdate.departure || data.stopTimeUpdate.arrival || {}
        realtimeInfo[trip] = {
          stop_sequence: data.stopTimeUpdate.stopSequence,
          delay: timeUpdate.delay,
          timestamp: timeUpdate.time,
          // v_id: data.vehicle.id,
        }
      }
    })

    return realtimeInfo
  }
}

module.exports = RealtimeAUSYD
