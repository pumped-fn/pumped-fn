import { flow } from "@pumped-fn/lite"
import { entry, route } from "@pumped-fn/pumped"

const listLots = flow({ factory: () => ({ lots: ["a", "b"] }) })

export default entry({ flow: listLots, tags: [route({ method: "GET", path: "/lots" })] })
