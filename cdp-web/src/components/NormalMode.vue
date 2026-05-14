<template>
  <div class="normal-mode-layout">
    <NormalModeSidebar
      :packages="filteredPackages"
      :search="pkgSearch"
      :loading-pkg="loadingPkg"
      @update:search="pkgSearch = $event"
      @add-node="addNode"
    />

    <NormalModeCanvas
      :node-list="nodeList"
      :all-collapsed="allCollapsed"
      @toggle-collapse="toggleCollapseAll"
      @clear-canvas="clearCanvas"
      @canvas-scroll="onCanvasScroll"
    >
      <template #toolbar-extra>
        <div class="normal-mode-canvas-actions">
          <el-button :disabled="!canUndo" size="small" text title="撤销 Ctrl+Z" @click="undo">
            ↶
          </el-button>
          <el-button :disabled="!canRedo" size="small" text title="重做 Ctrl+Shift+Z" @click="redo">
            ↷
          </el-button>
        </div>
      </template>

      <template #nodes>
        <div
          v-for="(node, index) in nodeList"
          :key="node.id"
          class="node-wrapper"
          :ref="el => { if (el) nodeRefs[index] = el }"
          @dragover.prevent="onDragOver($event, index)"
          @drop="onDrop($event, index)"
          @dragleave="onDragLeave"
        >
          <div v-if="index > 0" class="logic-connector">
            <div class="connector-line"></div>
            <el-radio-group v-model="node.operator" size="small" class="intercom-radio-group">
              <el-radio-button label="n">交集 (n)</el-radio-button>
              <el-radio-button label="u">并集 (u)</el-radio-button>
              <el-radio-button label="d">差集 (d)</el-radio-button>
            </el-radio-group>
            <div class="connector-line"></div>
          </div>

          <div class="intercom-card behavior-card" :class="{ collapsed: node.collapsed }">
            <div class="card-header-inner" :class="{ 'drag-over': dragOverIndex === index }">
              <span
                class="drag-handle"
                draggable="true"
                title="拖拽排序"
                @dragstart="onDragStart($event, index)"
                @dragend="onDragEnd"
              >
                ⋮⋯
              </span>
              <span
                class="card-title-flex"
                style="cursor: pointer"
                @click="node.collapsed = !node.collapsed"
              >
                <span class="collapse-arrow">{{ node.collapsed ? '▸' : '▾' }}</span>
                <span class="display-card-title" style="font-size: 20px">{{ node.packageType }}</span>
                <span class="display-mono badge-mono">节点 {{ index }}</span>
              </span>
              <div style="display: flex; gap: 6px">
                <el-button
                  class="intercom-btn-outlined btn-small"
                  title="复制此节点"
                  @click="duplicateNode(index)"
                >
                  复制
                </el-button>
                <el-popconfirm
                  title="确定移除这个节点？"
                  confirm-button-text="移除"
                  cancel-button-text="取消"
                  @confirm="removeNode(index)"
                >
                  <template #reference>
                    <el-button class="intercom-btn-outlined btn-small">移除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <DynamicForm v-show="!node.collapsed" :node="node" />
          </div>
        </div>
      </template>

      <template #minimap>
        <div
          v-for="(node, idx) in nodeList"
          :key="'mm-' + node.id"
          class="minimap-dot"
          :class="{ active: activeNodeIndex === idx }"
          :title="node.packageType"
          @click="scrollToNode(idx)"
        >
          <span class="minimap-num">{{ idx }}</span>
        </div>
      </template>
    </NormalModeCanvas>

    <NormalModeInspector
      :expanded="inspectorExpanded"
      @toggle-expanded="inspectorExpanded = !inspectorExpanded"
    >
      <template #header>
        <div class="display-body-light name-label-inline">人群包名称</div>
        <div style="display: flex; align-items: center; gap: 6px">
          <el-input
            v-model="crowdNameInput"
            placeholder="自动生成或手动输入"
            size="default"
            clearable
            class="intercom-input"
            style="flex: 1"
            @input="onNameManualEdit"
          />
          <el-tooltip v-if="nameAuto" content="名称由参数自动生成" placement="top">
            <span style="flex-shrink: 0; cursor: default; font-size: 11px; color: #ff6b4a">
              自动
            </span>
          </el-tooltip>
        </div>
      </template>

      <template #tabs>
        <div class="json-tabs">
          <span
            class="json-tab"
            :class="{ active: jsonViewMode === 'summary' }"
            @click="jsonViewMode = 'summary'"
          >
            摘要
          </span>
          <span
            class="json-tab"
            :class="{ active: jsonViewMode === 'json' }"
            @click="jsonViewMode = 'json'"
          >
            JSON
          </span>
        </div>
        <div class="json-actions">
          <el-button class="intercom-btn-primary" size="small" @click="copyJson">复制</el-button>
          <el-button class="intercom-btn-outlined" size="small" @click="goToDataBank">
            去圈人
          </el-button>
        </div>
      </template>

      <template #collapsed>
        结果
      </template>

      <div v-if="jsonViewMode === 'summary'" class="json-summary">
        <div v-if="nodeList.length === 0" class="empty-state-sm display-body-light">
          请先在画布中添加行为组件
        </div>
        <div v-for="(node, index) in nodeList" :key="'s-' + node.id" class="summary-node">
          <div class="summary-node-head">
            <span class="summary-idx">{{ index }}</span>
            <span class="display-body strong">{{ node.packageType }}</span>
            <span v-if="index > 0" class="summary-op">
              {{ node.operator === 'n' ? '∩ 交集' : node.operator === 'u' ? '∪ 并集' : '− 差集' }}
            </span>
          </div>
          <div class="summary-rows">
            <div v-for="item in getNodeSummary(node)" :key="item.key" class="summary-row">
              <span class="summary-label">{{ item.label }}</span>
              <span class="summary-val">{{ item.value }}</span>
            </div>
            <div
              v-if="getNodeSummary(node).length === 0"
              class="display-body-light"
              style="padding: 8px 0; opacity: 0.5"
            >
              尚未配置任何参数
            </div>
          </div>
        </div>
        <div v-if="nodeList.length > 1" class="summary-compute">
          <span class="display-body-light">运算链：</span>
          <span class="display-mono">{{ generatedJson.compute }}</span>
        </div>
      </div>

      <pre v-else class="json-code display-mono">{{ JSON.stringify(generatedJson, null, 2) }}</pre>
    </NormalModeInspector>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import DynamicForm from './DynamicForm.vue'
