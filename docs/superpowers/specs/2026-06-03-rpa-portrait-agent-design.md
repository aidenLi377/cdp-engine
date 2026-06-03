# RPA 智能画像分析 Agent 设计

## 目标

将当前"自动化圈人"扩展为一键 RPA 链路：用户在数据引擎手工创建人群后，Agent 自动完成"推送达摩盘 → 画像透视 → 标签查询 → Excel 回传"的全流程。

## 整体架构

```
CDP Web (Vue3)                    CDP Backend (Flask)              RPA Agent (Python + Playwright)
┌────────────────────┐     POST   ┌───────────────────┐  启动     ┌──────────────────────────┐
│ 智能画像分析弹窗    │ ──────────►│ POST /api/rpa/     │ ────────►│ rpa_agent/               │
│ - 输入人群名称      │           │   execute          │          │ ├── orchestrator.py      │
│ - 选择画像标签      │           │                    │          │ ├── databank_bot.py      │
│                    │           │ GET /api/rpa/       │◄──────── │ ├── dmp_bot.py           │
│ 任务进度面板        │◄──────── │   tasks/{id}        │  进度     │ ├── dmp_api.py           │
│ - 实时状态          │           │                    │          │ ├── task_store.py        │
│ - 历史列表          │           │ GET /api/rpa/       │◄──────── │ └── excel_builder.py     │
│                    │           │   download/{file}   │  Excel    │                          │
│ 数据预览 + 下载     │◄──────── │                    │           │ Playwright ──► Chrome   │
└────────────────────┘           └───────────────────┘           └──────────────────────────┘
```

## 流程边界

```
用户人工操作（Agent 启动前）：
  CDP 复制参数 → 数据引擎粘贴 → 人工审核 → 点击创建人群

Agent 接管（从人群已创建开始）：
  数据引擎人群列表搜索人群名称 → 点击推送至达摩盘 → 等待推送完成
  → 打开达摩盘 → 人群列表找到人群 → 点击画像透视
  → 拦截 API 凭证 → 遍历标签调用画像 API → 数据归一化
  → 生成 Excel → 回传 CDP 后端 → 前端展示下载
```

## RPA Agent 模块设计

### 1. orchestrator.py — 任务编排器

- 接收任务（crowdName + tagIds）
- 按顺序编排各步骤
- 收集每步进度，写入 task_store
- 异常时记录失败原因并终止

### 2. databank_bot.py — 数据引擎自动化

- 打开 databank.tmall.com/#/userDefinedAnalyses（人群列表页）
- 搜索人群名称
- 定位目标人群行，点击"推送至达摩盘"按钮
- 等待推送状态变为"已完成"（轮询页面元素或 toast 提示）

### 3. dmp_bot.py — 达摩盘页面自动化

- 打开 dmp.taobao.com 人群列表
- 搜索/定位已推送的人群
- 点击"画像透视"按钮
- 等待画像页面加载完成

### 4. dmp_api.py — 画像 API 调用

- 通过 Playwright page.on('request') 拦截达摩盘画像页发出的 API 请求
- 从请求中提取：URL、请求头（含认证 cookie/token）、crowdId
- 遍历 dmp_tags_dictionary.json 中的标签 ID 列表
- 对每个标签调用达摩盘画像 API
- 从响应 data.chartDataFull 中提取：tagName、optionName、rate、ctrIndex、ppcIndex
- Auto-Rebase 归一化处理（同 DMP-Plugin 算法）
- 返回聚合后的结构数据

拦截原理（Playwright CDP 层监听 vs DMP-Plugin XHR 劫持）：

```
DMP-Plugin 方式：改写 XMLHttpRequest.prototype，侵入页面 JS 原型链
Playwright 方式： 在 Chrome DevTools Protocol 层监听网络事件
                 - page.on('request')  → 完整的 URL + headers + postData
                 - page.on('response') → 完整的 response body
                 - 无需注入页面代码，零侵入，覆盖 XHR/fetch/任何网络库
```

### 5. task_store.py — 任务持久化

- 每个任务一个 JSON 文件（.runtime/rpa_tasks/{taskId}.json）
- 字段：id、crowdName、status、progress、result、createdAt、updatedAt、error
- 简单文件锁保护并发读写

### 6. excel_builder.py — Excel 生成

- 使用 openpyxl 生成 .xlsx 文件
- 包含：标签大类、标签类型、标签名称、特征明细、人群占比、Rebase、点击TGI、转化TGI
- 大类按 DMP-Plugin 配色方案着色
- 文件存储到 .runtime/rpa_results/{taskId}.xlsx

## API 设计

### POST /api/rpa/execute

创建并启动一个 RPA 任务。

```
Request:  { "crowdName": "美妆高潜人群", "tagIds": ["160571","114555",...] }
Response: 201 { "taskId": "task_abc123" }
```

后端在独立线程中启动 Agent，立即返回 taskId。

