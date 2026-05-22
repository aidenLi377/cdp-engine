import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

export function useCascadingEntry(refs, options = {}) {
  const { staggerDelay = 40 } = options
  const entered = ref(false)

  onMounted(() => {
    requestAnimationFrame(() => {
      entered.value = true
    })
  })

  function delay(index) {
    return `${index * staggerDelay}ms`
  }

  return { entered, delay }
}

export function useDragElastic() {
  const offsetX = ref(0)
  const offsetY = ref(0)
  let animationFrame = null

  function onDragMove(event) {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = requestAnimationFrame(() => {
      offsetX.value = event.movementX || 0
      offsetY.value = event.movementY || 0
    })
  }

  function onDragEnd() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    offsetX.value = 0
    offsetY.value = 0
  }

  function cleanup() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
  }

  return { offsetX, offsetY, onDragMove, onDragEnd, cleanup }
}

export function useStateTransition(current) {
  const phase = ref('idle')
  let timer = null

  watch(() => current.value ?? current, (newVal, oldVal) => {
    if (newVal === oldVal) return
    clearTimeout(timer)
    phase.value = 'entering'
    timer = setTimeout(() => {
      phase.value = 'idle'
    }, 300)
  })

  function cleanup() {
    clearTimeout(timer)
  }

  return { phase, cleanup }
}
