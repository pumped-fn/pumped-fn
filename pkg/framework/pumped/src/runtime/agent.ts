import { isFlow, type Lite } from "@pumped-fn/lite"
import type { ManifestEntry } from "./manifest"

interface CapabilityLike {
  name: string
}

interface AgentLike {
  name: string
  description?: string
  turn: Lite.Flow<any, any>
  tools?: readonly CapabilityLike[]
  skills?: readonly CapabilityLike[]
  subagents?: readonly CapabilityLike[]
}

function isAgentLike(value: unknown): value is AgentLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "turn" in value &&
    isFlow((value as AgentLike).turn)
  )
}

export function normalizeAgentEntry(value: unknown): Pick<ManifestEntry, "flow" | "agent"> {
  if (isFlow(value)) return { flow: value }

  if (isAgentLike(value)) {
    return {
      flow: value.turn,
      agent: {
        name: value.name,
        description: value.description,
        tools: (value.tools ?? []).map((tool) => tool.name),
        skills: (value.skills ?? []).map((skill) => skill.name),
        subagents: (value.subagents ?? []).map((subagent) => subagent.name),
      },
    }
  }

  throw new Error("agents entry must default-export a flow or a structural adapter with a .turn flow")
}
