# AI 圈人工业级 Agent 制作文档

日期：2026-05-28

## 1. 文档目标

本文件用于指导“AI 辅助圈人系统”的产品设计、技术架构和分阶段实现。目标不是做一个简单聊天框，而是创造一个真正能理解用户业务语言、能配置工作台、能解释人群逻辑、能持续学习用户个人定义的工业级圈人 Agent。

核心原则：

- AI 不直接生成最终 JSON。
- AI 不直接操作页面 DOM。
- AI 负责理解、规划、解释、学习。
- 系统负责校验、执行、渲染、生成最终 JSON。
- 所有 AI 结果必须经过用户确认或系统校验后才生效。
- 用户学习必须按用户隔离，每个用户的“品类新客”等定义可以不同。

## 2. Agent 如何越来越聪明

Agent 变聪明不是靠一次性写一个更长的 Prompt，而是靠“结构化记忆 + 用户反馈 + 可执行计划 + 纠错闭环”不断积累。这里的“聪明”不是泛泛地会聊天，而是越来越懂每个用户对业务词的定义、参数偏好、默认时间窗口、常用品牌类目、以及用户习惯使用的交并差结构。

传统 AI 聊天框的问题是：

- 只理解当前一句话，不记得每个用户的业务定义。
- 输出结果不一定能被系统执行。
- 用户改了什么，AI 不知道。
- 下次遇到同类需求，还要重新猜。

本系统让 Agent 变聪明的核心方法有 7 个。

### 2.1 个人业务词典

用户确认过的业务定义会保存为个人业务词典。例如用户 A 的“品类新客”可能是三节点差集，用户 B 的“品类新客”可能是两节点差集。Agent 下次听到“品类新客”时，优先使用当前用户自己的定义，而不是系统默认理解。

保存内容包括：

- 名称：品类新客。
- 别名：类目新客、品类拉新。
- 业务解释：统计期内买过指定品牌指定品类，但排除历史买过该品牌的人。
- 工作台结构：节点、参数、交并差关系。
- 槽位：品牌、类目、统计时间、对比时间。
- 默认值：统计时间默认近 90 天，对比时间默认近 365 天。
- 使用次数、成功次数、应用后修改次数。

### 2.2 结构化可执行记忆

Agent 不只记一句自然语言解释，还会记一份可再次执行的 WorkbenchPlan 模板。这样用户下次说“帮我圈品类新客”，系统不是重新猜，而是把已学习的模板取出来，补齐本次品牌、类目、时间等槽位，再应用到工作台。

这比只保存 Prompt 或文本描述稳定，因为它可以被系统校验和执行。

### 2.3 槽位学习

每个业务词都拆成固定结构和可变槽位。

示例：

```text
品类新客
固定结构：节点1 差集 节点2 差集 节点3
可变槽位：品牌、类目、统计时间、对比时间、渠道
```

当用户每次使用时，Agent 观察用户如何填写槽位。如果用户总是把“统计时间”改为近 180 天，Agent 可以提示：

```text
你最近多次使用「品类新客」时都把统计时间改成近180天，要不要把它设为你的默认值？
```

### 2.4 纠错反馈 diff

Agent 每次推荐方案后，系统记录三份状态：

```text
AI 推荐的 WorkbenchPlan
用户确认后应用的 WorkbenchPlan
用户最终复制/保存时的工作台状态
```

然后计算差异：

```text
AI 推荐：近90天
用户最终：近180天

AI 推荐：2个节点
用户最终：3个节点

AI 推荐：差集
用户最终：交集
```

这些差异就是最宝贵的学习信号。它能告诉 Agent：用户不是简单地“采纳”或“拒绝”，而是具体改了哪里。

### 2.5 正负反馈

Agent 记录用户的关键动作：

- 用户选择了哪个候选方案。
- 用户拒绝了哪个候选方案。
- 用户应用后是否复制结果。
- 用户应用后是否保存为方案。
- 用户应用后改了哪些参数。
- 用户是否确认学习。
- 用户是否删除或停用了某个学习方案。

这些反馈会影响后续排序。经常被采纳、很少被修改的方案优先展示；经常被拒绝或大幅修改的方案降低优先级。

### 2.6 语义检索

用户不一定每次说同一个词。例如：

```text
帮我圈品类新客
找类目拉新人群
最近买过面霜但之前没买过我品牌的人
```

这些表达可能都应该命中“品类新客”。因此每个个人方案都要保存 embeddingText 和示例说法，用语义检索匹配用户当前输入。

### 2.7 版本演进

用户定义会变。不要直接覆盖旧定义，而要保留版本。

示例：

```text
品类新客 v1：两个节点差集
品类新客 v2：三个节点差集，新增大盘品牌人群排除
```

Agent 默认使用 active 版本，但用户可以回滚，也可以查看“这个定义为什么变了”。

最终智能闭环：

```text
用户自然语言
-> Agent 检索用户记忆
-> 生成可解释方案
-> 用户确认并应用
-> 工作台可继续修改
-> 用户复制/保存
-> Agent 分析最终配置
-> 用户确认是否学习
-> 更新个人业务词典、槽位默认值、方案版本和排序权重
```

## 3. 产品目标

系统最终支持两类核心能力。

### 3.1 自然语言自动圈人

用户点击 AI 按钮，输入自然语言，例如：

```text
帮我圈近 90 天面霜品类新客，品牌是 A。
```

Agent 根据用户输入和用户个人方案库，生成 1 到 3 个候选方案。用户确认后，系统把方案配置到工作台中间栏，包括：

- 添加行为组件。
- 填写每个组件的参数。
- 设置节点之间的交集、并集、差集关系。
- 生成人群包名称建议。

到此为止，用户还可以继续手动调整。

### 3.2 AI 学习用户操作

用户自己在工作台配置好一组人群后，可以点击“AI 学习当前人群”，或者在复制/保存时接受系统学习提示。

Agent 读取当前工作台节点，分析：

- 每个行为节点在业务上代表什么。
- 节点之间的交并差关系是什么。
- 整体人群包可能用于什么业务目的。

然后要求用户命名或解释，例如：

```text
品类新客
```

用户确认后，系统把该定义存入用户个人方案库。以后该用户再说“品类新客”，Agent 优先使用这个用户自己的定义。

