export type ManualTxRow = {
  readonly account: string
  readonly deltaCents: number
}

export type ManualTxRunner = {
  connect(): Promise<void>
  begin(): Promise<void>
  write(row: ManualTxRow): Promise<void>
  deleteWhere(account: string): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  release(): Promise<void>
}

export type ManualTxDatabase = {
  createRunner(): ManualTxRunner
}

export async function importLedgerRows(db: ManualTxDatabase, rows: readonly ManualTxRow[]): Promise<number> {
  const runner = db.createRunner()
  await runner.connect()
  await runner.begin()
  try {
    for (const row of rows) {
      await runner.write(row)
    }
    await runner.commit()
    return rows.length
  } catch (error) {
    await runner.rollback()
    throw error
  } finally {
    await runner.release()
  }
}

export async function replaceAccountRows(
  db: ManualTxDatabase,
  account: string,
  rows: readonly ManualTxRow[]
): Promise<number> {
  const runner = db.createRunner()
  await runner.connect()
  await runner.begin()
  try {
    await runner.deleteWhere(account)
    for (const row of rows) {
      await runner.write(row)
    }
    await runner.commit()
    return rows.length
  } catch (error) {
    await runner.rollback()
    throw error
  } finally {
    await runner.release()
  }
}
