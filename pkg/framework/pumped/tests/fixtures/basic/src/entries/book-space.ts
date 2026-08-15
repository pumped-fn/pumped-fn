import { flow } from "@pumped-fn/lite"
import { entry, route } from "@pumped-fn/pumped"

const bookSpace = flow({ factory: () => ({ booked: true }) })

export default entry({ flow: bookSpace, tags: [route({ method: "POST", path: "/book-space" })] })
