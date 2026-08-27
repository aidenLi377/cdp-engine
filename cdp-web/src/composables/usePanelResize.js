import { onBeforeUnmount, onMounted, ref } from 'vue'

const PANEL_WIDTH_STORAGE_VERSION = 'v1'

export function clampPanelWidth(value, minWidth, maxWidth) {
  const numericValue = Number(value)
  const safeValue = Number.isFinite(numericValue) ? numericValue : minWidth
  return Math.round(Math.min(Math.max(safeValue, minWidth), Math.max(minWidth, maxWidth)))
}

export function panelWidthStorageKey(panelId, ownerId = '') {
  return `cdp.panel-width:${PANEL_WIDTH_STORAGE_VERSION}:${ownerId || 'anonymous'}:${panelId}`
}

function readStoredWidth(storageKey, fallback, minWidth, maxWidth) {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return clampPanelWidth(stored === null ? fallback : Number(stored), minWidth, maxWidth)
  } catch {
    return clampPanelWidth(fallback, minWidth, maxWidth)
  }
}

function persistWidth(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, String(value))
  } catch {
    // The resize interaction still works when storage is unavailable.
  }
}

export function usePanelResize({
  panelId,
  ownerId,
  defaultWidth,
  minWidth,
  maxWidth,
  edge = 'right',
  keyboardStep = 12,
  applyWidth,
  getDynamicMaxWidth,
}) {
  const storageKey = panelWidthStorageKey(panelId, ownerId)
  const width = ref(readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth))

  let liveWidth = width.value
  let startX = 0
  let startWidth = liveWidth
  let activePointerId = null
  let activeHandle = null
  let pendingWidth = null
  let resizeFrame = 0

  const direction = edge === 'left' ? -1 : 1

  function resolvedMaxWidth() {
    const dynamicMax = Number(getDynamicMaxWidth?.())
    if (!Number.isFinite(dynamicMax)) return maxWidth
    return Math.min(maxWidth, Math.max(minWidth, dynamicMax))
  }

  function applyLiveWidth(nextWidth) {
    liveWidth = clampPanelWidth(nextWidth, minWidth, resolvedMaxWidth())
    applyWidth(liveWidth)
    activeHandle?.setAttribute('aria-valuenow', String(liveWidth))
  }

  function flushPendingWidth() {
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
    }
    if (pendingWidth !== null) {
      applyLiveWidth(pendingWidth)
      pendingWidth = null
    }
  }

  function scheduleWidth(nextWidth) {
    pendingWidth = nextWidth
    if (resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      if (pendingWidth === null) return
      const next = pendingWidth
      pendingWidth = null
      applyLiveWidth(next)
    })
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointerId) return
    scheduleWidth(startWidth + (event.clientX - startX) * direction)
  }

  function removePointerListeners() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finishResize)
    window.removeEventListener('pointercancel', finishResize)
  }

  function finishResize(event) {
    if (activePointerId === null || (event?.pointerId != null && event.pointerId !== activePointerId)) return
    flushPendingWidth()
    width.value = liveWidth
    persistWidth(storageKey, liveWidth)

    try {
      activeHandle?.releasePointerCapture?.(activePointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }

    activeHandle?.classList.remove('is-resizing')
    document.documentElement.classList.remove('is-panel-resizing')
    activeHandle = null
    activePointerId = null
    removePointerListeners()
  }

  function startResize(event) {
    if (event.button !== 0 || event.isPrimary === false) return
    event.preventDefault()

    if (activePointerId !== null) finishResize()

    activeHandle = event.currentTarget
    activePointerId = event.pointerId
    startX = event.clientX
    startWidth = liveWidth

    activeHandle.classList.add('is-resizing')
    activeHandle.setPointerCapture?.(event.pointerId)
    document.documentElement.classList.add('is-panel-resizing')
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
  }

  function onResizeKeydown(event) {
    let nextWidth = liveWidth
    const step = event.shiftKey ? keyboardStep * 3 : keyboardStep

    if (event.key === 'ArrowLeft') nextWidth += -step * direction
    else if (event.key === 'ArrowRight') nextWidth += step * direction
    else if (event.key === 'Home') nextWidth = minWidth
    else if (event.key === 'End') nextWidth = resolvedMaxWidth()
    else return

    event.preventDefault()
    applyLiveWidth(nextWidth)
    width.value = liveWidth
    persistWidth(storageKey, liveWidth)
  }

  onMounted(() => applyLiveWidth(liveWidth))
  onBeforeUnmount(() => {
    flushPendingWidth()
    activeHandle?.classList.remove('is-resizing')
    document.documentElement.classList.remove('is-panel-resizing')
    removePointerListeners()
  })

  return {
    width,
    startResize,
    onResizeKeydown,
  }
}
