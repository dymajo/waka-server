const fs = require('fs')
const os = require('os')
const path = require('path')
const extract = require('extract-zip')
const fetch = require('node-fetch')
const csvparse = require('csv-parse')
const transform = require('stream-transform')
const moment = require('moment-timezone')
const logger = require('../logger.js')

class BasicUpdater {
  constructor(props) {
    const { prefix, callback, delay, interval, url } = props
    this.prefix = prefix
    this.callback = callback
    this.delay = delay || 5
    this.interval = interval || 1440
    this.url = url

    this.timeout = 0
    this.start = this.start.bind(this)
    this.check = this.check.bind(this)
    this.download = this.download.bind(this)
    this.unzip = this.unzip.bind(this)
    this.findVersion = this.findVersion.bind(this)
    this.stop = this.stop.bind(this)
  }

  async start() {
    const { prefix, check, delay, url } = this
    if (!url) {
      logger.error({ prefix }, 'URL must be supplied!')
      return
    }

    logger.info({ prefix, mins: delay }, 'Waiting to download.')
    this.timeout = setTimeout(check, delay * 60000)
  }

  async check() {
    const {
      prefix,
      callback,
      check,
      interval,
      download,
      unzip,
      findVersion,
    } = this

    try {
      const filePath = await download()
      logger.info({ prefix }, 'Downloaded file.')

      const gtfsPath = await unzip(filePath)
      logger.info({ prefix }, 'Unzipped file.')

      const version = await findVersion(gtfsPath)
      logger.info({ prefix, version: version.version }, 'Found version.')

      // TODO: revisit when we do more than just NZ
      const now = moment().tz('Pacific/Auckland')
      const start = moment(version.startDate).tz('Pacific/Auckland')
      const end = moment(version.endDate).tz('Pacific/Auckland')

      // Only adjust the mapping if we're within the correct interval
      const adjustMapping = start < now && now < end

      // callbacks are gross, but it's ideal in this scenario
      // because we want to run it on an interval
      callback(prefix, version.version, adjustMapping)
    } catch (err) {
      logger.error({ err }, 'Could not update.')
    }

    logger.info(
      { prefix, mins: interval },
      'Check complete - re-scheduled download.'
    )
    this.timeout = setTimeout(check, interval * 60000)
  }

  async download() {
    const { prefix, url } = this
    return new Promise(async (resolve, reject) => {
      const response = await fetch(url)
      const destination = path.join(os.tmpdir(), `${prefix}.zip`)
      const dest = fs.createWriteStream(destination)
      response.body.pipe(dest)
      dest.on('finish', () => resolve(destination))
      dest.on('error', reject)
    })
  }

  async unzip(zipLocation) {
    const { prefix } = this
    return new Promise((resolve, reject) => {
      const dir = path.join(os.tmpdir(), prefix)
      extract(zipLocation, { dir }, err => {
        if (err) {
          reject()
        } else {
          resolve(dir)
        }
      })
    })
  }

  async findVersion(gtfsLocation) {
    return new Promise((resolve, reject) => {
      // checks to see if the file has a feed_info.txt
      let feedLocation = 'feed_info.txt'
      try {
        fs.statSync(path.resolve(gtfsLocation, feedLocation))
      } catch (err) {
        feedLocation = 'calendar.txt'
      }

      const input = fs.createReadStream(
        path.resolve(gtfsLocation, feedLocation)
      )
      const parser = csvparse({ delimiter: ',' })

      let headers = null
      const transformer = transform((row, callback) => {
        if (!headers) {
          headers = row
          callback()
        } else if (feedLocation === 'feed_info.txt') {
          resolve({
            version: row[headers.indexOf('feed_version')],
            startDate: row[headers.indexOf('feed_start_date')],
            endDate: row[headers.indexOf('feed_end_date')],
          })
          transformer.end()
        } else if (feedLocation === 'calendar.txt') {
          // if there's no feed info, just use the start_date + end_date as the name
          resolve({
            version:
              row[headers.indexOf('start_date')] +
              row[headers.indexOf('end_date')],
            startDate: row[headers.indexOf('start_date')],
            endDate: row[headers.indexOf('end_date')],
          })
          transformer.end()
        }
      })
      transformer.on('error', reject)
      input.pipe(parser).pipe(transformer)
    })
  }

  stop() {
    const { prefix } = this
    logger.info({ prefix }, 'Stopped updater.')
    clearTimeout(this.timeout)
  }
}
module.exports = BasicUpdater
