<template>
  <el-config-provider :locale="zhCn">
    <div class="cdp-engine-container">
      
      <div style="position: absolute; top: 15px; left: 20px; z-index: 999; background: white; padding: 5px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <el-radio-group v-model="appMode" size="small">
          <el-radio-button label="normal">🖱️ 可视化点选模式</el-radio-button>
          <el-radio-button label="batch">🚀 Excel 批量模式</el-radio-button>
        </el-radio-group>
      </div>

      <template v-if="appMode === 'normal'">
        <div class="left-panel" style="padding-top: 60px;">
          <div class="panel-header">✨ 行为组件库</div>
          <div class="btn-group">
          <el-button 
            v-for="pkg in availablePackages" 
            :key="pkg"
            type="primary" 
            plain 
            @click="addNode(pkg)"
          >
            ➕ 添加 {{ pkg }}
          </el-button>
        </div>
      </div>

      <div class="center-panel">
        <div class="panel-header">配置画布与逻辑组装</div>
        
        <div v-if="nodeList.length === 0" class="empty-hint">
          请从左侧点击添加行为组件 👉
        </div>

        <div class="canvas-scroll-area">
          <div v-for="(node, index) in nodeList" :key="node.id" class="node-wrapper">
            
            <div v-if="index > 0" class="logic-connector">
              <div class="connector-line"></div>
              <el-radio-group v-model="node.operator" size="small" class="logic-radio">
                <el-radio-button label="n">交集 (n)</el-radio-button>
                <el-radio-button label="u">并集 (u)</el-radio-button>
                <el-radio-button label="d">差集 (d)</el-radio-button>
              </el-radio-group>
              <div class="connector-line"></div>
            </div>

            <el-card shadow="hover" class="behavior-card">
              <template #header>
                <div class="card-header">
                  <span class="card-title">
                    {{ node.packageType }} 
                    <el-tag size="small" type="info">节点 {{ index }}</el-tag>
                  </span>
                  <el-button type="danger" size="small" plain @click="removeNode(index)">移除此行为</el-button>
                </div>
              </template>

              <el-form label-position="right" label-width="140px" class="dynamic-form">
                <template v-for="field in node.schema" :key="field.key">
                  <el-form-item v-show="isVisible(field, node)">
                    
                    <template #label>
                      <span>{{ field.Label }}</span>
                      <template v-if="getDynamicDescription(field)">
                        <el-tooltip v-if="getDynamicStyle(field) !== '文字'" :content="getDynamicDescription(field)" placement="top" effect="dark">
                          <span style="margin-left: 6px; color: #a8abb2; cursor: pointer; font-size: 14px;">ⓘ</span>
                        </el-tooltip>
                      </template>
                    </template>      

                    <template v-if="field.Widget_Type === '普通输入框'">
                      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <el-input v-model="node.formData[field.key]" :placeholder="`请输入${field.Label}`" style="flex: 1;"></el-input>
                        <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                      </div>
                    </template>
                    
                    <template v-else-if="field.Widget_Type === '列表输入'">
                      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <el-select 
                          v-model="node.formData[field.key]" 
                          multiple filterable allow-create default-first-option 
                          :multiple-limit="getListLimit(field, node)"  
                          :placeholder="`输入并回车创建${field.Label}`"
                          @change="handleListInput(field.key, node)"
                          no-data-text="💡 敲击回车或输入逗号自动炸开标签"
                          style="flex: 1;"
                        ></el-select>
                        <span v-if="getSelectionCountHint(field, node)" style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;">
                          {{ getSelectionCountHint(field, node) }}
                        </span>
                        <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">
                          {{ getDynamicDescription(field) }}
                        </span>
                      </div>
                    </template>

                    <template v-else-if="field.Widget_Type === '单选组'">
                      <el-radio-group v-model="node.formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? node.formData.title = [] : null">
                        <el-radio label="任意商品标题关键字">任意商品标题关键字</el-radio>
                        <el-radio label="指定商品标题关键字">指定商品标题关键字</el-radio>
                      </el-radio-group>
                    </template>

                    <template v-else-if="field.Widget_Type === '搜索多选'">
                      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <el-select-v2 
                          v-model="node.formData[field.key]" 
                          :options="formatOptions(field.options)" 
                          multiple filterable clearable :reserve-keyword="false"  
                          :placeholder="`请搜索并选择${field.Label}`" 
                          style="flex: 1;"
                          @change="handleMultiSelectChange(field.key, node)" 
                        ></el-select-v2>
                        <span v-if="getSelectionCountHint(field, node)" style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;">
                          {{ getSelectionCountHint(field, node) }}
                        </span>
                        <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">
                          {{ getDynamicDescription(field) }}
                        </span>
                      </div>
                    </template>

                    <template v-else-if="field.Widget_Type === '搜索单选'">
                      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <el-select-v2 
                          :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${getArray(node.formData.channel).join(',')}-${node.formData.shop}` : field.key"
                          v-model="node.formData[field.key]" 
                          :options="formatOptions(getDynamicOptions(field, node))" 
                          filterable clearable 
                          :placeholder="`请搜索并选择${field.Label}`" 
                          style="flex: 1;"
                        ></el-select-v2>
                        <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">
                          {{ getDynamicDescription(field) }}
                        </span>
                      </div>
                    </template>

                    <template v-else-if="field.Widget_Type === '复选组'">
                      <el-checkbox-group v-model="node.formData[field.key]" class="custom-checkbox-group" @change="handleCheckboxChange(field, $event, node)">
                        <el-checkbox 
                          v-for="opt in field.options" 
                          :key="opt" 
                          :label="opt"
                          :disabled="isCheckboxDisabled(field, opt, node)"
                        >
                          {{ opt }}
                        </el-checkbox>
                      </el-checkbox-group>
                    </template>

                    <template v-else-if="field.Widget_Type === '数值_切换'">
                      <div class="range-switch-container" style="display: flex; align-items: center; gap: 15px;">
                        <el-radio-group v-model="node.modeData[field.key]" size="small" class="mode-switch">
                          <el-radio-button label="unlimited">不限</el-radio-button>
                          <el-radio-button label="min">大于等于</el-radio-button>
                          <el-radio-button label="range">自定义区间</el-radio-button>
                        </el-radio-group>
                        <div class="range-inputs" v-if="node.modeData[field.key] !== 'unlimited'" style="display: flex; align-items: center; gap: 10px;">
                          <el-input-number v-model="node.formData[field.key].min" :min="0" :controls="false" placeholder="最小值" size="small" style="width: 100px;"></el-input-number>
                          <span v-if="node.modeData[field.key] === 'range'" class="separator">-</span>
                          <el-input-number v-if="node.modeData[field.key] === 'range'" v-model="node.formData[field.key].max" :min="0" :controls="false" placeholder="最大值" size="small" style="width: 100px;"></el-input-number>
                        </div>
                      </div>
                    </template>

                    <template v-else-if="field.Widget_Type === '日期_切换'">
                      <div style="display: flex; gap: 15px; align-items: center; width: 100%;">
                        <el-radio-group v-model="node.modeData[field.key]" size="small" style="flex-shrink: 0;">
                          <el-radio-button label="recent">过去 N 天</el-radio-button>
                          <el-radio-button label="range">固定日期</el-radio-button>
                        </el-radio-group>
                        
                        <div v-if="node.modeData[field.key] === 'recent'" style="display: flex; align-items: center; gap: 10px;">
                          <el-input-number v-model="node.formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" style="width: 120px;"></el-input-number>
                          <span style="color: #606266; font-size: 14px; white-space: nowrap;">天</span>
                          <span style="color: #a8abb2; font-size: 12px; margin-left: 8px; white-space: nowrap;">(最多向前追溯 366 天)</span>
                        </div>

                        <div v-if="node.modeData[field.key] === 'range'" style="display: flex; align-items: center; gap: 15px;">
                          <el-date-picker 
                            v-model="node.formData[field.key].dateRange" 
                            type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYYMMDD" 
                            size="small" style="width: 260px;"
                            :disabled-date="(time) => disabledDate(time, node)"
                            @calendar-change="(val) => handleCalendarChange(val, node)"
                          ></el-date-picker>
                          <span style="color: #a8abb2; font-size: 12px; white-space: nowrap;">
                            {{ getExactDateRangeHint(node) }}
                          </span>
                        </div>
                      </div>
                    </template>

                  </el-form-item>
                </template>
              </el-form>
            </el-card>
          </div>
        </div>
      </div>
      <div class="right-panel">
        <div style="padding: 15px; background: #343a46; border-radius: 8px; margin-bottom: 15px; border: 1px solid #454c59;">
           <div style="color: #61afef; margin-bottom: 10px; font-weight: bold; font-size: 14px;">🏷️ 人群包名称</div>
           <el-input v-model="crowdNameInput" placeholder="请输入人群包名称" size="small" clearable></el-input>
        </div>
        <div class="json-header">
          <span>实时计算 JSON (调用原生后端)</span>
          <div style="display: flex; gap: 10px;">
      
            <el-button type="success" size="small" plain @click="copyJson">一键复制</el-button>
            <el-button type="warning" size="small" plain @click="goToDataBank">去圈人 👉</el-button>
          </div>
        </div>
        <pre class="json-code">{{ JSON.stringify(generatedJson, null, 4) }}</pre>
      </div>
      </template>

      <template v-else-if="appMode === 'batch'">
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #f0f2f5;">
          <div style="padding: 80px 40px 20px; background: white; border-bottom: 1px solid #dcdfe6; text-align: center;">
            <h2 style="margin: 0 0 10px; color: #303133;">🚀 Excel 批量圈人引擎 (后端直连版)</h2>
            <p style="color: #909399; font-size: 14px; margin-bottom: 20px;">上传包含【人群包名称】及具体业务参数的 CSV 文件，系统将瞬间将其翻译为底层 JSON</p>
            
            <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 20px;">
               <input 
                 type="file" 
                 accept=".csv,.xlsx" 
                 ref="batchFileRef" 
                 style="display: none" 
                 @change="handleBatchFileUpload"
               >
               <el-button type="primary" :loading="isBatchUploading" @click="triggerBatchUpload">📁 投喂 CSV 给后端解析</el-button>
               <el-button type="success" plain>📥 下载标准模板</el-button>
            </div>

            <div v-if="batchDetectedPkg" style="color: #67c23a; font-weight: bold;">
               ✅ 解析完成！智能识别模板：【{{ batchDetectedPkg }}】，共生成 {{ batchResults.length }} 个人群包。
            </div>
          </div>
          
          <div style="flex: 1; padding: 30px 40px; overflow-y: auto;">
             <div v-if="batchResults.length > 0" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center;">
                <el-popover
                  v-for="(res, idx) in batchResults" 
                  :key="idx"
                  placement="top"
                  :width="400"
                  trigger="hover"
                >
                  <template #reference>
                    <el-button type="primary" plain size="large" @click="copyBatchJson(res)">
                      📦 {{ res.crowdName }}
                    </el-button>
                  </template>
                  <div style="max-height: 300px; overflow-y: auto; background: #282c34; padding: 10px; border-radius: 4px;">
                     <pre style="color: #abb2bf; font-family: Consolas; font-size: 12px; margin: 0;">{{ JSON.stringify(res, null, 2) }}</pre>
                  </div>
                </el-popover>
             </div>
             
             <div v-else style="color: #a8abb2; text-align: center; margin-top: 50px;">
                请先投喂数据文件。
             </div>
          </div>
        </div>
      </template>

    </div>
  </el-config-provider>
</template>

<script setup>

import { ref, watch, onMounted } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

// ==========================================
// 核心状态管理与后端对接
// ==========================================
const appMode = ref('normal') // 🔥 新增：掌控全局的双模式开关 ('normal' | 'batch')

const availablePackages = ref([]) 
const schemaCache = ref({})
const logicMatrixCache = ref({}) 
const nodeList = ref([])
const crowdNameInput = ref('未命名') // 🔥 新增：人群包名称绑定的变量


const loadPackages = async () => {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/packages')
    availablePackages.value = await res.json()
  } catch (e) {
    console.error("加载包名失败", e)
  }
}

const addNode = async (pkgType) => {
  let schema = schemaCache.value[pkgType]
  let logicMatrix = logicMatrixCache.value[pkgType]
  
  if (!schema) {
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/meta/${pkgType}`)
      const resData = await res.json()
      schema = resData.schema || []
      logicMatrix = resData.matrix || {} 
      schemaCache.value[pkgType] = schema
      logicMatrixCache.value[pkgType] = logicMatrix
    } catch (e) {
      console.error("加载配置失败:", e)
      return
    }
  }

  const initData = {}
  const initModeData = {} 

  schema.forEach(field => {
    if (field.Widget_Type === '搜索单选') {
      initData[field.key] = ''
    } else if (['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)) {
      initData[field.key] = []
    } else if (field.Widget_Type === '单选组') {
      initData[field.key] = '任意商品标题关键字' 
    } else if (field.Widget_Type === '数值_切换') {
      initModeData[field.key] = 'unlimited' 
      initData[field.key] = { min: null, max: null }
    } else if (field.Widget_Type === '日期_切换') {
      initModeData[field.key] = 'recent'
      initData[field.key] = { days: 30, dateRange: [] }
    } else {
      initData[field.key] = ''
    }
  })

  // 🎯 兼容单选与多选组件的“全部”初始化
  if (pkgType === 'AIPL状态') {
    if (initData.cate !== undefined) {
      initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
    }
  }
  if (pkgType === '商品行为') {
    if (initData.cate !== undefined) {
      initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
    }
    if (initData.leafCates !== undefined) {
      initData.leafCates = Array.isArray(initData.leafCates) ? ['全部'] : '全部'
    }
  }

  nodeList.value.push({
    id: Date.now() + Math.random(),
    packageType: pkgType,
    schema: schema,
    logicMatrix: logicMatrix, 
    formData: initData,
    modeData: initModeData,   
    operator: nodeList.value.length === 0 ? null : 'n',
    selectedFirstDate: null
  })
}

