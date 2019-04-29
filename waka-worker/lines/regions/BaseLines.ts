abstract class BaseLines {
  getColors: any
  abstract start(): void
  constructor({ props }) {
    const { getColors } = props
    this.getColors = getColors
  }
}

export default BaseLines
