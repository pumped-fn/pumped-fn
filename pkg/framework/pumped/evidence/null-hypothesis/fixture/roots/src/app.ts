import { app } from "@pumped-fn/pumped/app"
import { profile } from "./profile"

export default app({ tags: [profile("APP_DEFAULT_MARKER")] })
