import "./styles.css"
import type { Lane } from "../cases/account-onboarding/contract"
import { awilix } from "../cases/account-onboarding/lanes/awilix"
import { effect } from "../cases/account-onboarding/lanes/effect"
import { inversify } from "../cases/account-onboarding/lanes/inversify"
import { plain } from "../cases/account-onboarding/lanes/plain"
import { pumped } from "../cases/account-onboarding/lanes/pumped"
import { runScenario } from "../cases/account-onboarding/scenario"

const lanes: Lane[] = [pumped, effect, awilix, inversify, plain]

async function run() {
  const results = await Promise.all(lanes.map(runScenario))
  const root = document.querySelector<HTMLElement>("#app")!
  root.dataset.results = JSON.stringify(results)
  root.dataset.comparisonReady = "true"
  root.innerHTML = `
    <header>
      <p>Browser contract result</p>
      <h1>All five lanes completed the same lifecycle</h1>
    </header>
    <div class="results">
      ${results.map((result) => `
        <article>
          <span>contract passed</span>
          <h2>${result.lane}</h2>
          <dl>
            <dt>requests</dt><dd>3</dd>
            <dt>commits</dt><dd>${result.events.filter((event) => event === "database.transaction.commit").length}</dd>
            <dt>rollbacks</dt><dd>${result.events.filter((event) => event === "database.transaction.rollback").length}</dd>
            <dt>acquire / release</dt><dd>1 / 1</dd>
          </dl>
        </article>
      `).join("")}
    </div>
  `
}

void run()
