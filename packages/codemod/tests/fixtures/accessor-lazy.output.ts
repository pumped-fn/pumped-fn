const lazyDb = controller(dbAtom)
const reactiveConfig = controller(configAtom)
const staticUser = controller(userAtom)

function example() {
  const lazyService = controller(serviceAtom)
  return lazyService.get()
}

const unrelated = someObject.property
