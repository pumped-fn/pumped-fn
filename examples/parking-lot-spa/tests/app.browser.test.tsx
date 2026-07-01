import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { ParkingLotRoot } from "../src/app"

describe("parking lot SPA", () => {
  test("dispatches real shared workflows from the browser UI", async () => {
    render(<ParkingLotRoot />)

    fireEvent.click(await screen.findByRole("button", { name: "Configure" }))
    await waitFor(() => expect(screen.getByText("Configured North Deck")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "user" }))
    fireEvent.click(screen.getByRole("button", { name: "Book" }))
    await waitFor(() => expect(screen.getByText("Booked SPA-101")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "operator" }))
    fireEvent.click(screen.getByRole("button", { name: "Check In" }))
    await waitFor(() => expect(screen.getByText("Parked SPA-202")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Exit" }))
    await waitFor(() => expect(screen.getByText("Due $15.00")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Pair" }))
    await waitFor(() => expect(screen.getByText(/^Receipt/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "manager" }))
    fireEvent.click(screen.getByRole("button", { name: "Report" }))
    await waitFor(() => expect(screen.getByText("Report updated")).toBeInTheDocument())
    expect(screen.getByText("$15.00")).toBeInTheDocument()
  })
})
