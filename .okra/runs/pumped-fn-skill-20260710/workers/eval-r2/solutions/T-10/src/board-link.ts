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
  factory: () => ({
    open: (address: string): BoardSession => ({
      address,
      render: (departures) => console.log(JSON.stringify({ address, departures })),
      close: () => {},
    }),
  }) satisfies BoardLink,
})
