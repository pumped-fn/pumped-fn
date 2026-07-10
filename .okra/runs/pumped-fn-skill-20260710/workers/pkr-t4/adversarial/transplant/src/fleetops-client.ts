export const fleetOpsClient = {
  dispatchPickup: (scooterId: string) => Promise.resolve({ accepted: scooterId.length > 0 }),
}
