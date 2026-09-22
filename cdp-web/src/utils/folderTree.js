function visitFolderTree(folders, visitor) {
  for (const folder of folders || []) {
    visitor(folder)
    visitFolderTree(folder.children || [], visitor)
  }
}

export function findFolderById(folders, folderId) {
  let match = null
  visitFolderTree(folders, (folder) => {
    if (!match && String(folder?.id || '') === String(folderId || '')) match = folder
  })
  return match
}

export function collectFolderSubtreeIds(folders, folderId) {
  const root = findFolderById(folders, folderId)
  if (!root) return new Set(folderId ? [folderId] : [])

  const ids = new Set()
  visitFolderTree([root], (folder) => {
    if (folder?.id) ids.add(folder.id)
  })
  return ids
}

export function buildFolderSubtreeCounts(folders, items, getFolderId = item => item?.folderId) {
  const directCounts = new Map()
  for (const item of items || []) {
    const folderId = getFolderId(item)
    if (!folderId) continue
    directCounts.set(folderId, (directCounts.get(folderId) || 0) + 1)
  }

  const counts = {}
  function countFolder(folder) {
    const childCount = (folder.children || []).reduce(
      (total, child) => total + countFolder(child),
      0,
    )
    const total = (directCounts.get(folder.id) || 0) + childCount
    counts[folder.id] = total
    return total
  }

  for (const folder of folders || []) countFolder(folder)
  return counts
}
