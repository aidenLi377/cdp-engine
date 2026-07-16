# Gallery White 信息减法与手动人群包名称设计

## 背景

Gallery White 已完成纯白三栏、无灰下拉、独立胶囊和参数精确联动。用户在 `1538×674` 实机视图继续标注了 11 个问题，集中在三类体验：左侧组件库边框和控件过密；页面重复解释文案过多；胶囊及任务按钮文字没有稳定双轴居中。另有一项明确行为调整：取消工作台根据节点参数自动生成人群包名称。

本轮延续 Apple-like 黑白橙方向，采用用户确认的 A「无框行列表」。目标不是增加新的视觉装饰，而是继续做减法：去外壳、去解释、去灰底、统一对齐；橙色只用于加号、细轨和焦点信号。

## 已确认决策

- 左侧行为组件库采用 A「无框行列表」。
- 新建或清空工作台时，人群包名称为空，只由用户手动输入。
- 加载已发布方案时，仅带入方案已保存的 `defaultCrowdName`；没有已保存名称则保持为空。
- 空名称仍允许执行“去圈人”，最终 JSON/请求使用“未命名人群包”兜底，但输入框不被回填。
- “自定义字段（一对多）”改为“自定义字段”；悬停或键盘聚焦标题时，右上角显现“一对多”微型标签。
- 不改变后端、接口、任务执行函数、方案数据结构或三栏布局。

## 11 条批注映射

| # | 目标 | 设计结果 |
|---|---|---|
| 1 | 行为组件库过密、搜索占位大、外框重 | 去掉组件库最外层卡片边框/圆角外壳；删除解释；搜索框压为 32px；组件改为单列无框行。 |
| 2 | 不要自动生成人群包名称 | 删除自动命名状态、标记、函数和监听调用；新建/清空为空，方案加载只读已保存默认名。 |
| 3 | 工作台标题解释 | 删除“自由搭建当前画布，并可直接存为方案草稿”。 |
| 4 | 顶部三个胶囊文字未居中 | 三个导航内部统一 `inline-flex` 双轴居中和稳定 `line-height: 1`。 |
| 5 | 方案中心解释 | 删除“草稿编辑、发布与工作台预览”。 |
| 6 | 应用标题解释 | 删除“可视化搭建、方案管理与任务调度”。 |
| 7 | 方案状态胶囊文字未上下居中 | 方案库和状态筛选胶囊统一双轴居中。 |
| 8 | 自定义字段“一对多”标志 | 标题只显示“自定义字段”，右上角设置 hover/focus 显现的“一对多”微型标签。 |
| 9 | 自定义字段解释 | 删除“创建字段，让一个字段控制多个组件”。 |
| 10 | 任务中台仍有灰色按钮 | 所有任务中台按钮的 disabled 表面改为纯白，使用边框、文字色和 cursor 表达禁用。 |
| 11 | 任务中台按钮文字居中 | `运行`、`显示字段`、`Rebase` 等按钮统一双轴居中，不依赖默认行高。 |

## 视觉设计

### 行为组件库：A 无框行列表

- `.workbench-package-section` 保留布局职责，但移除自身外边框、圆角、阴影和环境填充。
- 左侧栏与中栏之间的结构分隔线继续保留；本轮只移除组件库内部卡片外壳，不改变三栏骨架。
- 标题只保留“行为组件库”，删除动态解释行，包括自由搭建和方案使用态的解释文案。
- 搜索框固定 32px 高，使用白底、`--ui-divider` 细边、紧凑左右内边距和线性搜索图标。
- 组件项为 30–32px 单列行：
  - 默认：白底、无边框、无阴影、深色文字。
  - hover/focus：仍为白底；只显示橙色右侧加号或 2px 左侧细轨，文字提升为 `--ui-ink`。
  - active/pressed：不增加持久灰块，不改变当前点击添加行为。
- 长名称完整显示或单行省略，不通过双列布局制造换行密度。
- 滚动条继续保留，但采用既有中性细滚动条规则。

### 页面解释文案减法

移除以下可见文案及其空白占位：

- `App.vue`：可视化搭建、方案管理与任务调度。
- `NormalMode.vue`：自由搭建时可继续增删节点；已应用方案，仍可继续增删节点和调整逻辑关系；自由搭建当前画布，并可直接存为方案草稿。
- `SolutionCenter.vue`：草稿编辑、发布与工作台预览；创建字段，让一个字段控制多个组件。

