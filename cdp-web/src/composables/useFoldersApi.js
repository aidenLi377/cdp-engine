import { buildUrl, request } from '../utils/apiClient.js'

export function useFoldersApi() {
  return {
    listFolders() {
      return request('/api/folders')
    },
    createFolder(name, parentId) {
      return request('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: parentId || null }),
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
