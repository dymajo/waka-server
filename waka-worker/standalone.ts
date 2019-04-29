import * as express from 'express'
import 'dotenv'
import * as bodyParser from 'body-parser'
import EnvMapper from '../envMapper'
import WakaWorker from './index'

const { PREFIX, VERSION, PORT } = process.env

const app = express()
app.use(bodyParser.json())
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', `waka-worker-${PREFIX}-${VERSION}`)
  next()
})
const envMapper = new EnvMapper()
const config = envMapper.fromEnvironmental(process.env)
const worker = new WakaWorker(config)
app.use(`/a/${PREFIX}`, worker.router)
app.use(worker.router)

const listener = app.listen(PORT, () => {
  worker.logger.info(
    { port: listener.address()['port'] },
    'waka-worker listening'
  )
  worker.start()
})
