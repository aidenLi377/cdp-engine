<template>
  <div class="folder-tree-node">
    <div
      class="folder-tree-row"
      :class="{
        active: selectedFolderId === folder.id,
        'drag-over': dragOverFolderId === folder.id,
      }"
      role="treeitem"
      tabindex="0"
      :aria-level="depth + 1"
      :aria-expanded="hasChildren ? expandedIds.has(folder.id) : undefined"
      :draggable="!readOnly"
      @dragstart="onDragStart($event, folder)"
      @click="activateFolder"
      @keydown.enter.prevent="activateFolder"
      @keydown.space.prevent="activateFolder"
      @contextmenu.prevent="!readOnly && $emit('context-menu', $event, folder)"
      @dragenter.stop.prevent="$emit('drag-enter-folder', $event, folder.id)"
      @dragover.stop.prevent="$emit('drag-over-folder', $event, folder.id)"
      @dragleave.stop="$emit('drag-leave-folder', $event, folder.id)"
      @drop.stop.prevent="$emit('drop-on-folder', $event, folder.id)"
    >
      <span
        class="folder-expand-toggle"
        v-if="hasChildren"
        aria-hidden="true"
        @click.stop="$emit('toggle-expand', folder.id)"
      >
        {{ expandedIds.has(folder.id) ? '▾' : '▸' }}
      </span>
      <span v-else class="folder-expand-toggle" style="visibility:hidden" aria-hidden="true">▸</span>
      <el-icon class="folder-icon"><FolderIcon /></el-icon>

      <template v-if="editingFolderId === folder.id">
        <el-input
          :model-value="editName"
          size="small"
          class="intercom-input folder-inline-edit-input"
          @update:model-value="$emit('update-edit-name', $event)"
          @keyup.enter="$emit('save-edit', folder.id)"
          @keyup.esc="$emit('cancel-edit')"
          @click.stop
          ref="editInputRef"
        />
        <span class="folder-edit-actions">
          <button
            type="button"
            class="folder-edit-action is-confirm"
            title="确认重命名"
            aria-label="确认重命名"
            @click.stop="$emit('save-edit', folder.id)"
          ><el-icon><Check /></el-icon></button>
          <button
            type="button"
            class="folder-edit-action"
            title="取消重命名"
            aria-label="取消重命名"
            @click.stop="$emit('cancel-edit')"
          ><el-icon><Close /></el-icon></button>
        </span>
      </template>
      <template v-else>
        <span class="folder-name">{{ folder.name }}</span>
      </template>
      <button
        v-if="shareEnabled && editingFolderId !== folder.id"
        type="button"
        class="folder-share-action"
        aria-label="分享方案文件夹"
        :title="`分享「${folder.name}」`"
        @click.stop="$emit('share-folder', folder)"
      >
        <el-icon><Share /></el-icon>
      </button>
      <button
        v-if="showBatchBadges && editingFolderId !== folder.id && getBatchCount(folder.id) >= 2"
        type="button"
        class="folder-batch-badge"
        :data-tutorial-target="String(folder.id) === String(tutorialBatchFolderId || '') ? 'pull-open-group' : undefined"
        :title="`组合应用：${getBatchCount(folder.id)} 个已发布方案`"
        :aria-label="`${folder.name}可组合应用 ${getBatchCount(folder.id)} 个方案`"
        @click.stop="$emit('batch-apply', folder.id)"
      >
        <span aria-hidden="true">✦</span>
        {{ getBatchCount(folder.id) }}
      </button>

      <span
        v-if="dragOverFolderId === folder.id"
        class="folder-drop-hint"
        :title="`移动到 ${dropTargetPath}`"
      >移动到 {{ dropTargetPath }}</span>
    </div>

    <Transition name="folder-children">
      <div v-if="expandedIds.has(folder.id) && hasChildren" class="folder-children" role="group">
        <FolderTreeNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :depth="depth + 1"
        :folder-path="[...folderPath, child.name]"
        :expanded-ids="expandedIds"
        :selected-folder-id="selectedFolderId"
        :drag-over-folder-id="dragOverFolderId"
        :editing-folder-id="editingFolderId"
        :edit-name="editName"
        :read-only="readOnly"
        :batch-counts="batchCounts"
        :show-batch-badges="showBatchBadges"
        :share-enabled="shareEnabled"
        :tutorial-batch-folder-id="tutorialBatchFolderId"
        @toggle-expand="(id) => $emit('toggle-expand', id)"
        @select-folder="(id) => $emit('select-folder', id)"
        @batch-apply="(id) => $emit('batch-apply', id)"
        @share-folder="(item) => $emit('share-folder', item)"
        @context-menu="(ev, f) => $emit('context-menu', ev, f)"
        @drag-enter-folder="(ev, id) => $emit('drag-enter-folder', ev, id)"
        @drag-over-folder="(ev, id) => $emit('drag-over-folder', ev, id)"
        @drag-leave-folder="(ev, id) => $emit('drag-leave-folder', ev, id)"
        @drop-on-folder="(ev, id) => $emit('drop-on-folder', ev, id)"
        @start-edit="(id, name) => $emit('start-edit', id, name)"
        @update-edit-name="(value) => $emit('update-edit-name', value)"
        @cancel-edit="$emit('cancel-edit')"
        @save-edit="(id) => $emit('save-edit', id)"
      />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Folder as FolderIcon } from '@element-plus/icons-vue'
