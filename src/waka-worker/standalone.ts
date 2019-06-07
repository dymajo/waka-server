import * as express from 'express'
import 'dotenv'
import * as bodyParser from 'body-parser'
import EnvMapper from '../envMapper'
import WakaWorker from '.'
import AWSXRay from 'aws-xray-sdk'

AWSXRay.config([AWSXRay.plugins.ECSPlugin])
AWSXRay.captureHTTPsGlobal(require('http'))

const { PREFIX, VERSION, PORT } = process.env

const envMapper = new EnvMapper()
const config = envMapper.fromEnvironmental(process.env)
const worker = new WakaWorker(config)
AWSXRay.setLogger(worker.logger)

const app = express()
app.use(
  AWSXRay.express.openSegment(
    `waka-worker-${PREFIX}-${VERSION}${process.env.XRAY_SUFFIX || ''}`
  )
)
app.use(bodyParser.json())
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', `waka-worker-${PREFIX}-${VERSION}`)
  next()
})

app.use(`/a/${PREFIX}`, worker.router)
app.use(worker.router)

const listener = app.listen(PORT, () => {
  worker.logger.info(
    { port: listener.address()['port'] },
    'waka-worker listening'
  )
  AWSXRay.getNamespace().run(() => {
    const segment = new AWSXRay.Segment(
      `waka-worker-${PREFIX}-${VERSION}${process.env.XRAY_SUFFIX || ''}`
    )
    AWSXRay.setSegment(segment)
    worker.start()
    segment.close()
  })
})

app.use(AWSXRay.express.closeSegment())