## 4. 端到端运行案例

本章用一个完整案例说明 Agent 从自然语言、方案生成、工作台执行到用户学习的全链路。

### 4.1 场景背景

用户之前已经教过系统：

```text
品类新客 = 统计期内买过指定品牌指定品类的人 - 对比期内买过指定品牌的人 - 大盘对应品牌人群
```

这条定义已经保存到该用户的个人业务词典中，名称为“品类新客”，默认统计时间为近 90 天，默认对比时间为近 365 天。

### 4.2 用户输入

用户点击首页或工作台顶部的 AI 按钮，输入：

```text
帮我圈面霜品类新客，品牌A，最近90天。
```

### 4.3 Agent 理解意图

Agent 抽取信息：

```json
{
  "rawText": "帮我圈面霜品类新客，品牌A，最近90天。",
  "intentName": "品类新客",
  "entities": {
    "brand": "品牌A",
    "category": "面霜",
    "statDateRange": {
      "mode": "recent",
      "days": 90
    }
  },
  "missingSlots": ["compareDateRange"]
}
```

因为用户没有说对比时间，Agent 使用用户个人定义中的默认值“近 365 天”，并在方案卡片中提示。

### 4.4 检索用户个人方案

Agent 检索当前用户的个人业务词典，命中：

```json
{
  "schemeId": "scheme_category_new_customer_v2",
  "name": "品类新客",
  "matchScore": 0.93,
  "matchReason": "用户输入包含「品类新客」，且参数包含品牌和类目，命中你之前保存的三节点差集定义。"
}
```

### 4.5 生成候选方案卡片

Agent 展示方案：

```text
方案：面霜品类新客
来源：命中你之前保存的「品类新客」定义
逻辑：节点1 - 节点2 - 节点3

节点1：近90天购买过品牌A面霜类目的人
节点2：近365天购买过品牌A的人
节点3：大盘对应品牌A人群

提示：你没有指定对比时间，已按你的个人定义默认使用近365天。

按钮：应用到工作台 / 查看详情 / 换一种方案
```

### 4.6 应用前圈人概览预览

用户点击方案卡片后，系统不应立即填充工作台，而是先展示一个不可编辑的“圈人概览预览”。这个预览要尽量接近用户圈人完成后看到的概览信息，让用户确认 AI 到底准备做什么。

概览内容：

```text
人群包名称：面霜品类新客_近90天

整体逻辑：
节点1 - 节点2 - 节点3

节点1：近90天购买过品牌A面霜类目的人
节点2：近365天购买过品牌A的人
节点3：大盘对应品牌A人群

关系说明：
从节点1中排除节点2，再排除节点3。

提示：
你没有指定对比时间，已按你的个人定义默认使用近365天。

按钮：
确认应用到工作台 / 返回换方案 / 取消
```

只有用户点击“确认应用到工作台”后，系统才调用工作台执行器。

### 4.7 用户确认

用户在概览预览中点击“确认应用到工作台”。如果当前工作台已有内容，系统提示：

```text
当前工作台已有内容，应用 AI 方案会替换当前画布，是否继续？
```

用户确认后，前端进入应用流程。

### 4.8 系统校验 WorkbenchPlan

系统校验：

- “类目商品行为”组件存在。
- “商品行为”组件存在。
- “大盘品牌人群”对应组件存在。
- 品牌A存在于品牌维表。
- 面霜存在于类目维表。
- 日期字段格式正确。
- 第一个节点 operator 为 null。
- 第二、三个节点 operator 为 d。
- 所有必填字段完整。

校验通过后，才允许应用。

### 4.9 工作台中间栏自动填充

前端执行器执行：

```text
清空 nodeList
-> 创建节点1：类目商品行为
-> 写入品牌A、面霜、购买、近90天
-> 创建节点2：商品行为
-> 写入品牌A、购买、近365天
-> 设置节点2 operator = d
-> 创建节点3：大盘品牌人群
-> 写入品牌A
-> 设置节点3 operator = d
-> 写入人群包名称：面霜品类新客_近90天
-> 触发系统原有 JSON 生成逻辑
```

用户看到的结果就是中间栏已经出现 3 个行为节点，每个节点参数已填写，节点之间关系为差集。

### 4.10 用户手动调整

用户把对比时间从近 365 天改成近 180 天，然后点击复制。

系统记录 diff：

```json
{
  "schemeId": "scheme_category_new_customer_v2",
  "field": "compareDateRange",
  "aiValue": {
    "mode": "recent",
    "days": 365
  },
  "finalValue": {
    "mode": "recent",
    "days": 180
  },
  "event": "modified_after_apply"
}
```

### 4.11 Agent 学习用户偏好

如果用户多次这样修改，系统提示：

```text
你最近多次使用「品类新客」时都把对比时间改成近180天，要不要把近180天设为你的默认对比时间？
```

用户确认后，系统更新该用户个人方案的槽位默认值，并生成新版本：

```text
品类新客 v3：默认对比时间从近365天改为近180天
```

这就是 Agent 变聪明的实际过程：不是模型凭空变强，而是系统把用户确认过的业务定义、实际修改和默认值偏好沉淀为可复用记忆。

## 5. 关键边界

### 5.1 AI 不生成最终 JSON

最终 JSON 仍由现有系统根据工作台状态生成。AI 不能绕过现有生成引擎。

正确方式：

```text
AI 生成 WorkbenchPlan
-> 前端应用到工作台
-> 当前系统生成 JSON
```

错误方式：

```text
AI 直接生成最终 JSON
```

### 5.2 AI 不直接操作 DOM

不要让 AI 模拟点击按钮、选择下拉框、输入文本。这样非常脆弱，页面结构一变就会失效。

正确方式：

```text
AI 输出结构化计划
-> 系统调用工作台状态方法
-> Vue 自动渲染中间栏
```

错误方式：

```text
AI 点击页面按钮
AI 点击下拉选项
AI 模拟鼠标和键盘
```

### 5.3 AI 不直接执行未校验计划

AI 生成的计划必须经过系统校验。校验通过后，用户确认，才应用到工作台。

## 6. 总体架构

系统采用“自然语言理解 + 用户记忆检索 + WorkbenchPlan 规划 + 工作台执行 + 用户学习反馈”的架构。

