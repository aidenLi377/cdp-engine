# 任务中台画像透视链路设计

## 核心判断

任务中台不应该只是“后台模拟官方页面点击”，而应该把 DMP-Plugin 的透视提效思路产品化到我们的系统里。

由于必须复用用户本地电脑上的数据引擎和达摩盘登录态，官方页面自动化不能主要放在服务器后台执行。第一版应把现有 Chrome 插件升级为“本地任务执行器”：用户只在我们的前端输入人群包名称、选择标签并点击开始，前端把任务发送给本地插件；插件在用户本机 Chrome 中访问官方页面、定位人群包、拿到 `crowdId`、进入达摩盘画像透视页，并直接复用 DMP-Plugin 的核心机制完成透视取数。

服务器后端负责记录任务、保存结果、提供标签字典和下载能力；本地插件负责使用用户本地登录态执行官方页面操作和 DMP 透视请求。

已验证的插件源码位置：

- GitHub: `https://github.com/aidenLi377/DMP-Plugin`
- 本地临时副本: `.runtime/DMP-Plugin`
- GitHub 访问约定: 默认使用代理 `127.0.0.1:7897`

源码核对结论：

- `hook.js` 负责拦截画像接口请求，保存 `{ url, payload }`。
- `content.js` 负责读取标签字典、循环替换 `tagId`、请求 `chartDataFull`、计算 Rebase。
- `dmp_tags_dictionary.json` 包含标签 ID、大类、类型、名称和 `needCondition`。
- 插件没有完整的“按人群包名称搜索达摩盘列表并拼接 crowdId 透视 URL”的代码。这个部分由我们的任务中台实现。

## 产品目标

第一版目标是让用户在我们的系统里完成完整入口：

1. 输入人群包名称。
2. 选择需要透视的标签。
3. 点击「开始透视」。
4. 前端创建任务并唤起本地 Chrome 插件。
5. 本地插件使用用户当前 Chrome 登录态静默推进：
   `定位人群包 -> 获取 crowdId -> 打开达摩盘透视页 -> 拦截画像请求 -> 批量替换标签取数 -> 生成结果`
6. 插件持续回传任务进度、失败原因和结果数据。
7. 后端保存结果并提供 Excel 下载。

开发阶段仍然保留两个输入框：

- 数据引擎测试人群包名称：只测试到数据引擎最终应用按钮之前。
- 达摩盘测试人群包名称：测试达摩盘搜索、精准匹配、读取 `crowdId`、进入透视页和批量取数。

正式形态再收敛为一个人群包名称输入框。

## MVP 标签范围

MVP 先测 3-5 个 `needCondition=false` 标签，默认使用：

- 居住城市: `160571`
- 用户年龄: `114555`
- 用户性别: `114554`
- 城市等级: `213510`
- 消费能力等级: `163535`

`needCondition=true` 标签第一版不自动下钻，返回“未配置下钻条件”或在标签选择器中禁用。

## 总体架构

```text
CDP Web
  任务中台页面
  - 输入人群包名称
  - 选择标签
  - 发送任务到本地插件
  - 查看任务进度
  - 查看结果预览/下载

CDP Backend
  RPA Task API
  - 创建任务
  - 查询任务
  - 下载结果
  - 返回标签字典
  - 接收插件回传的进度和结果

Chrome Extension Local Executor
  background.js
  - 接收 CDP Web 任务
  - 打开/聚焦官方页面 tab
  - 注入对应 content script
  - 汇总进度并回传前端/后端

  DatabankContent
  - 数据引擎搜索
  - 精准匹配
  - 打开应用确认弹窗
  - 真实执行时等待 dataHub 推送状态

  DmpContent
  - 达摩盘搜索
  - 精准匹配
  - 读取 crowdId
  - hover 人群名称等待画像透视入口
  - 拼接透视 URL

  DmpInsightContent
  - 直接迁移 DMP-Plugin 取数思路
  - 捕获画像请求
  - 替换 tagId 批量取数
  - 解析 chartDataFull
  - 计算 Rebase

  ResultBuilder / Backend
  - 结果预览
  - Excel 输出
```

