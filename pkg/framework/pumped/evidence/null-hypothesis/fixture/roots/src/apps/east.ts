import { app } from "@pumped-fn/pumped/app"
import base from "../app"
import { profile } from "../profile"

export default app(base, { tags: [profile("APP_EAST_MARKER")] })
