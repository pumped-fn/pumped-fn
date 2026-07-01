import { createRoot } from "react-dom/client"
import { ParkingLotRoot } from "./app"
import "./styles.css"

const root = document.getElementById("root")
if (root === null) throw new Error("root container missing")

createRoot(root).render(<ParkingLotRoot />)