## 本地登录态实现方式

必须使用本地 Chrome 插件执行官方页面自动化，原因是数据引擎和达摩盘登录态存在于用户本地浏览器中，服务器无法稳定、合规地读取用户浏览器 Cookie。

现有插件目录：

`chrome-extension/databank-automation`

现有能力：

- `manifest.json` 已使用 Manifest V3。
- `bridge.js` 已能接收 CDP Web 页面的 `postMessage`。
- `background.js` 已能校验来源、打开官方页面 tab、注入 `content.js` 并执行自动化。
- 当前 `externally_connectable` 和 `ALLOWED_ORIGINS` 只允许 `http://127.0.0.1:5173`，部署后必须加入正式域名。

升级方向：

1. 将插件从“参数辅助助手”升级为“任务中台本地执行器”。
2. 扩展任务消息类型，例如：
   - `CDP_RPA_START_TASK`
   - `CDP_RPA_TASK_PROGRESS`
   - `CDP_RPA_TASK_RESULT`
   - `CDP_RPA_TASK_ERROR`
3. 插件 background 作为编排层，按步骤打开数据引擎和达摩盘 tab。
4. 官方页面 content script 负责 DOM 搜索、点击、hover、状态读取。
5. 达摩盘透视 content script 直接融合 DMP-Plugin 的 `hook.js` 和 `content.js` 核心逻辑。
6. 插件将进度实时回传给前端；必要时由前端转发到后端保存。

官方机制依据：

- Chrome 的 `externally_connectable` manifest 配置允许指定网页通过 `runtime.connect()` 或 `runtime.sendMessage()` 与扩展通信。
- 我们已有的 `bridge.js` + `background.js` 方案可以继续沿用，但部署时要把正式域名加入 `externally_connectable.matches`、`host_permissions` 和插件内部 `ALLOWED_ORIGINS`。

## 用户流程

### 开发联调流程

1. 用户进入「任务中台」。
2. 填写：
   - 数据引擎测试人群包名称
   - 达摩盘测试人群包名称
   - 画像标签
3. 点击「开始透视」。
4. 前端创建后端任务记录。
5. 前端把任务参数发送给本地插件。
6. 插件先执行数据引擎段，只跑到最终应用按钮之前。
7. 插件继续执行达摩盘段，使用第二个人群包名称定位 DMP 人群。
8. 插件读取 `crowdId`，打开透视页。
9. 插件按 DMP-Plugin 思路批量取标签数据。
10. 前端展示进度和结果，并把结果写回后端。

### 正式目标流程

1. 用户输入一个人群包名称。
2. 前端把任务发送给本地插件。
3. 插件在用户本地 Chrome 中找到数据引擎人群包并推送到达摩盘。
4. 插件打开数据引擎 `dataHub` 页面等待推送状态成功。
5. 插件在达摩盘中定位同名人群包，读取 `crowdId`。
6. 插件 hover 人群名称，等待“画像透视”入口出现。
7. 插件打开：
   `https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId={crowdId}`
8. 插件按 DMP-Plugin 思路拦截画像请求并批量透视标签。
9. 插件把结果回传到我们的前端和后端。

## 数据引擎段

数据引擎段由本地插件在用户 Chrome 中执行。开发阶段只验证到“最终应用”按钮之前，避免误触真实应用。

打开地址：

`https://databank.tmall.com/#/customAnalysis`

搜索框 XPath：

`/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div/div[2]/div/div/div[1]/div/div[1]/div[2]/span/input`

第一行人群包名称 XPath：

`/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div[1]/div/div/div[2]/div/div/div[1]/div/div[2]/div[1]/div/div/div[2]/div[2]/table/tbody/tr[1]/td[2]/div/div/div`