### GET /api/rpa/tasks/{taskId}

获取单个任务状态。

```
Response: 200 {
  "taskId": "task_abc123",
  "crowdName": "美妆高潜人群",
  "status": "running",           // pending | running | completed | failed
  "progress": {
    "step": "dmp_query",
    "detail": "正在查询画像标签 (12/57): 用户年龄",
    "percent": 65
  },
  "createdAt": "2026-06-03T10:30:00Z",
  "updatedAt": "2026-06-03T10:32:30Z",
  "error": null
}
```

### GET /api/rpa/tasks/{taskId}/result

获取已完成任务的结果（含预览数据）。

```
Response: 200 {
  "taskId": "task_abc123",
  "excelUrl": "/api/rpa/download/task_abc123.xlsx",
  "previewRows": [...],  // 前 50 行数据
  "totalRows": 230,
  "generatedAt": "2026-06-03T10:35:00Z"
}
```

任务未完成时返回 404。

### GET /api/rpa/download/{filename}

下载 Excel 文件（文件流）。

### GET /api/rpa/tasks

获取历史任务列表（按时间倒序）。

```
Response: 200 {
  "tasks": [
    { "taskId": "...", "crowdName": "...", "status": "completed", "createdAt": "..." },
    ...
  ]
}
```

## 任务状态机

```
pending ──► running ──► completed
                │
                └──────► failed
```

running 状态下的 progress.step 枚举：
- `databank_search` — 数据引擎搜索人群
- `databank_push`  — 推送达摩盘
- `dmp_locate`     — 达摩盘定位人群
- `dmp_portrait`   — 触发画像透视
- `dmp_query`      — 批量查询画像标签
- `build_excel`    — 生成 Excel
- `upload_result`  — 回传后端

## 标签配置

复用 DMP-Plugin 的 `dmp_tags_dictionary.json`（57 个标签，4 大类），作为 Agent 的静态配置文件。

标签需支持 `needCondition` 标记：
- `needCondition: false` → 可直接查询
- `needCondition: true` → 需前置配置下钻条件（MVP 阶段标记为"需配置"并跳过）

## 前端改动

### NormalMode.vue

"去圈人"下拉菜单增加「智能画像分析」选项，点击弹出分析配置对话框。

### 新增组件：PortraitAnalysisDialog.vue

```
┌─ 智能画像分析 ──────────────────────────────────┐
│                                                  │
│  人群名称：[________________]  (从数据引擎创建的)  │
│                                                  │
│  画像标签：☑ 全选                                │
│    ☑ 用户特征 (23个)                             │
│    ☑ 品类特征 (9个)                              │
│    ☑ 渠道特征 (14个)                             │
│    ☑ 私域特征 (11个)                             │
│                                                  │
│  提示：请先在数据引擎上创建好人群，               │
│  再回到此页面输入人群名称并点击开始分析。          │
│                                                  │
│               [取消]    [开始分析]                │
└──────────────────────────────────────────────────┘
```

### 新增组件：TaskProgressPanel.vue

JSON 面板旁新增「任务」标签页，展示：
- 当前运行任务：进度条 + 当前步骤描述
- 历史任务列表：状态、时间、下载按钮

### 后端路由注册

在 app_factory.py 中注册 5 个新路由。

## 技术依赖

- **Playwright**: `playwright` Python 包，驱动本地 Chrome
  - 复用用户 Chrome 用户数据目录（`--user-data-dir`），保留登录态
  - 首次运行时 `playwright install chromium` 安装浏览器
- **openpyxl**: Excel 生成
- **httpx**: 从 Agent 内部调用达摩盘 API（复用拦截到的 cookie）

## 文件清单

```
cdp_backend/
  rpa_agent/
    __init__.py
    orchestrator.py     # 任务编排
    databank_bot.py     # 数据引擎页面操作
    dmp_bot.py          # 达摩盘页面操作
    dmp_api.py          # 达摩盘画像 API 调用
    task_store.py       # 任务状态存储
    excel_builder.py    # Excel 生成
    dmp_tags_dictionary.json  # 标签配置（从 DMP-Plugin 复制）

cdp-web/src/
  components/
    PortraitAnalysisDialog.vue   # 分析配置弹窗
    TaskProgressPanel.vue        # 任务进度面板
  constants/
    portraitTags.js              # 标签常量（从 JSON 导出）

cdp_backend/app_factory.py       # 新增 5 个路由
```

## MVP 范围

- [ ] 数据引擎：搜索人群 → 推送至达摩盘
- [ ] 达摩盘：定位人群 → 画像透视
- [ ] 凭证拦截 → API 批量查询
- [ ] Auto-Rebase 归一化 → Excel 生成
- [ ] 回传后端 → 前端下载预览
- [ ] 任务状态追踪与历史记录

## 不做

- 数据对比分析（人群 A vs B）
- 历史趋势对比
- needCondition=true 标签的下钻配置
- 多人群并发执行
