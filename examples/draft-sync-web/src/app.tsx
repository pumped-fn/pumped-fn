import { Suspense } from "react"
import type { Lite } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider, useAtom, useFlow } from "@pumped-fn/lite-react"
import { draft, saveDraft } from "./model"

export interface AppProps {
  readonly scope: Lite.Scope
  readonly actor: string
}

export function App({ scope, actor }: AppProps) {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <Suspense fallback={<section aria-label="sync draft">Loading draft</section>}>
          <DraftScreen actor={actor} />
        </Suspense>
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}

export function DraftScreen({ actor }: { readonly actor: string }) {
  const current = useAtom(draft)
  const save = useFlow(saveDraft)

  return (
    <section aria-label="sync draft">
      <h1>{current.title}</h1>
      <p>{current.body || "No body"}</p>
      <dl>
        <dt>saved by</dt>
        <dd>{current.savedBy}</dd>
        <dt>version</dt>
        <dd>{current.version}</dd>
        <dt>status</dt>
        <dd>{save.status}</dd>
      </dl>
      <button
        type="button"
        aria-label="save browser edit"
        onClick={() => {
          save.execute({
            title: `${current.title} from ${actor}`,
            body: `browser revision ${current.version + 1}`,
            actor,
          })
        }}
      >
        Save
      </button>
    </section>
  )
}
