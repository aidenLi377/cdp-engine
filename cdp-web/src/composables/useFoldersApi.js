import { buildUrl, request } from '../utils/apiClient.js'

export function useFoldersApi() {
  return {
    listFolders(scope = 'mine', { signal, fresh = false } = {}) {
      return request(buildUrl('/api/folders', {
        scope,
        _refresh: fresh ? Date.now() : undefined,
      }), {
        signal,
        ...(fresh ? { cache: 'no-store' } : {}),
      })
    },
    createFolder(name, parentId, scope = 'mine') {
      return request('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: parentId || null, scope }),
      })
    },
    updateFolder(id, name) {
      return request(`/api/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      })
    },
    deleteFolder(id) {
      return request(`/api/folders/${id}`, { method: 'DELETE' })
    },
    moveFolder(id, parentId) {
      return request(`/api/folders/${id}/move`, {
        method: 'PUT',
        body: JSON.stringify({ parentId }),
      })
    },
  }
}
