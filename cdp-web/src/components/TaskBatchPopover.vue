<template>
  <el-popover
    v-model:visible="visible"
    placement="right-start"
    :width="420"
    :offset="12"
    :show-arrow="true"
    :hide-after="0"
    :persistent="true"
    :disabled="disabled"
    popper-class="tc-batch-popover-shell"
    trigger="click"
    @show="focusEditor"
  >
    <template #reference>
      <button
        type="button"
        class="tc-batch-popover-trigger"
        :disabled="disabled"
        :aria-label="`配置并运行${taskLabel}批量名单`"
      >
        批量
      </button>
    </template>

    <form class="tc-batch-composer" @submit.prevent="runDraft" @keydown.esc.stop="closePopover">
      <header class="tc-batch-composer__header">
        <div>
          <h3>批量人群包</h3>
          <p>粘贴 {{ taskLabel }} 名单后直接运行</p>
        </div>
        <div class="tc-batch-composer__header-actions">
          <button type="button" class="tc-batch-composer__clear" @click="clearDraft">清空</button>
          <button type="button" class="tc-batch-composer__close" aria-label="关闭批量名单" @click="closePopover">×</button>
        </div>
      </header>

      <textarea
        ref="editor"
        :value="modelValue"
        class="tc-batch-composer__textarea"
        rows="6"
        :aria-label="`${taskLabel}批量人群包名单`"
        placeholder="粘贴人群包名称，每行一个"
        @input="updateDraft($event.target.value)"
      ></textarea>

      <div class="tc-batch-composer__helper">
        <span>每行一个，也支持逗号和 Tab</span>
        <span v-if="draftBatch.duplicateCount" class="is-duplicate">已自动去重 {{ draftBatch.duplicateCount }} 个</span>
      </div>

      <div v-if="runHint" class="tc-batch-composer__run-hint">
        <span aria-hidden="true"></span>
        {{ runHint }}
      </div>

      <footer class="tc-batch-composer__footer">
        <div class="tc-batch-composer__status" :class="{ 'is-ready': draftBatch.items.length > 0 }" aria-live="polite">
          <span class="tc-batch-composer__dot" aria-hidden="true"></span>
          <span>{{ draftBatch.items.length ? `已识别 ${draftBatch.items.length} 个` : '等待粘贴名单' }}</span>
        </div>
        <button type="button" class="tc-batch-composer__cancel" @click="closePopover">取消</button>
        <button
          type="submit"
          class="tc-batch-composer__run"
          :disabled="draftBatch.items.length === 0"
        >{{ draftBatch.items.length ? `运行 ${draftBatch.items.length} 个` : '运行' }}</button>
      </footer>
    </form>
  </el-popover>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { parseCrowdBatch } from '../utils/crowdBatch.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  taskLabel: { type: String, required: true },
  runHint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'run'])

const visible = ref(false)
const editor = ref(null)
const draftBatch = computed(() => parseCrowdBatch(props.modelValue))

watch(() => props.disabled, (disabled) => {
  if (disabled) visible.value = false
})

function updateDraft(value) {
  emit('update:modelValue', value)
}

function clearDraft() {
  updateDraft('')
  nextTick(() => editor.value?.focus())
}

function closePopover() {
  visible.value = false
}

function focusEditor() {
  nextTick(() => editor.value?.focus())
}

function runDraft() {
  if (!draftBatch.value.items.length) return
  emit('run', props.modelValue.trim())
  closePopover()
}
</script>

<style>
.tc-batch-popover-shell.el-popper {
  padding: 0;
  overflow: hidden;
  border: 1px solid #e5e5e7;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.11), 0 2px 8px rgba(15, 23, 42, 0.05);
}

.tc-batch-popover-shell.el-popper .el-popper__arrow::before {
  border-color: #e5e5e7;
  background: #fff;
}

.tc-batch-popover-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #6e6e73;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  flex: 0 0 auto;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.tc-batch-popover-trigger:hover:not(:disabled) {
  color: #1d1d1f;
  background: #fff;
}

