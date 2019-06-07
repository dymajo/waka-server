import Express from 'express'
import * as bodyParser from 'body-parser'
import * as morgan from 'morgan'
import AWSXRay from 'aws-xray-sdk'

import ConfigManager from './configManager'
import WakaOrchestrator from '.'
import logger from './logger'

AWSXRay.setLogger(logger)
AWSXRay.config([AWSXRay.plugins.ECSPlugin])
AWSXRay.captureHTTPsGlobal(require('http'))

const start = async () => {
  const app = Express()
  app.use(
    AWSXRay.express.openSegment(
      `waka-orchestrator${process.env.XRAY_SUFFIX || ''}`
    )
  )
  app.use(bodyParser.json())
  app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'waka-orchestrator')
    next()
  })

  const configManager = new ConfigManager()
  const config = await configManager.getConfig()
  const orchestrator = new WakaOrchestrator(config)
  app.use(orchestrator.router)
  app.use(AWSXRay.express.closeSegment())
  const listener = app.listen(config.port, () => {
    logger.info(
      { port: listener.address().port },
      'waka-orchestrator listening'
    )
    orchestrator.start(listener.address().port)
  })
}
start()
