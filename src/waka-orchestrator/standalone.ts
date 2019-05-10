import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as morgan from 'morgan'
import ConfigManager from './configManager'
import WakaOrchestrator from './index'
import logger from './logger'
import AWSXRay from 'aws-xray-sdk'

AWSXRay.setLogger(logger)
AWSXRay.config([AWSXRay.plugins.ECSPlugin])
AWSXRay.captureHTTPsGlobal(require('http'))

const start = async () => {
  const app = express()
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
    // find out why there is a bug

    logger.info(
      { port: listener.address()['port'] },
      'waka-orchestrator listening'
    )
    AWSXRay.getNamespace().run(() => {
      const segment = new AWSXRay.Segment(
        `waka-orchestrator${process.env.XRAY_SUFFIX || ''}`
      )
      AWSXRay.setSegment(segment)
      orchestrator.start()
      segment.close()
    })
  })
}
start()
