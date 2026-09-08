<template>
  <Teleport to="body">
    <div
      v-if="state.active && currentStep"
      class="guided-tutorial"
      :class="{ 'is-non-blocking': isNonBlockingStep }"
      aria-live="polite"
    >
      <template v-if="!isNonBlockingStep && targetRect">
        <div class="guided-tutorial__mask" :style="maskTopStyle"></div>
        <div class="guided-tutorial__mask" :style="maskLeftStyle"></div>
        <div class="guided-tutorial__mask" :style="maskRightStyle"></div>
        <div class="guided-tutorial__mask" :style="maskBottomStyle"></div>
        <div class="guided-tutorial__focus" :style="focusStyle" aria-hidden="true"></div>
      </template>
      <div v-else-if="!isNonBlockingStep" class="guided-tutorial__mask guided-tutorial__mask--full"></div>

      <section
        ref="cardRef"
        class="guided-tutorial__card"
        :class="{
          'is-centered': !targetRect && !isNonBlockingStep,
          'is-progress-card': isNonBlockingStep,
          'is-dialog-companion': isDialogCompanionStep,
          'is-collapsed': cardCollapsed && isNonBlockingStep,
        }"
        :style="cardStyle"
        role="dialog"
        :aria-modal="isNonBlockingStep ? 'false' : 'true'"
        :aria-labelledby="`guided-tutorial-title-${currentStep.id}`"
      >
        <button
          v-if="isNonBlockingStep"
          class="guided-tutorial__collapse"
          :class="{ 'is-collapsed': cardCollapsed }"
          type="button"
          :aria-label="cardCollapsed ? '展开操作指引' : '收起操作指引'"
          :title="cardCollapsed ? '展开操作指引' : '收起操作指引'"
          @click="cardCollapsed = !cardCollapsed"
        ><span aria-hidden="true"></span></button>
        <div class="guided-tutorial__topline">
          <span>{{ currentStep.phase || currentStep.eyebrow }}</span>
          <span>{{ phaseProgress }}</span>
        </div>

        <div class="guided-tutorial__progress" aria-hidden="true">
          <i :style="{ width: `${progress}%` }"></i>
        </div>

        <div v-if="showPullCourseProgress" class="guided-tutorial__course-progress" aria-label="拉力方案组课程进度">
          <span
            v-for="(lesson, index) in pullCourseLessons"
            :key="lesson"
            :class="{ active: pullCourseLesson === index + 1, done: pullCourseLesson > index + 1 }"
            :aria-current="pullCourseLesson === index + 1 ? 'step' : undefined"
          >
            <i>{{ pullCourseLesson > index + 1 ? '✓' : index + 1 }}</i>
            <b>{{ lesson }}</b>
          </span>
        </div>

        <button class="guided-tutorial__exit" type="button" aria-label="退出教程" title="退出教程" @click="stop">
          ×
        </button>

        <h2 :id="`guided-tutorial-title-${currentStep.id}`">{{ displayTitle }}</h2>
        <p>{{ contextualBody }}</p>

        <div v-if="currentStep.id === 'open-analysis-field'" class="guided-tutorial__efficiency-callout">
          <span>业务提效</span>
          <strong>只换 2 个业务参数，直接复用整套圈人逻辑</strong>
          <p>无需重新搭节点，也不用重复配置浏览、天猫、近 30 天和交集关系。</p>
        </div>

        <div v-if="currentStep.id === 'pull-move-three-solutions'" class="guided-tutorial__drag-demo" aria-hidden="true">
          <div><i></i><i></i><i></i></div>
          <span>拖入</span>
          <b>拉力分析</b>
          <small>已完成 {{ state.context.pullFolderMemberIds.length || 0 }} / 3</small>
        </div>

        <div v-if="currentStep.id === 'pull-enter-group'" class="guided-tutorial__aggregate-map">
          <div><strong>分析类目</strong><span>3个方案</span><b>8处绑定</b></div>
          <div><strong>本品牌</strong><span>3个方案</span><b>4处绑定</b></div>
          <div><strong>竞争品牌</strong><span>3个方案</span><b>4处绑定</b></div>
          <p>同名 + 同类型，才会合并为一个公共参数</p>
        </div>

        <div v-if="currentStep.id === 'pull-inspect-group-packages'" class="guided-tutorial__package-checklist">
          <span
            v-for="(name, index) in state.context.pullBatchPackageNames"
            :key="`${index}-${name}`"
            :class="{ checked: state.context.pullVisitedPackageIndexes.includes(index) }"
          >
            <i>{{ state.context.pullVisitedPackageIndexes.includes(index) ? '✓' : index + 1 }}</i>
            <b>{{ name }}</b>
          </span>
        </div>

        <div v-if="currentStep.id === 'pull-explain-aggregation-origin'" class="guided-tutorial__aggregate-origin">
          <article>
            <header><strong>分析类目</strong><b>8处</b></header>
            <p><span>共同浏览 2</span><span>购买本品 3</span><span>购买竞品 3</span></p>
          </article>
          <article>
            <header><strong>本品牌</strong><b>4处</b></header>
            <p><span>共同浏览 1</span><span>购买本品 2</span><span>购买竞品 1</span></p>
          </article>
          <article>
            <header><strong>竞争品牌</strong><b>4处</b></header>
            <p><span>共同浏览 1</span><span>购买本品 1</span><span>购买竞品 2</span></p>
          </article>
          <small>字段名称与类型都一致，系统才会把来源绑定合并到同一个入口。</small>
        </div>

        <div v-if="currentStep.id === 'pull-explain-aggregation-impact'" class="guided-tutorial__impact-demo" aria-label="组合参数影响范围演示">
          <strong>分析类目</strong>
          <div aria-hidden="true"><i></i><i></i><i></i></div>
          <p><span>共同浏览</span><span>购买本品</span><span>购买竞品</span></p>
          <small>修改 1 次 → 同步 3 个方案的 8 处绑定</small>
        </div>

        <div v-if="currentStep.id === 'paste-ids'" class="guided-tutorial__excel-callout">
          <span class="guided-tutorial__excel-badge">实际业务用法</span>
          <strong>可以直接从 Excel 粘贴一整列商品 ID</strong>
          <p>本次先使用示例中的 7 个商品 ID，熟悉流程后可替换为自己的 Excel 数据。</p>
        </div>

        <div v-if="currentStep.id === 'input-dmp-crowds'" class="guided-tutorial__excel-callout">
          <span class="guided-tutorial__excel-badge">两种输入方式</span>
          <strong>逐个输入后回车，或从 Excel 直接粘贴一整列</strong>
          <p>当前已识别 {{ state.context.audienceCount || 0 }} 个；教程至少需要 2 个，人群包名称会自动去重。</p>
        </div>

        <div v-if="copyableNameItems.length" class="guided-tutorial__copy-panel" aria-label="可直接复制的名称">
          <div class="guided-tutorial__copy-panel-head">
            <span class="guided-tutorial__copy-panel-badge">可直接复制</span>
            <span>点击右侧按钮，粘贴到对应输入框</span>
          </div>
          <div v-for="item in copyableNameItems" :key="item.id" class="guided-tutorial__copy-item">
            <div class="guided-tutorial__copy-item-head">
              <span>{{ item.label }}</span>
              <button
                type="button"
                class="guided-tutorial__copy-button"
                :aria-label="`复制${item.label}`"
                @click.stop="copyTutorialName(item)"
              >{{ copiedTutorialNameId === item.id ? '已复制' : '复制' }}</button>
            </div>
            <code>{{ item.value }}</code>
          </div>
          <p v-if="tutorialNameCopyError" class="guided-tutorial__copy-error" role="alert">{{ tutorialNameCopyError }}</p>
        </div>

        <div v-if="['parameter-paste-brands', 'combo-paste'].includes(currentStep.id)" class="guided-tutorial__copy-panel guided-tutorial__brand-table">
          <div class="guided-tutorial__copy-item-head">
            <span>{{ currentStep.id === 'combo-paste' ? '3 行品牌 × 3 个方案 → 9 个包' : '4 行品牌 → 4 个人群包' }}</span>
            <button type="button" class="guided-tutorial__copy-button" @click="copyTutorialName(parameterBrandColumn)">
              {{ copiedTutorialNameId === parameterBrandColumn.id ? '已复制' : '复制整列' }}
            </button>
          </div>
          <table aria-label="可复制的四个竞争品牌">
            <thead><tr><th>竞争品牌</th></tr></thead>
            <tbody><tr v-for="brand in tutorialBrandValues" :key="brand"><td>{{ brand }}</td></tr></tbody>
          </table>
          <small>复制按钮仅复制品牌名单，不含表头。</small>
          <p v-if="tutorialNameCopyError" class="guided-tutorial__copy-error" role="alert">{{ tutorialNameCopyError }}</p>
        </div>

        <div v-if="currentStep.id === 'parameter-inspect-tasks'" class="guided-tutorial__efficiency-callout">
          <span>业务提效</span>
          <strong>只换一列品牌，复用同一份圈人条件</strong>
          <p>四个品牌各建一个包；购买、化妆水/爽肤水、天猫、近 30 天保持一致，方便后续对比。</p>
        </div>

        <div v-if="currentStep.id === 'select-dmp-tags'" class="guided-tutorial__tag-checklist">
          <span
            v-for="tag in dmpTags"
            :key="tag.tagId"
            :class="{ selected: state.context.selectedTagIds.includes(tag.tagId) }"
          >
            <i>{{ state.context.selectedTagIds.includes(tag.tagId) ? '✓' : '' }}</i>
            <b>{{ tag.name }}</b>
          </span>
        </div>

        <div v-if="currentStep.warning" class="guided-tutorial__warning" role="alert">
          <span class="guided-tutorial__warning-icon" aria-hidden="true">!</span>
          <div>
            <strong>{{ currentStep.warning.title }}</strong>
            <p>{{ currentStep.warning.body }}</p>
          </div>
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

        <div v-if="currentStep.id === 'wait-dmp-batch'" class="guided-tutorial__batch-progress">
          <div>
            <strong>{{ dmpBatchStatusTitle }}</strong>
            <span>{{ state.context.batchCompletedCount || 0 }} / {{ state.context.audienceCount || 0 }}</span>
          </div>
          <div class="guided-tutorial__batch-meter" aria-hidden="true">
            <i :style="{ width: `${dmpBatchProgress}%` }"></i>
          </div>
          <ul v-if="state.context.batchFailedNames.length">
            <li v-for="name in state.context.batchFailedNames" :key="name">{{ name }}</li>
          </ul>
        </div>

        <div v-if="currentStep.id === 'select-comparison-metrics'" class="guided-tutorial__metric-notes">
          <article>
            <strong>人群占比</strong>
            <p>达摩盘返回的 rate × 100%，代表该明细在当前人群包中的原始覆盖比例。</p>
          </article>
          <article>
            <strong>Rebase 人群占比</strong>
            <p>当前明细占比 ÷ 同一标签全部有效明细占比之和 × 100%。它是标签内部归一化后的构成，不是另一批人群的覆盖率。</p>
          </article>
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

        <div v-if="currentStep.id === 'dmp-tutorial-complete'" class="guided-tutorial__extension-callout">
          <span class="guided-tutorial__extension-badge">本次已掌握</span>
          <strong>批量输入、失败处理、横向对比和两类排序已经串成完整流程</strong>
          <p>以后只需更换标签和 Excel 中的人群包名单，就能按当前表格结构快速复用。</p>
          <div class="guided-tutorial__extension-tags">
            <span>Excel 一列粘贴</span><span>失败项重试</span><span>标签排序</span><span>人群包排序</span>
          </div>
        </div>

        <div v-if="currentStep.id === 'inspect-field-map'" class="guided-tutorial__field-map" aria-label="自定义字段绑定关系">
          <div class="is-one-to-many">
            <strong>分析类目</strong>
            <span><i></i><b>本品节点 · 类目</b><b>竞品节点 · 类目</b></span>
          </div>
          <div><strong>本品牌</strong><span><i></i><b>本品节点 · 标准品牌</b></span></div>
          <div><strong>竞争品牌</strong><span><i></i><b>竞品节点 · 标准品牌</b></span></div>
        </div>

        <div v-if="currentStep.id === 'solution-tutorial-complete'" class="guided-tutorial__solution-results">
          <article><strong>1</strong><span>正式方案</span></article>
          <article><strong>3</strong><span>自定义字段</span></article>
          <article><strong>2</strong><span>成功圈人</span></article>
          <p><b>第二次应用</b>修改 2 个参数 · 新增 0 个节点</p>
        </div>

        <div v-if="['pull-wait-baseline', 'pull-wait-second'].includes(currentStep.id)" class="guided-tutorial__batch-progress">
          <div>
            <strong>{{ pullBatchStatusTitle }}</strong>
            <span>{{ state.context.pullBatchCompletedCount || 0 }} / 3</span>
          </div>
          <div class="guided-tutorial__batch-meter" aria-hidden="true">
            <i :style="{ width: `${Math.min(100, ((state.context.pullBatchCompletedCount || 0) / 3) * 100)}%` }"></i>
          </div>
          <ul v-if="state.context.pullBatchFailedNames.length">
            <li v-for="name in state.context.pullBatchFailedNames" :key="name">{{ name }}</li>
          </ul>
        </div>

        <div v-if="currentStep.id === 'pull-baseline-complete'" class="guided-tutorial__solution-results">
          <article><strong>3/3</strong><span>默认场景成功</span></article>
          <article><strong>0</strong><span>重新搭建节点</span></article>
          <article><strong>2</strong><span>下一轮改参</span></article>
          <p><b>对照已建立</b>化妆水/爽肤水 · SK-II × 资生堂</p>
        </div>

        <div v-if="currentStep.id === 'pull-group-complete'" class="guided-tutorial__solution-results is-pull-result">
          <article><strong>2</strong><span>新正式方案</span></article>
          <article><strong>1</strong><span>拉力方案组</span></article>
          <article><strong>2轮</strong><span>参数场景</span></article>
          <article><strong>6</strong><span>成功圈人任务</span></article>
          <p><b>核心提效</b>只改2个组合参数 · 同步3个方案 · 更新12处业务配置</p>
        </div>

        <div v-if="currentStep.id === 'parameter-wait-automation'" class="guided-tutorial__batch-progress">
          <div>
            <strong>{{ parameterBatchStatusTitle }}</strong>
            <span>{{ state.context.parameterBatchCompletedCount || 0 }} / 4</span>
          </div>
          <div class="guided-tutorial__batch-meter" aria-hidden="true">
            <i :style="{ width: `${Math.min(100, ((state.context.parameterBatchCompletedCount || 0) / 4) * 100)}%` }"></i>
          </div>
          <ul v-if="state.context.parameterBatchFailedNames.length">
            <li v-for="name in state.context.parameterBatchFailedNames" :key="name">{{ name }}</li>
          </ul>
        </div>

        <div v-if="currentStep.id === 'parameter-batch-complete'" class="guided-tutorial__solution-results">
          <article><strong>1</strong><span>可复用方案</span></article>
          <article><strong>1列</strong><span>竞争品牌参数</span></article>
          <article><strong>4/4</strong><span>成功圈人</span></article>
          <p>下次更换 Excel 品牌名单，就能批量准备新的竞品人群。</p>
        </div>

        <div v-if="visibleStatus" class="guided-tutorial__status" :class="statusClass">
          {{ visibleStatus }}
        </div>

        <div class="guided-tutorial__hint">
          <span aria-hidden="true">→</span>
          {{ displayHint }}
        </div>

        <div class="guided-tutorial__actions">
          <button type="button" class="guided-tutorial__secondary" @click="stop">退出教程</button>
          <button
            v-if="currentStep?.id === 'parameter-create-tasks' && !showTargetRecoveryAction"
            type="button"
            class="guided-tutorial__secondary"
            @click="goToStep('parameter-paste-brands')"
          >修改品牌名单</button>
          <button
            v-if="showDmpEditAction"
            type="button"
            class="guided-tutorial__secondary"
            @click="editDmpBatch"
          >修改名单</button>
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
import {
  CATEGORY_ITEM_TUTORIAL_VALUES,
  COMBINATION_BATCH_TUTORIAL_ID,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
} from '../utils/guidedTutorialConfig.js'

