# CDP Frontend UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 CDP 普通模式工作台的首轮 UI 重构，落地“左侧轻导航 + 中部主舞台 + 右侧上下文抽屉”的新结构，并建立一套浅色、朦胧、年轻优雅的共享视觉系统。

**Architecture:** 保留现有 Vue 3 + Element Plus 业务逻辑与接口调用方式，不改后端协议。实现上先抽出共享视觉令牌与普通模式壳层组件，再把当前 `NormalMode.vue` 拆成侧边导航、主画布、结果抽屉三个职责清晰的子组件，最后统一表单、卡片、按钮、摘要区的视觉语言，并用构建与手工验证确保稳定。

**Tech Stack:** Vue 3、Element Plus、Vite、vue-tsc、CSS

---

## 文件结构与职责

### 新增文件

- `cdp-web/src/components/normal-mode/NormalModeSidebar.vue`
  - 普通模式左侧轻导航与组件选择面板
- `cdp-web/src/components/normal-mode/NormalModeCanvas.vue`
  - 普通模式中部主舞台、节点列表、连接关系、空状态
- `cdp-web/src/components/normal-mode/NormalModeInspector.vue`
  - 普通模式右侧上下文抽屉、摘要与 JSON 查看
- `cdp-web/src/styles/cdp-tokens.css`
  - 共享颜色、阴影、圆角、背景、边框等视觉令牌

### 修改文件

- `cdp-web/src/App.vue`
  - 统一页面壳层、顶部栏、模式切换位置
- `cdp-web/src/components/NormalMode.vue`
  - 从“大一统组件”重构为状态容器，负责协调三个子组件
- `cdp-web/src/components/BatchMode.vue`
  - 本轮不重构结构，只补齐壳层颜色与基础视觉一致性
- `cdp-web/src/components/DynamicForm.vue`
  - 对齐新的表单间距、标签层级、输入反馈
- `cdp-web/src/styles/cdp-global.css`
  - 清理旧的全局样式，转为基于视觉令牌的新样式系统
- `cdp-web/src/main.js`
  - 引入新的令牌样式文件

### 验证命令

- `npm run type-check`
- `npm run build`

---

### Task 1: 建立共享视觉令牌与应用壳层

**Files:**
- Create: `cdp-web/src/styles/cdp-tokens.css`
- Modify: `cdp-web/src/main.js`
- Modify: `cdp-web/src/App.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`

- [ ] **Step 1: 新建视觉令牌文件**

```css
/* cdp-web/src/styles/cdp-tokens.css */
:root {
  --cdp-bg-page: #f6f3ee;
  --cdp-bg-shell: rgba(255, 252, 248, 0.82);
  --cdp-bg-panel: rgba(255, 255, 255, 0.72);
  --cdp-bg-panel-strong: rgba(255, 255, 255, 0.88);
  --cdp-bg-soft: rgba(246, 238, 231, 0.78);
  --cdp-line-soft: rgba(109, 92, 79, 0.08);
  --cdp-line-strong: rgba(109, 92, 79, 0.14);
  --cdp-text-primary: #3b312c;
  --cdp-text-secondary: #7b6d65;
  --cdp-text-muted: #a4958c;
  --cdp-accent: #df9e8e;
  --cdp-accent-strong: #cf8d7d;
  --cdp-accent-soft: rgba(223, 158, 142, 0.16);
  --cdp-success: #97ab8e;
  --cdp-shadow-soft: 0 16px 40px rgba(117, 97, 84, 0.08);
  --cdp-shadow-card: 0 10px 28px rgba(117, 97, 84, 0.06);
  --cdp-radius-xl: 28px;
  --cdp-radius-lg: 22px;
  --cdp-radius-md: 16px;
  --cdp-radius-sm: 12px;
}
```

- [ ] **Step 2: 在入口引入视觉令牌**

```js
// cdp-web/src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/cdp-tokens.css'
import './styles/cdp-global.css'

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
```

