abstract class BaseStops {
  abstract start(): void
  abstract stop(): void
  filter?(recordset: any[], mode: string): void
}

export default BaseStops