const {
  state,
  currentStep,
  steps,
  productIds,
  dmpTags,
  solutionValues,
  pullAnalysisValues,
  parameterBatchValues,
  stop,
  finish,
  completeStep,
  goToStep,
  updateContext,
} = useGuidedTutorial()

const cardRef = ref(null)
const cardCollapsed = ref(false)
watch(() => currentStep.value?.id, () => { cardCollapsed.value = false })
const targetRect = ref(null)
const systemDialogActive = ref(false)
const systemDialogConfirmLabel = ref('')
let targetElement = null
let mutationObserver = null
let targetResizeObserver = null
let refreshFrame = 0
let targetTrackingFrame = 0
let targetTrackingDeadline = 0
let lastResolvedSelector = ''
let tutorialNameCopyResetTimer = 0
let targetScrollCorrectionTimers = []
let dialogHandoffTimers = []
const DEFAULT_FOCUS_GAP = 8
const DEFAULT_FOCUS_RADIUS = 12
const VIEWPORT_MARGIN = 16
const CARD_WIDTH = 372
const DIALOG_COMPANION_MIN_WIDTH = 286
const targetRecoveryStepMap = Object.freeze({
  'input-dmp-crowds': 'open-dmp-batch',
  'confirm-dmp-batch': 'open-dmp-batch',
  'add-product-ids': 'paste-ids',
  'confirm-split': 'add-product-ids',
  'sort-label-order': 'open-label-order',
  'confirm-publish-tutorial-solution': 'publish-tutorial-solution',
  'change-analysis-category': 'open-analysis-field',
  'save-analysis-category': 'open-analysis-field',
  'change-competitor-brand': 'open-competitor-field',
  'save-competitor-brand': 'open-competitor-field',
  'pull-name-own-draft': 'pull-save-own-copy',
  'pull-name-competitor-draft': 'pull-save-competitor-copy',
  'pull-confirm-publish-own': 'pull-publish-own',
  'pull-confirm-publish-competitor': 'pull-publish-competitor',
  'pull-name-folder': 'pull-create-folder',
  'parameter-confirm-publish': 'parameter-publish-solution',
  'parameter-open-excel': 'parameter-open-brand-editor',
  'parameter-paste-brands': 'parameter-open-brand-editor',
  'parameter-create-tasks': 'parameter-open-brand-editor',
  'combo-open-excel': 'combo-open-field',
  'combo-paste': 'combo-open-field',
  'combo-create': 'combo-open-field',
  'combo-select-all': 'combo-start-automation',
  'combo-confirm-run': 'combo-start-automation',
  'parameter-select-all': 'parameter-start-automation',
  'parameter-confirm-run': 'parameter-start-automation',
})

const copiedTutorialNameId = ref('')
const tutorialNameCopyError = ref('')
const tutorialBrandValues = computed(() => currentStep.value?.id === 'combo-paste' ? parameterBatchValues.brands.slice(1) : parameterBatchValues.brands)
const parameterBrandColumn = computed(() => ({
  id: 'parameter-brand-column',
  value: tutorialBrandValues.value.join('\n'),
}))

