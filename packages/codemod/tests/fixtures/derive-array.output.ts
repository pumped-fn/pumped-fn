import { atom } from "@pumped-fn/lite"

const dbAtom = atom({ factory: (ctx) => new Database() })
const configAtom = atom({ factory: (ctx) => ({ host: "localhost" }) })

const repoAtom = atom({
  deps: {
    db: dbAtom,
    config: configAtom
  },

  factory: (
    ctx,
    {
      db,
      config
    }
  ) => new Repo(db, config)
})
const serviceAtom = atom({
  deps: {
    db: dbAtom
  },

  factory: (
    ctx,
    {
      db
    }
  ) => new Service(db)
})
