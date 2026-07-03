import type { ParkingStore } from "./store"

export function normalizePlate(value: string): string {
  return value.trim().toUpperCase()
}

export function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd)
}

export function parkedCount(store: ParkingStore, lotId: string): number {
  return store.sessions().filter((session) => session.lotId === lotId && session.status === "parked").length
}
