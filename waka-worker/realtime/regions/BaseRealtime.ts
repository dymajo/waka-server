abstract class BaseRealtime {
  abstract scheduleLocationPull(): Promise<void>
  abstract schedulePull(): Promise<void>

  abstract start(): void
}

export default BaseRealtime
