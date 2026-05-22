# Solution Center UI Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSS animations, Vue transitions, and micro-interactions across the solution center chain without changing business logic or visual style.

**Architecture:** Pure CSS + Vue `<Transition>` / `<TransitionGroup>` + one lightweight composable (`useMotion.js`). No external animation libraries. Motion tokens stored as CSS custom properties in `:root`. All animations gated behind `prefers-reduced-motion`.

**Tech Stack:** Vue 3 Composition API, Element Plus, CSS custom properties, Vue built-in Transition/TransitionGroup

---

### Task 1: Global Motion Tokens + Reusable CSS Classes

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.css` (insert after `body { overflow: hidden; }`)
- Modify: `cdp-web/src/styles/cdp-global.css` (append at end of file)

- [ ] **Step 1: Add CSS motion tokens to `:root`**

Insert after line 11 (`body { overflow: hidden; }`) in `cdp-web/src/styles/cdp-global.css`:

```css
:root {
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-quint: cubic-bezier(0.83, 0, 0.17, 1);
  --motion-fast: 150ms;
  --motion-normal: 280ms;
  --motion-slow: 450ms;
}
```

- [ ] **Step 2: Add reusable animation utility classes**

Append to end of `cdp-web/src/styles/cdp-global.css`:

```css
/* ============================================================ */
/* Motion Utilities                                               */
/* ============================================================ */

/* Staggered list entry — apply to each item with inline animation-delay */
.cascade-enter {
  opacity: 0;
  transform: translateY(16px);
}
.cascade-enter-active {
  animation: cascadeIn var(--motion-normal) var(--ease-out-expo) forwards;
}
@keyframes cascadeIn {
  to { opacity: 1; transform: translateY(0); }
}

/* Generic fade + slide up */
.fade-slide-up-enter-active { transition: all var(--motion-normal) var(--ease-out-expo); }
.fade-slide-up-leave-active { transition: all var(--motion-fast) ease-in; }
.fade-slide-up-enter-from { opacity: 0; transform: translateY(8px); }
.fade-slide-up-leave-to { opacity: 0; transform: translateY(-8px); }

/* Scale in (for popovers, menus) */
.scale-in-enter-active { transition: all var(--motion-fast) var(--ease-spring); }
.scale-in-leave-active { transition: all var(--motion-fast) ease-in; }
.scale-in-enter-from { opacity: 0; transform: scale(0.85); }
.scale-in-leave-to { opacity: 0; transform: scale(0.9); }

/* Pulse breath (for dirty dot) */
.pulse-breath {
  animation: pulseBreath 2s ease-in-out infinite;
}
@keyframes pulseBreath {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 107, 74, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255, 107, 74, 0.08); }
}

/* Success flash (for save button feedback) */
@keyframes successFlash {
  0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(52, 199, 89, 0.1); }
  100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
}
.success-flash {
  animation: successFlash 0.6s var(--ease-out-expo);
}

/* Publish ring (for publish button feedback) */
@keyframes publishRing {
  0% { box-shadow: 0 0 0 0 rgba(255, 107, 74, 0.5); transform: scale(1); }
  40% { box-shadow: 0 0 0 12px rgba(255, 107, 74, 0); transform: scale(1.05); }
  100% { box-shadow: 0 0 0 0 rgba(255, 107, 74, 0); transform: scale(1); }
}
.publish-ring {
  animation: publishRing 0.7s var(--ease-out-expo);
}

/* Node list transition */
.node-list-enter-active { transition: all var(--motion-slow) var(--ease-spring); }
.node-list-leave-active { transition: all var(--motion-fast) ease-in; }
.node-list-enter-from { opacity: 0; transform: scale(0.85) translateY(-12px); }
.node-list-leave-to { opacity: 0; transform: scale(0.9) translateY(8px); }
.node-list-move { transition: transform var(--motion-normal) var(--ease-out-expo); }