- [ ] **Step 3: 重构应用顶层壳层与顶部栏**

```vue
<!-- cdp-web/src/App.vue -->
<template>
  <el-config-provider :locale="zhCn">
    <div class="cdp-app-shell">
      <transition name="fade-slide">
        <div v-if="!backendOnline" class="offline-banner">
          后端服务连接失败，请检查服务是否已启动
          <el-button size="small" text @click="checkHealth" class="shell-link-btn">重试</el-button>
        </div>
      </transition>

      <header class="cdp-topbar">
        <div class="topbar-brand">
          <div class="brand-mark"></div>
          <div>
            <p class="topbar-eyebrow">CDP Audience Studio</p>
            <h1 class="topbar-title">人群配置工作台</h1>
          </div>
        </div>

        <div class="topbar-actions">
          <span class="status-pill" :class="{ offline: !backendOnline }">
            {{ backendOnline ? '服务正常' : '服务离线' }}
          </span>
          <el-radio-group v-model="appMode" size="small" class="mode-switch">
            <el-radio-button label="normal">可视化配置</el-radio-button>
            <el-radio-button label="batch">批量车间</el-radio-button>
          </el-radio-group>
        </div>
      </header>

      <main class="cdp-shell-body">
        <NormalMode v-if="appMode === 'normal'" />
        <BatchMode v-else-if="appMode === 'batch'" />
      </main>
    </div>
  </el-config-provider>
</template>
```

- [ ] **Step 4: 用新壳层样式替换旧页面骨架**

```css
/* cdp-web/src/styles/cdp-global.css */
body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(223, 158, 142, 0.12), transparent 30%),
    radial-gradient(circle at right 20%, rgba(151, 171, 142, 0.10), transparent 24%),
    linear-gradient(180deg, #faf7f3 0%, #f4f0ea 100%);
  color: var(--cdp-text-primary);
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

#app {
  min-height: 100vh;
}

.cdp-app-shell {
  min-height: 100vh;
  padding: 20px;
  box-sizing: border-box;
}

.cdp-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  margin-bottom: 16px;
  border: 1px solid var(--cdp-line-soft);
  border-radius: var(--cdp-radius-xl);
  background: var(--cdp-bg-shell);
  backdrop-filter: blur(18px);
  box-shadow: var(--cdp-shadow-soft);
}

.cdp-shell-body {
  min-height: calc(100vh - 124px);
}
```

- [ ] **Step 5: 运行类型检查**

Run: `npm run type-check`  
Expected: PASS

- [ ] **Step 6: 提交壳层与令牌改造**

```bash
git add cdp-web/src/styles/cdp-tokens.css cdp-web/src/main.js cdp-web/src/App.vue cdp-web/src/styles/cdp-global.css
git commit -m "feat: add soft visual shell and design tokens"
```

---

### Task 2: 拆分普通模式为轻导航、主舞台、上下文抽屉

**Files:**
- Create: `cdp-web/src/components/normal-mode/NormalModeSidebar.vue`
- Create: `cdp-web/src/components/normal-mode/NormalModeCanvas.vue`
- Create: `cdp-web/src/components/normal-mode/NormalModeInspector.vue`
- Modify: `cdp-web/src/components/NormalMode.vue`

- [ ] **Step 1: 创建左侧轻导航组件**

```vue
<!-- cdp-web/src/components/normal-mode/NormalModeSidebar.vue -->
<template>
  <aside class="nm-sidebar">
    <div class="nm-sidebar-rail">
      <span class="rail-dot active"></span>
      <span class="rail-dot"></span>
      <span class="rail-dot"></span>
    </div>

    <section class="nm-sidebar-panel">
      <div class="nm-sidebar-head">
        <p class="panel-eyebrow">组件库</p>
        <h2 class="panel-title">添加条件节点</h2>
      </div>

      <el-input
        v-model="localSearch"
        placeholder="搜索组件"
        clearable
        class="intercom-input"
      />

      <div class="nm-sidebar-list">
        <el-button
          v-for="pkg in filteredPackages"
          :key="pkg"
          class="nm-sidebar-item"
          @click="$emit('add-node', pkg)"
        >
          {{ pkg }}
        </el-button>
      </div>
    </section>
  </aside>
</template>
```

