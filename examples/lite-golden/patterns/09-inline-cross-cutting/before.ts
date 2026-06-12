export type Clock = {
  now(): number
}

export type InlineLog = {
  info(name: string, fields: Record<string, unknown>): void
  error(name: string, fields: Record<string, unknown>): void
}

export type TradingPort = {
  quote(items: readonly number[]): Promise<number>
  settle(accountId: string, cents: number): Promise<string>
}

export async function quoteWithTiming(
  port: TradingPort,
  clock: Clock,
  log: InlineLog,
  items: readonly number[]
): Promise<number> {
  const started = clock.now()
  log.info("quote.start", { count: items.length })
  try {
    const result = await port.quote(items)
    log.info("quote.done", { durationMs: clock.now() - started, ok: true })
    return result
  } catch (error) {
    log.error("quote.failed", { durationMs: clock.now() - started, ok: false, error })
    throw error
  }
}

export async function settleWithTiming(
  port: TradingPort,
  clock: Clock,
  log: InlineLog,
  accountId: string,
  cents: number
): Promise<string> {
  const started = clock.now()
  log.info("settle.start", { accountId, cents })
  try {
    const receipt = await port.settle(accountId, cents)
    log.info("settle.done", { durationMs: clock.now() - started, ok: true, receipt })
    return receipt
  } catch (error) {
    log.error("settle.failed", { durationMs: clock.now() - started, ok: false, error })
    throw error
  }
}
