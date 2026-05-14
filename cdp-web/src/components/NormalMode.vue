<template>
  <div class="left-panel">
    <div class="display-feature-title panel-header">✨ 行为组件库</div>
    <el-input v-model="pkgSearch" placeholder="搜索组件..." size="small" clearable class="intercom-input pkg-search">
      <template #prefix><span style="opacity:0.3">🔍</span></template>
    </el-input>
    <div class="btn-group">
      <el-button v-for="pkg in filteredPackages" :key="pkg" type="default" class="intercom-btn-outlined" @click="addNode(pkg)" :loading="loadingPkg === pkg">
        ➕ 添加 {{ pkg }}
      </el-button>
    </div>
    <div v-if="pkgSearch && filteredPackages.length === 0" class="display-body-light" style="text-align:center;margin-top:20px">无匹配组件</div>
  </div>

  <div class="center-panel">
    <div class="panel-toolbar">
      <span class="display-feature-title">配置画布与逻辑组装</span>
      <div class="toolbar-actions">
        <el-button v-if="nodeList.length > 0" size="small" text @click="toggleCollapseAll">
          {{ allCollapsed ? '展开全部' : '收起全部' }}
        </el-button>
        <el-button v-if="nodeList.length > 0" size="small" text @click="clearCanvas" style="color:#ff3b30">清空</el-button>
        <el-button :disabled="!canUndo" @click="undo" size="small" text title="撤销 Ctrl+Z">↩</el-button>
        <el-button :disabled="!canRedo" @click="redo" size="small" text title="重做 Ctrl+Shift+Z">↪</el-button>
      </div>
    </div>
    <div v-if="nodeList.length === 0" class="empty-hint display-body-light">请从左侧点击添加行为组件 👉</div>

    <div class="canvas-with-minimap" v-if="nodeList.length > 0">
      <div class="canvas-scroll-area" ref="canvasScrollRef" @scroll="onCanvasScroll">
        <div v-for="(node, index) in nodeList" :key="node.id" class="node-wrapper" :ref="el => { if (el) nodeRefs[index] = el }" @dragover.prevent="onDragOver($event, index)" @drop="onDrop($event, index)" @dragleave="onDragLeave">
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
              <span class="drag-handle" draggable="true" @dragstart="onDragStart($event, index)" @dragend="onDragEnd" title="拖拽排序">⋮⋮</span>
              <span class="card-title-flex" @click="node.collapsed = !node.collapsed" style="cursor:pointer">
                <span class="collapse-arrow">{{ node.collapsed ? '▶' : '▼' }}</span>
                <span class="display-card-title" style="font-size:20px">{{ node.packageType }}</span>
                <span class="display-mono badge-mono">节点 {{ index }}</span>
              </span>
              <div style="display:flex; gap:6px">
                <el-button class="intercom-btn-outlined btn-small" @click="duplicateNode(index)" title="复制此节点">📋</el-button>
                <el-popconfirm title="确定移除这个节点？" confirm-button-text="移除" cancel-button-text="取消" @confirm="removeNode(index)">
                  <template #reference>
                    <el-button class="intercom-btn-outlined btn-small">移除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <DynamicForm v-show="!node.collapsed" :node="node" />
          </div>
        </div>
      </div>
      <div v-if="nodeList.length > 1" class="node-minimap">
        <div v-for="(n, idx) in nodeList" :key="'mm-'+n.id"
             class="minimap-dot" :class="{ active: activeNodeIndex === idx }"
             @click="scrollToNode(idx)" :title="n.packageType">
          <span class="minimap-num">{{ idx }}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="right-panel">
    <div class="panel-name-area">
      <div class="display-body-light name-label-inline">🏷️ 人群包名称</div>
      <div style="display:flex;align-items:center;gap:6px">
        <el-input v-model="crowdNameInput" placeholder="自动生成或手动输入" size="default" clearable class="intercom-input" style="flex:1" @input="onNameManualEdit" />
        <el-tooltip v-if="nameAuto" content="名称由参数自动生成" placement="top">
          <span style="font-size:11px;color:#ff6b4a;cursor:default;flex-shrink:0">✨ 自动</span>
        </el-tooltip>
      </div>
    </div>
    <div class="json-area">
      <div class="json-toolbar">
        <div class="json-tabs">
          <span class="json-tab" :class="{ active: jsonViewMode === 'summary' }" @click="jsonViewMode = 'summary'">📋 摘要</span>
          <span class="json-tab" :class="{ active: jsonViewMode === 'json' }" @click="jsonViewMode = 'json'">JSON</span>
        </div>
        <div class="json-actions">
          <el-button class="intercom-btn-primary" size="small" @click="copyJson">复制</el-button>
          <el-button class="intercom-btn-outlined" size="small" @click="goToDataBank">去圈人 →</el-button>
        </div>
      </div>
      <div v-if="jsonViewMode === 'summary'" class="json-summary">
        <div v-if="nodeList.length === 0" class="empty-state-sm display-body-light">请先在画布中添加行为组件</div>
        <div v-for="(node, index) in nodeList" :key="'s-'+node.id" class="summary-node">
          <div class="summary-node-head">
            <span class="summary-idx">{{ index }}</span>
            <span class="display-body strong">{{ node.packageType }}</span>
            <span v-if="index > 0" class="summary-op">{{ node.operator === 'n' ? '∩ 交集' : node.operator === 'u' ? '∪ 并集' : '− 差集' }}</span>
          </div>
          <div class="summary-rows">
            <div v-for="p in getNodeSummary(node)" :key="p.key" class="summary-row">
              <span class="summary-label">{{ p.label }}</span>
              <span class="summary-val">{{ p.value }}</span>
            </div>
            <div v-if="getNodeSummary(node).length === 0" class="display-body-light" style="padding:8px 0;opacity:0.5">尚未配置任何参数</div>
          </div>
        </div>
        <div v-if="nodeList.length > 1" class="summary-compute">
          <span class="display-body-light">运算链：</span>
          <span class="display-mono">{{ generatedJson.compute }}</span>
        </div>
      </div>
      <pre v-else class="json-code display-mono">{{ JSON.stringify(generatedJson, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { ElMessage } from 'element-plus'
import DynamicForm from './DynamicForm.vue'
import { useCdpShared } from '../composables/useCdpShared'

const { schemaCache, logicMatrixCache } = useCdpShared()

// ---- State ----
const jsonViewMode = ref('summary')
const availablePackages = ref([])
const loadingPkg = ref(null)
const nodeList = ref([])
const crowdNameInput = ref('未命名')
const nameAuto = ref(true)
const pkgSearch = ref('')
const activeNodeIndex = ref(0)
const canvasScrollRef = ref(null)
const nodeRefs = ref({})
const dragOverIndex = ref(-1)
const historyStack = ref([])
const historyPos = ref(-1)
const MAX_HISTORY = 50
const generatedJson = ref({ crowdName: "未命名", list: [], compute: "" })
let dragSrcIndex = null
let saveTimer = null
let jsonTimer = null

// ---- Computed ----
const filteredPackages = computed(() => {
  if (!pkgSearch.value) return availablePackages.value
  const q = pkgSearch.value.toLowerCase()
  return availablePackages.value.filter(p => p.toLowerCase().includes(q))
})
const allCollapsed = computed(() => nodeList.value.length > 0 && nodeList.value.every(n => n.collapsed))
const canUndo = computed(() => historyPos.value > 0)
const canRedo = computed(() => historyPos.value < historyStack.value.length - 1)

// ---- Utility functions (from shared) ----
const { getArray, isVisible } = useCdpShared()

// ---- Name ----
const onNameManualEdit = () => { nameAuto.value = false }

// ---- Drag ----
function onDragStart(e, index) { dragSrcIndex = index; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)) }
function onDragOver(e, index) { dragOverIndex.value = index }
function onDragLeave() { dragOverIndex.value = -1 }
function onDrop(e, targetIndex) {
  dragOverIndex.value = -1
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return
  takeSnapshot()
  const [moved] = nodeList.value.splice(dragSrcIndex, 1)
  nodeList.value.splice(targetIndex, 0, moved)
  nodeList.value.forEach((n, i) => { if (i === 0) n.operator = null })
  dragSrcIndex = null
}
function onDragEnd() { dragOverIndex.value = -1 }

// ---- Canvas ----
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
  nodeList.value.forEach(n => n.collapsed = target)
}
function onCanvasScroll() {
  const container = canvasScrollRef.value
  if (!container) return
  const scrollTop = container.scrollTop; const containerHeight = container.clientHeight
  const midPoint = scrollTop + containerHeight / 2
  let closestIdx = 0; let closestDist = Infinity
  Object.entries(nodeRefs.value).forEach(([idx, el]) => {
    if (!el) return
    const elMid = (el.offsetTop + el.offsetTop + el.offsetHeight) / 2
    const dist = Math.abs(midPoint - elMid)
    if (dist < closestDist) { closestDist = dist; closestIdx = parseInt(idx) }
  })
  activeNodeIndex.value = closestIdx
}
function scrollToNode(index) { const el = nodeRefs.value[index]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }

