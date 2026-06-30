const lazyDb = dbAtom.lazy
const reactiveConfig = configAtom.reactive
const staticUser = userAtom.static

function example() {
  const lazyService = serviceAtom.lazy
  return lazyService.get()
}

const unrelated = someObject.property
