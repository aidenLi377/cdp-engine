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

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (response.status === 204) return null

  const data = await response.json()
  if (!response.ok) {
    const message = data?.error || `Request failed with status ${response.status}`
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
  }
}