import NormalModeCanvas from './normal-mode/NormalModeCanvas.vue'
import NormalModeInspector from './normal-mode/NormalModeInspector.vue'
import NormalModeSidebar from './normal-mode/NormalModeSidebar.vue'
import { useCdpShared } from '../composables/useCdpShared'

const { schemaCache, logicMatrixCache } = useCdpShared()
const { getArray, isVisible } = useCdpShared()

const jsonViewMode = ref('summary')
const availablePackages = ref([])
const loadingPkg = ref(null)
const nodeList = ref([])
const crowdNameInput = ref('未命名')
const nameAuto = ref(true)
const pkgSearch = ref('')
const inspectorExpanded = ref(true)
const activeNodeIndex = ref(0)
const nodeRefs = ref({})
const dragOverIndex = ref(-1)
const historyStack = ref([])
const historyPos = ref(-1)
const MAX_HISTORY = 50
const generatedJson = ref({ crowdName: '未命名', list: [], compute: '' })
let dragSrcIndex = null
let saveTimer = null
let jsonTimer = null

const allCollapsed = computed(() => nodeList.value.length > 0 && nodeList.value.every(node => node.collapsed))
const canUndo = computed(() => historyPos.value > 0)
const canRedo = computed(() => historyPos.value < historyStack.value.length - 1)
const filteredPackages = computed(() => {
  if (!pkgSearch.value) return availablePackages.value
  const query = pkgSearch.value.toLowerCase()
  return availablePackages.value.filter(pkg => pkg.toLowerCase().includes(query))
})

const onNameManualEdit = () => {
  nameAuto.value = false
}