删除后标题容器不保留为解释行预留的高度。方案使用时真正表示状态或结构偏离的动态信息继续保留，因为它们不是装饰性解释。

### 胶囊与任务按钮居中

以下控件内部统一设置 `display: inline-flex`、`align-items: center`、`justify-content: center`、`line-height: 1` 和 `box-sizing: border-box`：

- `.app-shell-nav .el-radio-button__inner`
- `.solution-library-switch .el-radio-button__inner`
- `.solution-filter-group .el-radio-button__inner`
- `.task-center-page button` 与 `.task-center-page .el-button`，覆盖运行、取消、显示字段、Rebase、全选、关闭、重试、复制、导出、清空和删除等当前可见按钮

本轮不改变已确认的高度：主导航 30px、方案筛选 28px、摘要工具栏 32px。文字中心以计算样式和元素矩形验证，而不是仅靠截图主观判断。

### 任务中台去灰

- `.task-center-page button:disabled` 与 `.task-center-page .el-button.is-disabled` 使用 `--ui-surface` 白底，并为 `.tc-btn-sm:disabled`、`.tc-settings-btn:disabled` 保留更具体的最终覆盖。
- 禁用语义通过 `--ui-text-tertiary`、`--ui-control-border`、`cursor: not-allowed` 和必要的文字透明度表达。
- disabled hover 仍为白底，无灰块、无位移、无阴影。
- 非禁用主要操作继续使用黑底；危险取消操作继续使用既有危险色，本轮不改状态语义。
- 标签卡、历史卡等非按钮表面不因本条批注扩大修改范围。

### 自定义字段“一对多”微型标签

- 标题改为“自定义字段”。
- 标题区域增加语义明确的 focusable wrapper；右上角放置 `.solution-custom-field-kind-badge`。
- badge 默认 `opacity: 0` 且不占标题排版宽度；hover 标题区域或键盘 `:focus-visible` 时显现。
- badge 使用黑底白字、999px 胶囊、9–10px 字号，无灰色背景和阴影。
- 过渡只使用短 opacity/translate 动画；`prefers-reduced-motion` 下立即显现。
- 底部按钮文案同步精简为“+ 新增自定义字段”，避免在同一卡片中再次重复“一对多”。

## 人群包名称行为

### 状态与初始化

- `crowdNameInput` 初始值由 `DEFAULT_CROWD_NAME` 改为空字符串。
- 删除 `nameAuto` 状态，以及快照中的 `nameAuto` 字段。
- `clearWorkbench()` 将名称重置为空字符串。
- 撤销/重做继续保存和恢复用户手动输入的 `crowdNameInput`；没有历史值时恢复为空，而不是“未命名人群包”。

### 删除自动生成链

- 删除输入框旁的“自动”提示和 tooltip。
- placeholder 改为“请输入人群包名称”。
- 删除 `generateCrowdName()` 及 watcher 中的调用。
- 添加节点不再把名称切回自动模式。
- `onNameManualEdit()` 只保留现有参数变更标记，不再切换自动状态。
- watcher 继续负责工作台字段约束、JSON 防抖生成和快照，不改变其他消费者。

### 方案加载与执行兜底

- 方案加载只读取 `record.defaultCrowdName`：存在非空值则带入；不存在则为空。
- 不再以 `record.name` 或节点参数作为可见输入框的替代名称。
- `generatedJson.crowdName` 和执行路径继续使用 `trimmed crowdNameInput || DEFAULT_CROWD_NAME`，实现用户确认的 B 方案。
- 空名称不会触发错误提示、不会禁用“去圈人”，也不会回写输入框。
- 草稿名称仍使用既有 `DEFAULT_DRAFT_NAME` 兜底，避免把人群包名称行为扩展到方案命名。

## 数据与错误边界

- 不发送新请求，不修改请求结构或后端验证。
- 不修改方案序列化字段，仅改变工作台可见名称的初始化和自动更新来源。
- 已保存方案的 `defaultCrowdName` 仍可读写；旧方案没有该字段时表现为空。
- 清空、撤销、重做、载入方案、复制 JSON 和去圈人均需覆盖空名称场景。
- 本轮不改变组件添加、搜索过滤、保存草稿、任务进度、扩展连接或 DMP 设置逻辑。