const removeNode = (index) => {
  nodeList.value.splice(index, 1)
  if (nodeList.value.length > 0) nodeList.value[0].operator = null
}

const getArray = (val) => Array.isArray(val) ? val : (val ? [val] : [])

// ==========================================
// 🔴 你最自豪的可见性判断逻辑 (一字不差的保留)
// ==========================================
const isVisible = (field, node) => {
  if (field.key === 'item' && node.packageType === '商品行为') {
    return node.formData.selectedGoodsType === '指定商品ID';
  }
  
  if ((field.key === 'title_type' || field.key === 'keywords_type') && ['类目公域行为', '商品行为'].includes(node.packageType)) {
    const hasCate = getArray(node.formData.leafCates).length > 0 || getArray(node.formData.cate).length > 0;
    if (!hasCate) return false;
  }

  if ((field.key === 'title' || field.key === 'keywords') && ['类目公域行为', '商品行为'].includes(node.packageType)) {
    const switchVal = node.formData.title_type || node.formData.keywords_type;
    if (switchVal !== '指定商品标题关键字') return false;
  }
  
  if (field.isDefault) return true
  
  const matrixKeys = Object.keys(node.logicMatrix || {})
  if (matrixKeys.length === 0) return false
  
  const is2D = matrixKeys.some(k => k.includes('|'))
  let triggerCombinations = []
  
  if (is2D) {
    const channels = getArray(node.formData['channel'])
    const behaviors = getArray(node.formData['bhv'])
    
    if (channels.length === 0 || behaviors.length === 0) return false 
    
    for (const ch of channels) {
      for (const bhv of behaviors) {
        triggerCombinations.push(`${ch}|${bhv}`)
      }
    }
  } else {
    if (matrixKeys.includes('DEFAULT')) {
      triggerCombinations = ['DEFAULT'];
    } else {
      triggerCombinations = getArray(node.formData['bhv']).length > 0 
                          ? getArray(node.formData['bhv']) 
                          : getArray(node.formData['types'])
    }
    if (triggerCombinations.length === 0) return false
  }
  
  for (const comboKey of triggerCombinations) {
    const visibleFields = (node.logicMatrix || {})[comboKey] || []
    if (!visibleFields.includes(field.key)) {
      return false 
    }
  }
  return true
}