```text
用户自然语言
-> AI 对话入口
-> 意图理解器
-> 用户方案检索器
-> 候选方案生成器
-> WorkbenchPlan 校验器
-> 方案概览展示
-> 用户确认
-> 工作台执行器
-> 工作台中间栏渲染
-> 当前系统生成 JSON
-> 用户调整/复制/保存
-> 学习引擎
-> 用户个人方案库
```

核心模块：

| 模块 | 职责 |
| --- | --- |
| AI 对话入口 | 接收用户自然语言，展示对话和候选方案 |
| 意图理解器 | 抽取业务意图、实体、缺失参数 |
| 方案检索器 | 检索用户个人方案、团队方案、系统方案 |
| 方案规划器 | 生成候选 WorkbenchPlan |
| 方案校验器 | 校验节点、字段、参数、关系是否合法 |
| 工作台执行器 | 把 WorkbenchPlan 应用到 nodeList/formData/operator |
| 配置解释器 | 把当前工作台配置反向解释为自然语言 |
| 学习引擎 | 保存、更新、版本化用户个人方案 |
| 反馈系统 | 记录采纳、拒绝、修改、复制、保存等行为 |

## 7. WorkbenchPlan 设计

WorkbenchPlan 是 AI 和工作台之间的核心协议。它表达的是“工作台目标状态”，不是最终 JSON，也不是一串无校验的点击动作。

### 7.1 为什么不用纯 Action 序列

纯 Action 序列类似：

```text
add_node
set_param
set_relation
```

优点是直观，但缺点是：

- 中间一步失败可能留下半成品。
- 很难整体校验。
- 很难展示完整方案概览。
- 很难比对 AI 预测和用户最终配置差异。

WorkbenchPlan 类似：

```text
我最终希望工作台长成什么样
```

优点是：

- 可以先整体校验。
- 可以生成方案概览。
- 可以失败不落地。
- 可以一次性应用。
- 更容易做学习和差异分析。

### 7.2 WorkbenchPlan 示例

```json
{
  "planId": "plan_001",
  "title": "面霜品类新客",
  "summary": "近90天购买过品牌A面霜类目，但排除历史购买过品牌A的人群。",
  "crowdName": "面霜品类新客_近90天",
  "source": {
    "type": "user_scheme",
    "schemeId": "scheme_category_new_customer_v1",
    "matchReason": "命中你之前保存的「品类新客」定义"
  },
  "missingSlots": [],
  "warnings": [
    "未指定对比时间，默认使用近365天。"
  ],
  "nodes": [
    {
      "tempId": "node_a",
      "packageType": "类目商品行为",
      "operator": null,
      "description": "统计期内购买过品牌A面霜类目的人",
      "params": {
        "stdBrand": ["品牌A"],
        "cate": ["面霜"],
        "bhv": ["购买"],
        "date": {
          "mode": "recent",
          "days": 90
        }
      }
    },
    {
      "tempId": "node_b",
      "packageType": "商品行为",
      "operator": "d",
      "description": "对比期内购买过品牌A的人",
      "params": {
        "stdBrand": ["品牌A"],
        "bhv": ["购买"],
        "date": {
          "mode": "recent",
          "days": 365
        }
      }
    }
  ]
}
```

### 7.3 operator 约定

当前系统中节点关系可以继续沿用：

| operator | 含义 |
| --- | --- |
| n | 交集 |
| u | 并集 |
| d | 差集 |

第一个节点的 operator 必须为 null。第二个及之后节点必须提供 operator。

### 7.4 WorkbenchPlan JSON Schema