.tc-batch-popover-trigger:focus-visible {
  outline: 2px solid #1d1d1f;
  outline-offset: 2px;
}

.tc-batch-popover-trigger:disabled {
  color: #a1a1a6;
  background: #fff;
  cursor: not-allowed;
}

.tc-batch-composer {
  display: flex;
  flex-direction: column;
  min-height: 292px;
  color: #1d1d1f;
  background: #fff;
}

.tc-batch-composer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 18px 14px;
}

.tc-batch-composer__header h3 {
  margin: 0;
  color: #1d1d1f;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.tc-batch-composer__header p {
  margin: 5px 0 0;
  color: #86868b;
  font-size: 10px;
  line-height: 1.4;
}

.tc-batch-composer__header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.tc-batch-composer__clear,
.tc-batch-composer__close {
  border: 0;
  background: transparent;
  color: #86868b;
  font: inherit;
  cursor: pointer;
}

.tc-batch-composer__clear {
  padding: 4px 2px;
  font-size: 10px;
}

.tc-batch-composer__close {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  font-size: 17px;
  line-height: 1;
}

.tc-batch-composer__clear:hover,
.tc-batch-composer__close:hover {
  color: #1d1d1f;
}

.tc-batch-composer__close:hover {
  background: #f5f5f7;
}

.tc-batch-composer__textarea {
  display: block;
  width: calc(100% - 36px);
  min-height: 132px;
  margin: 0 18px;
  padding: 12px 13px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid #d2d2d7;
  border-radius: 10px;
  outline: none;
  background: #fff;
  color: #1d1d1f;
  font: 12px/1.65 "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.tc-batch-composer__textarea:hover {
  border-color: #a1a1a6;
}

.tc-batch-composer__textarea:focus {
  border-color: #1d1d1f;
  box-shadow: 0 0 0 1px #1d1d1f;
}

.tc-batch-composer__textarea::placeholder {
  color: #a1a1a6;
}

.tc-batch-composer__helper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 31px;
  padding: 6px 18px 8px;
  color: #86868b;
  font-size: 10px;
}

.tc-batch-composer__helper .is-duplicate {
  color: #b26a00;
}

.tc-batch-composer__run-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 18px 12px;
  padding: 9px 11px;
  border-radius: 8px;
  background: #f7f7f8;
  color: #6e6e73;
  font-size: 10px;
  line-height: 1.45;
}

.tc-batch-composer__run-hint > span {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #1d1d1f;
}

.tc-batch-composer__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding: 13px 18px;
  border-top: 1px solid #ececee;
}

.tc-batch-composer__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-right: auto;
  color: #86868b;
  font-size: 10px;
}

.tc-batch-composer__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c7c7cc;
}

.tc-batch-composer__status.is-ready {
  color: #1d1d1f;
}

.tc-batch-composer__status.is-ready .tc-batch-composer__dot {
  background: #34c759;
}

.tc-batch-composer__cancel,
.tc-batch-composer__run {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 13px;
  border-radius: 8px;
  font: 500 11px/1 "PingFang SC", "Microsoft YaHei", sans-serif;
  cursor: pointer;
}

.tc-batch-composer__cancel {
  border: 1px solid #d2d2d7;
  background: #fff;
  color: #1d1d1f;
}

.tc-batch-composer__run {
  min-width: 78px;
  border: 1px solid #1d1d1f;
  background: #1d1d1f;
  color: #fff;
}

.tc-batch-composer__cancel:hover {
  color: #000;
  border-color: #86868b;
}

.tc-batch-composer__run:hover:not(:disabled) {
  background: #333336;
}

.tc-batch-composer__run:disabled {
  border-color: #e5e5e7;
  background: #f5f5f7;
  color: #a1a1a6;
  cursor: not-allowed;
}

.tc-batch-composer button:focus-visible {
  outline: 2px solid #1d1d1f;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .tc-batch-popover-trigger,
  .tc-batch-composer__textarea {
    transition: none;
  }
}
</style>
