import { atom } from "@pumped-fn/lite"

export type Departure = { vessel: string; at: string }

export interface BoardSession {
  readonly address: string
  render(departures: Departure[]): void
  close(): void
}

export interface BoardLink {
  open(address: string): BoardSession
}

export const boardLink = atom({
  name: "boardLink",
  factory: (): BoardLink => ({
    open: (address) => ({
      address,
      render: (departures) => {
        console.log(JSON.stringify({ address, departures }))
      },
      close: () => {
        console.log(JSON.stringify({ address, closed: true }))
      },
    }),
  }),
})
