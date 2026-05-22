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
      draggable="true"
      @dragstart="onDragStart($event, folder)"
      @click="$emit('select-folder', folder.id)"
      @contextmenu.prevent="$emit('context-menu', $event, folder)"
    >
      <span
        class="folder-expand-toggle"
        v-if="(folder.children && folder.children.length > 0)"
        @click.stop="$emit('toggle-expand', folder.id)"
      >
        {{ expandedIds.has(folder.id) ? '▾' : '▸' }}
      </span>
      <span v-else class="folder-expand-toggle" style="visibility:hidden">▸</span>
      <span class="folder-icon">📂</span>

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
        @toggle-expand="(id) => $emit('toggle-expand', id)"
        @select-folder="(id) => $emit('select-folder', id)"
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

const props = defineProps({
  folder: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  expandedIds: { type: Set, default: () => new Set() },
  selectedFolderId: { type: String, default: null },
  dragOverFolderId: { type: String, default: null },
  editingFolderId: { type: String, default: null },
  editName: { type: String, default: '' },
})

const emit = defineEmits([
  'toggle-expand', 'select-folder', 'context-menu',
  'drag-over-folder', 'drag-leave-folder', 'drop-on-folder',
  'start-edit', 'cancel-edit', 'save-edit',
])

const localEditName = ref(props.editName)
const editInputRef = ref(null)

watch(() => props.editName, (val) => { localEditName.value = val })
watch(() => props.editingFolderId, (val) => {
  if (val === props.folder.id) {
    localEditName.value = props.editName
  }
})

function onDragStart(event, folder) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/folder-id', folder.id)
}
</script>

<style scoped>
.folder-tree-node.drag-over {
  background: rgba(255, 107, 74, 0.08);
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
.folder-tree-row:hover {
  background: rgba(0, 0, 0, 0.04);
}
.folder-tree-row.active {
  background: rgba(255, 107, 74, 0.08);
  color: #ff6b4a;
}
.folder-expand-toggle {
  width: 14px;
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
  text-align: center;
}
.folder-icon {
  flex-shrink: 0;
  font-size: 13px;
}
.folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-drop-hint {
  font-size: 10px;
  color: #ff6b4a;
  flex-shrink: 0;
}
.folder-children {
  margin-left: 14px;
}
</style>
