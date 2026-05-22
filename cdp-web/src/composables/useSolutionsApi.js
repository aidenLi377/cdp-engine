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
  const { signal, ...fetchOptions } = options
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
    },
    ...fetchOptions,
    signal,
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
    listSolutions(status, { signal } = {}) {
      return request(buildUrl('/api/solutions', { status }), { signal })
    },
    getSolution(id, { signal } = {}) {
      return request(`/api/solutions/${id}`, { signal })
    },
    createDraft(body, { signal } = {}) {
      return request('/api/solutions/drafts', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      })
    },
    updateDraft(id, body, { signal } = {}) {
      return request(`/api/solutions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        signal,
      })
    },
    publishSolution(id, { signal } = {}) {
      return request(`/api/solutions/${id}/publish`, {
        method: 'POST',
        signal,
      })
    },
    createEditDraft(id, { signal } = {}) {
      return request(`/api/solutions/${id}/edit-draft`, {
        method: 'POST',
        signal,
      })
    },
    duplicateSolution(id, { signal } = {}) {
      return request(`/api/solutions/${id}/duplicate`, {
        method: 'POST',
        signal,
      })
    },
    deleteSolution(id, { signal } = {}) {
      return request(`/api/solutions/${id}`, {
        method: 'DELETE',
        signal,
      })
    },
    updateCustomFields(id, customFields, nodes, { signal } = {}) {
      const body = { customFields }
      if (nodes !== undefined) body.nodes = nodes
      return request(`/api/solutions/${id}/custom-fields`, {
        method: 'PUT',
        body: JSON.stringify(body),
        signal,
      })
    },
  }
}