function onDragStart(event, index) {
  dragSrcIndex = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onDragOver(event, index) {
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = -1
}

function onDrop(event, targetIndex) {
  dragOverIndex.value = -1
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return
  takeSnapshot()
  const [moved] = nodeList.value.splice(dragSrcIndex, 1)
  nodeList.value.splice(targetIndex, 0, moved)
  nodeList.value.forEach((node, index) => {
    if (index === 0) node.operator = null
  })
  dragSrcIndex = null
}

function onDragEnd() {
  dragOverIndex.value = -1
}

function clearCanvas() {
  if (nodeList.value.length === 0) return
  takeSnapshot()
  nodeList.value = []
  crowdNameInput.value = '未命名'
  nameAuto.value = true
  ElMessage.success('画布已清空')
}

function toggleCollapseAll() {
  const target = !allCollapsed.value
  nodeList.value.forEach(node => {
    node.collapsed = target
  })
}

function onCanvasScroll(event) {
  const container = event.target
  if (!container) return

  const midPoint = container.scrollTop + container.clientHeight / 2
  let closestIndex = 0
  let closestDistance = Infinity

  Object.entries(nodeRefs.value).forEach(([index, element]) => {
    if (!element) return
    const elementMiddle = element.offsetTop + element.offsetHeight / 2
    const distance = Math.abs(midPoint - elementMiddle)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = Number.parseInt(index, 10)
    }
  })

  activeNodeIndex.value = closestIndex
}

function scrollToNode(index) {
  const element = nodeRefs.value[index]
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function takeSnapshot() {
  const snapshot = JSON.parse(JSON.stringify({
    nodeList: nodeList.value,
    crowdNameInput: crowdNameInput.value,
    nameAuto: nameAuto.value,
  }))
  historyStack.value = historyStack.value.slice(0, historyPos.value + 1)
  historyStack.value.push(snapshot)
  if (historyStack.value.length > MAX_HISTORY) historyStack.value.shift()
  historyPos.value = historyStack.value.length - 1
}

function restoreSnapshot() {
  const snapshot = historyStack.value[historyPos.value]
  nodeList.value = snapshot.nodeList
  crowdNameInput.value = snapshot.crowdNameInput
  nameAuto.value = snapshot.nameAuto !== undefined ? snapshot.nameAuto : false
}

function undo() {
  if (!canUndo.value) return
  historyPos.value -= 1
  restoreSnapshot()
}

function redo() {
  if (!canRedo.value) return
  historyPos.value += 1
  restoreSnapshot()
}

function debouncedSnapshot() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(takeSnapshot, 1500)
}

const loadPackages = async () => {
  try {
    const response = await fetch('/api/packages')
    availablePackages.value = await response.json()
  } catch (error) {
    console.error('加载包名失败', error)
  }
}

const addNode = async pkgType => {
  loadingPkg.value = pkgType
  let schema = schemaCache.value[pkgType]
  let logicMatrix = logicMatrixCache.value[pkgType]

  if (!schema) {
    try {
      const response = await fetch(`/api/meta/${pkgType}`)
      const responseData = await response.json()
      schema = responseData.schema || []
      logicMatrix = responseData.matrix || {}
      schemaCache.value[pkgType] = schema
      logicMatrixCache.value[pkgType] = logicMatrix
    } catch (error) {
      console.error('加载配置失败:', error)
      loadingPkg.value = null
      ElMessage.error('组件加载失败，请检查后端连接')
      return
    }
  }

  const initData = {}
  const initModeData = {}

  schema.forEach(field => {
    if (field.Widget_Type === '搜索单选') initData[field.key] = ''
    else if (field.Widget_Type === '列表输入') initData[field.key] = []
    else if (
      ['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) ||
      ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)
    ) initData[field.key] = []
    else if (field.Widget_Type === '单选组') initData[field.key] = '任意商品标题关键词'
    else if (field.Widget_Type === '数值框切换') {
      initModeData[field.key] = 'unlimited'
      initData[field.key] = { min: null, max: null }
    } else if (field.Widget_Type === '日期_切换') {
      initModeData[field.key] = 'recent'
      initData[field.key] = { days: 30, dateRange: [] }
    } else initData[field.key] = ''
  })

  if (pkgType === 'AIPL状态' && initData.cate !== undefined) {
    initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
  }

  if (pkgType === '商品行为') {
    if (initData.cate !== undefined) {
      initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
    }
    if (initData.leafCates !== undefined) {
      initData.leafCates = Array.isArray(initData.leafCates) ? ['全部'] : '全部'
    }
  }

  takeSnapshot()
  nodeList.value.push({
    id: Date.now() + Math.random(),
    packageType: pkgType,
    schema,
    logicMatrix,
    formData: initData,
    modeData: initModeData,
    operator: nodeList.value.length === 0 ? null : 'n',
    selectedFirstDate: null,
    collapsed: false,
  })
  loadingPkg.value = null
}

