<template>
  <div
    class="folder-tree-node"
    :class="{ 'drag-over': dragOverFolderId === folder.id }"
    @dragover.prevent="$emit('drag-over-folder', $event, folder.id)"
    @dragleave="$emit('drag-leave-folder')"
    @drop.prevent="$emit('drop-on-folder', $event, folder.id)"
  >
    <div
      class="folder-tree-row"
      :class="{ active: selectedFolderId === folder.id }"
      :draggable="!readOnly"
      @dragstart="onDragStart($event, folder)"
      @click="$emit('select-folder', folder.id)"
      @contextmenu.prevent="!readOnly && $emit('context-menu', $event, folder)"
    >
      <span
        class="folder-expand-toggle"
        v-if="(folder.children && folder.children.length > 0)"
        @click.stop="$emit('toggle-expand', folder.id)"
      >
        {{ expandedIds.has(folder.id) ? '▾' : '▸' }}
      </span>
      <span v-else class="folder-expand-toggle" style="visibility:hidden">▸</span>
      <el-icon class="folder-icon"><FolderIcon /></el-icon>

      <template v-if="editingFolderId === folder.id">
        <el-input
          v-model="localEditName"
          size="small"
          class="intercom-input"
          style="flex:1;min-width:0"
          @keyup.enter="$emit('save-edit', folder.id)"
          @keyup.esc="$emit('cancel-edit')"
          @click.stop
          ref="editInputRef"
        />
        <el-button size="small" text @click.stop="$emit('save-edit', folder.id)" style="font-size:11px">确定</el-button>
        <el-button size="small" text @click.stop="$emit('cancel-edit')" style="font-size:11px">取消</el-button>
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
        :title="`组合应用：${getBatchCount(folder.id)} 个已发布方案`"
        :aria-label="`${folder.name}可组合应用 ${getBatchCount(folder.id)} 个方案`"
        @click.stop="$emit('batch-apply', folder.id)"
      >
        <span aria-hidden="true">✦</span>
        {{ getBatchCount(folder.id) }}
      </button>

      <span v-if="dragOverFolderId === folder.id" class="folder-drop-hint">释放到此处</span>
    </div>

    <Transition name="folder-children">
      <div v-if="expandedIds.has(folder.id) && (folder.children && folder.children.length > 0)" class="folder-children">
        <FolderTreeNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :depth="depth + 1"
        :expanded-ids="expandedIds"
        :selected-folder-id="selectedFolderId"
        :drag-over-folder-id="dragOverFolderId"
        :editing-folder-id="editingFolderId"
        :edit-name="editName"
        :read-only="readOnly"
        :batch-counts="batchCounts"
        :show-batch-badges="showBatchBadges"
        :share-enabled="shareEnabled"
        @toggle-expand="(id) => $emit('toggle-expand', id)"
        @select-folder="(id) => $emit('select-folder', id)"
        @batch-apply="(id) => $emit('batch-apply', id)"
        @share-folder="(item) => $emit('share-folder', item)"
        @context-menu="(ev, f) => $emit('context-menu', ev, f)"
        @drag-over-folder="(ev, id) => $emit('drag-over-folder', ev, id)"
        @drag-leave-folder="$emit('drag-leave-folder')"
        @drop-on-folder="(ev, id) => $emit('drop-on-folder', ev, id)"
        @start-edit="(id, name) => $emit('start-edit', id, name)"
        @cancel-edit="$emit('cancel-edit')"
        @save-edit="(id) => $emit('save-edit', id)"
      />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Folder as FolderIcon } from '@element-plus/icons-vue'
import { Share } from '@element-plus/icons-vue'

const props = defineProps({
  folder: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  expandedIds: { type: Set, default: () => new Set() },
  selectedFolderId: { type: String, default: null },
  dragOverFolderId: { type: String, default: null },
  editingFolderId: { type: String, default: null },
  editName: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
  batchCounts: { type: Object, default: () => ({}) },
  showBatchBadges: { type: Boolean, default: false },
  shareEnabled: { type: Boolean, default: false },
})

const emit = defineEmits([
  'toggle-expand', 'select-folder', 'context-menu',
  'drag-over-folder', 'drag-leave-folder', 'drop-on-folder',
  'start-edit', 'cancel-edit', 'save-edit',
  'batch-apply',
  'share-folder',
])

const localEditName = ref(props.editName)
const editInputRef = ref(null)

watch(() => props.editName, (val) => { localEditName.value = val })
watch(() => props.editingFolderId, (val) => {
  if (val === props.folder.id) {
    localEditName.value = props.editName
  }
})

function getBatchCount(folderId) {
  return Number(props.batchCounts?.[folderId] || 0)
}

function onDragStart(event, folder) {
  if (props.readOnly) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/folder-id', folder.id)
}
</script>

<style scoped>
.folder-tree-node.drag-over {
  background: var(--ui-fill);
  outline: 1px solid var(--ui-accent);
  border-radius: 4px;
}
.folder-tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.folder-tree-row:hover:not(.active) {
  background: var(--ui-fill);
}
.folder-tree-row.active {
  background: var(--ui-surface);
  color: var(--ui-accent);
  box-shadow: inset 2px 0 0 var(--ui-accent);
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
  font-size: 10px;
  color: var(--ui-accent) !important;
  flex-shrink: 0;
}
.folder-children {
  margin-left: 14px;
}
</style>
