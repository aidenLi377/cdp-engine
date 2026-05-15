# CDP 圈人配置工具使用说明

## 1. 这是什么

这是一个用于生成 CDP 圈人 JSON 的前后端工具，适合把“业务参数选择”转换成可直接用于数据银行/圈人平台的底层配置。

项目提供两种使用方式：

- 可视化点选模式：适合单个人群包配置、调试、预览和复制 JSON。
- 批量矩阵模式：适合按模板批量上传 CSV，自动生成多个人群包，并按交集/并集/差集进行组合。

---

## 2. 项目整体运作流程

系统的整体流程可以概括为下面 6 步：

1. 启动后端服务。后端会先校验根目录下的参数表、逻辑表、维表、模板文件是否齐全、字段是否正确。
2. 后端加载配置数据到内存。主要包括参数表、逻辑表、维表和批量模板。
3. 启动前端页面。前端通过 `/api/packages` 获取所有可用圈人包类型。
4. 用户在前端选择包类型并填写参数。前端调用 `/api/meta/<包名>` 获取字段定义和显示逻辑。
5. 前端把用户输入提交给后端生成 JSON。后端按参数表中的 `JSON_Path` 和 `Backend_Template` 生成目标结构。
6. 用户复制结果或批量导出结果。单包模式实时预览，批量模式按行生成并组合。

---

## 3. 项目结构说明

### 根目录

- [app.py](/E:/CDP_Project_codex/app.py): Flask 启动入口
- [test_api.py](/E:/CDP_Project_codex/test_api.py): 后端接口与配置校验自测脚本
- [requirements.txt](/E:/CDP_Project_codex/requirements.txt): Python 依赖
- `1.参数表.csv`：全项目最核心的配置表
- `*.逻辑表.csv`：每个圈人包对应的显示逻辑
- `*维表.csv`：选项值与 ID 映射表
- `批量圈人模板/`：批量上传模板目录

### 后端

- [cdp_backend/app_factory.py](/E:/CDP_Project_codex/cdp_backend/app_factory.py): Flask 应用工厂、路由注册、日志、CORS
- [cdp_backend/engine.py](/E:/CDP_Project_codex/cdp_backend/engine.py): 核心引擎，负责加载配置、翻译参数、生成 JSON、批量生成
- [cdp_backend/validator.py](/E:/CDP_Project_codex/cdp_backend/validator.py): 启动前配置校验
- [cdp_backend/csv_utils.py](/E:/CDP_Project_codex/cdp_backend/csv_utils.py): CSV 读取、编码兼容、逻辑表扫描等工具函数
- [cdp_backend/constants.py](/E:/CDP_Project_codex/cdp_backend/constants.py): 文件名和字段常量

### 前端

- [cdp-web/src/App.vue](/E:/CDP_Project_codex/cdp-web/src/App.vue): 应用入口，负责模式切换和健康检查
- [cdp-web/src/components/NormalMode.vue](/E:/CDP_Project_codex/cdp-web/src/components/NormalMode.vue): 可视化点选模式
- [cdp-web/src/components/BatchMode.vue](/E:/CDP_Project_codex/cdp-web/src/components/BatchMode.vue): 批量矩阵模式
- [cdp-web/src/components/DynamicForm.vue](/E:/CDP_Project_codex/cdp-web/src/components/DynamicForm.vue): 动态表单渲染
- [cdp-web/src/composables/useCdpShared.js](/E:/CDP_Project_codex/cdp-web/src/composables/useCdpShared.js): 前端共享逻辑，包括字段显隐、联动、数量限制、日期限制等
- [cdp-web/vite.config.ts](/E:/CDP_Project_codex/cdp-web/vite.config.ts): 前端开发代理，`/api` 会转发到 `127.0.0.1:5000`

---

## 4. 如何启动

### 4.0 一键启动

项目根目录已提供两个启动脚本：

- `start-dev.ps1`：PowerShell 一键启动脚本
- `start-dev.cmd`：可直接双击运行的包装脚本

推荐方式：

```powershell
.\start-dev.cmd
```

脚本会自动：

- 优先使用项目内的 `.venv\Scripts\python.exe`
- 检查 `5000` 和 `5173` 端口是否已被占用
- 分别启动后端和前端窗口
- 将输出写入根目录的 `backend.stdout.log` 和 `frontend.stdout.log`

如果启动窗口立即关闭，请先查看这两个日志文件。

### 4.1 后端启动

在项目根目录执行：

```powershell
pip install -r requirements.txt
python app.py
```

默认启动地址：

- 后端接口：`http://127.0.0.1:5000`

可用健康检查：

- `GET http://127.0.0.1:5000/api/health`

### 4.2 前端启动

进入前端目录执行：

```powershell
cd cdp-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

默认访问地址：

- 前端页面：`http://127.0.0.1:5173`

前端会自动把 `/api` 请求代理到后端。

---

## 5. 使用者操作说明

### 5.1 可视化点选模式

适合单个圈人包的配置和试算。

操作步骤：

