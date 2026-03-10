<template>
  <div class="container">
    <div class="left-panel">
      <div class="header-control" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #ebeef5;">
        <div style="display: flex; align-items: center;">
          <h2 style="margin:0 15px 0 0;">✨ 条件配置引擎</h2>
          <el-select 
            v-model="currentPackage" 
            @change="handlePackageChange" 
            style="width: 200px" 
            placeholder="请选择行为包"
          >
            <el-option v-for="pkg in availablePackages" :key="pkg" :label="pkg" :value="pkg" />
          </el-select>
        </div>
        <el-button type="success" plain @click="goToDataBank">🌐 跳转数据引擎 ↗</el-button>
      </div>

      <el-form label-width="120px" class="dynamic-form" v-if="schema.length > 0">
        <template v-for="field in schema" :key="field.key">
          <el-form-item :label="field.Label" v-show="isVisible(field)">
            
            <template v-if="field.Widget_Type === '普通输入框'">
              <el-input v-model="formData[field.key]" :placeholder="`请输入${field.Label}`"></el-input>
            </template>
            
            <template v-else-if="field.Widget_Type === '列表输入'">
              <el-select v-model="formData[field.key]" multiple filterable allow-create default-first-option :placeholder="`输入并回车创建${field.Label}`"></el-select>
            </template>
            
            <template v-else-if="field.Widget_Type === '搜索多选'">
              <el-select-v2 v-model="formData[field.key]" :options="formatOptions(field.options)" multiple filterable clearable collapse-tags :placeholder="`请搜索并选择${field.Label}`" style="width: 100%"></el-select-v2>
            </template>

            <template v-else-if="field.Widget_Type === '复选组'">
              <el-checkbox-group v-model="formData[field.key]" class="custom-checkbox-group">
                <el-checkbox v-for="opt in field.options" :key="opt" :label="opt">{{ opt }}</el-checkbox>
              </el-checkbox-group>
            </template>
            
            <template v-else-if="field.Widget_Type === '数值_切换'">
              <div class="range-switch-container">
                <el-radio-group v-model="modeData[field.key]" size="small" class="mode-switch">
                  <el-radio-button label="unlimited">不限</el-radio-button>
                  <el-radio-button label="min">大于等于</el-radio-button>
                  <el-radio-button label="range">自定义区间</el-radio-button>
                </el-radio-group>
                <div class="range-inputs" v-if="modeData[field.key] !== 'unlimited'">
                  <el-input-number v-model="formData[field.key].min" :min="0" :controls="false" placeholder="最小值" size="small"></el-input-number>
                  <span v-if="modeData[field.key] === 'range'" class="separator">-</span>
                  <el-input-number v-if="modeData[field.key] === 'range'" v-model="formData[field.key].max" :min="0" :controls="false" placeholder="最大值" size="small"></el-input-number>
                </div>
              </div>
            </template>

            <template v-else-if="field.Widget_Type === '日期_切换'">
              <div class="date-switch-container">
                <el-radio-group v-model="modeData[field.key]" size="small" class="mode-switch">
                  <el-radio-button label="recent">过去 N 天</el-radio-button>
                  <el-radio-button label="range">绝对时间段</el-radio-button>
                </el-radio-group>
                <div class="date-inputs">
                  <el-input-number v-if="modeData[field.key] === 'recent'" v-model="formData[field.key].days" :min="1" :max="365" size="small" controls-position="right"></el-input-number>
                  <el-date-picker v-if="modeData[field.key] === 'range'" v-model="formData[field.key].dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYYMMDD" size="small" style="width: 250px"></el-date-picker>
                </div>
              </div>
            </template>

          </el-form-item>
        </template>
        <div style="margin-top: 30px; text-align: center;">
          <el-button type="primary" size="large" @click="submitForm" style="width: 200px; font-size: 16px; box-shadow: 0 4px 12px rgba(64,158,255,0.4);">🚀 提交并生成底表</el-button>
        </div>
      </el-form>
      <div v-else style="text-align:center; color:#999; margin-top:100px;">等待填写配置并生成...</div>
    </div>

    <div class="right-panel">
      <div class="json-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: #21252b; border-bottom: 1px solid #181a1f;">
        <h3 style="margin: 0; color: #61afef; font-size: 16px;">📦 最终提交数据包</h3>
        <el-button 
          size="small" 
          type="primary" 
          @click="copyJson" 
          :disabled="!finalJson"
        >
          📋 一键复制
        </el-button>
      </div>
      <div class="json-content">
        <pre v-if="finalJson">{{ JSON.stringify(finalJson, null, 2) }}</pre>
        <div v-else class="empty-tip">暂无数据，请先在左侧配置并点击提交。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

const API_BASE = 'http://127.0.0.1:5000'

// 🔥 新增：用于存储后端扫描到的所有包
const availablePackages = ref([])
const currentPackage = ref('类目公域行为')
const schema = ref([])
const logicMatrix = ref({})
const finalJson = ref(null)

let formData = reactive({})
let modeData = reactive({})

