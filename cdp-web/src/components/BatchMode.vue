<template>
  <div class="batch-workspace">
    <div class="batch-header">
      <div class="action-area" style="margin-left: auto;">
        <el-button class="intercom-btn-accent" @click="fetchTemplates">
          <el-icon><Download /></el-icon> 获取标准模板
        </el-button>
      </div>
    </div>

    <div class="pipeline-scroll-area" :class="{'is-centered': pipeline.length === 1}">
      <template v-for="(item, index) in pipeline" :key="item.id">
        <div class="intercom-card template-card">
          <div class="card-header">
            <span class="display-body strong">条件模版 {{ index + 1 }}</span>
            <el-button v-if="pipeline.length > 1" class="intercom-btn-outlined btn-small" @click="removePipelineItem(index)">
              <el-icon><Delete/></el-icon>
            </el-button>
          </div>
          <div class="card-upload-area">
            <el-button class="intercom-btn-warm upload-btn" @click="triggerPipelineUpload(index)" :loading="item.loading">
              {{ item.fileName || '📁 点击投喂 CSV 数据' }}
            </el-button>
            <transition name="el-fade-in">
              <div v-if="item.results.length > 0 || (item.batchErrors && item.batchErrors.length > 0)" class="upload-result-area">
                <div v-if="item.results.length > 0" class="upload-success-text display-mono">
                  <el-icon><CircleCheckFilled /></el-icon> 成功挂载 {{ item.results.length }} 行
                </div>
                <div v-if="item.batchErrors && item.batchErrors.length > 0" class="upload-error-text display-mono">
                  ⚠️ {{ item.batchErrors.length }} 行处理失败
                </div>
                <div v-if="item.elapsed" class="display-body-light" style="margin-top:4px">⏱️ 耗时 {{ item.elapsed }}s</div>
              </div>
            </transition>
          </div>
          <div class="card-list-area">
            <div v-for="(res, rIdx) in item.results" :key="rIdx" class="intercom-list-item" @click="handleItemClick(res, index, rIdx, false)" title="点击自动复制 JSON 并打开编辑面板">
              <span class="display-mono item-index">[{{ rIdx + 1 }}]</span>
              <span class="display-body item-name">{{ res.crowdName }}</span>
            </div>
            <div v-if="item.results.length === 0" class="empty-state">
              <div class="empty-icon">📦</div>
              <span class="display-body-light">等待投喂该节点数据...</span>
            </div>
          </div>
        </div>

        <div v-if="index < pipeline.length - 1" class="connector operator-connector">
          <div class="solid-line"></div>
          <el-select v-model="item.operator" class="operator-select intercom-input">
            <el-option label="交集" value="n"></el-option>
            <el-option label="并集" value="u"></el-option>
            <el-option label="差集" value="d"></el-option>
          </el-select>
          <div class="solid-line"></div>
        </div>
      </template>

      <div class="connector plus-connector">
        <div class="solid-line"></div>
        <el-button class="intercom-btn-primary plus-btn" @click="addPipelineItem">
          <el-icon><Plus /></el-icon>
        </el-button>
        <div v-if="pipeline.length > 1" class="solid-line"></div>
      </div>

      <transition name="fade-slide">
        <div v-if="pipeline.length > 1" class="intercom-card final-card">
          <div class="card-header final-header">
            <span class="display-body strong final-title">
              📊 最终拼装人群包 <span class="display-mono ml-8">({{ batchResults.length }} 个)</span>
            </span>
          </div>
          <div class="final-name-area">
            <div class="name-label display-mono">
              <el-icon><EditPen /></el-icon> Excel 批量命名区：
            </div>
            <el-input type="textarea" v-model="customNamesStr" :rows="2" placeholder="粘贴 Excel 人群包名称，每行一个" class="intercom-input"></el-input>
          </div>
          <div class="card-list-area final-list-area">
            <div v-if="batchResults.length === 0" class="empty-state">
              <el-icon class="large-icon"><Cpu /></el-icon>
              <span class="display-body-light">全栈矩阵拼装中...<br/>请确保左侧模版已完成投喂</span>
            </div>
            <div v-for="(res, idx) in batchResults" :key="idx" class="intercom-list-item final-list-item" @click="handleItemClick(res, -1, idx, true)" title="点击自动复制完整 JSON">
              <span class="final-badge display-mono">{{ idx + 1 }}</span>
              <span class="display-body item-name">{{ res.crowdName }}</span>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <input type="file" accept=".csv,.xlsx" ref="batchFileRef" style="display: none" @change="handlePipelineFileUpload">

    <!-- 模板下载对话框 -->
    <el-dialog v-model="showTemplateDialog" title="📥 下载 CDP 标准模板" width="880px" center class="intercom-dialog">
      <div class="dialog-content-area">
        <div class="dialog-header-area">
          <el-checkbox v-model="checkAll" :indeterminate="isIndeterminate" @change="handleCheckAllChange">
            <span class="display-body strong">全选所有模板</span>
          </el-checkbox>
          <span class="display-mono badge-mono">已选择 {{ selectedTemplates.length }} 个模板</span>
        </div>
        <div class="dialog-scroll-area">
          <el-checkbox-group v-model="selectedTemplates" @change="handleCheckedTemplatesChange">
            <div class="grid-2-cols">
              <div v-for="name in templateList" :key="name" class="intercom-list-item" :class="{ 'is-selected': selectedTemplates.includes(name) }">
                <el-checkbox :label="name"><span class="display-body">📄 {{ name }}</span></el-checkbox>
              </div>
            </div>
          </el-checkbox-group>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer-area">
          <el-button class="intercom-btn-outlined" @click="showTemplateDialog = false">取 消</el-button>
          <el-button class="intercom-btn-primary" :disabled="selectedTemplates.length === 0" @click="handleBatchDownload">确认选择并下载 ({{ selectedTemplates.length }})</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 编辑抽屉 -->
    <el-drawer v-model="drawerVisible" :title="drawerIsFinal ? '🔍 查看融合产物底层源码' : '⚙️ 配置参数 (预设参数 + 完美回显)'" size="480px" :destroy-on-close="true" class="intercom-drawer">
      <div class="drawer-container">
        <div class="drawer-notice intercom-card">
          <span v-if="drawerIsFinal" class="display-body"><strong class="display-mono">🔒 只读模式:</strong> 这是多个节点融合的最终计算结果。如需修改，请点击左侧对应卡片调整源头参数。</span>
          <span v-else class="display-body"><strong class="display-mono">💡 1:1 完美回显:</strong> 已为您加载与「点选模式」完全相同的配置画布，并绑定了您的预设参数。修改后将自动重新生成底层参数。</span>
        </div>

        <div class="drawer-scroll" v-if="visualEditForm && visualEditForm.schema && !drawerIsFinal">
          <div class="mb-16">
            <div class="display-mono mb-8">人群包自定义名称：</div>
            <el-input v-model="visualEditForm.crowdName" class="intercom-input"></el-input>
          </div>
          <div class="intercom-card drawer-form-card">
            <div class="display-feature-title drawer-form-title">
              ✨ 业务组件：{{ visualEditForm.packageType }}
            </div>
            <DynamicForm :node="visualEditForm" />
          </div>
        </div>

        <div class="drawer-scroll" v-else-if="visualEditForm && visualEditForm.isMerged">
          <div class="json-tabs" style="margin-bottom:14px">
            <span class="json-tab" :class="{ active: drawerJsonMode === 'summary' }" @click="drawerJsonMode = 'summary'">📋 摘要</span>
            <span class="json-tab" :class="{ active: drawerJsonMode === 'json' }" @click="drawerJsonMode = 'json'">JSON</span>
          </div>
          <div v-if="drawerJsonMode === 'summary'" class="json-summary">
            <div class="summary-node">
              <div class="summary-node-head">
                <span class="display-body strong">🔍 {{ visualEditForm.crowdName || '融合产物' }}</span>
              </div>
              <div class="summary-rows">
                <div class="summary-row"><span class="summary-label">包含节点</span><span class="summary-val">{{ visualEditForm.rawList?.length || 0 }} 个</span></div>
                <div v-for="(item, i) in (visualEditForm.rawList || [])" :key="i" class="summary-row"><span class="summary-label">节点 {{ i }}</span><span class="summary-val">fromPoolId={{ item.fromPoolId }}, op={{ item.op || 'INIT' }}</span></div>
              </div>
            </div>
          </div>
          <el-input v-else type="textarea" :rows="22" :value="JSON.stringify(visualEditForm.rawList, null, 2)" readonly class="intercom-input display-mono"></el-input>
        </div>

        <div v-else class="empty-state">
          <div class="empty-icon">⏳</div><div class="display-body-light">正在装载组件引擎，反向还原画布结构...</div>
        </div>

        <div class="drawer-footer-area">
          <el-button class="intercom-btn-outlined" @click="drawerVisible = false">关 闭</el-button>
          <el-button class="intercom-btn-primary" v-if="!drawerIsFinal" @click="saveVisualEditor">💾 保存并重组节点</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, CircleCheckFilled, EditPen, Cpu, Download, Delete } from '@element-plus/icons-vue'
