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
        <div
          v-for="item in filteredSolutions"
          :key="item.id"
          role="button"
          tabindex="0"
          class="solution-list-item"
          :class="{ active: item.id === activeSolution?.id }"
          @click="openSolution(item.id)"
          @keydown.enter.prevent="openSolution(item.id)"
          @keydown.space.prevent="openSolution(item.id)"
        >
          <div class="solution-list-item-head">
            <span class="solution-status-chip" :class="item.status">{{ statusText(item.status) }}</span>
            <el-button
              class="solution-list-delete"
              text
              size="small"
              :disabled="deleting"
              @click.stop="deleteListedSolution(item)"
            >
              删除
            </el-button>
          </div>
          <div class="display-body strong solution-list-name">{{ item.name || '未命名方案' }}</div>
          <div class="solution-list-meta">
            <span>{{ item.nodes?.length || 0 }} 个节点</span>
            <span>{{ formatTime(item.updatedAt) }}</span>
          </div>
        </div>

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
          <div class="solution-add-node-control">
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
            <el-tooltip content="添加节点" placement="bottom">
              <el-button
                class="solution-toolbar-icon-btn"
                @click="addNodeFromSelector"
                :disabled="!pendingPackageType || isPublished"
                :loading="addingNode"
                aria-label="添加节点"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
          <div class="solution-toolbar-icon-actions">
            <el-tooltip content="预览工作台使用态" placement="bottom">
              <el-button class="solution-toolbar-icon-btn" @click="previewVisible = true" aria-label="预览工作台使用态">
                <el-icon><View /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip v-if="!isPublished" content="保存草稿" placement="bottom">
              <el-button
                class="solution-toolbar-icon-btn"
                @click="saveDraft"
                :loading="saving"
                aria-label="保存草稿"
              >
                <el-icon><Check /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip v-if="!isPublished" content="发布正式方案" placement="bottom">
              <el-button
                class="solution-toolbar-icon-btn publish"
                @click="publishDraft"
                :loading="publishing"
                aria-label="发布正式方案"
              >
                <el-icon><Upload /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
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
          :class="{ 'node-highlighted': isNodeHighlighted(node.id) }"
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

        <div class="intercom-card solution-settings-card">
          <div class="solution-settings-head">
            <div>
              <div class="display-feature-title">自定义字段（一对多）</div>
              <div class="display-body-light">创建字段，让一个字段控制多个组件</div>
            </div>
            <div class="solution-field-actions">
              <span class="display-mono">{{ customFields.length }} 个字段</span>
              <el-button
                class="solution-field-action"
                text
                :disabled="isPublished || customFields.length === 0"
                @click="clearAllCustomFields"
              >
                清空
              </el-button>
            </div>
          </div>

          <div v-if="customFields.length === 0 && !creatingCustomField" class="empty-state-sm display-body-light">
            点击下方按钮创建第一个自定义字段
          </div>

          <div v-else class="custom-field-list">
            <div
              v-for="cf in customFields"
              :key="cf.id"
              class="custom-field-item"
              :class="{ active: highlightedCustomFieldId === cf.id }"
              @click="highlightCustomField(cf.id)"
              @mouseenter="highlightCustomField(cf.id)"
              @mouseleave="highlightCustomField(null)"
            >
              <div class="custom-field-item-head">
                <span class="display-body strong">{{ cf.name }}</span>
                <el-button
                  class="solution-field-action"
                  text
                  size="small"
                  :disabled="isPublished"
                  @click.stop="removeCustomField(cf.id)"
                >
                  &times;
                </el-button>
              </div>
              <div class="display-body-light custom-field-meta">
                <span>{{ cf.type }}</span>
                <span>{{ (cf.bindings || []).length }} 个绑定</span>
                <span v-if="cf.group">分组: {{ cf.group }}</span>
              </div>
            </div>
          </div>

          <div v-if="creatingCustomField" class="creating-custom-field-panel">
            <div class="creating-steps">
              <span class="creating-step" :class="{ active: creatingCustomFieldStep === 1, done: creatingCustomFieldStep > 1 }">选择字段类型</span>
              <span class="creating-step" :class="{ active: creatingCustomFieldStep === 2 }">绑定组件</span>
            </div>

            <div v-if="creatingCustomFieldStep === 1" class="creating-step-body">
              <el-input
                v-model="creatingCustomFieldName"
                class="intercom-input"
                placeholder="输入自定义字段名称（如: 今年、去年）"
                size="small"
              />
              <div class="display-body-light creating-hint">
                在左侧主区域点击一个原始字段来确定类型。非同类型字段会自动置灰。
                <template v-if="creatingCustomFieldType">
                  <br/>已选类型: <strong>{{ creatingCustomFieldType }}</strong>
                </template>
              </div>
              <el-button
                v-if="creatingCustomFieldType && creatingCustomFieldName"
                class="intercom-btn-primary btn-small"
                @click="creatingCustomFieldStep = 2"
              >
                下一步: 绑定同类型字段 (已选 {{ creatingCustomFieldBindings.length }} 个)
              </el-button>
            </div>

            <div v-if="creatingCustomFieldStep === 2" class="creating-step-body">
              <div class="display-body-light creating-hint">
                在左侧主区域继续点击同类型字段以关联到「{{ creatingCustomFieldName }}」。已选 {{ creatingCustomFieldBindings.length }} 个绑定。
              </div>
              <div class="creating-step-actions">
                <el-button
                  class="intercom-btn-primary btn-small"
                  :disabled="creatingCustomFieldBindings.length === 0"
                  @click="finishCreateCustomField"
                >
                  完成创建
                </el-button>
                <el-button
                  class="intercom-btn-outlined btn-small"
                  @click="cancelCreateCustomField"
                >
                  取消
                </el-button>
              </div>
            </div>
          </div>

          <el-tooltip
            :content="isPublished ? '已发布方案无法编辑，请先生成编辑草稿' : nodeList.length === 0 ? '请先从上方添加组件节点' : '创建一个自定义字段来关联多个组件的同类型字段'"
            placement="top"
          >
            <el-button
              v-if="!creatingCustomField"
              class="intercom-btn-primary btn-small"
              style="width:100%;margin-top:8px"
              :disabled="isPublished"
              @click="startCreateCustomField"
            >
              + 新增自定义字段（一对多）
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <div v-else class="solution-empty-settings">
        <div class="display-sub">右侧设置区</div>
        <div class="display-body-light">选择方案后，可以在这里管理名称、工作台字段和发布信息。</div>
      </div>
    </aside>

    <SolutionPreviewDrawer
      v-model="previewVisible"
      :custom-field-sections="previewSections"
      :solution-name="activeSolution?.name || ''"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, provide, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Plus, Upload, View } from '@element-plus/icons-vue'
