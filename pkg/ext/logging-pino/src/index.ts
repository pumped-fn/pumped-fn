import type { Logging } from "@pumped-fn/lite-extension-logging"
import type { Logger as PinoLogger } from "pino"

export namespace Pino {
  export interface Options {
    readonly name?: string
    readonly map?: (record: Logging.Record) => Record<string, unknown>
    readonly flush?: () => void | Promise<void>
    readonly close?: () => void | Promise<void>
  }

  export interface Sink extends Logging.Sink {}
}

function sink(logger: PinoLogger, options: Pino.Options = {}): Pino.Sink {
  return {
    name: options.name ?? "pino",
    write(record) {
      write(logger, record, options.map?.(record) ?? entry(record))
    },
    flush: options.flush,
    close: options.close,
  }
}

export const pino = {
  sink,
} as const

function write(logger: PinoLogger, record: Logging.Record, fields: Record<string, unknown>): void {
  if (record.level === "debug") {
    logger.debug(fields, record.message)
    return
  }
  if (record.level === "info") {
    logger.info(fields, record.message)
    return
  }
  if (record.level === "warn") {
    logger.warn(fields, record.message)
    return
  }
  logger.error(fields, record.message)
}

function entry(record: Logging.Record): Record<string, unknown> {
  return {
    id: record.id,
    at: record.at,
    ...(record.source ? { source: record.source } : {}),
    ...(record.fields ? { fields: record.fields } : {}),
  }
}
