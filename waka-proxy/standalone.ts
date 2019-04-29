import * as express from 'express'
import WakaProxy from './index'
import logger from './logger'
import 'dotenv'

const app = express()
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'waka-proxy')
  next()
})
const endpoint = process.env.ENDPOINT || 'https://waka.app/a'
const proxy = new WakaProxy({ endpoint })
app.use('/a', proxy.router)
app.use(proxy.router)

const listener = app.listen(process.env.PORT || 9001, () => {
  logger.info(
    { port: listener.address().port, endpoint },
    'waka-proxy listening'
  )
  proxy.start()
})