// ---- Undo/Redo ----
function takeSnapshot() {
  const snap = JSON.parse(JSON.stringify({ nodeList: nodeList.value, crowdNameInput: crowdNameInput.value, nameAuto: nameAuto.value }))
  historyStack.value = historyStack.value.slice(0, historyPos.value + 1)
  historyStack.value.push(snap)
  if (historyStack.value.length > MAX_HISTORY) historyStack.value.shift()
  historyPos.value = historyStack.value.length - 1
}
function undo() { if (!canUndo.value) return; historyPos.value--; restoreSnapshot() }
function redo() { if (!canRedo.value) return; historyPos.value++; restoreSnapshot() }
function restoreSnapshot() {
  const snap = historyStack.value[historyPos.value]
  nodeList.value = snap.nodeList; crowdNameInput.value = snap.crowdNameInput
  nameAuto.value = snap.nameAuto !== undefined ? snap.nameAuto : false
}
function debouncedSnapshot() { clearTimeout(saveTimer); saveTimer = setTimeout(takeSnapshot, 1500) }

// ---- Node Management ----
const loadPackages = async () => {
  try { const res = await fetch('/api/packages'); availablePackages.value = await res.json() }
  catch (e) { console.error("加载包名失败", e) }
}

const addNode = async (pkgType) => {
  loadingPkg.value = pkgType
  let schema = schemaCache.value[pkgType]; let logicMatrix = logicMatrixCache.value[pkgType]
  if (!schema) {
    try {
      const res = await fetch(`/api/meta/${pkgType}`); const resData = await res.json()
      schema = resData.schema || []; logicMatrix = resData.matrix || {}
      schemaCache.value[pkgType] = schema; logicMatrixCache.value[pkgType] = logicMatrix
    } catch (e) { console.error("加载配置失败:", e); loadingPkg.value = null; ElMessage.error('组件加载失败，请检查后端连接'); return }
  }
  const initData = {}; const initModeData = {}
  schema.forEach(field => {
    if (field.Widget_Type === '搜索单选') initData[field.key] = ''
    else if (['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)) initData[field.key] = []
    else if (field.Widget_Type === '单选组') initData[field.key] = '任意商品标题关键字'
    else if (field.Widget_Type === '数值_切换') { initModeData[field.key] = 'unlimited'; initData[field.key] = { min: null, max: null } }
    else if (field.Widget_Type === '日期_切换') { initModeData[field.key] = 'recent'; initData[field.key] = { days: 30, dateRange: [] } }
    else initData[field.key] = ''
  })
  if (pkgType === 'AIPL状态' && initData.cate !== undefined) initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
  if (pkgType === '商品行为') {
    if (initData.cate !== undefined) initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
    if (initData.leafCates !== undefined) initData.leafCates = Array.isArray(initData.leafCates) ? ['全部'] : '全部'
  }
  takeSnapshot()
  nodeList.value.push({ id: Date.now() + Math.random(), packageType: pkgType, schema, logicMatrix, formData: initData, modeData: initModeData, operator: nodeList.value.length === 0 ? null : 'n', selectedFirstDate: null, collapsed: false })
  loadingPkg.value = null
}

const removeNode = (index) => { takeSnapshot(); nodeList.value.splice(index, 1); if (nodeList.value.length > 0) nodeList.value[0].operator = null }

const duplicateNode = (index) => {
  takeSnapshot(); const source = nodeList.value[index]
  const clone = JSON.parse(JSON.stringify({ packageType: source.packageType, schema: source.schema, logicMatrix: source.logicMatrix, formData: source.formData, modeData: source.modeData, selectedFirstDate: source.selectedFirstDate || null }))
  nodeList.value.splice(index + 1, 0, { id: Date.now() + Math.random(), packageType: clone.packageType, schema: clone.schema, logicMatrix: clone.logicMatrix, formData: clone.formData, modeData: clone.modeData, operator: 'n', selectedFirstDate: clone.selectedFirstDate, collapsed: false })
  ElMessage.success('节点已复制')
}

// ---- JSON Generation ----
const buildFinalJson = async () => {
  if (nodeList.value.length === 0) { generatedJson.value = { crowdName: "未命名", list: [], compute: "" }; return }
  const newList = []; let computeStr = "(0)"
  for (let i = 0; i < nodeList.value.length; i++) {
    const node = nodeList.value[i]; const payload = { _package: node.packageType }
    node.schema.forEach(f => {
      if (!isVisible(f, node)) return
      const k = f.key
      if (['搜索多选', '复选组', '多选下拉', '下拉多选', '列表输入'].includes(f.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand', 'cate', 'title', 'keywords'].includes(k)) {
        if (node.formData[k] && node.formData[k].length > 0) payload[k] = node.formData[k]
      } else if (f.Widget_Type === '数值_切换') {
        const mode = node.modeData[k]; if (mode === 'unlimited') payload[k] = { min: "", max: "" }; else if (mode === 'min') payload[k] = { min: node.formData[k].min, max: "" }; else if (mode === 'range') payload[k] = { min: node.formData[k].min, max: node.formData[k].max }
      } else if (f.Widget_Type === '日期_切换') {
        const mode = node.modeData[k]; if (mode === 'recent') payload[k] = { val: { days: node.formData[k].days }, min: "recent" }; else { const range = node.formData[k].dateRange; if (range && range.length === 2) payload[k] = { val: { start: range[0], end: range[1] }, min: "range" } }
      } else { if (node.formData[k] !== undefined && node.formData[k] !== '') payload[k] = node.formData[k] }
    })
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const nodeJson = await res.json()
      if (nodeJson && nodeJson.list && nodeJson.list.length > 0) { const baseTmpl = nodeJson.list[0]; baseTmpl.fromPoolId = i; if (i > 0) { baseTmpl.op = "INIT"; computeStr += `${node.operator}(${i})` }; newList.push(baseTmpl) }
    } catch (e) { console.error('JSON 引擎翻译失败，请检查后端是否开启', e) }
  }
  generatedJson.value = { crowdName: crowdNameInput.value, list: newList, compute: computeStr }
}

// ---- Smart Naming ----
const generateCrowdName = () => {
  if (!nameAuto.value) return
  const parts = []; const node = nodeList.value[0]
  if (!node) { crowdNameInput.value = '未命名'; return }
  const ch = getArray(node.formData?.channel); if (ch.length > 0) { const chStr = ch.filter(c => c !== '所有销售渠道').slice(0, 2).join('/'); if (chStr) parts.push(chStr) }
  const bhv = getArray(node.formData?.bhv); if (bhv.length > 0) parts.push(bhv.slice(0, 2).join('/'))
  const cate = getArray(node.formData?.cate) || getArray(node.formData?.leafCates); if (cate.length > 0 && !cate.includes('全部')) parts.push(cate.slice(0, 2).join('/'))
  const brand = getArray(node.formData?.stdBrand); if (brand.length > 0) parts.push(brand.slice(0, 1).join(''))
  const timeKey = Object.keys(node.modeData || {}).find(k => node.schema?.find(f => f.key === k && f.Widget_Type === '日期_切换'))
  if (timeKey) { const mode = node.modeData[timeKey]; const td = node.formData[timeKey]; if (mode === 'recent' && td?.days) parts.push(`${td.days}天`); else if (mode === 'range' && td?.dateRange?.length === 2) parts.push(`${td.dateRange[0]}-${td.dateRange[1]}`) }
  const numKey = Object.keys(node.modeData || {}).find(k => node.schema?.find(f => f.key === k && f.Widget_Type === '数值_切换'))
  if (numKey) { const mode = node.modeData[numKey]; const nd = node.formData[numKey]; if (mode === 'min' && nd?.min) parts.push(`≥${nd.min}`); else if (mode === 'range' && nd?.min) parts.push(`${nd.min}-${nd.max || '∞'}`) }
  crowdNameInput.value = nodeList.value.length > 1 ? `${parts.join('_')}_等${nodeList.value.length}组` : parts.join('_')
}

const getNodeSummary = (node) => {
  const items = []
  node.schema.forEach(f => {
    if (!isVisible(f, node)) return
    const k = f.key; const val = node.formData[k]; const mode = node.modeData[k]
    if (val === undefined || val === null || val === '') return
    if (Array.isArray(val) && val.length === 0) return
    let display = ''
    if (f.Widget_Type === '数值_切换') { if (mode === 'unlimited') return; if (mode === 'min' && val.min) display = `≥ ${val.min}`; else if (mode === 'range') display = `${val.min || '?'} — ${val.max || '?'}` }
    else if (f.Widget_Type === '日期_切换') { if (mode === 'recent' && val.days) display = `过去 ${val.days} 天`; else if (mode === 'range' && val.dateRange?.length === 2) display = `${val.dateRange[0]} ~ ${val.dateRange[1]}` }
    else if (Array.isArray(val)) { display = val.slice(0, 6).join('、'); if (val.length > 6) display += ` ...共${val.length}项` }
    else if (typeof val === 'object') display = JSON.stringify(val)
    else display = String(val)
    if (display) items.push({ key: k, label: f.Label, value: display })
  })
  return items
}

const copyJson = async () => { try { await navigator.clipboard.writeText(JSON.stringify(generatedJson.value, null, 4)); ElMessage.success('JSON 已成功复制到剪贴板！') } catch (err) { ElMessage.error('复制失败，请手动选择复制') } }
const goToDataBank = () => { window.open('https://databank.tmall.com/#/userDefinedAnalyses', '_blank') }

// ---- Watchers ----
watch([nodeList, crowdNameInput], ([newNodes]) => {
  generateCrowdName()
  newNodes.forEach(node => {
    if (node.packageType !== '商品行为') return
    const channels = getArray(node.formData.channel); const isTmallGlobal = channels.includes('天猫国际直营'); const isTmall = channels.includes('天猫')
    const currentShop = node.formData.shop
    if (!isTmall && currentShop !== '全淘宝天猫') node.formData.shop = '全淘宝天猫'
    const latestShop = node.formData.shop
    if ((latestShop === '全淘宝天猫' || !latestShop) && !isTmallGlobal) { if (node.formData.selectedGoodsType !== '任意品牌商品') node.formData.selectedGoodsType = '任意品牌商品'; if (node.formData.item && node.formData.item.length > 0) node.formData.item = [] }
  })
  clearTimeout(jsonTimer); jsonTimer = setTimeout(async () => { await buildFinalJson() }, 300)
  debouncedSnapshot()
}, { deep: true })

// ---- Keyboard Shortcuts ----
function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Z') { e.preventDefault(); redo() }
}

onMounted(() => { loadPackages(); takeSnapshot(); window.addEventListener('keydown', handleKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', handleKeydown) })
</script>
