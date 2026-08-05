import { request } from '../utils/apiClient.js'

export function useFolderShareApi() {
  return {
    createFolderShare(folderId, { signal } = {}) {
      return request(`/api/folders/${folderId}/share`, {
        method: 'POST',
        signal,
      })
    },
    previewFolderShare(text, { signal } = {}) {
      return request('/api/folder-shares/preview', {
        method: 'POST',
        body: JSON.stringify({ text }),
        signal,
      })
    },
    importFolderShare(text, { signal } = {}) {
      return request('/api/folder-shares/import', {
        method: 'POST',
        body: JSON.stringify({ text }),
        signal,
      })
    },
  }
}