import DynamicForm from './DynamicForm.vue'
import SolutionPreviewDrawer from './SolutionPreviewDrawer.vue'
import { useSolutionsApi } from '../composables/useSolutionsApi'
import { useCdpShared } from '../composables/useCdpShared'
import { useSolutionRuntime } from '../composables/useSolutionRuntime'
import { fieldToken, serializeNodesForSolution, buildCustomFieldSections } from '../utils/solutionState.js'

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

const customFields = ref([])
const highlightedCustomFieldId = ref(null)
const creatingCustomField = ref(false)
const creatingCustomFieldStep = ref(1)
const creatingCustomFieldName = ref('')
const creatingCustomFieldType = ref('')
const creatingCustomFieldBindings = ref([])

provide('solutionCenterContext', reactive({
  get highlightedCustomFieldId() { return highlightedCustomFieldId.value },
  get customFields() { return customFields.value },
  get creatingCustomField() { return creatingCustomField.value },
  get creatingCustomFieldType() { return creatingCustomFieldType.value },
  get creatingCustomFieldStep() { return creatingCustomFieldStep.value },
  get creatingCustomFieldBindings() { return creatingCustomFieldBindings.value },
  onFieldClickForBinding,
  isFieldHighlighted,
  isNodeHighlighted,
  isFieldSelectableForBinding,
}))

