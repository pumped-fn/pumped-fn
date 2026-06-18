export interface DownloadRequest {
  readonly key: string
  readonly requestId: string
  readonly tenantId: string
  readonly userId: string
}

export interface StorageGateway {
  fetchObject(tenantId: string, requestId: string, key: string): Promise<string>
}

export async function handleDownload(
  request: DownloadRequest,
  storage: StorageGateway
): Promise<string> {
  return authorizeDownload(
    request.userId,
    request.tenantId,
    request.requestId,
    request.key,
    storage
  )
}

async function authorizeDownload(
  userId: string,
  tenantId: string,
  requestId: string,
  key: string,
  storage: StorageGateway
): Promise<string> {
  recordAccessAttempt(userId, tenantId, requestId, key)
  return loadTenantObject(tenantId, requestId, key, storage)
}

function recordAccessAttempt(
  userId: string,
  tenantId: string,
  requestId: string,
  key: string
): string {
  return `${tenantId}:${userId}:${requestId}:${key}`
}

function loadTenantObject(
  tenantId: string,
  requestId: string,
  key: string,
  storage: StorageGateway
): Promise<string> {
  return storage.fetchObject(tenantId, requestId, key)
}
