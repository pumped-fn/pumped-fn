import { AsyncLocalStorage } from "node:async_hooks"

export interface RequestUser {
  readonly id: string
}

const requestStore = new AsyncLocalStorage<RequestUser>()
let currentUser: RequestUser | undefined

export async function withMutableRequest<T>(
  user: RequestUser,
  work: () => Promise<T>
): Promise<T> {
  currentUser = user
  try {
    return await work()
  } finally {
    currentUser = undefined
  }
}

export async function readMutableUserAfterGap(): Promise<string> {
  await Promise.resolve()
  return currentUser?.id ?? "anonymous"
}

export function withAsyncLocalRequest<T>(user: RequestUser, work: () => T): T {
  return requestStore.run(user, work)
}

export function readAmbientUser(): string {
  const user = requestStore.getStore()
  if (!user) throw new Error("request user is not active")
  return user.id
}
