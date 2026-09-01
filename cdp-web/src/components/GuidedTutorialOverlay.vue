<template>
  <Teleport to="body">
    <div v-if="state.active && currentStep" class="guided-tutorial" aria-live="polite">
      <template v-if="targetRect">
        <div class="guided-tutorial__mask" :style="maskTopStyle"></div>
        <div class="guided-tutorial__mask" :style="maskLeftStyle"></div>
        <div class="guided-tutorial__mask" :style="maskRightStyle"></div>
        <div class="guided-tutorial__mask" :style="maskBottomStyle"></div>
        <div class="guided-tutorial__focus" :style="focusStyle" aria-hidden="true"></div>
      </template>
      <div v-else class="guided-tutorial__mask guided-tutorial__mask--full"></div>

      <section
        ref="cardRef"
        class="guided-tutorial__card"
        :class="{ 'is-centered': !targetRect }"
        :style="cardStyle"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`guided-tutorial-title-${currentStep.id}`"
      >
        <div class="guided-tutorial__topline">
          <span>{{ currentStep.eyebrow }}</span>
          <span>{{ state.stepIndex + 1 }} / {{ steps.length }}</span>
        </div>

        <div class="guided-tutorial__progress" aria-hidden="true">
          <i :style="{ width: `${progress}%` }"></i>
        </div>

        <button class="guided-tutorial__exit" type="button" aria-label="退出教程" title="退出教程" @click="stop">
          ×
        </button>

        <h2 :id="`guided-tutorial-title-${currentStep.id}`">{{ currentStep.title }}</h2>
        <p>{{ contextualBody }}</p>

        <div v-if="currentStep.id === 'paste-ids'" class="guided-tutorial__excel-callout">
          <span class="guided-tutorial__excel-badge">实际业务用法</span>
          <strong>可以直接从 Excel 粘贴一整列商品 ID</strong>
          <p>本次先使用示例中的 7 个商品 ID，熟悉流程后可替换为自己的 Excel 数据。</p>
        </div>

        <div v-if="currentStep.id === 'copy-ids'" class="guided-tutorial__id-panel" aria-label="教程商品 ID">
          <div v-for="(id, index) in productIds" :key="id">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <code>{{ id }}</code>
          </div>
        </div>

        <div v-if="currentStep.id === 'final-confirm'" class="guided-tutorial__checklist">
          <span><i>✓</i> 7 个商品 ID</span>
          <span><i>✓</i> {{ behaviorSummary }} · {{ timeSummary }}</span>
          <span><i>✓</i> 节点关系：并</span>
          <span><i>✓</i> {{ state.context.audienceName || '已填写人群包名称' }}</span>
        </div>

        <div v-if="currentStep.id === 'tutorial-complete'" class="guided-tutorial__extension-callout">
          <span class="guided-tutorial__extension-badge">能力拓展</span>
          <strong>不只商品 ID，限量字段都能这样批量拆分</strong>
          <p>类目公域行为中的关键词、类目、品牌等字段，也可以先配置公共参数，再批量输入并拆成并集节点。</p>
          <div class="guided-tutorial__extension-tags" aria-label="可拓展字段">
            <span>关键词</span>
            <span>类目</span>
            <span>品牌</span>
            <span>其他限量字段</span>
          </div>
        </div>

        <div v-if="visibleStatus" class="guided-tutorial__status" :class="statusClass">
          {{ visibleStatus }}
        </div>

        <div class="guided-tutorial__hint">
          <span aria-hidden="true">→</span>
          {{ currentStep.hint }}
        </div>

        <div class="guided-tutorial__actions">
          <button type="button" class="guided-tutorial__secondary" @click="stop">退出教程</button>
          <button
            v-if="showPrimaryAction"
            type="button"
            class="guided-tutorial__primary"
            :disabled="primaryDisabled"
            @click="handlePrimaryAction"
          >
            {{ primaryActionLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGuidedTutorial } from '../composables/useGuidedTutorial.js'

const {
  state,
  currentStep,
  steps,
  productIds,
  stop,
  finish,
  completeStep,
  updateContext,
} = useGuidedTutorial()

const cardRef = ref(null)
const targetRect = ref(null)
let targetElement = null
let mutationObserver = null
let targetResizeObserver = null
let refreshFrame = 0
let targetTrackingFrame = 0
let targetTrackingDeadline = 0
const DEFAULT_FOCUS_GAP = 8
const DEFAULT_FOCUS_RADIUS = 12
const VIEWPORT_MARGIN = 16
const CARD_WIDTH = 372

const progress = computed(() => ((state.stepIndex + 1) / steps.length) * 100)
const focusGap = computed(() => (
  Number.isFinite(currentStep.value?.focusPadding)
    ? currentStep.value.focusPadding
    : DEFAULT_FOCUS_GAP
))

const contextualBody = computed(() => {
  if (currentStep.value?.id === 'automation-running' && state.context.automationStatus === 'failed') {
    return '本次自动化没有成功，教程不会提前结束。请确认自动化插件已经加载、数据引擎可访问，然后点击“重新执行”。'
  }
  return currentStep.value?.body || ''
})

const visibleStatus = computed(() => {
  if (state.context.pasteError && ['paste-ids', 'add-product-ids'].includes(currentStep.value?.id)) {
    return state.context.pasteError
  }
  if (state.context.copyError && currentStep.value?.id === 'copy-ids') return state.context.copyError
  if (state.context.automationError && currentStep.value?.id === 'automation-running') {
    return state.context.automationError
  }
  return ''
})

const statusClass = computed(() => ({ 'is-error': Boolean(visibleStatus.value) }))

const behaviorSummary = computed(() => (
  Array.isArray(state.context.behaviors) && state.context.behaviors.length
    ? state.context.behaviors.join('、')
    : '已选择业务行为'
))

const timeSummary = computed(() => {
  if (state.context.dateMode === 'recent' && Number(state.context.recentDays) > 0) {
    return `过去 ${state.context.recentDays} 天`
  }
  if (state.context.dateMode === 'range' && state.context.dateRange?.length === 2) {
    return `${state.context.dateRange[0]} 至 ${state.context.dateRange[1]}`
  }
  return '已选择时间'
})

const showPrimaryAction = computed(() => [
  'clean-workbench',
  'set-time',
  'copy-ids',
  'inspect-split',
  'name-audience',
  'final-confirm',
  'automation-running',
  'tutorial-complete',
].includes(currentStep.value?.id))

const primaryDisabled = computed(() => {
  if (currentStep.value?.id === 'set-time') {
    const hasRecentRange = state.context.dateMode === 'recent'
      && Number.isFinite(Number(state.context.recentDays))
      && Number(state.context.recentDays) >= 1
    const hasFixedRange = state.context.dateMode === 'range'
      && state.context.dateRange?.length === 2
      && state.context.dateRange.every(Boolean)
    return !hasRecentRange && !hasFixedRange
  }
  if (currentStep.value?.id === 'name-audience') return !String(state.context.audienceName || '').trim()
  if (currentStep.value?.id === 'automation-running') return state.context.automationStatus !== 'failed'
  return false
})

const primaryActionLabel = computed(() => ({
  'clean-workbench': '开始搭建',
  'set-time': '时间已设好',
  'copy-ids': '复制 7 个商品 ID',
  'inspect-split': '结果正确',
  'name-audience': '名称已填好',
  'final-confirm': '确认并开始圈人',
  'automation-running': '重新执行',
  'tutorial-complete': '完成教程',
}[currentStep.value?.id] || '继续'))

const focusStyle = computed(() => ({
  ...rectStyle(targetRect.value),
  borderRadius: `${currentStep.value?.focusRadius ?? DEFAULT_FOCUS_RADIUS}px`,
}))

const maskTopStyle = computed(() => ({
  top: '0px', left: '0px', right: '0px', height: `${Math.max(0, targetRect.value.top - focusGap.value)}px`,
}))
const maskBottomStyle = computed(() => ({
  top: `${Math.min(window.innerHeight, targetRect.value.bottom + focusGap.value)}px`, left: '0px', right: '0px', bottom: '0px',
}))
const maskLeftStyle = computed(() => ({
  top: `${Math.max(0, targetRect.value.top - focusGap.value)}px`,
  left: '0px',
  width: `${Math.max(0, targetRect.value.left - focusGap.value)}px`,
  height: `${Math.min(window.innerHeight, targetRect.value.bottom + focusGap.value) - Math.max(0, targetRect.value.top - focusGap.value)}px`,
}))
const maskRightStyle = computed(() => ({
  top: `${Math.max(0, targetRect.value.top - focusGap.value)}px`,
  left: `${Math.min(window.innerWidth, targetRect.value.right + focusGap.value)}px`,
  right: '0px',
  height: `${Math.min(window.innerHeight, targetRect.value.bottom + focusGap.value) - Math.max(0, targetRect.value.top - focusGap.value)}px`,
}))

const cardStyle = computed(() => {
  if (!targetRect.value) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${Math.min(CARD_WIDTH, window.innerWidth - 32)}px`,
    }
  }

  const rect = targetRect.value
  const width = Math.min(CARD_WIDTH, window.innerWidth - 32)
  const estimatedHeight = cardRef.value?.offsetHeight || 360
  const rightSpace = window.innerWidth - rect.right
  const leftSpace = rect.left
  let left = rect.right + 20
  let top = Math.min(Math.max(rect.top, VIEWPORT_MARGIN), window.innerHeight - estimatedHeight - VIEWPORT_MARGIN)

  if (rightSpace < width + 36 && leftSpace >= width + 36) left = rect.left - width - 20
  else if (rightSpace < width + 36) {
    left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN)
    top = rect.bottom + 20
    if (top + estimatedHeight > window.innerHeight - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, rect.top - estimatedHeight - 20)
  }

  return { top: `${top}px`, left: `${left}px`, width: `${width}px` }
})

function rectStyle(rect) {
  if (!rect) return {}
  return {
    top: `${Math.max(0, rect.top - focusGap.value)}px`,
    left: `${Math.max(0, rect.left - focusGap.value)}px`,
    width: `${Math.min(window.innerWidth, rect.right + focusGap.value) - Math.max(0, rect.left - focusGap.value)}px`,
    height: `${Math.min(window.innerHeight, rect.bottom + focusGap.value) - Math.max(0, rect.top - focusGap.value)}px`,
  }
}

function isVisibleElement(element) {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
}

function updateTargetRect() {
  if (!targetElement || !isVisibleElement(targetElement)) {
    targetRect.value = null
    return
  }
  const rect = targetElement.getBoundingClientRect()
  targetRect.value = {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function trackTargetPosition(duration = 900) {
  cancelAnimationFrame(targetTrackingFrame)
  targetTrackingDeadline = performance.now() + duration

  const track = () => {
    updateTargetRect()
    if (performance.now() < targetTrackingDeadline) {
      targetTrackingFrame = requestAnimationFrame(track)
    }
  }

  targetTrackingFrame = requestAnimationFrame(track)
}

function findTarget({ scroll = false } = {}) {
  cancelAnimationFrame(refreshFrame)
  refreshFrame = requestAnimationFrame(() => {
    const selector = currentStep.value?.target
    const candidates = selector ? [...document.querySelectorAll(selector)] : []
    const nextTarget = candidates.find(isVisibleElement) || null

    if (targetElement !== nextTarget) {
      targetResizeObserver?.disconnect()
      targetElement = nextTarget
      if (targetElement && targetResizeObserver) targetResizeObserver.observe(targetElement)
    }

    if (scroll && targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      // The paste preview expands and the canvas scrolls at the same time. Keep
      // following the live button rect until both motions have fully settled.
      trackTargetPosition()
    }
    updateTargetRect()
  })
}

async function copyTutorialIds() {
  const text = productIds.join('\n')
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (!copied) throw new Error('copy failed')
    } catch {
      updateContext({ copyError: '未能自动写入剪贴板，请选中上方 ID 后手动复制。' })
      return
    }
  }
  updateContext({ copyError: '' })
  completeStep('copy-ids')
}

function requestTutorialAutomation() {
  updateContext({ automationStatus: 'running', automationError: '' })
  if (currentStep.value?.id === 'final-confirm') completeStep('final-confirm')
  window.dispatchEvent(new CustomEvent('cdp:tutorial-confirm-automation'))
}

function handlePrimaryAction() {
  const stepId = currentStep.value?.id
  if (stepId === 'copy-ids') {
    void copyTutorialIds()
    return
  }
  if (stepId === 'final-confirm' || stepId === 'automation-running') {
    requestTutorialAutomation()
    return
  }
  if (stepId === 'tutorial-complete') {
    finish()
    return
  }
  completeStep(stepId)
}

function handleViewportChange() {
  findTarget()
}

watch(
  [() => state.active, () => state.stepIndex, () => state.context.nodeCount],
  async ([active]) => {
    if (!active) {
      cancelAnimationFrame(targetTrackingFrame)
      targetRect.value = null
      targetElement = null
      return
    }
    await nextTick()
    findTarget({ scroll: true })
  },
  { immediate: true },
)

onMounted(() => {
  targetResizeObserver = new ResizeObserver(updateTargetRect)
  mutationObserver = new MutationObserver(() => findTarget())
  mutationObserver.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
  findTarget({ scroll: true })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(refreshFrame)
  cancelAnimationFrame(targetTrackingFrame)
  mutationObserver?.disconnect()
  targetResizeObserver?.disconnect()
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style scoped>
.guided-tutorial {
  position: fixed;
  z-index: 5000;
  inset: 0;
  pointer-events: none;
  color: #16324f;
}

.guided-tutorial__mask {
  position: fixed;
  z-index: 5000;
  pointer-events: auto;
  background: linear-gradient(
    135deg,
    rgba(74, 157, 240, .1),
    rgba(163, 213, 255, .07) 58%,
    rgba(91, 171, 244, .1)
  );
  background-attachment: fixed;
  background-size: 100vw 100vh;
}

.guided-tutorial__mask--full { inset: 0; }

.guided-tutorial__focus {
  position: fixed;
  z-index: 5001;
  box-sizing: border-box;
  pointer-events: none;
  border: 2px solid #1486f2;
  border-radius: 12px;
  box-shadow: 0 0 0 4px rgba(20, 134, 242, .18), 0 12px 34px rgba(28, 103, 175, .22);
  transition: top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease;
}

.guided-tutorial__card {
  position: fixed;
  z-index: 5002;
  box-sizing: border-box;
  pointer-events: auto;
  padding: 24px;
  background: rgba(255, 255, 255, .97);
  border: 1px solid rgba(87, 145, 203, .28);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(35, 94, 151, .24), 0 2px 8px rgba(35, 94, 151, .08);
  transition: top 180ms ease, left 180ms ease;
}

.guided-tutorial__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 28px;
  color: #247ac7;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.guided-tutorial__progress {
  height: 3px;
  margin: 10px 0 20px;
  overflow: hidden;
  background: #e7f1fb;
  border-radius: 99px;
}

.guided-tutorial__progress i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #1677d2, #63b5ff);
  border-radius: inherit;
  transition: width 220ms ease;
}

.guided-tutorial__exit {
  position: absolute;
  top: 15px;
  right: 16px;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  color: #7791aa;
  font: 400 20px/1 system-ui, sans-serif;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.guided-tutorial__exit:hover { color: #173b5d; background: #edf6ff; }

.guided-tutorial__card h2 {
  margin: 0;
  color: #123453;
  font-size: 21px;
  font-weight: 720;
  line-height: 1.28;
  letter-spacing: -.035em;
}

.guided-tutorial__card > p {
  margin: 12px 0 0;
  color: #516b83;
  font-size: 13px;
  line-height: 1.72;
}

.guided-tutorial__excel-callout {
  margin-top: 15px;
  padding: 13px 14px 12px;
  background: linear-gradient(135deg, #eef8ff, #f8fcff);
  border: 1px solid #a9d6f6;
  border-left: 4px solid #1688dc;
  border-radius: 10px;
  box-shadow: 0 8px 22px rgba(31, 119, 190, .1);
}

.guided-tutorial__excel-badge {
  display: inline-flex;
  margin-bottom: 7px;
  padding: 4px 7px;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .08em;
  background: #167ecb;
  border-radius: 99px;
}

.guided-tutorial__excel-callout strong {
  display: block;
  color: #123f64;
  font-size: 13px;
  line-height: 1.45;
}

.guided-tutorial__excel-callout p {
  margin: 5px 0 0;
  color: #4d6f8b;
  font-size: 11px;
  line-height: 1.6;
}

.guided-tutorial__id-panel {
  display: grid;
  gap: 5px;
  margin-top: 16px;
  padding: 12px;
  background: #f5faff;
  border: 1px solid #cfe5fa;
  border-radius: 11px;
  box-shadow: inset 0 0 0 2px rgba(26, 133, 232, .05);
}

.guided-tutorial__id-panel div { display: grid; grid-template-columns: 28px 1fr; align-items: center; }
.guided-tutorial__id-panel span { color: #83a2bd; font: 700 9px/1 ui-monospace, monospace; }
.guided-tutorial__id-panel code { color: #1e5f98; font: 600 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }

.guided-tutorial__checklist {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  padding: 14px;
  color: #35536d;
  font-size: 12px;
  background: #f6fbff;
  border-radius: 10px;
}

.guided-tutorial__checklist span { display: flex; align-items: center; gap: 8px; }
.guided-tutorial__checklist i { color: #168263; font-style: normal; font-weight: 800; }

.guided-tutorial__extension-callout {
  margin-top: 16px;
  padding: 15px 16px;
  background: linear-gradient(135deg, #e9f6ff, #f7fbff);
  border: 1px solid #b9ddf8;
  border-left: 4px solid #1385df;
  border-radius: 11px;
  box-shadow: 0 10px 26px rgba(31, 119, 190, .12);
}

.guided-tutorial__extension-badge {
  display: inline-flex;
  margin-bottom: 9px;
  padding: 4px 8px;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .1em;
  background: #147fd0;
  border-radius: 99px;
}

.guided-tutorial__extension-callout strong {
  display: block;
  color: #123f64;
  font-size: 14px;
  line-height: 1.45;
}

.guided-tutorial__extension-callout p {
  margin: 7px 0 11px;
  color: #4d6f8b;
  font-size: 11px;
  line-height: 1.65;
}

.guided-tutorial__extension-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.guided-tutorial__extension-tags span {
  padding: 5px 8px;
  color: #1767a5;
  font-size: 10px;
  font-weight: 650;
  background: #fff;
  border: 1px solid #c5e1f5;
  border-radius: 6px;
}

.guided-tutorial__status {
  margin-top: 14px;
  padding: 9px 11px;
  color: #9b3f35;
  font-size: 11px;
  line-height: 1.5;
  background: #fff2f0;
  border: 1px solid #ffd5cf;
  border-radius: 8px;
}

.guided-tutorial__hint {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 12px;
  color: #2d6b9f;
  font-size: 11px;
  line-height: 1.55;
  background: #edf7ff;
  border-radius: 9px;
}

.guided-tutorial__hint > span { color: #1688e8; font-weight: 800; }

.guided-tutorial__actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 18px;
}

.guided-tutorial__actions button {
  height: 35px;
  padding: 0 14px;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  border-radius: 9px;
  cursor: pointer;
}

.guided-tutorial__secondary { color: #688198; background: #fff; border: 1px solid #d7e4ef; }
.guided-tutorial__primary { color: #fff; background: linear-gradient(135deg, #1178d1, #2799ef); border: 1px solid #1178d1; box-shadow: 0 7px 16px rgba(19, 123, 213, .2); }
.guided-tutorial__primary:disabled { color: #91a7ba; background: #eaf1f7; border-color: #e2eaf1; box-shadow: none; cursor: not-allowed; }
.guided-tutorial__actions button:focus-visible,
.guided-tutorial__exit:focus-visible { outline: 3px solid rgba(20, 134, 242, .34); outline-offset: 2px; }

@media (max-width: 760px) {
  .guided-tutorial__card {
    top: auto !important;
    right: 12px;
    bottom: 12px;
    left: 12px !important;
    width: auto !important;
    max-height: min(64vh, 620px);
    overflow-y: auto;
    transform: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .guided-tutorial__focus,
  .guided-tutorial__card,
  .guided-tutorial__progress i { transition: none; }
}

@media (prefers-reduced-transparency: reduce) {
  .guided-tutorial__mask { background: #dceeff; backdrop-filter: none; }
  .guided-tutorial__card { background: #fff; }
}
</style>