import { Check, Close, Share } from '@element-plus/icons-vue'

const props = defineProps({
  folder: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  folderPath: { type: Array, default: () => [] },
  expandedIds: { type: Set, default: () => new Set() },
  selectedFolderId: { type: String, default: null },
  dragOverFolderId: { type: String, default: null },
  editingFolderId: { type: String, default: null },
  editName: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
  batchCounts: { type: Object, default: () => ({}) },
  showBatchBadges: { type: Boolean, default: false },
  shareEnabled: { type: Boolean, default: false },
  tutorialBatchFolderId: { type: String, default: '' },
})

const emit = defineEmits([
  'toggle-expand', 'select-folder', 'context-menu',
  'drag-enter-folder', 'drag-over-folder', 'drag-leave-folder', 'drop-on-folder',
  'start-edit', 'cancel-edit', 'save-edit',
  'update-edit-name',
  'batch-apply',
  'share-folder',
])

const editInputRef = ref(null)
const hasChildren = computed(() => Array.isArray(props.folder?.children) && props.folder.children.length > 0)
const dropTargetPath = computed(() => (
  props.folderPath.length ? props.folderPath.join(' / ') : String(props.folder?.name || '')
))

watch(() => props.editingFolderId, (val) => {
  if (val === props.folder.id) {
    nextTick(() => {
      editInputRef.value?.focus?.()
      editInputRef.value?.select?.()
    })
  }
})

function getBatchCount(folderId) {
  return Number(props.batchCounts?.[folderId] || 0)
}

function activateFolder() {
  emit('select-folder', props.folder.id)
  if (hasChildren.value) emit('toggle-expand', props.folder.id)
}

function onDragStart(event, folder) {
  if (props.readOnly) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/folder-id', folder.id)
}
</script>

<style scoped>
.folder-tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.folder-tree-row:focus-visible {
  outline: 2px solid var(--ui-accent-ring);
  outline-offset: 1px;
}
.folder-tree-row:hover:not(.active) {
  background: var(--ui-fill);
}
.folder-tree-row.active {
  background: var(--ui-surface);
  color: var(--ui-accent);
  box-shadow: inset 2px 0 0 var(--ui-accent);
}
.folder-tree-row.drag-over {
  color: var(--ui-accent);
  background: #fff6f1;
  box-shadow: inset 3px 0 0 var(--ui-accent), inset 0 0 0 1px #ffb18f;
}
.folder-expand-toggle {
  width: 14px;
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
  text-align: center;
}
.folder-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-ink);
  font-size: 14px;
}
.folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-inline-edit-input {
  min-width: 0;
  flex: 1;
}
.folder-inline-edit-input :deep(.el-input__wrapper) {
  min-height: 28px !important;
  padding: 0 8px !important;
  border-radius: 7px;
}
.folder-inline-edit-input :deep(.el-input__inner) {
  height: 26px !important;
  font-size: 12px;
}
.folder-edit-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
}
.folder-edit-action {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--ui-text-secondary);
  background: #fff;
  border: 1px solid var(--ui-control-border);
  border-radius: 7px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.folder-edit-action:hover {
  color: var(--ui-ink);
  border-color: var(--ui-ink);
}
.folder-edit-action.is-confirm {
  color: #fff;
  background: var(--ui-ink);
  border-color: var(--ui-ink);
}
.folder-edit-action:focus-visible {
  outline: 2px solid var(--ui-accent-ring);
  outline-offset: 1px;
}
.folder-batch-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 36px;
  height: 20px;
  padding: 0 7px;
  flex: 0 0 auto;
  color: var(--ui-ink);
  font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  border: 1px solid var(--ui-control-border);
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease, transform 150ms ease;
}
.folder-share-action {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--ui-ink-soft, #6e6e73);
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transform: translateX(3px);
  transition: opacity 150ms ease, transform 150ms ease, color 150ms ease, background 150ms ease;
}
.folder-tree-row:hover .folder-share-action,
.folder-tree-row:focus-within .folder-share-action,
.folder-share-action:focus-visible {
  opacity: 1;
  transform: translateX(0);
}
.folder-share-action:hover {
  color: #fff;
  background: #1d1d1f;
}
.folder-share-action:focus-visible {
  outline: 2px solid var(--ui-accent-ring);
  outline-offset: 1px;
}
.folder-batch-badge:hover {
  color: #fff;
  border-color: #1d1d1f;
  background: #1d1d1f;
  transform: translateY(-1px);
}
.folder-batch-badge:focus-visible {
  outline: 2px solid var(--ui-accent-ring);
  outline-offset: 2px;
}
.folder-drop-hint {
  max-width: 150px;
  padding: 2px 6px;
  font-size: 10px;
  line-height: 1.35;
  color: var(--ui-accent) !important;
  background: #fff;
  border: 1px solid #ffc4aa;
  border-radius: 999px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-children {
  margin-left: 14px;
}
</style>