- [ ] **Step 2: 创建中部主舞台组件**

```vue
<!-- cdp-web/src/components/normal-mode/NormalModeCanvas.vue -->
<template>
  <section class="nm-stage">
    <div class="nm-stage-head">
      <div>
        <p class="panel-eyebrow">Workspace</p>
        <h2 class="panel-title">人群逻辑编排</h2>
      </div>

      <div class="nm-stage-actions">
        <el-button text @click="$emit('toggle-collapse')" :disabled="nodeList.length === 0">
          {{ allCollapsed ? '展开全部' : '收起全部' }}
        </el-button>
        <el-button text @click="$emit('clear-canvas')" :disabled="nodeList.length === 0">
          清空画布
        </el-button>
      </div>
    </div>

    <div v-if="nodeList.length === 0" class="nm-stage-empty">
      <div class="empty-orbit"></div>
      <p>从左侧选择一个组件，开始构建人群逻辑</p>
    </div>

    <div v-else class="nm-stage-scroll">
      <slot />
    </div>
  </section>
</template>
```

- [ ] **Step 3: 创建右侧上下文抽屉组件**

```vue
<!-- cdp-web/src/components/normal-mode/NormalModeInspector.vue -->
<template>
  <aside class="nm-inspector" :class="{ collapsed: !visible }">
    <div class="nm-inspector-head">
      <div>
        <p class="panel-eyebrow">Inspector</p>
        <h2 class="panel-title">结果与摘要</h2>
      </div>
      <el-button text @click="$emit('toggle-visible')">
        {{ visible ? '收起' : '展开' }}
      </el-button>
    </div>

    <div v-if="visible" class="nm-inspector-body">
      <slot />
    </div>
  </aside>
</template>
```

- [ ] **Step 4: 将 NormalMode 改为状态容器**

```vue
<!-- cdp-web/src/components/NormalMode.vue -->
<template>
  <div class="normal-mode-layout">
    <NormalModeSidebar
      :packages="availablePackages"
      :loading-pkg="loadingPkg"
      @add-node="addNode"
    />

    <NormalModeCanvas
      :node-list="nodeList"
      :all-collapsed="allCollapsed"
      @toggle-collapse="toggleCollapseAll"
      @clear-canvas="clearCanvas"
    >
      <div
        v-for="(node, index) in nodeList"
        :key="node.id"
        class="node-wrapper"
      >
        <!-- 原节点卡片渲染逻辑继续保留在这里，后续任务再改视觉 -->
      </div>
    </NormalModeCanvas>

    <NormalModeInspector
      :visible="inspectorVisible"
      @toggle-visible="inspectorVisible = !inspectorVisible"
    >
      <!-- 原摘要 / JSON / crowd name 区域先迁移进来 -->
    </NormalModeInspector>
  </div>
</template>
```

- [ ] **Step 5: 运行构建，确认拆分后组件引用无误**

Run: `npm run build`  
Expected: PASS

- [ ] **Step 6: 提交普通模式结构拆分**

```bash
git add cdp-web/src/components/normal-mode/NormalModeSidebar.vue cdp-web/src/components/normal-mode/NormalModeCanvas.vue cdp-web/src/components/normal-mode/NormalModeInspector.vue cdp-web/src/components/NormalMode.vue
git commit -m "refactor: split normal mode into shell components"
```

---