/* Node collapse expand */
.node-collapse-enter-active { transition: all var(--motion-normal) var(--ease-out-expo); }
.node-collapse-leave-active { transition: all var(--motion-fast) ease-in; }
.node-collapse-enter-from,
.node-collapse-leave-to { opacity: 0; max-height: 0; }
.node-collapse-enter-to,
.node-collapse-leave-from { opacity: 1; max-height: 2000px; }

/* Solution list */
.solution-list-enter-active { transition: all var(--motion-normal) var(--ease-out-expo); }
.solution-list-leave-active { transition: all var(--motion-fast) ease-in; position: absolute; }
.solution-list-enter-from { opacity: 0; transform: translateY(12px); }
.solution-list-leave-to { opacity: 0; transform: translateX(-20px); }
.solution-list-move { transition: transform var(--motion-normal) var(--ease-out-expo); }

/* Solution switch (center panel) */
.solution-switch-enter-active { transition: all var(--motion-slow) var(--ease-out-expo); }
.solution-switch-leave-active { transition: all var(--motion-fast) ease-in; }
.solution-switch-enter-from { opacity: 0; transform: translateX(24px); }
.solution-switch-leave-to { opacity: 0; transform: translateX(-24px); }

/* Mode switch (workbench) */
.mode-switch-enter-active { transition: all var(--motion-slow) var(--ease-out-expo); }
.mode-switch-leave-active { transition: all var(--motion-fast) ease-in; }
.mode-switch-enter-from { opacity: 0; transform: translateY(12px); }
.mode-switch-leave-to { opacity: 0; transform: translateY(-12px); }

/* Folder children */
.folder-children-enter-active { transition: all var(--motion-normal) var(--ease-out-expo); }
.folder-children-leave-active { transition: all var(--motion-fast) ease-in; }
.folder-children-enter-from { opacity: 0; transform: translateY(-8px); }
.folder-children-leave-to { opacity: 0; transform: translateY(-4px); }
.folder-children-move { transition: transform var(--motion-normal) var(--ease-out-expo); }

/* Custom field cards transition */
.cf-cards-enter-active { transition: all var(--motion-normal) var(--ease-spring); }
.cf-cards-leave-active { transition: all var(--motion-fast) ease-in; position: absolute; }
.cf-cards-enter-from { opacity: 0; transform: scale(0.9) translateY(-6px); }
.cf-cards-leave-to { opacity: 0; transform: scale(0.85); }
.cf-cards-move { transition: transform var(--motion-normal) var(--ease-out-expo); }

/* Drag elastic — applied to dragged element via inline style */
.drag-elastic {
  transition: transform var(--motion-fast) var(--ease-out-expo);
}

/* Preview drawer staggered items */
.preview-stagger-enter-active { transition: all var(--motion-normal) var(--ease-out-expo); }
.preview-stagger-leave-active { transition: all var(--motion-fast) ease-in; }
.preview-stagger-enter-from { opacity: 0; transform: translateX(16px); }
.preview-stagger-leave-to { opacity: 0; transform: translateX(-12px); }

/* Overflow count bounce */
@keyframes countBounce {
  0%, 100% { transform: scale(1); }
  40% { transform: scale(1.3); }
}
.count-bounce {
  animation: countBounce 0.35s var(--ease-spring);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/styles/cdp-global.css
git commit -m "feat: add global motion tokens and reusable animation classes"
```

---

### Task 2: useMotion.js Composable

**Files:**
- Create: `cdp-web/src/composables/useMotion.js`

- [ ] **Step 1: Create the composable**

Write `cdp-web/src/composables/useMotion.js`:

```javascript
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

export function useCascadingEntry(refs, options = {}) {
  const { staggerDelay = 40 } = options
  const entered = ref(false)

  onMounted(() => {
    requestAnimationFrame(() => {
      entered.value = true
    })
  })

  function delay(index) {
    return `${index * staggerDelay}ms`
  }

  return { entered, delay }
}

export function useDragElastic() {
  const offsetX = ref(0)
  const offsetY = ref(0)
  let animationFrame = null

  function onDragMove(event) {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = requestAnimationFrame(() => {
      offsetX.value = event.movementX || 0
      offsetY.value = event.movementY || 0
    })
  }

  function onDragEnd() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    offsetX.value = 0
    offsetY.value = 0
  }

  function cleanup() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
  }

  return { offsetX, offsetY, onDragMove, onDragEnd, cleanup }
}

