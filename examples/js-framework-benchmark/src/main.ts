import { createScope, atom } from '@pumped-fn/lite'
import { html, list, mount } from '@pumped-fn/lite-ui'

const adjectives = ["pretty","large","big","small","tall","short","long","handsome","plain","quaint","clean","elegant","easy","angry","crazy","helpful","mushy","odd","unsightly","adorable","important","inexpensive","cheap","expensive","fancy"]
const colours = ["red","yellow","blue","green","pink","brown","purple","brown","white","black","orange"]
const nouns = ["table","chair","house","bbq","desk","car","pony","cookie","sandwich","burger","pizza","mouse","keyboard"]
const random = (max: number) => Math.round(Math.random() * 1000) % max

let nextId = 1

interface Row { id: number; label: string }

function buildData(count: number): Row[] {
  const data: Row[] = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
    })
  }
  return data
}

const scope = createScope()

const dataAtom = atom({ factory: () => [] as Row[] })
const selectedAtom = atom({ factory: () => 0 })

async function init() {
  await scope.resolve(dataAtom)
  await scope.resolve(selectedAtom)

  const dataCtrl = scope.controller(dataAtom)
  const selCtrl = scope.controller(selectedAtom)

  async function flush() {
    await scope.flush()
  }

  async function run() {
    dataCtrl.set(buildData(1000))
    await flush()
  }
  async function runLots() {
    dataCtrl.set(buildData(10000))
    await flush()
  }
  async function add() {
    dataCtrl.set([...dataCtrl.get(), ...buildData(1000)])
    await flush()
  }
  async function update() {
    const d = dataCtrl.get().slice()
    for (let i = 0; i < d.length; i += 10) {
      d[i] = { ...d[i], label: d[i].label + ' !!!' }
    }
    dataCtrl.set(d)
    await flush()
  }
  async function clear() {
    dataCtrl.set([])
    await flush()
  }
  async function swapRows() {
    const d = dataCtrl.get()
    if (d.length > 998) {
      const next = d.slice()
      ;[next[1], next[998]] = [next[998], next[1]]
      dataCtrl.set(next)
      await flush()
    }
  }

  const app = html`<div class="container">
    <div class="jumbotron"><div class="row">
      <div class="col-md-6"><h1>pumped-fn/lite-ui</h1></div>
      <div class="col-md-6"><div class="row">
        <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run" @click=${run}>Create 1,000 rows</button></div>
        <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots" @click=${runLots}>Create 10,000 rows</button></div>
        <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add" @click=${add}>Append 1,000 rows</button></div>
        <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update" @click=${update}>Update every 10th row</button></div>
        <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear" @click=${clear}>Clear</button></div>
        <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows" @click=${swapRows}>Swap Rows</button></div>
      </div></div>
    </div></div>
    <table class="table table-hover table-striped test-data"><tbody>${list(
      () => dataCtrl.get(),
      row => row.id,
      (row, getItem) => html`<tr class=${() => selCtrl.get() === getItem().id ? 'danger' : ''}>
        <td class="col-md-1">${row.id}</td>
        <td class="col-md-4"><a @click=${async () => {
          selCtrl.set(getItem().id)
          await flush()
        }}>${() => getItem().label}</a></td>
        <td class="col-md-1"><a @click=${async () => {
          const id = getItem().id
          dataCtrl.update(d => d.filter(r => r.id !== id))
          await flush()
        }}><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
        <td class="col-md-6"></td>
      </tr>`,
    )}</tbody></table>
    <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
  </div>`

  mount(app, document.getElementById('main')!, scope)
}

init()
