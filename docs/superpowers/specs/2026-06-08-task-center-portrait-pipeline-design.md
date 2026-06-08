# 任务中台画像透视链路设计

## 背景

当前项目已经具备圈人参数生成、方案管理、批量装配和浏览器插件自动导入参数的基础能力。下一阶段要把官方平台中分散的人工链路产品化为任务中台：用户在我们的系统中输入人群包名称、选择标签，后台自动推进数据引擎和达摩盘操作，前端持续展示任务进度、失败原因和结果数据。

第一版以开发联调模式为主，分段验证数据引擎前半段和达摩盘后半段，避免开发过程中误触最终应用动作。

## 目标

- 用户在「任务中台」中输入两个测试人群包名称：
  - 数据引擎测试人群包名称：用于验证数据引擎搜索、精准匹配和打开应用确认弹窗。
  - 达摩盘测试人群包名称：用于验证达摩盘搜索、精准匹配、读取人群 ID、进入画像透视页和获取标签数据。
- 用户选择 3-5 个画像标签，MVP 默认使用：
  - 居住城市
  - 用户年龄
  - 用户性别
  - 城市等级
  - 消费能力等级
- 后台任务按步骤推进，前端展示当前步骤、百分比、日志和结果。
- 开发模式下严禁点击数据引擎最终「应用」按钮，只能停在确认弹窗前。

## 不做

- 不做真实完整推送闭环，除非后续显式开启真实执行开关。
- 不做多人群并发任务。
- 不做 `needCondition=true` 标签的下钻条件配置。
- 不做历史趋势、人群对比和自动洞察报告。
- 不在前端处理画像接口核心逻辑；画像接口、标签解析和 Excel 生成放在后端。

## 用户流程

1. 用户点击主导航「任务中台」。
2. 用户填写：
   - 数据引擎测试人群包名称
   - 达摩盘测试人群包名称
   - 需要获取的画像标签
3. 用户点击「开始透视」。
4. 系统提示链路：
   `数据引擎策略包 -> 推送达摩盘 -> 达摩盘画像透视 -> 获取数据`
5. 后端创建任务并返回任务 ID。
6. 前端进入任务详情/进度视图并轮询任务状态。
7. 任务在开发模式下分两段执行：
   - 数据引擎段：停在最终应用按钮之前。
   - 达摩盘段：从已存在于达摩盘的人群包开始，完成画像透视和标签数据获取。

## 开发模式链路

### A. 数据引擎前半段

输入字段：数据引擎测试人群包名称。

执行步骤：

1. 打开数据引擎人群列表：
   `https://databank.tmall.com/#/customAnalysis`
2. 定位搜索框：
   `/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div/div[2]/div/div/div[1]/div/div[1]/div[2]/span/input`
3. 清空输入框，输入人群包名称，按 Enter。
4. 等待搜索结果刷新。
5. 遍历表格结果行，按人群包名称做精准匹配。
6. 命中唯一行后，定位该行「应用人群」按钮并点击。
7. 等待确认弹窗出现。
8. 停止，不点击最终「应用」按钮。

第一行人群包名称 XPath：

`/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div[1]/div/div/div[2]/div/div/div[1]/div/div[2]/div[1]/div/div/div[2]/div[2]/table/tbody/tr[1]/td[2]/div/div/div`

第一行应用人群按钮 XPath：

`/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div/div[2]/div/div/div[1]/div/div[2]/div[1]/div/div/div[2]/div[2]/table/tbody/tr[1]/td[7]/div/div/a[1]`

最终应用按钮 XPath：

`/html/body/div[6]/div/div[2]/div/div/div[3]/div/button[1]`

保护规则：

- 开发模式永远不点击最终应用按钮。
- 真实执行必须同时满足后端环境变量和前端任务参数：
  - `RPA_ALLOW_REAL_PUSH=true`
  - `executePush=true`
- 如果任一条件不满足，任务在 `databank_confirm_ready` 步骤暂停并标记为开发模式完成。

### B. 达摩盘后半段

输入字段：达摩盘测试人群包名称。

执行步骤：

1. 打开达摩盘人群列表：
   `https://dmp.taobao.com/index_new.html#!/crowds-new/list?spm=`
2. 定位搜索框：
   `/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div[1]/div[4]/div/input`
3. 清空输入框，输入人群包名称，按 Enter。
4. 等待搜索结果刷新。
5. 遍历表格结果行，按人群包名称做精准匹配。
6. 命中唯一行后，读取同一行人群 ID。
7. 拼接画像透视 URL：
   `https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId={crowdId}`
8. 打开画像透视页。
9. 等待画像相关接口出现，拦截或复用请求凭证。
10. 批量获取用户选择的 3-5 个标签数据。
11. 归一化数据，生成预览和 Excel。
12. 保存结果，任务完成。

第一行人群包名称 XPath：

`/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/span`

第一行人群 ID XPath：

`/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/div[1]`

## 精准匹配规则

搜索完成后不能默认使用第一行。系统必须遍历所有可见结果行。

名称标准化规则：

- 去除前后空格。
- 合并连续空白字符。
- 保留中文、英文、数字和符号原文。
- 标准化后的文本必须与用户输入完全一致。

