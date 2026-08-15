import { attribute, flow } from "@pumped-fn/lite"
import { entry, route } from "@pumped-fn/pumped"

const previewCapability = attribute<string>({ label: "fixture.preview" })

const preview = flow({ factory: () => ({ marker: "preview-capability-flow" }) })

export default entry({
  flow: preview,
  tags: [route({ method: "GET", path: "/preview" })],
  attributes: [previewCapability("on")],
})
