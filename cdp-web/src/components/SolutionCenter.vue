<template>
  <div class="solution-center-page">
    <aside class="solution-sidebar">
      <div class="solution-sidebar-head">
        <div>
          <div class="display-feature-title">方案中心</div>
          <div class="display-body-light">草稿编辑、发布与工作台预览</div>
        </div>
        <el-button class="intercom-btn-primary btn-small" @click="createBlankDraft" :loading="creatingDraft">
          新建草稿
        </el-button>
      </div>

      <div class="solution-sidebar-controls">
        <el-radio-group v-model="statusFilter" size="small" class="intercom-radio-group solution-filter-group">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="draft">草稿</el-radio-button>
          <el-radio-button label="published">已发布</el-radio-button>
        </el-radio-group>

        <el-input
          v-model="searchKeyword"
          clearable
          placeholder="搜索方案名称..."
          class="intercom-input"
        />

        <div class="solution-sidebar-actions">
          <el-button class="intercom-btn-outlined btn-small" @click="loadSolutions" :loading="loadingList">
            刷新列表
          </el-button>
          <el-button
            class="intercom-btn-outlined btn-small"
            @click="duplicateActiveSolution"
            :disabled="!activeSolution"
          >
            复制方案
          </el-button>
        </div>
      </div>

      <div class="solution-list">
        <button
          v-for="item in filteredSolutions"
          :key="item.id"
          type="button"
          class="solution-list-item"
          :class="{ active: item.id === activeSolution?.id }"
          @click="openSolution(item.id)"
        >
          <div class="solution-list-item-head">
            <span class="solution-status-chip" :class="item.status">{{ statusText(item.status) }}</span>
            <span class="display-mono">{{ item.source === 'published-edit' ? 'published-edit' : item.source || 'manual' }}</span>
          </div>
          <div class="display-body strong solution-list-name">{{ item.name || '未命名方案' }}</div>
          <div class="solution-list-meta">
            <span>{{ item.nodes?.length || 0 }} 个节点</span>
            <span>{{ formatTime(item.updatedAt) }}</span>
          </div>
        </button>

        <div v-if="!loadingList && filteredSolutions.length === 0" class="empty-state-sm display-body-light">
          当前筛选下没有方案
        </div>
      </div>

      <div v-if="activeSolution" class="solution-sidebar-footer">
        <div class="display-body-light">当前选中</div>
        <div class="display-body strong">{{ activeSolution.name || '未命名方案' }}</div>
        <div v-if="hasUnsavedChanges && !isPublished" class="solution-dirty-indicator">
          <span class="solution-dirty-dot"></span>
          <span class="display-body-light">有未保存修改</span>
        </div>
        <div class="solution-sidebar-actions">
          <el-button
            class="intercom-btn-outlined btn-small"
            @click="deleteActiveSolution"
            :disabled="deleting"
          >
            删除
          </el-button>
          <el-button
            v-if="isPublished"
            class="intercom-btn-accent btn-small"
            @click="createEditDraftFromPublished"
            :loading="creatingEditDraft"
          >
            生成编辑草稿
          </el-button>
        </div>
      </div>
    </aside>

    <section class="solution-editor">
      <div v-if="activeSolution" class="panel-toolbar solution-editor-toolbar">
        <div>
          <div class="display-feature-title">{{ activeSolution.name || '未命名方案' }}</div>
          <div class="display-body-light">
            {{ isPublished ? '正式方案只读中，点击“生成编辑草稿”后再修改。' : '当前为草稿，可直接调整节点结构与字段。' }}
          </div>
        </div>

        <div class="solution-toolbar-actions">
          <el-select
            v-model="pendingPackageType"
            filterable
            clearable
            placeholder="添加组件..."
            class="intercom-input solution-package-select"
            :disabled="isPublished"
          >
            <el-option v-for="pkg in availablePackages" :key="pkg" :label="pkg" :value="pkg" />
          </el-select>
          <el-button
            class="intercom-btn-outlined"
            @click="addNodeFromSelector"
            :disabled="!pendingPackageType || isPublished"
            :loading="addingNode"
          >
            添加节点
          </el-button>
          <el-button class="intercom-btn-outlined" @click="previewVisible = true">
            预览工作台使用态
          </el-button>
          <el-button
            v-if="!isPublished"
            class="intercom-btn-primary"
            @click="saveDraft"
            :loading="saving"
          >
            保存草稿
          </el-button>
          <el-button
            v-if="!isPublished"
            class="intercom-btn-accent"
            @click="publishDraft"
            :loading="publishing"
          >
            发布正式方案
          </el-button>
        </div>
      </div>

      <div v-if="!activeSolution" class="solution-empty-state">
        <div class="display-section">方案从这里开始</div>
        <div class="display-body-light">左侧选择现有方案，或先创建一个新的方案草稿。</div>
      </div>

      <div v-else-if="nodeList.length === 0" class="solution-empty-state">
        <div class="display-sub">当前方案还没有节点</div>
        <div class="display-body-light">从上方选择组件后添加节点，搭建这个方案的结构。</div>
      </div>

      <div v-else class="solution-node-scroll">
        <div
          v-for="(node, index) in nodeList"
          :key="node.id"
          class="node-wrapper solution-node-wrapper"
        >
          <div v-if="index > 0" class="logic-connector">
            <div class="connector-line"></div>
            <el-radio-group
              v-model="node.operator"
              size="small"
              class="intercom-radio-group"
              :disabled="isPublished"
            >
              <el-radio-button label="n">交集 (n)</el-radio-button>
              <el-radio-button label="u">并集 (u)</el-radio-button>
              <el-radio-button label="d">差集 (d)</el-radio-button>
            </el-radio-group>
            <div class="connector-line"></div>
          </div>

          <div class="intercom-card behavior-card" :class="{ collapsed: node.collapsed }">
            <div class="card-header-inner">
              <span class="card-title-flex">
                <button
                  type="button"
                  class="solution-collapse-btn"
                  @click="node.collapsed = !node.collapsed"
                >
                  {{ node.collapsed ? '▸' : '▾' }}
                </button>
                <span class="display-card-title solution-node-title">{{ node.packageType }}</span>
                <span class="display-mono badge-mono">节点 {{ index + 1 }}</span>
              </span>

              <div class="solution-node-actions">
                <el-button
                  class="intercom-btn-outlined btn-small"
                  @click="duplicateNode(index)"
                  :disabled="isPublished"
                >
                  复制
                </el-button>
                <el-button
                  class="intercom-btn-outlined btn-small"
                  @click="removeNode(index)"
                  :disabled="isPublished"
                >
                  移除
                </el-button>
              </div>
            </div>

            <div v-show="!node.collapsed" class="solution-node-form" :class="{ 'solution-readonly-surface': isPublished }">
              <DynamicForm :node="node" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <aside class="solution-settings">
      <div v-if="activeSolution" class="solution-settings-scroll">
        <div class="panel-name-area solution-settings-card">
          <div class="display-body-light name-label-inline">方案名称</div>
          <el-input
            v-model="activeSolution.name"
            class="intercom-input"
            placeholder="请输入方案名称"
            :disabled="isPublished"
          />
        </div>

        <div class="panel-name-area solution-settings-card">
          <div class="display-body-light name-label-inline">默认人群包名称</div>
          <el-input
            v-model="activeSolution.defaultCrowdName"
            class="intercom-input"
            placeholder="工作台加载方案时的默认名称"
            :disabled="isPublished"
          />
        </div>

        <div class="intercom-card solution-settings-card solution-meta-card">
          <div class="display-feature-title mb-16">状态信息</div>
          <div class="solution-meta-grid">
            <div class="solution-meta-row">
              <span class="display-body-light">状态</span>
              <span class="display-body strong">{{ statusText(activeSolution.status) }}</span>
            </div>
            <div class="solution-meta-row">
              <span class="display-body-light">来源</span>
              <span class="display-body strong">{{ activeSolution.source || 'manual' }}</span>
            </div>
            <div class="solution-meta-row">
              <span class="display-body-light">创建时间</span>
              <span class="display-body strong">{{ formatTime(activeSolution.createdAt) }}</span>
            </div>
            <div class="solution-meta-row">
              <span class="display-body-light">更新时间</span>
              <span class="display-body strong">{{ formatTime(activeSolution.updatedAt) }}</span>
            </div>
            <div v-if="activeSolution.publishedAt" class="solution-meta-row">
              <span class="display-body-light">发布时间</span>
              <span class="display-body strong">{{ formatTime(activeSolution.publishedAt) }}</span>
            </div>
            <div v-if="activeSolution.basePublishedId" class="solution-meta-row">
              <span class="display-body-light">覆盖正式版</span>
              <span class="display-mono">{{ activeSolution.basePublishedId }}</span>
            </div>
          </div>
        </div>

        <div class="intercom-card solution-settings-card">
          <div class="solution-settings-head">
            <div>
              <div class="display-feature-title">工作台字段</div>
              <div class="display-body-light">勾选后会进入工作台方案使用态与预览抽屉</div>
            </div>
            <span class="display-mono">{{ workbenchFieldIds.length }} 个字段</span>
          </div>

          <div v-if="fieldGroups.length === 0" class="empty-state-sm display-body-light">
            当前没有可供工作台使用的字段
          </div>

          <div v-else class="solution-field-groups">
            <div v-for="group in fieldGroups" :key="group.nodeId" class="solution-field-group">
              <div class="solution-field-group-head">
                <div class="display-body strong">节点 {{ group.index + 1 }}</div>
                <div class="display-body-light">{{ group.packageType }}</div>
              </div>

              <el-checkbox-group v-model="workbenchFieldIds" class="custom-checkbox-group solution-checkbox-group">
                <el-checkbox
                  v-for="field in group.fields"
                  :key="field.token"
                  :label="field.token"
                  :disabled="isPublished"
                >
                  {{ field.label }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="solution-empty-settings">
        <div class="display-sub">右侧设置区</div>
        <div class="display-body-light">选择方案后，可以在这里管理名称、工作台字段和发布信息。</div>
      </div>
    </aside>

    <SolutionPreviewDrawer
      v-model="previewVisible"
      :sections="previewSections"
      :solution-name="activeSolution?.name || ''"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DynamicForm from './DynamicForm.vue'
import SolutionPreviewDrawer from './SolutionPreviewDrawer.vue'
import { useSolutionsApi } from '../composables/useSolutionsApi'
import { useCdpShared } from '../composables/useCdpShared'
import { useSolutionRuntime } from '../composables/useSolutionRuntime'
import { fieldToken, serializeNodesForSolution } from '../utils/solutionState.js'

const {
  listSolutions,
  getSolution,
  createDraft,
  updateDraft,
  publishSolution,
  createEditDraft,
  duplicateSolution,
  deleteSolution,
} = useSolutionsApi()

const { isVisible } = useCdpShared()
const {
  cloneValue,
  createRuntimeNode,
  hydrateNodes,
  normalizeWorkbenchFieldIds,
  buildRuntimeUsageSections,
} = useSolutionRuntime()

const solutions = ref([])
const activeSolution = ref(null)
const nodeList = ref([])
const workbenchFieldIds = ref([])
const previewVisible = ref(false)
const searchKeyword = ref('')
const statusFilter = ref('all')
const loadingList = ref(false)
const loadingDetail = ref(false)
const creatingDraft = ref(false)
const creatingEditDraft = ref(false)
const saving = ref(false)
const publishing = ref(false)
const deleting = ref(false)
const availablePackages = ref([])
const pendingPackageType = ref('')
const addingNode = ref(false)
const lastSavedSnapshot = ref(null)

const isPublished = computed(() => activeSolution.value?.status === 'published')

const filteredSolutions = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return solutions.value
  return solutions.value.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const source = String(item?.source || '').toLowerCase()
    return name.includes(keyword) || source.includes(keyword)
  })
})