// 获取所有包列表
const loadPackages = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/packages`)
    availablePackages.value = await res.json()
    if(availablePackages.value.length > 0 && !availablePackages.value.includes(currentPackage.value)) {
      currentPackage.value = availablePackages.value[0]
    }
  } catch (e) {
    console.error("加载包列表失败", e)
  }
}

// 切换包时清空旧数据
// 切换包时清空旧数据
const handlePackageChange = () => {
  schema.value = []; // 🔥 修复：加上这行！在拿到新数据前，强行隐藏所有表单，防止崩溃
  for (let key in formData) delete formData[key];
  for (let key in modeData) delete modeData[key];
  finalJson.value = null;
  loadData();
}

const loadData = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/meta/${currentPackage.value}`)
    const data = await res.json()
    
    schema.value = data.schema.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return 0;
    })
    
    logicMatrix.value = data.matrix

    schema.value.forEach(field => {
      if (['搜索多选', '复选组', '多选下拉'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)) {
        formData[field.key] = []
      } else if (field.Widget_Type === '数值_切换') {
        modeData[field.key] = 'unlimited'
        formData[field.key] = { min: null, max: null }
      } else if (field.Widget_Type === '日期_切换') {
        modeData[field.key] = 'recent'
        formData[field.key] = { days: 30, dateRange: [] }
      } else {
        formData[field.key] = ''
      }
    })
  } catch (error) {
    console.error("加载元数据失败", error)
  }
}

const formatOptions = (opts) => {
  if (!opts) return []
  return opts.map(o => ({ value: o, label: o }))
}

const isVisible = (field) => {
  if (field.isDefault) return true
  const selectedBehaviors = formData['bhv'] || []
  if (selectedBehaviors.length === 0) return false
  
  // 🔥 【绝对交集逻辑（一票否决）】：只要多选的行为里，有【任何一个】不支持该字段，就立刻隐藏！
  for (const bhv of selectedBehaviors) {
    const visibleFields = logicMatrix.value[bhv] || []
    
    // 如果当前遍历到的这个动作（比如预售），它的支持列表里【没有】这个字段
    if (!visibleFields.includes(field.key)) {
      return false // 🚨 触发一票否决！直接隐藏，后面的动作都不用看了
    }
  }
  
  // 只有当所有选中的动作都被检查过，且没有一个人反对时，才准许显示！
  return true
}
// 🔥 引入 Element Plus 的消息提示弹窗
import { ElMessage } from 'element-plus'

// 跳转数据银行引擎
const goToDataBank = () => {
  window.open('https://databank.tmall.com/#/userDefinedAnalyses', '_blank')
}

// 一键复制 JSON
const copyJson = async () => {
  if (!finalJson.value) return;
  try {
    const jsonString = JSON.stringify(finalJson.value, null, 2);
    // 调用浏览器底层的剪贴板 API
    await navigator.clipboard.writeText(jsonString);
    ElMessage.success('🎉 JSON 已成功复制到剪贴板！可以直接去粘贴啦~');
  } catch (err) {
    console.error('复制失败', err);
    ElMessage.error('复制失败，请手动框选复制。');
  }
}
const submitForm = async () => {
  let payload = {}
  
  // 🔥 核心升级：把当前的包名塞进去，让后端知道去拿哪个外壳！
  payload['_package'] = currentPackage.value 
  
  schema.value.forEach(f => {
    if (!isVisible(f)) return
    let k = f.key
    if (['搜索多选', '复选组', '多选下拉'].includes(f.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(k)) {
      if (formData[k] && formData[k].length > 0) payload[k] = formData[k]
    } else if (f.Widget_Type === '数值_切换') {
      const mode = modeData[k]
      if (mode === 'unlimited') payload[k] = { min: "", max: "" }
      else if (mode === 'min') payload[k] = { min: formData[k].min, max: "" }
      else if (mode === 'range') payload[k] = { min: formData[k].min, max: formData[k].max }
    } else if (f.Widget_Type === '日期_切换') {
      const mode = modeData[k]
      if (mode === 'recent') {
        payload[k] = { val: { days: formData[k].days }, min: "recent" }
      } else {
        const range = formData[k].dateRange
        if (range && range.length === 2) {
          payload[k] = { val: { start: range[0], end: range[1] }, min: "range" }
        }
      }
    } else {
      if (formData[k]) payload[k] = formData[k]
    }
  })

  const res = await fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  finalJson.value = await res.json()
}

onMounted(() => {
  loadPackages().then(loadData)
})
</script>

<style scoped>
/* 保持你原本的样式不变即可，或者如果你还需要我补全 CSS，我可以再发一次 */
.container { display: flex; height: 100vh; background-color: #f5f7fa; }
.left-panel { flex: 1; padding: 30px; overflow-y: auto; }
.right-panel { width: 450px; background-color: #282c34; color: #abb2bf; display: flex; flex-direction: column; }
.header-control { display: flex; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #ebeef5;}
.dynamic-form { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); }
.json-header { padding: 20px; background: #21252b; border-bottom: 1px solid #181a1f; }
.json-header h3 { margin: 0; color: #61afef; font-size: 16px; }
.json-content { flex: 1; padding: 20px; overflow-y: auto; font-family: 'Fira Code', Consolas, monospace; font-size: 14px; line-height: 1.5; }
.empty-tip { text-align: center; color: #5c6370; margin-top: 50px; }
.range-switch-container, .date-switch-container { background: #f8f9fa; padding: 12px; border-radius: 8px; border: 1px solid #ebeef5; width: 100%; display: flex; flex-direction: column; gap: 12px; }
.range-inputs, .date-inputs { display: flex; align-items: center; gap: 10px; }
.separator { color: #909399; font-weight: bold; }
</style>