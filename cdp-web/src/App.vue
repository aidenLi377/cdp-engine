<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

const API_BASE = 'http://127.0.0.1:5000'

const currentPackage = ref('类目公域行为')
const schema = ref([])
const logicMatrix = ref({})
const finalJson = ref(null)

const formData = reactive({})
const modeData = reactive({})

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
        // 【升级点】为高级日历组件增加 dateRange 数组存放区间
        formData[field.key] = { days: 30, dateRange: [] } 
      } else {
        formData[field.key] = ''
      }
    })
  } catch (err) {
    console.error("无法连接后端服务，请确认 Python app.py 已启动且端口为 5000")
  }
}

const visibleFields = computed(() => {
  const behaviors = formData['bhv'] || []
  if (behaviors.length === 0) return new Set()

  let intersection = new Set(logicMatrix.value[behaviors[0]] || [])
  for (let i = 1; i < behaviors.length; i++) {
    const fields = new Set(logicMatrix.value[behaviors[i]] || [])
    intersection = new Set([...intersection].filter(x => fields.has(x)))
  }
  return intersection
})

const isVisible = (field) => {
  return field.isDefault || visibleFields.value.has(field.key)
}

const submitForm = async () => {
  let payload = {}
  
  schema.value.forEach(f => {
    // 【核心清洗逻辑】如果该字段在页面上被隐藏了，直接跳过，绝不发给后端！
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
        // 【配合日历组件】解析 Element Plus 返回的时间数组 [start, end]
        const range = formData[k].dateRange
        // 【新增防空判断】只有当 range 有值且刚好是两个日期时，才拼装发送
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
  loadData()
})
</script>

<template>
  <div class="app-container">
    <el-row :gutter="20">
      <el-col :span="14">
        <el-card shadow="never" class="form-card">
          <template #header>
            <div class="card-header">
              <span style="font-size: 18px; font-weight: bold; color: #409EFF;">
                🚀 {{ currentPackage }} 参数配置
              </span>
            </div>
          </template>

          <el-form label-position="top">
            <template v-for="field in schema" :key="field.key">
              <el-form-item v-if="isVisible(field)" :label="field.Label + (field.isDefault ? ' (核心)' : '')">
                
                <el-checkbox-group v-if="field.Widget_Type === '复选组' || ['bhv', 'channel'].includes(field.key)" v-model="formData[field.key]">
                  <el-checkbox-button v-for="opt in field.options" :key="opt" :label="opt" :value="opt">
                    {{ opt }}
                  </el-checkbox-button>
                </el-checkbox-group>

                <el-select-v2 v-else-if="field.Widget_Type === '搜索多选' || ['leafCates', 'stdBrand'].includes(field.key)"
                           v-model="formData[field.key]" 
                           :options="field.options ? field.options.map(o => ({value: o, label: o})) : []"
                           multiple filterable collapse-tags placeholder="支持输入文字搜索下拉选项..." style="width: 100%;" />

                <div v-else-if="field.Widget_Type === '数值_切换'" class="dynamic-group">
                  <el-radio-group v-model="modeData[field.key]" style="margin-bottom: 10px;">
                    <el-radio-button label="unlimited" value="unlimited">不限</el-radio-button>
                    <el-radio-button label="min" value="min">仅最小值</el-radio-button>
                    <el-radio-button label="range" value="range">区间限制</el-radio-button>
                  </el-radio-group>
                  <div v-if="modeData[field.key] === 'min'">
                    <el-input-number v-model="formData[field.key].min" placeholder="≥ 最小值" :controls="false" />
                  </div>
                  <div v-else-if="modeData[field.key] === 'range'" style="display: flex; align-items: center; gap: 10px;">
                    <el-input-number v-model="formData[field.key].min" placeholder="最小" :controls="false" /> 
                    <span>至</span> 
                    <el-input-number v-model="formData[field.key].max" placeholder="最大" :controls="false" />
                  </div>
                </div>

                <div v-else-if="field.Widget_Type === '日期_切换'" class="dynamic-group">
                  <el-radio-group v-model="modeData[field.key]" style="margin-bottom: 15px;">
                    <el-radio-button label="recent" value="recent">最近几天</el-radio-button>
                    <el-radio-button label="range" value="range">日期区间</el-radio-button>
                  </el-radio-group>
                  
                  <div v-if="modeData[field.key] === 'recent'" style="display: flex; align-items: center; gap: 10px;">
                    <span>最近</span>
                    <el-input-number v-model="formData[field.key].days" :min="1" :max="365" controls-position="right" style="width: 120px;" />
                    <span>天</span>
                  </div>
                  
                  <div v-else-if="modeData[field.key] === 'range'">
                    <el-date-picker
                      v-model="formData[field.key].dateRange"
                      type="daterange"
                      range-separator="至"
                      start-placeholder="开始日期"
                      end-placeholder="结束日期"
                      value-format="YYYYMMDD"  style="width: 100%; max-width: 380px;"
                    />
                  </div>
                </div>

                <el-input v-else v-model="formData[field.key]" placeholder="请输入..." />

              </el-form-item>
            </template>

            <el-button type="primary" size="large" style="width: 100%; margin-top: 20px;" @click="submitForm">
              ⚡ 引擎渲染 -> 生成底层 JSON
            </el-button>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card shadow="never" class="result-card">
          <template #header>
            <div class="card-header">
              <span style="font-weight: bold; color: #67C23A;">💻 DSL 查询报文 (发送给底层架构)</span>
            </div>
          </template>
          <pre v-if="finalJson" class="json-viewer">{{ JSON.stringify(finalJson, null, 2) }}</pre>
          <div v-else style="color: #999; text-align: center; padding: 40px 0;">
            等待填写配置并生成...
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.app-container { padding: 40px; max-width: 1400px; margin: 0 auto; background-color: #f5f7fa; min-height: 100vh; }
.form-card, .result-card { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.dynamic-group { background: #f8f9fa; padding: 15px; border-radius: 6px; border: 1px dashed #dcdfe6; width: 100%; }
.json-viewer { margin: 0; padding: 20px; background: #282c34; color: #abb2bf; border-radius: 6px; overflow-x: auto; height: 600px; }
</style>