import 'mocha'
import { expect } from 'chai'
import WakaRealtime from '../../src/waka-realtime'

describe('waka-realtime', () => {
  it('should have not allow bad prefix', () => {
    const realtime = new WakaRealtime({
      prefix: 'fake',
      version: 'not-supplied',
      api: {
        fake: '',
      },
    })
    expect(realtime.region).to.equal(null)
  })
  it('should have default timeout', () => {
    const realtime = new WakaRealtime({
      prefix: 'au-syd',
      version: 'not-supplied',
      api: {
        fake: '',
      },
    })
    expect(realtime.region.scheduleLocationPullTimeout).to.equal(15000)
    expect(realtime.region.scheduleUpdatePullTimeout).to.equal(15000)
  })
  it('should not work without apikey', async () => {
    const realtime = new WakaRealtime({
      prefix: 'au-syd',
      version: 'not-supplied',
      api: {
        fake: '',
      },
    })

    try {
      await realtime.start()
    } catch (err) {
      expect(err).to.be.instanceOf(Error)
    }
  })
})
