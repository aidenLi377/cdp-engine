<template>
  <el-form label-position="top" size="large" class="dynamic-form" :disabled="props.readonly">
    <template v-for="field in node.schema" :key="field.key">
      <el-form-item
        v-if="isVisible(field, node)"
        :data-tutorial-target="getTutorialFieldTarget(node, field)"
        :title="ctx && ctx.creatingCustomField && ctx.creatingCustomFieldStep === 2 && field.Widget_Type !== ctx.creatingCustomFieldType ? '仅可选择「' + (ctx.creatingCustomFieldType || '') + '」类型的字段' : undefined"
        :class="{
          'field-highlighted': ctx && ctx.isFieldHighlighted && ctx.isFieldHighlighted(node.id, field.key),
          'field-dimmed': ctx && ctx.creatingCustomField && ctx.creatingCustomFieldStep === 2 && field.Widget_Type !== ctx.creatingCustomFieldType,
          'field-selectable': ctx && ctx.creatingCustomField && (ctx.creatingCustomFieldStep === 1 || field.Widget_Type === ctx.creatingCustomFieldType),
          'field-selected': ctx && ctx.creatingCustomField && ctx.creatingCustomFieldBindings && ctx.creatingCustomFieldBindings.some(b => b.nodeId === node.id && b.fieldKey === field.key)
        }"
        @click="ctx && ctx.creatingCustomField && (ctx.creatingCustomFieldStep === 1 || field.Widget_Type === ctx.creatingCustomFieldType) ? ctx.onFieldClickForBinding(node.id, field.key) : null"
      >
        <div v-if="ctx && ctx.creatingCustomField && ctx.creatingCustomFieldBindings && ctx.creatingCustomFieldBindings.some(b => b.nodeId === node.id && b.fieldKey === field.key)" class="check-mark">&check;</div>

        <template #label>
          <span class="display-body strong">{{ field.Label }}</span>
          <template v-if="getDynamicDescription(field)">
            <el-tooltip v-if="getDynamicStyle(field) !== '文字'" :content="getDynamicDescription(field)" placement="top" effect="dark">
              <span class="tooltip-icon">ⓘ</span>
            </el-tooltip>
          </template>
        </template>

        <template v-if="field.Widget_Type === '普通输入框'">
          <div class="form-row">
            <el-input v-model="node.formData[field.key]" :placeholder="`请输入${field.Label}`" class="flex-1 intercom-input"></el-input>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '列表输入'">
          <div
            class="form-row"
            :data-tutorial-target="isTutorialProductIdField(node, field) ? 'paste-product-ids' : undefined"
            @paste.capture="onFieldPaste(node, field, $event)"
          >
            <el-select v-model="node.formData[field.key]" multiple filterable allow-create default-first-option :placeholder="`输入并回车创建${field.Label}`" @change="handleListFieldChange(field, node)" no-data-text="💡 敲击回车或输入逗号自动炸开标签" class="flex-1 intercom-input select-auto-height"></el-select>
            <span v-if="getSelectionCountHint(field, node)" class="count-hint display-mono">{{ getSelectionCountHint(field, node) }}</span>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
          <div v-if="isMultiSelectPasteEnabled(field)" class="paste-root">
            <Transition name="paste-panel">
              <div v-if="pasteOpenMap[psKey(node.id, field.key)]" class="paste-panel">
                <div class="paste-panel-body">
                  <textarea
                    v-model="pasteTextMap[psKey(node.id, field.key)]"
                    @input="onPasteInput(node, field)"
                    placeholder="从 Excel 复制一列数据粘贴到这里&#10;自动按换行 / 逗号 / Tab 拆分"
                    rows="2"
                    class="paste-textarea"
                  ></textarea>
                  <div v-if="pasteResultMap[psKey(node.id, field.key)]" class="paste-result">
                    <div class="paste-result-head">
                      <span class="paste-stat ok">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        匹配 {{ pasteResultMap[psKey(node.id, field.key)].valid.length }}
                      </span>
                      <span v-if="pasteResultMap[psKey(node.id, field.key)].invalid.length" class="paste-stat err">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        未收录 {{ pasteResultMap[psKey(node.id, field.key)].invalid.length }}
                      </span>
                    </div>
                    <div class="paste-chip-cloud">
                      <span
                        v-for="(item, i) in formatLeafCateChips(pasteResultMap[psKey(node.id, field.key)].valid)"
                        :key="'v-'+item"
                        class="paste-chip ok"
                        :style="{ animationDelay: `${Math.min(i * 20, 300)}ms` }"
                      >{{ item }}</span>
                      <span
                        v-for="(item, i) in formatLeafCateChips(pasteResultMap[psKey(node.id, field.key)].invalid)"
                        :key="'i-'+item"
                        class="paste-chip err"
                        :style="{ animationDelay: `${Math.min(i * 25 + 80, 400)}ms` }"
                        :title="`「${item}」不在可选列表中`"
                      >{{ item }}<span class="paste-chip-err-hint">未收录</span></span>
                    </div>
                  </div>
                  <div class="paste-panel-foot">
                    <button type="button" class="paste-btn cancel" @click="clearPaste(node.id, field.key)">取消</button>
                    <button
                      type="button"
                      class="paste-btn confirm"
                      :data-tutorial-target="isTutorialProductIdField(node, field) ? 'add-product-ids' : undefined"
                      @click="applyPaste(node, field)"
                      :disabled="!pasteResultMap[psKey(node.id, field.key)]?.valid.length"
                    >
                      添加 {{ pasteResultMap[psKey(node.id, field.key)]?.valid.length || 0 }} 项
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '单选组'">
          <el-radio-group v-model="node.formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? node.formData.title = [] : null" class="intercom-radio-group">
            <el-radio-button value="任意商品标题关键字">任意商品标题关键字</el-radio-button>
            <el-radio-button value="指定商品标题关键字">指定商品标题关键字</el-radio-button>
          </el-radio-group>
        </template>

        <template v-else-if="field.Widget_Type === '搜索多选'">
          <div class="form-row" @paste.capture="onFieldPaste(node, field, $event)">
            <el-select-v2
              :ref="(instance) => setTutorialSelectRef(node, field, instance)"
              v-model="node.formData[field.key]"
              :options="getSearchOptions(node, field, field.options)"
              multiple filterable clearable
              :filter-method="isCategorySearchField(field) ? (query) => handleCategorySearch(node, field, query) : undefined"
              :reserve-keyword="false"
              :popper-class="getTutorialSelectPopperClass(node, field)"
              :placeholder="`请搜索并选择${field.Label}`"
              class="flex-1 intercom-input select-auto-height"
              @change="handleMultiSelectFieldChange(field, node)"
              @visible-change="handleTutorialSelectVisibleChange(node, field, $event)"
            ></el-select-v2>
            <span v-if="getSelectionCountHint(field, node)" class="count-hint display-mono">{{ getSelectionCountHint(field, node) }}</span>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
          <div v-if="isMultiSelectPasteEnabled(field)" class="paste-root">
            <Transition name="paste-panel">
              <div v-if="pasteOpenMap[psKey(node.id, field.key)]" class="paste-panel">
                <div class="paste-panel-body">
                  <textarea
                    v-model="pasteTextMap[psKey(node.id, field.key)]"
                    @input="onPasteInput(node, field)"
                    placeholder="从 Excel 复制一列数据粘贴到这里&#10;自动按换行 / 逗号 / Tab 拆分"
                    rows="2"
                    class="paste-textarea"
                  ></textarea>
                  <div v-if="pasteResultMap[psKey(node.id, field.key)]" class="paste-result">
                    <div class="paste-result-head">
                      <span class="paste-stat ok">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        匹配 {{ pasteResultMap[psKey(node.id, field.key)].valid.length }}
                      </span>
                      <span v-if="pasteResultMap[psKey(node.id, field.key)].invalid.length" class="paste-stat err">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        未收录 {{ pasteResultMap[psKey(node.id, field.key)].invalid.length }}
                      </span>
                    </div>
                    <div class="paste-chip-cloud">
                      <span
                        v-for="(item, i) in formatLeafCateChips(pasteResultMap[psKey(node.id, field.key)].valid)"
                        :key="'v-'+item"
                        class="paste-chip ok"
                        :style="{ animationDelay: `${Math.min(i * 20, 300)}ms` }"
                      >{{ item }}</span>
                      <span
                        v-for="(item, i) in formatLeafCateChips(pasteResultMap[psKey(node.id, field.key)].invalid)"
                        :key="'i-'+item"
                        class="paste-chip err"
                        :style="{ animationDelay: `${Math.min(i * 25 + 80, 400)}ms` }"
                        :title="`「${item}」不在可选列表中`"
                      >{{ item }}<span class="paste-chip-err-hint">未收录</span></span>
                    </div>
                  </div>
                  <div class="paste-panel-foot">
                    <button type="button" class="paste-btn cancel" @click="clearPaste(node.id, field.key)">取消</button>
                    <button type="button" class="paste-btn confirm" @click="applyPaste(node, field)" :disabled="!pasteResultMap[psKey(node.id, field.key)]?.valid.length">
                      添加 {{ pasteResultMap[psKey(node.id, field.key)]?.valid.length || 0 }} 项
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '搜索单选'">
          <div class="form-row">
            <el-select-v2
              :ref="(instance) => setTutorialSelectRef(node, field, instance)"
              :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${getArray(node.formData.channel).join(',')}-${node.formData.shop}` : field.key"
              v-model="node.formData[field.key]"
              :options="getSearchOptions(node, field, getDynamicOptions(field, node))"
              filterable clearable
              :filter-method="isCategorySearchField(field) ? (query) => handleCategorySearch(node, field, query) : undefined"
              :popper-class="getTutorialSelectPopperClass(node, field)"
              :placeholder="`请搜索并选择${field.Label}`"
              class="flex-1 intercom-input"
              @change="onTutorialFieldChanged(node, field)"
              @visible-change="handleTutorialSelectVisibleChange(node, field, $event)"
            ></el-select-v2>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '复选组'">
          <el-checkbox-group
            v-model="node.formData[field.key]"
            class="custom-checkbox-group"
            :data-tutorial-target="isTutorialBehaviorField(node, field) ? 'select-behavior' : undefined"
            @change="onCheckboxGroupChange(field, $event, node)"
          >
            <el-checkbox
              v-for="opt in field.options"
              :key="opt"
              :value="opt"
              :disabled="isCheckboxDisabled(field, opt, node)"
            >{{ opt }}</el-checkbox>
          </el-checkbox-group>
        </template>

        <template v-else-if="field.Widget_Type === '数值_切换'">
          <div class="range-block">
            <el-radio-group v-model="node.modeData[field.key]" size="small" class="intercom-radio-group">
              <el-radio-button value="unlimited">不限</el-radio-button>
              <el-radio-button value="min">≥ 最小值</el-radio-button>
              <el-radio-button value="range">自定义区间</el-radio-button>
            </el-radio-group>
            <div class="range-inputs" v-if="node.modeData[field.key] !== 'unlimited'">
              <el-input-number v-model="node.formData[field.key].min" :min="0" :controls="false" placeholder="最小值" size="small" class="intercom-input" style="width:140px" />
              <span v-if="node.modeData[field.key] === 'range'" class="display-body range-sep">—</span>
              <el-input-number v-if="node.modeData[field.key] === 'range'" v-model="node.formData[field.key].max" :min="0" :controls="false" placeholder="最大值" size="small" class="intercom-input" style="width:140px" />
            </div>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '日期_切换'">
          <div class="range-block">
            <el-radio-group v-model="node.modeData[field.key]" size="small" class="intercom-radio-group" @change="handleDateModeChange(node, field)">
              <el-radio-button value="recent">过去 N 天</el-radio-button>
              <DateQuickRangePopover
                :disabled="props.readonly"
                @select="(dateRange) => applyQuickDateRange(node, field, dateRange)"
              >
                <el-radio-button value="range">固定日期</el-radio-button>
              </DateQuickRangePopover>
            </el-radio-group>
            <div v-if="node.modeData[field.key] === 'recent'" class="range-inputs">
              <el-input-number v-model="node.formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" class="intercom-input" style="width:120px" @update:model-value="onRecentDaysUpdate(node, field, $event)" />
              <span class="display-body">天</span>
              <span class="hint-text display-body-light">最多向前追溯 366 天</span>
            </div>
            <div v-if="node.modeData[field.key] === 'range'" class="range-inputs">
              <el-date-picker v-model="node.formData[field.key].dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYYMMDD" size="small" class="intercom-input" style="width:260px" :disabled-date="(time) => disabledDate(time, node)" @calendar-change="(val) => handleCalendarChange(val, node)" @change="onDateRangeChange(node, field, $event)" />
              <span class="hint-text display-body-light">{{ getExactDateRangeHint(node) }}</span>
            </div>
          </div>
        </template>

      </el-form-item>
    </template>
  </el-form>
</template>

<script setup>
import { inject, onBeforeUnmount, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCdpShared } from '../composables/useCdpShared'
import { chunkBySecondaryCategory } from '../utils/solutionState.js'
import { markCategoryBehaviorDateManual } from '../utils/categoryBehaviorDateDefaults.js'
import { rankCategoryOptions } from '../utils/categoryOptionSearch.js'
import { useGuidedTutorial } from '../composables/useGuidedTutorial.js'
import {
  CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
  PARAMETER_BATCH_TUTORIAL_ID,
  PARAMETER_BATCH_TUTORIAL_VALUES,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_VALUES,
} from '../utils/guidedTutorialConfig.js'
import DateQuickRangePopover from './DateQuickRangePopover.vue'

const props = defineProps({
  node: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  // 方案使用时，多个超限字段不能自动做笛卡尔积拆分；制作方案仍保持原有行为。
  overflowPolicy: { type: String, default: 'legacy' },
  nodeIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['overflow-split'])

const ctx = inject('solutionCenterContext', null)
const {
  state: guidedTutorialState,
  currentStep: guidedTutorialStep,
  completeStep: completeGuidedTutorialStep,
  isStep: isGuidedTutorialStep,
  updateContext: updateGuidedTutorialContext,
} = useGuidedTutorial()

const {
  isVisible, getDynamicDescription, getDynamicStyle,
  getSelectionCountHint, getListLimit, handleListInput,
  handleMultiSelectChange, formatOptions, getDynamicOptions,
  isCheckboxDisabled, handleCheckboxChange, getArray,
  getExactDateRangeHint, handleCalendarChange, disabledDate,
  parsePastedText, validatePastedMultiSelectItems, isMultiSelectPasteEnabled,
  collectNodeOverflows,
  countUniqueSecondaryCategories,
} = useCdpShared()

const tutorialSelectRefs = new Map()
const pendingTutorialSelectSteps = new Map()
const tutorialSelectCloseTimers = new Map()
const categorySearchQueries = reactive({})

function tutorialSelectKey(node, field) {
  return `${node?.id || 'node'}:${field?.key || 'field'}`
}

function isCategorySearchField(field) {
  return ['leafCates', 'cate'].includes(field?.key) || String(field?.Label || '').includes('类目')
}

function handleCategorySearch(node, field, query) {
  categorySearchQueries[tutorialSelectKey(node, field)] = String(query ?? '')
}

function getSearchOptions(node, field, options) {
  const formatted = formatOptions(options)
  if (!isCategorySearchField(field)) return formatted
  return rankCategoryOptions(formatted, categorySearchQueries[tutorialSelectKey(node, field)] || '')
}

function clearCategorySearch(node, field) {
  if (!isCategorySearchField(field)) return
  delete categorySearchQueries[tutorialSelectKey(node, field)]
}

function setTutorialSelectRef(node, field, instance) {
  const key = tutorialSelectKey(node, field)
  if (instance) tutorialSelectRefs.set(key, instance)
  else tutorialSelectRefs.delete(key)
}

function getTutorialSelectPopperClass(node, field) {
  const target = getTutorialFieldTarget(node, field)
  const stepTarget = guidedTutorialStep.value?.target || ''
  return target && stepTarget.includes(`"${target}"`)
    ? 'guided-tutorial-select-popper'
    : undefined
}

function closeTutorialSelect(node, field) {
  const instance = tutorialSelectRefs.get(tutorialSelectKey(node, field))
  instance?.blur?.()
  instance?.$el?.querySelector?.('input')?.blur?.()
}

function finishPendingTutorialSelectStep(node, field) {
  const key = tutorialSelectKey(node, field)
  const stepId = pendingTutorialSelectSteps.get(key)
  if (!stepId) return
  pendingTutorialSelectSteps.delete(key)
  const timer = tutorialSelectCloseTimers.get(key)
  if (timer) window.clearTimeout(timer)
  tutorialSelectCloseTimers.delete(key)
  if (isGuidedTutorialStep(stepId)) completeGuidedTutorialStep(stepId)
}

function handleTutorialSelectVisibleChange(node, field, visible) {
  if (visible) return
  clearCategorySearch(node, field)
  const key = tutorialSelectKey(node, field)
  const previousTimer = tutorialSelectCloseTimers.get(key)
  if (previousTimer) window.clearTimeout(previousTimer)
  // Element Plus restores focus to the input after emitting visible-change.
  // Advance only after that focus scroll has settled, otherwise the next
  // tutorial target can be pushed outside the canvas viewport.
  tutorialSelectCloseTimers.set(key, window.setTimeout(() => {
    finishPendingTutorialSelectStep(node, field)
  }, 180))
}

function completeTutorialStepAfterSelectClose(node, field, stepId) {
  const key = tutorialSelectKey(node, field)
  pendingTutorialSelectSteps.set(key, stepId)
  closeTutorialSelect(node, field)
  const previousTimer = tutorialSelectCloseTimers.get(key)
  if (previousTimer) window.clearTimeout(previousTimer)
  tutorialSelectCloseTimers.set(key, window.setTimeout(() => {
    finishPendingTutorialSelectStep(node, field)
  }, 180))
}

function applyQuickDateRange(node, field, dateRange) {
  markCategoryBehaviorDateManual(node)
  node.modeData[field.key] = 'range'
  node.formData[field.key].dateRange = [...dateRange]
  node.selectedFirstDate = null
  if (shouldSyncTutorialTime(node)) {
    updateGuidedTutorialContext({
      dateMode: 'range',
      dateRange: [...dateRange],
    })
  }
}

function shouldSyncTutorialTime(node) {
  return isTutorialCategoryItemNode(node)
    || (
      [SOLUTION_REUSE_TUTORIAL_ID, PARAMETER_BATCH_TUTORIAL_ID].includes(guidedTutorialState.taskId)
      && node?.packageType === SOLUTION_REUSE_TUTORIAL_VALUES.packageType
      && props.nodeIndex === 0
    )
}

function isTutorialCategoryItemNode(node) {
  return node?.packageType === '类目商品行为'
}

function isTutorialProductIdField(node, field) {
  return isTutorialCategoryItemNode(node)
    && (field?.key === 'item' || String(field?.Label || '').includes('商品ID'))
}

function isTutorialBehaviorField(node, field) {
  return isTutorialCategoryItemNode(node)
    && field?.key === 'bhv'
}

function getTutorialFieldTarget(node, field) {
  if (
    guidedTutorialState.active
    && [SOLUTION_REUSE_TUTORIAL_ID, PULL_ANALYSIS_GROUP_TUTORIAL_ID, PARAMETER_BATCH_TUTORIAL_ID].includes(guidedTutorialState.taskId)
  ) {
    if (ctx?.isTutorialSolutionCenter) {
      return `solution-node-${props.nodeIndex}-${field.key}`
    }
    if (
      guidedTutorialState.taskId === PARAMETER_BATCH_TUTORIAL_ID
      && node?.packageType === PARAMETER_BATCH_TUTORIAL_VALUES.packageType
      && props.nodeIndex === 0
    ) {
      return `parameter-node-${field.key}`
    }
    if (node?.packageType === SOLUTION_REUSE_TUTORIAL_VALUES.packageType) {
      const role = props.nodeIndex === 0 ? 'own' : 'competitor'
      return `solution-${role}-${field.key}`
    }
  }
  if (isTutorialCategoryItemNode(node) && (field?.key === 'time' || field?.Widget_Type === '日期_切换')) {
    return 'set-time'
  }
  return undefined
}

function normalizedFieldValues(value) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function onTutorialFieldChanged(node, field) {
  if (!guidedTutorialState.active) return
  if (node?.packageType !== SOLUTION_REUSE_TUTORIAL_VALUES.packageType) return
  const values = normalizedFieldValues(node.formData?.[field.key])
  const includes = expected => values.includes(expected)
  if (guidedTutorialState.taskId === PARAMETER_BATCH_TUTORIAL_ID) {
    const stepChecks = {
      'parameter-set-category': props.nodeIndex === 0
        && field.key === 'leafCates'
        && includes(PARAMETER_BATCH_TUTORIAL_VALUES.category),
      'parameter-set-brand': props.nodeIndex === 0
        && field.key === 'stdBrand'
        && includes(PARAMETER_BATCH_TUTORIAL_VALUES.initialBrand),
      'parameter-set-channel': props.nodeIndex === 0
        && field.key === 'channel'
        && includes(PARAMETER_BATCH_TUTORIAL_VALUES.channel),
    }
    const stepId = Object.keys(stepChecks).find(id => isGuidedTutorialStep(id) && stepChecks[id])
    if (stepId) completeTutorialStepAfterSelectClose(node, field, stepId)
    return
  }
  if (guidedTutorialState.taskId === PULL_ANALYSIS_GROUP_TUTORIAL_ID) {
    const stepChecks = {
      'pull-set-own-brand': props.nodeIndex === 2
        && field.key === 'stdBrand'
        && includes(SOLUTION_REUSE_TUTORIAL_VALUES.ownBrand),
      'pull-set-competitor-brand': props.nodeIndex === 2
        && field.key === 'stdBrand'
        && includes(SOLUTION_REUSE_TUTORIAL_VALUES.initialCompetitorBrand),
    }
    const stepId = Object.keys(stepChecks).find(id => isGuidedTutorialStep(id) && stepChecks[id])
    if (stepId) completeTutorialStepAfterSelectClose(node, field, stepId)
    return
  }
  if (guidedTutorialState.taskId !== SOLUTION_REUSE_TUTORIAL_ID) return
  const stepChecks = {
    'set-own-category': props.nodeIndex === 0 && field.key === 'leafCates' && includes(SOLUTION_REUSE_TUTORIAL_VALUES.initialCategory),
    'set-own-brand': props.nodeIndex === 0 && field.key === 'stdBrand' && includes(SOLUTION_REUSE_TUTORIAL_VALUES.ownBrand),
    'set-own-channel': props.nodeIndex === 0 && field.key === 'channel' && includes(SOLUTION_REUSE_TUTORIAL_VALUES.channel),
    'set-competitor-brand': props.nodeIndex === 1 && field.key === 'stdBrand' && includes(SOLUTION_REUSE_TUTORIAL_VALUES.initialCompetitorBrand),
  }
  const stepId = Object.keys(stepChecks).find(id => isGuidedTutorialStep(id) && stepChecks[id])
  if (stepId) completeTutorialStepAfterSelectClose(node, field, stepId)
}

function handleListFieldChange(field, node) {
  handleListInputWithOverflow(field.key, node)
  onTutorialFieldChanged(node, field)
}

function handleMultiSelectFieldChange(field, node) {
  handleMultiSelectChangeWithOverflow(field.key, node)
  onTutorialFieldChanged(node, field)
}

function onCheckboxGroupChange(field, value, node) {
  handleCheckboxChange(field, value, node)
  const values = Array.isArray(value) ? value : [value]
  if (isTutorialBehaviorField(node, field)) {
    updateGuidedTutorialContext({ behaviors: [...values] })
  }
  if (isTutorialBehaviorField(node, field) && values.length > 0) {
    completeGuidedTutorialStep('select-behavior')
  }
  if (
    guidedTutorialState.taskId === SOLUTION_REUSE_TUTORIAL_ID
    && node?.packageType === SOLUTION_REUSE_TUTORIAL_VALUES.packageType
    && props.nodeIndex === 0
    && field.key === 'bhv'
    && values.includes(SOLUTION_REUSE_TUTORIAL_VALUES.behavior)
  ) {
    completeGuidedTutorialStep('set-own-behavior')
  }
  if (
    guidedTutorialState.taskId === PARAMETER_BATCH_TUTORIAL_ID
    && node?.packageType === PARAMETER_BATCH_TUTORIAL_VALUES.packageType
    && props.nodeIndex === 0
    && field.key === 'bhv'
    && values.length === 1
    && values.includes(PARAMETER_BATCH_TUTORIAL_VALUES.behavior)
    && isGuidedTutorialStep('parameter-set-purchase')
  ) {
    completeGuidedTutorialStep('parameter-set-purchase')
  }
  if (
    guidedTutorialState.taskId === PULL_ANALYSIS_GROUP_TUTORIAL_ID
    && props.nodeIndex === 2
    && field.key === 'bhv'
    && values.length === 1
    && values.includes('购买')
    && isGuidedTutorialStep('pull-set-own-purchase')
  ) {
    completeGuidedTutorialStep('pull-set-own-purchase')
  }
  onTutorialFieldChanged(node, field)
}

function handleDateModeChange(node, field) {
  markCategoryBehaviorDateManual(node)
  if (shouldSyncTutorialTime(node)) {
    updateGuidedTutorialContext({
      dateMode: node.modeData?.[field.key] || '',
      recentDays: node.formData?.[field.key]?.days ?? null,
      dateRange: Array.isArray(node.formData?.[field.key]?.dateRange)
        ? [...node.formData[field.key].dateRange]
        : [],
    })
  }
}

function onRecentDaysUpdate(node, field, value) {
  markCategoryBehaviorDateManual(node)
  if (shouldSyncTutorialTime(node)) {
    updateGuidedTutorialContext({
      dateMode: node.modeData?.[field.key] || '',
      recentDays: value,
      dateRange: Array.isArray(node.formData?.[field.key]?.dateRange)
        ? [...node.formData[field.key].dateRange]
        : [],
    })
  }
}

function onDateRangeChange(node, field, value) {
  markCategoryBehaviorDateManual(node)
  if (!shouldSyncTutorialTime(node)) return
  updateGuidedTutorialContext({
    dateMode: node.modeData?.[field.key] || 'range',
    dateRange: Array.isArray(value) ? [...value] : [],
  })
}

function onFieldPaste(node, field, event) {
  const pastedText = event.clipboardData?.getData('text') || ''
  if (!pastedText.trim()) return
  const items = parsePastedText(pastedText)
  if (items.length <= 1) return
  event.preventDefault()
  event.stopPropagation()
  const key = psKey(node.id, field.key)
  pasteOpenMap[key] = true
  pasteTextMap[key] = pastedText
  onPasteInput(node, field)
  if (isGuidedTutorialStep('paste-ids') && isTutorialProductIdField(node, field)) {
    const normalizedItems = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))]
    const expectedItems = [...CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS]
    const matchesTutorialIds = normalizedItems.length === expectedItems.length
      && expectedItems.every((id) => normalizedItems.includes(id))
    if (matchesTutorialIds) {
      updateGuidedTutorialContext({ pastedIdCount: normalizedItems.length, pasteError: '' })
      completeGuidedTutorialStep('paste-ids')
    } else {
      updateGuidedTutorialContext({
        pastedIdCount: normalizedItems.length,
        pasteError: `请粘贴教程提供的 7 个商品 ID；当前识别到 ${normalizedItems.length} 项。`,
      })
    }
  }
}

function handleListInputWithOverflow(key, node) {
  handleListInput(key, node, ({ field, uniqueArr, limit }) => {
    node.formData[field.key] = uniqueArr
    const allOverflows = collectNodeOverflows(node)
    if (allOverflows.length === 0) return

    if (props.overflowPolicy === 'solution-use' && allOverflows.length > 1) {
      const fieldList = allOverflows.map(o => `「${o.fieldLabel}」${o.allValues.length}/${o.limit}`).join('、')
      ElMessage.warning(`当前有多个字段超限：${fieldList}。一次只能处理一个超限字段，请先删除多余超限值`)
      return
    }

    const totalNodes = allOverflows.reduce((prod, o) => {
    const effLen = o.fieldKey === 'leafCates' ? countUniqueSecondaryCategories(o.allValues) : o.allValues.length
    return prod * Math.ceil(effLen / o.limit)
  }, 1)
    const fieldList = allOverflows.map(o => `「${o.fieldLabel}」${o.allValues.length}/${o.limit}`).join('、')

    ElMessageBox.confirm(
      `以下字段超限：${fieldList}。将自动拆分为 ${totalNodes} 个节点（关系：并集），是否继续？`,
      '超限拆分节点',
      { confirmButtonText: '确认拆分', cancelButtonText: '取消', type: 'warning' }
    ).then(() => {
      for (const ov of allOverflows) {
        if (ov.fieldKey === 'leafCates') {
          const chunks = chunkBySecondaryCategory(ov.allValues, ov.limit)
          node.formData[ov.fieldKey] = chunks[0] || []
        } else {
          node.formData[ov.fieldKey] = ov.allValues.slice(0, ov.limit)
        }
      }
      emit('overflow-split', { nodeId: node.id, overflows: allOverflows })
      ElMessage.success(`已拆分为 ${totalNodes} 个节点，有效值已分布到各节点`)
    }).catch(() => {
      ElMessage.info('已取消拆分，溢出数据保留，可稍后统一处理')
    })
  })
}

function handleMultiSelectChangeWithOverflow(key, node) {
  handleMultiSelectChange(key, node, ({ field, uniqueArr, limit }) => {
    node.formData[field.key] = uniqueArr
    const allOverflows = collectNodeOverflows(node)
    if (allOverflows.length === 0) return

    if (props.overflowPolicy === 'solution-use' && allOverflows.length > 1) {
      const fieldList = allOverflows.map(o => `「${o.fieldLabel}」${o.allValues.length}/${o.limit}`).join('、')
      ElMessage.warning(`当前有多个字段超限：${fieldList}。一次只能处理一个超限字段，请先删除多余超限值`)
      return
    }

    const totalNodes = allOverflows.reduce((prod, o) => {
    const effLen = o.fieldKey === 'leafCates' ? countUniqueSecondaryCategories(o.allValues) : o.allValues.length
    return prod * Math.ceil(effLen / o.limit)
  }, 1)
    const fieldList = allOverflows.map(o => `「${o.fieldLabel}」${o.allValues.length}/${o.limit}`).join('、')

    ElMessageBox.confirm(
      `以下字段超限：${fieldList}。将自动拆分为 ${totalNodes} 个节点（关系：并集），是否继续？`,
      '超限拆分节点',
      { confirmButtonText: '确认拆分', cancelButtonText: '取消', type: 'warning' }
    ).then(() => {
      for (const ov of allOverflows) {
        if (ov.fieldKey === 'leafCates') {
          const chunks = chunkBySecondaryCategory(ov.allValues, ov.limit)
          node.formData[ov.fieldKey] = chunks[0] || []
        } else {
          node.formData[ov.fieldKey] = ov.allValues.slice(0, ov.limit)
        }
      }
      emit('overflow-split', { nodeId: node.id, overflows: allOverflows })
      ElMessage.success(`已拆分为 ${totalNodes} 个节点，有效值已分布到各节点`)
    }).catch(() => {
      ElMessage.info('已取消拆分，溢出数据保留，可稍后统一处理')
    })
  })
}

function formatLeafCateChips(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  const groups = new Map()
  const singles = []
  for (const item of items) {
    const parts = String(item).split('>')
    if (parts.length <= 2) { singles.push(item); continue }
    const sec = parts.slice(0, 2).join('>')
    const third = parts[2]
    if (!groups.has(sec)) groups.set(sec, [])
    groups.get(sec).push(third)
  }
  const result = singles.slice()
  for (const [sec, thirds] of groups) {
    result.push(thirds.length > 0 ? `${sec}：${thirds.join('，')}` : sec)
  }
  return result
}

// ---- 粘贴状态 ----
const pasteOpenMap = reactive({})
const pasteTextMap = reactive({})
const pasteResultMap = reactive({})

function psKey(nodeId, fieldKey) {
  return `${nodeId}:${fieldKey}`
}

function togglePaste(nodeId, fieldKey) {
  const key = psKey(nodeId, fieldKey)
  if (pasteOpenMap[key]) {
    clearPaste(nodeId, fieldKey)
  } else {
    pasteOpenMap[key] = true
    pasteTextMap[key] = ''
    delete pasteResultMap[key]
  }
}

function onPasteInput(node, field) {
  const key = psKey(node.id, field.key)
  const text = pasteTextMap[key] || ''
  const items = parsePastedText(text)
  const results = validatePastedMultiSelectItems(items, field, node)
  pasteResultMap[key] = results
}

function clearPaste(nodeId, fieldKey) {
  const key = psKey(nodeId, fieldKey)
  delete pasteOpenMap[key]
  delete pasteTextMap[key]
  delete pasteResultMap[key]
}

function applyPaste(node, field) {
  const nodePastes = []
  for (const [pasteKey, pasteResults] of Object.entries(pasteResultMap)) {
    if (!pasteResults || pasteResults.valid.length === 0) continue
    const colonIdx = pasteKey.indexOf(':')
    if (colonIdx < 0) continue
    const nid = pasteKey.slice(0, colonIdx)
    if (String(nid) !== String(node.id)) continue
    const fkey = pasteKey.slice(colonIdx + 1)
    nodePastes.push({ fieldKey: fkey, results: pasteResults, pasteKey })
  }

  if (nodePastes.length === 0) return

  const totalAdded = nodePastes.reduce((sum, p) => sum + p.results.valid.length, 0)
  for (const { fieldKey, results, pasteKey } of nodePastes) {
    const currentVals = getArray(node.formData[fieldKey])
    node.formData[fieldKey] = [...currentVals, ...results.valid]
    clearPaste(node.id, fieldKey)
  }

  const allOverflows = collectNodeOverflows(node)
  if (allOverflows.length === 0) {
    ElMessage.success(`已添加 ${totalAdded} 个选项`)
    return
  }

  if (props.overflowPolicy === 'solution-use' && allOverflows.length > 1) {
    const fieldList = allOverflows.map(o => `「${o.fieldLabel}」${o.allValues.length}/${o.limit}`).join('、')
    ElMessage.warning(`当前有多个字段超限：${fieldList}。一次只能处理一个超限字段，请先删除多余超限值`)
    return
  }

  const totalNodes = allOverflows.reduce((prod, o) => {
    const effLen = o.fieldKey === 'leafCates' ? countUniqueSecondaryCategories(o.allValues) : o.allValues.length
    return prod * Math.ceil(effLen / o.limit)
  }, 1)
  const fieldList = allOverflows.map(o => `「${o.fieldLabel}」${o.allValues.length}/${o.limit}`).join('、')

  if (isGuidedTutorialStep('add-product-ids') && isTutorialProductIdField(node, field)) {
    completeGuidedTutorialStep('add-product-ids')
  }

  ElMessageBox.confirm(
    `以下字段超限：${fieldList}。将自动拆分为 ${totalNodes} 个节点（关系：并集），是否继续？`,
    '超限拆分节点',
    { confirmButtonText: '确认拆分', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    for (const ov of allOverflows) {
      node.formData[ov.fieldKey] = ov.allValues.slice(0, ov.limit)
    }
    emit('overflow-split', { nodeId: node.id, overflows: allOverflows })
    ElMessage.success(`已拆分为 ${totalNodes} 个节点，有效值已分布到各节点`)
    completeGuidedTutorialStep('confirm-split')
  }).catch(() => {
    ElMessage.info('已取消拆分，溢出数据保留，可稍后统一处理')
  })
}

onBeforeUnmount(() => {
  tutorialSelectCloseTimers.forEach((timer) => window.clearTimeout(timer))
  tutorialSelectCloseTimers.clear()
  pendingTutorialSelectSteps.clear()
  tutorialSelectRefs.clear()
})
</script>

<style scoped>
.field-highlighted {
  border-width: 1px !important;
  border-style: solid !important;
  border-radius: 4px;
  padding: 8px;
  margin: 2px 0;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.field-highlighted,
.field-selected {
  border-color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}
.field-dimmed {
  opacity: 0.35;
  pointer-events: none;
  filter: grayscale(0.6);
}
.field-selectable {
  cursor: pointer;
  border: 2px dashed transparent;
  padding: 8px;
  margin: 2px 0;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.field-selectable:hover {
  border-color: var(--ui-control-border);
  background: var(--ui-fill);
}
.field-selected {
  position: relative;
}
.check-mark {
  position: absolute;
  top: -26px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ui-accent);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

/* ---- 粘贴批量导入 ---- */
.paste-root {
  margin-top: 3px;
}

.paste-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: #a1a1a6;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 0;
  transition: color 0.2s;
  letter-spacing: 0.01em;
}
.paste-trigger:hover {
  color: var(--ui-ink);
}
.paste-trigger.open {
  color: var(--ui-accent);
}
.paste-trigger-icon {
  display: flex;
  align-items: center;
  opacity: 0.7;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.paste-trigger.open .paste-trigger-icon {
  transform: rotate(45deg);
}

.paste-panel-enter-active {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.1, 1);
}
.paste-panel-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 1, 1);
}
.paste-panel-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(-6px) scale(0.98);
}
.paste-panel-enter-to {
  opacity: 1;
  max-height: 420px;
  transform: translateY(0) scale(1);
}
.paste-panel-leave-from {
  opacity: 1;
  max-height: 420px;
  transform: translateY(0) scale(1);
}
.paste-panel-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-4px) scale(0.98);
}

.paste-panel {
  overflow: hidden;
  max-height: 420px;
}
.paste-panel-body {
  margin-top: 6px;
  border: 1px solid var(--ui-control-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--ui-surface);
}

.paste-textarea {
  width: 100%;
  border: 1px solid var(--ui-control-border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  box-sizing: border-box;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
  color: #3c3c43;
}
.paste-textarea:focus {
  outline: none;
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}
.paste-textarea::placeholder {
  color: #c7c7cc;
  font-family: inherit;
}

.paste-result {
  margin-top: 10px;
}
.paste-result-head {
  display: flex;
  gap: 16px;
  margin-bottom: 6px;
}
.paste-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.paste-stat.ok {
  color: #2e8b57;
}
.paste-stat.err {
  color: var(--ui-danger);
}

.paste-chip-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 100px;
  overflow-y: auto;
}
.paste-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  animation: paste-chip-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.paste-chip.ok {
  background: rgba(46, 139, 87, 0.07);
  color: #2e8b57;
  border: 1px solid rgba(46, 139, 87, 0.12);
}
.paste-chip.err {
  background: rgba(255, 59, 48, 0.06);
  color: var(--ui-danger);
  border: 1px solid rgba(255, 59, 48, 0.1);
  cursor: help;
}
.paste-chip-err-hint {
  font-size: 9px;
  opacity: 0.7;
  font-weight: 500;
  letter-spacing: 0.03em;
}

@keyframes paste-chip-in {
  0% {
    opacity: 0;
    transform: scale(0.7) translateY(4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.paste-panel-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-divider);
}
.paste-btn {
  padding: 5px 14px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
  letter-spacing: 0.02em;
}
.paste-btn.cancel {
  background: transparent;
  color: #78787d;
}
.paste-btn.cancel:hover {
  color: #3c3c43;
  background: rgba(0,0,0,0.04);
}
.paste-btn.confirm {
  background: var(--ui-ink);
  color: #ffffff;
  box-shadow: none;
  min-width: 80px;
}
.paste-btn.confirm:hover:not(:disabled) {
  background: #2c2c2e;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
}
.paste-btn.confirm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