export function useStateTransition(current) {
  const phase = ref('idle')
  let timer = null

  watch(() => current.value ?? current, (newVal, oldVal) => {
    if (newVal === oldVal) return
    clearTimeout(timer)
    phase.value = 'entering'
    timer = setTimeout(() => {
      phase.value = 'idle'
    }, 300)
  })

  function cleanup() {
    clearTimeout(timer)
  }

  return { phase, cleanup }
}
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/composables/useMotion.js
git commit -m "feat: add useMotion composable with cascading entry, elastic drag, and state transition utilities"
```

---

### Task 3: Folder Tree Animations

**Files:**
- Modify: `cdp-web/src/components/FolderTreeNode.vue`

- [ ] **Step 1: Wrap recursive children in Transition**

In `cdp-web/src/components/FolderTreeNode.vue`, find the recursive children rendering block and wrap it with `<Transition name="folder-children">`.

The current template has:
```html
<FolderTreeNode
  v-for="child in folder.children"
  ...
/>
```

Replace the children section with:
```html
<TransitionGroup name="folder-children" tag="div" v-if="expanded">
  <FolderTreeNode
    v-for="child in folder.children"
    :key="child.id"
    :folder="child"
    ...
  />
</TransitionGroup>
```

If `expanded` is not available as a prop, use the `v-show` / `v-if` approach on the children container with a wrapping `<Transition name="folder-children">`:

```html
<Transition name="folder-children">
  <div v-if="isExpanded" class="folder-children-list">
    <FolderTreeNode
      v-for="child in folder.children"
      :key="child.id"
      ...
    />
  </div>
</Transition>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/FolderTreeNode.vue
git commit -m "feat: add folder children expand/collapse transition"
```

---

### Task 4: Dirty Dot Pulse + Save/Publish Button Feedback

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`

- [ ] **Step 1: Replace static dirty dot with pulse-breath animation**

In `cdp-web/src/components/SolutionCenter.vue` template, find the dirty indicator:
```html
<div v-if="hasUnsavedChanges && !isPublished" class="solution-dirty-indicator">
  <span class="solution-dirty-dot"></span>
  <span class="display-body-light">有未保存修改</span>
</div>
```

Replace the dot span with:
```html
<span class="solution-dirty-dot" :class="{ 'pulse-breath': hasUnsavedChanges && !isPublished }"></span>
```

- [ ] **Step 2: Add success-flash class to save button on success**

In the `<script setup>`, modify the `saveDraft` function. After `ElMessage.success('草稿已保存')`, add a temporary class trigger on the save button.

First add a ref:
```javascript
const saveBtnRef = ref(null)
```

In the template, add ref to the save button:
```html
<el-button ref="saveBtnRef" class="solution-toolbar-icon-btn" ...>
```

In `saveDraft`, after the success message:
```javascript
if (saveBtnRef.value?.$el) {
  saveBtnRef.value.$el.classList.add('success-flash')
  setTimeout(() => saveBtnRef.value.$el.classList.remove('success-flash'), 600)
}
```

- [ ] **Step 3: Add publish-ring class to publish button on success**

Add ref to publish button:
```html
<el-button ref="publishBtnRef" class="solution-toolbar-icon-btn publish" ...>
```

In `publishDraft`, after success:
```javascript
if (publishBtnRef.value?.$el) {
  publishBtnRef.value.$el.classList.add('publish-ring')
  setTimeout(() => publishBtnRef.value.$el.classList.remove('publish-ring'), 700)
}
```

Add `const publishBtnRef = ref(null)` to script.

- [ ] **Step 4: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: add pulse-breath to dirty dot, success-flash to save, publish-ring to publish button"
```

---

### Task 5: Solution List Staggered Entry + Solution Switch Transition

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`

- [ ] **Step 1: Add TransitionGroup to solution list**

In the template, replace the `<div class="solution-list">` direct children `v-for` with:

