<template>
  <div class="folder-tree">
    <div class="folder-tree-head">
      <span class="display-body-light" style="font-size:11px">方案文件夹</span>
      <el-button class="folder-tree-add" text size="small" @click.stop="startCreate(null)">
        + 新建
      </el-button>
    </div>

    <div
      v-for="folder in folderTree"
      :key="folder.id"
      class="folder-tree-node"
      :class="{ 'drag-over': dragOverFolderId === folder.id }"
      @dragover.prevent="onDragOverFolder($event, folder.id)"
      @dragleave="onDragLeaveFolder"
      @drop.prevent="onDropOnFolder($event, folder.id)"
    >
      <div
        class="folder-tree-row"
        :class="{ active: selectedFolderId === folder.id }"
        @click="selectFolder(folder.id)"
        @contextmenu.prevent="onContextMenu($event, folder)"
      >
        <span
          class="folder-expand-toggle"
          @click.stop="toggleExpand(folder.id)"
        >
          {{ expandedIds.has(folder.id) ? '▾' : '▸' }}
        </span>
        <span class="folder-icon">📂</span>
        <template v-if="editingFolderId === folder.id">
          <el-input
            v-model="editName"
            size="small"
            class="intercom-input"
            style="flex:1;min-width:0"
            @keyup.enter="saveEdit(folder.id)"
            @keyup.esc="cancelEdit"
            @click.stop
            ref="editInputRef"
          />
          <el-button size="small" text @click.stop="saveEdit(folder.id)" style="font-size:11px">确定</el-button>
          <el-button size="small" text @click.stop="cancelEdit" style="font-size:11px">取消</el-button>
        </template>
        <template v-else>
          <span class="folder-name">{{ folder.name }}</span>
        </template>
        <span v-if="dragOverFolderId === folder.id" class="folder-drop-hint">释放到此处</span>
      </div>

      <div v-if="expandedIds.has(folder.id)" class="folder-children">
        <FolderTreeNode
          v-for="child in folder.children || []"
          :key="child.id"
          :folder="child"
          :depth="1"
          :expanded-ids="expandedIds"
          :selected-folder-id="selectedFolderId"
          :drag-over-folder-id="dragOverFolderId"
          :editing-folder-id="editingFolderId"
          :edit-name="editName"
          @toggle-expand="toggleExpand"
          @select-folder="selectFolder"
          @context-menu="onContextMenu"
          @drag-over-folder="onDragOverFolder"
          @drag-leave-folder="onDragLeaveFolder"
          @drop-on-folder="onDropOnFolder"
          @start-edit="startEdit"
          @cancel-edit="cancelEdit"
          @save-edit="saveEdit"
        />
      </div>
    </div>

    <div
      class="folder-tree-row uncategorized"
      :class="{ active: selectedFolderId === '__uncategorized__' }"
      @click="selectFolder('__uncategorized__')"
      @dragover.prevent="onDragOverFolder($event, '__uncategorized__')"
      @dragleave="onDragLeaveFolder"
      @drop.prevent="onDropOnFolder($event, '__uncategorized__')"
    >
      <span class="folder-icon" style="opacity:0.5">📂</span>
      <span class="folder-name" style="color:#999">未分类</span>
    </div>

    <div v-if="creatingParentId !== undefined" class="folder-create-row">
      <el-input
        v-model="createName"
        size="small"
        class="intercom-input"
        placeholder="文件夹名称"
        @keyup.enter="finishCreate"
        @keyup.esc="cancelCreate"
        ref="createInputRef"
      />
      <el-button size="small" text @click="finishCreate">确定</el-button>
      <el-button size="small" text @click="cancelCreate">取消</el-button>
    </div>

    <Teleport to="body">
      <Transition name="scale-in">
        <div
          v-if="contextMenu.visible"
          class="folder-context-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div class="context-menu-item" @click="contextRename">✏️ 重命名</div>
          <div class="context-menu-item" @click="contextNewChild">📂 新建子文件夹</div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item danger" @click="contextDelete">🗑 删除</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import FolderTreeNode from './FolderTreeNode.vue'

const props = defineProps({
  folders: { type: Array, default: () => [] },
})

