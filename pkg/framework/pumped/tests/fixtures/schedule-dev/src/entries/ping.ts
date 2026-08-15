import { flow } from "@pumped-fn/lite"
import { entry, route } from "@pumped-fn/pumped"

const ping = flow({ factory: () => ({ pong: true }) })

export default entry({ flow: ping, tags: [route({ method: "GET", path: "/ping" })] })