const removeNode = index => {
  takeSnapshot()
  nodeList.value.splice(index, 1)
  if (nodeList.value.length > 0) nodeList.value[0].operator = null
}

const duplicateNode = index => {
  takeSnapshot()
  const source = nodeList.value[index]
  const clone = JSON.parse(JSON.stringify({
    packageType: source.packageType,
    schema: source.schema,
    logicMatrix: source.logicMatrix,
    formData: source.formData,
    modeData: source.modeData,
    selectedFirstDate: source.selectedFirstDate || null,
  }))

  nodeList.value.splice(index + 1, 0, {
    id: Date.now() + Math.random(),
    packageType: clone.packageType,
    schema: clone.schema,
    logicMatrix: clone.logicMatrix,
    formData: clone.formData,
    modeData: clone.modeData,
    operator: 'n',
    selectedFirstDate: clone.selectedFirstDate,
    collapsed: false,
  })
  ElMessage.success('节点已复制')
}

const buildFinalJson = async () => {
  if (nodeList.value.length === 0) {
    generatedJson.value = { crowdName: '未命名', list: [], compute: '' }
    return
  }

  const newList = []
  let computeStr = '(0)'

  for (let index = 0; index < nodeList.value.length; index += 1) {
    const node = nodeList.value[index]
    const payload = { _package: node.packageType }

    node.schema.forEach(field => {
      if (!isVisible(field, node)) return
      const key = field.key

      if (
        ['搜索多选', '复选组', '多选下拉', '下拉多选', '列表输入'].includes(field.Widget_Type) ||
        ['bhv', 'channel', 'leafCates', 'stdBrand', 'cate', 'title', 'keywords'].includes(key)
      ) {
        if (node.formData[key] && node.formData[key].length > 0) payload[key] = node.formData[key]
      } else if (field.Widget_Type === '数值框切换') {
        const mode = node.modeData[key]
        if (mode === 'unlimited') payload[key] = { min: '', max: '' }
        else if (mode === 'min') payload[key] = { min: node.formData[key].min, max: '' }
        else if (mode === 'range') {
          payload[key] = { min: node.formData[key].min, max: node.formData[key].max }
        }
      } else if (field.Widget_Type === '日期_切换') {
        const mode = node.modeData[key]
        if (mode === 'recent') {
          payload[key] = { val: { days: node.formData[key].days }, min: 'recent' }
        } else {
          const range = node.formData[key].dateRange
          if (range && range.length === 2) {
            payload[key] = { val: { start: range[0], end: range[1] }, min: 'range' }
          }
        }
      } else if (node.formData[key] !== undefined && node.formData[key] !== '') {
        payload[key] = node.formData[key]
      }
    })

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const nodeJson = await response.json()
      if (nodeJson && nodeJson.list && nodeJson.list.length > 0) {
        const baseTemplate = nodeJson.list[0]
        baseTemplate.fromPoolId = index
        if (index > 0) {
          baseTemplate.op = 'INIT'
          computeStr += `${node.operator}(${index})`
        }
        newList.push(baseTemplate)
      }
    } catch (error) {
      console.error('JSON 引擎翻译失败，请检查后端是否开启', error)
    }
  }

  generatedJson.value = { crowdName: crowdNameInput.value, list: newList, compute: computeStr }
}

