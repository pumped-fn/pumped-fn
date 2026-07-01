import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
import {
  bookSpace,
  checkInVehicle,
  configureLot,
  pairPayment,
  prepareExit,
  readReport,
} from "@pumped-fn/parking-lot-shared"

export const lite = tanstackStart.adapter()

export const configure = lite.handler(configureLot)
export const book = lite.handler(bookSpace)
export const checkIn = lite.handler(checkInVehicle)
export const exit = lite.handler(prepareExit)
export const pay = lite.handler(pairPayment)
export const report = lite.handler(readReport)