import DynamicForm from './DynamicForm.vue'
import { useCdpShared } from '../composables/useCdpShared'

const { schemaCache, logicMatrixCache, isVisible } = useCdpShared()

// ---- State ----
const drawerJsonMode = ref('summary')
const templateList = ref([])
const batchFileRef = ref(null)
const batchResults = ref([])
const showTemplateDialog = ref(false)
const selectedTemplates = ref([])
const checkAll = ref(false)
const isIndeterminate = ref(false)
const pipeline = ref([{ id: Date.now(), results: [], fileName: '', operator: 'n', loading: false, batchErrors: [], elapsed: null }])
const activePipelineIndex = ref(null)
const customNamesStr = ref('')
const drawerVisible = ref(false)
const drawerIsFinal = ref(false)
const currentEditContext = ref(null)
const visualEditForm = ref(null)
let autoCalcTimer = null

// ---- Pipeline ----
const addPipelineItem = () => { pipeline.value.push({ id: Date.now(), results: [], fileName: '', operator: 'n', loading: false, batchErrors: [], elapsed: null }) }
const removePipelineItem = (index) => { pipeline.value.splice(index, 1) }
const triggerPipelineUpload = (index) => { activePipelineIndex.value = index; if (batchFileRef.value) batchFileRef.value.click() }

const handlePipelineFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file || activePipelineIndex.value === null) return
  const item = pipeline.value[activePipelineIndex.value]
  item.loading = true; item.fileName = file.name; item.batchErrors = []; item.elapsed = null
  const startTime = Date.now()
  const formData = new FormData(); formData.append('file', file)
  try {
    const res = await fetch('/api/batch_generate', { method: 'POST', body: formData })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || '解析失败') }
    const data = await res.json()
    item.results = data.results || []; item.batchErrors = data.errors || []
    item.elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const total = item.results.length + (item.batchErrors?.length || 0)
    if (item.batchErrors?.length > 0) ElMessage.warning(`模版 ${activePipelineIndex.value + 1}: 成功 ${item.results.length}/${total} 行，失败 ${item.batchErrors.length} 行`)
    else ElMessage.success(`模版 ${activePipelineIndex.value + 1}: 全部 ${item.results.length} 行处理成功！`)
  } catch (error) { ElMessage.error(`投喂失败: ${error.message}`); item.fileName = '' }
  finally { item.loading = false; if (batchFileRef.value) batchFileRef.value.value = '' }
}

// ---- Matrix ----
const generateBatchMatrix = () => {
  const maxRows = Math.max(...pipeline.value.map(p => p.results.length))
  if (maxRows === 0) { batchResults.value = []; return }
  const customNamesArr = customNamesStr.value.split('\n').map(s => s.trim())
  const assemblingResults = []
  for (let r = 0; r < maxRows; r++) {
    const validNodesWithOps = []
    pipeline.value.forEach((pipeNode) => {
      const rowData = pipeNode.results[r]
      if (!rowData || !rowData.list || !rowData.list[0]) return
      const baseNode = JSON.parse(JSON.stringify(rowData.list[0]))
      if (baseNode.selectionLv3 && Object.keys(baseNode.selectionLv3).length === 0) return
      validNodesWithOps.push({ node: baseNode, operatorAfter: pipeNode.operator, sourceName: rowData.crowdName })
    })
    if (validNodesWithOps.length > 0) {
      const currentLineNodes = []; let computeStr = "(0)"
      const finalName = customNamesArr[r] || (validNodesWithOps[0].sourceName + (validNodesWithOps.length > 1 ? '_矩阵融合' : ''))
      validNodesWithOps.forEach((item, index) => {
        const node = item.node; node.fromPoolId = index
        if (index > 0) node.op = "INIT"
        currentLineNodes.push(node)
        if (index < validNodesWithOps.length - 1) computeStr += `${item.operatorAfter}(${index + 1})`
      })
      assemblingResults.push({ crowdName: finalName, list: currentLineNodes, compute: computeStr })
    }
  }
  batchResults.value = assemblingResults
}