1. 打开前端页面。
2. 左侧选择一个圈人包类型。
3. 中间按业务需要填写参数。
4. 如需多个条件组合，可继续添加多个节点，并选择节点之间的关系：
   - `n`：交集
   - `u`：并集
   - `d`：差集
5. 右侧会实时生成人群包名称、参数摘要和最终 JSON。
6. 点击“复制”即可把 JSON 复制到剪贴板。
7. 点击“去圈人”可跳转到数据银行页面继续使用。

这个模式下支持节点复制、拖拽排序、收起展开、撤销重做；字段也会根据渠道、行为、包类型自动联动显示。

### 5.2 批量矩阵模式

适合一次生成多个人群包，或者按多个模板流水线做组合。

操作步骤：

1. 切换到“批量矩阵模式”。
2. 点击“获取标准模板”，下载对应 CSV 模板。
3. 按模板填写数据，每一行代表一个待生成的人群包。
4. 将 CSV 上传到某个模板卡片。
5. 系统会逐行调用后端生成结果。
6. 如果有多个模板卡片，可在卡片之间选择交集、并集或差集。
7. 右侧最终卡片会生成按行合并后的最终结果。
8. 点击任意结果项，可自动复制 JSON，并打开详情抽屉查看。

---

## 6. 关键配置文件说明

### 6.1 参数表 `1.参数表.csv`

这是整套系统的核心。每一行定义一个表单字段或一个后端写入规则，重点字段包括：

- `Crowd_Package`：该字段属于哪些圈人包
- `Param_Key`：前后端统一使用的参数键名
- `Label`：界面展示名称
- `Widget_Type`：控件类型
- `Data_Source`：选项来源于哪个维表
- `JSON_Path`：该字段最终写入 JSON 的路径
- `Backend_Template`：复杂字段的模板规则
- `Base_Template`：该包的基础 JSON 模板
- `Is_Default`：默认显示字段

### 6.2 逻辑表 `*.逻辑表.csv`

逻辑表用于控制“什么情况下展示什么字段”，例如某些字段只有在选择特定渠道、行为、状态后才会显示。

### 6.3 维表 `*维表.csv`

维表主要解决“展示值”和“实际值”不一致的问题。页面展示中文，后端可翻译成对应 ID、编码或复合值。

---

## 7. 系统内部是怎么生成 JSON 的

后端生成 JSON 的核心逻辑在 [cdp_backend/engine.py](/E:/CDP_Project_codex/cdp_backend/engine.py)。

生成过程如下：

1. 根据 `_package` 找到当前圈人包对应的参数配置。
2. 遍历前端提交的每个字段。
3. 根据参数表判断是否写入 JSON、写到哪个 `JSON_Path`、是否使用 `Backend_Template`。
4. 如果字段值来自维表，就把展示值翻译成系统 ID。
5. 如果字段是数值区间、日期区间等复杂结构，就按模板渲染。
6. 把结果合并到 `selectionLv3` 等目标路径。
7. 再与该包的 `Base_Template` 合并，输出最终结构。

简化理解：

- 参数表决定“写到哪里”
- 维表决定“值写成什么”
- 逻辑表决定“字段是否显示”
- 基础模板决定“最终 JSON 长什么样”

---

## 8. 当前可用接口

- `GET /api/health`：查看服务状态、环境、已加载包数量、缓存情况
- `GET /api/packages`：获取所有圈人包名称
- `GET /api/meta/<package_name>`：获取指定包的表单 schema 和逻辑矩阵
- `GET /api/package_meta?name=<package_name>`：上面接口的别名
- `POST /api/generate`：根据前端参数直接生成 JSON
- `POST /api/generate_json`：兼容旧调用方式，传 `pkgName + params`
- `GET /api/list_templates`：获取批量模板文件列表
- `GET /api/download_template/<filename>`：下载单个模板文件
- `POST /api/batch_generate`：上传 CSV 后按行批量生成人群包 JSON

---

## 9. 常见问题

### 9.1 页面提示后端离线

检查是否已经执行 `python app.py`，后端是否监听在 `127.0.0.1:5000`，以及前端是否通过 Vite 启动。

### 9.2 上传模板后没有结果

检查 CSV 表头是否与标准模板一致，上传文件名是否包含正确包名，内容是否使用了模板不支持的字段值。

### 9.3 某个字段不显示

字段显隐受逻辑表控制，很多字段只有在满足指定渠道、行为、状态后才会出现。

### 9.4 修改了 CSV 但页面没变化

后端会在启动时把配置加载进内存，所以修改参数表、逻辑表、维表后，通常需要重启后端服务。

---

## 10. 本次检查结论

当前项目是一个典型的配置驱动型工具，代码本身并不硬编码大部分业务规则，核心依赖都在 CSV 配置里：

- 新增或修改圈人包，主要是调整参数表、逻辑表、维表
- 前端负责动态展示和联动
- 后端负责翻译、模板渲染和结构输出
- 批量模式本质上是在单包生成能力上再封装一层流水线组合

我已本地执行 [test_api.py](/E:/CDP_Project_codex/test_api.py)，当前 10 项测试全部通过。
