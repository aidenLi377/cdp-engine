export function parseCrowdBatch(text) {
  if (typeof text !== 'string') {
    return { items: [], duplicateCount: 0, inputCount: 0 }
  }

  const rawItems = text
    .split(/[\n,;，；\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const seen = new Set()
  const items = []
  let duplicateCount = 0

  for (const item of rawItems) {
    if (seen.has(item)) {
      duplicateCount += 1
      continue
    }
    seen.add(item)
    items.push(item)
  }

  return { items, duplicateCount, inputCount: rawItems.length }
}