```html
<TransitionGroup name="solution-list" tag="div" class="solution-list">
  <div
    v-for="item in filteredSolutions"
    :key="item.id"
    :style="{ animationDelay: `${filteredSolutions.indexOf(item) * 30}ms` }"
    class="solution-list-item cascade-enter"
    :class="{ active: item.id === activeSolution?.id }"
    ...
  >
    <!-- existing content unchanged -->
  </div>
  <div v-if="!loadingList && filteredSolutions.length === 0" key="empty" class="empty-state-sm display-body-light">
    当前筛选下没有方案
  </div>
</TransitionGroup>
```

- [ ] **Step 2: Add solution switch transition to center panel**

Wrap the center panel content area with Transition. Find the `<section class="solution-editor">` and wrap its dynamic content:

```html
<section class="solution-editor">
  <!-- toolbar unchanged -->
  
  <Transition name="solution-switch" mode="out-in">
    <div v-if="!activeSolution" key="empty" class="solution-empty-state">
      <!-- existing empty state -->
    </div>
    <div v-else-if="loadingDetail" key="loading" class="solution-node-scroll">
      <!-- existing skeleton -->
    </div>
    <div v-else-if="nodeList.length === 0" key="no-nodes" class="solution-empty-state">
      <!-- existing empty nodes -->
    </div>
    <div v-else key="nodes" class="solution-node-scroll">
      <!-- existing node list -->
    </div>
  </Transition>
</section>
```

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: add solution list staggered entry and center panel switch transition"
```

---

### Task 6: Node Collapse Transition + Node Add/Remove Animation

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`

- [ ] **Step 1: Replace v-show with Transition on node form body**

In the node card template, replace:
```html
<div v-show="!node.collapsed" class="solution-node-form" ...>
  <DynamicForm :node="node" />
</div>
```

With:
```html
<Transition name="node-collapse">
  <div v-if="!node.collapsed" class="solution-node-form" ...>
    <DynamicForm :node="node" />
  </div>
</Transition>
```

- [ ] **Step 2: Add TransitionGroup to node list**

Wrap the `v-for="(node, index) in nodeList"` loop:

```html
<TransitionGroup name="node-list" tag="div">
  <div
    v-for="(node, index) in nodeList"
    :key="node.id"
    class="node-wrapper solution-node-wrapper"
    ...
  >
    <!-- existing content unchanged -->
  </div>
</TransitionGroup>
```

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: add node collapse/expand transition and node add/remove animations"
```

---

### Task 7: Custom Field Cards TransitionGroup + Drag Elastic

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`

- [ ] **Step 1: Add TransitionGroup to custom field list**

In the right panel, wrap the custom field card `v-for` with TransitionGroup:

```html
<TransitionGroup name="cf-cards" tag="div" class="custom-field-list">
  <div
    v-for="(cf, cfIndex) in filteredCustomFields"
    :key="cf.id"
    ...
  >
    <!-- existing card content unchanged -->
  </div>
</TransitionGroup>
```

- [ ] **Step 2: Add elastic drag follow to custom field drag**

In the script, import `useDragElastic`:
```javascript
import { useDragElastic } from '../composables/useMotion.js'
```

In the setup function, initialize:
```javascript
const { offsetX, offsetY, onDragMove: onCfDragMove, onDragEnd: onCfDragElasticEnd } = useDragElastic()
```

