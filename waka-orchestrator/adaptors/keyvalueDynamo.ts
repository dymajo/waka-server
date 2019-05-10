/* eslint-disable promise/prefer-await-to-callbacks */
const AWSXRay = require('aws-xray-sdk')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
import { DynamoDB } from 'aws-sdk'
import logger from '../logger'

class KeyvalueDynamo {
  name: string
  dynamo: AWS.DynamoDB
  constructor(props) {
    const { name, region } = props
    this.name = name
    this.dynamo = new AWS.DynamoDB({ region })

    this.flattenObject = this.flattenObject.bind(this)
    this.fattenObject = this.fattenObject.bind(this)
  }

  flattenObject(obj: DynamoDB.AttributeMap) {
    const { flattenObject } = this
    const response = {}
    Object.keys(obj)
      .filter(key => key !== 'id')
      .forEach(key => {
        if (obj[key].M) {
          response[key] = flattenObject(obj[key].M)
        } else if (obj[key].L) {
          // little bit of a hack to use the flatten object for lists
          response[key] = obj[key].L.map(i => flattenObject({ i }).i)
        } else {
          response[key] = parseFloat(obj[key].N) || obj[key].S
        }
      })
    return response
  }

  fattenObject(obj) {
    const { fattenObject } = this
    const response = {}
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'number') {
        response[key] = { N: obj[key].toString() }
      } else if (typeof obj[key] === 'string') {
        response[key] = { S: obj[key] }
      } else if (typeof obj[key] === 'object') {
        if (obj[key].constructor === Array) {
          // little bit of a hack to use the fatten object for lists
          response[key] = { L: obj[key].map(i => fattenObject({ i }).i) }
        } else {
          response[key] = { M: fattenObject(obj[key]) }
        }
      }
    })
    return response
  }

  async get(key: string) {
    const { name, dynamo, flattenObject } = this
    const params = {
      Key: {
        id: {
          S: key,
        },
      },
      TableName: name,
    }
    logger.debug(params)
    try {
      const result = await dynamo.getItem(params).promise()
      const response = result.Item || {}
      return flattenObject(response)
    } catch (err) {
      logger.warn({ err }, 'Could not get DynamoDB Item')
      return {}
    }
  }

  async set(key, value) {
    const { name, dynamo, fattenObject } = this
    const item = fattenObject(value)
    item.id = { S: key }
    const params = {
      Item: item,
      TableName: name,
    }
    logger.debug(params)
    return new Promise(resolve => {
      dynamo.putItem(params, err => {
        if (err) {
          logger.warn({ err }, 'Could not set DynamoDB Item')
          return resolve(false)
        }
        return resolve(true)
      })
    })
  }

  async delete(key) {
    const { name, dynamo } = this
    const params = {
      Key: {
        id: {
          S: key,
        },
      },
      TableName: name,
    }
    logger.debug(params)
    return new Promise(resolve => {
      dynamo.deleteItem(params, err => {
        if (err) {
          logger.warn({ err }, 'Could not delete DynamoDB Item')
          return resolve(false)
        }
        return resolve(true)
      })
    })
  }

  async scan() {
    const { name, dynamo } = this
    const params = {
      TableName: name,
    }
    logger.debug(params)
    return new Promise(resolve => {
      dynamo.scan(params, (err, data) => {
        if (err) {
          logger.warn({ err }, 'Could not scan DynamoDB Table')
          return resolve({})
        }
        const response = {}
        data.Items.forEach(i => {
          response[i.id.S] = this.flattenObject(i)
        })
        return resolve(response)
      })
    })
  }
}
export default KeyvalueDynamo