第一行应用人群按钮 XPath：

`/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div/div[2]/div/div/div[1]/div/div[2]/div[1]/div/div/div[2]/div[2]/table/tbody/tr[1]/td[7]/div/div/a[1]`

最终应用按钮 XPath，开发阶段禁止点击：

`/html/body/div[6]/div/div[2]/div/div/div[3]/div/button[1]`

执行规则：

1. 清空搜索框。
2. 输入数据引擎测试人群包名称。
3. 按 Enter。
4. 遍历结果表格，不默认第一行。
5. 精准匹配人群包名称。
6. 命中唯一行后点击该行“应用人群”。
7. 等待确认弹窗。
8. 停止在最终应用按钮前。

真实点击最终应用按钮必须同时满足：

- 后端环境变量 `RPA_ALLOW_REAL_PUSH=true`
- 前端任务参数 `executePush=true`

真实点击最终应用按钮后，需要进入数据引擎 `dataHub` 页面等待推送状态。

状态页地址：

`https://databank.tmall.com/#/dataHub`

第一行状态 XPath：

`/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div[2]/div/div[2]/div[1]/section/div[1]/div/div/div/div/div/table/tbody/tr[1]/td[5]/div`

状态等待规则：

1. 打开 `dataHub` 页面。
2. 在列表中定位对应人群包，不能默认第一行。
3. 读取匹配行的状态列。
4. 状态显示成功、完成或可推送到达摩盘后，进入达摩盘段。
5. 状态显示处理中时轮询等待。
6. 状态显示失败或超时，任务失败并记录状态文本。

## 达摩盘人群定位段

这部分由我们的本地插件补齐。DMP-Plugin 本身没有提供完整的人群列表搜索和 `crowdId` 定位。

打开地址：

`https://dmp.taobao.com/index_new.html#!/crowds-new/list?spm=`

搜索框 XPath：

`/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div[1]/div[4]/div/input`

第一行人群包名称 XPath：

`/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/span`

第一行人群 ID XPath：

`/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/div[1]`

执行规则：

1. 清空搜索框。
2. 输入达摩盘测试人群包名称。
3. 按 Enter。
4. 遍历搜索结果行。
5. 对每一行读取人群包名称。
6. 与用户输入名称做精准匹配。
7. 命中唯一行后读取同一行 `crowdId`。
8. 将鼠标光标悬浮到匹配行的人群包名称上。
9. 等待该行出现“画像透视”入口。
10. 拼接透视地址：
   `https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId={crowdId}`
11. 打开透视页。

画像透视入口 XPath 示例：

`/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[2]/td/div/span[3]/a/span`

注意：

- 该 XPath 来自搜索结果中的某一行，不一定是固定第二行。
- 实现时要在精准匹配的人群行上 hover，然后在该行的展开/操作区域内查找“画像透视”。
- 画像透视入口出现是达摩盘人群可透视的验证信号。入口未出现时继续等待或轮询搜索结果。
- 如果入口出现，可优先使用 `crowdId` 拼接 URL 进入透视页；如果拼接 URL 失败，再点击该入口兜底。

## 精准匹配规则

不能默认搜索结果第一行就是目标。

名称标准化：

- 去掉前后空格。
- 合并连续空白字符。
- 保留原始中文、英文、数字、符号。
- 标准化后的页面名称必须与用户输入名称完全相等。

匹配结果：

- 0 条：任务失败，提示“未找到精确匹配人群包”。
- 1 条：继续执行。
- 多条：任务暂停，前端展示候选人群包和 `crowdId`，由用户选择后继续。

XPath 实现要求：

- 不硬编码 `tr[1]`。
- 以第一行 XPath 推导表格结构。
- 遍历 `tbody/tr[n]`。
- 在命中的相对行内读取名称、ID、按钮。

## 插件思路融合为透视引擎

### 插件原理