// ==========================================
// 🔴 复选框防呆与控制 (原样保留)
// ==========================================
const isCheckboxDisabled = (field, opt, node) => {
  if (field.key === 'channel') {
    const selectedVals = node.formData[field.key] || [];
    if (selectedVals.includes('所有销售渠道')) {
      return opt !== '所有销售渠道';
    }
  }
  return false;
}

const handleCheckboxChange = (field, currentVals, node) => {
  if (field.key === 'channel') {
    if (currentVals.includes('所有销售渠道')) {
      if (currentVals.length > 1) {
        node.formData[field.key] = ['所有销售渠道'];
      }
    }
  }
}

// ==========================================
// 其他辅助拦截器
// ==========================================
const getDynamicStyle = (field) => field.Description_Style;
const getDynamicDescription = (field) => field.Widget_Type === '日期_切换' ? "" : field.Description;

const getSelectionCountHint = (field, node) => {
  if (['搜索多选', '列表输入', '复选组'].includes(field.Widget_Type)) {
    if (['channel', 'bhv'].includes(field.key)) return null;
    const vals = node.formData[field.key];
    if (Array.isArray(vals) && vals.length > 0) {
      if (field.Widget_Type === '列表输入') {
        if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
          if (node.packageType === '类目公域行为') return `已输入 ${vals.length}/10`;
          if (node.packageType === '商品行为') return `已输入 ${vals.length}/5`;
        }
        if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
          if (node.packageType === '商品行为') return `已输入 ${vals.length}/50`;
        }
        return `已输入 ${vals.length} 个`;
      }
      const isLimited = ['leafCates', 'stdBrand', 'cate'].includes(field.key) || field.Label.includes('类目') || field.Label.includes('品牌');
      return isLimited ? `已选 ${vals.length}/10` : `已选 ${vals.length}`;
    }
  }
  return null; 
}

