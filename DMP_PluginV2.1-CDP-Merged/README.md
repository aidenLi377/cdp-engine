# DMP Copilot - CDP 联合执行器

这是基于 DMP Plugin V2.0 创建的独立合并版本。原 DMP 插件目录和 CDP 项目自带插件均作为只读来源，不需要同时安装。

## 合并能力

- 保留 DMP Copilot 原有面板、画像数据提取、Rebase、字段控制、方案口令和 CSV 导出。
- 支持 CDP 工作台自动打开 DataBank 并执行参数粘贴。
- 支持 CDP 任务中台的 DataBank 人群匹配与 DataHub 状态检查。
- 支持 CDP 任务中台的 DMP 人群匹配、画像等待和指定标签结果提取。
- CDP 网页与插件面板共享多条件就绪状态、显示字段和 Rebase 标签设置。
- 两个入口统一返回覆盖人数、Rebase 后人数、CTR/PPC 等十个标准字段。
- 使用 `chrome.storage.session` 保存长任务标签页，降低 MV3 后台休眠导致任务中断的风险。

## 本地安装

1. 打开 Chrome 扩展程序管理页。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择当前 `DMP_PluginV2.1-CDP-Merged` 目录。
5. 刷新 CDP、DataBank 和 DMP 页面。

开发验证期间请保留原 DMP V2.0，但不要同时启用两个版本，避免两个插件同时注入 DMP 页面。

## 当前允许的 CDP 地址

- `https://duruo377.top`
- `http://127.0.0.1:5173`
- `http://localhost:5173`

新增或变更线上域名时，需要同时更新 `manifest.json` 的 `host_permissions`、CDP `content_scripts.matches`，以及 `background.js` 的 `ALLOWED_ORIGINS`。

## 文件职责

- `content.js`：DMP Copilot 原有面板与数据能力。
- `hook.js`：DMP 页面主世界 XHR 拦截，仅保留一份。
- `background.js`：CDP 跨页面任务调度。
- `bridge.js`：CDP 页面与扩展后台之间的消息桥。
- `databank-automation.js`：DataBank 页面自动化。
- `cdp-dmp-automation.js`：DMP 页面自动搜索、等待和结果回传。
- `dmp-result-core.js`：与原插件一致的条件请求、覆盖人数和 Rebase 纯计算核心。
- `panel.html`：DMP Copilot 原有界面。

## 自动检查

在本目录运行：

```powershell
node --test tests/*.test.mjs
```