DMP-Plugin 的关键链路是：

1. 用户已经进入 DMP 画像透视页。
2. 页面发起一次真实画像接口请求。
3. `hook.js` 劫持 XHR。
4. 如果 URL 包含 `/api_2/` 且匹配 `/tag/{id}`、`tagId={id}` 或 `/analysis/{id}`，并且 body 中包含 `crowdId`，则保存：
   - `url`
   - `payload`
5. `content.js` 读取用户勾选的标签 ID。
6. 对每个标签：
   - 深拷贝原始 payload。
   - 删除原始 `multiGroupOptions`。
   - 替换 URL 中的标签 ID。
   - 替换 body 中的 `tagId`。
   - 发起 POST 请求。
7. 解析 `json.data.chartDataFull`。
8. 按标签名称汇总占比并计算 Rebase。

### 我们的迁移方式

我们的系统不要求用户进入 DMP 页面或使用 DMP-Plugin 面板。用户只在我们的系统上选标签。

插件内直接迁移成 `DmpInsightContent`，达摩盘透视取数按 DMP-Plugin 思路实现：

1. 打开透视 URL：
   `https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId={crowdId}`
2. 等待页面触发画像请求。
3. 注入或内置等价于 DMP-Plugin `hook.js` 的 XHR hook。
4. 捕获并保存原始 `url`、`payload` 和 `crowdId`。
5. 使用我们前端传来的 `tagIds`，按插件 `content.js` 的方式批量替换标签查询。
6. 将插件的 `chartDataFull` 解析逻辑迁移到插件侧。
7. 将插件的 Rebase 逻辑迁移到插件侧。
8. 输出结构化结果给前端；Excel 可以由后端生成，也可以由前端/插件先生成 CSV 作为兜底。

### 请求复用规则

捕获请求必须满足：

- URL 包含 `/api_2/`。
- URL 匹配以下任一模式：
  - `/tag/{id}`
  - `tagId={id}`
  - `/analysis/{id}`
- 请求体是 JSON。
- 请求体包含 `crowdId`。

替换标签时：

- URL 中 `/tag/{old}` 替换为 `/tag/{new}`。
- URL 中 `tagId={old}` 替换为 `tagId={new}`。
- URL 中 `/analysis/{old}` 替换为 `/analysis/{new}`。
- body 中如果有 `tagId`，替换为数字类型的新标签 ID。
- body 中保留 `crowdId`。
- 默认删除 `multiGroupOptions`。
- `needCondition=true` 标签第一版跳过。

### 返回解析

对每个接口响应读取：

`data.chartDataFull`

每个明细行转成：

- 所属大类：标签字典 `mainCategory`
- 标签类型：标签字典 `category`
- 标签名称：响应 `tagName`，没有则用字典 `tagName`
- 特征明细：响应 `optionName`
- 人群占比：`rate * 100`，保留两位小数
- 点击TGI：`ctrIndex`
- 转化TGI：`ppcIndex`

### Rebase 计算

沿用插件算法：

1. 按标签名称汇总有效“人群占比”。
2. 如果汇总值 `> 100.1`，认为该标签是多选或重叠统计，Rebase 保持原始人群占比。
3. 如果汇总值 `<= 100.1`，Rebase 等于：
   `当前占比 / 汇总占比 * 100`
4. 错误行或占比缺失时，Rebase 为 `-`。

## 前端设计

新增「任务中台」入口。

开发阶段表单字段：

- 数据引擎测试人群包名称
- 达摩盘测试人群包名称
- 标签选择器
- 开始透视按钮

正式阶段表单字段：

- 人群包名称
- 标签选择器
- 开始透视按钮

标签选择器使用 `dmp_tags_dictionary.json`。默认勾选 3-5 个 MVP 标签。

任务进度面板展示：

- 当前步骤
- 百分比
- 当前日志
- 安全暂停提示
- 失败原因
- 结果预览
- Excel 下载

