const AWSXRay = require('aws-xray-sdk')
const fs = require('fs')
const azuretestcreds = [
  'devstoreaccount1',
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
  'http://127.0.0.1:10000/devstoreaccount1',
]

class Storage {
  constructor(props) {
    this.backing = props.backing
    if (this.backing === 'azure') {
      const azure = require('azure-storage')
      const creds = props.local ? azuretestcreds : []
      this.blobSvc = azure.createBlobService(...creds)
    } else if (this.backing === 'aws') {
      const AWS = AWSXRay.captureAWS(require('aws-sdk'))
      this.s3 = new AWS.S3({
        endpoint: props.endpoint,
        region: props.region,
      })
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
  downloadStream(container, file, stream, callback) {
    if (this.backing === 'azure') {
      return this.blobSvc.getBlobToStream(container, file, stream, callback)
    } else if (this.backing === 'aws') {
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
  }
  uploadFile(container, file, sourcePath, callback) {
    if (this.backing === 'azure') {
      return this.blobSvc.createBlockBlobFromLocalFile(
        container,
        file,
        sourcePath,
        callback
      )
    } else if (this.backing === 'aws') {
      const params = {
        Body: fs.createReadStream(sourcePath),
        Bucket: container,
        Key: file,
      }
      return this.s3.putObject(params, callback)
    }
  }
}
module.exports = Storage