const getListLimit = (field, node) => {
  if (field.Widget_Type === '列表输入') {
    if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
      if (node.packageType === '类目公域行为') return 10;
      if (node.packageType === '商品行为') return 5;
    }
    if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
      if (node.packageType === '商品行为') return 50;
    }
  }
  return 0; 
}

const handleListInput = (key, node) => {
  const currentVal = node.formData[key];
  if (Array.isArray(currentVal)) {
    const finalArr = [];
    currentVal.forEach(item => {
      if (item.includes(',')) finalArr.push(...item.split(',').filter(i => i.trim() !== ''));
      else finalArr.push(item);
    });
    node.formData[key] = [...new Set(finalArr)];
  }
}

const handleMultiSelectChange = (key, node) => {
  const vals = node.formData[key];
  if (Array.isArray(vals) && vals.length > 1 && vals.includes('全部')) {
    if (vals[vals.length - 1] === '全部') node.formData[key] = ['全部'];
    else node.formData[key] = vals.filter(v => v !== '全部');
  }
};

const formatOptions = (options) => {
  if (!options) return []
  if (options.length > 0 && typeof options[0] === 'object') return options
  return options.map(opt => ({ value: opt, label: String(opt) }))
}

// ==========================================
// 🔥 原汁原味加装：天猫国际直营白名单逻辑
// ==========================================
const getDynamicOptions = (field, node) => {
  if (node.packageType !== '商品行为') return field.options || [];

  const channels = getArray(node.formData.channel);

  // 1. 账号 (shop) 的严防死守
  if (field.key === 'shop') {
    const isTmall = channels.includes('天猫');
    if (!isTmall) return ['全淘宝天猫']; 
    return field.options || [];
  }

  // 2. 商品类型 (selectedGoodsType) 的国际直营白名单开口！
  if (field.key === 'selectedGoodsType') {
    const isTmallGlobal = channels.includes('天猫国际直营');
    // 如果账号是全淘宝天猫，且渠道【不是】天猫国际直营，才被强行锁死！
    if ((node.formData.shop === '全淘宝天猫' || !node.formData.shop) && !isTmallGlobal) {
      return ['任意品牌商品']; 
    } else {
      return field.options || []; 
    }
  }
  
  return field.options || [];
}

