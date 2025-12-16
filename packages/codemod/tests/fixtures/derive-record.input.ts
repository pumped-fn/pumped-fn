import { derive } from "@pumped-fn/core-next"

const dbAtom = atom({ factory: (ctx) => new Database() })
const cacheAtom = atom({ factory: (ctx) => new Cache() })

const serviceAtom = derive({ db: dbAtom, cache: cacheAtom }, ({ db, cache }, ctl) => new Service(db, cache))
const queryAtom = derive({ db: dbAtom }, ({ db }, controller) => db.query())