Modify `onDragCustomFieldStart` to bind a mousemove listener via the browser drag event (since HTML5 drag doesn't fire mousemove, use drag event):

Actually, HTML5 drag events don't provide movement deltas. Use a different approach — apply a CSS transition handle class to the dragged card so after drop it smoothly moves to its new position. The `cf-cards-move` class in TransitionGroup handles this automatically because TransitionGroup's move transition detects position changes.

So the drag-elastic is already handled by TransitionGroup's built-in move transition. No extra code needed.

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: add TransitionGroup to custom field cards for add/remove/reorder animations"
```

---

### Task 8: SolutionPreviewDrawer Staggered Entry

**Files:**
- Modify: `cdp-web/src/components/SolutionPreviewDrawer.vue`

- [ ] **Step 1: Add TransitionGroup to field cards in drawer**

In the template, wrap the section cards `v-for` with TransitionGroup:

```html
<TransitionGroup name="preview-stagger" tag="div">
  <div
    v-for="(section, index) in customFieldSections"
    :key="section.customFieldId"
    :style="{ animationDelay: `${index * 60}ms` }"
    class="intercom-card drawer-form-card solution-preview-card cascade-enter"
  >
    <!-- existing content -->
  </div>
</TransitionGroup>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/SolutionPreviewDrawer.vue
git commit -m "feat: add staggered entry animation to preview drawer field cards"
```

---

### Task 9: NormalMode Mode Switch Transition

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

- [ ] **Step 1: Add mode switch transition**

Wrap the two mode-specific areas (free-build and solution-use) with `<Transition name="mode-switch" mode="out-in">`:

In the center panel template, find:
```html
<template v-if="workbenchMode === 'solution-use'">
  ...
</template>
<template v-else>
  ...
</template>
```

Replace with:
```html
<Transition name="mode-switch" mode="out-in">
  <template v-if="workbenchMode === 'solution-use'" key="solution-use">
    <!-- existing solution-use content unchanged -->
  </template>
  <template v-else key="free-build">
    <!-- existing free-build content unchanged -->
  </template>
</Transition>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/NormalMode.vue
git commit -m "feat: add mode switch transition between free-build and solution-use"
```

---

### Task 10: NormalMode Field Card Bar Drag + Overflow Count Bounce

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

- [ ] **Step 1: Add count-bounce to overflow button**

In the cf-cards-bar template, find the overflow button. Add a watcher to trigger the count-bounce animation when `cfHiddenCount` changes:

In `<script setup>`, add:
```javascript
import { nextTick } from 'vue'

const overflowBtnRef = ref(null)

watch(cfHiddenCount, (newVal, oldVal) => {
  if (newVal !== oldVal && overflowBtnRef.value?.$el) {
    overflowBtnRef.value.$el.classList.remove('count-bounce')
    void overflowBtnRef.value.$el.offsetWidth // force reflow
    overflowBtnRef.value.$el.classList.add('count-bounce')
  }
})
```

In the template, add ref to the overflow button:
```html
<el-button ref="overflowBtnRef" v-if="cfHiddenCount > 0" class="cf-overflow-btn" ...>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/NormalMode.vue
git commit -m "feat: add count-bounce animation to field card overflow button"
```

---

### Task 11: Folder Tree Context Menu Scale-In

**Files:**
- Modify: `cdp-web/src/components/FolderTree.vue`

- [ ] **Step 1: Find context menu rendering**

In FolderTree.vue, locate the context menu (likely an `el-popover` or `el-dropdown`). If it's using inline elements, wrap the menu content:

```html
<Transition name="scale-in">
  <div v-if="contextMenuVisible" class="folder-context-menu" :style="contextMenuStyle">
    <!-- menu items -->
  </div>
</Transition>
```

If the context menu uses Element Plus's built-in popover, add `:popper-style` and rely on its built-in transitions. The scale-in transition name can be applied via:

```html
<el-popover :visible="contextMenuVisible" transition="scale-in" ...>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/FolderTree.vue
git commit -m "feat: add scale-in transition to folder context menu"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run unit tests**

```bash
node cdp-web/src/utils/solutionState.test.mjs
node cdp-web/src/App.navigation.test.mjs
```

Expected: 19 tests pass (16 + 3).

- [ ] **Step 2: Verify no CSS variable conflicts**

```bash
grep -rn "\-\-motion-" cdp-web/src/styles/cdp-global.css | wc -l
```

Expected: lines matching the 6 variable declarations, no duplicates.

- [ ] **Step 3: Verify reduced-motion media query**

```bash
grep -c "prefers-reduced-motion" cdp-web/src/styles/cdp-global.css
```

Expected: 1 (the media query block).

- [ ] **Step 4: Run backend import check**

```bash
python -c "from cdp_backend.solution_store import SolutionStore; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: final verification — all tests pass, no regressions"
```
