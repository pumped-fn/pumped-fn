import { derive } from "@pumped-fn/core-next"

const dbAtom = atom({ factory: (ctx) => new Database() })
const cacheAtom = atom({ factory: (ctx) => new Cache() })

const serviceAtom = atom({
  deps: { db: dbAtom, cache: cacheAtom },
  factory: (ctx, { db, cache }) => new Service(db, cache)
})
const queryAtom = atom({
  deps: { db: dbAtom },
  factory: (ctx, { db }) => db.query()
})
