# Gallery White 纯白侧轨视觉修订

## 背景

当前 Gallery White 主题将工作台、方案中心和任务中心的左右侧轨统一为 `--ui-fill: #f5f5f7`。虽然色温中性，但连续的大面积冷灰在三栏布局中形成闷重、发脏的观感。用户已确认先采用 A「纯白侧轨」；若实机观感仍不够干净，再评估 C「全白边框化」。

## 已确认方向：A「纯白侧轨」

- 工作台 `.left-panel`、`.right-panel` 使用纯白 `--ui-surface`。
- 方案中心 `.solution-sidebar`、`.solution-settings` 使用纯白 `--ui-surface`。
- 任务中心 `#app .tc-control-panel` 使用纯白 `--ui-surface`，与监控画布保持一致。
- 三栏层级不再依赖大面积灰底，改由 `--ui-divider` 发丝分隔线、留白、标题字重和内层控件边界表达。
- `--ui-fill` 继续保留，但只用于输入框、禁用态、轻量 hover、空状态或小型功能块，不允许重新成为整列背景。
- 中栏画布继续保持纯白；黑色主要操作、Signal Orange 和 P1 语义色规则不变。

## 视觉验收

- 1440×900 下，工作台和方案中心左右栏肉眼呈纯白，不再出现连续冷灰色带。
- 三栏边界仍清晰，但只表现为极细中性分隔线，不增加阴影或粗描边。
- 内层输入框、禁用按钮等仍可使用少量 `--ui-fill`，因此控件与白色侧轨之间有足够层级。
- 不改变布局宽度、滚动、响应式、交互、模板或脚本。

## 实现范围

- 修改 `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`，先增加侧轨必须使用纯白 surface 的契约并确认 RED。
- 修改 `cdp-web/src/styles/cdp-global.css` 的现有 Gallery White 最终主题层，将五类侧轨从 `var(--ui-fill)` 攑为 `var(--ui-surface)`。
- 不修改任何 Vue 文件、业务逻辑、API、路由、store、composable、后端、依赖或配置。

## 验证

- Gallery White 聚焦契约先 RED 后 GREEN。
- 全量前端 Node 测试与生产构建通过。
- dirty-color、允许路径、Vue 保护区和 `git diff --check` 继续通过。
- 在隔离预览 `http://localhost:5174/` 检查工作台、方案中心和任务中心的纯白侧轨。

## 备选回退

若 A 仍显脏，下一轮采用 C：内层卡片也改为纯白，只保留边框和留白。C 不在本次实现范围内，必须由用户查看 A 后再次确认。