const fieldGroups = computed(() =>
  nodeList.value
    .map((node, index) => {
      const fields = (Array.isArray(node.schema) ? node.schema : [])
        .filter((field) => isVisible(field, node))
        .map((field) => ({
          token: fieldToken(node.id, field.key),
          label: field.Label || field.label || field.key,
        }))

      return {
        nodeId: node.id,
        index,
        packageType: node.packageType,
        fields,
      }
    })
    .filter((group) => group.fields.length > 0),
)

const previewSections = computed(() =>
  buildRuntimeUsageSections(nodeList.value, workbenchFieldIds.value),
)

const currentDraftSnapshot = computed(() => {
  if (!activeSolution.value || isPublished.value) return null
  const name = String(activeSolution.value?.name || '').trim() || '未命名方案'
  const defaultCrowdName =
    String(activeSolution.value?.defaultCrowdName || '').trim() || name

  return JSON.stringify({
    name,
    defaultCrowdName,
    nodes: serializeNodesForSolution(nodeList.value),
    workbenchFieldIds: [...workbenchFieldIds.value],
  })
})

const hasUnsavedChanges = computed(() => {
  if (!currentDraftSnapshot.value || !lastSavedSnapshot.value) return false
  return currentDraftSnapshot.value !== lastSavedSnapshot.value
})

