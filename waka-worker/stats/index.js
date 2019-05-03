class Stats {
  constructor(props) {
    const { realtime } = props
    this.realtime = realtime
    this.getStats = this.getStats.bind(this)
  }

  getStats(req, res) {
    console.log(this)
    const { realtime } = this
    const response = realtime.fn.lastUpdate
    res.send(response)
  }
}

module.exports = Stats
