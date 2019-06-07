import Express from 'express'
import { json } from 'body-parser'
import {
  setLogger,
  config as _config,
  plugins,
  captureHTTPsGlobal,
  express,
} from 'aws-xray-sdk'
import logger, { info } from './logger'
import ConfigManager from './configManager'
import WakaOrchestrator from '.'

setLogger(logger)
_config([plugins.ECSPlugin])
captureHTTPsGlobal(import('http'))

const start = async () => {
  const app = new Express()
  app.use(
    express.openSegment(`waka-orchestrator${process.env.XRAY_SUFFIX || ''}`)
  )
  app.use(json())
  app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'waka-orchestrator')
    next()
  })

  const configManager = new ConfigManager()
  const config = await configManager.getConfig()
  const orchestrator = new WakaOrchestrator(config)
  app.use(orchestrator.router)
  app.use(express.closeSegment())

  const listener = app.listen(config.port, () => {
    info({ port: listener.address().port }, 'waka-orchestrator listening')
    orchestrator.start(listener.address().port)
  })
}
start()
