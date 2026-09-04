// Browser-side runtime for module UIs. Nothing here may import the server side of core.
export { apiBaseUrl, socketUrl } from './api-url.js';
export { createApiClient, apiClient, type ApiClient } from './api-client.js';
export { connectSocket, type ConnectSocketOptions } from './socket.js';
export { getCurrentTenantId, tenantIdFromToken } from './tenant-claim.js';