// ---- Templates Dialog ----
const fetchTemplates = async () => {
  try { const res = await fetch('/api/list_templates'); templateList.value = await res.json(); if (templateList.value.length === 0) ElMessage.warning('未在模板目录下找到任何文件'); else showTemplateDialog.value = true }
  catch (e) { ElMessage.error("获取模板列表失败，请检查 Python 后端") }
}
const handleCheckAllChange = (val) => { selectedTemplates.value = val ? [...templateList.value] : []; isIndeterminate.value = false }
const handleCheckedTemplatesChange = (value) => { const checkedCount = value.length; checkAll.value = checkedCount === templateList.value.length; isIndeterminate.value = checkedCount > 0 && checkedCount < templateList.value.length }
const handleBatchDownload = async () => {
  if (selectedTemplates.value.length === 0) return
  ElMessage.success(`正在为您顺序触发 ${selectedTemplates.value.length} 个模板的下载...`)
  selectedTemplates.value.forEach((filename, index) => {
    setTimeout(() => {
      const link = document.createElement('a'); link.style.display = 'none'; link.href = `/api/download_template/${filename}`; link.setAttribute('download', filename)
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
    }, index * 500)
  })
  setTimeout(() => { showTemplateDialog.value = false; selectedTemplates.value = []; checkAll.value = false; isIndeterminate.value = false }, selectedTemplates.value.length * 500 + 500)
}

// ---- Drawer ----
const handleItemClick = async (res, pIdx, rIdx, isFinal) => {
  try { await navigator.clipboard.writeText(JSON.stringify(isFinal ? res : { crowdName: res.crowdName, list: res.list, compute: res.compute || "(0)" }, null, 2)); ElMessage({ message: '✨ 底层 JSON 已自动提取并复制至剪贴板', type: 'success', duration: 2500, offset: 60 }) }
  catch (err) { console.warn('浏览器不支持自动复制', err) }
  openEditDrawer(res, pIdx, rIdx, isFinal)
}

