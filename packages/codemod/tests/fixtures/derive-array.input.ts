import { derive } from "@pumped-fn/core-next"

const dbAtom = atom({ factory: (ctx) => new Database() })
const configAtom = atom({ factory: (ctx) => ({ host: "localhost" }) })

const repoAtom = derive([dbAtom, configAtom], ([db, config], ctl) => new Repo(db, config))
const serviceAtom = derive([dbAtom], ([db], controller) => new Service(db))
