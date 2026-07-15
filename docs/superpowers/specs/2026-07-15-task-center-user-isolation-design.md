# 任务中心用户隔离设计

## 目标

任务中心的任务默认属于创建者。已登录用户只能列出、查看、更新和删除自己的任务；现有 JSON 历史任务迁移后统一归属 `admin`。

## 范围

- SQLite `tasks` 表增加内部字段 `owner_id`。
- TaskStore 的创建、列表、读取、进度更新和删除操作都强制接收用户 ID。
- Flask 任务路由从 `g.current_user["id"]` 取得用户 ID并传给 TaskStore。
- JSON 到 SQLite 的迁移脚本支持指定历史任务所有者，并将当前历史任务归属 `admin`。
- 增加跨用户 API 隔离测试和存储层回归测试。
- 前端接口路径、请求体和响应体保持兼容，不修改任务中心 UI。

## 数据模型与迁移

新建数据库的 `tasks.owner_id` 使用 `TEXT NOT NULL`。已有数据库通过幂等列迁移增加 `owner_id TEXT`，避免 SQLite 重建表带来的数据风险；应用查询始终要求 `owner_id` 精确匹配，因此未归属的旧记录不会暴露给任何用户。

新增 `idx_tasks_owner_created` 索引，支持按所有者和创建时间倒序读取。

`migrate_json_to_sqlite.py` 增加 `--task-owner` 参数，默认值为 `admin`。迁移任务前先按用户名查找启用或禁用状态下存在的用户；找不到时终止迁移并给出明确错误，避免产生无主任务。脚本会把数据库中已有的 `owner_id IS NULL` 任务和从 JSON 新插入的任务都归属给该用户。重复执行保持幂等。

## 存储层接口

TaskStore 接口调整为：

- `list_tasks(user_id)`：只返回 `owner_id = user_id` 的任务。
- `get_task(task_id, user_id)`：只返回该用户拥有的任务。
- `create_task(payload, user_id)`：忽略客户端可能伪造的所有者字段，使用参数中的用户 ID。
- `update_progress(task_id, payload, user_id)`：只更新该用户拥有的任务，否则抛出 `TaskNotFoundError`。
- `delete_task(task_id, user_id)`：只删除该用户拥有的任务，不存在或无权时返回 `False`。

`owner_id` 仅用于服务端过滤，不写入 API 响应，以保持现有前端数据结构不变。

## API 行为

任务路由继续由全局登录门禁保护，并将 `g.current_user["id"]` 传入 TaskStore。

访问其他用户的任务时，查看、更新和删除都返回现有的 `TASK_NOT_FOUND`/404，而不是 403。这避免通过任务 ID判断其他用户的任务是否存在。列表永远只包含当前用户自己的任务。

## 测试策略

遵循测试驱动开发：先新增会失败的双用户隔离测试，再实现最小改动。

测试覆盖：

- Alice 和 Bob 创建的任务只出现在各自列表中。
- Bob 查看 Alice 的任务得到 404。
- Bob 更新 Alice 的任务得到 404，任务内容保持不变。
- Bob 删除 Alice 的任务得到 404，Alice 仍能读取任务。
- 客户端提交伪造 `ownerId` 或 `owner_id` 时不能改变任务归属。
- 历史 JSON 任务及数据库中无主任务迁移后归属 `admin`。
- 重复运行迁移不会重复插入或改变已正确归属的任务。

最后运行全部后端、前端和浏览器扩展测试，并执行前端生产构建。

## 验收标准

- 任意已登录用户无法通过任务 API读取或修改其他用户的任务。
- 当前任务中心前端无需改动即可正常创建、刷新、更新和删除自己的任务。
- 现有 1 条历史任务可迁移并由 `admin` 查看。
- 所有自动化测试和生产构建通过。
