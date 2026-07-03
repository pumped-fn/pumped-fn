import { atom, controller } from "@pumped-fn/lite"

export interface Product {
  id: string
  name: string
  price: number
}

export const products = atom({ factory: (): Product[] => [] })

export const query = atom({ factory: () => "" })

export const sortBy = atom({ factory: (): "name" | "price" => "name" })

export const visibleProducts = atom({
  deps: {
    products,
    query: controller(query, { resolve: true, watch: true }),
    sortBy: controller(sortBy, { resolve: true, watch: true }),
  },
  factory: (_ctx, { products, query, sortBy }) => {
    const q = query.get().toLowerCase()
    const order = sortBy.get()
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => (order === "name" ? a.name.localeCompare(b.name) : a.price - b.price))
  },
})