### Task 3: 重做普通模式卡片、连接关系与右侧摘要视图

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`

- [ ] **Step 1: 改造节点卡片头部与浮层样式**

```vue
<!-- cdp-web/src/components/NormalMode.vue -->
<div class="nm-node-card" :class="{ collapsed: node.collapsed }">
  <div class="nm-node-card-head">
    <button class="nm-node-handle" type="button">⋮⋮</button>

    <div class="nm-node-meta" @click="node.collapsed = !node.collapsed">
      <span class="nm-node-index">节点 {{ index + 1 }}</span>
      <h3 class="nm-node-title">{{ node.packageType }}</h3>
    </div>

    <div class="nm-node-tools">
      <el-button class="ghost-btn" @click="duplicateNode(index)">复制</el-button>
      <el-button class="ghost-btn danger" @click="removeNode(index)">移除</el-button>
    </div>
  </div>

  <DynamicForm v-show="!node.collapsed" :node="node" />
</div>
```

- [ ] **Step 2: 将连接关系改为细线与轻胶囊**

```vue
<!-- cdp-web/src/components/NormalMode.vue -->
<div v-if="index > 0" class="nm-operator-bridge">
  <span class="bridge-line"></span>
  <el-radio-group v-model="node.operator" size="small" class="nm-operator-group">
    <el-radio-button label="n">交集</el-radio-button>
    <el-radio-button label="u">并集</el-radio-button>
    <el-radio-button label="d">差集</el-radio-button>
  </el-radio-group>
  <span class="bridge-line"></span>
</div>
```

- [ ] **Step 3: 让右侧查看区默认展示摘要卡片**

```vue
<!-- cdp-web/src/components/NormalMode.vue -->
<div class="nm-inspector-tabs">
  <button class="inspector-tab" :class="{ active: jsonViewMode === 'summary' }" @click="jsonViewMode = 'summary'">
    摘要
  </button>
  <button class="inspector-tab" :class="{ active: jsonViewMode === 'json' }" @click="jsonViewMode = 'json'">
    JSON
  </button>
</div>

<div v-if="jsonViewMode === 'summary'" class="nm-summary-list">
  <article v-for="(node, index) in nodeList" :key="'summary-' + node.id" class="nm-summary-card">
    <div class="nm-summary-head">
      <span class="nm-summary-badge">{{ index + 1 }}</span>
      <strong>{{ node.packageType }}</strong>
    </div>
  </article>
</div>
```

- [ ] **Step 4: 补齐新卡片、连接、抽屉的样式**

```css
/* cdp-web/src/styles/cdp-global.css */
.normal-mode-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 360px;
  gap: 16px;
  min-height: calc(100vh - 124px);
}

.nm-node-card {
  border: 1px solid var(--cdp-line-soft);
  border-radius: var(--cdp-radius-lg);
  background: var(--cdp-bg-panel);
  backdrop-filter: blur(16px);
  box-shadow: var(--cdp-shadow-card);
}

.nm-operator-bridge {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0;
}

.bridge-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(207, 141, 125, 0.28), transparent);
}

.nm-summary-card {
  padding: 16px;
  border-radius: var(--cdp-radius-md);
  background: var(--cdp-bg-panel-strong);
  border: 1px solid var(--cdp-line-soft);
}
```

- [ ] **Step 5: 运行类型检查与构建**

Run: `npm run type-check && npm run build`  
Expected: PASS

- [ ] **Step 6: 提交普通模式核心视觉重构**

```bash
git add cdp-web/src/components/NormalMode.vue cdp-web/src/styles/cdp-global.css
git commit -m "feat: redesign normal mode workspace visuals"
```

---

### Task 4: 对齐 DynamicForm 与交互控件的浅暖雾感视觉

**Files:**
- Modify: `cdp-web/src/components/DynamicForm.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`

- [ ] **Step 1: 收紧表单标签层级与提示文案表现**

```vue
<!-- cdp-web/src/components/DynamicForm.vue -->
<el-form label-position="top" size="large" class="dynamic-form airy-form">
  <template v-for="field in node.schema" :key="field.key">
    <el-form-item v-show="isVisible(field, node)" class="airy-form-item">
      <template #label>
        <div class="airy-form-label">
          <span class="airy-form-title">{{ field.Label }}</span>
          <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" class="airy-form-inline-hint">
            {{ getDynamicDescription(field) }}
          </span>
        </div>
      </template>
    </el-form-item>
  </template>