// ==========================================
// 🔴 日期底线拦截
// ==========================================
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getExactDateRangeHint = (node) => {
  const behaviors = getArray(node.formData.bhv)
  const isCategoryPackage = node.packageType === '类目公域行为';
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1;
  const isTwoYears = isCategoryPackage && isOnlyPurchase;
  
  const today = new Date();
  const minDate = new Date();
  if (isTwoYears) minDate.setFullYear(minDate.getFullYear() - 2); 
  else minDate.setDate(minDate.getDate() - 366); 
  
  return `可选范围：${formatDate(minDate)} 至 ${formatDate(today)} (最大跨度366天)`;
};

const handleCalendarChange = (val, node) => {
  if (val && val.length === 2 && val[0] && !val[1]) {
    let dateObj = val[0];
    if (typeof dateObj === 'string' && dateObj.length === 8 && !dateObj.includes('-')) {
      const y = dateObj.substring(0,4), m = dateObj.substring(4,6), d = dateObj.substring(6,8);
      dateObj = new Date(`${y}-${m}-${d}`);
    } else if (typeof dateObj === 'string') {
      dateObj = new Date(dateObj);
    }
    node.selectedFirstDate = dateObj;
  } else {
    node.selectedFirstDate = null;
  }
}

const disabledDate = (time, node) => {
  const behaviors = getArray(node.formData.bhv)
  const isCategoryPackage = node.packageType === '类目公域行为';
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1;
  const isTwoYears = isCategoryPackage && isOnlyPurchase;

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const minDate = new Date()
  
  if (isTwoYears) minDate.setFullYear(minDate.getFullYear() - 2) 
  else minDate.setDate(minDate.getDate() - 366) 
  minDate.setHours(0, 0, 0, 0)

  if (time.getTime() > today.getTime() || time.getTime() < minDate.getTime()) return true
  if (node.selectedFirstDate) {
    const oneDay = 24 * 3600 * 1000
    const diffDays = Math.abs((time.getTime() - node.selectedFirstDate.getTime()) / oneDay)
    if (diffDays > 366) return true
  }
  return false
}

