import { ConnectionPool, VarChar } from 'mssql'
import EnvMapper from '../envMapper'
import { DBConfig, Version, WakaConfig } from '../types'
import BaseKeyvalue from '../types/BaseKeyvalue'
import GatewayEcs from './adaptors/gatewayEcs'
import GatewayLocal from './adaptors/gatewayLocal'
import KeyvalueDynamo from './adaptors/keyvalueDynamo'
import KeyvalueLocal from './adaptors/keyvalueLocal'
import logger from './logger'

interface VersionManagerProps {
  gateway: GatewayLocal
  config: WakaConfig
}

class VersionManager {
  config: WakaConfig
  gateway: GatewayLocal | GatewayEcs
  envMapper: EnvMapper
  versions: BaseKeyvalue
  mappings: BaseKeyvalue
  constructor(props: VersionManagerProps) {
    const { gateway, config } = props
    this.config = config
    this.gateway = gateway
    this.envMapper = new EnvMapper()

    const kvPrefix = config.keyvaluePrefix
    const region = config.keyvalueRegion
    if (config.keyvalue === 'dynamo') {
      this.versions = new KeyvalueDynamo({
        name: `${kvPrefix}-versions`,
        region,
      })
      this.mappings = new KeyvalueDynamo({
        name: `${kvPrefix}-mappings`,
        region,
      })
    } else {
      this.versions = new KeyvalueLocal({ name: `${kvPrefix}-versions` })
      this.mappings = new KeyvalueLocal({ name: `${kvPrefix}-mappings` })
    }
  }

  async start() {
    logger.info('Starting Version Manager')

    // load active versions
    const mappingsTable = await this.mappings.scan()
    const mappings = Object.keys(mappingsTable)

    logger.info({ mappings }, `Found ${mappings.length} Mappings`)

    // load data for version
    await Promise.all(
      mappings.map(prefix =>
        this.updateGateway(prefix, mappingsTable[prefix].value)
      )
    )
  }

  async stop() {
    // This is never called, and it probably never should be.
    const mappingsTable = await this.mappings.scan()
    const mappings = Object.keys(mappingsTable)
    mappings.forEach(prefix => this.stopGateway(prefix))
  }

  async updateGateway(prefix, versionId) {
    const { gateway } = this

    const gatewayConfig = await this.getVersionConfig(versionId)
    logger.info({ prefix, version: gatewayConfig.version }, 'Updating Gateway')

    // We trust the gateways to handle the scheduling of new tasks / configs
    // We shouldn't have to stop the gateway or anything silly.

    await gateway.start(prefix, gatewayConfig)
  }

  recycleGateway = async (prefix: string) => {
    const { gateway } = this
    logger.info({ prefix }, 'Recycling Gateway')
    const _mapping = (await this.mappings.get(prefix)) as unknown
    const mapping = _mapping as { id: string; value: string }
    const versionId = mapping.value
    const gatewayConfig = await this.getVersionConfig(versionId)
    await gateway.recycle(prefix, gatewayConfig)
  }

  stopGateway = async (prefix: string) => {
    const { gateway } = this
    logger.info({ prefix }, 'Stopping Gateway')
    await gateway.stop(prefix)
  }

  updateMapping = async (prefix: string, versionId: string) => {
    await this.mappings.set(prefix, { value: versionId })
    await this.updateGateway(prefix, versionId)
  }

  deleteMapping = async (prefix: string) => {
    this.stopGateway(prefix)
    logger.info({ prefix }, 'Deleting Gateway')
    await this.mappings.delete(prefix)
  }

  deleteWorker = async (id: string) => {
    const { versions } = this

    const _data = (await versions.get(id)) as unknown
    const data = _data as Version

    const dbConfig: DBConfig = {
      server: data.db.server,
      user: data.db.user,
      password: data.db.password,
      database: 'master',
    }

    return new Promise((resolve, reject) => {
      logger.info(
        { server: data.db.server },
        'Opening connection to database server.'
      )
      const connection = new ConnectionPool(dbConfig, async err => {
        if (err) {
          reject(err)
        }
        try {
          const selectRequest = connection.request()
          selectRequest.input('name', VarChar(50), data.db.database)
          const databases = await selectRequest.query<{ name: string }>(
            'SELECT name FROM sys.databases WHERE name = @name'
          )
          if (databases.recordset.length === 0) {
            logger.info(
              { database: data.db.database },
              'Could not find database, will not delete.'
            )
          } else {
            // sql injection haha
            const deleteRequest = connection.request()
            await deleteRequest.query<{}>(`DROP DATABASE [${data.db.database}]`)
            logger.info({ database: data.db.database }, 'Dropped database.')
          }
          connection.close()
          logger.info(
            { server: data.db.server },
            'Closed connection to database server.'
          )

          await this.versions.delete(id)
          resolve()
        } catch (dbError) {
          reject(dbError)
        }
      })
    })
  }

