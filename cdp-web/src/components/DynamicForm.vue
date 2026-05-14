<template>
  <el-form label-position="top" size="large" class="dynamic-form">
    <template v-for="field in node.schema" :key="field.key">
      <el-form-item v-show="isVisible(field, node)">

        <template #label>
          <span class="display-body strong">{{ field.Label }}</span>
          <template v-if="getDynamicDescription(field)">
            <el-tooltip v-if="getDynamicStyle(field) !== '文字'" :content="getDynamicDescription(field)" placement="top" effect="dark">
              <span class="tooltip-icon">ⓘ</span>
            </el-tooltip>
          </template>
        </template>

        <template v-if="field.Widget_Type === '普通输入框'">
          <div class="form-row">
            <el-input v-model="node.formData[field.key]" :placeholder="`请输入${field.Label}`" class="flex-1 intercom-input"></el-input>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '列表输入'">
          <div class="form-row">
            <el-select v-model="node.formData[field.key]" multiple filterable allow-create default-first-option :multiple-limit="getListLimit(field, node)" :placeholder="`输入并回车创建${field.Label}`" @change="handleListInput(field.key, node)" no-data-text="💡 敲击回车或输入逗号自动炸开标签" class="flex-1 intercom-input select-auto-height"></el-select>
            <span v-if="getSelectionCountHint(field, node)" class="count-hint display-mono">{{ getSelectionCountHint(field, node) }}</span>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '单选组'">
          <el-radio-group v-model="node.formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? node.formData.title = [] : null" class="intercom-radio-group">
            <el-radio-button label="任意商品标题关键字">任意商品标题关键字</el-radio-button>
            <el-radio-button label="指定商品标题关键字">指定商品标题关键字</el-radio-button>
          </el-radio-group>
        </template>

        <template v-else-if="field.Widget_Type === '搜索多选'">
          <div class="form-row">
            <el-select-v2 v-model="node.formData[field.key]" :options="formatOptions(field.options)" multiple filterable clearable :reserve-keyword="false" :placeholder="`请搜索并选择${field.Label}`" class="flex-1 intercom-input select-auto-height" @change="handleMultiSelectChange(field.key, node)"></el-select-v2>
            <span v-if="getSelectionCountHint(field, node)" class="count-hint display-mono">{{ getSelectionCountHint(field, node) }}</span>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '搜索单选'">
          <div class="form-row">
            <el-select-v2 :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${getArray(node.formData.channel).join(',')}-${node.formData.shop}` : field.key" v-model="node.formData[field.key]" :options="formatOptions(getDynamicOptions(field, node))" filterable clearable :placeholder="`请搜索并选择${field.Label}`" class="flex-1 intercom-input"></el-select-v2>
            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="hint-text display-body-light">{{ getDynamicDescription(field) }}</span>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '复选组'">
          <el-checkbox-group v-model="node.formData[field.key]" class="custom-checkbox-group" @change="handleCheckboxChange(field, $event, node)">
            <el-checkbox v-for="opt in field.options" :key="opt" :label="opt" :disabled="isCheckboxDisabled(field, opt, node)">{{ opt }}</el-checkbox>
          </el-checkbox-group>
        </template>

        <template v-else-if="field.Widget_Type === '数值_切换'">
          <div class="range-block">
            <el-radio-group v-model="node.modeData[field.key]" size="small" class="intercom-radio-group">
              <el-radio-button label="unlimited">不限</el-radio-button>
              <el-radio-button label="min">≥ 最小值</el-radio-button>
              <el-radio-button label="range">自定义区间</el-radio-button>
            </el-radio-group>
            <div class="range-inputs" v-if="node.modeData[field.key] !== 'unlimited'">
              <el-input-number v-model="node.formData[field.key].min" :min="0" :controls="false" placeholder="最小值" size="small" class="intercom-input" style="width:140px" />
              <span v-if="node.modeData[field.key] === 'range'" class="display-body range-sep">—</span>
              <el-input-number v-if="node.modeData[field.key] === 'range'" v-model="node.formData[field.key].max" :min="0" :controls="false" placeholder="最大值" size="small" class="intercom-input" style="width:140px" />
            </div>
          </div>
        </template>

        <template v-else-if="field.Widget_Type === '日期_切换'">
          <div class="range-block">
            <el-radio-group v-model="node.modeData[field.key]" size="small" class="intercom-radio-group">
              <el-radio-button label="recent">过去 N 天</el-radio-button>
              <el-radio-button label="range">固定日期</el-radio-button>
            </el-radio-group>
            <div v-if="node.modeData[field.key] === 'recent'" class="range-inputs">
              <el-input-number v-model="node.formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" class="intercom-input" style="width:120px" />
              <span class="display-body">天</span>
              <span class="hint-text display-body-light">最多向前追溯 366 天</span>
            </div>
            <div v-if="node.modeData[field.key] === 'range'" class="range-inputs">
              <el-date-picker v-model="node.formData[field.key].dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYYMMDD" size="small" class="intercom-input" style="width:260px" :disabled-date="(time) => disabledDate(time, node)" @calendar-change="(val) => handleCalendarChange(val, node)" />
              <span class="hint-text display-body-light">{{ getExactDateRangeHint(node) }}</span>
            </div>
          </div>
        </template>

      </el-form-item>
    </template>
  </el-form>
</template>

<script setup>
import { useCdpShared } from '../composables/useCdpShared'

const props = defineProps({ node: { type: Object, required: true } })

const {
  isVisible, getDynamicDescription, getDynamicStyle,
  getSelectionCountHint, getListLimit, handleListInput,
  handleMultiSelectChange, formatOptions, getDynamicOptions,
  isCheckboxDisabled, handleCheckboxChange, getArray,
  getExactDateRangeHint, handleCalendarChange, disabledDate
} = useCdpShared()
</script>