后端和前端都应以同一份 JSON Schema 校验 WorkbenchPlan。下面是第一版建议协议。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cdp.local/schemas/workbench-plan.schema.json",
  "title": "WorkbenchPlan",
  "type": "object",
  "required": ["title", "nodes"],
  "additionalProperties": false,
  "properties": {
    "planId": {
      "type": "string",
      "description": "临时方案 ID，用于前端渲染、日志和反馈追踪。"
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "description": "候选方案标题。"
    },
    "summary": {
      "type": "string",
      "description": "面向用户展示的方案摘要。"
    },
    "crowdName": {
      "type": "string",
      "description": "建议写入工作台的人群包名称。"
    },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": ["user_scheme", "team_scheme", "system_scheme", "llm_generated"]
        },
        "schemeId": {
          "type": ["string", "null"]
        },
        "matchReason": {
          "type": "string"
        },
        "matchScore": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        }
      }
    },
    "missingSlots": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "label", "required"],
        "additionalProperties": false,
        "properties": {
          "key": { "type": "string" },
          "label": { "type": "string" },
          "required": { "type": "boolean" },
          "reason": { "type": "string" }
        }
      }
    },
    "warnings": {
      "type": "array",
      "items": { "type": "string" }
    },
    "nodes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["tempId", "packageType", "operator", "params"],
        "additionalProperties": false,
        "properties": {
          "tempId": {
            "type": "string",
            "description": "方案内临时节点 ID，不等同于工作台运行时节点 ID。"
          },
          "packageType": {
            "type": "string",
            "description": "必须匹配当前系统支持的行为组件名称。"
          },
          "operator": {
            "type": ["string", "null"],
            "enum": ["n", "u", "d", null],
            "description": "第一个节点必须为 null，后续节点为 n/u/d。"
          },
          "description": {
            "type": "string",
            "description": "面向用户解释这个节点的业务含义。"
          },
          "params": {
            "type": "object",
            "description": "待写入该节点 formData/modeData 的业务参数。字段是否合法由动态 schema 校验器进一步判断。"
          }
        }
      }
    }
  }
}
```

注意：JSON Schema 只做通用结构校验。字段是否合法、参数值是否存在、字段联动后是否可见，必须交给动态方案校验器处理，因为这些规则来自当前工作台 schema、逻辑表和维表。

### 7.5 WorkbenchPlan 与 Action 的关系

WorkbenchPlan 是 AI 输出的目标状态。Action 是系统内部执行时生成的操作步骤。

推荐关系：

```text
AI 输出 WorkbenchPlan
-> 系统校验 WorkbenchPlan
-> 系统把 WorkbenchPlan 转成内部 Action
-> 前端执行 Action 更新工作台状态
```

内部 Action 示例：

```json
[
  {
    "type": "clear_canvas"
  },
  {
    "type": "add_node",
    "tempId": "node_a",
    "packageType": "类目商品行为"
  },
  {
    "type": "set_node_params",
    "tempId": "node_a",
    "params": {
      "stdBrand": ["品牌A"],
      "cate": ["面霜"]
    }
  },
  {
    "type": "set_operator",
    "tempId": "node_b",
    "operator": "d"
  }
]
```

AI 不需要直接输出这些 Action。这样可以避免 AI 生成过程脚本导致状态半更新，也能让系统保持执行控制权。

## 8. 工作台执行方式

AI 不直接填页面。真正填入工作台中间栏的是前端执行器。

工作台执行器建议作为独立 composable 实现，例如：

```text
cdp-web/src/composables/useAiWorkbenchPlan.js
```

不要把 AI 方案应用、字段适配、快照回滚、反馈记录等逻辑继续堆进 `NormalMode.vue`。`NormalMode.vue` 只负责传入当前工作台上下文、打开弹窗和响应用户操作。

执行流程：

```text
用户点击“应用到工作台”
-> 前端拿到已校验 WorkbenchPlan
-> 如果当前工作台有内容，提示是否替换
-> 清空当前 nodeList
-> 遍历 plan.nodes
-> createRuntimeNode 创建运行时节点
-> 写入 node.formData
-> 写入 node.modeData
-> 写入 node.operator
-> 写入 crowdNameInput
-> 触发 buildFinalJson
-> 页面自动渲染中间栏
```

伪代码：

```js
async function applyAiWorkbenchPlan(plan) {
  snapshotPaused.value = true

  try {
    nodeList.value = []
    crowdNameInput.value = plan.crowdName || plan.title

    for (const [index, plannedNode] of plan.nodes.entries()) {
      const node = await createRuntimeNode(
        { packageType: plannedNode.packageType },
        index
      )

      node.operator = index === 0 ? null : plannedNode.operator

      applyParamsToNode(node, plannedNode.params)

      node.collapsed = false
      nodeList.value.push(node)
    }

    resetHistory()
    await buildFinalJson()
  } finally {
    snapshotPaused.value = false
  }
}
```

参数写入时不能简单粗暴赋值，必须根据字段类型处理：

| 字段类型 | 写入方式 |
| --- | --- |
| 普通单选 | 写入 formData[key] |
| 普通多选 | 写入数组 formData[key] |
| 日期切换 | 写入 formData[key] 和 modeData[key] |
| 数值切换 | 写入 formData[key] 和 modeData[key] |
| 级联字段 | 先写父字段，再写子字段 |
| 联动字段 | 必须确认字段当前可见后再写 |

### 8.1 字段类型适配表

`applyAiWorkbenchPlan` 不应直接硬编码所有字段写入规则，而应通过字段类型适配表处理不同控件的值格式。

建议新增：

```text
cdp-web/src/ai/fieldValueAdapters.js
```

字段适配表至少覆盖：

| 字段类型 | 写入目标 | 说明 |
| --- | --- | --- |
| 普通单选 | `formData[key] = value` | value 通常是字符串 |
| 普通多选 | `formData[key] = array` | value 必须是数组 |
| 日期切换 | `modeData[key] + formData[key]` | 支持 recent/range |
| 数值切换 | `modeData[key] + formData[key]` | 支持 unlimited/min/range |
| 级联选择 | 先父级后子级 | 需要根据当前 schema 识别联动 |
| 品牌/类目选择 | 通常写数组 | 后续必须接维表校验 |
| 自定义字段绑定 | 第一阶段不直接写入 | customFields 是批量编辑工具，不作为 AI Plan 的直接写入目标 |

适配函数示例：

```js
export function applyFieldValue({ node, field, key, value }) {
  if (!field) return { ok: false, reason: 'field_not_found' }

  if (isDateSwitchField(field)) {
    return applyDateSwitchValue({ node, key, value })
  }

  if (isNumberSwitchField(field)) {
    return applyNumberSwitchValue({ node, key, value })
  }

  node.formData[key] = cloneValue(value)
  return { ok: true }
}
```

这张适配表还有第二个作用：生成给模型看的 schema context。后续 LLM 不应凭空猜字段格式，而应从字段适配表得到每个字段的 `valueShape`。

## 9. 方案校验器

校验器是工业级 Agent 的安全核心。任何 AI 方案都必须先过校验，再展示为可应用方案。

### 9.1 校验内容

必须校验：

1. packageType 是否存在。
2. 每个参数 key 是否属于该 packageType 的 schema。
3. 参数值是否符合字段类型。
4. 多选字段是否传数组。
5. 日期字段是否符合系统支持格式。
6. 数值范围是否合理。
7. 品牌、类目、行为等值是否存在于维表或可搜索结果中。
8. 字段在当前联动状态下是否可见。
9. 第一个节点 operator 是否为 null。
10. 第二个及之后节点 operator 是否为 n/u/d。
11. 必填槽位是否缺失。
12. 工作台是否能表达该方案。

### 9.2 校验结果结构

```json
{
  "ok": false,
  "errors": [
    {
      "path": "nodes[1].params.stdBrand",
      "message": "品牌「品牌X」不存在，请重新选择。"
    }
  ],
  "warnings": [
    {
      "path": "nodes[0].params.date",
      "message": "未指定统计时间，已使用默认近90天。"
    }
  ],
  "missingSlots": [
    {
      "key": "brand",
      "label": "品牌",
      "required": true
    }
  ]
}
```

校验失败时不能应用工作台。Agent 应该追问用户或展示错误。

## 10. 用户学习机制

用户学习分为显式学习、隐式学习、纠错学习。

### 10.1 显式学习

用户主动点击：

```text
AI 学习当前人群
```

系统读取当前工作台状态，调用解释器生成说明：

```text
我理解当前配置是：
1. 节点1：近90天购买过品牌A面霜的人。
2. 节点2：近365天购买过品牌A的人。
3. 整体关系：节点1 差集 节点2。
这看起来是在定义「品类新客」。
```

用户确认名称、解释、保存范围后，保存到个人方案库。

### 10.2 隐式学习

如果用户曾经输入过自然语言，但没有采纳 AI 方案，而是自己配置完成并复制/保存，系统可以轻提示：

```text
你刚才想圈「品类新客」，现在的工作台配置是否就是你的定义？
```

注意不要每次复制都强弹。推荐触发条件：

- 本轮存在未采纳的 AI 自然语言意图。
- 当前工作台节点数大于等于 2。
- 用户点击复制或保存。
- 当前配置和最近意图存在语义相关性。

### 10.3 纠错学习

纠错学习是让 Agent 变聪明的关键。

记录：

```text
AI 推荐了什么
用户应用了什么
用户后来改了什么
用户最终复制/保存了什么
```

如果用户连续多次把某个默认时间从近90天改成近180天，系统可以提示：

```text
你最近 3 次使用「品类新客」时都把统计时间改成近180天，要不要更新你的个人定义？
```

### 10.4 delta 反馈记录

纠错学习不能只记录“用户采纳/拒绝”，还必须记录 AI 推荐方案和用户最终配置之间的 delta。

最小记录链路：

```text
AI 推荐 WorkbenchPlan
-> 用户应用
-> 用户手动修改节点、参数或关系
-> 用户复制/保存
-> 系统记录最终工作台状态
-> 系统计算 predictedPlan 与 finalWorkbenchState 的 diff
-> diff 关联到本次 traceId、userId 和 schemeId
```

delta 示例：

```json
{
  "eventType": "modified_after_apply",
  "fieldKey": "date",
  "before": {
    "mode": "recent",
    "days": 365
  },
  "after": {
    "mode": "recent",
    "days": 180
  }
}
```

第一版不要求自动根据 delta 更新用户方案，但必须把 delta 存下来。后续可以用它判断：

- 用户是否总是修改某个默认时间。
- 用户是否总是新增某类节点。
- 某个候选方案是否经常被大幅修改。
- 是否应该提示用户更新个人定义。

### 10.5 规则版节点关系解释器

AI 学习当前人群时，不应完全依赖 LLM 来理解节点。第一版应先实现规则版解释器：

```text
节点解释 = packageType + formData/modeData 展示值
关系解释 = operator 映射
整体解释 = 节点解释 + 关系解释拼接
```

operator 映射：

| operator | 解释 |
| --- | --- |
| n | 与上一组取交集 |
| u | 与上一组取并集 |
| d | 从当前结果中排除这一组 |

示例：

```text
节点1：近90天购买过品牌A面霜的人
节点2：近365天购买过品牌A的人
关系：从节点1中排除节点2
整体：近90天购买过品牌A面霜的人，但排除近365天购买过品牌A的人。
```

LLM 可以在规则解释基础上做润色、命名建议和业务用途总结，但不应作为唯一解释来源。

## 11. 用户方案库设计

### 11.1 LearnedScheme 结构

```json
{
  "id": "scheme_001",
  "userId": "user_123",
  "scope": "personal",
  "name": "品类新客",
  "aliases": ["类目新客", "品类拉新"],
  "description": "统计期内买过指定品牌指定品类，但排除对比期内买过该品牌的人。",
  "template": {
    "type": "WorkbenchPlanTemplate",
    "nodes": []
  },
  "slots": [
    {
      "key": "brand",
      "label": "品牌",
      "required": true,
      "defaultStrategy": "ask"
    },
    {
      "key": "category",
      "label": "类目",
      "required": true,
      "defaultStrategy": "ask"
    },
    {
      "key": "statDateRange",
      "label": "统计时间",
      "required": false,
      "defaultValue": {
        "mode": "recent",
        "days": 90
      }
    },
    {
      "key": "compareDateRange",
      "label": "对比时间",
      "required": false,
      "defaultValue": {
        "mode": "recent",
        "days": 365
      }
    }
  ],
  "examples": [
    "帮我圈品类新客",
    "圈面霜类目的新客",
    "找最近买过该品类但没买过我品牌的人"
  ],
  "embeddingText": "品类新客 类目新客 品类拉新 统计期购买指定品牌指定品类 排除历史品牌购买",
  "usageCount": 12,
  "successCount": 9,
  "modifiedAfterApplyCount": 3,
  "confidence": 0.92,
  "version": 1,
  "status": "active",
  "createdFrom": "manual_workbench_learning",
  "createdAt": "2026-05-28T10:00:00Z",
  "updatedAt": "2026-05-28T10:00:00Z"
}
```

### 11.2 检索优先级

```text
用户个人方案库
-> 团队共享方案库
-> 系统内置方案库
-> LLM 临时推理方案
```

### 11.3 版本机制

不建议直接覆盖用户旧定义。推荐：

- 小修改：更新当前版本。
- 结构变化：生成新版本。
- 用户可以回滚到旧版本。
- 默认使用最近 active 版本。

## 12. Agent 设计

### 12.1 Agent 名称

推荐名称：

```text
AudienceWorkbenchAgent
```

### 12.2 Agent 职责

Agent 负责：

- 理解自然语言。
- 检索用户方案记忆。
- 生成候选方案。
- 解释匹配理由。
- 发现缺失参数并追问。
- 生成 WorkbenchPlan。
- 调用校验工具。
- 分析当前工作台。
- 生成学习建议。
- 保存或更新用户个人方案。

Agent 不负责：

- 直接生成最终 JSON。
- 直接操作页面 DOM。
- 绕过用户确认执行。
- 绕过系统校验执行。

### 12.3 Agent 工具

```text
get_workbench_schema()
获取当前系统支持的组件、字段、字段类型、可选值、联动规则。

