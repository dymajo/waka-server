abstract class BaseKeyvalue {
  public name: string

  abstract get(key: string): Promise<any>

  abstract set(key: string, value: string): Promise<boolean>
}

export default BaseKeyvalue
