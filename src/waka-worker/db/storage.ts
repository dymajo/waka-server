import * as fs from 'fs'
import * as azure from 'azure-storage'
import AWSXRay from 'aws-xray-sdk'
import axios from 'axios'
const AWS = AWSXRay.captureAWS(require('aws-sdk'))

const azuretestcreds = [
  'devstoreaccount1',
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
  'http://127.0.0.1:10000/devstoreaccount1',
]

class Storage {
  backing: string
  blobSvc: any
  s3: AWS.S3
  constructor(props: {
    backing: 'aws' | 'local'
    local: boolean
    endpoint: string
    region: string
  }) {
    this.backing = props.backing
    if (this.backing === 'azure') {
      // const creds = props.local ? azuretestcreds : []
      // this.blobSvc = azure.createBlobService(...creds)
    }
    if (this.backing === 'aws') {
      this.s3 = new AWS.S3({
        endpoint: props.endpoint,
        region: props.region,
      })
    }
    if (this.backing === 'local') {
    }
  }

  createContainer(container, cb) {
    const createCb = function(error) {
      if (error) {
        console.error(error)
        throw error
      }
      cb()
    }
    if (this.backing === 'azure') {
      this.blobSvc.createContainerIfNotExists(container, createCb)
    } else if (this.backing === 'aws') {
      const params = {
        Bucket: container,
      }
      this.s3.createBucket(params, createCb)
    }
  }

  async downloadStream(container, file, stream, callback) {
    if (this.backing === 'azure') {
      return this.blobSvc.getBlobToStream(container, file, stream, callback)
    }
    if (this.backing === 'aws') {
      const params = {
        Bucket: container,
        Key: file,
      }
      return this.s3
        .getObject(params)
        .createReadStream()
        .on('error', err => {
          if (err.code !== 'NoSuchKey') {
            console.error(err)
          }
          callback(err)
        })
        .on('end', data => callback(null, data)) // do nothing, but this prevents from crashing
        .pipe(stream)
    }
    if (this.backing === 'local') {
      const res = await axios.get(`http://localhost:9004/${file}`, {
        responseType: 'stream',
      })
      return res.data.pipe(stream)
      // return res.data
    }
  }

  uploadFile(container, file, sourcePath, callback) {
    if (this.backing === 'azure') {
      return this.blobSvc.createBlockBlobFromLocalFile(
        container,
        file,
        sourcePath,
        callback
      )
    }
    if (this.backing === 'aws') {
      const params = {
        Body: fs.createReadStream(sourcePath),
        Bucket: container,
        Key: file,
      }
      return this.s3.putObject(params, callback)
    }
  }
}
export default Storage
