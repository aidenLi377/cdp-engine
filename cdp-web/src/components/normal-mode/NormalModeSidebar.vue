<template>
  <aside class="left-panel">
    <div class="display-feature-title panel-header">行为组件库</div>

    <el-input
      :model-value="search"
      placeholder="搜索组件..."
      size="small"
      clearable
      class="intercom-input pkg-search"
      @update:model-value="$emit('update:search', $event)"
    >
      <template #prefix><span style="opacity: 0.3">🔍</span></template>
    </el-input>

    <div class="btn-group">
      <el-button
        v-for="pkg in packages"
        :key="pkg"
        type="default"
        class="intercom-btn-outlined"
        :loading="loadingPkg === pkg"
        @click="$emit('add-node', pkg)"
      >
        ➕ 添加 {{ pkg }}
      </el-button>
    </div>

    <div
      v-if="search && packages.length === 0"
      class="display-body-light"
      style="text-align: center; margin-top: 20px"
    >
      无匹配组件
    </div>
  </aside>
</template>

<script setup>
defineProps({
  packages: {
    type: Array,
    default: () => [],
  },
  search: {
    type: String,
    default: '',
  },
  loadingPkg: {
    type: String,
    default: null,
  },
})

defineEmits(['update:search', 'add-node'])
</script>
