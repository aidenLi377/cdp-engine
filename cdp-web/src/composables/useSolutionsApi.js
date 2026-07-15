import { buildUrl, request } from '../utils/apiClient.js'

export function useSolutionsApi() {
  return {
    listSolutions(status, scope = 'mine', { signal } = {}) {
      return request(buildUrl('/api/solutions', { status, scope }), { signal })
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
