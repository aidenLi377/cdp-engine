<template>
  <el-config-provider :locale="zhCn">
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
              <el-select 
                v-model="formData[field.key]" 
                multiple filterable allow-create default-first-option 
                :placeholder="`输入并回车创建${field.Label}`"
                @change="handleListInput(field.key)"
                no-data-text="💡 敲击回车或输入逗号自动炸开标签"
              ></el-select>
            </template>

            <template v-else-if="field.Widget_Type === '单选组'">
              <el-radio-group v-model="formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? formData.title = [] : null">
                <el-radio label="任意商品标题关键字">任意商品标题关键字</el-radio>
                <el-radio label="指定商品标题关键字">指定商品标题关键字</el-radio>
              </el-radio-group>
            </template>
            
            <template v-else-if="field.Widget_Type === '搜索多选'">
              <el-select-v2 v-model="formData[field.key]" :options="formatOptions(field.options)" multiple filterable clearable collapse-tags :placeholder="`请搜索并选择${field.Label}`" style="width: 100%"></el-select-v2>
            </template>
            <template v-else-if="field.Widget_Type === '搜索单选'">
              <el-select-v2 
                :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${Array.isArray(formData.channel) ? formData.channel.join(',') : formData.channel}` : field.key"
                v-model="formData[field.key]" 
                :options="formatOptions(getDynamicOptions(field))" 
                filterable clearable 
                :placeholder="`请搜索并选择${field.Label}`" 
                style="width: 100%"
              ></el-select-v2>
            </template>

            <template v-else-if="field.Widget_Type === '复选组'">
              <el-checkbox-group v-model="formData[field.key]" class="custom-checkbox-group" @change="handleCheckboxChange(field, $event)">
                <el-checkbox 
                  v-for="opt in field.options" 
                  :key="opt" 
                  :label="opt"
                  :disabled="isCheckboxDisabled(field, opt)"
                >
                  {{ opt }}
                </el-checkbox>
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
                  <el-radio-button label="range">固 定 日 期</el-radio-button>
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
  </el-config-provider>
</template>

<script setup>
import { ref, reactive, computed, onMounted,watch } from 'vue'
// 🔥 新增：引入 Element Plus 的官方中文语言包
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const API_BASE = 'http://127.0.0.1:5000'

// 🔥 新增：用于存储后端扫描到的所有包
const availablePackages = ref([])
const currentPackage = ref('类目公域行为')
const schema = ref([])
const logicMatrix = ref({})
const finalJson = ref(null)

let formData = reactive({})
let modeData = reactive({})


// 🔥 升级版监听：仅在“商品行为”包中执行账号与商品的联动逻辑
watch([() => formData.shop, () => formData.channel], ([newShop, newChannel]) => {
  if (currentPackage.value !== '商品行为') return; // 🎯 增加包名安全卫士
  const channels = Array.isArray(newChannel) ? newChannel : (newChannel ? [newChannel] : []);
  const isTmallGlobal = channels.includes('天猫国际直营');
  const isTmall = channels.includes('天猫'); // 👈 新增：判断是否包含“天猫”

  // 🎯 新增拦截规则：只要渠道【不是天猫】，且账号【不是全淘宝天猫】，强制重置账号！
  if (!isTmall && newShop !== '全淘宝天猫') {
    formData.shop = '全淘宝天猫';
  }

  // 获取最新的 shop 值（因为上面可能刚把它重置了）
  const currentShop = formData.shop;

  // 核心逻辑：如果是全淘宝天猫，且【不是】天猫国际直营，才强制限制并清空 ID
  if ((currentShop === '全淘宝天猫' || !currentShop) && !isTmallGlobal) {
    formData.selectedGoodsType = '任意品牌商品';
    formData.item = [];
  }
}, { deep: true })

// 🔥 新增逻辑 2：动态过滤下拉选项
const getDynamicOptions = (field) => {
  const channels = Array.isArray(formData.channel) ? formData.channel : (formData.channel ? [formData.channel] : []);

  // 🎯 新增：拦截【账号(shop)】下拉框
  if (field.key === 'shop') {
    const isTmall = channels.includes('天猫');
    if (!isTmall) {
      return ['全淘宝天猫']; // 其他渠道，锁死只能选这个
    } else {
      return field.options; // 天猫渠道，放行所有真实店铺
    }
  }

  // 拦截【商品类型(selectedGoodsType)】下拉框
  if (field.key === 'selectedGoodsType') {
    const isTmallGlobal = channels.includes('天猫国际直营');
    if ((formData.shop === '全淘宝天猫' || !formData.shop) && !isTmallGlobal) {
      return ['任意品牌商品']; 
    } else {
      return field.options; 
    }
  }
  
  return field.options;
}

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
    // 🔥 加上时间戳粉碎缓存：每次请求带上当前毫秒数，强迫浏览器绝不使用旧缓存！
    const res = await fetch(`${API_BASE}/api/meta/${currentPackage.value}?t=${new Date().getTime()}`)
    const data = await res.json()
    
    schema.value = data.schema
    
    logicMatrix.value = data.matrix

    schema.value.forEach(field => {
      if (['搜索多选', '复选组', '多选下拉'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)) {
        formData[field.key] = []
      } else if (field.Widget_Type === '单选组') {
        // 🔥 新增：单选组默认选中“任意商品”
        formData[field.key] = '任意商品标题关键字'
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

    // 🔥 新增：如果切换到了 AIPL人群，类目默认自动勾选“全部”
    if (currentPackage.value === 'AIPL状态') {
      formData.cate = ['全部']
    }

  } catch (error) {
    console.error("加载元数据失败", error)
  }
}  
      

const formatOptions = (opts) => {
  if (!opts) return []
  return opts.map(o => ({ value: o, label: o }))
}
// 小助手函数：确保拿到的是数组
const getArray = (val) => Array.isArray(val) ? val : (val ? [val] : [])

// 🔥 新增：自动拆分中英文逗号，将长字符串瞬间变成多个独立标签！
const handleListInput = (key) => {
  const vals = formData[key];
  if (Array.isArray(vals)) {
    let hasSplit = false;
    const newVals = [];
    
    vals.forEach(v => {
      // 如果发现这个词里面包含了逗号（兼容中英文）
      if (typeof v === 'string' && (v.includes(',') || v.includes('，'))) {
        hasSplit = true;
        // 把它们劈开，去掉前后多余的空格，再过滤掉空文本
        const parts = v.split(/[,，]/).map(s => s.trim()).filter(s => s);
        newVals.push(...parts);
      } else {
        newVals.push(v);
      }
    });

    if (hasSplit) {
      // 触发响应式更新，并用 Set 自动去重（防止用户粘贴了重复的词）
      formData[key] = [...new Set(newVals)];
    }
  }
};

// 🔥 新增：复选框防呆逻辑 —— 如果勾选了"所有"，自动清空其他已勾选的选项
const handleCheckboxChange = (field, currentVals) => {
  if (field.key === 'channel') {
    // 你的 opt 是纯字符串，直接判断是否包含即可
    if (currentVals.includes('所有销售渠道')) {
      if (currentVals.length > 1) {
        // 强制大清退！只保留“所有”这一个独苗
        formData[field.key] = ['所有销售渠道'];
      }
    }
  }
};

// 🔥 新增：动态禁用逻辑 —— 如果"所有"被选中，其余人全部强制变成灰色
const isCheckboxDisabled = (field, opt) => {
  if (field.key === 'channel') {
    const selectedVals = formData[field.key] || [];
    if (selectedVals.includes('所有销售渠道')) {
      // 只要你不是“所有”本尊，通通变灰禁用！
      return opt !== '所有销售渠道';
    }
  }
  return false;
};

const isVisible = (field) => {
  if (field.key === 'item' && currentPackage.value === '商品行为') {
    return formData.selectedGoodsType === '指定商品ID';
  }
  // 🔥 需求1：标题开关，必须在选择了“类目”之后才准出来！
  if ((field.key === 'title_type' || field.key === 'keywords_type') && ['类目公域行为', '商品行为'].includes(currentPackage.value)) {
    const hasCate = getArray(formData.leafCates).length > 0 || getArray(formData.cate).length > 0;
    if (!hasCate) return false;
  }

  // 🔥 需求2：老标题输入框，必须开关选了“指定”才准出来！
  if ((field.key === 'title' || field.key === 'keywords') && ['类目公域行为', '商品行为'].includes(currentPackage.value)) {
    // 兼容取值：可能是 title_type，也可能是 keywords_type
    const switchVal = formData.title_type || formData.keywords_type;
    if (switchVal !== '指定商品标题关键字') return false;
  }
  

  

  if (field.isDefault) return true
  
  // 增加容错保护，防止 logicMatrix 为空时报错
  const matrixKeys = Object.keys(logicMatrix.value || {})
  if (matrixKeys.length === 0) return false
  
  // 💡 智能嗅探：看看底层传来的钥匙里有没有 '|'，判断是不是多维商品包
  const is2D = matrixKeys.some(k => k.includes('|'))
  let triggerCombinations = []
  
  if (is2D) {
    // 🔥 修复点：去掉 .value，直接读取 formData
    const channels = getArray(formData['channel'])
    const behaviors = getArray(formData['bhv'])
    
    // 二维逻辑下，必须【渠道】和【行为】都选了，才允许展示后续的靶向字段
    if (channels.length === 0 || behaviors.length === 0) return false 
    
    // 生成笛卡尔积组合密钥 (如：天猫国际|购买)
    for (const ch of channels) {
      for (const bhv of behaviors) {
        triggerCombinations.push(`${ch}|${bhv}`)
      }
    }
  } else {
    // 🎯 新增兜底：如果逻辑表包含 DEFAULT 触发器，直接无条件放行
    if (matrixKeys.includes('DEFAULT')) {
      triggerCombinations = ['DEFAULT'];
    } else {
      triggerCombinations = getArray(formData['bhv']).length > 0 
                          ? getArray(formData['bhv']) 
                          : getArray(formData['types'])
    }
    if (triggerCombinations.length === 0) return false
  }
  
  // 铁腕一票否决：只要有一个组合不支持该字段，立刻隐藏！
  for (const comboKey of triggerCombinations) {
    const visibleFields = (logicMatrix.value || {})[comboKey] || []
    if (!visibleFields.includes(field.key)) {
      return false 
    }
  }
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