</el-form>
```

- [ ] **Step 2: 统一输入框、选择器、按钮的弱边界样式**

```css
/* cdp-web/src/styles/cdp-global.css */
.intercom-input .el-input__wrapper,
.intercom-input .el-select-v2__wrapper,
.intercom-input .el-textarea__inner {
  background: rgba(255, 251, 247, 0.86) !important;
  border: 1px solid var(--cdp-line-soft) !important;
  border-radius: 14px !important;
  box-shadow: none !important;
}

.intercom-input .el-input__wrapper.is-focus,
.intercom-input .el-select-v2__wrapper.is-focused,
.intercom-input .el-textarea__inner:focus {
  border-color: rgba(223, 158, 142, 0.55) !important;
  box-shadow: 0 0 0 4px rgba(223, 158, 142, 0.10) !important;
}

.ghost-btn {
  border: 1px solid var(--cdp-line-soft) !important;
  background: rgba(255, 255, 255, 0.58) !important;
  color: var(--cdp-text-secondary) !important;
}
```

- [ ] **Step 3: 手工检查普通模式表单交互**

Run: `npm run dev`  
Expected: 页面可打开，普通模式下输入框、选择器、单选、多选、日期选择器都能正常操作，聚焦态为浅暖色柔光，无蓝紫残留

- [ ] **Step 4: 提交表单与控件视觉统一**

```bash
git add cdp-web/src/components/DynamicForm.vue cdp-web/src/styles/cdp-global.css
git commit -m "style: align form controls with soft warm visual system"
```

---

### Task 5: 批量模式补齐家族化视觉并完成验收

**Files:**
- Modify: `cdp-web/src/components/BatchMode.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`
- Modify: `docs/superpowers/specs/2026-05-14-cdp-ui-redesign-design.md`

- [ ] **Step 1: 仅调整批量模式壳层与卡片皮肤，不改其业务结构**

```css
/* cdp-web/src/styles/cdp-global.css */
.batch-workspace {
  min-height: calc(100vh - 124px);
  border: 1px solid var(--cdp-line-soft);
  border-radius: var(--cdp-radius-xl);
  background: rgba(255, 252, 248, 0.64);
  backdrop-filter: blur(18px);
}

.template-card,
.final-card {
  background: var(--cdp-bg-panel);
  border: 1px solid var(--cdp-line-soft);
  box-shadow: var(--cdp-shadow-card);
}
```

- [ ] **Step 2: 清理批量模式里过亮的强调按钮与标题色**

```vue
<!-- cdp-web/src/components/BatchMode.vue -->
<el-button class="primary-soft-btn" @click="fetchTemplates">
  <el-icon><Download /></el-icon>
  获取标准模板
</el-button>
```

- [ ] **Step 3: 更新设计说明中的落地状态**

```md
<!-- docs/superpowers/specs/2026-05-14-cdp-ui-redesign-design.md -->
## 当前落地状态

- 普通模式已完成首轮结构重构与视觉升级
- 批量模式已完成壳层与视觉语言对齐
- 后续如需继续推进，可再拆第二期交互动效与批量模式深度结构升级
```

- [ ] **Step 4: 完整验收**

Run: `npm run type-check && npm run build`  
Expected: PASS

手工验收清单：

- 普通模式顶部栏、左侧轻导航、中部主舞台、右侧抽屉全部可见且布局稳定
- 节点新增、复制、删除、收起、拖拽、摘要查看、JSON 复制仍可用
- 页面不存在蓝色或紫色高亮残留
- 批量模式与普通模式在色彩、圆角、阴影、表面语言上属于同一家族

- [ ] **Step 5: 提交收尾改造**

```bash
git add cdp-web/src/components/BatchMode.vue cdp-web/src/styles/cdp-global.css docs/superpowers/specs/2026-05-14-cdp-ui-redesign-design.md
git commit -m "style: align batch mode with redesigned product shell"
```
