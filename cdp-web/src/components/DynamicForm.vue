<template>
  <el-form label-position="top" size="large" class="dynamic-form">
    <template v-for="field in node.schema" :key="field.key">
      <el-form-item
        v-show="isVisible(field, node)"
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
          <div class="form-row">
            <el-select v-model="node.formData[field.key]" multiple filterable allow-create default-first-option :multiple-limit="getListLimit(field, node)" :placeholder="`输入并回车创建${field.Label}`" @change="handleListInput(field.key, node)" no-data-text="💡 敲击回车或输入逗号自动炸开标签" class="flex-1 intercom-input select-auto-height"></el-select>
            <span v-if="getSelectionCountHint(field, node)" class="count-hint display-mono">{{ getSelectionCountHint(field, node) }}</span>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '单选组'">
          <el-radio-group v-model="node.formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? node.formData.title = [] : null" class="intercom-radio-group">
            <el-radio-button label="任意商品标题关键字">任意商品标题关键字</el-radio-button>
            <el-radio-button label="指定商品标题关键字">指定商品标题关键字</el-radio-button>
          </el-radio-group>
        </template>

        <template v-else-if="field.Widget_Type === '搜索多选'">
          <div class="form-row">
            <el-select-v2 v-model="node.formData[field.key]" :options="formatOptions(field.options)" multiple filterable clearable :reserve-keyword="false" :placeholder="`请搜索并选择${field.Label}`" class="flex-1 intercom-input select-auto-height" @change="handleMultiSelectChange(field.key, node)"></el-select-v2>
            <span v-if="getSelectionCountHint(field, node)" class="count-hint display-mono">{{ getSelectionCountHint(field, node) }}</span>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
          <div v-if="isMultiSelectPasteEnabled(field)" class="paste-root">
            <button type="button" class="paste-trigger" @click="togglePaste(node.id, field.key)" :class="{ open: pasteOpenMap[psKey(node.id, field.key)] }">
              <span class="paste-trigger-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </span>
              <span>{{ pasteOpenMap[psKey(node.id, field.key)] ? '收起' : '批量导入' }}</span>
            </button>
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
                        v-for="(item, i) in pasteResultMap[psKey(node.id, field.key)].valid"
                        :key="'v-'+item"
                        class="paste-chip ok"
                        :style="{ animationDelay: `${Math.min(i * 20, 300)}ms` }"
                      >{{ item }}</span>
                      <span
                        v-for="(item, i) in pasteResultMap[psKey(node.id, field.key)].invalid"
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
            <el-select-v2 :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${getArray(node.formData.channel).join(',')}-${node.formData.shop}` : field.key" v-model="node.formData[field.key]" :options="formatOptions(getDynamicOptions(field, node))" filterable clearable :placeholder="`请搜索并选择${field.Label}`" class="flex-1 intercom-input"></el-select-v2>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '复选组'">
          <el-checkbox-group v-model="node.formData[field.key]" class="custom-checkbox-group" @change="handleCheckboxChange(field, $event, node)">
            <el-checkbox v-for="opt in field.options" :key="opt" :label="opt" :disabled="isCheckboxDisabled(field, opt, node)">{{ opt }}</el-checkbox>
          </el-checkbox-group>
        </template>

        <template v-else-if="field.Widget_Type === '数值_切换'">
          <div class="range-block">
            <el-radio-group v-model="node.modeData[field.key]" size="small" class="intercom-radio-group">
              <el-radio-button label="unlimited">不限</el-radio-button>
              <el-radio-button label="min">≥ 最小值</el-radio-button>
              <el-radio-button label="range">自定义区间</el-radio-button>
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
            <el-radio-group v-model="node.modeData[field.key]" size="small" class="intercom-radio-group">
              <el-radio-button label="recent">过去 N 天</el-radio-button>
              <el-radio-button label="range">固定日期</el-radio-button>
            </el-radio-group>
            <div v-if="node.modeData[field.key] === 'recent'" class="range-inputs">
              <el-input-number v-model="node.formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" class="intercom-input" style="width:120px" />
              <span class="display-body">天</span>
              <span class="hint-text display-body-light">最多向前追溯 366 天</span>
            </div>
            <div v-if="node.modeData[field.key] === 'range'" class="range-inputs">
              <el-date-picker v-model="node.formData[field.key].dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYYMMDD" size="small" class="intercom-input" style="width:260px" :disabled-date="(time) => disabledDate(time, node)" @calendar-change="(val) => handleCalendarChange(val, node)" />
              <span class="hint-text display-body-light">{{ getExactDateRangeHint(node) }}</span>
            </div>
          </div>
        </template>

      </el-form-item>
    </template>
  </el-form>
</template>

<script setup>
import { inject, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCdpShared } from '../composables/useCdpShared'

const props = defineProps({ node: { type: Object, required: true } })

const emit = defineEmits(['overflow-split'])

const ctx = inject('solutionCenterContext', null)

const {
  isVisible, getDynamicDescription, getDynamicStyle,
  getSelectionCountHint, getListLimit, handleListInput,
  handleMultiSelectChange, formatOptions, getDynamicOptions,
  isCheckboxDisabled, handleCheckboxChange, getArray,
  getExactDateRangeHint, handleCalendarChange, disabledDate,
  parsePastedText, validatePastedMultiSelectItems, isMultiSelectPasteEnabled,
} = useCdpShared()

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
  const key = psKey(node.id, field.key)
  const results = pasteResultMap[key]
  if (!results || results.valid.length === 0) return

  const currentVals = getArray(node.formData[field.key])
  const allVals = [...currentVals, ...results.valid]
  const limit = getListLimit(field, node)

  if (limit > 0 && allVals.length > limit) {
    ElMessageBox.confirm(
      `「${field.Label}」已选 ${allVals.length} 个，超过上限 ${limit} 个。将自动拆分为 ${Math.ceil(allVals.length / limit)} 个节点（关系：并集），是否继续？`,
      '超限拆分节点',
      { confirmButtonText: '确认拆分', cancelButtonText: '取消', type: 'warning' }
    ).then(() => {
      node.formData[field.key] = allVals.slice(0, limit)
      emit('overflow-split', {
        nodeId: node.id,
        fieldKey: field.key,
        allValues: allVals,
        limit,
      })
      clearPaste(node.id, field.key)
      ElMessage.success(`已拆分为 ${Math.ceil(allVals.length / limit)} 个节点，有效值已分布到各节点`)
    }).catch(() => {
      node.formData[field.key] = allVals.slice(0, limit)
      clearPaste(node.id, field.key)
      ElMessage.warning(`已保留前 ${limit} 个选项，其余已丢弃`)
    })
  } else {
    node.formData[field.key] = allVals
    clearPaste(node.id, field.key)
    const addedCount = results.valid.length
    const invalidCount = results.invalid.length
    let msg = `已添加 ${addedCount} 个选项`
    if (invalidCount > 0) msg += `，${invalidCount} 个无效选项已忽略`
    ElMessage.success(msg)
  }
}
</script>

<style scoped>
.field-highlighted {
  border: 1px solid #ff6b4a !important;
  background: rgba(255, 107, 74, 0.06) !important;
  box-shadow: 0 0 0 2px rgba(255, 107, 74, 0.1);
  border-radius: 4px;
  padding: 8px;
  margin: 2px 0;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
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
  border-color: #ff6b4a;
  background: rgba(255, 107, 74, 0.03);
}
.field-selected {
  border-color: #ff6b4a !important;
  background: rgba(255, 107, 74, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 107, 74, 0.2);
  position: relative;
}
.check-mark {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ff6b4a;
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
.paste-trigger:hover,
.paste-trigger.open {
  color: #ff6b4a;
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
  border: 1px solid #e8e4dc;
  border-radius: 8px;
  padding: 12px;
  background: #fcfcf9;
}

.paste-textarea {
  width: 100%;
  border: 1px solid #e8e4dc;
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
  border-color: #ff6b4a;
  box-shadow: 0 0 0 3px rgba(255, 107, 74, 0.08);
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
  color: #e0554a;
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
  background: rgba(224, 85, 74, 0.06);
  color: #e0554a;
  border: 1px solid rgba(224, 85, 74, 0.1);
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
  border-top: 1px solid #f0ece4;
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
  background: #ff6b4a;
  color: #fff;
  min-width: 80px;
}
.paste-btn.confirm:hover:not(:disabled) {
  background: #f05a3a;
  box-shadow: 0 2px 8px rgba(255, 107, 74, 0.25);
}
.paste-btn.confirm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
