abstract class BaseGateway {
  abstract start(prefix: string, config): Promise<void>
  abstract recycle(prefix: string): Promise<void>
  abstract stop(prefix: string): Promise<void>
}