const openEditDrawer = async (nodeData, pIdx, rIdx, isFinal = false) => {
  drawerIsFinal.value = isFinal; currentEditContext.value = { pIdx, rIdx }
  if (isFinal || !nodeData.pkgName) { visualEditForm.value = { isMerged: true, rawList: nodeData.list, crowdName: nodeData.crowdName }; drawerVisible.value = true; return }
  visualEditForm.value = null; drawerVisible.value = true
  try {
    let schemaObj = {}; let matrixObj = {}
    if (schemaCache.value[nodeData.pkgName]) { schemaObj = schemaCache.value[nodeData.pkgName]; matrixObj = logicMatrixCache.value[nodeData.pkgName] }
    else {
      const res = await fetch(`/api/package_meta?name=${nodeData.pkgName}`); if (!res.ok) throw new Error("404")
      const data = await res.json(); schemaObj = data.schema; matrixObj = data.matrix
      schemaCache.value[nodeData.pkgName] = schemaObj; logicMatrixCache.value[nodeData.pkgName] = matrixObj
    }
    const mappedParams = JSON.parse(JSON.stringify(nodeData.localParams || {}))
    const formData = {}; const modeData = {}
    schemaObj.forEach(field => {
      const k = field.key; const rawVal = mappedParams[k]
      if (field.Widget_Type === '数值_切换') { if (!rawVal || (rawVal.min === "" && rawVal.max === "")) { modeData[k] = 'unlimited'; formData[k] = { min: null, max: null } } else if (rawVal.max === "" || rawVal.max === null) { modeData[k] = 'min'; formData[k] = { min: rawVal.min, max: null } } else { modeData[k] = 'range'; formData[k] = { min: rawVal.min, max: rawVal.max } } }
      else if (field.Widget_Type === '日期_切换') { if (rawVal && rawVal.min === 'recent') { modeData[k] = 'recent'; formData[k] = { days: rawVal.val.days, dateRange: [] } } else if (rawVal && rawVal.min === 'range') { modeData[k] = 'range'; formData[k] = { days: 30, dateRange: [rawVal.val.start, rawVal.val.end] } } else { modeData[k] = 'recent'; formData[k] = { days: 30, dateRange: [] } } }
      else { if (rawVal !== undefined) formData[k] = rawVal; else { if (field.Widget_Type === '搜索单选') formData[k] = ''; else if (['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(k)) formData[k] = []; else if (field.Widget_Type === '单选组') formData[k] = '任意商品标题关键字'; else formData[k] = '' } }
    })
    visualEditForm.value = { packageType: nodeData.pkgName, schema: schemaObj, logicMatrix: matrixObj, formData, modeData, crowdName: nodeData.crowdName, rawList: nodeData.list, isMerged: false, selectedFirstDate: null }
  } catch (err) { ElMessage.error("组件加载失败，请检查网络或后端引擎配置！") }
}

const saveVisualEditor = async () => {
  try {
    const payload = {}
    visualEditForm.value.schema.forEach(f => {
      if (!isVisible(f, visualEditForm.value)) return
      const k = f.key
      if (['搜索多选', '复选组', '多选下拉', '下拉多选', '列表输入'].includes(f.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand', 'cate', 'title', 'keywords'].includes(k)) { if (visualEditForm.value.formData[k] && visualEditForm.value.formData[k].length > 0) payload[k] = visualEditForm.value.formData[k] }
      else if (f.Widget_Type === '数值_切换') { const mode = visualEditForm.value.modeData[k]; if (mode === 'unlimited') payload[k] = { min: "", max: "" }; else if (mode === 'min') payload[k] = { min: visualEditForm.value.formData[k].min, max: "" }; else if (mode === 'range') payload[k] = { min: visualEditForm.value.formData[k].min, max: visualEditForm.value.formData[k].max } }
      else if (f.Widget_Type === '日期_切换') { const mode = visualEditForm.value.modeData[k]; if (mode === 'recent') payload[k] = { val: { days: visualEditForm.value.formData[k].days }, min: "recent" }; else { const range = visualEditForm.value.formData[k].dateRange; if (range && range.length === 2) payload[k] = { val: { start: range[0], end: range[1] }, min: "range" } } }
      else { if (visualEditForm.value.formData[k] !== undefined && visualEditForm.value.formData[k] !== '') payload[k] = visualEditForm.value.formData[k] }
    })
    const res = await fetch('/api/generate_json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pkgName: visualEditForm.value.packageType, params: payload }) })
    const data = await res.json(); if (data.error) throw new Error(data.error)
    const { pIdx, rIdx } = currentEditContext.value
    pipeline.value[pIdx].results[rIdx].list = data.list; pipeline.value[pIdx].results[rIdx].crowdName = visualEditForm.value.crowdName; pipeline.value[pIdx].results[rIdx].localParams = payload
    ElMessage.success('💾 参数修改成功！流水线产物已重组完毕。'); drawerVisible.value = false
  } catch (e) { ElMessage.error(`重构节点失败: ${e.message}`) }
}

// ---- Watcher ----
watch([pipeline, customNamesStr], () => { clearTimeout(autoCalcTimer); autoCalcTimer = setTimeout(() => { generateBatchMatrix() }, 300) }, { deep: true })
</script>