search_user_schemes(userId, query)
检索用户个人学习方案。

search_global_schemes(query)
检索系统默认方案。

draft_workbench_plan(input, matchedSchemes, schema)
生成候选 WorkbenchPlan。

validate_workbench_plan(plan, schema)
校验方案是否可执行。

explain_workbench_state(nodes)
解释当前工作台配置。

save_user_scheme(userId, scheme)
保存用户个人定义。

update_user_scheme(userId, schemeId, patch)
更新用户个人定义。

record_feedback(event)
记录采纳、拒绝、修改、复制、保存等行为。
```

### 12.4 Agent 决策策略

如果命中用户个人方案：

```text
优先使用个人方案，并说明匹配理由。
```

如果缺少必填参数：

```text
必须追问，不要乱填。
```

如果缺少可默认参数：

```text
使用默认值，但在方案卡片中提示。
```

如果有多个候选方案：

```text
展示 2-3 个方案，并高亮差异。
```

如果校验失败：

```text
不允许应用工作台，改为追问或建议修正。
```

### 12.5 Agent 系统提示词

下面是 AudienceWorkbenchAgent 的系统提示词建议。实际接入时可以根据模型接口格式拆成 system、developer、tool instruction。

```text
你是 AudienceWorkbenchAgent，一个用于 CDP 圈人工作台的工业级 Agent。

