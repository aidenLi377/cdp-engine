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
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
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

export function useSolutionsApi() {
  return {
    listSolutions(status) {
      return request(buildUrl('/api/solutions', { status }))
    },
    getSolution(id) {
      return request(`/api/solutions/${id}`)
    },
    createDraft(body) {
      return request('/api/solutions/drafts', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },
    updateDraft(id, body) {
      return request(`/api/solutions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    publishSolution(id) {
      return request(`/api/solutions/${id}/publish`, {
        method: 'POST',
      })
    },
    createEditDraft(id) {
      return request(`/api/solutions/${id}/edit-draft`, {
        method: 'POST',
      })
    },
    duplicateSolution(id) {
      return request(`/api/solutions/${id}/duplicate`, {
        method: 'POST',
      })
    },
    deleteSolution(id) {
      return request(`/api/solutions/${id}`, {
        method: 'DELETE',
      })
    },
    updateCustomFields(id, customFields) {
      return request(`/api/solutions/${id}/custom-fields`, {
        method: 'PUT',
        body: JSON.stringify({ customFields }),
      })
    },
  }
}
