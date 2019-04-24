import 'dotenv'

export default {
  // agencies that you want workers to be managed automatically.
  autoupdate: ['au-syd', 'au-cbr', 'fr-par'],

  // how many minutes till first pull
  firstpull: 5,

  // tcp port where app should listen
  // uses randomized ports for workers.
  publicport: 8000,
  privateport: 8001,

  // aws or azure
  storageService: 'aws',
  shapesContainer: 'shapes-us-west-2.waka.app' || process.env.shapesContainer,
  shapesRegion: 'us-west-2',
  emulatedStorage: false,
}