你的目标：
1. 理解用户自然语言中的圈人目标。
2. 优先检索并使用当前用户的个人业务定义。
3. 生成可解释、可校验、可执行的 WorkbenchPlan。
4. 在用户手动配置后，解释当前工作台，并帮助用户沉淀个人方案。

你的边界：
1. 你不能生成最终圈人 JSON。
2. 你不能直接操作页面 DOM。
3. 你不能绕过系统校验。
4. 你不能绕过用户确认直接应用方案。
5. 你不能把一个用户的个人定义用于另一个用户。

生成方案时：
1. 先判断是否命中用户个人方案。
2. 如果命中，使用该方案模板，并补齐本次槽位。
3. 如果没有命中，再检索团队方案和系统方案。
4. 如果仍没有命中，才根据工作台 schema 生成临时方案。
5. 如果缺少必填槽位，必须追问用户。
6. 如果使用默认值，必须在 warnings 中说明。
7. 输出必须是 WorkbenchPlan 或追问问题，不要输出最终 JSON。

解释工作台时：
1. 逐个解释节点业务含义。
2. 解释节点之间的交集、并集、差集关系。
3. 总结整体人群用途。
4. 给出 1 到 3 个建议名称。
5. 不要直接保存学习结果，必须等待用户确认。

学习用户定义时：
1. 保存用户确认后的名称、解释、槽位、默认值、WorkbenchPlan 模板。
2. 记录来源工作台状态和关联自然语言。
3. 如果是对已有定义的修改，建议创建新版本或更新默认槽位。
```

### 12.6 工具调用时序

自然语言自动圈人时，Agent 应按以下顺序调用工具：

```text
1. get_workbench_schema()
2. search_user_schemes(userId, userMessage)
3. 如果用户个人方案不足，再调用 search_global_schemes(userMessage)
4. draft_workbench_plan(userMessage, matchedSchemes, schema)
5. validate_workbench_plan(plan, schema)
6. 如果校验通过，返回方案卡片
7. 如果缺少必填槽位，返回追问
8. 如果校验失败，返回可理解的修正建议
```

用户学习当前工作台时，Agent 应按以下顺序调用工具：

```text
1. get_workbench_schema()
2. explain_workbench_state(currentNodes)
3. 返回节点解释、关系解释、整体用途、建议名称
4. 用户确认名称和解释
5. save_user_scheme(userId, scheme)
6. record_feedback(learn_event)
```

用户应用方案并修改后，反馈系统应按以下顺序处理：

```text
1. record_feedback(preview_event)
2. record_feedback(apply_event)
3. 监听工作台参数和结构变化
4. 用户复制或保存时记录 final_workbench_state
5. 计算 predicted_plan 和 final_workbench_state 的 diff
6. record_feedback(modification_diff_event)
7. 必要时提示用户是否更新个人定义
```

### 12.7 Agent 输出格式

Agent 返回给前端的顶层结构建议统一为 AiAgentResponse。

```json
{
  "traceId": "ai_trace_001",
  "replyType": "plans",
  "message": "我找到了你之前保存的「品类新客」定义，并生成了一个可应用方案。",
  "plans": [],
  "questions": [],
  "learningSuggestion": null,
  "errors": [],
  "warnings": []
}
```

replyType 取值：

| replyType | 含义 |
| --- | --- |
| plans | 返回候选方案 |
| questions | 需要用户补充信息 |
| learning_suggestion | 返回学习建议 |
| error | 无法生成方案或校验失败 |

追问示例：

```json
{
  "traceId": "ai_trace_002",
  "replyType": "questions",
  "message": "我可以帮你圈品类新客，但还缺少品牌和类目。",
  "questions": [
    {
      "slotKey": "brand",
      "label": "品牌",
      "required": true,
      "question": "你要圈哪个品牌？"
    },
    {
      "slotKey": "category",
      "label": "类目",
      "required": true,
      "question": "你要圈哪个品类？"
    }
  ],
  "plans": [],
  "errors": [],
  "warnings": []
}
```

### 12.8 执行保护规则

为了避免 AI 方案污染工作台，必须实现以下保护：

1. 方案未通过校验，不显示“应用到工作台”按钮。
2. 当前工作台非空时，应用方案必须二次确认。
3. 应用方案前保存当前工作台快照，用于失败回滚。
4. 应用过程中任一步失败，恢复到应用前状态。
5. 应用成功后记录 traceId、planId、schemeId 和工作台状态。
6. 用户手动修改后，不自动回写个人方案，必须由用户确认。
7. AI 学习结果必须可查看、可编辑、可删除。
8. 所有用户级方案查询必须带 userId，不允许跨用户读取。
9. 团队共享方案必须有独立权限控制。
10. 生产环境必须提供 AI 功能总开关和灰度开关。

## 13. 前端交互设计

### 13.1 AI 入口

入口位置：

- 主页主按钮：AI 圈人。
- 工作台顶部按钮：AI 助手。
- 工作台右侧结果区：AI 学习当前人群。

### 13.2 自然语言圈人流程

```text
点击 AI 圈人
-> 输入自然语言
-> Agent 返回候选方案
-> 展示方案卡片
-> 用户选择一个方案
-> 展示不可编辑的圈人概览预览
-> 用户在概览中确认应用
-> 如当前工作台非空，再确认替换
-> 应用 WorkbenchPlan
-> 用户继续手动调整
```

### 13.3 方案卡片展示

方案卡片应展示：

- 方案名称。
- 匹配来源。
- 匹配理由。
- 节点数量。
- 交并差关系。
- 核心参数。
- 缺失参数。
- 默认值提示。
- 风险提示。
- 与其他方案的差异。

示例：

```text
方案：品类新客
来源：命中你之前保存的个人定义
逻辑：节点1 - 节点2 - 节点3
节点1：近90天购买品牌A面霜的人
节点2：近365天购买品牌A的人
节点3：大盘对应品牌人群
提示：对比时间未指定，默认近365天
按钮：应用到工作台 / 查看详情 / 换一种
```

### 13.4 应用前圈人概览

方案卡片不应直接调用工作台应用器，而应先打开概览预览组件。

推荐组件：

```text
AiPlanOverviewPreview.vue
```

概览内容：

- 方案名称。
- 人群包名称建议。
- 匹配来源和匹配理由。
- 节点列表。
- 每个节点的业务描述。
- 每个节点关键参数摘要。
- 节点之间的交并差关系。
- warnings 和 missingSlots。

第一版可以用线性结构表达关系：

```text
节点1：近90天购买品牌A面霜的人
  差集
