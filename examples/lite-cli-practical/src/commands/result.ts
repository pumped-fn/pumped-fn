import type { Logging } from "@pumped-fn/lite-extension-logging"
import type { Observable } from "@pumped-fn/lite-extension-observable"

export interface CommandResult<T> {
  output: T
  logs: readonly Logging.Record[]
  events: readonly Observable.Event[]
}