const emit = defineEmits(['select-folder', 'folders-changed'])

const expandedIds = ref(new Set())
const selectedFolderId = ref(null)
const creatingParentId = ref(undefined)
const createName = ref('')
const createInputRef = ref(null)
const editingFolderId = ref(null)
const editName = ref('')
const dragOverFolderId = ref(null)
const contextMenu = ref({ visible: false, x: 0, y: 0, folder: null })

const folderTree = ref([])

watch(() => props.folders, (val) => {
  folderTree.value = val || []
}, { immediate: true, deep: true })

function toggleExpand(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function selectFolder(id) {
  selectedFolderId.value = id
  emit('select-folder', id)
}

function startCreate(parentId) {
  creatingParentId.value = parentId
  createName.value = ''
  nextTick(() => {
    createInputRef.value?.focus?.()
  })
}

function cancelCreate() {
  creatingParentId.value = undefined
  createName.value = ''
}

function finishCreate() {
  const name = createName.value.trim()
  if (!name) return
  contextMenu.value.visible = false
  cancelCreate()
  emit('folders-changed', { action: 'create', parentId: creatingParentId.value, name })
}

function startEdit(id, currentName) {
  editingFolderId.value = id
  editName.value = currentName
}

function cancelEdit() {
  editingFolderId.value = null
  editName.value = ''
}

function saveEdit(id) {
  const name = editName.value.trim()
  if (!name) return
  editingFolderId.value = null
  editName.value = ''
  contextMenu.value.visible = false
  emit('folders-changed', { action: 'rename', id, name })
}

function onDragOverFolder(event, folderId) {
  dragOverFolderId.value = folderId
}

function onDragLeaveFolder() {
  dragOverFolderId.value = null
}

function onDropOnFolder(event, folderId) {
  dragOverFolderId.value = null
  const srcFolderId = event.dataTransfer?.getData('text/folder-id')
  const srcSolutionId = event.dataTransfer?.getData('text/solution-id')

  if (srcFolderId && srcFolderId !== folderId) {
    emit('folders-changed', { action: 'move-folder', id: srcFolderId, targetParentId: folderId === '__uncategorized__' ? null : folderId })
  }
  if (srcSolutionId) {
    emit('folders-changed', { action: 'move-solution', solutionId: srcSolutionId, targetFolderId: folderId === '__uncategorized__' ? null : folderId })
  }
}

function onContextMenu(event, folder) {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, folder }
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true })
  }, 0)
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function contextRename() {
  if (contextMenu.value.folder) {
    startEdit(contextMenu.value.folder.id, contextMenu.value.folder.name)
  }
}

function contextNewChild() {
  if (contextMenu.value.folder) {
    contextMenu.value.visible = false
    startCreate(contextMenu.value.folder.id)
  }
}

function contextDelete() {
  const folder = contextMenu.value.folder
  if (!folder) return
  contextMenu.value.visible = false
  ElMessageBox.confirm(
    `删除「${folder.name}」后其中的方案将归入"未分类"，子文件夹也会一并删除。是否继续？`,
    '删除文件夹',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    emit('folders-changed', { action: 'delete', id: folder.id })
  }).catch(() => {})
}

defineExpose({ selectedFolderId, selectFolder })
</script>

<style scoped>
.folder-tree {
  padding: 8px 0;
  font-size: 12px;
  user-select: none;
}
.folder-tree-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px 6px;
}
.folder-tree-add.el-button {
  font-size: 11px !important;
  color: #ff6b4a !important;
  height: auto !important;
  padding: 0 !important;
}
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
.folder-tree-row.uncategorized {
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 7px;
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
.folder-create-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  margin-top: 4px;
}
.folder-create-row .el-input {
  flex: 1;
}
.folder-context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e0dcd6;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  min-width: 150px;
}
.context-menu-item {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}
.context-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}
.context-menu-item.danger {
  color: #d94e32;
}
.context-menu-item.danger:hover {
  background: rgba(217, 78, 50, 0.06);
}
.context-menu-divider {
  height: 1px;
  background: #eee;
  margin: 4px 0;
}
</style>
