<template>
  <section class="center-panel nm-canvas">
    <div class="panel-toolbar nm-canvas-toolbar">
      <span class="display-feature-title">配置画布与逻辑组装</span>
      <div class="toolbar-actions">
        <el-button v-if="nodeList.length > 0" size="small" text @click="$emit('toggle-collapse')">
          {{ allCollapsed ? '展开全部' : '收起全部' }}
        </el-button>
        <el-button v-if="nodeList.length > 0" size="small" text @click="$emit('clear-canvas')">
          清空
        </el-button>
      </div>
    </div>

    <div v-if="nodeList.length === 0" class="empty-hint display-body-light">
      请从左侧点击添加行为组件 👉
    </div>

    <div v-else class="nm-canvas-content">
      <slot name="toolbar-extra" />

      <div class="canvas-with-minimap nm-canvas-body">
        <div class="canvas-scroll-area nm-canvas-scroll" @scroll="$emit('canvas-scroll', $event)">
          <slot name="nodes" />
        </div>

        <div v-if="nodeList.length > 1" class="node-minimap nm-canvas-minimap">
          <slot name="minimap" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  nodeList: {
    type: Array,
    default: () => [],
  },
  allCollapsed: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggle-collapse', 'clear-canvas', 'canvas-scroll'])
</script>

<style scoped>
.nm-canvas {
  min-width: 0;
}

.nm-canvas-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.nm-canvas-body {
  flex: 1;
  min-height: 0;
}

.nm-canvas-scroll {
  min-width: 0;
}

.nm-canvas-minimap {
  flex-shrink: 0;
}
</style>
