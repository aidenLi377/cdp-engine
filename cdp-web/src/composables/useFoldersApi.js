function buildUrl(path, params) {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }
  return url.pathname + url.search
}

async function parseResponseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (response.status === 204) return null
  const data = await parseResponseBody(response)
  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.error) ||
      (typeof data === 'string' && data.trim()) ||
      `Request failed with status ${response.status}`
    throw new Error(message)
  }
  return data
}

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
