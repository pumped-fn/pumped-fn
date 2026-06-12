type PayloadListener = (payload: string) => void

interface LiveEmitter {
  next(): string
  on(listener: PayloadListener): void
}

interface PayloadSink {
  write(payload: string): void
}

export class HeartbeatLoop {
  constructor(
    private readonly emitter: LiveEmitter,
    private readonly sink: PayloadSink
  ) {
    this.emitter.on((payload) => {
      this.sink.write(payload)
    })
    setInterval(() => {
      this.sink.write(this.emitter.next())
    }, 1000)
  }
}

export function startHeartbeat(emitter: LiveEmitter, sink: PayloadSink): HeartbeatLoop {
  return new HeartbeatLoop(emitter, sink)
}
