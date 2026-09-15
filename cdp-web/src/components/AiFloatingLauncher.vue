<template>
  <button
    ref="launcherRef"
    class="ai-floating-launcher"
    :class="{ 'is-dragging': dragging, 'is-hidden': hidden }"
    :style="launcherStyle"
    type="button"
    aria-label="打开 AI 人群策略师，可拖动位置"
    title="拖动调整位置 · 点击打开 AI（Ctrl + K）"
    @pointerdown="startDrag"
    @keydown.enter.prevent="$emit('open')"
    @keydown.space.prevent="$emit('open')"
  >
    <span class="ai-floating-halo" aria-hidden="true"></span>
    <span class="ai-floating-core" aria-hidden="true"><i></i><i></i><b>AI</b></span>
    <span class="ai-floating-label">AI 圈人</span>
  </button>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  ownerId: { type: String, default: '' },
  hidden: { type: Boolean, default: false },
})
const emit = defineEmits(['open'])

const launcherRef = ref(null)
const dragging = ref(false)
const position = ref(null)
let pointerId = null
let startPoint = null

const launcherStyle = computed(() => position.value
  ? { left: `${position.value.x}px`, top: `${position.value.y}px` }
  : {})

function storageKey() {
  return `xdata:ai-launcher-position:v1:${props.ownerId || 'anonymous'}`
}

function clampPosition(next) {
  const width = launcherRef.value?.offsetWidth || 64
  const height = launcherRef.value?.offsetHeight || 64
  return {
    x: Math.min(Math.max(12, Number(next?.x) || 12), Math.max(12, window.innerWidth - width - 12)),
    y: Math.min(Math.max(76, Number(next?.y) || 76), Math.max(76, window.innerHeight - height - 12)),
  }
}

function defaultPosition() {
  return clampPosition({ x: window.innerWidth - 88, y: window.innerHeight - 96 })
}

function loadPosition() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey()) || 'null')
    position.value = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? clampPosition(saved)
      : defaultPosition()
  } catch {
    position.value = defaultPosition()
  }
}

function savePosition() {
  if (!position.value) return
  try { window.localStorage.setItem(storageKey(), JSON.stringify(position.value)) } catch { /* device preference only */ }
}

function startDrag(event) {
  if (event.button !== 0) return
  pointerId = event.pointerId
  startPoint = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    x: position.value?.x ?? defaultPosition().x,
    y: position.value?.y ?? defaultPosition().y,
    moved: false,
  }
  launcherRef.value?.setPointerCapture?.(pointerId)
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', finishDrag, { once: true })
  window.addEventListener('pointercancel', finishDrag, { once: true })
}

function moveDrag(event) {
  if (!startPoint || event.pointerId !== pointerId) return
  const dx = event.clientX - startPoint.pointerX
  const dy = event.clientY - startPoint.pointerY
  if (Math.hypot(dx, dy) > 5) {
    startPoint.moved = true
    dragging.value = true
  }
  if (dragging.value) position.value = clampPosition({ x: startPoint.x + dx, y: startPoint.y + dy })
}

function finishDrag(event) {
  if (!startPoint || (event.pointerId != null && event.pointerId !== pointerId)) return
  const shouldOpen = !startPoint.moved
  launcherRef.value?.releasePointerCapture?.(pointerId)
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', finishDrag)
  window.removeEventListener('pointercancel', finishDrag)
  pointerId = null
  startPoint = null
  dragging.value = false
  savePosition()
  if (shouldOpen) emit('open')
}

function handleResize() {
  position.value = clampPosition(position.value || defaultPosition())
}

watch(() => props.ownerId, loadPosition)

onMounted(() => {
  loadPosition()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', finishDrag)
  window.removeEventListener('pointercancel', finishDrag)
})
</script>

<style scoped>
.ai-floating-launcher {
  position: fixed;
  z-index: 2800;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  padding: 0;
  color: #fff;
  touch-action: none;
  user-select: none;
  background: rgba(255, 255, 255, .88);
  border: 1px solid rgba(62, 93, 180, .18);
  border-radius: 21px;
  box-shadow: 0 18px 45px rgba(43, 61, 106, .2), inset 0 1px 0 rgba(255, 255, 255, .9);
  backdrop-filter: blur(18px) saturate(1.2);
  cursor: grab;
  transition: opacity 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}
.ai-floating-launcher:hover { transform: translateY(-3px); box-shadow: 0 23px 52px rgba(43, 61, 106, .26), inset 0 1px 0 #fff; }
.ai-floating-launcher:focus-visible { outline: 3px solid rgba(63, 112, 255, .24); outline-offset: 3px; }
.ai-floating-launcher.is-dragging { cursor: grabbing; transition: none; transform: scale(1.03); }
.ai-floating-launcher.is-hidden { opacity: 0; pointer-events: none; transform: scale(.86); }
.ai-floating-halo { position: absolute; inset: 7px; background: conic-gradient(from 190deg, #8cabff, #3f70ff 42%, #9b7df7 70%, #ff8a54); border-radius: 17px; opacity: .16; filter: blur(1px); }
.ai-floating-core { position: relative; display: grid; width: 46px; height: 46px; place-items: center; overflow: hidden; color: #fff; background: linear-gradient(145deg, #315fdc, #507fff); border-radius: 15px; box-shadow: 0 10px 22px rgba(63, 112, 255, .3); }
.ai-floating-core::before { position: absolute; inset: 5px; content: ''; border: 1px solid rgba(255, 255, 255, .32); border-radius: 50%; }
.ai-floating-core i { position: absolute; width: 5px; height: 5px; background: #fff; border-radius: 50%; box-shadow: 0 0 10px #fff; }
.ai-floating-core i:first-child { top: 9px; left: 11px; }
.ai-floating-core i:nth-child(2) { right: 9px; bottom: 11px; width: 3px; height: 3px; opacity: .75; }
.ai-floating-core b { position: relative; font: 760 11px/1 "DIN Alternate", "Roboto Mono", monospace; letter-spacing: .06em; }
.ai-floating-label { position: absolute; right: 70px; padding: 7px 10px; color: #29344c; font-size: 11px; font-weight: 650; white-space: nowrap; background: rgba(255, 255, 255, .96); border: 1px solid rgba(54, 72, 112, .13); border-radius: 9px; box-shadow: 0 10px 28px rgba(40, 55, 89, .12); opacity: 0; pointer-events: none; transform: translateX(7px); transition: opacity 160ms ease, transform 160ms ease; }
.ai-floating-launcher:hover .ai-floating-label, .ai-floating-launcher:focus-visible .ai-floating-label { opacity: 1; transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .ai-floating-launcher, .ai-floating-label { transition: none; } }
</style>
