import Express from 'express'
import { config as _config } from 'dotenv'
import { json } from 'body-parser'
import {
  config as __config,
  plugins,
  captureHTTPsGlobal,
  setLogger,
  express,
  getNamespace,
  Segment,
  setSegment,
} from 'aws-xray-sdk'
import EnvMapper from '../envMapper'
import WakaWorker from './index'

__config([plugins.ECSPlugin])
captureHTTPsGlobal(require('http'))

_config()

const { PREFIX, VERSION, PORT } = process.env

const envMapper = new EnvMapper()
const config = envMapper.fromEnvironmental(process.env)
const worker = new WakaWorker(config)
setLogger(worker.logger)

const app = new Express()
app.use(
  express.openSegment(
    `waka-worker-${PREFIX}-${VERSION}${process.env.XRAY_SUFFIX || ''}`
  )
)
app.use(json())
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', `waka-worker-${PREFIX}-${VERSION}`)
  next()
})
app.use(`/a/${PREFIX}`, worker.router)
app.use(worker.router)

const listener = app.listen(PORT, () => {
  worker.logger.info({ port: listener.address().port }, 'waka-worker listening')
  getNamespace().run(() => {
    const segment = new Segment(
      `waka-worker-${PREFIX}-${VERSION}${process.env.XRAY_SUFFIX || ''}`
    )
    setSegment(segment)
    worker.start()
    segment.close()
  })
})

app.use(express.closeSegment())
