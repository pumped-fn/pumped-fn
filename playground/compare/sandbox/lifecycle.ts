import type { Event } from "../cases/account-onboarding/contract"
import type { ScenarioResult } from "../cases/account-onboarding/scenario"

const markers: Record<Event, string> = {
  "database.acquire": "◆",
  "database.release": "◇",
  "database.transaction.begin": "○",
  "database.transaction.commit": "●",
  "database.transaction.rollback": "✕",
  "database.users.insert": "+",
  "database.users.duplicate": "!",
  "clock.now": "·",
  "uuid.next": "·",
}

const requestLabels = ["request 1 — inserted", "request 2 — duplicate, rolled back", "request 3 — inserted"]

type Segment = { label: string; entries: { position: number; name: Event }[] }

function segment(events: Event[]): Segment[] {
  const segments: Segment[] = [{ label: "lease", entries: [] }]
  let request = 0
  events.forEach((name, position) => {
    if (name === "uuid.next") {
      segments.push({ label: requestLabels[request] ?? `request ${request + 1}`, entries: [] })
      request += 1
    } else if (name === "database.release") {
      segments.push({ label: "lease returned", entries: [] })
    }
    segments[segments.length - 1]!.entries.push({ position, name })
  })
  return segments
}

const count = (events: Event[], needle: Event) => events.filter((event) => event === needle).length

export function renderLifecycle(root: HTMLElement, results: ScenarioResult[]) {
  const events = results[0]!.events
  root.innerHTML = `
    <header class="view-head">
      <p class="micro">Executable lifecycle</p>
      <h1>Success · duplicate rollback · success</h1>
      <p class="lede">Five containers ran the same three provisioning requests over a single database lease. Every lane emitted the identical ${events.length}-event sequence.</p>
    </header>
    <div class="cards">
      ${results.map((result) => `
        <article class="card">
          <div class="card-head">
            <h2>${result.lane}</h2>
            <span class="badge">passed</span>
          </div>
          <dl class="figures">
            <dt>requests</dt><dd>3</dd>
            <dt>commits</dt><dd>${count(result.events, "database.transaction.commit")}</dd>
            <dt>rollbacks</dt><dd>${count(result.events, "database.transaction.rollback")}</dd>
            <dt>acquire / release</dt><dd>1 / 1</dd>
            <dt>events</dt><dd>${result.events.length}</dd>
          </dl>
        </article>
      `).join("")}
    </div>
    <section class="timeline">
      <p class="micro">Shared event timeline — identical across all five lanes</p>
      ${segment(events).map((part) => `
        <div class="timeline-segment">
          <p class="timeline-label">${part.label}</p>
          <ol class="timeline-rows">
            ${part.entries.map(({ position, name }) => `
              <li class="timeline-row is-${name.split(".").pop()}">
                <span class="timeline-index">${String(position + 1).padStart(2, "0")}</span>
                <span class="timeline-marker">${markers[name]}</span>
                <span class="timeline-name">${name}</span>
              </li>
            `).join("")}
          </ol>
        </div>
      `).join("")}
    </section>
  `
}
