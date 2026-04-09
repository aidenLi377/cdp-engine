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
          <el-form-item v-show="isVisible(field)">
            <template #label>
              <span>{{ field.Label }}</span>
              <template v-if="getDynamicDescription(field)">
                
                <el-tooltip 
                  v-if="getDynamicStyle(field) !== '文字'" 
                  :content="getDynamicDescription(field)" 
                  placement="top" 
                  effect="dark"
                >
                  <span style="margin-left: 6px; color: #a8abb2; cursor: pointer; font-size: 14px;">
                    ⓘ
                  </span>
                </el-tooltip>
                
              </template>
            </template>
       

            <template v-if="field.Widget_Type === '普通输入框'">
              <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <el-input v-model="formData[field.key]" :placeholder="`请输入${field.Label}`" style="flex: 1;"></el-input>
                <span 
                  v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" 
                  style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;"
                >
                  {{ getDynamicDescription(field) }}
                </span>
              </div>
            </template>
            <template v-else-if="field.Widget_Type === '列表输入'">
              <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <el-select 
                  v-model="formData[field.key]" 
                  multiple filterable allow-create default-first-option 
                  :multiple-limit="getListLimit(field)"  :placeholder="`输入并回车创建${field.Label}`"
                  @change="handleListInput(field.key)"
                  no-data-text="💡 敲击回车或输入逗号自动炸开标签"
                  style="flex: 1;"
                ></el-select>
            
                <span 
                  v-if="getSelectionCountHint(field)" 
                  style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;"
                >
                  {{ getSelectionCountHint(field) }}
                </span>
                <span 
                  v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" 
                  style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;"
                >
                  {{ getDynamicDescription(field) }}
                </span>
              </div>
            </template>

            <template v-else-if="field.Widget_Type === '单选组'">
              <el-radio-group v-model="formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? formData.title = [] : null">
                <el-radio label="任意商品标题关键字">任意商品标题关键字</el-radio>
                <el-radio label="指定商品标题关键字">指定商品标题关键字</el-radio>
              </el-radio-group>
            </template>
            <template v-else-if="field.Widget_Type === '搜索多选'">
              <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <el-select-v2 
                  v-model="formData[field.key]" 
                  :options="formatOptions(field.options)" 
                  multiple 
                  filterable 
                  clearable 
                  :reserve-keyword="false"  
                  :placeholder="`请搜索并选择${field.Label}`" 
                  style="flex: 1;"
                  @change="handleMultiSelectChange(field.key)" 
                ></el-select-v2>
                <span 
                  v-if="getSelectionCountHint(field)" 
                  style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;"
                >
                  {{ getSelectionCountHint(field) }}
                </span>
                <span 
                  v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" 
                  style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;"
                >
                  {{ getDynamicDescription(field) }}
                </span>
              </div>
            </template>
            
            <template v-else-if="field.Widget_Type === '搜索单选'">
              <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <el-select-v2 
                  :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${Array.isArray(formData.channel) ? formData.channel.join(',') : formData.channel}` : field.key"
                  v-model="formData[field.key]" 
                  :options="formatOptions(getDynamicOptions(field))" 
                  filterable clearable 
                  :placeholder="`请搜索并选择${field.Label}`" 
                  style="flex: 1;"
                ></el-select-v2>
                <span 
                  v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" 
                  style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;"
                >
                  {{ getDynamicDescription(field) }}
                </span>
              </div>
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
              <div style="display: flex; gap: 15px; align-items: center; width: 100%;">
                
                <el-radio-group v-model="modeData[field.key]" size="small" style="flex-shrink: 0;">
                  <el-radio-button label="recent">过去 N 天</el-radio-button>
                  <el-radio-button label="range">固定日期</el-radio-button>
                </el-radio-group>
                
                <div v-if="modeData[field.key] === 'recent'" style="display: flex; align-items: center; gap: 10px;">
                  <el-input-number v-model="formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" style="width: 120px;"></el-input-number>
                  <span style="color: #606266; font-size: 14px; white-space: nowrap;">天</span>
                  <span style="color: #a8abb2; font-size: 12px; margin-left: 8px; white-space: nowrap;">(最多向前追溯 366 天)</span>
                </div>

                <div v-if="modeData[field.key] === 'range'" style="display: flex; align-items: center; gap: 15px;">
                  <el-date-picker 
                    v-model="formData[field.key].dateRange" 
                    type="daterange" 
                    range-separator="至" 
                    start-placeholder="开始日期" 
                    end-placeholder="结束日期" 
                    format="YYYY-MM-DD"
                    value-format="YYYYMMDD" 
                    size="small" 
                    style="width: 260px;"
                    :disabled-date="disabledDate"
                    @calendar-change="handleCalendarChange"
                  ></el-date-picker>
                  <span style="color: #a8abb2; font-size: 12px; white-space: nowrap;">
                    {{ getExactDateRangeHint() }}
                  </span>
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
// === 新增/更新：多选项动态实时计数器 ===
const getSelectionCountHint = (field) => {
  // 我们只给 搜索多选、列表输入（这就是老标题）、复选组 这三个组件加计数器
  if (['搜索多选', '列表输入', '复选组'].includes(field.Widget_Type)) {
    // 🎯 硬性屏蔽：不要给“渠道”、“行为”和那些只有几个选项的字段加计数器
    if (['channel', 'bhv'].includes(field.key)) return null;

    const vals = formData[field.key];
    if (Array.isArray(vals) && vals.length > 0) {
      // 智能判断上限提示
      const isLimited = ['leafCates', 'stdBrand', 'cate'].includes(field.key) 
                        || field.Label.includes('类目') 
                        || field.Label.includes('品牌');
                        
      // 🔥 升级：针对老标题（列表输入），根据不同的包动态显示上限
      // 🔥 升级：针对列表输入，根据不同的包和字段动态显示上限
      if (field.Widget_Type === '列表输入') {
        // 🎯 判断 1：商品标题关键词
        if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
          if (currentPackage.value === '类目公域行为') return `已输入 ${vals.length}/10`;
          if (currentPackage.value === '商品行为') return `已输入 ${vals.length}/5`;
        }
        
        // 🎯 判断 2：商品ID（新增逻辑）
        if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
          if (currentPackage.value === '商品行为') return `已输入 ${vals.length}/50`;
        }
        
        return `已输入 ${vals.length} 个`;
      }
                        
      return isLimited ? `已选 ${vals.length}/10` : `已选 ${vals.length}`;
    }
  }
  return null; 
}

const getListLimit = (field) => {
  if (field.Widget_Type === '列表输入') {
    // 🎯 判断 1：商品标题关键词
    if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
      if (currentPackage.value === '类目公域行为') return 10;
      if (currentPackage.value === '商品行为') return 5;
    }
    
    // 🎯 判断 2：商品ID（新增逻辑）
    if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
      if (currentPackage.value === '商品行为') return 50;
    }
  }
  return 0; // 返回 0 代表 Element Plus 默认的“不限制”
}
// === 新增：动态文案与样式分发器 ===
const getDynamicDescription = (field) => {
  // 🎯 把日期组件在标题旁的提示清空，我们要把它挪到右侧去！
  if (field.Widget_Type === '日期_切换') {
    return "";
  }
  return field.Description;
}
// === 新增：计算精准日期的辅助函数 ===
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const getExactDateRangeHint = () => {
  const behaviors = Array.isArray(formData.bhv) ? formData.bhv : (formData.bhv ? [formData.bhv] : []);
  
  // 🔥 绝杀逻辑：只有在【类目公域行为】包里，且【纯购买】时，才给 2 年！
  const isCategoryPackage = currentPackage.value === '类目公域行为';
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1;
  
  const isTwoYears = isCategoryPackage && isOnlyPurchase;
  
  const today = new Date();
  const minDate = new Date();
  
  if (isTwoYears) {
    minDate.setFullYear(minDate.getFullYear() - 2); 
  } else {
    minDate.setDate(minDate.getDate() - 366); 
  }
  
  return `可选范围：${formatDate(minDate)} 至 ${formatDate(today)} (最大跨度366天)`;
};

const getDynamicStyle = (field) => {
  // 🎯 特判：这种动态变化的极其重要的规则，强制用“文字”平铺展示给用户看，不折叠成图标
  if (field.Widget_Type === '日期_切换') return '文字'
  // 其他组件读取 CSV 里的 Style 配置
  return field.Description_Style
}
// === 分发器逻辑结束 ===

// === 新增：时间动态拦截器核心逻辑 ===
const selectedFirstDate = ref(null)

const handleCalendarChange = (val) => {
  if (val && val[0] && !val[1]) {
    const firstVal = val[0];
    
    // 🔥 绝杀修复：智能判断类型
    if (firstVal instanceof Date) {
      // 如果组件吐出来的是原生 Date 对象，直接用！
      selectedFirstDate.value = firstVal;
    } else if (typeof firstVal === 'string' && firstVal.length === 8) {
      // 如果吐出来的是 YYYYMMDD 字符串，再去做切割
      selectedFirstDate.value = new Date(
        firstVal.substring(0, 4), 
        parseInt(firstVal.substring(4, 6)) - 1, 
        firstVal.substring(6, 8)
      );
    } else {
      // 兜底保护
      selectedFirstDate.value = new Date(firstVal); 
    }
  } else {
    selectedFirstDate.value = null 
  }
}

const disabledDate = (time) => {
  // 1. 获取当前选中的“行为”
  const behaviors = Array.isArray(formData.bhv) ? formData.bhv : (formData.bhv ? [formData.bhv] : [])
  
  // 🔥 绝杀逻辑：只有在【类目公域行为】包里，且【纯购买】时，才给 2 年！
  const isCategoryPackage = currentPackage.value === '类目公域行为';
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1;
  const isTwoYears = isCategoryPackage && isOnlyPurchase;

  // 2. 动态计算底线日期
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const minDate = new Date()
  if (isTwoYears) {
    minDate.setFullYear(minDate.getFullYear() - 2) 
  } else {
    minDate.setDate(minDate.getDate() - 366) 
  }
  minDate.setHours(0, 0, 0, 0)

  // 规则A：大于今天，或小于底线日期，变灰
  if (time.getTime() > today.getTime() || time.getTime() < minDate.getTime()) {
    return true
  }

  // 规则B：区间跨度不能超过 366 天
  if (selectedFirstDate.value) {
    const oneDay = 24 * 3600 * 1000
    const diffDays = Math.abs((time.getTime() - selectedFirstDate.value.getTime()) / oneDay)
    if (diffDays > 366) {
      return true
    }
  }
  return false
}

// === 拦截器逻辑结束 ===

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
      // 🔥 核心修复：如果是单选，坚决给字符串！否则下拉框绑定数组会直接罢工
      if (field.Widget_Type === '搜索单选') {
        formData[field.key] = ''
      } else if (['搜索多选', '复选组', '多选下拉'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)) {
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
    // 🔥 升级：如果切换到了特定包，类目默认自动勾选“全部”（智能兼容单选和多选）
    if (currentPackage.value === 'AIPL状态') {
      if (formData.cate !== undefined) {
        formData.cate = Array.isArray(formData.cate) ? ['全部'] : '全部'
      }
    }
    if (currentPackage.value === '商品行为') {
      if (formData.cate !== undefined) {
        formData.cate = Array.isArray(formData.cate) ? ['全部'] : '全部'
      }
      if (formData.leafCates !== undefined) {
        formData.leafCates = Array.isArray(formData.leafCates) ? ['全部'] : '全部'
      }
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

// 🔥 新增：下拉多选框的“全部”互斥防呆逻辑
const handleMultiSelectChange = (key) => {
  const vals = formData[key];
  // 只有当数组里大于1个元素，并且包含“全部”时才触发清洗
  if (Array.isArray(vals) && vals.length > 1 && vals.includes('全部')) {
    // 如果“全部”在数组末尾，说明是最新点选的，霸道清场，只留“全部”！
    if (vals[vals.length - 1] === '全部') {
      formData[key] = ['全部'];
    } 
    // 否则说明是在已有“全部”时点选了具体选项，一脚把“全部”踢掉！
    else {
      formData[key] = vals.filter(v => v !== '全部');
    }
  }
};
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