// ==========================================
// 🚀 调用后端引擎与防抖拼装逻辑 (加上暗网哨兵)
// ==========================================

const generatedJson = ref({ crowdName: "未命名", list: [], compute: "" })
let jsonTimer = null

// 🔥 升级：同时监听节点数组和输入框！使用解构 [newNodes] 取出节点数组
watch([nodeList, crowdNameInput], ([newNodes]) => {
  // 🔥 核心复刻：暗网哨兵，实时监控并清理不合法的账号与商品ID！
  newNodes.forEach(node => {

    if (node.packageType !== '商品行为') return;
    
    const channels = getArray(node.formData.channel);
    const isTmallGlobal = channels.includes('天猫国际直营');
    const isTmall = channels.includes('天猫');
    const currentShop = node.formData.shop;
    
    // 拦截 1: 只要渠道不是天猫，且账号不是全淘宝天猫，强制重置账号
    if (!isTmall && currentShop !== '全淘宝天猫') {
      node.formData.shop = '全淘宝天猫';
    }
    
    const latestShop = node.formData.shop;
    
    // 拦截 2: 如果是全淘宝天猫，且【不是】天猫国际直营，强制锁死商品类型并清空ID
    if ((latestShop === '全淘宝天猫' || !latestShop) && !isTmallGlobal) {
      if (node.formData.selectedGoodsType !== '任意品牌商品') {
        node.formData.selectedGoodsType = '任意品牌商品';
      }
      if (node.formData.item && node.formData.item.length > 0) {
        node.formData.item = [];
      }
    }
  });

  // 触发 JSON 生成
  clearTimeout(jsonTimer)
  jsonTimer = setTimeout(async () => {
    await buildFinalJson()
  }, 300)
}, { deep: true })

