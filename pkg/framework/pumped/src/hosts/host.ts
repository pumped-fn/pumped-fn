import { isAttributed, type Lite } from "@pumped-fn/lite"
import { entrySpec, type Entry } from "../entry"
import { normalizePickInput, type AppConfig, type Manifest } from "../runtime/manifest"

/** Readiness and shutdown handle returned by a host's `start`. */
export interface HostRuntime {
  ready: Promise<void>
  stop(): Promise<void>
}

/**
 * Mounts manifest entries selected by one tag. `selector` and `provides` are static so
 * `analyze` can prove which ambient tags an entry's activation context will carry.
 */
export interface Host<Spec, Options = object, Runtime extends HostRuntime = HostRuntime> {
  readonly name: string
  readonly selector: Lite.Tag<Spec, false>
  readonly provides: readonly Lite.Tag<any, boolean>[]
  start(options: { scope: Lite.Scope; manifest: Manifest } & Options): Runtime
}

/** A host refused to mount the manifest as declared. */
export class HostStartError extends Error {
  override readonly name = "HostStartError"

  constructor(
    readonly kind:
      | "duplicate-route"
      | "duplicate-command"
      | "duplicate-schedule"
      | "duplicate-workflow"
      | "schedule-registration",
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
  }
}

interface PickRules {
  families: ReadonlySet<symbol>
  values: readonly Lite.Attributed<any>[]
}

/** The app's normalized picking rules. */
export interface AppPick {
  include: PickRules
  exclude: PickRules
}

function pickRules(input: Parameters<typeof normalizePickInput>[0]): PickRules {
  const families = new Set<symbol>()
  const values: Lite.Attributed<any>[] = []
  for (const rule of normalizePickInput(input)) {
    if (isAttributed(rule)) values.push(rule)
    else families.add(rule.key)
  }
  return { families, values }
}

export function appPick(app: AppConfig | undefined): AppPick {
  return {
    include: pickRules(app?.attributes?.include),
    exclude: pickRules(app?.attributes?.exclude),
  }
}

function matchesRules(fact: Lite.Attributed<any>, rules: PickRules): boolean {
  return rules.families.has(fact.key) || fact.attribute.has(rules.values, fact.value)
}

export function enabled(facts: readonly Lite.Attributed<any>[] | undefined, pick: AppPick): boolean {
  for (const fact of facts ?? []) {
    if (!fact.attribute.select) continue
    if (matchesRules(fact, pick.exclude)) return false
    if (!matchesRules(fact, pick.include)) return false
  }
  return true
}

export function mounts<Spec>(
  entryTags: readonly Lite.Tagged<any>[],
  selector: Lite.Tag<Spec, false>,
  pick: AppPick
): Spec[] {
  const specs: Spec[] = []
  for (const tagged of entryTags) {
    if (tagged.key !== selector.key) continue
    if (!enabled(tagged.attributes, pick)) continue
    specs.push(tagged.value as Spec)
  }
  return specs
}

/** One picked mount: the spec value plus the tagged that carries it. */
export interface HostMount<Spec> {
  tagged: Lite.Tagged<any>
  spec: Spec
}

/**
 * One picked entry for a host: its entry atom (resolve it for the executable bundle),
 * the picked tags outside this host's selector, and the picked mounts.
 */
export interface HostSelection<Spec> {
  name: string
  entry: Entry<any, any>
  tags: readonly Lite.Tagged<any>[]
  mounts: readonly HostMount<Spec>[]
}

export function selectEntries<Spec>(manifest: Manifest, selector: Lite.Tag<Spec, false>): HostSelection<Spec>[] {
  const pick = appPick(manifest.app)
  const selections: HostSelection<Spec>[] = []
  for (const item of manifest.entries) {
    const spec = entrySpec(item.entry)
    if (!enabled(spec.attributes, pick)) continue
    const picked: HostMount<Spec>[] = []
    for (const tagged of spec.tags) {
      if (tagged.key !== selector.key) continue
      if (!enabled(tagged.attributes, pick)) continue
      picked.push({ tagged, spec: tagged.value as Spec })
    }
    if (picked.length === 0) continue
    const rest = spec.tags.filter((tagged) => tagged.key !== selector.key && enabled(tagged.attributes, pick))
    selections.push({ name: item.name, entry: item.entry, tags: rest, mounts: picked })
  }
  return selections
}