节点2：近365天购买品牌A的人
```

按钮：

- 确认应用到工作台。
- 返回换方案。
- 取消。

只有点击“确认应用到工作台”后，才调用 `applyAiWorkbenchPlan`。

### 13.5 学习弹窗

学习弹窗应展示：

- 当前工作台整体解释。
- 每个节点解释。
- 交并差关系解释。
- 推荐名称。
- 用户可编辑的描述。
- 保存范围。
- 是否关联最近自然语言输入。

按钮：

- 保存为我的定义。
- 修改解释。
- 不关联，仅复制/保存。
- 取消。

## 14. 后端接口设计

### 14.1 AI 方案生成

```http
POST /api/ai/plans/preview
```

请求：

```json
{
  "userId": "user_123",
  "message": "帮我圈近90天面霜品类新客，品牌A",
  "context": {
    "currentWorkbenchState": {},
    "recentIntentId": null
  }
}
```

响应：

```json
{
  "replyType": "plans",
  "plans": [],
  "questions": [],
  "traceId": "ai_trace_001"
}
```

### 14.2 方案校验

```http
POST /api/ai/plans/validate
```

请求：

```json
{
  "plan": {}
}
```

响应：

```json
{
  "ok": true,
  "errors": [],
  "warnings": []
}
```

### 14.3 工作台解释

```http
POST /api/ai/workbench/explain
```

请求：

```json
{
  "userId": "user_123",
  "nodes": [],
  "crowdName": "未命名人群"
}
```

响应：

```json
{
  "summary": "这是一个品类新客定义。",
  "nodeExplanations": [],
  "relationExplanation": "节点1 差集 节点2",
  "suggestedNames": ["品类新客", "面霜品类新客"]
}
```

### 14.4 保存学习方案

```http
POST /api/ai/learning/save
```

请求：

```json
{
  "userId": "user_123",
  "name": "品类新客",
  "description": "统计期内买过指定品牌指定品类，但排除历史买过品牌的人。",
  "planTemplate": {},
  "slots": [],
  "sourceWorkbenchState": {},
  "relatedNaturalLanguage": "帮我圈品类新客"
}
```

响应：

```json
{
  "ok": true,
  "schemeId": "scheme_001"
}
```

### 14.5 用户方案管理

```http
GET /api/ai/schemes
PUT /api/ai/schemes/<scheme_id>
DELETE /api/ai/schemes/<scheme_id>
```

## 15. 数据存储建议

MVP 可以继续使用本地 JSON 文件，但工业级建议使用关系型数据库。

即使 MVP 使用本地 JSON，也必须保留 userId 隔离字段。当前没有正式登录体系时，可以先通过统一函数解析用户：

```python
def resolve_current_user_id(request):
    return request.headers.get("X-User-Id") or "local_user"