const buildFinalJson = async () => {
  if (nodeList.value.length === 0) {
    generatedJson.value = { crowdName: "未命名", list: [], compute: "" }
    return
  }
  
  const newList = []
  let computeStr = "(0)"
  
  for (let i = 0; i < nodeList.value.length; i++) {
    const node = nodeList.value[i]
    const payload = { _package: node.packageType }
    
    node.schema.forEach(f => {
      if (!isVisible(f, node)) return
      
      let k = f.key
      if (['搜索多选', '复选组', '多选下拉', '下拉多选', '列表输入'].includes(f.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand', 'cate', 'title', 'keywords'].includes(k)) {
        if (node.formData[k] && node.formData[k].length > 0) payload[k] = node.formData[k]
      } else if (f.Widget_Type === '数值_切换') {
        const mode = node.modeData[k]
        if (mode === 'unlimited') payload[k] = { min: "", max: "" }
        else if (mode === 'min') payload[k] = { min: node.formData[k].min, max: "" }
        else if (mode === 'range') payload[k] = { min: node.formData[k].min, max: node.formData[k].max }
      } else if (f.Widget_Type === '日期_切换') {
        const mode = node.modeData[k]
        if (mode === 'recent') {
          payload[k] = { val: { days: node.formData[k].days }, min: "recent" }
        } else {
          const range = node.formData[k].dateRange
          if (range && range.length === 2) {
            payload[k] = { val: { start: range[0], end: range[1] }, min: "range" }
          }
        }
      } else {
        if (node.formData[k] !== undefined && node.formData[k] !== '') {
          payload[k] = node.formData[k]
        }
      }
    })
    
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const nodeJson = await res.json()
      
      if (nodeJson && nodeJson.list && nodeJson.list.length > 0) {
        const baseTmpl = nodeJson.list[0]
        baseTmpl.fromPoolId = i
        if (i > 0) {
          baseTmpl.op = "INIT"
          computeStr += `${node.operator}(${i})`
        }
        newList.push(baseTmpl)
      }
    } catch (e) {
      console.error('JSON 引擎翻译失败，请检查后端是否开启', e)
    }
  }
  
  generatedJson.value = {
    crowdName: crowdNameInput.value, // 🔥 替换为：用户输入的名字
    list: newList,
    compute: computeStr
  }
}

onMounted(() => {  

  loadPackages()
})

// 🔥 引入 Element Plus 的消息提示弹窗


// ==========================================
// 🚀 实用工具：一键复制与外链跳转
// ==========================================
const copyJson = async () => {
  try {
    const jsonString = JSON.stringify(generatedJson.value, null, 4)
    await navigator.clipboard.writeText(jsonString)
    ElMessage.success('JSON 已成功复制到剪贴板！')
  } catch (err) {
    ElMessage.error('复制失败，请手动选择复制')
    console.error('复制失败:', err)
  }
}