const isPublished = computed(() => activeSolution.value?.status === 'published')

const filteredSolutions = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return solutions.value
  return solutions.value.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    return name.includes(keyword)
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

const availableWorkbenchFieldTokens = computed(() =>
  fieldGroups.value.flatMap((group) => group.fields.map((field) => field.token)),
)

const previewSections = computed(() =>
  buildCustomFieldSections(customFields.value, nodeList.value),
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
    customFields: cloneValue(customFields.value),
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
    customFields: Array.isArray(record?.customFields) ? [...record.customFields] : [],
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

function selectAllWorkbenchFields() {
  if (isPublished.value) return
  syncWorkbenchSelections(availableWorkbenchFieldTokens.value)
}

function clearWorkbenchFields() {
  if (isPublished.value) return
  workbenchFieldIds.value = []
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
    customFields: cloneValue(customFields.value),
  }
}

async function applySolutionRecord(record) {
  activeSolution.value = cloneValue(record)
  try {
    const sourceNodes = record?.nodes || []
    if (sourceNodes.length > 0) {
      nodeList.value = await hydrateNodes(sourceNodes)
      if (nodeList.value.length === 0) {
        console.error('所有节点加载失败')
        ElMessage.error('所有组件节点加载失败，请检查后端服务是否正常运行')
      } else if (nodeList.value.length < sourceNodes.length) {
        console.warn(`部分节点加载失败: ${nodeList.value.length}/${sourceNodes.length}`)
      }
    } else {
      nodeList.value = []
    }
  } catch (error) {
    console.error('节点加载失败:', error)
    ElMessage.error('组件节点加载失败，请检查后端服务是否正常运行')
    nodeList.value = []
  }
  syncWorkbenchSelections(Array.isArray(record?.workbenchFieldIds) ? record.workbenchFieldIds : [])
  loadCustomFields(record)
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

async function deleteListedSolution(item) {
  if (!item?.id) return

  const deletingActive = item.id === activeSolution.value?.id
  const shouldDiscard =
    deletingActive && item.status !== 'published' ? await confirmDiscardDraftChanges() : true
  if (!shouldDiscard) return

  try {
    await ElMessageBox.confirm(
      `删除「${item.name || '未命名方案'}」后将无法恢复，是否继续？`,
      '删除方案',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  deleting.value = true
  try {
    await deleteSolution(item.id)
    if (deletingActive) {
      activeSolution.value = null
      nodeList.value = []
      workbenchFieldIds.value = []
      lastSavedSnapshot.value = null
    }
    await loadSolutions()
    ElMessage.success('方案已删除')
  } catch (error) {
    ElMessage.error(error.message || '删除方案失败')
  } finally {
    deleting.value = false
  }
}

async function deleteActiveSolution() {
  if (!activeSolution.value) return
  await deleteListedSolution(activeSolution.value)
}

function loadCustomFields(record) {
  customFields.value = Array.isArray(record?.customFields) ? [...record.customFields] : []
}

function startCreateCustomField() {
  if (isPublished.value) return
  if (nodeList.value.length === 0) {
    ElMessage.warning('请先从上方添加组件节点，节点中的字段将作为自定义字段的绑定源')
    return
  }
  creatingCustomField.value = true
  creatingCustomFieldStep.value = 1
  creatingCustomFieldName.value = ''
  creatingCustomFieldType.value = ''
  creatingCustomFieldBindings.value = []
}

function cancelCreateCustomField() {
  creatingCustomField.value = false
  creatingCustomFieldStep.value = 1
  creatingCustomFieldName.value = ''
  creatingCustomFieldType.value = ''
  creatingCustomFieldBindings.value = []
}

function onFieldClickForBinding(nodeId, fieldKey) {
  if (!creatingCustomField.value) return
  const node = nodeList.value.find(n => n.id === nodeId)
  if (!node) return
  const field = (Array.isArray(node.schema) ? node.schema : []).find(f => f.key === fieldKey)
  if (!field) return

  if (creatingCustomFieldStep.value === 1) {
    if (!creatingCustomFieldName.value.trim()) {
      creatingCustomFieldName.value = field.Label || field.label || fieldKey
    }
    creatingCustomFieldType.value = field.Widget_Type
    creatingCustomFieldBindings.value = [{ nodeId, fieldKey }]
    creatingCustomFieldStep.value = 2
  } else if (creatingCustomFieldStep.value === 2) {
    if (field.Widget_Type !== creatingCustomFieldType.value) return
    const existingIdx = creatingCustomFieldBindings.value.findIndex(
      b => b.nodeId === nodeId && b.fieldKey === fieldKey
    )
    if (existingIdx >= 0) {
      creatingCustomFieldBindings.value.splice(existingIdx, 1)
    } else {
      creatingCustomFieldBindings.value.push({ nodeId, fieldKey })
    }
  }
}

function finishCreateCustomField() {
  if (!creatingCustomFieldName.value.trim() || creatingCustomFieldBindings.value.length === 0) return
  const name = creatingCustomFieldName.value.trim()
  customFields.value.push({
    id: `cf_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name,
    type: creatingCustomFieldType.value,
    group: '',
    defaultValue: {},
    bindings: [...creatingCustomFieldBindings.value],
  })
  cancelCreateCustomField()
  ElMessage.success(`自定义字段「${name}」创建成功`)
}

function removeCustomField(cfId) {
  customFields.value = customFields.value.filter(cf => cf.id !== cfId)
  if (highlightedCustomFieldId.value === cfId) highlightedCustomFieldId.value = null
}

function clearAllCustomFields() {
  customFields.value = []
  highlightedCustomFieldId.value = null
}

function highlightCustomField(cfId) {
  highlightedCustomFieldId.value = cfId
}

function getNodeHighlightedFieldKeys(nodeId) {
  if (!highlightedCustomFieldId.value) return new Set()
  const cf = customFields.value.find(c => c.id === highlightedCustomFieldId.value)
  if (!cf) return new Set()
  return new Set(
    (cf.bindings || []).filter(b => b.nodeId === nodeId).map(b => b.fieldKey)
  )
}

function isFieldHighlighted(nodeId, fieldKey) {
  return getNodeHighlightedFieldKeys(nodeId).has(fieldKey)
}

function isNodeHighlighted(nodeId) {
  return getNodeHighlightedFieldKeys(nodeId).size > 0
}

function isFieldSelectableForBinding(field) {
  if (!creatingCustomField.value) return false
  if (creatingCustomFieldStep.value === 1) return true
  return field.Widget_Type === creatingCustomFieldType.value
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

<style scoped>
.custom-field-item {
  padding: 10px 12px;
  border: 1px solid #e0dcd6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 6px;
}
.custom-field-item:hover,
.custom-field-item.active {
  border-color: #ff6b4a;
  background: rgba(255, 107, 74, 0.04);
}
.custom-field-item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.custom-field-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
}
.creating-custom-field-panel {
  background: rgba(255, 107, 74, 0.04);
  border: 1px solid rgba(255, 107, 74, 0.2);
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}
.creating-steps {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.creating-step {
  font-size: 11px;
  color: #a1a1a6;
}
.creating-step.active {
  color: #ff6b4a;
  font-weight: 600;
}
.creating-step.done {
  color: #78787d;
}
.creating-step-body {
  margin-top: 8px;
}
.creating-hint {
  font-size: 11px;
  margin: 8px 0;
  line-height: 1.5;
}
.creating-step-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.node-highlighted {
  border-color: #ff6b4a !important;
  box-shadow: 0 0 0 3px rgba(255, 107, 74, 0.15) !important;
}
</style>
