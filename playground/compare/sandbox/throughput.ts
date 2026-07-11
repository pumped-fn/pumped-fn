import type { Lane } from "../cases/account-onboarding/contract"
import { runScenario } from "../cases/account-onboarding/scenario"

const warmupRuns = 15
const timedWindowMs = 300
const batchSize = 5
const opsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

const nextTimerTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type Row = { fill: HTMLElement; value: HTMLElement }

export function mountThroughput(root: HTMLElement, lanes: Lane[]) {
  root.innerHTML = `
    <header class="view-head">
      <p class="micro">Full-scenario throughput</p>
      <h1>Start · three provisions · close</h1>
      <p class="lede">One run is the entire lifecycle: container start, three provisioning requests, teardown. ${warmupRuns} warm-up runs, then ~${timedWindowMs}ms of timed batches per lane.</p>
      <button type="button" class="action">Run benchmark</button>
    </header>
    <div class="bench">
      ${lanes.map((lane) => `
        <div class="bench-row" data-lane="${lane.id}">
          <span class="bench-lane">${lane.id}</span>
          <span class="bench-track"><span class="bench-fill"></span></span>
          <span class="bench-value">—</span>
        </div>
      `).join("")}
    </div>
    <p class="footnote">measured in this tab, on your machine — re-run any time</p>
  `
  const button = root.querySelector<HTMLButtonElement>(".action")!
  const rows = new Map<Lane["id"], Row>(lanes.map((lane) => {
    const row = root.querySelector<HTMLElement>(`.bench-row[data-lane="${lane.id}"]`)!
    return [lane.id, {
      fill: row.querySelector<HTMLElement>(".bench-fill")!,
      value: row.querySelector<HTMLElement>(".bench-value")!,
    }]
  }))
  const scores = new Map<Lane["id"], number>()

  const rescale = () => {
    const top = Math.max(...scores.values())
    for (const [id, score] of scores) {
      rows.get(id)!.fill.style.width = `${(score / top) * 100}%`
    }
  }

  const measure = async (lane: Lane, row: Row) => {
    row.value.textContent = "warming up"
    for (let i = 0; i < warmupRuns; i += 1) await runScenario(lane)
    let completed = 0
    let timed = 0
    while (timed < timedWindowMs) {
      const batchStart = performance.now()
      for (let i = 0; i < batchSize; i += 1) await runScenario(lane)
      timed += performance.now() - batchStart
      completed += batchSize
      scores.set(lane.id, completed / (timed / 1000))
      row.value.textContent = `${opsFormat.format(scores.get(lane.id)!)} ops/s…`
      rescale()
      await nextTimerTick()
    }
    row.value.textContent = `${opsFormat.format(scores.get(lane.id)!)} scenarios/s`
  }

  button.addEventListener("click", async () => {
    button.disabled = true
    button.textContent = "Running…"
    scores.clear()
    for (const row of rows.values()) {
      row.fill.style.width = "0%"
      row.value.textContent = "queued"
    }
    for (const lane of lanes) await measure(lane, rows.get(lane.id)!)
    rescale()
    button.disabled = false
    button.textContent = "Run again"
  })
}
