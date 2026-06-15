import { useState } from "react"

export interface Product {
  id: string
  name: string
  price: number
}

export function ProductList({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "price">("name")

  const visible = products
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sortBy === "name" ? a.name.localeCompare(b.name) : a.price - b.price))

  return (
    <div>
      <input aria-label="filter" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select aria-label="sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "price")}>
        <option value="name">name</option>
        <option value="price">price</option>
      </select>
      <ul>
        {visible.map((p) => (
          <li key={p.id}>
            {p.name} — {p.price}
          </li>
        ))}
      </ul>
    </div>
  )
}