  checkVersionExists = async (prefix: string, version: string) => {
    const { versions } = this
    const id = `${prefix.replace(/-/g, '_')}_${version
      .replace(/-/g, '_')
      .replace(/ /g, '_')}`
    const _data = (await versions.get(id)) as unknown
    const data = _data as Version

    return {
      id,
      exists: Object.keys(data).length > 0,
    }
  }

  addVersion = async (workerConfig: {
    prefix: string
    version: string
    shapesContainer: string
    shapesRegion: string
    dbconfig: string
    newRealtime: boolean
  }) => {
    const { config, versions } = this
    const {
      prefix,
      version,
      shapesContainer,
      shapesRegion,
      dbconfig,
      newRealtime,
    } = workerConfig

    // sanitizes the names
    const id = `${prefix.replace(/-/g, '_')}_${version
      .replace(/-/g, '_')
      .replace(/ /g, '_')}`

    let db
    try {
      db = JSON.parse(JSON.stringify(config.db[dbconfig]))
    } catch (err) {
      logger.error({ prefix }, 'No database config - could not create worker.')
      return
    }
    db.database = id

    const newConfig = {
      prefix,
      version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      shapesContainer,
      shapesRegion,
      status: 'empty',
      db,
      newRealtime,
    }
    await versions.set(id, newConfig)
  }

  getVersionConfig = async (versionId: string) => {
    const { config, versions } = this
    // the gateway needs some settings from the orchestrator,
    // but also some settings from the worker config
    const _workerConfig = (await versions.get(versionId)) as unknown
    const workerConfig = _workerConfig as Version
    const gatewayConfig = {
      prefix: workerConfig.prefix,
      version: workerConfig.version,
      storageService: config.storageService,
      shapesContainer: workerConfig.shapesContainer,
      shapesRegion: workerConfig.shapesRegion,
      status: workerConfig.status,
      api: config.api,
      newRealtime: workerConfig.newRealtime,
      redis: config.redis,
      db: {
        user: workerConfig.db.user,
        password: workerConfig.db.password,
        server: workerConfig.db.server,
        database: workerConfig.db.database,
        transactionLimit: config.transactionLimit,
        connectionTimeout: config.connectionTimeout,
        requestTimeout: config.requestTimeout,
      },
      // importer only, should be ignored
      keyvalue: config.keyvalue,
      keyvaluePrefix: config.keyvaluePrefix,
      keyvalueRegion: config.keyvalueRegion,
    }
    logger.debug({ config: gatewayConfig }, 'Gateway Config')
    return gatewayConfig
  }

  updateVersionStatus = async (versionId: string, status) => {
    // statuses:
    // empty -> pendingimport -> importing -> imported
    // empty -> pendingimport-willmap -> importing-willmap -> imported-willmap -> imported
    const { versions } = this
    const _version = (await versions.get(versionId)) as unknown
    const version = _version as Version
    version.status = status
    version.updatedAt = new Date().toISOString()
    await versions.set(versionId, version)
  }

  allVersions = () => {
    // get all versions
    return this.versions.scan()
  }

  allMappings = () => {
    // get all mappings
    return this.mappings.scan()
  }

  getDockerCommand = async (versionId: string) => {
    const config = await this.getVersionConfig(versionId)
    const env = this.envMapper.toEnvironmental(config, 'importer-local')
    const envArray = Object.keys(env).map(
      value => `${value}=${(env[value] || '').toString()}`
    )

    const command = `docker run -e "${envArray.join(
      '" -e "'
    )}" --network="container:waka-db" dymajo/waka-importer`
    return command
  }
}

export default VersionManager
