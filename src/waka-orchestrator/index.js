import { Router } from 'express'
import { spawn } from 'child_process'
import { join } from 'path'
import proxy from 'express-http-proxy'
import { statSync } from 'fs'

import logger from './logger'
import GatewayLocal from './adaptors/gatewayLocal'
import GatewayEcs from './adaptors/gatewayEcs'
import GatewayKubernetes from './adaptors/gatewayKubernetes'
import UpdateManager from './updaters/index'
import VersionManager from './versionManager'
import PrivateApi from './api'

const proxyPort = '9002'

class WakaOrchestrator {
  constructor(config) {
    const { gateway } = config
    this.config = config

    this.router = new Router()
    if (gateway === 'local') {
      this.gateway = new GatewayLocal()
    } else if (gateway === 'ecs') {
      this.gateway = new GatewayEcs(config.gatewayConfig.ecs)
    } else if (gateway === 'kubernetes') {
      this.gateway = new GatewayKubernetes(config.gatewayConfig.kubernetes)
    }
    const versionManager = new VersionManager({ config, gateway: this.gateway })
    this.versionManager = versionManager
    this.privateApi = new PrivateApi({ config, versionManager })
    this.updateManager = new UpdateManager({ config, versionManager })

    this.bindRoutes()
  }

  start(port) {
    const { config } = this
    this.versionManager.start()
    this.updateManager.start()

    if (config.gateway === 'local') {
      const binaryPath = join(__dirname, '../waka-go-proxy/waka-go-proxy')
      const goLogs = d => {
        const data = JSON.parse(d)
        const { msg } = data
        data.name = 'waka-go-proxy'
        delete data.msg
        delete data.level
        delete data.time
        logger.info(data, msg)
      }

      try {
        statSync(binaryPath)
        this.proxy = spawn(binaryPath, [
          '-e',
          `http://localhost:${port}`,
          '-p',
          proxyPort,
          '-f',
          join(__dirname, '../cityMetadata.json'),
        ])

        this.proxy.stdout.on('data', goLogs)
        this.proxy.stderr.on('data', goLogs)
        this.proxy.on('close', d =>
          logger.info({ code: d.toString() }, 'proxy exited')
        )
      } catch (err) {
        logger.error(
          'proxy could not start - make sure you compile with `npm run build:proxy`. some routes will not work'
        )
      }
    }
  }

  bindRoutes() {
    const { gateway, router, privateApi, config } = this
    router.get('/ping', (req, res) => res.send('pong'))
    router.use('/private', privateApi.router)

    if (config.gateway === 'local') {
      router.use(gateway.router)
      router.use(proxy(`localhost:${proxyPort}`))
    } else {
      router.get('/', (req, res) => res.redirect('/private'))
    }
  }
}
export default WakaOrchestrator
