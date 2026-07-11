import "./styles.css"
import type { Lane } from "../cases/account-onboarding/contract"
import { awilix } from "../cases/account-onboarding/lanes/awilix"
import { effect } from "../cases/account-onboarding/lanes/effect"
import { inversify } from "../cases/account-onboarding/lanes/inversify"
import { plain } from "../cases/account-onboarding/lanes/plain"
import { pumped } from "../cases/account-onboarding/lanes/pumped"
import { runScenario, type ScenarioResult } from "../cases/account-onboarding/scenario"
import { renderLifecycle } from "./lifecycle"
import { mountReactivity } from "./reactivity"
import { mountThroughput } from "./throughput"

const lanes: Lane[] = [pumped, effect, awilix, inversify, plain]

const views = [
  { id: "lifecycle", label: "Lifecycle" },
  { id: "throughput", label: "Throughput" },
  { id: "reactivity", label: "Reactivity" },
]

async function run() {
  const root = document.querySelector<HTMLElement>("#app")!
  const results: ScenarioResult[] = []
  for (const lane of lanes) {
    root.textContent = `running ${lane.id}…`
    results.push(await runScenario(lane))
  }
  root.dataset.results = JSON.stringify(results)
  root.dataset.comparisonReady = "true"
  root.innerHTML = `
    <nav class="tabs">
      ${views.map((view, index) => `
        <button type="button" class="tab${index === 0 ? " is-active" : ""}" data-view="${view.id}">${view.label}</button>
      `).join("")}
    </nav>
    ${views.map((view, index) => `<section class="view" data-view="${view.id}"${index === 0 ? "" : " hidden"}></section>`).join("")}
  `
  const section = (id: string) => root.querySelector<HTMLElement>(`section[data-view="${id}"]`)!
  renderLifecycle(section("lifecycle"), results)
  mountThroughput(section("throughput"), lanes)
  mountReactivity(section("reactivity"))
  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".tab")]
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const other of tabs) other.classList.toggle("is-active", other === tab)
      for (const view of root.querySelectorAll<HTMLElement>("section.view")) {
        view.hidden = view.dataset.view !== tab.dataset.view
      }
    })
  }
}

void run()