const generateCrowdName = () => {
  if (!nameAuto.value) return

  const parts = []
  const node = nodeList.value[0]
  if (!node) {
    crowdNameInput.value = '未命名'
    return
  }

  const channels = getArray(node.formData?.channel)
  if (channels.length > 0) {
    const channelText = channels.filter(item => item !== '所有销售渠道').slice(0, 2).join('/')
    if (channelText) parts.push(channelText)
  }

  const behaviors = getArray(node.formData?.bhv)
  if (behaviors.length > 0) parts.push(behaviors.slice(0, 2).join('/'))

  const categories = getArray(node.formData?.cate) || getArray(node.formData?.leafCates)
  if (categories.length > 0 && !categories.includes('全部')) {
    parts.push(categories.slice(0, 2).join('/'))
  }

  const brands = getArray(node.formData?.stdBrand)
  if (brands.length > 0) parts.push(brands.slice(0, 1).join(''))

  const timeKey = Object.keys(node.modeData || {}).find(key =>
    node.schema?.find(field => field.key === key && field.Widget_Type === '日期_切换')
  )
  if (timeKey) {
    const mode = node.modeData[timeKey]
    const timeData = node.formData[timeKey]
    if (mode === 'recent' && timeData?.days) parts.push(`${timeData.days}天`)
    else if (mode === 'range' && timeData?.dateRange?.length === 2) {
      parts.push(`${timeData.dateRange[0]}-${timeData.dateRange[1]}`)
    }
  }

  const numberKey = Object.keys(node.modeData || {}).find(key =>
    node.schema?.find(field => field.key === key && field.Widget_Type === '数值框切换')
  )
  if (numberKey) {
    const mode = node.modeData[numberKey]
    const numberData = node.formData[numberKey]
    if (mode === 'min' && numberData?.min) parts.push(`≥${numberData.min}`)
    else if (mode === 'range' && numberData?.min) {
      parts.push(`${numberData.min}-${numberData.max || '∞'}`)
    }
  }

  crowdNameInput.value = nodeList.value.length > 1
    ? `${parts.join('_')}_等${nodeList.value.length}组`
    : parts.join('_')
}

const getNodeSummary = node => {
  const items = []
  node.schema.forEach(field => {
    if (!isVisible(field, node)) return
    const key = field.key
    const value = node.formData[key]
    const mode = node.modeData[key]
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value) && value.length === 0) return

    let display = ''
    if (field.Widget_Type === '数值框切换') {
      if (mode === 'unlimited') return
      if (mode === 'min' && value.min) display = `≥${value.min}`
      else if (mode === 'range') display = `${value.min || '?'} - ${value.max || '?'}`
    } else if (field.Widget_Type === '日期_切换') {
      if (mode === 'recent' && value.days) display = `过去 ${value.days} 天`
      else if (mode === 'range' && value.dateRange?.length === 2) {
        display = `${value.dateRange[0]} ~ ${value.dateRange[1]}`
      }
    } else if (Array.isArray(value)) {
      display = value.slice(0, 6).join('、')
      if (value.length > 6) display += ` ...共${value.length}项`
    } else if (typeof value === 'object') {
      display = JSON.stringify(value)
    } else {
      display = String(value)
    }

    if (display) items.push({ key, label: field.Label, value: display })
  })
  return items
}

const copyJson = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(generatedJson.value, null, 4))
    ElMessage.success('JSON 已成功复制到剪贴板！')
  } catch (error) {
    ElMessage.error('复制失败，请手动选择复制')
  }
}

const goToDataBank = () => {
  window.open('https://databank.tmall.com/#/userDefinedAnalyses', '_blank')
}

watch([nodeList, crowdNameInput], ([newNodes]) => {
  generateCrowdName()

  newNodes.forEach(node => {
    if (node.packageType !== '商品行为') return
    const channels = getArray(node.formData.channel)
    const isTmallGlobal = channels.includes('天猫国际直营')
    const isTmall = channels.includes('天猫')
    const currentShop = node.formData.shop

    if (!isTmall && currentShop !== '全淘宝天猫') {
      node.formData.shop = '全淘宝天猫'
    }

    const latestShop = node.formData.shop
    if ((latestShop === '全淘宝天猫' || !latestShop) && !isTmallGlobal) {
      if (node.formData.selectedGoodsType !== '任意品牌商品') {
        node.formData.selectedGoodsType = '任意品牌商品'
      }
      if (node.formData.item && node.formData.item.length > 0) {
        node.formData.item = []
      }
    }
  })

  clearTimeout(jsonTimer)
  jsonTimer = setTimeout(async () => {
    await buildFinalJson()
  }, 300)
  debouncedSnapshot()
}, { deep: true })

function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
    event.preventDefault()
    redo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Z') {
    event.preventDefault()
    redo()
  }
}

onMounted(() => {
  loadPackages()
  takeSnapshot()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.normal-mode-layout {
  display: flex;
  min-height: 0;
  height: 100%;
}

.normal-mode-canvas-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin: -12px 0 12px;
}
</style>
