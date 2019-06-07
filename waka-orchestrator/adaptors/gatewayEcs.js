/* eslint-disable promise/prefer-await-to-callbacks */

import { captureAWS } from 'aws-xray-sdk'
const AWS = captureAWS(import('aws-sdk'))
import { warn, error, info, debug } from '../logger.js'
import EnvMapper from '../../envMapper.js'

const envConvert = env =>
  JSON.stringify(env.map(e => `${e.name}|${e.value}`).sort())

class GatewayEcs {
  constructor(config) {
    const { cluster, region, servicePrefix, serviceSuffix, replicas } = config
    this.servicePrefix = servicePrefix || ''
    this.serviceSuffix = serviceSuffix || ''
    this.replicas = replicas || 1
    this.envMapper = new EnvMapper()

    if (!(region && cluster)) {
      warn('Cannot use ECS Gateway - Missing Config.')
      return
    }

    this.ecs = new AWS.ECS({ region, params: { cluster } })
  }

  async start(prefix, config) {
    const { ecs, servicePrefix, serviceSuffix, replicas } = this
    if (!ecs) {
      error({ prefix }, 'Cannot start ECS Service - not configured.')
      return
    }
    info({ prefix }, 'Starting ECS Service')

    // makes config docker friendly
    const env = this.envMapper.toEnvironmental(config, 'worker')
    const envArray = Object.keys(env).map(name => ({
      name,
      value: (env[name] || '').toString(),
    }))
    debug({ prefix, env }, 'Environmental Variables')
    const serviceName = `${servicePrefix}${prefix}${serviceSuffix}`

    try {
      // describe service
      const services = await ecs
        .describeServices({ services: [serviceName] })
        .promise()

      debug({ prefix, services }, 'Service Info')
      const service = services.services[0]

      // describe task definition
      const taskDefinitionArn = service.taskDefinition.split(':')
      // removes the version qualifer to get latest
      taskDefinitionArn.splice(-1)
      const taskDefinition = await ecs
        .describeTaskDefinition({
          taskDefinition: taskDefinitionArn.join(':'),
        })
        .promise()
      let newTaskDefinitionArn = taskDefinition.taskDefinition.taskDefinitionArn
      debug({ prefix, taskDefinition }, 'Task Definition Info')

      // determine if task definitions needs update
      const containerDefinition =
        taskDefinition.taskDefinition.containerDefinitions[0]

      // in theory, if terraform revises the memory or cpu
      // it's going to leave the environment variables clean
      // so this should still pick up changes.
      if (
        envConvert(envArray) === envConvert(containerDefinition.environment)
      ) {
        info({ prefix }, 'Environmental variables have not changed.')
      } else {
        info(
          { prefix },
          'Environmental variables have changed - updating task definition.'
        )

        // update task defintion - new envs
        // delete keys that fail validation
        containerDefinition.environment = envArray
        delete taskDefinition.taskDefinition.compatibilities
        delete taskDefinition.taskDefinition.requiresAttributes
        delete taskDefinition.taskDefinition.revision
        delete taskDefinition.taskDefinition.status
        delete taskDefinition.taskDefinition.taskDefinitionArn

        const newTaskDefinition = await ecs
          .registerTaskDefinition(taskDefinition.taskDefinition)
          .promise()
        newTaskDefinitionArn =
          newTaskDefinition.taskDefinition.taskDefinitionArn
        info({ prefix, newTaskDefinitionArn }, 'Task defintion updated.')
      }

      // update service if needed - logging
      if (service.taskDefinition !== newTaskDefinitionArn) {
        info({ prefix }, 'New Task Definition - updating service.')
      }
      if (service.desiredCount !== replicas) {
        info(
          {
            prefix,
            wantedReplicas: replicas,
            actualReplicas: service.desiredCount,
          },
          'Service desired count does not match configuration - updating service.'
        )
      }

      // update service if needed
      if (
        service.taskDefinition !== newTaskDefinitionArn ||
        service.desiredCount !== replicas
      ) {
        await ecs
          .updateService({
            service: service.serviceName,
            taskDefinition: newTaskDefinitionArn,
            desiredCount: replicas,
          })
          .promise()
        info({ prefix, service: service.serviceName }, 'ECS service updated.')
      } else {
        info({ prefix, service: service.serviceName }, 'No updates required.')
      }

      // done
      // wow. just realized this is the same logic as a powershell script I wrote
      // that allows Octopus Deploy to deploy to ECS
    } catch (err) {
      error({ err, serviceName }, 'Could not start ECS Service.')
    }
  }

  async recycle(prefix) {
    const { ecs, servicePrefix, serviceSuffix, replicas } = this
    const serviceName = `${servicePrefix}${prefix}${serviceSuffix}`

    await ecs.updateService({
      service: serviceName,
      forceNewDeployment: true,
      desiredCount: replicas,
    })
    info({ prefix, service: serviceName }, 'ECS Service Updated')
  }

  async stop(prefix) {
    const { ecs, servicePrefix, serviceSuffix } = this
    if (!ecs) {
      error({ prefix }, 'Cannot stop ECS Service - not configured.')
      return
    }
    const serviceName = `${servicePrefix}${prefix}${serviceSuffix}`
    info({ prefix, service: serviceName }, 'Scaling ECS Worker Service to 0.')

    // scale service to 0
    await ecs
      .updateService({
        service: serviceName,
        desiredCount: 0,
      })
      .promise()
    info({ prefix, service: serviceName }, 'ECS service stopped.')

    // done
  }
}
export default GatewayEcs