匹配结果处理：

- 0 条命中：任务失败，提示未找到精确匹配人群包。
- 1 条命中：继续执行。
- 多条命中：任务暂停，前端展示候选项，等待用户选择具体行或人群 ID 后继续。

实现时不要硬编码 `tr[1]`。应从第一行 XPath 推导表格结构，遍历 `tbody/tr[n]`，在命中的相对行内读取按钮或 ID。

## 后端架构

新增后端模块围绕任务、自动化和结果三层拆分：

- `TaskStore`：保存任务状态、输入参数、进度、日志、结果摘要。
- `RpaOrchestrator`：编排数据引擎段和达摩盘段。
- `DatabankBot`：处理数据引擎页面导航、搜索、精准匹配和应用弹窗。
- `DmpBot`：处理达摩盘搜索、精准匹配、读取人群 ID 和打开透视页。
- `DmpInsightClient`：参考 DMP-Plugin 的标签字典、接口参数、返回解析和 Rebase 逻辑获取画像数据。
- `ExcelBuilder`：将画像结果输出为 Excel。

GitHub 访问约定：读取 DMP-Plugin 时默认使用代理 `127.0.0.1:7897`。

## API 设计

### POST /api/rpa/tasks

创建开发联调任务。

请求：

```json
{
  "mode": "development",
  "databankCrowdName": "数据引擎测试人群包",
  "dmpCrowdName": "达摩盘测试人群包",
  "tagIds": ["160571", "114555", "114554", "213510", "163535"],
  "executePush": false
}
```

响应：

```json
{
  "taskId": "rpa_xxx"
}
```

### GET /api/rpa/tasks

返回任务列表，按创建时间倒序。

### GET /api/rpa/tasks/{taskId}

返回任务详情、当前步骤、百分比、日志和结果摘要。

### GET /api/rpa/tasks/{taskId}/result

任务完成后返回结果预览、总行数和下载地址。

### GET /api/rpa/tags

返回可选择标签列表。MVP 默认只返回 `needCondition=false` 标签，并在前端默认勾选 3-5 个测试标签。

## 任务状态机

任务状态：

- `pending`
- `running`
- `paused`
- `completed`
- `failed`

任务步骤：

- `created`
- `databank_open`
- `databank_search`
- `databank_match_crowd`
- `databank_click_apply_crowd`
- `databank_confirm_ready`
- `dmp_open`
- `dmp_search`
- `dmp_match_crowd`
- `dmp_extract_crowd_id`
- `dmp_open_perspective`
- `dmp_wait_api`
- `dmp_query_tags`
- `build_result`
- `completed`

开发模式中，数据引擎段到 `databank_confirm_ready` 后进入安全暂停，但任务继续执行达摩盘后半段，因为达摩盘使用第二个人群包独立测试。

## 前端设计

新增任务中台页面或主导航入口，包含：

- 创建任务表单：
  - 数据引擎测试人群包名称
  - 达摩盘测试人群包名称
  - 标签选择器
  - 开发模式说明
  - 开始透视按钮
- 任务进度面板：
  - 当前步骤
  - 百分比
  - 步骤日志
  - 安全暂停提示
  - 失败原因
- 任务结果：
  - 标签数据预览
  - Excel 下载

界面文案需要明确提示开发模式：

`开发模式不会点击数据引擎最终应用按钮；达摩盘阶段使用另一个已存在的人群包继续测试。`

## 错误处理

- 未登录官方平台：任务失败，提示用户用自动化浏览器登录数据引擎或达摩盘。
- 搜索框未找到：任务失败，记录页面 URL 和目标 XPath。
- 搜索无结果：任务失败，提示未找到人群包。
- 多个精确匹配：任务暂停，等待用户选择。
- 应用确认弹窗未出现：任务失败，提示已点击应用人群但未检测到确认弹窗。
- 达摩盘人群 ID 为空：任务失败，提示无法读取 crowdId。
- 画像接口未出现：任务失败，提示未拦截到画像接口请求。
- 单个标签查询失败：记录该标签失败，继续查询其他标签；全部失败则任务失败。

## 测试策略

后端单元测试：

- 名称标准化和精准匹配。
- XPath 行号泛化。
- 任务状态流转。
- 真实推送保护开关。
- 标签默认选择。
- 结果构建和 Excel 输出。

前端测试：

- 任务表单校验。
- 标签默认选择 3-5 个。
- 进度状态展示。
- 安全暂停提示展示。

手工联调：

- 数据引擎段跑到最终应用按钮前停止。
- 达摩盘段能从搜索结果中匹配非第一行人群。
- 达摩盘段能读取 crowdId 并打开修正后的透视 URL。
- 能获取至少 3 个标签数据并生成结果。

## 验收标准

- 用户可以在任务中台输入两个测试人群包名称并启动任务。
- 数据引擎段不会点击最终应用按钮。
- 数据引擎和达摩盘都使用精准匹配，不依赖第一行。
- 达摩盘能读取匹配行的 crowdId，并打开：
  `https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId={crowdId}`
- 任务中台能显示每一步进度和失败原因。
- 至少 3 个标签能被查询并生成预览结果。
