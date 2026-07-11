import { atom, controller, createScope } from "@pumped-fn/lite"

const windowSize = 60

const feed = atom({ factory: () => 50 })
const history = atom({ factory: (): number[] => [] })
const recomputeCount = atom({ factory: () => 0 })

const stats = atom({
  deps: {
    feed: controller(feed, { resolve: true, watch: true }),
    history: controller(history, { resolve: true }),
    recomputeCount: controller(recomputeCount, { resolve: true }),
  },
  factory: (_, { feed, history, recomputeCount }) => {
    recomputeCount.update((total) => total + 1)
    const values = [...history.get().slice(1 - windowSize), feed.get()]
    history.set(values)
    const sum = values.reduce((total, value) => total + value, 0)
    return {
      samples: values.length,
      mean: sum / values.length,
      low: Math.min(...values),
      high: Math.max(...values),
    }
  },
})

const readout = atom({
  deps: { stats: controller(stats, { resolve: true, watch: true }) },
  factory: (_, { stats }) => {
    const { samples, mean, low, high } = stats.get()
    return `${mean.toFixed(1)} mean · ${low.toFixed(1)} low · ${high.toFixed(1)} high · ${samples} samples`
  },
})

type Session = {
  push: () => void
  dispose: () => Promise<void>
}

export function mountReactivity(root: HTMLElement) {
  root.innerHTML = `
    <header class="view-head">
      <p class="micro">@pumped-fn/lite reactivity</p>
      <h1>Feed → rolling stats → readout</h1>
      <p class="lede">A numeric feed atom drives two chained derived atoms via <span class="mono">controller(dep, { resolve, watch })</span>. The DOM paints from one <span class="mono">scope.changes</span> loop.</p>
      <div class="controls">
        <button type="button" class="action" data-control="toggle">Start feed</button>
        <button type="button" class="action" data-control="burst">Burst 10,000</button>
      </div>
    </header>
    <div class="stats">
      <div class="stat"><span class="stat-value" data-stat="pushes">0</span><span class="micro">updates pushed</span></div>
      <div class="stat"><span class="stat-value" data-stat="recomputes">0</span><span class="micro">derived recomputes</span></div>
      <div class="stat"><span class="stat-value" data-stat="paints">0</span><span class="micro">DOM paints</span></div>
    </div>
    <p class="readout" data-stat="readout">feed stopped — start it or fire a burst</p>
    <p class="footnote">a 10,000-update synchronous burst lands as a handful of recomputes and paints — changes conflate to latest and derived atoms recompute glitch-free</p>
  `
  const toggle = root.querySelector<HTMLButtonElement>('[data-control="toggle"]')!
  const burst = root.querySelector<HTMLButtonElement>('[data-control="burst"]')!
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-stat="${name}"]`)!
  const pushed = field("pushes")
  const recomputed = field("recomputes")
  const painted = field("paints")
  const readoutLine = field("readout")

  let session: Session | null = null
  let timer: number | null = null
  let pushes = 0
  let paints = 0
  let phase = 0

  const nextRandomSample = () => {
    phase += 1
    return 50 + Math.sin(phase / 9) * 24 + (Math.random() - 0.5) * 6
  }

  const openSession = async (): Promise<Session> => {
    pushes = 0
    paints = 0
    pushed.textContent = "0"
    recomputed.textContent = "0"
    painted.textContent = "0"
    const scope = createScope()
    const feedCtrl = await scope.controller(feed, { resolve: true })
    const recomputeCtrl = await scope.controller(recomputeCount, { resolve: true })
    const painting = (async () => {
      for await (const line of scope.changes(readout)) {
        paints += 1
        readoutLine.textContent = line
        pushed.textContent = String(pushes)
        recomputed.textContent = String(recomputeCtrl.get())
        painted.textContent = String(paints)
      }
    })()
    return {
      push: () => {
        pushes += 1
        feedCtrl.set(nextRandomSample())
      },
      dispose: async () => {
        await scope.dispose()
        await painting
      },
    }
  }

  const ensureSession = async () => {
    if (!session) session = await openSession()
    return session
  }

  const startFeedTimer = (live: Session) => {
    timer = window.setInterval(() => live.push(), 8)
  }

  const stopFeedTimer = () => {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  toggle.addEventListener("click", async () => {
    if (timer !== null) {
      stopFeedTimer()
      toggle.textContent = "Start feed"
      const closing = session
      session = null
      if (closing) await closing.dispose()
      return
    }
    startFeedTimer(await ensureSession())
    toggle.textContent = "Stop"
  })

  burst.addEventListener("click", async () => {
    burst.disabled = true
    const live = await ensureSession()
    for (let i = 0; i < 10000; i += 1) live.push()
    pushed.textContent = String(pushes)
    burst.disabled = false
  })
}