function arrayEquals(left, right) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

function statusText(status) {
  if (status === 'draft') return '草稿'
  if (status === 'published') return '已发布'
  return status || '未知'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function setSavedSnapshotFromRecord(record) {
  if (!record || record.status !== 'draft') {
    lastSavedSnapshot.value = null
    return
  }

  const name = String(record?.name || '').trim() || '未命名方案'
  const defaultCrowdName =
    String(record?.defaultCrowdName || '').trim() || name
  const fieldIds = Array.isArray(record?.workbenchFieldIds) ? record.workbenchFieldIds : []

  lastSavedSnapshot.value = JSON.stringify({
    name,
    defaultCrowdName,
    nodes: record?.nodes || [],
    workbenchFieldIds: [...fieldIds],
  })
}

async function confirmDiscardDraftChanges() {
  if (!hasUnsavedChanges.value) return true

  try {
    await ElMessageBox.confirm(
      '当前草稿有未保存修改，继续后这些修改会丢失。是否继续？',
      '放弃未保存修改',
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    return true
  } catch {
    return false
  }
}

function syncWorkbenchSelections(nextIds) {
  const cleaned = normalizeWorkbenchFieldIds(nextIds, nodeList.value)
  if (!arrayEquals(cleaned, workbenchFieldIds.value)) {
    workbenchFieldIds.value = cleaned
  }
}

function buildSolutionPayload() {
  const name = String(activeSolution.value?.name || '').trim() || '未命名方案'
  const defaultCrowdName =
    String(activeSolution.value?.defaultCrowdName || '').trim() || name

  return {
    name,
    defaultCrowdName,
    nodes: serializeNodesForSolution(nodeList.value),
    workbenchFieldIds: [...workbenchFieldIds.value],
  }
}

async function applySolutionRecord(record) {
  activeSolution.value = cloneValue(record)
  nodeList.value = await hydrateNodes(record?.nodes || [])
  syncWorkbenchSelections(Array.isArray(record?.workbenchFieldIds) ? record.workbenchFieldIds : [])
  setSavedSnapshotFromRecord(record)
}

async function replaceActiveSolutionState(loader) {
  const shouldContinue = await confirmDiscardDraftChanges()
  if (!shouldContinue) return false
  await loader()
  return true
}

async function loadSolutions() {
  loadingList.value = true
  try {
    solutions.value = await listSolutions(statusFilter.value)
  } catch (error) {
    ElMessage.error(error.message || '方案列表加载失败')
  } finally {
    loadingList.value = false
  }
}

async function loadAvailablePackages() {
  try {
    const response = await fetch('/api/packages')
    if (!response.ok) throw new Error('组件列表加载失败')
    availablePackages.value = await response.json()
  } catch (error) {
    ElMessage.error(error.message || '组件列表加载失败')
  }
}

async function openSolution(solutionId) {
  const switched = await replaceActiveSolutionState(async () => {
    loadingDetail.value = true
    try {
      const detail = await getSolution(solutionId)
      await applySolutionRecord(detail)
    } catch (error) {
      ElMessage.error(error.message || '方案详情加载失败')
    } finally {
      loadingDetail.value = false
    }
  })

  if (!switched && !loadingDetail.value) return
}

async function createBlankDraft() {
  const proceeded = await replaceActiveSolutionState(async () => {
    creatingDraft.value = true
    try {
      const created = await createDraft({
        name: `未命名方案 ${new Date().toLocaleDateString('zh-CN')}`,
        defaultCrowdName: '未命名人群包',
        nodes: [],
        workbenchFieldIds: [],
      })
      if (statusFilter.value === 'published') {
        statusFilter.value = 'all'
      }
      await loadSolutions()
      await applySolutionRecord(created)
      ElMessage.success('已创建新草稿')
    } catch (error) {
      ElMessage.error(error.message || '创建草稿失败')
    } finally {
      creatingDraft.value = false
    }
  })

  if (!proceeded && !creatingDraft.value) return
}

async function addNode(packageType) {
  addingNode.value = true
  try {
    const node = await createRuntimeNode({ packageType }, nodeList.value.length)
    nodeList.value.push(node)
  } catch (error) {
    ElMessage.error(error.message || '节点添加失败')
  } finally {
    addingNode.value = false
  }
}

async function addNodeFromSelector() {
  if (!pendingPackageType.value || isPublished.value) return
  await addNode(pendingPackageType.value)
  pendingPackageType.value = ''
}

function duplicateNode(index) {
  if (isPublished.value) return
  const source = nodeList.value[index]
  if (!source) return

  const duplicated = {
    ...cloneValue(source),
    id: `node_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    operator: index === 0 ? 'n' : source.operator,
    collapsed: false,
    selectedFirstDate: null,
  }

  nodeList.value.splice(index + 1, 0, duplicated)
  nodeList.value.forEach((node, nodeIndex) => {
    if (nodeIndex === 0) node.operator = null
  })
}

function removeNode(index) {
  if (isPublished.value) return
  nodeList.value.splice(index, 1)
  nodeList.value.forEach((node, nodeIndex) => {
    if (nodeIndex === 0) node.operator = null
  })
}

async function saveDraft() {
  if (!activeSolution.value || isPublished.value) return
  saving.value = true
  try {
    const updated = await updateDraft(activeSolution.value.id, buildSolutionPayload())
    await loadSolutions()
    await applySolutionRecord(updated)
    ElMessage.success('草稿已保存')
  } catch (error) {
    ElMessage.error(error.message || '草稿保存失败')
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (!activeSolution.value || isPublished.value) return
  publishing.value = true
  try {
    const saved = await updateDraft(activeSolution.value.id, buildSolutionPayload())
    const published = await publishSolution(activeSolution.value.id)
    if (statusFilter.value === 'draft') {
      statusFilter.value = 'all'
    }
    await loadSolutions()
    await applySolutionRecord(published)
    setSavedSnapshotFromRecord(saved)
    ElMessage.success('方案已发布')
  } catch (error) {
    ElMessage.error(error.message || '方案发布失败')
  } finally {
    publishing.value = false
  }
}

async function createEditDraftFromPublished() {
  if (!activeSolution.value || !isPublished.value) return

  const proceeded = await replaceActiveSolutionState(async () => {
    creatingEditDraft.value = true
    try {
      const draft = await createEditDraft(activeSolution.value.id)
      if (statusFilter.value === 'published') {
        statusFilter.value = 'all'
      }
      await loadSolutions()
      await applySolutionRecord(draft)
      ElMessage.success('已生成编辑草稿')
    } catch (error) {
      ElMessage.error(error.message || '编辑草稿生成失败')
    } finally {
      creatingEditDraft.value = false
    }
  })

  if (!proceeded && !creatingEditDraft.value) return
}

async function duplicateActiveSolution() {
  if (!activeSolution.value) return

  const proceeded = await replaceActiveSolutionState(async () => {
    try {
      const duplicated = await duplicateSolution(activeSolution.value.id)
      if (statusFilter.value === 'published') {
        statusFilter.value = 'all'
      }
      await loadSolutions()
      await applySolutionRecord(duplicated)
      ElMessage.success('已复制为新草稿')
    } catch (error) {
      ElMessage.error(error.message || '方案复制失败')
    }
  })

  if (!proceeded) return
}

async function deleteActiveSolution() {
  if (!activeSolution.value) return

  const shouldDiscard = isPublished.value ? true : await confirmDiscardDraftChanges()
  if (!shouldDiscard) return

  try {
    await ElMessageBox.confirm(
      `删除「${activeSolution.value.name || '未命名方案'}」后将无法恢复，是否继续？`,
      '删除方案',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  deleting.value = true
  try {
    await deleteSolution(activeSolution.value.id)
    activeSolution.value = null
    nodeList.value = []
    workbenchFieldIds.value = []
    lastSavedSnapshot.value = null
    await loadSolutions()
    ElMessage.success('方案已删除')
  } catch (error) {
    ElMessage.error(error.message || '删除方案失败')
  } finally {
    deleting.value = false
  }
}

watch(statusFilter, () => {
  loadSolutions()
})

watch(
  workbenchFieldIds,
  (nextIds) => {
    const cleaned = normalizeWorkbenchFieldIds(nextIds, nodeList.value)
    if (!arrayEquals(cleaned, nextIds)) {
      workbenchFieldIds.value = cleaned
    }
  },
  { deep: true },
)

watch(
  nodeList,
  () => {
    syncWorkbenchSelections(workbenchFieldIds.value)
  },
  { deep: true },
)

onMounted(async () => {
  await Promise.all([loadSolutions(), loadAvailablePackages()])
})
</script>