const phaseProgress = computed(() => {
  const phase = currentStep.value?.phase
  if (!phase) return `${state.stepIndex + 1} / ${steps.value.length}`
  const phaseSteps = steps.value.filter((step) => step.phase === phase)
  const phaseIndex = phaseSteps.findIndex((step) => step.id === currentStep.value?.id)
  return `${phaseIndex + 1} / ${phaseSteps.length}`
})

const showPullCourseProgress = computed(() => (
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID, COMBINATION_BATCH_TUTORIAL_ID].includes(state.taskId)
))
const pullCourseLessons = Object.freeze(['共同浏览', '购买本品', '购买竞品 · 组合', '多竞品批量'])
const pullCourseLesson = computed(() => {
  if (state.taskId === COMBINATION_BATCH_TUTORIAL_ID) return 4
  return currentStep.value?.phase?.startsWith('第 1 章') ? 2 : 3
})

const nextDmpTag = computed(() => {
  if (currentStep.value?.id !== 'select-dmp-tags') return null
  const selected = (state.context.selectedTagIds || []).map(String)
  return dmpTags.find((tag) => !selected.includes(String(tag.tagId))) || null
})

const copyableNameItems = computed(() => {
  if (currentStep.value?.id === 'parameter-name-brand-field') {
    return [{ id: 'parameter-field-name', label: '自定义字段名称', value: parameterBatchValues.customFieldName }]
  }
  if (currentStep.value?.id === 'parameter-set-identity') {
    return [
      { id: 'parameter-solution-name', label: '方案名称', value: parameterBatchValues.solutionName },
      { id: 'parameter-crowd-name', label: '默认人群包名称', value: parameterBatchValues.defaultCrowdName },
    ]
  }
  if (currentStep.value?.id === 'name-audience') {
    return [{
      id: 'category-item-audience-name',
      label: '推荐人群包名称',
      value: CATEGORY_ITEM_TUTORIAL_VALUES.audienceName,
    }]
  }
  if (currentStep.value?.id === 'set-solution-identity') {
    return [
      { id: 'solution-name', label: '方案名称', value: solutionValues.solutionName },
      { id: 'solution-default-crowd-name', label: '默认人群包名称', value: solutionValues.defaultCrowdName },
    ]
  }
  if (currentStep.value?.id === 'set-second-audience-name') {
    return [{
      id: 'solution-second-crowd-name',
      label: '第二次人群包名称',
      value: solutionValues.secondCrowdName,
    }]
  }
  if (currentStep.value?.id === 'pull-name-own-draft') {
    return [{ id: 'pull-own-solution-name', label: '方案名称', value: pullAnalysisValues.ownPurchaseSolutionName }]
  }
  if (currentStep.value?.id === 'pull-set-own-identity') {
    return [
      { id: 'pull-own-solution-name', label: '方案名称', value: pullAnalysisValues.ownPurchaseSolutionName },
      { id: 'pull-own-crowd-name', label: '默认人群包名称', value: pullAnalysisValues.ownPurchaseCrowdName },
    ]
  }
  if (currentStep.value?.id === 'pull-name-competitor-draft') {
    return [{ id: 'pull-competitor-solution-name', label: '方案名称', value: pullAnalysisValues.competitorPurchaseSolutionName }]
  }
  if (currentStep.value?.id === 'pull-set-competitor-identity') {
    return [
      { id: 'pull-competitor-solution-name', label: '方案名称', value: pullAnalysisValues.competitorPurchaseSolutionName },
      { id: 'pull-competitor-crowd-name', label: '默认人群包名称', value: pullAnalysisValues.competitorPurchaseCrowdName },
    ]
  }
  if (currentStep.value?.id === 'pull-name-folder') {
    return [{ id: 'pull-folder-name', label: '方案文件夹名称', value: pullAnalysisValues.folderName }]
  }
  if (currentStep.value?.id === 'pull-inspect-batch-sync') {
    return pullAnalysisValues.finalCrowdNames.map((value, index) => ({
      id: `pull-final-crowd-${index}`,
      label: `人群包 ${index + 1}`,
      value,
    }))
  }
  return []
})

const labelOrderReadyForApply = computed(() => (
  currentStep.value?.id === 'sort-label-order'
  && ['性别', '用户性别'].includes(state.context.labelOrderDraftFirst)
))
const labelOrderWasAutoMoved = computed(() => (
  currentStep.value?.id === 'sort-label-order'
  && state.context.labelOrderAutoMoved
))

const tutorialTargetSelector = computed(() => {
  if (currentStep.value?.id === 'select-dmp-tags' && nextDmpTag.value) {
    return `[data-tutorial-target="dmp-tag-${nextDmpTag.value.tagId}"]`
  }
  if (labelOrderReadyForApply.value) {
    return '[data-tutorial-target="dmp-label-order-apply"]'
  }
  if (currentStep.value?.id === 'pull-inspect-group-packages') {
    const visited = state.context.pullVisitedPackageIndexes || []
    const nextIndex = [0, 1, 2].find(index => !visited.includes(index))
    if (Number.isInteger(nextIndex)) {
      return `[data-tutorial-target="pull-batch-package-${nextIndex}"]`
    }
  }
  return currentStep.value?.target || null
})

const progress = computed(() => ((state.stepIndex + 1) / Math.max(steps.value.length, 1)) * 100)
const focusGap = computed(() => (
  Number.isFinite(currentStep.value?.focusPadding)
    ? currentStep.value.focusPadding
    : DEFAULT_FOCUS_GAP
))

const displayTitle = computed(() => (
  systemDialogActive.value
    ? `请先确认「${systemDialogConfirmLabel.value || '继续'}」`
    : currentStep.value?.title || ''
))

const displayHint = computed(() => (
  systemDialogActive.value
    ? `整个确认弹窗都可以操作，请点击“${systemDialogConfirmLabel.value || '确认'}”继续。`
    : currentStep.value?.hint || ''
))

const contextualBody = computed(() => {
  if (systemDialogActive.value) {
    return '系统需要你先确认当前操作。教程已经放行整个弹窗；点击主要按钮后会继续，取消后仍可返回当前步骤。'
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id?.startsWith('parameter-')) {
    return '操作窗口已关闭，教程进度仍然保留。点击下方按钮重新打开窗口，即可继续当前任务。'
  }
  if (currentStep.value?.id === 'parameter-wait-automation') {
    if (['failed', 'partial'].includes(state.context.parameterBatchStatus)) {
      return `已成功 ${state.context.parameterBatchCompletedCount || 0}/4。请检查数据引擎登录与插件状态，再仅重试下方失败任务；成功的包会保留。`
    }
  }
  if (currentStep.value?.id === 'automation-running' && state.context.automationStatus === 'failed') {
    return '本次自动化没有成功，教程不会提前结束。请确认自动化插件已经加载、数据引擎可访问，然后点击“重新执行”。'
  }
  if (currentStep.value?.id === 'select-dmp-tags' && nextDmpTag.value) {
    return `先点击高亮的“${nextDmpTag.value.name}”。选中后教程会自动引导下一项，直到 4 个示例标签全部完成。`
  }
  if (labelOrderReadyForApply.value && !showTargetRecoveryAction.value) {
    return '性别已经排到第一位。现在请点击右下角的“应用排序”，保存本次标签顺序后继续。'
  }
  if (labelOrderWasAutoMoved.value && !showTargetRecoveryAction.value) {
    return '性别原本已经在第一位，教程暂时把它放到第二位，方便你完整体验拖动操作。现在请把它移回第一位。'
  }
  if (currentStep.value?.id === 'open-workbench-draft') {
    if (['idle', 'pending', 'syncing'].includes(state.context.workbenchDraftSyncStatus)) {
      return '正在同步刚刚保存的“圈包草稿”。页面仍可操作，通常几秒内就会出现在“我的模板”列表中。'
    }
    if (['failed', 'timeout'].includes(state.context.workbenchDraftSyncStatus)) {
      return '草稿已经保存，但方案列表暂时没有同步完成。点击“重新同步草稿”后，教程会继续查找刚刚保存的草稿。'
    }
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id === 'input-dmp-crowds') {
    const count = Number(state.context.audienceCount || 0)
    return count > 0
      ? `输入框已关闭，已保留你刚刚录入的 ${count} 个名称。点击下方按钮重新打开批量输入，再补齐至少 2 个名称。`
      : '输入框已关闭，当前还没有识别到人群包名称。点击下方按钮重新打开批量输入，再录入至少 2 个名称。'
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id === 'confirm-dmp-batch') {
    const count = Number(state.context.audienceCount || 0)
    return `批量名单输入框已关闭，已保留 ${count} 个名称。点击下方按钮重新打开“批量”，再点击“运行 ${count} 个”继续。`
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id === 'add-product-ids') {
    return '商品 ID 批量输入面板已关闭，教程没有中断。点击下方按钮回到商品 ID 输入区，重新打开解析结果后再确认添加。'
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id === 'confirm-split') {
    return '拆分确认框已关闭，教程没有中断。点击下方按钮返回“添加 7 项”，再重新确认拆分即可。'
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id === 'sort-label-order') {
    return '标签排序面板已关闭，教程没有中断。点击下方按钮重新打开排序面板，继续把性别调整到第一位。'
  }
  if (showTargetRecoveryAction.value && currentStep.value?.id === 'confirm-publish-tutorial-solution') {
    return '发布确认框已关闭，教程没有中断。点击下方按钮返回发布步骤，再次打开确认框即可。'
  }
  if (showTargetRecoveryAction.value && ['change-analysis-category', 'save-analysis-category'].includes(currentStep.value?.id)) {
    return '分析类目编辑框已关闭，教程没有中断。点击下方按钮重新打开“分析类目”，继续修改并保存。'
  }
  if (showTargetRecoveryAction.value && ['change-competitor-brand', 'save-competitor-brand'].includes(currentStep.value?.id)) {
    return '竞争品牌编辑框已关闭，教程没有中断。点击下方按钮重新打开“竞争品牌”，继续修改并保存。'
  }
  if (currentStep.value?.id === 'wait-dmp-batch') {
    if (state.context.batchStatus === 'failed') {
      return '本次批量取数没有成功。失败的人群包名称已列在下方；你可以重试失败项，也可以返回修改完整名单。'
    }
    if (state.context.batchStatus === 'partial') {
      return `已成功完成 ${state.context.batchCompletedCount || 0} 个，还有 ${state.context.batchFailedNames.length} 个失败项。页面仍可正常操作。`
    }
    if (state.context.batchStatus === 'completed') return '本次人群包已经全部取数完成，正在进入横向对比。'
  }
  if (['pull-wait-baseline', 'pull-wait-second'].includes(currentStep.value?.id)) {
    const roundLabel = currentStep.value?.id === 'pull-wait-baseline' ? '第一轮' : '第二轮'
    if (state.context.pullBatchStatus === 'failed') {
      return `${roundLabel}组合任务有失败项。已成功的人群包会保留，点击“仅重试失败任务”即可继续。`
    }
    if (state.context.pullBatchStatus === 'partial') {
      return `${roundLabel}已完成 ${state.context.pullBatchCompletedCount || 0}/3，仅需重试失败项，不会重复提交成功任务。`
    }
    if (state.context.pullBatchStatus === 'completed') {
      return `${roundLabel}三个人群包已经全部完成，正在进入下一阶段。`
    }
  }
  return currentStep.value?.body || ''
})