## 文件与技术边界

允许修改：

- `cdp-web/src/App.vue`：仅删除可见解释文案。
- `cdp-web/src/components/NormalMode.vue`：组件库模板、解释文案和手动名称最小状态流。
- `cdp-web/src/components/SolutionCenter.vue`：解释文案、自定义字段标题/badge 与新增按钮文案。
- `cdp-web/src/components/TaskCenter.vue`：按钮居中和 disabled 白底样式，不改脚本。
- `cdp-web/src/styles/cdp-global.css`：无框列表、搜索框、胶囊居中、badge 与最终 Gallery White 覆盖。
- 对应前端契约测试：`App.navigation.test.mjs`、`NormalMode.leftPanel.test.mjs`、`NormalMode.status.test.mjs`、`NormalMode.toolbar.test.mjs`、`SolutionCenter.listActions.test.mjs`、`TaskCenter.dmpParity.test.mjs`、`cdp-global.gallery-white.test.mjs`。

禁止修改：

- 后端、接口、扩展消息协议、依赖、构建配置、路由和权限。
- 任务执行函数、请求参数结构、方案序列化结构和持久化 schema。
- 三栏宽度、三栏顺序、组件库搜索过滤算法和行为组件添加函数。
- 已完成的全局下拉白底规则、参数精确联动和摘要工具栏行为。

## 测试策略

### TDD 契约

- 文案契约：本设计明确列出的解释文案全部不存在，必要标题和真实状态文案仍存在。
- 组件库契约：外壳无边框/圆角/阴影；搜索框 32px；组件项默认与 hover 都是白底且无持久边框。
- 名称契约：无 `nameAuto`、`generateCrowdName`、自动 tooltip 或 watcher 调用；初始化/清空为空；方案仅读 `defaultCrowdName`；JSON/执行保留“未命名人群包”兜底。
- 历史契约：快照继续保存 `crowdNameInput`，恢复缺失值为空。
- 居中契约：主导航、方案筛选以及 `.task-center-page` 内全部原生/Element Plus 按钮均显式双轴居中和 `line-height: 1`。
- 去灰契约：任务中台全部 disabled 按钮及其 hover 使用 `--ui-surface`，不使用 `--ui-fill` 或灰色字面背景；具体运行和设置按钮规则不得被旧样式覆盖。
- badge 契约：标题仅为“自定义字段”；badge 默认隐藏，hover/focus 显现；辅助文案和按钮中的重复“一对多”不存在。

### 回归与构建

- 先运行新增/修改的聚焦测试并确认 RED → GREEN。
- 运行全部 `cdp-web/src/**/*.test.mjs`。
- 运行 `npm run build`，要求 `vue-tsc` 和 Vite 成功。
- 审计 Vue 脚本：除 `NormalMode.vue` 中明确批准的名称状态流外，其他 Vue 脚本区不得变化。
- `git diff --check` 必须通过，变更路径必须全部属于上述允许范围和设计/计划文档。

### 浏览器验收

- 在 `1263×674`、`1538×674`、`1440×900` 检查 Workbench、Solution Center、Task Center。
- 组件库：无外壳边框、搜索框紧凑、行列表无灰、hover 只有橙色细信号、无横向溢出。
- 名称：新建/清空为空；手动输入不被节点变化覆盖；加载有默认名/无默认名方案分别正确；空名称执行时 JSON 使用兜底但输入框仍空。
- 胶囊/任务按钮：使用元素矩形和计算样式验证文字中心、白底 disabled、无蓝灰环境块。
- badge：鼠标 hover 与键盘 focus 均显现；移出/失焦隐藏；不遮挡字段数量和操作按钮。
- 页面无错误遮罩、无新增 console error、无裁切和布局跳动。

## 回退

- 组件库布局、文案减法、居中规则、任务按钮白底和 badge 均可作为独立 CSS/模板变更回退。
- 手动名称行为可独立回退 `crowdNameInput` 初始化、方案加载和自动生成链，不影响方案数据或任务接口。
- 任一回退均不需要数据库迁移或后端部署。