const goToDataBank = () => {
  // 🔥 这里的跳转链接请替换为你真实的生产环境/测试环境数据银行地址
  window.open('https://databank.tmall.com/#/userDefinedAnalyses', '_blank')
}
import { ElMessage, ElLoading } from 'element-plus'

// ==========================================
// 🚀 Excel 批量模式控制面板 (极简传文件版)
// ==========================================
const batchFileRef = ref(null)
const batchResults = ref([])
const batchDetectedPkg = ref('')
const isBatchUploading = ref(false)

const triggerBatchUpload = () => {
  if (batchFileRef.value) batchFileRef.value.click()
}

const handleBatchFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  isBatchUploading.value = true
  const formData = new FormData()
  formData.append('file', file)

  const loading = ElLoading.service({
    lock: true,
    text: '正在将文件交由后端 Python 引擎进行降维解析...',
    background: 'rgba(0, 0, 0, 0.7)',
  })

  try {
    const res = await fetch(`http://127.0.0.1:5000/api/batch_generate`, {
      method: 'POST',
      body: formData // 直接把文件拍脸丢过去
    })
    
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || '解析失败')
    }

    const data = await res.json()
    batchResults.value = data.results || []
    batchDetectedPkg.value = data.detected_pkg || '未知包'
    
    batchFileRef.value.value = null // 清除选中状态
    ElMessage.success(`🎉 批量生成完毕！快去点击按钮复制吧！`)

  } catch (error) {
    console.error(error)
    ElMessage.error(`后端解析异常: ${error.message}`)
  } finally {
    loading.close()
    isBatchUploading.value = false
  }
}

const copyBatchJson = async (resObj) => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(resObj, null, 4))
    ElMessage.success(`✅ 已复制人群包 [${resObj.crowdName}] 的代码！`)
  } catch (err) {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped>
.cdp-engine-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f5f7fa;
  overflow: hidden;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

.panel-header {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 20px;
  border-bottom: 2px solid #ebeef5;
  padding-bottom: 10px;
}

/* 🟢 左侧面板 */
.left-panel {
  width: 250px;
  background: #ffffff;
  padding: 20px;
  box-shadow: 2px 0 8px rgba(0,0,0,0.05);
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
}
.btn-group .el-button {
  margin-left: 0;
}

/* 🔵 中间面板 */
.center-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 30px;
  overflow: hidden;
}

.canvas-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding-right: 10px;
}

.empty-hint {
  text-align: center;
  color: #909399;
  font-size: 16px;
  margin-top: 100px;
}

.node-wrapper {
  margin-bottom: 20px;
  animation: fadeIn 0.3s ease-in-out;
}

.behavior-card {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  background: white;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-weight: bold;
  font-size: 15px;
  color: #409eff;
  display: flex;
  align-items: center;
  gap: 10px;
}

.dynamic-form {
  padding-top: 15px;
}

/* 🔥 交并差连接器样式 */
.logic-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: -5px 0 15px 0;
}
.connector-line {
  width: 2px;
  height: 20px;
  background-color: #dcdfe6;
}
.logic-radio {
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
  border-radius: 4px;
}

/* 🟣 右侧面板 */
.right-panel {
  width: 450px;
  background: #282c34;
  padding: 20px;
  box-shadow: -2px 0 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}

.json-header {
  padding-bottom: 10px;
  border-bottom: 1px solid #181a1f;
  margin-bottom: 15px;
  color: #61afef;
  font-weight: bold;
  display: flex; /* 新增 Flex 布局 */
  justify-content: space-between; /* 两端对齐 */
  align-items: center; /* 垂直居中 */
}

.json-code {
  flex: 1;
  color: #abb2bf;
  font-family: 'Fira Code', Consolas, Monaco, monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: #21252b;
  padding: 15px;
  border-radius: 6px;
  border: 1px solid #181a1f;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>