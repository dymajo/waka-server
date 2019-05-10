import { Router, Request, Response } from 'express'

import WakaProxy from '../waka-proxy'
import GatewayLocal from './adaptors/gatewayLocal'
import GatewayEcs from './adaptors/gatewayEcs'
import GatewayKubernetes from './adaptors/gatewayKubernetes'
import UpdateManager from './updaters'
import VersionManager from './versionManager'
import PrivateApi from './api'
import { IWakaConfig } from './configManager'

class WakaOrchestrator {
  config: IWakaConfig
  router: Router
  gateway: GatewayLocal // | GatewayEcs | GatewayKubernetes
  proxy: WakaProxy
  versionManager: VersionManager
  privateApi: PrivateApi
  updateManager: UpdateManager

  constructor(config: IWakaConfig) {
    const { gateway, port } = config
    this.config = config

    this.router = Router()
    if (gateway === 'local') {
      this.gateway = new GatewayLocal()
      this.proxy = new WakaProxy({ endpoint: `http://localhost:${port}` })
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

  start() {
    const { proxy, config } = this
    this.versionManager.start()
    this.updateManager.start()

    if (config.gateway === 'local') {
      proxy.start()
    }
  }

  bindRoutes() {
    const { gateway, router, privateApi, proxy, config } = this
    router.get('/ping', (req: Request, res: Response) => res.send('pong'))
    router.use('/private', privateApi.router)

    if (config.gateway === 'local') {
      router.use(gateway.router)
      router.use(proxy.router)
    } else {
      router.get('/', (req: Request, res: Response) => res.redirect('/private'))
    }
  }
}
export default WakaOrchestrator