## API 设计

### POST /api/rpa/tasks

创建任务记录。后端不直接执行官方页面自动化，只保存任务并返回 `taskId`。前端拿到 `taskId` 后把任务参数发送给本地插件。

开发阶段请求：

```json
{
  "mode": "development",
  "databankCrowdName": "数据引擎测试人群包",
  "dmpCrowdName": "达摩盘测试人群包",
  "tagIds": ["160571", "114555", "114554", "213510", "163535"],
  "executePush": false
}
```

正式阶段请求：

```json
{
  "mode": "production",
  "crowdName": "人群包名称",
  "tagIds": ["160571", "114555", "114554"],
  "executePush": true
}
```

响应：

```json
{
  "taskId": "rpa_xxx"
}
```

### GET /api/rpa/tasks

返回任务列表。

### GET /api/rpa/tasks/{taskId}

返回任务详情、步骤、百分比、日志和错误。

### PATCH /api/rpa/tasks/{taskId}/progress

插件或前端转发插件事件时调用，写入任务进度。

请求：

```json
{
  "status": "running",
  "step": "dmp_capture_payload",
  "percent": 72,
  "message": "已捕获画像请求，开始批量查询标签"
}
```

### GET /api/rpa/tasks/{taskId}/result

返回结果预览、总行数和下载地址。

### POST /api/rpa/tasks/{taskId}/result

插件完成透视后提交结构化结果。后端保存结果并生成 Excel。

请求：

```json
{
  "rows": [
    {
      "所属大类": "用户特征",
      "标签类型": "基础特征",
      "标签名称": "用户年龄",
      "特征明细": "25-29",
      "人群占比": "12.34%",
      "Rebase": "18.90%",
      "点击TGI": 1.2,
      "转化TGI": 1.1
    }
  ]
}
```

### GET /api/rpa/tags

返回标签字典。MVP 默认过滤或标记 `needCondition=true` 标签。

## 插件通信协议

前端页面通过现有 `bridge.js` 与 Chrome 插件通信。消息从 CDP Web 发给 bridge，再转给 background。background 负责任务编排，并把阶段性事件回传给页面。

任务启动消息：

```json
{
  "source": "cdp-web",
  "type": "CDP_RPA_START_TASK",
  "requestId": "req_xxx",
  "taskId": "rpa_xxx",
  "mode": "development",
  "databankCrowdName": "数据引擎测试人群包",
  "dmpCrowdName": "达摩盘测试人群包",
  "tagIds": ["160571", "114555", "114554"],
  "executePush": false
}
```

进度事件：

```json
{
  "source": "cdp-rpa-extension",
  "requestId": "req_xxx",
  "taskId": "rpa_xxx",
  "type": "CDP_RPA_TASK_PROGRESS",
  "step": "dmp_match_crowd",
  "percent": 55,
  "message": "已精准匹配达摩盘人群并读取 crowdId"
}
```

结果事件：

```json
{
  "source": "cdp-rpa-extension",
  "requestId": "req_xxx",
  "taskId": "rpa_xxx",
  "type": "CDP_RPA_TASK_RESULT",
  "rows": []
}
```

错误事件：

```json
{
  "source": "cdp-rpa-extension",
  "requestId": "req_xxx",
  "taskId": "rpa_xxx",
  "type": "CDP_RPA_TASK_ERROR",
  "step": "dmp_capture_payload",
  "message": "未捕获到画像请求"
}
```

生产域名部署要求：

- `manifest.json` 的 `externally_connectable.matches` 加入正式前端域名。
- `manifest.json` 的 `host_permissions` 加入正式前端域名、`https://databank.tmall.com/*`、`https://dmp.taobao.com/*`。
- `background.js` 的 `ALLOWED_ORIGINS` 加入正式前端 origin。
- 前端需要检测插件是否安装；未安装时提示安装本地执行器。

## 任务状态机

状态：

