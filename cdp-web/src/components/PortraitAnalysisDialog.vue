<template>
  <el-dialog
    v-model="visible"
    title="智能画像分析"
    width="560px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form label-position="top">
      <el-form-item label="人群名称">
        <el-input
          v-model="crowdName"
          placeholder="输入在数据引擎上已创建的人群名称"
        />
        <div class="form-hint">请先在数据引擎上创建好人群，再回到这里输入名称并开始分析。</div>
      </el-form-item>

      <el-form-item label="画像标签">
        <div class="tag-selector">
          <el-checkbox v-model="selectAll" @change="toggleSelectAll">全选</el-checkbox>
          <div v-for="(tags, category) in tagGroups" :key="category" class="tag-category">
            <el-checkbox
              v-model="categoryChecked[category]"
              @change="(val) => toggleCategory(category, val)"
            >
              {{ category }} ({{ tags.length }}个)
            </el-checkbox>
            <div class="tag-ids">
              <el-checkbox
                v-for="tag in tags"
                :key="tag.tagId"
                v-model="selectedTagIds"
                :label="tag.tagId"
                :value="tag.tagId"
                size="small"
              >
                {{ tag.tagName }}
              </el-checkbox>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        开始分析
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const crowdName = ref('')
const selectedTagIds = ref([])
const selectAll = ref(false)
const tagGroups = reactive({})
const categoryChecked = reactive({})
const submitting = ref(false)

async function onOpen() {
  if (Object.keys(tagGroups).length > 0) return
  try {
    const resp = await fetch('/api/rpa/tags')
    const data = await resp.json()
    Object.assign(tagGroups, data.groups || {})
    selectedTagIds.value = (data.readyTags || []).map(t => t.tagId)
    selectAll.value = true
    for (const cat of Object.keys(tagGroups)) {
      categoryChecked[cat] = true
    }
  } catch {
    ElMessage.error('加载标签列表失败')
  }
}

function toggleSelectAll(val) {
  if (val) {
    const allIds = []
    for (const tags of Object.values(tagGroups)) {
      for (const t of tags) {
        allIds.push(t.tagId)
      }
    }
    selectedTagIds.value = allIds
    for (const cat of Object.keys(tagGroups)) {
      categoryChecked[cat] = true
    }
  } else {
    selectedTagIds.value = []
    for (const cat of Object.keys(tagGroups)) {
      categoryChecked[cat] = false
    }
  }
}

function toggleCategory(category, val) {
  const catTags = tagGroups[category] || []
  if (val) {
    for (const t of catTags) {
      if (!selectedTagIds.value.includes(t.tagId)) {
        selectedTagIds.value.push(t.tagId)
      }
    }
  } else {
    selectedTagIds.value = selectedTagIds.value.filter(
      id => !catTags.some(t => t.tagId === id),
    )
  }
}

async function submit() {
  if (!crowdName.value.trim()) {
    ElMessage.warning('请输入人群名称')
    return
  }
  if (selectedTagIds.value.length === 0) {
    ElMessage.warning('请至少选择一个画像标签')
    return
  }
  submitting.value = true
  try {
    const resp = await fetch('/api/rpa/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crowdName: crowdName.value.trim(),
        tagIds: [...selectedTagIds.value],
      }),
    })
    if (!resp.ok) {
      const err = await resp.json()
      throw new Error(err.error || '创建任务失败')
    }
    const result = await resp.json()
    emit('submit', result.taskId)
    visible.value = false
  } catch (err) {
    ElMessage.error(err.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

watch(visible, (val) => {
  if (!val) {
    crowdName.value = ''
  }
})
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.tag-selector {
  max-height: 300px;
  overflow-y: auto;
  width: 100%;
}
.tag-category {
  margin: 6px 0;
  padding: 4px 0;
  border-bottom: 1px solid #f0f0f0;
}
.tag-ids {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 0 4px 20px;
}
</style>