const visibleStatus = computed(() => {
  if (
    state.context.parameterBatchError
    && ['parameter-paste-brands', 'parameter-create-tasks', 'parameter-wait-automation'].includes(currentStep.value?.id)
  ) return state.context.parameterBatchError
  if (state.context.pasteError && ['paste-ids', 'add-product-ids'].includes(currentStep.value?.id)) {
    return state.context.pasteError
  }
  if (state.context.copyError && currentStep.value?.id === 'copy-ids') return state.context.copyError
  if (state.context.automationError && currentStep.value?.id === 'automation-running') {
    return state.context.automationError
  }
  if (state.context.batchError && currentStep.value?.id === 'wait-dmp-batch') {
    return state.context.batchError
  }
  if (state.context.firstAutomationError && currentStep.value?.id === 'wait-first-solution-automation') {
    return state.context.firstAutomationError
  }
  if (state.context.secondAutomationError && currentStep.value?.id === 'wait-second-solution-automation') {
    return state.context.secondAutomationError
  }
  if (state.context.workbenchDraftSyncError && currentStep.value?.id === 'open-workbench-draft') {
    return state.context.workbenchDraftSyncError
  }
  if (state.context.pullBatchError && ['pull-wait-baseline', 'pull-wait-second'].includes(currentStep.value?.id)) {
    return state.context.pullBatchError
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

const dmpBatchProgress = computed(() => {
  const total = Number(state.context.audienceCount || 0)
  if (total <= 0) return 0
  return Math.min(100, (Number(state.context.batchCompletedCount || 0) / total) * 100)
})

const dmpBatchStatusTitle = computed(() => ({
  idle: '等待开始',
  running: '正在逐个取画像',
  completed: '全部取数完成',
  partial: '部分完成，请处理失败项',
  failed: '取数失败，请检查后重试',
}[state.context.batchStatus] || '正在准备'))

const pullBatchStatusTitle = computed(() => ({
  idle: '等待开始',
  running: `${state.context.pullBatchRound === 'baseline' ? '第一轮' : '第二轮'}正在依次圈选`,
  completed: `${state.context.pullBatchRound === 'baseline' ? '第一轮' : '第二轮'} 3/3 全部完成`,
  partial: '部分完成，请重试失败项',
  failed: '执行暂停，请检查后重试',
}[state.context.pullBatchStatus] || '正在准备'))

const parameterBatchStatusTitle = computed(() => ({
  idle: '等待开始',
  running: '正在逐包圈人',
  completed: '4/4 全部完成',
  partial: '部分完成，请重试失败项',
  failed: '执行失败，请检查后重试',
}[state.context.parameterBatchStatus] || '正在准备'))

const dmpBatchHasFailure = computed(() => (
  currentStep.value?.id === 'wait-dmp-batch'
  && ['failed', 'partial'].includes(state.context.batchStatus)
))

const showDmpEditAction = computed(() => dmpBatchHasFailure.value)

const showTargetRecoveryAction = computed(() => (
  Boolean(targetRecoveryStepMap[currentStep.value?.id]) && !targetRect.value
))

const draftSyncRetryAvailable = computed(() => (
  currentStep.value?.id === 'open-workbench-draft'
  && !targetRect.value
  && ['failed', 'timeout'].includes(state.context.workbenchDraftSyncStatus)
))

const draftSyncWaiting = computed(() => (
  currentStep.value?.id === 'open-workbench-draft'
  && !targetRect.value
  && ['idle', 'pending', 'syncing'].includes(state.context.workbenchDraftSyncStatus)
))

// While the newly-created draft is still replicating, leave the page usable so
// a delayed list response cannot turn the tutorial into a dead-end modal.
const isNonBlockingStep = computed(() => (
  Boolean(currentStep.value?.nonBlocking)
  || draftSyncWaiting.value
  || draftSyncRetryAvailable.value
))

const isDialogCompanionStep = computed(() => (
  ['parameter-paste-brands', 'parameter-create-tasks', 'combo-paste', 'combo-create'].includes(currentStep.value?.id)
))

const DIALOG_COMPANION_BODY_CLASS = 'guided-tutorial-dialog-companion-open'
watch([() => state.active, isDialogCompanionStep], ([tutorialActive, companionActive]) => {
  document.body.classList.toggle(DIALOG_COMPANION_BODY_CLASS, Boolean(tutorialActive && companionActive))
}, { immediate: true })

const showPrimaryAction = computed(() => (
  [
    'clean-workbench',
    'set-time',
    'copy-ids',
    'inspect-split',
    'name-audience',
    'final-confirm',
    'automation-running',
    'tutorial-complete',
    'confirm-dmp-login',
    'wait-dmp-batch',
    'inspect-comparison-table',
    'dmp-tutorial-complete',
    'solution-clean-workbench',
    'set-own-time',
    'confirm-solution-intersection',
    'name-analysis-field',
    'name-own-brand-field',
    'name-competitor-brand-field',
    'inspect-field-map',
    'set-solution-identity',
    'confirm-first-solution-automation',
    'wait-first-solution-automation',
    'inspect-linked-update',
    'set-second-audience-name',
    'confirm-second-solution-automation',
    'wait-second-solution-automation',
    'solution-tutorial-complete',
    'pull-check-own-intersections',
    'pull-set-own-identity',
    'pull-understand-name-rule',
    'pull-set-competitor-identity',
    'pull-explain-aggregation-origin',
    'pull-explain-aggregation-impact',
    'pull-baseline-complete',
    'pull-inspect-batch-sync',
    'pull-wait-baseline',
    'pull-wait-second',
    'pull-group-complete',
    'parameter-confirm-time',
    'parameter-name-brand-field',
    'parameter-set-identity',
    'parameter-inspect-tasks',
    'parameter-wait-automation',
    'parameter-batch-complete',
    'combo-wait',
    'combo-complete',
  ].includes(currentStep.value?.id) || showTargetRecoveryAction.value
  || draftSyncRetryAvailable.value
))

const primaryDisabled = computed(() => {
  if (currentStep.value?.id === 'combo-wait') return !state.context.comboError
  if (currentStep.value?.id === 'combo-complete') return state.context.comboCompletedCount !== 9
  if (showTargetRecoveryAction.value) return false
  if (currentStep.value?.id === 'parameter-confirm-time') {
    return state.context.dateMode !== 'recent' || Number(state.context.recentDays) !== parameterBatchValues.recentDays
  }
  if (currentStep.value?.id === 'parameter-set-identity') {
    return String(state.context.solutionName || '').trim() !== parameterBatchValues.solutionName
      || String(state.context.defaultCrowdName || '').trim() !== parameterBatchValues.defaultCrowdName
  }
  if (currentStep.value?.id === 'parameter-inspect-tasks') {
    return state.context.parameterBatchPackageNames.length !== 4
  }
  if (currentStep.value?.id === 'parameter-wait-automation') {
    return !['failed', 'partial'].includes(state.context.parameterBatchStatus)
  }
  if (currentStep.value?.id === 'parameter-batch-complete') {
    return state.context.parameterBatchStatus !== 'completed' || state.context.parameterBatchCompletedCount !== 4
  }
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
  if (currentStep.value?.id === 'wait-dmp-batch') return !dmpBatchHasFailure.value
  if (currentStep.value?.id === 'set-own-time') {
    return state.context.dateMode !== 'recent' || Number(state.context.recentDays) !== solutionValues.recentDays
  }
  if (currentStep.value?.id === 'confirm-solution-intersection') {
    return state.context.solutionNodeCount !== 2 || state.context.solutionOperator !== 'n'
  }
  const customFieldNames = {
    'name-analysis-field': '分析类目',
    'name-own-brand-field': '本品牌',
    'name-competitor-brand-field': '竞争品牌',
    'parameter-name-brand-field': parameterBatchValues.customFieldName,
  }
  if (customFieldNames[currentStep.value?.id]) {
    return String(state.context.customFieldName || '').trim() !== customFieldNames[currentStep.value.id]
  }
  if (currentStep.value?.id === 'set-solution-identity') {
    return String(state.context.solutionName || '').trim() !== solutionValues.solutionName
      || String(state.context.defaultCrowdName || '').trim() !== solutionValues.defaultCrowdName
  }
  if (currentStep.value?.id === 'set-second-audience-name') {
    return String(state.context.audienceName || '').trim() !== solutionValues.secondCrowdName
  }
  if (currentStep.value?.id === 'wait-first-solution-automation') {
    return state.context.firstAutomationStatus !== 'failed'
  }
  if (currentStep.value?.id === 'wait-second-solution-automation') {
    return state.context.secondAutomationStatus !== 'failed'
  }
  if (currentStep.value?.id === 'pull-check-own-intersections') {
    return state.context.pullNodeCount !== 3
      || state.context.pullOperators.length !== 2
      || state.context.pullOperators.some((operator) => operator !== 'n')
  }
  if (currentStep.value?.id === 'pull-set-own-identity') {
    return String(state.context.solutionName || '').trim() !== pullAnalysisValues.ownPurchaseSolutionName
      || String(state.context.defaultCrowdName || '').trim() !== pullAnalysisValues.ownPurchaseCrowdName
  }
  if (currentStep.value?.id === 'pull-set-competitor-identity') {
    return String(state.context.solutionName || '').trim() !== pullAnalysisValues.competitorPurchaseSolutionName
      || String(state.context.defaultCrowdName || '').trim() !== pullAnalysisValues.competitorPurchaseCrowdName
  }
  if (['pull-wait-baseline', 'pull-wait-second'].includes(currentStep.value?.id)) {
    return !['failed', 'partial'].includes(state.context.pullBatchStatus)
  }
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
  'confirm-dmp-login': `确认登录，运行 ${state.context.audienceCount || 0} 个`,
  'wait-dmp-batch': '重试失败项',
  'inspect-comparison-table': '看懂了，继续排序',
  'dmp-tutorial-complete': '完成教程',
  'solution-clean-workbench': '开始制作方案',
  'set-own-time': '确认过去 30 天',
  'confirm-solution-intersection': '确认是共同浏览',
  'name-analysis-field': '名称已填写，开始绑定',
  'name-own-brand-field': '名称已填写，开始绑定',
  'name-competitor-brand-field': '名称已填写，开始绑定',
  'inspect-field-map': '映射正确，继续',
  'set-solution-identity': '名称已填写完整',
  'confirm-first-solution-automation': '确认登录，执行第一次圈人',
  'wait-first-solution-automation': '重新执行第一次圈人',
  'inspect-linked-update': '看懂了，继续',
  'set-second-audience-name': '名称已更新',
  'confirm-second-solution-automation': '确认登录，执行第二次圈人',
  'wait-second-solution-automation': '重新执行第二次圈人',
  'solution-tutorial-complete': '完成教程',
  'pull-check-own-intersections': '三个节点关系正确',
  'pull-set-own-identity': '两个名称已填写',
  'pull-understand-name-rule': '字段名称一致，继续',
  'pull-set-competitor-identity': '两个名称已填写',
  'pull-explain-aggregation-origin': '看懂字段来源',
  'pull-explain-aggregation-impact': '先跑默认方案',
  'pull-baseline-complete': '开始验证改参提效',
  'pull-inspect-batch-sync': '核对完成，执行第二轮',
  'pull-wait-baseline': '仅重试失败任务',
  'pull-wait-second': '仅重试失败任务',
  'pull-group-complete': '完成教程',
  'combo-wait': '仅重试失败任务',
  'combo-complete': '完成教程并打卡',
  'open-workbench-draft': '重新同步草稿',
  'parameter-confirm-time': '确认过去 30 天',
  'parameter-name-brand-field': '名称已填写，开始绑定',
  'parameter-set-identity': '两个名称已填好',
  'parameter-inspect-tasks': '四个包已生成，继续',
  'parameter-wait-automation': '仅重试失败任务',
  'parameter-batch-complete': '完成教程并打卡',
}[currentStep.value?.id] || ({
  'input-dmp-crowds': '重新点击「批量」输入',
  'confirm-dmp-batch': '重新点击「批量」打开名单',
  'add-product-ids': '重新打开商品 ID 输入',
  'confirm-split': '返回并重新确认拆分',
  'sort-label-order': '重新打开标签排序',
  'confirm-publish-tutorial-solution': '重新打开发布确认',
  'change-analysis-category': '重新打开分析类目',
  'save-analysis-category': '重新打开分析类目',
  'change-competitor-brand': '重新打开竞争品牌',
  'save-competitor-brand': '重新打开竞争品牌',
  'pull-name-own-draft': '重新打开另存为',
  'pull-name-competitor-draft': '重新打开另存为',
  'pull-confirm-publish-own': '重新打开发布确认',
  'pull-confirm-publish-competitor': '重新打开发布确认',
  'pull-name-folder': '重新新建文件夹',
  'parameter-confirm-publish': '重新打开发布确认',
  'parameter-open-excel': '重新打开竞争品牌',
  'parameter-paste-brands': '重新打开 Excel 批量',
  'combo-paste': '重新打开竞争品牌',
  'combo-create': '重新打开竞争品牌',
  'combo-select-all': '重新打开自动化圈人',
  'combo-confirm-run': '重新打开自动化圈人',
  'parameter-create-tasks': '重新打开 Excel 批量',
  'parameter-select-all': '重新打开自动化圈人',
  'parameter-confirm-run': '重新打开自动化圈人',
}[currentStep.value?.id] || '继续')))

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
  if (currentStep.value?.nonBlocking) {
    return {
      right: '22px',
      bottom: '22px',
      width: `${Math.min(CARD_WIDTH, window.innerWidth - 32)}px`,
    }
  }
  if (!targetRect.value) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${Math.min(CARD_WIDTH, window.innerWidth - 32)}px`,
    }
  }

  const rect = targetRect.value
  let width = Math.min(CARD_WIDTH, window.innerWidth - 32)
  const estimatedHeight = Math.min(
    cardRef.value?.offsetHeight || 360,
    window.innerHeight - (VIEWPORT_MARGIN * 2),
  )
  const dialogSurface = targetElement?.closest?.('.el-dialog, .el-message-box')
  const dialogRect = dialogSurface && isVisibleElement(dialogSurface)
    ? dialogSurface.getBoundingClientRect()
    : null

  // When the highlighted control lives inside a large system dialog, place the
  // tutorial card beside the whole dialog rather than beside the inner field.
  // This keeps both surfaces readable and prevents the guide from covering the
  // input, preview table, or footer action it is explaining.
  if (dialogRect && isDialogCompanionStep.value) {
    const availableLeft = Math.max(0, dialogRect.left - (VIEWPORT_MARGIN * 2))
    const availableRight = Math.max(0, window.innerWidth - dialogRect.right - (VIEWPORT_MARGIN * 2))
    const useLeft = availableLeft >= availableRight
    const availableWidth = useLeft ? availableLeft : availableRight
    if (availableWidth >= DIALOG_COMPANION_MIN_WIDTH) {
      width = Math.min(width, availableWidth)
      const left = useLeft
        ? dialogRect.left - width - VIEWPORT_MARGIN
        : dialogRect.right + VIEWPORT_MARGIN
      const top = Math.min(
        Math.max(rect.top, VIEWPORT_MARGIN),
        window.innerHeight - estimatedHeight - VIEWPORT_MARGIN,
      )
      return { top: `${Math.max(VIEWPORT_MARGIN, top)}px`, left: `${left}px`, width: `${width}px` }
    }
  }

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

function clearTargetScrollCorrections() {
  targetScrollCorrectionTimers.forEach((timer) => window.clearTimeout(timer))
  targetScrollCorrectionTimers = []
}

function clearDialogHandoffTimers() {
  dialogHandoffTimers.forEach((timer) => window.clearTimeout(timer))
  dialogHandoffTimers = []
}

function scheduleDialogHandoffCorrections() {
  clearDialogHandoffTimers()
  ;[80, 260, 520].forEach((delay) => {
    dialogHandoffTimers.push(window.setTimeout(() => {
      findTarget({ scroll: true })
    }, delay))
  })
}

function getScrollableAncestor(element) {
  let parent = element?.parentElement
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent)
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

function centerTargetInView(element, behavior = 'smooth') {
  if (!element) return
  const scrollParent = getScrollableAncestor(element)
  if (!scrollParent) {
    element.scrollIntoView({ behavior, block: 'center', inline: 'nearest' })
    return
  }
  const parentRect = scrollParent.getBoundingClientRect()
  const targetBounds = element.getBoundingClientRect()
  const nextTop = scrollParent.scrollTop
    + targetBounds.top
    - parentRect.top
    - ((scrollParent.clientHeight - targetBounds.height) / 2)
  scrollParent.scrollTo({ top: Math.max(0, nextTop), behavior })
}

function targetIsClipped(element) {
  if (!element) return true
  const rect = element.getBoundingClientRect()
  const scrollParent = getScrollableAncestor(element)
  const visibleTop = Math.max(
    VIEWPORT_MARGIN,
    scrollParent?.getBoundingClientRect().top ?? VIEWPORT_MARGIN,
  )
  const visibleBottom = Math.min(
    window.innerHeight - VIEWPORT_MARGIN,
    scrollParent?.getBoundingClientRect().bottom ?? (window.innerHeight - VIEWPORT_MARGIN),
  )
  return rect.top < visibleTop || rect.bottom > visibleBottom
}

function scheduleTargetScrollCorrections(element) {
  clearTargetScrollCorrections()
  ;[260, 620].forEach((delay) => {
    const timer = window.setTimeout(() => {
      if (element !== targetElement || !targetIsClipped(element)) return
      centerTargetInView(element, 'auto')
      trackTargetPosition(360)
    }, delay)
    targetScrollCorrectionTimers.push(timer)
  })
}

function findTarget({ scroll = false } = {}) {
  cancelAnimationFrame(refreshFrame)
  refreshFrame = requestAnimationFrame(() => {
    // Element Plus confirmation dialogs are teleported to <body>. Open the
    // tutorial hole around the entire visible dialog so every real dialog
    // action remains aligned, readable, and clickable.
    const messageBoxSelector = [
      '.is-message-box .el-message-box',
      '.el-overlay-message-box .el-message-box',
      '.el-message-box',
    ].join(', ')
    const messageBoxTarget = [...document.querySelectorAll(messageBoxSelector)]
      .find(isVisibleElement) || null
    const dialogWasActive = systemDialogActive.value
    systemDialogActive.value = Boolean(messageBoxTarget)
    systemDialogConfirmLabel.value = messageBoxTarget
      ?.querySelector('.el-message-box__btns .el-button--primary')
      ?.textContent
      ?.trim() || ''
    const selector = messageBoxTarget
      ? messageBoxSelector
      : tutorialTargetSelector.value
    if (selector !== lastResolvedSelector) {
      lastResolvedSelector = selector || ''
      targetRect.value = null
      targetResizeObserver?.disconnect()
      targetElement = null
    }
    const candidates = selector ? [...document.querySelectorAll(selector)] : []
    const nextTarget = messageBoxTarget || candidates.find(isVisibleElement) || null
    const dialogJustClosed = dialogWasActive && !messageBoxTarget

    const targetChanged = targetElement !== nextTarget
    if (targetChanged) {
      targetResizeObserver?.disconnect()
      targetElement = nextTarget
      if (targetElement && targetResizeObserver) targetResizeObserver.observe(targetElement)
    }

    // Message boxes animate into their final position. Follow the live bounds
    // until the entrance transition ends so the hole never stays at the
    // animation's starting coordinates.
    if (messageBoxTarget && targetChanged) trackTargetPosition(1200)

    if ((scroll || dialogJustClosed) && targetElement) {
      centerTargetInView(targetElement)
      scheduleTargetScrollCorrections(targetElement)
      // The paste preview expands and the canvas scrolls at the same time. Keep
      // following the live button rect until both motions have fully settled.
      trackTargetPosition()
    }
    updateTargetRect()
    if (dialogJustClosed) scheduleDialogHandoffCorrections()
  })
}

async function copyTutorialIds() {
  const text = productIds.join('\n')
  if (!await writeTutorialClipboard(text)) {
    updateContext({ copyError: '未能自动写入剪贴板，请选中上方 ID 后手动复制。' })
    return
  }
  updateContext({ copyError: '' })
  completeStep('copy-ids')
}

async function writeTutorialClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy textarea method below.
    }
  }
  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
    textarea.remove()
    return Boolean(copied)
  } catch {
    return false
  }
}

async function copyTutorialName(item) {
  const value = String(item?.value || '').trim()
  if (!value) return
  tutorialNameCopyError.value = ''
  if (!await writeTutorialClipboard(value)) {
    copiedTutorialNameId.value = ''
    tutorialNameCopyError.value = '复制失败，请手动选中名称后复制。'
    return
  }
  copiedTutorialNameId.value = item.id
  if (tutorialNameCopyResetTimer && typeof window !== 'undefined') {
    window.clearTimeout(tutorialNameCopyResetTimer)
  }
  if (typeof window !== 'undefined') {
    tutorialNameCopyResetTimer = window.setTimeout(() => {
      copiedTutorialNameId.value = ''
    }, 1800)
  }
}

function requestTutorialAutomation() {
  updateContext({ automationStatus: 'running', automationError: '' })
  if (currentStep.value?.id === 'final-confirm') completeStep('final-confirm')
  window.dispatchEvent(new CustomEvent('cdp:tutorial-confirm-automation'))
}

function requestSolutionTutorialAutomation(run) {
  const confirmStep = run === 'first'
    ? 'confirm-first-solution-automation'
    : 'confirm-second-solution-automation'
  if (currentStep.value?.id === confirmStep) completeStep(confirmStep)
  updateContext(run === 'first'
    ? { firstAutomationStatus: 'running', firstAutomationError: '' }
    : { secondAutomationStatus: 'running', secondAutomationError: '' })
  window.dispatchEvent(new CustomEvent('cdp:tutorial-confirm-solution-automation', {
    detail: { run },
  }))
}

function requestDmpBatchRun({ retry = false } = {}) {
  const names = retry
    ? [...state.context.batchFailedNames]
    : [...state.context.audienceNames]
  if (!retry && currentStep.value?.id === 'confirm-dmp-login') {
    updateContext({ batchStatus: 'running', batchError: '' })
    completeStep('confirm-dmp-login')
  }
  window.dispatchEvent(new CustomEvent('cdp:tutorial-run-dmp-batch', {
    detail: { names, retry },
  }))
}

function editDmpBatch() {
  window.dispatchEvent(new CustomEvent('cdp:tutorial-edit-dmp-batch'))
  goToStep('open-dmp-batch')
}

function retryPullAnalysisBatch() {
  const round = state.context.pullBatchRound
  updateContext({
    pullBatchStatus: 'running',
    pullBatchError: '',
    ...(round === 'baseline'
      ? { pullBaselineStatus: 'running', pullBaselineError: '' }
      : { pullSecondStatus: 'running', pullSecondError: '' }),
  })
  window.dispatchEvent(new CustomEvent('cdp:tutorial-retry-pull-batch'))
}

function handlePrimaryAction() {
  const stepId = currentStep.value?.id
  if (primaryDisabled.value) return
  if (stepId === 'parameter-wait-automation' || stepId === 'combo-wait') {
    updateContext({ parameterBatchStatus: 'running', parameterBatchError: '' })
    window.dispatchEvent(new CustomEvent('cdp:tutorial-retry-pull-batch'))
    return
  }
  if (stepId === 'open-workbench-draft' && draftSyncRetryAvailable.value) {
    updateContext({ workbenchDraftSyncStatus: 'pending', workbenchDraftSyncError: '' })
    window.dispatchEvent(new CustomEvent('cdp:tutorial-retry-workbench-draft-sync'))
    return
  }
  if (stepId === 'copy-ids') {
    void copyTutorialIds()
    return
  }
  if (stepId === 'final-confirm' || stepId === 'automation-running') {
    requestTutorialAutomation()
    return
  }
  if (stepId === 'confirm-dmp-login') {
    requestDmpBatchRun()
    return
  }
  if (stepId === 'confirm-first-solution-automation' || stepId === 'wait-first-solution-automation') {
    requestSolutionTutorialAutomation('first')
    return
  }
  if (stepId === 'confirm-second-solution-automation' || stepId === 'wait-second-solution-automation') {
    requestSolutionTutorialAutomation('second')
    return
  }
  if (stepId === 'wait-dmp-batch') {
    requestDmpBatchRun({ retry: true })
    return
  }
  if (['pull-wait-baseline', 'pull-wait-second'].includes(stepId)) {
    retryPullAnalysisBatch()
    return
  }
  if (showTargetRecoveryAction.value) {
    goToStep(targetRecoveryStepMap[stepId])
    return
  }
  if (
    stepId === 'tutorial-complete'
    || stepId === 'dmp-tutorial-complete'
    || stepId === 'solution-tutorial-complete'
    || stepId === 'pull-group-complete'
    || stepId === 'parameter-batch-complete'
    || stepId === 'combo-complete'
  ) {
    finish()
    return
  }
  completeStep(stepId)
}

function handleViewportChange() {
  findTarget()
}

watch(
  [
    () => state.active,
    () => state.stepIndex,
    () => state.context.nodeCount,
    () => state.context.selectedTagIds.join(','),
    () => state.context.labelOrderDraftFirst,
    () => state.context.pullFolderMemberIds.join(','),
    () => state.context.pullBatchStatus,
    () => state.context.pullBatchCompletedCount,
    () => state.context.pullVisitedPackageIndexes.join(','),
  ],
  async ([active]) => {
    if (!active) {
      cancelAnimationFrame(targetTrackingFrame)
      clearTargetScrollCorrections()
      clearDialogHandoffTimers()
      targetRect.value = null
      targetElement = null
      lastResolvedSelector = ''
      systemDialogActive.value = false
      systemDialogConfirmLabel.value = ''
      return
    }
    await nextTick()
    findTarget({ scroll: true })
  },
  { immediate: true },
)

onMounted(() => {
  targetResizeObserver = new ResizeObserver(updateTargetRect)
  mutationObserver = new MutationObserver((mutations) => {
    const dialogSelector = '.is-message-box, .el-overlay-message-box, .el-message-box'
    const shouldRefresh = mutations.some((mutation) => {
      if (mutation.type === 'childList') return true
      const element = mutation.target instanceof Element ? mutation.target : null
      return Boolean(element?.matches(dialogSelector) || element?.closest(dialogSelector))
    })
    if (shouldRefresh) findTarget()
  })
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden'],
  })
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
  findTarget({ scroll: true })
})

onBeforeUnmount(() => {
  document.body.classList.remove(DIALOG_COMPANION_BODY_CLASS)
  cancelAnimationFrame(refreshFrame)
  cancelAnimationFrame(targetTrackingFrame)
  clearTargetScrollCorrections()
  clearDialogHandoffTimers()
  if (tutorialNameCopyResetTimer && typeof window !== 'undefined') {
    window.clearTimeout(tutorialNameCopyResetTimer)
  }
  mutationObserver?.disconnect()
  targetResizeObserver?.disconnect()
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style scoped>
.guided-tutorial__collapse {
  position: absolute;
  z-index: 3;
  top: 14px;
  right: 48px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  color: #55708c;
  background: #f8fbfe;
  border: 1px solid #dbe6ef;
  border-radius: 50%;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}
.guided-tutorial__collapse:hover { color: #176fae; background: #edf7ff; transform: translateY(-1px); }
.guided-tutorial__collapse span {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(2px) rotate(225deg);
}
.guided-tutorial__collapse.is-collapsed span { transform: translateY(-2px) rotate(45deg); }
.guided-tutorial__card.is-collapsed {
  width: 44px !important;
  min-height: 44px;
  padding: 0 !important;
  border-radius: 22px;
}
.guided-tutorial__card.is-collapsed > :not(.guided-tutorial__collapse) { display: none !important; }
.guided-tutorial__card.is-collapsed .guided-tutorial__collapse { top: 10px; right: 10px; }
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

/* Element Plus teleports select-v2 menus to body. Raise only tutorial-owned
   menus above the mask so the highlighted input and its options remain usable. */
:global(.guided-tutorial-select-popper) {
  z-index: 5003 !important;
  pointer-events: auto !important;
  border-color: rgba(20, 134, 242, .55) !important;
  box-shadow: 0 14px 34px rgba(28, 103, 175, .24), 0 0 0 3px rgba(20, 134, 242, .14) !important;
}

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
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 24px;
  background: rgba(255, 255, 255, .97);
  border: 1px solid rgba(87, 145, 203, .28);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(35, 94, 151, .24), 0 2px 8px rgba(35, 94, 151, .08);
  transition: top 180ms ease, left 180ms ease, width 180ms ease;
}

.guided-tutorial__card.is-dialog-companion {
  padding: 18px;
}

.guided-tutorial__card.is-dialog-companion .guided-tutorial__progress {
  margin: 8px 0 15px;
}

.guided-tutorial__card.is-dialog-companion h2 {
  font-size: 19px;
}

.guided-tutorial__card.is-dialog-companion > p {
  margin-top: 9px;
  font-size: 12px;
  line-height: 1.62;
}

.guided-tutorial__card.is-dialog-companion .guided-tutorial__copy-panel,
.guided-tutorial__card.is-dialog-companion .guided-tutorial__hint {
  margin-top: 12px;
}

.guided-tutorial__card.is-dialog-companion .guided-tutorial__brand-table th,
.guided-tutorial__card.is-dialog-companion .guided-tutorial__brand-table td {
  padding: 5px 8px;
}

.guided-tutorial__card.is-dialog-companion .guided-tutorial__actions {
  margin-top: 13px;
}

.guided-tutorial.is-non-blocking { pointer-events: none; }
.guided-tutorial__card.is-progress-card {
  top: auto;
  left: auto;
  max-height: min(72vh, 680px);
  overflow-y: auto;
  box-shadow: 0 18px 54px rgba(35, 94, 151, .2), 0 2px 8px rgba(35, 94, 151, .08);
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

.guided-tutorial__course-progress {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin: -7px 0 12px;
  padding: 2px 1px 0;
}

.guided-tutorial__course-progress::before {
  position: absolute;
  top: 9px;
  right: 12.5%;
  left: 12.5%;
  height: 1px;
  content: '';
  background: #dce6ee;
}

.guided-tutorial__course-progress span {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: 14px minmax(0, auto);
  gap: 3px;
  justify-items: center;
  min-width: 0;
  padding: 0;
  color: #8b99a6;
  text-align: center;
}

.guided-tutorial__course-progress i {
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  color: #8292a0;
  font-size: 7px;
  font-weight: 700;
  font-style: normal;
  background: #fff;
  border: 1px solid #d5e0e8;
  border-radius: 50%;
}

.guided-tutorial__course-progress b {
  overflow: hidden;
  max-width: 100%;
  font-size: 8px;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guided-tutorial__course-progress span.done { color: #4d7767; }
.guided-tutorial__course-progress span.done i { color: #fff; background: #35a57d; border-color: #35a57d; }
.guided-tutorial__course-progress span.active { color: #17679f; }
.guided-tutorial__course-progress span.active b { font-weight: 750; }
.guided-tutorial__course-progress span.active i { color: #fff; background: #1688dc; border-color: #1688dc; box-shadow: 0 0 0 2px rgba(22, 136, 220, .12); }

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

.guided-tutorial__copy-panel {
  display: grid;
  gap: 8px;
  margin-top: 15px;
  padding: 12px;
  background: linear-gradient(135deg, #f7fbff, #fff);
  border: 1px solid #cfe4f5;
  border-left: 4px solid #147fd0;
  border-radius: 10px;
}

.guided-tutorial__efficiency-callout {
  display: grid;
  gap: 7px;
  margin-top: 16px;
  padding: 14px 15px;
  background: linear-gradient(135deg, #edf8ff, #f9fcff);
  border: 1px solid #b9dcf5;
  border-left: 4px solid #147fd0;
  border-radius: 10px;
}

.guided-tutorial__efficiency-callout > span {
  width: max-content;
  padding: 3px 7px;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .04em;
  background: #147fd0;
  border-radius: 99px;
}

.guided-tutorial__efficiency-callout strong {
  color: #123f63;
  font-size: 12px;
  line-height: 1.5;
}

.guided-tutorial__efficiency-callout p {
  margin: 0;
  color: #58758c;
  font-size: 10px;
  line-height: 1.6;
}

.guided-tutorial__copy-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #6b8297;
  font-size: 10px;
  line-height: 1.4;
}

.guided-tutorial__copy-panel-badge {
  flex: none;
  padding: 4px 7px;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  background: #147fd0;
  border-radius: 99px;
}

.guided-tutorial__copy-item {
  padding: 9px 10px;
  background: #fff;
  border: 1px solid #dcebf6;
  border-radius: 8px;
}

.guided-tutorial__copy-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #55728b;
  font-size: 10px;
  font-weight: 700;
}

.guided-tutorial__copy-item code {
  display: block;
  margin-top: 5px;
  color: #163f61;
  font: 600 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
  overflow-wrap: anywhere;
}

.guided-tutorial__copy-button {
  flex: none;
  min-width: 42px;
  height: 25px;
  padding: 0 8px;
  color: #1767a5;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  background: #edf7ff;
  border: 1px solid #b9ddf8;
  border-radius: 6px;
  cursor: pointer;
}

.guided-tutorial__copy-button:hover {
  color: #fff;
  background: #147fd0;
  border-color: #147fd0;
}

.guided-tutorial__copy-button:focus-visible {
  outline: 2px solid rgba(20, 134, 242, .35);
  outline-offset: 2px;
}

.guided-tutorial__copy-error {
  margin: 0;
  color: #b04f47;
  font-size: 10px;
  line-height: 1.45;
}

.guided-tutorial__tag-checklist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 16px;
}

.guided-tutorial__tag-checklist span {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 37px;
  padding: 7px 9px;
  color: #6c8296;
  background: #f7fafc;
  border: 1px solid #e1eaf2;
  border-radius: 8px;
}

.guided-tutorial__tag-checklist span.selected {
  color: #176b52;
  background: #f0fbf7;
  border-color: #a8dccb;
}

.guided-tutorial__tag-checklist i {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  color: #fff;
  font-size: 10px;
  font-style: normal;
  background: #d6e1ea;
  border-radius: 50%;
}

.guided-tutorial__tag-checklist span.selected i { background: #299b77; }
.guided-tutorial__tag-checklist b { font-size: 10px; font-weight: 650; line-height: 1.35; }

.guided-tutorial__warning {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: start;
  gap: 11px;
  margin-top: 16px;
  padding: 14px;
  color: #664b10;
  background: linear-gradient(135deg, #fff8df, #fffdf5);
  border: 1px solid #f0cf73;
  border-radius: 11px;
  box-shadow: 0 9px 24px rgba(184, 132, 18, .12);
}

.guided-tutorial__warning-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: #fff;
  font-size: 19px;
  font-weight: 850;
  line-height: 1;
  background: #e9ad1c;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(233, 173, 28, .16);
}

.guided-tutorial__warning strong {
  display: block;
  color: #5d430a;
  font-size: 13px;
  line-height: 1.45;
}

.guided-tutorial__warning p {
  margin: 5px 0 0;
  color: #816a35;
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

.guided-tutorial__batch-progress {
  margin-top: 15px;
  padding: 13px 14px;
  background: #f6fbff;
  border: 1px solid #d7e9f8;
  border-radius: 10px;
}

.guided-tutorial__batch-progress > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.guided-tutorial__batch-progress strong { color: #214f75; font-size: 11px; }
.guided-tutorial__batch-progress span { color: #5e7f99; font: 700 10px/1 ui-monospace, monospace; }
.guided-tutorial__batch-meter { height: 5px; margin-top: 10px; overflow: hidden; background: #dcebf7; border-radius: 99px; }
.guided-tutorial__batch-meter i { display: block; height: 100%; background: linear-gradient(90deg, #1678cf, #54b2ef); border-radius: inherit; transition: width 220ms ease; }
.guided-tutorial__batch-progress ul { display: grid; gap: 4px; max-height: 88px; margin: 10px 0 0; padding: 9px 10px 9px 25px; overflow-y: auto; color: #9b4d3f; font-size: 10px; line-height: 1.5; background: #fff4f1; border-radius: 7px; }

.guided-tutorial__metric-notes { display: grid; gap: 8px; margin-top: 16px; }
.guided-tutorial__metric-notes article { padding: 12px 13px; background: #f6fbff; border: 1px solid #d6e8f6; border-radius: 9px; }
.guided-tutorial__metric-notes strong { display: block; color: #174e77; font-size: 11px; }
.guided-tutorial__metric-notes p { margin: 5px 0 0; color: #58758c; font-size: 10px; line-height: 1.6; }

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

.guided-tutorial__field-map {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.guided-tutorial__field-map > div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: stretch;
  overflow: hidden;
  background: #f6fbff;
  border: 1px solid #d7e9f7;
  border-radius: 9px;
}

.guided-tutorial__field-map strong {
  display: flex;
  align-items: center;
  padding: 11px 12px;
  color: #176aa7;
  font-size: 10px;
  background: #e8f5ff;
}

.guided-tutorial__field-map > div > span {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 8px 10px 8px 24px;
}

.guided-tutorial__field-map i {
  position: absolute;
  top: 50%;
  left: 8px;
  width: 9px;
  height: 1px;
  background: #4ba4e3;
}

.guided-tutorial__field-map i::after {
  position: absolute;
  top: -2px;
  right: -1px;
  width: 4px;
  height: 4px;
  content: '';
  border-top: 1px solid #4ba4e3;
  border-right: 1px solid #4ba4e3;
  transform: rotate(45deg);
}

.guided-tutorial__field-map b {
  color: #55768e;
  font-size: 9px;
  font-weight: 650;
}

.guided-tutorial__field-map .is-one-to-many {
  border-color: #81c2ee;
  box-shadow: 0 8px 20px rgba(31, 126, 195, .1);
}

.guided-tutorial__field-map .is-one-to-many b {
  animation: tutorial-binding-arrive 420ms both;
}

.guided-tutorial__field-map .is-one-to-many b + b { animation-delay: 120ms; }

.guided-tutorial__solution-results {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.guided-tutorial__solution-results article {
  display: grid;
  gap: 4px;
  padding: 12px 8px;
  text-align: center;
  background: linear-gradient(145deg, #eef8ff, #fff);
  border: 1px solid #cfe7f7;
  border-radius: 9px;
}

.guided-tutorial__solution-results article strong { color: #157bc3; font: 760 22px/1 ui-monospace, monospace; }
.guided-tutorial__solution-results article span { color: #5e7d94; font-size: 9px; }
.guided-tutorial__solution-results > p { grid-column: 1 / -1; margin: 0; padding: 10px 12px; color: #4e728c; font-size: 10px; text-align: center; background: #edf7fe; border-radius: 8px; }
.guided-tutorial__solution-results > p b { color: #1b699e; }
.guided-tutorial__solution-results.is-pull-result { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.guided-tutorial__solution-results.is-pull-result article { padding-inline: 5px; }
.guided-tutorial__solution-results.is-pull-result article strong { font-size: 18px; }

@keyframes tutorial-binding-arrive {
  from { opacity: 0; transform: translateX(-7px); }
  to { opacity: 1; transform: translateX(0); }
}

.guided-tutorial__drag-demo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 108px;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 13px;
  overflow: hidden;
  background: #f2f9ff;
  border: 1px solid #cfe7f8;
  border-radius: 10px;
}

.guided-tutorial__drag-demo > div { display: grid; gap: 4px; }
.guided-tutorial__drag-demo i { display: block; width: 74px; height: 7px; background: #b9d8ef; border-radius: 99px; animation: tutorial-drag-card 1.8s ease-in-out infinite; }
.guided-tutorial__drag-demo i:nth-child(2) { width: 62px; animation-delay: 140ms; }
.guided-tutorial__drag-demo i:nth-child(3) { width: 68px; animation-delay: 280ms; }
.guided-tutorial__drag-demo > span { color: #3486bf; font-size: 9px; font-weight: 760; }
.guided-tutorial__drag-demo > b { display: grid; height: 45px; place-items: center; color: #174d74; font-size: 10px; background: #fff; border: 1px dashed #58a7dd; border-radius: 9px; }
.guided-tutorial__drag-demo > small { grid-column: 1 / -1; color: #648096; font-size: 9px; text-align: right; }

.guided-tutorial__aggregate-map { display: grid; gap: 7px; margin-top: 16px; }
.guided-tutorial__aggregate-map > div { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 10px 11px; background: #f5faff; border: 1px solid #d9ebf8; border-radius: 9px; }
.guided-tutorial__aggregate-map strong { color: #174d74; font-size: 10px; }
.guided-tutorial__aggregate-map span { color: #6f8798; font-size: 9px; }
.guided-tutorial__aggregate-map b { color: #157bc3; font: 740 9px/1 ui-monospace, monospace; }
.guided-tutorial__aggregate-map p { margin: 1px 0 0; padding: 9px 11px; color: #47728f; font-size: 9px; text-align: center; background: #eaf6ff; border-radius: 8px; }

.guided-tutorial__package-checklist {
  display: grid;
  gap: 7px;
  margin-top: 15px;
}

.guided-tutorial__package-checklist span {
  display: grid;
  grid-template-columns: 23px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  color: #687f92;
  background: #f7fafc;
  border: 1px solid #e0e9f0;
  border-radius: 8px;
}

.guided-tutorial__package-checklist i {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  color: #6f8ba1;
  font-size: 9px;
  font-style: normal;
  background: #e7eef4;
  border-radius: 50%;
}

.guided-tutorial__package-checklist b { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.guided-tutorial__package-checklist span.checked { color: #27705a; background: #f0faf6; border-color: #bfe1d3; }
.guided-tutorial__package-checklist span.checked i { color: #fff; background: #32a078; }

.guided-tutorial__aggregate-origin {
  display: grid;
  gap: 7px;
  margin-top: 15px;
}

.guided-tutorial__aggregate-origin article { padding: 9px 10px; background: #f6fbff; border: 1px solid #d8eaf7; border-radius: 9px; }
.guided-tutorial__aggregate-origin header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.guided-tutorial__aggregate-origin header strong { color: #174d74; font-size: 10px; }
.guided-tutorial__aggregate-origin header b { color: #147fc8; font: 750 9px/1 ui-monospace, monospace; }
.guided-tutorial__aggregate-origin article p { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 0; }
.guided-tutorial__aggregate-origin article span { padding: 4px 6px; color: #617c91; font-size: 8px; background: #fff; border: 1px solid #dce8f0; border-radius: 99px; }
.guided-tutorial__aggregate-origin > small { padding: 8px 10px; color: #47728f; font-size: 9px; line-height: 1.5; text-align: center; background: #eaf6ff; border-radius: 8px; }

.guided-tutorial__impact-demo {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
  margin-top: 15px;
  padding: 13px;
  background: linear-gradient(135deg, #edf8ff, #fbfdff);
  border: 1px solid #bee0f7;
  border-radius: 10px;
}

.guided-tutorial__impact-demo > strong { grid-row: 1 / 3; padding: 13px 8px; color: #fff; font-size: 10px; text-align: center; background: #167fc9; border-radius: 8px; box-shadow: 0 7px 16px rgba(22, 127, 201, .17); }
.guided-tutorial__impact-demo > div, .guided-tutorial__impact-demo > p { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 0; }
.guided-tutorial__impact-demo > div i { position: relative; height: 2px; background: #64addf; animation: tutorial-impact-flow 1.6s ease-in-out infinite; }
.guided-tutorial__impact-demo > div i::after { position: absolute; top: -2px; right: 0; width: 5px; height: 5px; content: ''; border-top: 1px solid #64addf; border-right: 1px solid #64addf; transform: rotate(45deg); }
.guided-tutorial__impact-demo > div i:nth-child(2) { animation-delay: 130ms; }
.guided-tutorial__impact-demo > div i:nth-child(3) { animation-delay: 260ms; }
.guided-tutorial__impact-demo > p span { padding: 6px 3px; color: #315f80; font-size: 8px; text-align: center; background: #fff; border: 1px solid #d6e7f2; border-radius: 6px; }
.guided-tutorial__impact-demo > small { grid-column: 1 / -1; color: #46728f; font-size: 9px; text-align: center; }

@keyframes tutorial-impact-flow {
  0%, 100% { opacity: .35; transform: scaleX(.75); transform-origin: left; }
  50% { opacity: 1; transform: scaleX(1); transform-origin: left; }
}

@keyframes tutorial-drag-card {
  0%, 100% { opacity: .55; transform: translateX(0); }
  50% { opacity: 1; transform: translateX(18px); }
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
.guided-tutorial__brand-table table { width: 100%; margin: 10px 0 8px; border-collapse: collapse; font-size: 11px; background: #fff; user-select: text; }
.guided-tutorial__brand-table th,
.guided-tutorial__brand-table td { padding: 7px 10px; border: 1px solid #d8e5ed; text-align: left; }
.guided-tutorial__brand-table th { color: #547185; background: #f3f8fc; font-weight: 600; }
.guided-tutorial__brand-table small { color: #758998; font-size: 10px; }
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
  .guided-tutorial__field-map .is-one-to-many b { animation: none; }
  .guided-tutorial__drag-demo i { animation: none; }
  .guided-tutorial__impact-demo > div i { animation: none; }
}

@media (prefers-reduced-transparency: reduce) {
  .guided-tutorial__mask { background: #dceeff; backdrop-filter: none; }
  .guided-tutorial__card { background: #fff; }
}
</style>
