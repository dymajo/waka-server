import Express from 'express'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import ConfigManager from './configManager'
import WakaOrchestrator from './index'
import logger from './logger'

const start = async () => {
  const app = new Express()
  app.use(bodyParser.json())
  app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'waka-orchestrator')
    next()
  })

  const configManager = new ConfigManager()
  const config = await configManager.getConfig()
  const orchestrator = new WakaOrchestrator(config)
  app.use(orchestrator.router)

  const listener = app.listen(config.port, () => {
    logger.info(
      { port: listener.address().port },
      'waka-orchestrator listening'
    )
    orchestrator.start()
  })
}
start()