- `pending`
- `running`
- `paused`
- `completed`
- `failed`

步骤：

- `created`
- `databank_open`
- `databank_search`
- `databank_match_crowd`
- `databank_click_apply_crowd`
- `databank_confirm_ready`
- `databank_datahub_open`
- `databank_wait_push_status`
- `dmp_open`
- `dmp_search`
- `dmp_match_crowd`
- `dmp_extract_crowd_id`
- `dmp_wait_portrait_entry`
- `dmp_open_perspective`
- `dmp_capture_payload`
- `dmp_query_tags`
- `dmp_normalize_rebase`
- `build_result`
- `completed`

## 错误处理

- 官方平台未登录：插件返回错误，提示用户在当前 Chrome 登录数据引擎或达摩盘。
- 插件未安装或版本过低：前端提示安装/升级本地执行器。
- 页面 origin 未授权：插件拒绝任务，提示检查插件域名白名单。
- 搜索框未找到：记录 URL 和 XPath。
- 精准匹配 0 条：任务失败。
- 精准匹配多条：任务暂停，等待用户选择。
- 数据引擎最终应用按钮即将被点击：开发模式阻断。
- 数据引擎 `dataHub` 状态长时间处理中：任务失败或暂停，提示用户稍后重试。
- 数据引擎 `dataHub` 状态失败：任务失败并展示状态文本。
- 达摩盘 `crowdId` 为空：任务失败。
- 达摩盘精准匹配后没有出现“画像透视”入口：继续等待或轮询，超时后任务失败。
- 透视页未触发画像请求：尝试 XHR hook 兜底，仍失败则任务失败。
- 单个标签请求失败：记录该标签失败，继续其他标签。
- 所有标签失败：任务失败。

## 测试策略

后端单元测试：

- 任务创建、进度写入、结果写入和 Excel 生成。
- 名称标准化。
- 多行精准匹配。
- XPath 行号泛化。
- `crowdId` 提取。
- URL 标签 ID 替换。
- payload 标签 ID 替换。
- `multiGroupOptions` 删除和 `needCondition=true` 跳过。
- `chartDataFull` 解析。
- Rebase 计算。
- 最终应用按钮保护。
- `dataHub` 状态文本解析。
- 达摩盘 hover 后画像透视入口检测。

插件单元测试：

- background 校验允许来源。
- bridge 收发 `CDP_RPA_START_TASK`。
- content script 对 XPath 行号泛化。
- DMP-Plugin 迁移逻辑的 URL/payload 标签替换。
- 进度、结果、错误事件格式。

手工联调：

- 前端能检测插件安装状态。
- 前端能把任务发送给本地插件。
- 数据引擎段停在最终应用按钮前。
- 真实执行时点击应用后能进入 `dataHub` 并读取状态。
- 达摩盘搜索结果目标不在第一行时仍能匹配。
- 成功读取 `crowdId` 并打开透视页。
- hover 匹配行人群名称后能检测到“画像透视”入口。
- 成功捕获一次画像请求。
- 成功查询至少 3 个标签。
- 前端看到进度、结果预览和下载入口。

## 验收标准

- 用户能在我们的系统上输入人群包名称并选择标签。
- 任务由用户本地 Chrome 插件执行，能复用用户本地登录态。
- 前端能显示插件未安装/未授权/执行失败状态。
- 开发模式下有两个输入框，方便分段测试。
- 数据引擎最终应用按钮不会被误点。
- 真实执行模式下点击应用后能在 `dataHub` 等待推送状态。
- 达摩盘不依赖第一行，必须精准匹配。
- 达摩盘精准匹配后能通过 hover 检测画像透视入口。
- 能从匹配行读取 `crowdId` 并拼接透视 URL。
- 能按 DMP-Plugin 思路捕获画像 payload 并批量替换标签取数。
- 能解析 `chartDataFull` 并计算 Rebase。
- 至少 3 个标签能生成结果预览。
