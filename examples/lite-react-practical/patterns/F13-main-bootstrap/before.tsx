import { useState } from "react"
import { createRoot } from "react-dom/client"

function CounterApp() {
  const [count, setCount] = useState(0)

  return <button onClick={() => setCount(count + 1)}>count {count}</button>
}

createRoot(document.getElementById("root")!).render(<CounterApp />)
