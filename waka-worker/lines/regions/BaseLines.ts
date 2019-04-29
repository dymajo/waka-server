import * as Logger from 'bunyan'

abstract class BaseLines {
  getColors: any
  abstract start(): void
  logger: Logger
  constructor(props) {
    const { getColors } = props
    this.getColors = getColors
  }
}

export default BaseLines
