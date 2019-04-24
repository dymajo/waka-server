import Express from 'express'
import 'dotenv'
import bodyParser from 'body-parser'
import EnvMapper from '../envMapper'
import WakaWorker from './index'

const { PREFIX, VERSION, PORT } = process.env

const app = new Express()
app.use(bodyParser.json())
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', `waka-worker-${PREFIX}-${VERSION}`)
  next()
})
const envMapper = new EnvMapper()
const config = envMapper.fromEnvironmental(process.env)
const worker = new WakaWorker(config)
app.use(worker.router)

const listener = app.listen(PORT, () => {
  worker.logger.info({ port: listener.address().port }, 'waka-worker listening')
  worker.start()
})
