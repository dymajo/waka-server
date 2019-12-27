import logger from '../logger'
import { KubeConfig, BatchV1Api } from '@kubernetes/client-node'
import { EnvironmentImporterConfig } from '../../typings'
import { SecretsManager } from 'aws-sdk'

class Kubernetes {
  namespace: string
  image: string
  secret: String

  constructor(config) {
    logger.info('Using Kubernetes Importer')

    this.namespace = config.namespace || 'default'
    this.image = config.image || 'dymajo/waka-importer:latest'
    this.secret = config.secret || 'waka-importer-prod-aws'
  }

  async startTask(env: EnvironmentImporterConfig) {
    const { namespace, image, secret } = this
    const prefix = env.PREFIX
    const version = env.VERSION

    logger.info({ prefix, version }, 'Starting Kubernetes Job')

    const kc = new KubeConfig()
    kc.loadFromDefault()
    const k8sApi = kc.makeApiClient(BatchV1Api)

    // regex is to make it DNS-1123 compliant
    const jobName = `waka-importer-${prefix}-${version
      .replace(/[_\. ]/g, '-')
      .toLowerCase()}`

    const k8sEnvironment = Object.keys(env).map(name => ({
      name,
      value: (env[name] || '').toString(),
      valueFrom: undefined,
    }))

    // gross way of doing cross cloud
    const secrets = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    secrets.forEach(key => {
      k8sEnvironment.push({
        name: key,
        value: undefined,
        valueFrom: {
          secretKeyRef: {
            name: secret,
            key,
          }
        }
      })
    })
     
    try {
      await k8sApi.createNamespacedJob(namespace, {
        metadata: {
          name: jobName,
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'waka-importer',
                  image,
                  env: k8sEnvironment,
                },
              ],
              restartPolicy: 'Never',
            },
          },
        },
      })
      logger.info({ prefix, version, jobName, namespace }, 'Job created.')
    } catch (error) {
      if (error.response.statusCode === 409) {
        logger.warn(
          { prefix, version, jobName, namespace },
          'Job already exists.'
        )
      } else {
        logger.error(
          { prefix, version, jobName, namespace, error },
          'Could not create job.'
        )
      }
    }
  }
}
export default Kubernetes