```

所有用户学习方案和反馈事件都必须带 userId：

```text
保存方案：只能保存到当前 userId
查询方案：只能查询当前 userId
删除方案：只能删除当前 userId 下的 scheme
反馈事件：必须记录当前 userId
```

后续接入真实账号体系时，只替换 `resolve_current_user_id`，不改业务表结构。

推荐表：

### 15.1 ai_user_schemes

| 字段 | 说明 |
| --- | --- |
| id | 方案 ID |
| user_id | 用户 ID |
| scope | personal/team/system |
| name | 方案名称 |
| aliases | 别名 JSON |
| description | 业务解释 |
| plan_template | WorkbenchPlan 模板 JSON |
| slots | 槽位 JSON |
| examples | 示例说法 JSON |
| embedding_text | 向量文本 |
| usage_count | 使用次数 |
| success_count | 成功次数 |
| modified_count | 应用后修改次数 |
| confidence | 置信度 |
| version | 版本 |
| status | active/archived |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### 15.2 ai_feedback_events

| 字段 | 说明 |
| --- | --- |
| id | 事件 ID |
| user_id | 用户 ID |
| trace_id | 一次 AI 会话 ID |
| event_type | preview/apply/reject/modify/copy/save/learn |
| user_message | 用户原始输入 |
| predicted_plan | AI 推荐方案 |
| applied_plan | 用户应用方案 |
| final_workbench_state | 用户最终状态 |
| diff | AI 方案与最终状态差异 |
| created_at | 创建时间 |

diff 示例：

```json
[
  {
    "type": "param_changed",
    "nodeIndex": 1,
    "fieldKey": "date",
    "before": {
      "mode": "recent",
      "days": 365
    },
    "after": {
      "mode": "recent",
      "days": 180
    }
  }
]
```

### 15.3 ai_scheme_versions

| 字段 | 说明 |
| --- | --- |
| id | 版本 ID |
| scheme_id | 方案 ID |
| version | 版本号 |
| snapshot | 方案快照 |
| change_reason | 修改原因 |
| created_at | 创建时间 |

## 16. 批量圈人扩展

第一版可以先不做真正批量执行，但架构要预留。

用户输入：

```text
帮我分别圈面霜、精华、洁面三个品类的新客。
```

Agent 输出：

```text
Plan 1：面霜品类新客
Plan 2：精华品类新客
Plan 3：洁面品类新客
```

MVP 处理：

- 先展示多个方案。
- 用户逐个应用。

第二阶段：

- 接入批量矩阵模式。
- 每个 Plan 对应一行或一个批量任务。
- 支持批量校验和批量生成。

## 17. 评测体系

工业级 Agent 必须有评测，不然无法判断它是否真的变聪明。

### 17.1 标准测试集

准备 30 到 100 条典型用例：

```json
{
  "input": "帮我圈品类新客，品牌A，面霜，近90天",
  "expected": {
    "schemeName": "品类新客",
    "nodeCount": 3,
    "operators": [null, "d", "d"],
    "requiredParams": ["品牌A", "面霜", "近90天"]
  }
}
```

### 17.2 指标

| 指标 | 含义 |
| --- | --- |
| 意图命中率 | 是否匹配正确方案 |
| 参数抽取准确率 | 品牌、类目、时间是否正确 |
| 计划校验通过率 | 生成 Plan 是否可执行 |
| 用户采纳率 | 用户是否应用方案 |
| 应用后修改率 | 用户应用后改动多少 |
| 学习确认率 | 用户是否愿意保存定义 |
| 重复命中成功率 | 下次是否正确使用个人定义 |

## 18. 分阶段实施计划

### 阶段 1：WorkbenchPlan 基础能力

目标：不接大模型，也能让结构化方案应用到工作台。

任务：

1. 定义 WorkbenchPlan schema。
2. 实现 plan 校验器。
3. 梳理字段类型适配表，明确不同字段如何写入 formData/modeData。
4. 实现前端 `useAiWorkbenchPlan`，通过 composable 应用 WorkbenchPlan。
5. 手写 2 到 3 个内置方案。
6. 增加应用前圈人概览预览。
7. 用户确认概览后可自动配置工作台。

验收：

- 能自动添加多个节点。
- 能填入参数。
- 能设置交并差。
- 应用前能展示不可编辑概览。
- 工作台能正常生成最终 JSON。

### 阶段 2：自然语言生成候选方案

目标：接入 LLM，实现用户输入自然语言后生成候选方案。

任务：

1. 新增 AI 对话框。
2. 后端新增 /api/ai/plans/preview。
3. 接入 LLM 结构化输出。
4. 接入用户方案检索。
5. 展示候选方案卡片。
6. 点击方案后先展示圈人概览。
7. 应用前必须校验。

验收：

- 用户输入“品类新客”能生成候选方案。
- 缺少品牌/类目时能追问。
- 多方案能展示差异。
- 用户能先看概览再应用工作台。

### 阶段 3：用户学习

目标：让用户自己的配置沉淀为个人方案。

任务：

1. 新增 AI 学习当前人群入口。
2. 实现规则版 workbench explain，先解释节点、关系和整体定义。
3. 实现学习弹窗。
4. 实现 save_user_scheme。
5. 实现 userId 隔离策略。
6. 下次输入命中个人方案。

验收：

- 用户能保存“品类新客”定义。
- 再次输入“品类新客”能优先命中个人定义。
- 用户可以查看、编辑、删除学习结果。
- 不同 userId 的学习结果互不影响。

### 阶段 4：反馈闭环

目标：让 Agent 根据用户修改不断优化。

任务：

1. 记录 AI 推荐方案。
2. 记录用户应用方案。
3. 记录用户最终工作台状态。
4. 计算 diff。
5. 将 diff 作为 delta 反馈关联到 userId、traceId、schemeId。
6. 多次同类修改后提示更新定义。

验收：

- 能看到用户改了哪些参数。
- 能记录 AI 推荐和用户最终配置之间的 delta。
- 能基于多次修改建议更新个人定义。

### 阶段 5：工业化增强

目标：支持生产环境长期稳定运行。

任务：

1. 数据库存储。
2. 用户权限隔离。
3. 团队共享方案。
4. 方案版本管理。
5. 评测集和回放系统。
6. 灰度开关。
7. 审计日志。
8. 批量圈人。

验收：

- 不同用户学习互不影响。
- 可以回放一次 AI 推荐到用户最终复制的全过程。
- 可以灰度开启或关闭 AI 能力。

## 19. MVP 范围建议

第一版只做五件事：

1. AI 按钮和对话框。
2. 自然语言生成候选方案卡片。
3. 用户确认后自动配置工作台。
4. AI 学习当前工作台配置。
5. 用户个人方案库优先匹配。

第一版不要做：

- 无确认自动执行。
- 复杂批量任务。
- 团队共享学习。
- 模型微调。
- AI 直接操作外部数据银行页面。
- AI 直接生成最终 JSON。

## 20. 你需要准备什么

业务侧需要准备：

1. 第一批高频业务词，例如品类新客、品牌新客、老客、流失、高潜、复购、竞品人群。
2. 每个业务词的标准定义。
3. 每个业务词对应的工作台配置样例。
4. 每个业务词的 3 到 5 种自然语言说法。
5. 哪些参数必填，哪些可以默认。
6. 默认品牌、默认时间窗口、默认渠道等规则。
7. 用户学习是否只个人可见，还是未来支持团队共享。
8. 30 到 100 条测试用例。
9. 学习弹窗的触发策略。
10. 方案命名和版本管理规则。

工程侧需要准备：

1. 当前工作台 schema 抽象。
2. 字段类型映射规则。
3. 参数合法值查询能力。
4. plan 校验器。
5. plan 应用器。
6. 用户方案存储。
7. AI 调用服务。
8. 日志和回放机制。

## 21. 最终形态

最终系统不是聊天机器人，而是：

```text
一个带记忆、带工具、带校验、带解释、带用户反馈闭环的圈人工业级 Agent。
```

它的工作方式是：

```text
用户说出业务目标
-> Agent 理解意图
-> Agent 检索个人业务词典
-> Agent 生成可解释的 WorkbenchPlan
-> 系统校验计划
-> 用户确认
-> 系统配置工作台中间栏
-> 用户继续调整
-> 系统生成最终 JSON
-> Agent 学习用户最终定义和修改偏好
```

它的长期价值是：

- 第一次帮用户完成复杂圈人。
- 第二次记住用户自己的业务定义。
- 第三次开始主动补齐用户习惯参数。
- 多次使用后能识别用户偏好、减少追问、减少修改。
- 最终沉淀出每个用户自己的圈人方法论资产。
