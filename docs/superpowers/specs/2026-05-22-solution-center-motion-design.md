# Solution Center UI Motion & Interaction Design

**Date**: 2026-05-22  
**Status**: Approved  
**Scope**: 方案中心全链路 UI 动效优化

## 1. Design Principles

- **Zero dependency** — CSS transition/animation + Vue `<Transition>` / `<TransitionGroup>` only. No GSAP, no Motion One.
- **Preserve all existing styles** — colors, fonts, spacing, Element Plus defaults unchanged.
- **Preserve all business logic** — API calls, state management, reactivity unchanged.
- **Progressive enhancement** — every animation degrades gracefully (prefers-reduced-motion).

## 2. Motion Tokens (global CSS variables)

```css
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out-quint: cubic-bezier(0.83, 0, 0.17, 1);
--motion-fast: 150ms;
--motion-normal: 280ms;
--motion-slow: 450ms;
```

## 3. New File: composables/useMotion.js

Three utility functions:

| Function | Purpose |
|----------|---------|
| `useCascadingEntry(el, { delay })` | Returns `entered` ref; when true, apply staggered entry animation with given delay |
| `useDragElastic()` | Returns `{ offsetX, offsetY, onDragMove }` for elastic drag-follow |
| `useStateTransition(current)` | Returns reactive `phase`: `'entering'` (first 300ms) → `'idle'` |

## 4. Component Changes — 12 Interaction Points, 4 Batches

### Batch 1: Infrastructure
- **cdp-global.css**: Add `:root` motion tokens + reusable classes (`.cascade-enter`, `.fade-slide-up`, `.scale-in`, `.pulse-breath`, `.collapse-expand`)
- **useMotion.js**: New composable

### Batch 2: Folder Tree + Dirty Dot + Button Feedback
- **FolderTree.vue / FolderTreeNode.vue**: Wrap recursive children in `<Transition name="folder-children">`
- **SolutionCenter.vue**: `.pulse-breath` on dirty dot; save/publish buttons get `@keyframes success-flash` and `@keyframes publish-ring`

### Batch 3: SolutionCenter — List, Nodes, Custom Fields, Drawer
- **SolutionCenter.vue**: 
  - Solution list: `<TransitionGroup name="solution-list">` + inline `animation-delay`
  - Solution switch: `<Transition name="solution-switch">` on center panel
  - Node collapse: `<Transition name="node-collapse">` replacing `v-show`
  - Custom field cards: `<TransitionGroup name="cf-cards">` + elastic drag
  - Node add/remove: `<TransitionGroup name="node-list">`
- **SolutionPreviewDrawer.vue**: Field cards with `<TransitionGroup>` + staggered entry

### Batch 4: NormalMode — Mode Switch + Field Cards
- **NormalMode.vue**:
  - Free-build ↔ solution-use: `<Transition name="mode-switch">`
  - Field card bar: elastic drag via `useDragElastic`

## 5. Reduced Motion

All animations gated behind:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 6. Verification

After each batch:
1. Run `node cdp-web/src/utils/solutionState.test.mjs` (16 tests)
2. Run `node cdp-web/src/App.navigation.test.mjs` (3 tests)
3. Manual smoke test: create draft → add nodes → edit custom fields → save → publish → load in workbench
