import { useAtom, useController } from "@pumped-fn/lite-react"
import { query, sortBy, visibleProducts } from "./after"

export function ProductList() {
  const { data: visible } = useAtom(visibleProducts, { suspense: false, resolve: true })
  const { data: q } = useAtom(query, { suspense: false, resolve: true })
  const { data: order } = useAtom(sortBy, { suspense: false, resolve: true })
  const queryControl = useController(query)
  const sortControl = useController(sortBy)

  return (
    <div>
      <input aria-label="filter" value={q ?? ""} onChange={(e) => queryControl.set(e.target.value)} />
      <select
        aria-label="sort"
        value={order ?? "name"}
        onChange={(e) => sortControl.set(e.target.value as "name" | "price")}
      >
        <option value="name">name</option>
        <option value="price">price</option>
      </select>
      <ul>
        {(visible ?? []).map((p) => (
          <li key={p.id}>
            {p.name} — {p.price}
          </li>
        ))}
      </ul>
    </div>
  )
}
