import logger from './logger'
import KeyvalueLocal from './adaptors/keyvalueLocal'
import KeyvalueDynamo from './adaptors/keyvalueDynamo'
import BaseKeyvalue from './adaptors/BaseKeyvalue'

export interface WakaConfig {
  port: number
  gateway: string
  keyvalue: string
  keyvaluePrefix: string
  keyvalueRegion: string
  storageService: string
  connectionTimeout: number
  requestTimeout: number
  transactionLimit: number
  api: {
    [api: string]: string
  }
  db: {
    [dbConfig: string]: DBConfig
  }
  updaters: {
    [updater: string]: {
      delay: number
      prefix: string
      dbconfig: string
      interval: number
      shapesContainer: string
      type: string
      shapesRegion: string
      url: string
      extended: boolean
    }
  }
  gatewayConfig?: {
    ecs: EcsGatewayConfig
  }
}

export interface WorkerConfig {
  prefix: string
  version: string
  db: DBConfig
  api: string
  storageService: string
  shapesContainer: string
  shapesRegion: string
}

export interface EcsGatewayConfig {
  cluster: string
  region: string
  servicePrefix: string
  serviceSuffix: string
  replicas: number
}

export interface DBConfig {
  server: string
  user: string
  password: string
}

declare const process: {
  env: {
    PORT: string
    GATEWAY: string
    KEYVALUE: string
    KEYVALUE_PREFIX: string
    KEYVALUE_REGION: string
    STORAGE_SERVICE: 'aws' | 'local'
  }
}

class ConfigManager {
  config: WakaConfig
  meta: BaseKeyvalue

  constructor() {
    const config = {
      port: Number.parseInt(process.env.PORT, 10) || 9001,
      gateway: process.env.GATEWAY || 'local',
      keyvalue: process.env.KEYVALUE || 'local',
      keyvaluePrefix: process.env.KEYVALUE_PREFIX || 'waka',
      keyvalueRegion: process.env.KEYVALUE_REGION || 'us-west-2',
      storageService: process.env.STORAGE_SERVICE || 'aws',
      transactionLimit: 50000,
      connectionTimeout: 60000,
      requestTimeout: 60000,

      api: {
        'nz-akl': null, // dev-portal.at.govt.nz
        'agenda-21': null, // ask @DowntownCarpark on Twitter
        'au-syd': null, // opendata.transport.nsw.gov.au
      },
      db: {
        local: {
          server: 'localhost',
          user: 'SA',
          password: 'Str0ngPassword',
        },
      },
      updaters: {
        'nz-akl': null,
        'nz-wlg': null,
        'au-syd': null,
      },
      importer: {},
      gatewayConfig: {
        // local doesn't need config
        ecs: {},
        kubernetes: {},
      },
    }
    this.config = config

    const kvPrefix = config.keyvaluePrefix
    if (config.keyvalue === 'dynamo') {
      this.meta = new KeyvalueDynamo({
        name: `${kvPrefix}-meta`,
        region: config.keyvalueRegion,
      })
    } else {
      this.meta = new KeyvalueLocal({
        name: `${kvPrefix}-meta`,
      })
    }
  }

  async getConfig() {
    const localConfig = this.config
    const _remoteConfig = (await this.meta.get('config')) as unknown
    const remoteConfig = _remoteConfig as {
      api: { 'agenda-21': string; 'au-syd': string; 'nz-akl': string }
      db: {
        connectionTimeoutNumber: number
        requestTimeoutNumber: number
        transactionLimitNumber: number
        uat: {
          passwordString: string
          serverString: string
          userString: string
        }
      }
    }
    const mergedConfig = Object.assign(localConfig, remoteConfig)
    logger.info('Configuration retrieved from remote.')
    return mergedConfig
  }
}
export default ConfigManager
