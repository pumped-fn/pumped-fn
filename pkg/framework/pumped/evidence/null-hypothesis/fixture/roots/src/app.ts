import { app } from "@pumped-fn/pumped/app"
import { sharedMarker } from "../../shared"
import { profile } from "./profile"

export default app({ tags: [profile(`APP_DEFAULT_MARKER:${sharedMarker}`)] })
