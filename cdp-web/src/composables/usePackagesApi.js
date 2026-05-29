import { request } from '../utils/apiClient.js'

export function usePackagesApi() {
  return {
    listPackages() {
      return request('/api/packages')
    },
  }
}
