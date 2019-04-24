import { Router } from 'express'
import logger from '../logger'
import WakaWorker from '../../waka-worker/index'

class GatewayLocal {
  constructor() {
    this.router = new Router()
    this.workers = {}
  }

  start(prefix, config) {
    const { router, workers } = this
    const oldWorker = workers[prefix]
    const newWorker = new WakaWorker(config)
    if (oldWorker !== undefined) {
      logger.info(
        { prefix },
        'Route has already been bound - stopping old route.'
      )
      oldWorker.stop()
    }
    workers[prefix] = newWorker
    newWorker.start()
    logger.info({ prefix }, 'Local Gateway Started.')

    if (oldWorker === undefined) {
      router.use(`/${prefix}`, (req, res, next) => {
        if (workers[prefix]) {
          workers[prefix].router(req, res, next)
        } else {
          next()
        }
      })
    }
  }

  stop(prefix) {
    const { workers } = this
    delete workers[prefix]
    logger.info({ prefix }, 'Local Gateway Stopped.')
  }
}
export default GatewayLocal
