export type SessionRecord = {
  readonly id: string
  readonly label: string
  readonly updatedAt: number
}

export type SessionSnapshot = {
  readonly ids: readonly string[]
  readonly labels: readonly string[]
}

export class SessionSnapshotCache {
  private sessions: SessionRecord[] = []
  private needsRefresh = true
  private snapshot: SessionSnapshot = { ids: [], labels: [] }

  replaceAll(next: readonly SessionRecord[]): void {
    this.sessions = [...next]
    this.needsRefresh = true
  }

  rename(id: string, label: string): void {
    this.sessions = this.sessions.map((session) =>
      session.id === id ? { ...session, label, updatedAt: session.updatedAt + 1 } : session
    )
    this.needsRefresh = true
  }

  touch(id: string): void {
    this.sessions = this.sessions.map((session) =>
      session.id === id ? { ...session, updatedAt: session.updatedAt + 1 } : session
    )
  }

  getSnapshot(): SessionSnapshot {
    if (this.needsRefresh) {
      this.snapshot = {
        ids: this.sessions.map((session) => session.id),
        labels: this.sessions.map((session) => session.label),
      }
      this.needsRefresh = false
    }
    return this.snapshot
  }
}
